// TODO(it-ticket-management/6.6): NotificationService no longer exposes the
// in-memory store helpers (clearAll/getStore) and now requires a
// NotificationRepository in its constructor. These tests need to be rewritten
// against a NotificationRepository mock; see spec task 6.6.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NotificationService } from "./notification-service.js";
import { userService } from "./user-service.js";

describe("NotificationService email delivery", () => {
  beforeEach(() => {
    NotificationService.clearAll();
  });

  it("should deliver email when user email notifications are enabled", async () => {
    const emailService = {
      deliverNotificationEmail: vi.fn().mockResolvedValue(true),
    };
    const notificationService = new NotificationService(
      userService,
      emailService as any,
    );

    const result = await notificationService.notifyTicketAssigned(
      "ticket-001",
      "tech-001",
    );

    expect(result.success).toBe(true);
    expect(emailService.deliverNotificationEmail).toHaveBeenCalledTimes(1);
    expect(emailService.deliverNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "tech-001",
        ticketId: "ticket-001",
      }),
      "technician@company.com",
    );
  });

  it("should keep dashboard notification even when email delivery fails", async () => {
    const emailService = {
      deliverNotificationEmail: vi.fn().mockResolvedValue(false),
    };
    const notificationService = new NotificationService(
      userService,
      emailService as any,
    );

    const result = await notificationService.notifyTicketAssigned(
      "ticket-002",
      "tech-001",
    );

    expect(result.success).toBe(true);
    expect(NotificationService.getStore("tech-001")).toHaveLength(1);
  });

  it("should persist status change notifications for supplied recipients", async () => {
    const emailService = {
      deliverNotificationEmail: vi.fn().mockResolvedValue(true),
    };
    const notificationService = new NotificationService(
      userService,
      emailService as any,
    );

    const result = await notificationService.notifyStatusChanged(
      "ticket-003",
      "IN_PROGRESS" as any,
      ["reporter-001", "tech-001"],
    );

    expect(result.success).toBe(true);
    expect(NotificationService.getStore("reporter-001")).toHaveLength(1);
    expect(NotificationService.getStore("tech-001")).toHaveLength(1);
  });

  it("should persist comment notifications only for supplied recipients", async () => {
    const emailService = {
      deliverNotificationEmail: vi.fn().mockResolvedValue(true),
    };
    const notificationService = new NotificationService(
      userService,
      emailService as any,
    );

    const result = await notificationService.notifyCommentAdded(
      "ticket-004",
      "comment-001",
      ["tech-001"],
    );

    expect(result.success).toBe(true);
    expect(NotificationService.getStore("tech-001")).toHaveLength(1);
    expect(NotificationService.getStore("reporter-001")).toHaveLength(0);
  });
});
