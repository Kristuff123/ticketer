import crypto from "node:crypto";
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
} from "../models/index.js";
import {
  validateStatusTransition,
  getAllowedTransitions,
} from "../utils/status-transitions.js";
import {
  validateCommentInput,
  validateTicketInput,
} from "../utils/validation.js";
import { calculateDueDate } from "../utils/sla.js";
import { ITicketService } from "./interfaces/index.js";
import { INotificationService } from "./interfaces/notification-service.interface.js";
import { IUserService } from "./interfaces/user-service.interface.js";
import { TicketRepository } from "../database/repositories/ticket-repository.js";
import { CommentRepository } from "../database/repositories/comment-repository.js";
import { TicketHistoryRepository } from "../database/repositories/ticket-history-repository.js";
import { invalidateQueueCache } from "../cache/queue-cache.js";

export class TicketService implements ITicketService {
  private ticketRepository: TicketRepository;
  private commentRepository: CommentRepository;
  private historyRepository: TicketHistoryRepository;
  private notificationService: INotificationService;
  private userService: IUserService;

  constructor(
    ticketRepository: TicketRepository,
    commentRepository: CommentRepository,
    historyRepository: TicketHistoryRepository,
    notificationService: INotificationService,
    userService: IUserService,
  ) {
    this.ticketRepository = ticketRepository;
    this.commentRepository = commentRepository;
    this.historyRepository = historyRepository;
    this.notificationService = notificationService;
    this.userService = userService;
  }

  private getNotificationRecipients(
    ticket: Ticket,
    options: { includeReporter?: boolean; excludeUserId?: string } = {},
  ): string[] {
    const includeReporter = options.includeReporter ?? true;
    const recipients = new Set<string>();

    if (includeReporter) {
      recipients.add(ticket.reporterId);
    }
    if (ticket.assigneeId) {
      recipients.add(ticket.assigneeId);
    }
    if (options.excludeUserId) {
      recipients.delete(options.excludeUserId);
    }

    return Array.from(recipients);
  }

  private async invalidateQueueCacheSafe(): Promise<void> {
    try {
      await invalidateQueueCache();
    } catch (err) {
      console.warn("[ticket] Queue cache invalidation failed:", err);
    }
  }

  async createTicket(data: TicketCreateInput): Promise<TicketResult> {
    // Validate input
    const validation = validateTicketInput(data);
    if (!validation.isValid) {
      const errorMessages = Object.entries(validation.errors)
        .map(([field, msg]) => `${field}: ${msg}`)
        .join("; ");
      return { success: false, error: errorMessages };
    }

    // Verify reporter exists and is active
    const reporter = await this.userService.getUser(data.reporterId);
    if (!reporter) {
      return { success: false, error: "Reporter not found" };
    }

    // Build ticket data
    const now = new Date();
    const id = crypto.randomUUID();
    const location = data.location?.trim() || undefined;
    const dueDate = calculateDueDate(data.priority, now);

    // Persist via repository
    const persisted = await this.ticketRepository.create({
      id,
      title: data.title,
      description: data.description,
      category: data.category,
      priority: data.priority,
      status: TicketStatus.NEW,
      location,
      reporterId: data.reporterId,
      createdAt: now,
      updatedAt: now,
      dueDate,
    });

    // Invalidate queue cache so the new ticket appears in queue queries
    await this.invalidateQueueCacheSafe();

    // Notify admins
    try {
      await this.notificationService.notifyTicketCreated(persisted.id);
    } catch {
      // Notification failure should not block ticket creation
    }

    return { success: true, ticket: persisted };
  }

  async getTicket(id: string): Promise<TicketResult> {
    const ticket = await this.ticketRepository.findById(id);
    if (!ticket) {
      return { success: false, error: "Ticket not found" };
    }

    // Load comments and history (Req 9.5). If either fails, return failure
    // without a partially populated ticket (Req 9.6).
    try {
      const [comments, history] = await Promise.all([
        this.commentRepository.findByTicketId(id),
        this.historyRepository.findByTicketId(id),
      ]);
      ticket.comments = comments;
      ticket.history = history;
    } catch {
      return { success: false, error: "Failed to load ticket details" };
    }

    return { success: true, ticket };
  }

  async updateTicket(
    _id: string,
    _data: TicketUpdateInput,
  ): Promise<TicketResult> {
    // Stub - to be implemented
    return { success: false, error: "Not implemented" };
  }

  async assignTicket(
    id: string,
    assigneeId: string,
    assignedBy: string,
  ): Promise<TicketResult> {
    // 1. Find ticket
    const ticket = await this.ticketRepository.findById(id);
    if (!ticket) {
      return { success: false, error: "Ticket not found" };
    }

    // 2. Reject CLOSED/RESOLVED
    if (
      ticket.status === TicketStatus.CLOSED ||
      ticket.status === TicketStatus.RESOLVED
    ) {
      return {
        success: false,
        error: "Cannot assign ticket with status CLOSED or RESOLVED",
      };
    }

    // 3. Verify assignee exists
    const assignee = await this.userService.getUser(assigneeId);
    if (!assignee) {
      return { success: false, error: "Assignee not found" };
    }

    // 4. Verify assignee role
    if (
      assignee.role !== UserRole.TECHNICIAN &&
      assignee.role !== UserRole.ADMIN
    ) {
      return {
        success: false,
        error: "Assignee must have TECHNICIAN or ADMIN role",
      };
    }

    const previousAssignee = ticket.assigneeId;

    // 5. Persist update
    const updated = await this.ticketRepository.update(id, {
      assigneeId,
      status: TicketStatus.IN_PROGRESS,
    });
    if (!updated) {
      return { success: false, error: "Ticket not found" };
    }

    // 6. Append history entry — failure is fatal (do not silently lose audit trail)
    try {
      await this.historyRepository.append({
        id: crypto.randomUUID(),
        ticketId: id,
        action: HistoryActionType.ASSIGNED,
        previousValue: previousAssignee || "",
        newValue: assigneeId,
        userId: assignedBy,
        timestamp: new Date(),
      });
    } catch {
      return { success: false, error: "Failed to record assignment history" };
    }

    // Invalidate queue cache — assignee/status change affects queue results
    await this.invalidateQueueCacheSafe();

    // 7. Notify new assignee
    try {
      await this.notificationService.notifyTicketAssigned(id, assigneeId);
    } catch {
      // Notification failure should not block assignment
    }

    // 8. Notify previous assignee on reassignment
    if (previousAssignee && previousAssignee !== assigneeId) {
      try {
        await this.notificationService.notifyTicketAssigned(
          id,
          previousAssignee,
        );
      } catch {
        // Notification failure should not block assignment
      }
    }

    return { success: true, ticket: updated };
  }

