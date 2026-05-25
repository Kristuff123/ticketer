import { TicketStatus } from '../../models/enums';
import { NotificationResult } from '../../models/notification';

export interface INotificationService {
  notifyTicketCreated(ticketId: string): Promise<NotificationResult>;
  notifyTicketAssigned(ticketId: string, assigneeId: string): Promise<NotificationResult>;
  notifyStatusChanged(ticketId: string, newStatus: TicketStatus): Promise<NotificationResult>;
  notifyCommentAdded(ticketId: string, commentId: string): Promise<NotificationResult>;
  notifyTicketResolved(ticketId: string): Promise<NotificationResult>;
  notifyEscalation(ticketId: string, reason: string): Promise<NotificationResult>;
  getUserNotifications(userId: string, page?: number, pageSize?: number): Promise<NotificationResult>;
  markAsRead(notificationId: string, userId: string): Promise<NotificationResult>;
}
