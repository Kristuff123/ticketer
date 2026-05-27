import { NotificationType, TicketStatus, UserRole } from "../models/enums.js";
import { Notification, NotificationResult } from "../models/notification.js";
import { INotificationService } from "./interfaces/index.js";
import { EmailService, emailService } from "./email-service.js";
import { UserService, userService } from "./user-service.js";
import {
  NotificationRepository,
  NotificationListResult,
} from "../database/repositories/notification-repository.js";

export type { NotificationListResult };

export class NotificationService implements INotificationService {
  private notificationRepository: NotificationRepository;
  private userSvc: UserService;
  private emailSvc: EmailService;

  constructor(
    notificationRepository: NotificationRepository,
    userSvc?: UserService,
    emailSvc?: EmailService,
  ) {
    this.notificationRepository = notificationRepository;
    this.userSvc = userSvc ?? userService;
    this.emailSvc = emailSvc ?? emailService;
  }

  async notifyTicketCreated(ticketId: string): Promise<NotificationResult> {
    // Notify all admins about the new ticket
    const admins = await this.userSvc.getUserByRole(UserRole.ADMIN);
    let lastNotification: Notification | null = null;

    for (const admin of admins) {
      const notification = await this.createNotification(
        admin.id,
        NotificationType.TICKET_CREATED,
        "New ticket created",
        `A new ticket ${ticketId} has been created and requires attention.`,
        ticketId,
      );
      lastNotification = notification;
      await this.deliverNotification(notification, admin.id);
    }

    if (lastNotification) {
      return { success: true, notification: lastNotification };
    }
    return { success: false, error: "No admins to notify" };
  }

  async notifyTicketAssigned(
    ticketId: string,
    assigneeId: string,
  ): Promise<NotificationResult> {
    const notification = await this.createNotification(
      assigneeId,
      NotificationType.TICKET_ASSIGNED,
      "Ticket assigned to you",
      `Ticket ${ticketId} has been assigned to you.`,
      ticketId,
    );
    await this.deliverNotification(notification, assigneeId);
    return { success: true, notification };
  }

  async notifyStatusChanged(
    ticketId: string,
    newStatus: TicketStatus,
    recipientIds: string[] = [],
  ): Promise<NotificationResult> {
    return this.notifyRecipients(
      recipientIds,
      NotificationType.STATUS_CHANGED,
      "Ticket status changed",
      `Ticket ${ticketId} status changed to ${newStatus}.`,
      ticketId,
    );
  }

  async notifyCommentAdded(
    ticketId: string,
    commentId: string,
    recipientIds: string[] = [],
  ): Promise<NotificationResult> {
    return this.notifyRecipients(
      recipientIds,
      NotificationType.COMMENT_ADDED,
      "New comment added",
      `A new comment ${commentId} has been added to ticket ${ticketId}.`,
      ticketId,
    );
  }

  async notifyTicketResolved(
    ticketId: string,
    recipientIds: string[] = [],
  ): Promise<NotificationResult> {
    return this.notifyRecipients(
      recipientIds,
      NotificationType.TICKET_RESOLVED,
      "Ticket resolved",
      `Ticket ${ticketId} has been resolved.`,
      ticketId,
    );
  }

  async notifyEscalation(
    ticketId: string,
    reason: string,
  ): Promise<NotificationResult> {
    const admins = await this.userSvc.getUserByRole(UserRole.ADMIN);
    let lastNotification: Notification | null = null;

    for (const admin of admins) {
      const notification = await this.createNotification(
        admin.id,
        NotificationType.TICKET_ESCALATED,
        "Ticket escalated",
        `Ticket ${ticketId} has been escalated. Reason: ${reason}`,
        ticketId,
      );
      lastNotification = notification;
      await this.deliverNotification(notification, admin.id);
    }

    if (lastNotification) {
      return { success: true, notification: lastNotification };
    }
    return { success: false, error: "No admins to notify" };
  }

  /**
   * Get notifications for a user, ordered by createdAt DESC, paginated.
   * Returns the first notification as NotificationResult per interface contract.
   * Use getUserNotificationsList() for the full paginated list.
   * Requirements: 7.2, 9.4
   */
  async getUserNotifications(
    userId: string,
    page?: number,
    pageSize?: number,
  ): Promise<NotificationResult> {
    const result = await this.notificationRepository.findByUserId(
      userId,
      page,
      pageSize,
    );

    if (result.error) {
      return { success: false, error: result.error };
    }

    if (result.notifications.length === 0) {
      return { success: false, error: "No notifications found" };
    }

    return { success: true, notification: result.notifications[0] };
  }

  /**
   * Get the full paginated list of notifications for a user.
   * Ordered by createdAt DESC (newest first).
   * Default page=1, default pageSize=50, max pageSize=100.
   * Requirements: 7.2, 9.4
   */
  async getUserNotificationsList(
    userId: string,
    page?: number,
    pageSize?: number,
  ): Promise<NotificationListResult> {
    return await this.notificationRepository.findByUserId(
      userId,
      page,
      pageSize,
    );
  }

  /**
   * Mark a notification as read.
   * Rejects if notification doesn't exist or belongs to another user.
   * Requirements: 7.3, 7.4, 9.4
   */
  async markAsRead(
    notificationId: string,
    userId: string,
  ): Promise<NotificationResult> {
    const result = await this.notificationRepository.markAsRead(
      notificationId,
      userId,
    );

    if (!result) {
      return { success: false, error: "Notification not found" };
    }

    return { success: true, notification: result };
  }

  // --- Internal helpers ---

  private async notifyRecipients(
    recipientIds: string[],
    type: NotificationType,
    title: string,
    message: string,
    ticketId?: string,
  ): Promise<NotificationResult> {
    const uniqueRecipientIds = Array.from(
      new Set(recipientIds.filter(Boolean)),
    );
    let lastNotification: Notification | null = null;

    for (const recipientId of uniqueRecipientIds) {
      const notification = await this.createNotification(
        recipientId,
        type,
        title,
        message,
        ticketId,
      );
      lastNotification = notification;
      await this.deliverNotification(notification, recipientId);
    }

    if (lastNotification) {
      return { success: true, notification: lastNotification };
    }

    return { success: false, error: "No recipients to notify" };
  }

  /**
   * Build and persist a notification via the repository. The repository
   * generates `created_at` and seeds `is_read=false`/`read_at=null`; the id
   * is generated here so it stays a stable UUID v4.
   */
  private async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    ticketId?: string,
  ): Promise<Notification> {
    return await this.notificationRepository.create({
      id: crypto.randomUUID(),
      userId,
      type,
      title,
      message,
      ticketId,
    });
  }

  private async deliverNotification(
    notification: Notification,
    userId: string,
  ): Promise<void> {
    const user = await this.userSvc.getUser(userId);
    if (!user) return;

    // Persistence is handled by createNotification() via the repository.
    // This method handles fan-out delivery only.

    // Deliver based on user preferences
    if (user.preferences.emailNotifications) {
      await this.emailSvc.deliverNotificationEmail(notification, user.email);
    }

    if (user.preferences.dashboardNotifications) {
      // Dashboard delivery is served by the repository-backed list endpoint.
    }

    // WebSocket delivery would happen here if user is connected
  }
}

// Export a default instance backed by the module-level pg.Pool from connection.ts
export const notificationService = new NotificationService(
  new NotificationRepository(),
);
