import { query } from "../connection.js";
import type { Notification } from "../../models/notification.js";
import type { NotificationType } from "../../models/enums.js";

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  ticket_id: string | null;
  is_read: boolean;
  created_at: Date;
  read_at: Date | null;
}

export interface NotificationListResult {
  notifications: Notification[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  error?: string;
}

function mapRowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as NotificationType,
    title: row.title,
    message: row.message,
    ticketId: row.ticket_id ?? undefined,
    isRead: row.is_read,
    createdAt: row.created_at,
    readAt: row.read_at ?? undefined,
  };
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 100;

export class NotificationRepository {
  /**
   * Insert a new notification. DB errors propagate to the caller (Req 7.2).
   */
  async create(notification: {
    id: string;
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    ticketId?: string;
  }): Promise<Notification> {
    const result = await query<NotificationRow>(
      `INSERT INTO notifications (id, user_id, type, title, message, ticket_id, is_read, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE, NOW())
       RETURNING *`,
      [
        notification.id,
        notification.userId,
        notification.type,
        notification.title,
        notification.message,
        notification.ticketId ?? null,
      ],
    );
    return mapRowToNotification(result.rows[0]);
  }

  /**
   * List notifications for a user with pagination. On DB error, returns an
   * empty result with an `error` field rather than throwing (Req 7.4).
   */
  async findByUserId(
    userId: string,
    page: number = DEFAULT_PAGE,
    pageSize: number = DEFAULT_PAGE_SIZE,
  ): Promise<NotificationListResult> {
    const effectivePage = Math.max(1, Math.floor(page));
    const effectivePageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(MIN_PAGE_SIZE, Math.floor(pageSize)),
    );
    const offset = (effectivePage - 1) * effectivePageSize;

    try {
      const countResult = await query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM notifications WHERE user_id = $1",
        [userId],
      );
      const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

      const pageResult = await query<NotificationRow>(
        `SELECT * FROM notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, effectivePageSize, offset],
      );

      const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));

      return {
        notifications: pageResult.rows.map(mapRowToNotification),
        total,
        page: effectivePage,
        pageSize: effectivePageSize,
        totalPages,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        notifications: [],
        total: 0,
        page,
        pageSize,
        totalPages: 1,
        error: message,
      };
    }
  }

  /**
   * Mark a notification as read, but only if it belongs to the given user.
   * Returns the updated row, or `null` when no row matches (Req 7.5/7.6).
   */
  async markAsRead(
    notificationId: string,
    userId: string,
  ): Promise<Notification | null> {
    const result = await query<NotificationRow>(
      `UPDATE notifications
       SET is_read = TRUE, read_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [notificationId, userId],
    );

    if (result.rows.length === 0) return null;
    return mapRowToNotification(result.rows[0]);
  }
}
