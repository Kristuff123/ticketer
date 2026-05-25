import crypto from 'node:crypto';
import {
  TicketStatus,
  HistoryActionType,
  UserRole,
  Ticket,
  TicketCreateInput,
  TicketUpdateInput,
  TicketResult,
  TicketHistoryEntry,
  Comment,
  CommentInput,
  CommentResult,
  TicketListResult,
} from '../models';
import { validateStatusTransition, getAllowedTransitions } from '../utils/status-transitions';
import { createHistoryEntry, getTicketHistory } from '../utils/history';
import { validateCommentInput, validateTicketInput } from '../utils/validation';
import { calculateDueDate } from '../utils/sla';
import { ITicketService } from './interfaces';
import { INotificationService } from './interfaces/notification-service.interface';
import { IUserService } from './interfaces/user-service.interface';

// In-memory ticket store (to be replaced with database layer later)
const tickets: Map<string, Ticket> = new Map();

export class TicketService implements ITicketService {
  private notificationService: INotificationService;
  private userService: IUserService;

  constructor(notificationService: INotificationService, userService: IUserService) {
    this.notificationService = notificationService;
    this.userService = userService;
  }

  async createTicket(data: TicketCreateInput): Promise<TicketResult> {
    // Validate input
    const validation = validateTicketInput(data);
    if (!validation.isValid) {
      const errorMessages = Object.entries(validation.errors)
        .map(([field, msg]) => `${field}: ${msg}`)
        .join('; ');
      return { success: false, error: errorMessages };
    }

    // Verify reporter exists and is active
    const reporter = await this.userService.getUser(data.reporterId);
    if (!reporter) {
      return { success: false, error: 'Reporter not found' };
    }

    // Create ticket
    const now = new Date();
    const ticket: Ticket = {
      id: crypto.randomUUID(),
      title: data.title,
      description: data.description,
      category: data.category,
      priority: data.priority,
      status: TicketStatus.NEW,
      reporterId: data.reporterId,
      createdAt: now,
      updatedAt: now,
      dueDate: calculateDueDate(data.priority, now),
      comments: [],
      history: [],
    };

    // Persist
    tickets.set(ticket.id, ticket);

    // Notify admins
    try {
      await this.notificationService.notifyTicketCreated(ticket.id);
    } catch {
      // Notification failure should not block ticket creation
    }

    return { success: true, ticket };
  }

