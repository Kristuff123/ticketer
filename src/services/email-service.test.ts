import { describe, it, expect, vi } from 'vitest';
import { EmailService, delay } from './email-service.js';
import { Notification } from '../models/notification.js';
import { NotificationType } from '../models/enums.js';

describe('EmailService', () => {
  describe('delay', () => {
    it('should resolve after the specified time', async () => {
      vi.useFakeTimers();
      const promise = delay(1000);
      vi.advanceTimersByTime(1000);
      await promise;
      vi.useRealTimers();
    });
  });

  describe('sendEmail', () => {
    it('should return true when email is sent successfully', async () => {
      // JSON transport always succeeds
      const service = new EmailService();
      const result = await service.sendEmail('user@example.com', 'Test', '<p>Hello</p>');
      expect(result).toBe(true);
    });

    it('should return false when transport fails', async () => {
      const mockTransporter = {
        sendMail: vi.fn().mockRejectedValue(new Error('SMTP connection failed')),
      };
      const service = new EmailService(mockTransporter as any);
      const result = await service.sendEmail('user@example.com', 'Test', '<p>Hello</p>');
      expect(result).toBe(false);
    });
  });

  describe('sendWithRetry', () => {
    it('should return true on first successful attempt', async () => {
      const service = new EmailService();
      const result = await service.sendWithRetry('user@example.com', 'Test', '<p>Hello</p>');
      expect(result).toBe(true);
    });

    it('should retry and succeed on second attempt', async () => {
      const mockTransporter = {
        sendMail: vi.fn()
          .mockRejectedValueOnce(new Error('Temporary failure'))
          .mockResolvedValueOnce({ messageId: '123' }),
      };
      const service = new EmailService(mockTransporter as any);

      vi.useFakeTimers();
      const promise = service.sendWithRetry('user@example.com', 'Test', '<p>Hello</p>');

      // First attempt fails, wait for backoff (1000ms)
      await vi.advanceTimersByTimeAsync(1000);
      const result = await promise;

      expect(result).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it('should return false after all retries exhausted', async () => {
      const mockTransporter = {
        sendMail: vi.fn().mockRejectedValue(new Error('Permanent failure')),
      };
      const service = new EmailService(mockTransporter as any);

      vi.useFakeTimers();
      const promise = service.sendWithRetry('user@example.com', 'Test', '<p>Hello</p>', 3);

      // Advance through all backoff delays: 1s + 2s + 4s
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);
      const result = await promise;

      expect(result).toBe(false);
      // 1 initial + 3 retries = 4 total attempts
      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(4);
      vi.useRealTimers();
    });

    it('should use exponential backoff delays', async () => {
      const mockTransporter = {
        sendMail: vi.fn().mockRejectedValue(new Error('Failure')),
      };
      const service = new EmailService(mockTransporter as any);

      vi.useFakeTimers();
      const promise = service.sendWithRetry('user@example.com', 'Test', '<p>Hello</p>', 3);

      // After first failure, should wait 1000ms (1000 * 2^0)
      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(2);

      // After second failure, should wait 2000ms (1000 * 2^1)
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(3);

      // After third failure, should wait 4000ms (1000 * 2^2)
      await vi.advanceTimersByTimeAsync(4000);
      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(4);

      const result = await promise;
      expect(result).toBe(false);
      vi.useRealTimers();
    });
  });

  describe('deliverNotificationEmail', () => {
    it('should format notification and send email', async () => {
      const mockTransporter = {
        sendMail: vi.fn().mockResolvedValue({ messageId: '123' }),
      };
      const service = new EmailService(mockTransporter as any);

      const notification: Notification = {
        id: 'notif-1',
        userId: 'user-1',
        type: NotificationType.TICKET_CREATED,
        title: 'New ticket created',
        message: 'Ticket TK-001 has been created.',
        ticketId: 'TK-001',
        isRead: false,
        createdAt: new Date(),
      };

      const result = await service.deliverNotificationEmail(notification, 'user@example.com');
      expect(result).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);

      const sentMail = mockTransporter.sendMail.mock.calls[0][0];
      expect(sentMail.to).toBe('user@example.com');
      expect(sentMail.subject).toContain('New ticket created');
      expect(sentMail.html).toContain('Ticket TK-001 has been created.');
      expect(sentMail.html).toContain('TK-001');
    });

    it('should return false when email delivery fails after retries', async () => {
      const mockTransporter = {
        sendMail: vi.fn().mockRejectedValue(new Error('SMTP error')),
      };
      const service = new EmailService(mockTransporter as any);

      const notification: Notification = {
        id: 'notif-2',
        userId: 'user-2',
        type: NotificationType.STATUS_CHANGED,
        title: 'Status changed',
        message: 'Ticket status updated.',
        isRead: false,
        createdAt: new Date(),
      };

      vi.useFakeTimers();
      const promise = service.deliverNotificationEmail(notification, 'user@example.com');

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);
      const result = await promise;

      expect(result).toBe(false);
      // Caller should mark notification with delivery failure status
      // Dashboard notification is preserved regardless (handled by caller)
      vi.useRealTimers();
    });
  });
});
