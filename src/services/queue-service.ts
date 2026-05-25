import { Ticket, TicketResult } from '../models/ticket';
import { Priority, TicketStatus, HistoryActionType } from '../models/enums';
import { QueueFilters, QueueStats, TicketListResult } from '../models/queue';
import { IQueueService } from './interfaces/queue-service.interface';
import { createHistoryEntry } from '../utils/history';

/**
 * Priority numeric values for sorting.
 * Lower number = higher priority (CRITICAL is most urgent).
 */
const PRIORITY_ORDER: Record<Priority, number> = {
  [Priority.CRITICAL]: 0,
  [Priority.HIGH]: 1,
  [Priority.MEDIUM]: 2,
  [Priority.LOW]: 3,
};

/**
 * Sorts tickets by the specified field and direction.
 *
 * Default behavior:
 * - If no sortBy specified: sort by priority DESC then createdAt ASC
 * - If sortBy='priority': default direction is DESC (CRITICAL first)
 * - If sortBy='createdAt': default direction is ASC (oldest first)
 * - If sortBy='dueDate': default direction is ASC (soonest first)
 * - If explicit sortOrder is provided, use that direction regardless of field
 */
export function sortTickets(
  tickets: Ticket[],
  sortBy?: string,
  sortOrder?: string
): Ticket[] {
  const sorted = [...tickets];

  if (!sortBy) {
    // Default: sort by priority DESC then createdAt ASC
    sorted.sort((a, b) => {
      const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (priorityDiff !== 0) {
        return priorityDiff; // Lower number = higher priority = comes first (DESC)
      }
      return a.createdAt.getTime() - b.createdAt.getTime(); // ASC
    });
    return sorted;
  }

  // Determine effective sort direction
  const defaultDirections: Record<string, 'asc' | 'desc'> = {
    priority: 'desc',
    createdAt: 'asc',
    dueDate: 'asc',
  };

  const effectiveOrder = sortOrder || defaultDirections[sortBy] || 'asc';
  const multiplier = effectiveOrder === 'desc' ? -1 : 1;

  sorted.sort((a, b) => {
    switch (sortBy) {
      case 'priority': {
        const diff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        // PRIORITY_ORDER: CRITICAL=0, HIGH=1, MEDIUM=2, LOW=3
        // For DESC (default): we want CRITICAL first, so natural ascending order of numeric values
        // For ASC: we want LOW first, so reverse the natural order
        // effectiveOrder='desc' → multiplier=-1 → diff*-1 flips, but we need natural order for desc
        // So we invert: for priority, desc means natural order (lower number first)
        return effectiveOrder === 'desc' ? diff : -diff;
      }
      case 'createdAt': {
        const aTime = a.createdAt.getTime();
        const bTime = b.createdAt.getTime();
        return (aTime - bTime) * multiplier;
      }
      case 'dueDate': {
        // Handle undefined dueDate: tickets without dueDate go to the end
        const aTime = a.dueDate ? a.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.dueDate ? b.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
        return (aTime - bTime) * multiplier;
      }
      default:
        return 0;
    }
  });

  return sorted;
}

export class QueueService implements IQueueService {
  private tickets: Ticket[] = [];

  constructor(tickets?: Ticket[]) {
    if (tickets) {
      this.tickets = tickets;
    }
  }

  setTickets(tickets: Ticket[]): void {
    this.tickets = tickets;
  }

