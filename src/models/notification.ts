import { NotificationType } from './enums';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  ticketId?: string;
  isRead: boolean;
  createdAt: Date;
  readAt?: Date;
}

export type NotificationResult =
  | { success: true; notification: Notification }
  | { success: false; error: string };
