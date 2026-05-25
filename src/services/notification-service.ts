import { NotificationType, TicketStatus, UserRole } from '../models/enums.js';
import { Notification, NotificationResult } from '../models/notification.js';
import { INotificationService } from './interfaces/index.js';
import { EmailService, emailService } from './email-service.js';
import { UserService, userService } from './user-service.js';

// In-memory notification store: userId -> notifications[]
const notificationStore: Map<string, Notification[]> = new Map();

// Helper to get or create user notification list
function getUserStore(userId: string): Notification[] {
  if (!notificationStore.has(userId)) {
    notificationStore.set(userId, []);
  }
  return notificationStore.get(userId)!;
}

export interface NotificationListResult {
  success: true;
  notifications: Notification[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export class NotificationService implements INotificationService {
  private userSvc: UserService;
  private emailSvc: EmailService;

  constructor(userSvc?: UserService, emailSvc?: EmailService) {
    this.userSvc = userSvc ?? userService;
    this.emailSvc = emailSvc ?? emailService;
  }

  async notifyTicketCreated(ticketId: string): Promise<NotificationResult> {
    // Notify all admins about the new ticket
    const admins = await this.userSvc.getUserByRole(UserRole.ADMIN);
    let lastNotification: Notification | null = null;

    for (const admin of admins) {
      const notification = this.createNotification(
        admin.id,
        NotificationType.TICKET_CREATED,
        'New ticket created',
        `A new ticket ${ticketId} has been created and requires attention.`,
        ticketId
      );
      lastNotification = notification;
      await this.deliverNotification(notification, admin.id);
    }

    if (lastNotification) {
      return { success: true, notification: lastNotification };
    }
    return { success: false, error: 'No admins to notify' };
  }

  async notifyTicketAssigned(ticketId: string, assigneeId: string): Promise<NotificationResult> {
    const notification = this.createNotification(
      assigneeId,
      NotificationType.TICKET_ASSIGNED,
      'Ticket assigned to you',
      `Ticket ${ticketId} has been assigned to you.`,
      ticketId
    );
    await this.deliverNotification(notification, assigneeId);
    return { success: true, notification };
  }

  async notifyStatusChanged(ticketId: string, newStatus: TicketStatus): Promise<NotificationResult> {
    const notification = this.createNotification(
      'system',
      NotificationType.STATUS_CHANGED,
      'Ticket status changed',
      `Ticket ${ticketId} status changed to ${newStatus}.`,
      ticketId
    );
    return { success: true, notification };
  }

  async notifyCommentAdded(ticketId: string, commentId: string): Promise<NotificationResult> {
    const notification = this.createNotification(
      'system',
      NotificationType.COMMENT_ADDED,
      'New comment added',
      `A new comment has been added to ticket ${ticketId}.`,
      ticketId
    );
    return { success: true, notification };
  }

  async notifyTicketResolved(ticketId: string): Promise<NotificationResult> {
    const notification = this.createNotification(
      'system',
      NotificationType.TICKET_RESOLVED,
      'Ticket resolved',
      `Ticket ${ticketId} has been resolved.`,
      ticketId
    );
    return { success: true, notification };
  }

  async notifyEscalation(ticketId: string, reason: string): Promise<NotificationResult> {
    const admins = await this.userSvc.getUserByRole(UserRole.ADMIN);
    let lastNotification: Notification | null = null;

    for (const admin of admins) {
      const notification = this.createNotification(
        admin.id,
        NotificationType.TICKET_ESCALATED,
        'Ticket escalated',
        `Ticket ${ticketId} has been escalated. Reason: ${reason}`,
        ticketId
      );
      lastNotification = notification;
      await this.deliverNotification(notification, admin.id);
    }

    if (lastNotification) {
      return { success: true, notification: lastNotification };
    }
    return { success: false, error: 'No admins to notify' };
  }

  /**
   * Get notifications for a user, ordered by createdAt DESC, paginated.
   * Returns the first notification as NotificationResult per interface contract.
   * Use getUserNotificationsList() for the full paginated list.
   * Requirements: 7.2
   */
  async getUserNotifications(userId: string, page?: number, pageSize?: number): Promise<NotificationResult> {
    const result = this.getPaginatedNotifications(userId, page, pageSize);

    if (result.notifications.length === 0) {
      return { success: false, error: 'No notifications found' };
    }

    return { success: true, notification: result.notifications[0] };
  }

  /**
   * Get the full paginated list of notifications for a user.
   * Ordered by createdAt DESC (newest first).
   * Default page=1, default pageSize=50, max pageSize=100.
   * Requirements: 7.2
   */
  getUserNotificationsList(userId: string, page?: number, pageSize?: number): NotificationListResult {
    return this.getPaginatedNotifications(userId, page, pageSize);
  }

  /**
   * Mark a notification as read.
   * Rejects if notification doesn't exist or belongs to another user.
   * Requirements: 7.3, 7.4
   */
  async markAsRead(notificationId: string, userId: string): Promise<NotificationResult> {
    // Search for the notification across all user stores
    const userNotifications = notificationStore.get(userId);

    if (!userNotifications) {
      return { success: false, error: 'Notification not found' };
    }

    const notification = userNotifications.find((n) => n.id === notificationId);

    if (!notification) {
      // Don't reveal whether the notification exists for another user
      return { success: false, error: 'Notification not found' };
    }

    // Verify ownership (double-check)
    if (notification.userId !== userId) {
      return { success: false, error: 'Notification not found' };
    }

    // Set read status
    notification.isRead = true;
    notification.readAt = new Date();

    return { success: true, notification };
  }

  // --- Internal helpers ---

  private createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    ticketId?: string
  ): Notification {
    const notification: Notification = {
      id: crypto.randomUUID(),
      userId,
      type,
      title,
      message,
      ticketId,
      isRead: false,
      createdAt: new Date(),
    };
    return notification;
  }

  private async deliverNotification(notification: Notification, userId: string): Promise<void> {
    const user = await this.userSvc.getUser(userId);
    if (!user) return;

    // Always persist to the in-memory store
    const store = getUserStore(userId);
    store.push(notification);

    // Deliver based on user preferences
    if (user.preferences.emailNotifications) {
      await this.emailSvc.deliverNotificationEmail(notification, user.email);
    }

    if (user.preferences.dashboardNotifications) {
      // Dashboard delivery is handled by the store itself
    }

    // WebSocket delivery would happen here if user is connected
  }

  private getPaginatedNotifications(userId: string, page?: number, pageSize?: number): NotificationListResult {
    const effectivePage = Math.max(1, page ?? 1);
    const effectivePageSize = Math.min(100, Math.max(1, pageSize ?? 50));

    const userNotifications = notificationStore.get(userId) ?? [];

    // Sort by createdAt DESC (newest first)
    const sorted = [...userNotifications].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );

    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));
    const offset = (effectivePage - 1) * effectivePageSize;
    const notifications = sorted.slice(offset, offset + effectivePageSize);

    return {
      success: true,
      notifications,
      total,
      page: effectivePage,
      pageSize: effectivePageSize,
      totalPages,
    };
  }

  // --- Test helpers ---

  /**
   * Clear all notifications (for testing purposes)
   */
  static clearAll(): void {
    notificationStore.clear();
  }

  /**
   * Add a notification directly to the store (for testing purposes)
   */
  static addToStore(userId: string, notification: Notification): void {
    const store = getUserStore(userId);
    store.push(notification);
  }

  /**
   * Get the raw store for a user (for testing purposes)
   */
  static getStore(userId: string): Notification[] {
    return notificationStore.get(userId) ?? [];
  }
}

// Export a default instance
export const notificationService = new NotificationService();