  async getPendingTickets(filters: QueueFilters): Promise<TicketListResult> {
    // Step 1: Exclude RESOLVED and CLOSED tickets
    let result = this.tickets.filter(
      (t) => t.status !== TicketStatus.RESOLVED && t.status !== TicketStatus.CLOSED
    );

    // Step 2: Apply filters (AND logic)
    if (filters.priority) {
      result = result.filter((t) => t.priority === filters.priority);
    }
    if (filters.category) {
      result = result.filter((t) => t.category === filters.category);
    }
    if (filters.assigneeId) {
      result = result.filter((t) => t.assigneeId === filters.assigneeId);
    }
    if (filters.status) {
      result = result.filter((t) => t.status === filters.status);
    }

    // Step 3: Apply sorting
    result = sortTickets(result, filters.sortBy, filters.sortOrder);

    // Step 4: Apply pagination
    const totalCount = result.length;
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;

    if (page < 1 || pageSize < 1 || pageSize > 100) {
      return {
        tickets: [],
        totalCount: 0,
        page,
        pageSize,
        totalPages: 0,
      };
    }

    const totalPages = Math.ceil(totalCount / pageSize);
    const offset = (page - 1) * pageSize;
    const paginatedTickets = result.slice(offset, offset + pageSize);

    return {
      tickets: paginatedTickets,
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  }

  async getQueueStatistics(): Promise<QueueStats> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Filter to tickets created in the last 30 days
    const recentTickets = this.tickets.filter(
      (t) => t.createdAt.getTime() >= thirtyDaysAgo.getTime()
    );

    // Calculate SLA compliance percentage
    const resolvedTickets = recentTickets.filter((t) => t.resolvedAt != null);
    let slaCompliancePercentage: number;

    if (resolvedTickets.length === 0) {
      slaCompliancePercentage = 100;
    } else {
      const compliantTickets = resolvedTickets.filter(
        (t) => t.dueDate != null && t.resolvedAt!.getTime() <= t.dueDate.getTime()
      );
      slaCompliancePercentage = (compliantTickets.length / resolvedTickets.length) * 100;
    }

    // Calculate average time to first IN_PROGRESS status change
    const timesToFirstResponse: number[] = [];

    for (const ticket of recentTickets) {
      const firstInProgress = ticket.history.find(
        (entry) =>
          entry.action === HistoryActionType.STATUS_CHANGED &&
          entry.newValue === TicketStatus.IN_PROGRESS
      );

      if (firstInProgress) {
        const timeDiff = firstInProgress.timestamp.getTime() - ticket.createdAt.getTime();
        timesToFirstResponse.push(timeDiff);
      }
    }

    const averageTimeToFirstResponse =
      timesToFirstResponse.length > 0
        ? timesToFirstResponse.reduce((sum, t) => sum + t, 0) / timesToFirstResponse.length
        : 0;

    return {
      slaCompliancePercentage,
      averageTimeToFirstResponse,
    };
  }

  async escalateTicket(ticketId: string): Promise<TicketResult> {
    // Step 1: Find ticket
    const ticket = this.tickets.find((t) => t.id === ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    // Step 2: Skip RESOLVED or CLOSED
    if (ticket.status === TicketStatus.RESOLVED || ticket.status === TicketStatus.CLOSED) {
      return { success: false, error: 'Cannot escalate resolved or closed tickets' };
    }

    // Step 3: Check escalation conditions
    const now = new Date();
    const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
    const ONE_HOUR_MS = 60 * 60 * 1000;

    const slaBreached = ticket.dueDate != null && now.getTime() > ticket.dueDate.getTime();
    const inactivity48h = now.getTime() - ticket.updatedAt.getTime() > FORTY_EIGHT_HOURS_MS;
    const highCriticalUnassigned =
      (ticket.priority === Priority.HIGH || ticket.priority === Priority.CRITICAL) &&
      !ticket.assigneeId &&
      now.getTime() - ticket.createdAt.getTime() > ONE_HOUR_MS;

    // Step 4: If no condition met, return error
    if (!slaBreached && !inactivity48h && !highCriticalUnassigned) {
      return { success: false, error: 'No escalation condition met' };
    }

    // Step 5: Determine escalation reason
    let escalationReason: string;
    if (slaBreached) {
      escalationReason = 'SLA breach: ticket due date has passed';
    } else if (inactivity48h) {
      escalationReason = 'Inactivity: no activity for more than 48 hours';
    } else {
      escalationReason = 'Unassigned high priority: HIGH/CRITICAL ticket unassigned for more than 1 hour';
    }

    // Step 6 & 7: Increase priority if not already CRITICAL
    const oldPriority = ticket.priority;
    if (ticket.priority !== Priority.CRITICAL) {
      ticket.priority = getNextPriority(ticket.priority);
    }

    // Step 8: Record escalation in history
    const historyEntry = createHistoryEntry({
      ticketId: ticket.id,
      action: HistoryActionType.ESCALATED,
      previousValue: oldPriority,
      newValue: ticket.priority,
      userId: 'SYSTEM',
      reason: escalationReason,
    });
    ticket.history.push(historyEntry);

    // Step 9: Update updatedAt
    ticket.updatedAt = new Date();

    // Step 10: Return success
    return { success: true, ticket };
  }
}

/**
 * Returns the next higher priority level.
 * LOW → MEDIUM, MEDIUM → HIGH, HIGH → CRITICAL, CRITICAL → CRITICAL
 */
export function getNextPriority(current: Priority): Priority {
  switch (current) {
    case Priority.LOW:
      return Priority.MEDIUM;
    case Priority.MEDIUM:
      return Priority.HIGH;
    case Priority.HIGH:
      return Priority.CRITICAL;
    case Priority.CRITICAL:
      return Priority.CRITICAL;
  }
}
