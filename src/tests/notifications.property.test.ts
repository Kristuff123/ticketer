import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { NotificationService } from '../services/notification-service.js';
import { NotificationType } from '../models/enums.js';
import { Notification } from '../models/notification.js';

/**
 * Property 12: Notification Ordering
 *
 * For any user, their notification list shall be returned ordered by creation date
 * (newest first), and marking a notification as read shall set a read timestamp
 * without affecting other notifications.
 *
 * **Validates: Requirements 7.2, 7.3**
 */

// --- Arbitraries ---

const notificationTypeArb = fc.constantFrom(
  NotificationType.TICKET_CREATED,
  NotificationType.TICKET_ASSIGNED,
  NotificationType.STATUS_CHANGED,
  NotificationType.COMMENT_ADDED,
  NotificationType.TICKET_RESOLVED,
  NotificationType.TICKET_ESCALATED
);

function createNotification(
  userId: string,
  createdAt: Date,
  type: NotificationType
): Notification {
  return {
    id: crypto.randomUUID(),
    userId,
    type,
    title: `Notification ${type}`,
    message: `Message for ${type}`,
    ticketId: crypto.randomUUID(),
    isRead: false,
    createdAt,
  };
}

// Generate a list of distinct timestamps to ensure unique ordering
// Use integer-based date generation to avoid NaN dates from fc.date shrinking
const timestampArb = fc.integer({
  min: new Date('2020-01-01T00:00:00Z').getTime(),
  max: new Date('2030-12-31T23:59:59Z').getTime(),
}).map((ms) => new Date(ms));

describe('Property 12: Notification Ordering', () => {
  let notificationService: NotificationService;

  beforeEach(() => {
    NotificationService.clearAll();
    notificationService = new NotificationService();
  });

  /**
   * 1. For any set of notifications with various timestamps added to a user's store,
   *    getUserNotificationsList returns them ordered by createdAt DESC (newest first).
   * **Validates: Requirements 7.2**
   */
  it('notifications are returned ordered by createdAt DESC (newest first)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(timestampArb, notificationTypeArb),
          { minLength: 2, maxLength: 20 }
        ),
        async (notificationData) => {
          NotificationService.clearAll();
          const userId = 'user-ordering-test';

          // Add notifications with various timestamps in random order
          for (const [createdAt, type] of notificationData) {
            const notification = createNotification(userId, createdAt, type);
            NotificationService.addToStore(userId, notification);
          }

          // Retrieve notifications
          const result = notificationService.getUserNotificationsList(userId);

          expect(result.success).toBe(true);
          expect(result.notifications.length).toBe(notificationData.length);

          // Verify ordering: each notification's createdAt should be >= the next one's
          for (let i = 0; i < result.notifications.length - 1; i++) {
            const current = result.notifications[i].createdAt.getTime();
            const next = result.notifications[i + 1].createdAt.getTime();
            expect(current).toBeGreaterThanOrEqual(next);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 2. Marking a random notification as read sets readAt on that notification
   *    without affecting other notifications.
   * **Validates: Requirements 7.3**
   */
  it('marking a notification as read sets readAt without affecting others', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(timestampArb, notificationTypeArb),
          { minLength: 2, maxLength: 15 }
        ),
        fc.nat(),
        async (notificationData, indexSeed) => {
          NotificationService.clearAll();
          const userId = 'user-read-test';

          // Add notifications
          const addedNotifications: Notification[] = [];
          for (const [createdAt, type] of notificationData) {
            const notification = createNotification(userId, createdAt, type);
            NotificationService.addToStore(userId, notification);
            addedNotifications.push(notification);
          }

          // Pick a random notification to mark as read
          const targetIndex = indexSeed % addedNotifications.length;
          const targetNotification = addedNotifications[targetIndex];

          // Snapshot other notifications before marking
          const othersBefore = addedNotifications
            .filter((_, i) => i !== targetIndex)
            .map((n) => ({
              id: n.id,
              isRead: n.isRead,
              readAt: n.readAt,
            }));

          // Mark as read
          const result = await notificationService.markAsRead(targetNotification.id, userId);

          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.notification.isRead).toBe(true);
            expect(result.notification.readAt).toBeInstanceOf(Date);
          }

          // Verify other notifications are unchanged
          const store = NotificationService.getStore(userId);
          for (const before of othersBefore) {
            const current = store.find((n) => n.id === before.id)!;
            expect(current.isRead).toBe(before.isRead);
            expect(current.readAt).toBe(before.readAt);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 3. Marking a non-existent notification returns an error.
   * **Validates: Requirements 7.3**
   */
  it('marking a non-existent notification returns an error', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (fakeNotificationId) => {
          NotificationService.clearAll();
          const userId = 'user-nonexistent-test';

          // Add one notification so the user has a store
          const notification = createNotification(
            userId,
            new Date(),
            NotificationType.TICKET_CREATED
          );
          NotificationService.addToStore(userId, notification);

          // Try to mark a non-existent notification as read
          const result = await notificationService.markAsRead(fakeNotificationId, userId);

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toContain('not found');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 4. Marking another user's notification returns an error.
   * **Validates: Requirements 7.3**
   */
  it("marking another user's notification returns an error", async () => {
    await fc.assert(
      fc.asyncProperty(
        notificationTypeArb,
        async (type) => {
          NotificationService.clearAll();
          const ownerUserId = 'user-owner';
          const otherUserId = 'user-other';

          // Add a notification for the owner
          const notification = createNotification(ownerUserId, new Date(), type);
          NotificationService.addToStore(ownerUserId, notification);

          // Another user tries to mark it as read
          const result = await notificationService.markAsRead(notification.id, otherUserId);

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toContain('not found');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
