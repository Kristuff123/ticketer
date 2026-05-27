import { Ticket, TicketResult } from "../models/ticket.js";
import { Priority, TicketStatus, HistoryActionType } from "../models/enums.js";
import { QueueFilters, QueueStats, TicketListResult } from "../models/queue.js";
import { IQueueService } from "./interfaces/queue-service.interface.js";
import { createHistoryEntry } from "../utils/history.js";
import {
  TicketRepository,
  TicketFilters,
} from "../database/repositories/ticket-repository.js";
import { TicketHistoryRepository } from "../database/repositories/ticket-history-repository.js";
import {
  deriveQueueCacheKey,
  getCachedQueueResults,
  setCachedQueueResults,
} from "../cache/queue-cache.js";

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
 * - If sortBy='updatedAt': default direction is DESC (most recently updated first)
 * - If sortBy='dueDate': default direction is ASC (soonest first)
 * - If explicit sortOrder is provided, use that direction regardless of field
 */
export function sortTickets(
  tickets: Ticket[],
  sortBy?: string,
  sortOrder?: string,
): Ticket[] {
  const sorted = [...tickets];

  if (!sortBy) {
    // Default: sort by priority DESC then createdAt ASC
    sorted.sort((a, b) => {
      const priorityDiff =
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (priorityDiff !== 0) {
        return priorityDiff; // Lower number = higher priority = comes first (DESC)
      }
      return a.createdAt.getTime() - b.createdAt.getTime(); // ASC
    });
    return sorted;
  }

  // Determine effective sort direction
  const defaultDirections: Record<string, "asc" | "desc"> = {
    priority: "desc",
    createdAt: "asc",
    updatedAt: "desc",
    dueDate: "asc",
  };

  const effectiveOrder = sortOrder || defaultDirections[sortBy] || "asc";
  const multiplier = effectiveOrder === "desc" ? -1 : 1;

  sorted.sort((a, b) => {
    switch (sortBy) {
      case "priority": {
        const diff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        // PRIORITY_ORDER: CRITICAL=0, HIGH=1, MEDIUM=2, LOW=3
        // For DESC (default): we want CRITICAL first, so natural ascending order of numeric values
        // For ASC: we want LOW first, so reverse the natural order
        // effectiveOrder='desc' → multiplier=-1 → diff*-1 flips, but we need natural order for desc
        // So we invert: for priority, desc means natural order (lower number first)
        return effectiveOrder === "desc" ? diff : -diff;
      }
      case "createdAt": {
        const aTime = a.createdAt.getTime();
        const bTime = b.createdAt.getTime();
        return (aTime - bTime) * multiplier;
      }
      case "updatedAt": {
        const aTime = a.updatedAt.getTime();
        const bTime = b.updatedAt.getTime();
        return (aTime - bTime) * multiplier;
      }
      case "dueDate": {
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
  private readonly ticketRepository: TicketRepository;
  private readonly historyRepository: TicketHistoryRepository;

  constructor(
    ticketRepository: TicketRepository,
    historyRepository: TicketHistoryRepository,
  ) {
    this.ticketRepository = ticketRepository;
    this.historyRepository = historyRepository;
  }

  async getPendingTickets(filters: QueueFilters): Promise<TicketListResult> {
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

    // Build repository filters. Always exclude RESOLVED and CLOSED to honor
    // the queue contract (Req 9.3).
    const repoFilters: TicketFilters = {
      excludeStatuses: [TicketStatus.RESOLVED, TicketStatus.CLOSED],
    };
    if (filters.priority) repoFilters.priority = filters.priority;
    if (filters.category) repoFilters.category = filters.category;
    if (filters.assigneeId) repoFilters.assigneeId = filters.assigneeId;
    if (filters.status) repoFilters.status = filters.status;

    // Try cache first (Req 10.1, 10.2). On any Redis error, log and fall
    // through to the PostgreSQL path (Req 10.5).
    // TODO: Date hydration on cache reads (follow-up). Currently dates are
    // returned as ISO strings on cache hits.
    const cacheKey = deriveQueueCacheKey(filters);
    try {
      const cached = await getCachedQueueResults<TicketListResult>(cacheKey);
      if (cached) {
        return cached;
      }
    } catch (err) {
      console.warn(
        "[queue] Cache read failed, falling back to PostgreSQL:",
        err,
      );
    }

    let result: Ticket[];
    try {
      result = await this.ticketRepository.findByFilters(repoFilters);
    } catch (err) {
      console.warn(
        "[queue] Database query failed, returning empty result:",
        err,
      );
      return { tickets: [], totalCount: 0, page, pageSize, totalPages: 1 };
    }

    // Apply in-memory sort and pagination.
    result = sortTickets(result, filters.sortBy, filters.sortOrder);

    const totalCount = result.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const offset = (page - 1) * pageSize;
    const paginatedTickets = result.slice(offset, offset + pageSize);

    const response: TicketListResult = {
      tickets: paginatedTickets,
      totalCount,
      page,
      pageSize,
      totalPages,
    };

    // Populate cache with TTL of 30s (Req 10.3). Failures must not block
    // the response.
    try {
      await setCachedQueueResults(cacheKey, response, 30);
    } catch (err) {
      console.warn("[queue] Cache write failed:", err);
    }

    return response;
  }

  async getQueueStatistics(): Promise<QueueStats> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const openStatuses = new Set<TicketStatus>([
      TicketStatus.NEW,
      TicketStatus.IN_PROGRESS,
      TicketStatus.WAITING_FOR_INFO,
      TicketStatus.REOPENED,
    ]);

    let allTickets: Ticket[];
    try {
      // Load all tickets and filter by date in-memory. A more efficient SQL
      // aggregate is a follow-up.
      allTickets = await this.ticketRepository.findByFilters({});
    } catch (err) {
      console.warn(
        "[queue] Database query failed for statistics, returning empty stats:",
        err,
      );
      return {
        totalTickets: 0,
        openTickets: 0,
        resolvedTickets: 0,
        slaCompliancePercentage: 100,
        averageTimeToFirstResponse: 0,
        byPriority: {},
        byStatus: {},
      };
    }

    // Filter to tickets created in the last 30 days
    const recentTickets = allTickets.filter(
      (t) => t.createdAt.getTime() >= thirtyDaysAgo.getTime(),
    );
    const byPriority: Partial<Record<Priority, number>> = {};
    const byStatus: Partial<Record<TicketStatus, number>> = {};

    for (const ticket of recentTickets) {
      byPriority[ticket.priority] = (byPriority[ticket.priority] ?? 0) + 1;
      byStatus[ticket.status] = (byStatus[ticket.status] ?? 0) + 1;
    }

    // Calculate SLA compliance percentage
    const resolvedTickets = recentTickets.filter((t) => t.resolvedAt != null);
    let slaCompliancePercentage: number;

    if (resolvedTickets.length === 0) {
      slaCompliancePercentage = 100;
    } else {
      const compliantTickets = resolvedTickets.filter(
        (t) =>
          t.dueDate != null && t.resolvedAt!.getTime() <= t.dueDate.getTime(),
      );
      slaCompliancePercentage =
        (compliantTickets.length / resolvedTickets.length) * 100;
    }

    // Calculate average time to first technician response.
    const timesToFirstResponse: number[] = [];

    for (const ticket of recentTickets) {
      const firstInProgress = ticket.history.find(
        (entry) =>
          entry.action === HistoryActionType.ASSIGNED ||
          (entry.action === HistoryActionType.STATUS_CHANGED &&
            entry.newValue === TicketStatus.IN_PROGRESS),
      );

      if (firstInProgress) {
        const timeDiff =
          firstInProgress.timestamp.getTime() - ticket.createdAt.getTime();
        timesToFirstResponse.push(timeDiff);
      }
    }

    const averageTimeToFirstResponse =
      timesToFirstResponse.length > 0
        ? timesToFirstResponse.reduce((sum, t) => sum + t, 0) /
          timesToFirstResponse.length
        : 0;

    return {
      totalTickets: recentTickets.length,
      openTickets: recentTickets.filter((ticket) =>
        openStatuses.has(ticket.status),
      ).length,
      resolvedTickets: recentTickets.filter(
        (ticket) =>
          ticket.status === TicketStatus.RESOLVED ||
          ticket.status === TicketStatus.CLOSED,
      ).length,
      slaCompliancePercentage,
      averageTimeToFirstResponse,
      byPriority,
      byStatus,
    };
  }

  async escalateTicket(ticketId: string): Promise<TicketResult> {
    // Step 1: Find ticket via repository
    const ticket = await this.ticketRepository.findById(ticketId);
    if (!ticket) {
      return { success: false, error: "Ticket not found" };
    }

    // Step 2: Skip RESOLVED or CLOSED
    if (
      ticket.status === TicketStatus.RESOLVED ||
      ticket.status === TicketStatus.CLOSED
    ) {
      return {
        success: false,
        error: "Cannot escalate resolved or closed tickets",
      };
    }

    // Step 3: Check escalation conditions
    const now = new Date();
    const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
    const ONE_HOUR_MS = 60 * 60 * 1000;

    const slaBreached =
      ticket.dueDate != null && now.getTime() > ticket.dueDate.getTime();
    const inactivity48h =
      now.getTime() - ticket.updatedAt.getTime() > FORTY_EIGHT_HOURS_MS;
    const highCriticalUnassigned =
      (ticket.priority === Priority.HIGH ||
        ticket.priority === Priority.CRITICAL) &&
      !ticket.assigneeId &&
      now.getTime() - ticket.createdAt.getTime() > ONE_HOUR_MS;

    // Step 4: If no condition met, return error
    if (!slaBreached && !inactivity48h && !highCriticalUnassigned) {
      return { success: false, error: "No escalation condition met" };
    }

    // Step 5: Determine escalation reason
    let escalationReason: string;
    if (slaBreached) {
      escalationReason = "SLA breach: ticket due date has passed";
    } else if (inactivity48h) {
      escalationReason = "Inactivity: no activity for more than 48 hours";
    } else {
      escalationReason =
        "Unassigned high priority: HIGH/CRITICAL ticket unassigned for more than 1 hour";
    }

    // Step 6 & 7: Increase priority if not already CRITICAL
    const oldPriority = ticket.priority;
    const newPriority =
      ticket.priority === Priority.CRITICAL
        ? Priority.CRITICAL
        : getNextPriority(ticket.priority);

    // Persist priority change via repository.
    const updated = await this.ticketRepository.update(ticketId, {
      priority: newPriority,
    });
    if (!updated) {
      return { success: false, error: "Ticket not found" };
    }

    // Step 8: Persist escalation in history table.
    const historyEntry = createHistoryEntry({
      ticketId: updated.id,
      action: HistoryActionType.ESCALATED,
      previousValue: oldPriority,
      newValue: newPriority,
      userId: "SYSTEM",
      reason: escalationReason,
    });
    await this.historyRepository.append({
      id: historyEntry.id,
      ticketId: historyEntry.ticketId,
      action: historyEntry.action,
      previousValue: historyEntry.previousValue,
      newValue: historyEntry.newValue,
      userId: historyEntry.userId,
      timestamp: historyEntry.timestamp,
      reason: historyEntry.reason,
    });

    // Return updated ticket (priority and updatedAt already refreshed by repo).
    return { success: true, ticket: updated };
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