  async getTicket(id: string): Promise<TicketResult> {
    const ticket = tickets.get(id);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }
    return { success: true, ticket };
  }

  async updateTicket(id: string, data: TicketUpdateInput): Promise<TicketResult> {
    // Stub - to be implemented
    return { success: false, error: 'Not implemented' };
  }

  async assignTicket(id: string, assigneeId: string, assignedBy: string): Promise<TicketResult> {
    // 1. Find ticket by ID
    const ticket = tickets.get(id);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    // 2. Check if ticket status is CLOSED or RESOLVED
    if (ticket.status === TicketStatus.CLOSED || ticket.status === TicketStatus.RESOLVED) {
      return { success: false, error: 'Cannot assign ticket with status CLOSED or RESOLVED' };
    }

    // 3. Verify assignee exists
    const assignee = await this.userService.getUser(assigneeId);
    if (!assignee) {
      return { success: false, error: 'Assignee not found' };
    }

    // 4. Verify assignee has TECHNICIAN or ADMIN role
    if (assignee.role !== UserRole.TECHNICIAN && assignee.role !== UserRole.ADMIN) {
      return { success: false, error: 'Assignee must have TECHNICIAN or ADMIN role' };
    }

    // 5. Store previous assignee ID
    const previousAssignee = ticket.assigneeId;

    // 6. Update ticket assignee
    ticket.assigneeId = assigneeId;

    // 7. Update ticket status to IN_PROGRESS
    ticket.status = TicketStatus.IN_PROGRESS;

    // 8. Add history entry
    const historyEntry = createHistoryEntry({
      ticketId: ticket.id,
      action: HistoryActionType.ASSIGNED,
      previousValue: previousAssignee || '',
      newValue: assigneeId,
      userId: assignedBy,
    });
    ticket.history.push(historyEntry);

    // 9. Update ticket updatedAt
    ticket.updatedAt = new Date();

    // 10. Notify new assignee
    try {
      await this.notificationService.notifyTicketAssigned(ticket.id, assigneeId);
    } catch {
      // Notification failure should not block assignment
    }

    // 11. If there was a previous assignee (reassignment), notify them too
    if (previousAssignee && previousAssignee !== assigneeId) {
      try {
        await this.notificationService.notifyTicketAssigned(ticket.id, previousAssignee);
      } catch {
        // Notification failure should not block assignment
      }
    }

    // 12. Return success
    return { success: true, ticket };
  }

  async changeStatus(id: string, status: TicketStatus, userId: string): Promise<TicketResult> {
    // Step 1: Find ticket by ID
    const ticket = tickets.get(id);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    // Step 2: Validate the transition using state machine
    const currentStatus = ticket.status;
    if (!validateStatusTransition(currentStatus, status)) {
      return {
        success: false,
        error: `Invalid status transition from ${currentStatus} to ${status}. Allowed: ${getAllowedTransitions(currentStatus).join(', ')}`,
      };
    }

    // Step 3: Update ticket status
    const oldStatus = ticket.status;
    ticket.status = status;

    // Step 4: If new status is RESOLVED, set resolvedAt
    if (status === TicketStatus.RESOLVED) {
      ticket.resolvedAt = new Date();
    }

    // Step 5: If new status is REOPENED, clear resolvedAt
    if (status === TicketStatus.REOPENED) {
      ticket.resolvedAt = undefined;
    }

    // Step 6: Add history entry
    const historyEntry = createHistoryEntry({
      ticketId: ticket.id,
      action: HistoryActionType.STATUS_CHANGED,
      previousValue: oldStatus,
      newValue: status,
      userId,
    });
    ticket.history.push(historyEntry);

    // Step 7: Update updatedAt
    ticket.updatedAt = new Date();

    // Step 8: Trigger notifications
    if (status === TicketStatus.RESOLVED) {
      await this.notificationService.notifyTicketResolved(ticket.id);
    } else {
      await this.notificationService.notifyStatusChanged(ticket.id, status);
    }

    // Step 9: Return success
    return { success: true, ticket };
  }

  async addComment(id: string, comment: CommentInput, userId: string): Promise<CommentResult> {
    // 1. Find ticket by ID
    const ticket = tickets.get(id);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    // 2. Validate comment content
    const validation = validateCommentInput(comment.content);
    if (!validation.isValid) {
      const errorMessage = Object.values(validation.errors)[0];
      return { success: false, error: errorMessage };
    }

    // 3. If internal comment, check user has TECHNICIAN or ADMIN role
    if (comment.isInternal) {
      const user = await this.userService.getUser(userId);
      if (!user || (user.role !== UserRole.TECHNICIAN && user.role !== UserRole.ADMIN)) {
        return { success: false, error: 'Only TECHNICIAN or ADMIN can create internal comments' };
      }
    }

    // 4. Create the Comment object
    const newComment: Comment = {
      id: crypto.randomUUID(),
      ticketId: id,
      authorId: userId,
      content: comment.content,
      isInternal: comment.isInternal,
      createdAt: new Date(),
    };

    // 5. Add comment to ticket's comments array
    ticket.comments.push(newComment);

    // 6. Update ticket.updatedAt
    ticket.updatedAt = new Date();

    // 7. Trigger notifications
    try {
      await this.notificationService.notifyCommentAdded(id, newComment.id);
    } catch {
      // Notification failure should not block comment creation
    }

    // 8. Return success
    return { success: true, comment: newComment };
  }

  async getTicketsByUser(userId: string): Promise<TicketListResult> {
    // Look up user to determine role-based filtering
    const user = await this.userService.getUser(userId);
    const allTickets = Array.from(tickets.values());

    let filtered: Ticket[];
    if (!user) {
      filtered = [];
    } else if (user.role === UserRole.ADMIN) {
      // Admin sees everything
      filtered = allTickets;
    } else if (user.role === UserRole.TECHNICIAN) {
      // Technician sees tickets assigned to them
      filtered = allTickets.filter((t) => t.assigneeId === userId);
    } else {
      // Reporter sees only own tickets
      filtered = allTickets.filter((t) => t.reporterId === userId);
    }

    // Sort by createdAt DESC (newest first)
    filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return {
      tickets: filtered,
      totalCount: filtered.length,
      page: 1,
      pageSize: filtered.length,
      totalPages: 1,
    };
  }

  async getTicketHistory(id: string): Promise<TicketHistoryEntry[]> {
    const ticket = tickets.get(id);
    if (!ticket) {
      return [];
    }
    return getTicketHistory(ticket.history);
  }

  // Helper to access the in-memory store (for testing and other services)
  getTicketStore(): Map<string, Ticket> {
    return tickets;
  }
}