  async changeStatus(
    id: string,
    status: TicketStatus,
    userId: string,
  ): Promise<TicketResult> {
    // 1. Find ticket
    const ticket = await this.ticketRepository.findById(id);
    if (!ticket) {
      return { success: false, error: "Ticket not found" };
    }

    // 2. Validate transition
    const currentStatus = ticket.status;
    if (!validateStatusTransition(currentStatus, status)) {
      return {
        success: false,
        error: `Invalid status transition from ${currentStatus} to ${status}. Allowed: ${getAllowedTransitions(currentStatus).join(", ")}`,
      };
    }

    // 3. Build update payload, mirroring previous resolvedAt rules
    const updatePayload: Parameters<TicketRepository["update"]>[1] = { status };
    if (status === TicketStatus.RESOLVED) {
      updatePayload.resolvedAt = new Date();
    } else if (status === TicketStatus.REOPENED) {
      updatePayload.resolvedAt = null;
    }

    const updated = await this.ticketRepository.update(id, updatePayload);
    if (!updated) {
      return { success: false, error: "Ticket not found" };
    }

    // 4. Append history entry — failure is fatal
    try {
      await this.historyRepository.append({
        id: crypto.randomUUID(),
        ticketId: id,
        action: HistoryActionType.STATUS_CHANGED,
        previousValue: currentStatus,
        newValue: status,
        userId,
        timestamp: new Date(),
      });
    } catch {
      return {
        success: false,
        error: "Failed to record status change history",
      };
    }

    // Invalidate queue cache — status change affects queue results
    await this.invalidateQueueCacheSafe();

    // 5. Notifications
    const recipientIds = this.getNotificationRecipients(updated, {
      excludeUserId: userId,
    });
    if (status === TicketStatus.RESOLVED) {
      await this.notificationService.notifyTicketResolved(id, recipientIds);
    } else {
      await this.notificationService.notifyStatusChanged(
        id,
        status,
        recipientIds,
      );
    }

    return { success: true, ticket: updated };
  }

  async addComment(
    id: string,
    comment: CommentInput,
    userId: string,
  ): Promise<CommentResult> {
    // 1. Verify ticket exists (don't load comments/history — too expensive)
    const ticket = await this.ticketRepository.findById(id);
    if (!ticket) {
      return { success: false, error: "Ticket not found" };
    }

    // 2. Validate content
    const validation = validateCommentInput(comment.content);
    if (!validation.isValid) {
      const errorMessage = Object.values(validation.errors)[0];
      return { success: false, error: errorMessage };
    }

    // 3. Internal comments require TECHNICIAN/ADMIN
    if (comment.isInternal) {
      const user = await this.userService.getUser(userId);
      if (
        !user ||
        (user.role !== UserRole.TECHNICIAN && user.role !== UserRole.ADMIN)
      ) {
        return {
          success: false,
          error: "Only TECHNICIAN or ADMIN can create internal comments",
        };
      }
    }

    // 4. Persist comment
    const newComment: Comment = await this.commentRepository.create({
      id: crypto.randomUUID(),
      ticketId: id,
      authorId: userId,
      content: comment.content,
      isInternal: comment.isInternal,
    });

    // 5. Notifications
    try {
      await this.notificationService.notifyCommentAdded(
        id,
        newComment.id,
        this.getNotificationRecipients(ticket, {
          excludeUserId: userId,
          includeReporter: !newComment.isInternal,
        }),
      );
    } catch {
      // Notification failure should not block comment creation
    }

    return { success: true, comment: newComment };
  }

  async getTicketsByUser(userId: string): Promise<TicketListResult> {
    // Look up user to determine role-based filtering
    const user = await this.userService.getUser(userId);

    let filtered: Ticket[];
    if (!user) {
      filtered = [];
    } else if (
      user.role === UserRole.ADMIN ||
      user.role === UserRole.TECHNICIAN
    ) {
      // Admins see everything; technicians can view the operational queue
      filtered = await this.ticketRepository.findByFilters({});
    } else {
      // Reporter sees only own tickets
      filtered = await this.ticketRepository.findByFilters({
        reporterId: userId,
      });
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
    return this.historyRepository.findByTicketId(id);
  }

  /**
   * @deprecated Vestigial accessor retained as a no-op shim during the
   * in-memory → repository migration. Returns an empty Map so that legacy
   * callers (e.g. `userService['ticketLookup']` in `src/index.ts`) do not
   * crash before task 9.1 removes them. Do not add new callers.
   */
  getTicketStore(): Map<string, Ticket> {
    return new Map();
  }
}
