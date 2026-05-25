import { describe, it, expect, beforeEach } from 'vitest';
import {
  TicketStatus,
  TicketCategory,
  Priority,
  HistoryActionType,
  UserRole,
  Ticket,
  User,
} from '../models';
import { TicketService } from '../services/ticket-service';
import { QueueService } from '../services/queue-service';
import { NotificationService } from '../services/notification-service';
import { UserService } from '../services/user-service';

/**
 * Integration tests for the full ticket lifecycle.
 * Uses actual service implementations (not mocks) to verify end-to-end behavior.
 *
 * Validates: Requirements 1.1, 2.1, 3.1, 5.1, 6.1, 7.1, 8.1
 */

// Helper to create a ticket directly in the store
function createTicketInStore(
  store: Map<string, Ticket>,
  overrides: Partial<Ticket> = {}
): Ticket {
  const ticket: Ticket = {
    id: overrides.id ?? crypto.randomUUID(),
    title: overrides.title ?? 'Test Ticket',
    description: overrides.description ?? 'Test description for integration testing',
    category: overrides.category ?? TicketCategory.SOFTWARE,
    priority: overrides.priority ?? Priority.MEDIUM,
    status: overrides.status ?? TicketStatus.NEW,
    reporterId: overrides.reporterId ?? 'reporter-001',
    assigneeId: overrides.assigneeId,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
    resolvedAt: overrides.resolvedAt,
    dueDate: overrides.dueDate,
    comments: overrides.comments ?? [],
    history: overrides.history ?? [],
  };
  store.set(ticket.id, ticket);
  return ticket;
}

describe('Integration: Full Ticket Lifecycle', () => {
  let ticketService: TicketService;
  let queueService: QueueService;
  let notificationService: NotificationService;
  let userService: UserService;
  let ticketStore: Map<string, Ticket>;

  beforeEach(() => {
    // Clear notification store
    NotificationService.clearAll();

    // Create real services wired together
    // UserService uses the built-in in-memory user store (admin-001, tech-001, reporter-001)
    notificationService = new NotificationService();
    userService = new UserService();
    ticketService = new TicketService(notificationService, userService);
    ticketStore = ticketService.getTicketStore();
    ticketStore.clear();
    queueService = new QueueService();
  });

  describe('Create → Assign → Comment → Resolve → Close', () => {
    it('should complete the full ticket lifecycle with correct state at each step', async () => {
      // Step 1: Create ticket
      const ticket = createTicketInStore(ticketStore, {
        title: 'Printer not working',
        description: 'Office printer on 3rd floor is jammed',
        category: TicketCategory.HARDWARE,
        priority: Priority.HIGH,
        reporterId: 'reporter-001',
      });

      expect(ticket.status).toBe(TicketStatus.NEW);
      expect(ticket.history).toHaveLength(0);

      // Step 2: Assign to technician
      const assignResult = await ticketService.assignTicket(
        ticket.id,
        'tech-001',
        'admin-001'
      );

      expect(assignResult.success).toBe(true);
      if (!assignResult.success) return;
      expect(assignResult.ticket.status).toBe(TicketStatus.IN_PROGRESS);
      expect(assignResult.ticket.assigneeId).toBe('tech-001');
      expect(assignResult.ticket.history).toHaveLength(1);
      expect(assignResult.ticket.history[0].action).toBe(HistoryActionType.ASSIGNED);
      expect(assignResult.ticket.history[0].newValue).toBe('tech-001');

      // Step 3: Add a comment
      const commentResult = await ticketService.addComment(
        ticket.id,
        { ticketId: ticket.id, authorId: 'tech-001', content: 'Paper jam cleared, testing now.', isInternal: false },
        'tech-001'
      );

      expect(commentResult.success).toBe(true);
      if (!commentResult.success) return;
      expect(commentResult.comment.content).toBe('Paper jam cleared, testing now.');
      expect(commentResult.comment.authorId).toBe('tech-001');
      expect(commentResult.comment.isInternal).toBe(false);

      // Verify comment is on the ticket
      const storedTicket = ticketStore.get(ticket.id)!;
      expect(storedTicket.comments).toHaveLength(1);

      // Step 4: Resolve the ticket
      const resolveResult = await ticketService.changeStatus(
        ticket.id,
        TicketStatus.RESOLVED,
        'tech-001'
      );

      expect(resolveResult.success).toBe(true);
      if (!resolveResult.success) return;
      expect(resolveResult.ticket.status).toBe(TicketStatus.RESOLVED);
      expect(resolveResult.ticket.resolvedAt).toBeDefined();
      // History: 1 assignment + 1 status change = 2
      expect(resolveResult.ticket.history).toHaveLength(2);
      expect(resolveResult.ticket.history[1].action).toBe(HistoryActionType.STATUS_CHANGED);
      expect(resolveResult.ticket.history[1].previousValue).toBe(TicketStatus.IN_PROGRESS);
      expect(resolveResult.ticket.history[1].newValue).toBe(TicketStatus.RESOLVED);

      // Step 5: Close the ticket
      const closeResult = await ticketService.changeStatus(
        ticket.id,
        TicketStatus.CLOSED,
        'admin-001'
      );

      expect(closeResult.success).toBe(true);
      if (!closeResult.success) return;
      expect(closeResult.ticket.status).toBe(TicketStatus.CLOSED);
      // History: 1 assignment + 2 status changes = 3
      expect(closeResult.ticket.history).toHaveLength(3);
      expect(closeResult.ticket.history[2].action).toBe(HistoryActionType.STATUS_CHANGED);
      expect(closeResult.ticket.history[2].previousValue).toBe(TicketStatus.RESOLVED);
      expect(closeResult.ticket.history[2].newValue).toBe(TicketStatus.CLOSED);
    });

    it('should maintain chronological history entries', async () => {
      const ticket = createTicketInStore(ticketStore, {
        priority: Priority.MEDIUM,
        reporterId: 'reporter-001',
      });

      // Perform multiple operations
      await ticketService.assignTicket(ticket.id, 'tech-001', 'admin-001');
      await ticketService.changeStatus(ticket.id, TicketStatus.RESOLVED, 'tech-001');
      await ticketService.changeStatus(ticket.id, TicketStatus.CLOSED, 'admin-001');

      const storedTicket = ticketStore.get(ticket.id)!;
      const history = storedTicket.history;

      // Verify chronological order
      for (let i = 1; i < history.length; i++) {
        expect(history[i].timestamp.getTime()).toBeGreaterThanOrEqual(
          history[i - 1].timestamp.getTime()
        );
      }
    });
  });

  describe('Escalation: Priority Increase', () => {
    it('should escalate a ticket with a past due date and increase priority', async () => {
      // Create a ticket with a due date in the past
      const pastDueDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
      const ticket = createTicketInStore(ticketStore, {
        priority: Priority.MEDIUM,
        status: TicketStatus.IN_PROGRESS,
        dueDate: pastDueDate,
        reporterId: 'reporter-001',
        assigneeId: 'tech-001',
      });

      // Set up queue service with the ticket
      queueService.setTickets([ticketStore.get(ticket.id)!]);

      // Escalate
      const result = await queueService.escalateTicket(ticket.id);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Priority should increase from MEDIUM to HIGH
      expect(result.ticket.priority).toBe(Priority.HIGH);

      // History should record the escalation
      const escalationEntry = result.ticket.history.find(
        (h) => h.action === HistoryActionType.ESCALATED
      );
      expect(escalationEntry).toBeDefined();
      expect(escalationEntry!.previousValue).toBe(Priority.MEDIUM);
      expect(escalationEntry!.newValue).toBe(Priority.HIGH);
      expect(escalationEntry!.userId).toBe('SYSTEM');
      expect(escalationEntry!.reason).toContain('SLA breach');
    });

    it('should escalate a LOW priority ticket to MEDIUM on SLA breach', async () => {
      const pastDueDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      const ticket = createTicketInStore(ticketStore, {
        priority: Priority.LOW,
        status: TicketStatus.NEW,
        dueDate: pastDueDate,
        reporterId: 'reporter-001',
      });

      queueService.setTickets([ticketStore.get(ticket.id)!]);

      const result = await queueService.escalateTicket(ticket.id);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.ticket.priority).toBe(Priority.MEDIUM);
    });

    it('should not increase priority beyond CRITICAL', async () => {
      const pastDueDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const ticket = createTicketInStore(ticketStore, {
        priority: Priority.CRITICAL,
        status: TicketStatus.IN_PROGRESS,
        dueDate: pastDueDate,
        reporterId: 'reporter-001',
        assigneeId: 'tech-001',
      });

      queueService.setTickets([ticketStore.get(ticket.id)!]);

      const result = await queueService.escalateTicket(ticket.id);

      expect(result.success).toBe(true);
      if (!result.success) return;
      // Priority stays CRITICAL
      expect(result.ticket.priority).toBe(Priority.CRITICAL);
      // But escalation is still recorded in history
      const escalationEntry = result.ticket.history.find(
        (h) => h.action === HistoryActionType.ESCALATED
      );
      expect(escalationEntry).toBeDefined();
    });

    it('should not escalate RESOLVED or CLOSED tickets', async () => {
      const pastDueDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const resolvedTicket = createTicketInStore(ticketStore, {
        priority: Priority.MEDIUM,
        status: TicketStatus.RESOLVED,
        dueDate: pastDueDate,
        reporterId: 'reporter-001',
      });

      queueService.setTickets([ticketStore.get(resolvedTicket.id)!]);

      const result = await queueService.escalateTicket(resolvedTicket.id);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toContain('resolved or closed');
    });
  });

  describe('Notifications: Event Delivery', () => {
    it('should create admin notification when ticket is created', async () => {
      const ticket = createTicketInStore(ticketStore, {
        reporterId: 'reporter-001',
      });

      // Simulate ticket creation notification
      const result = await notificationService.notifyTicketCreated(ticket.id);

      expect(result.success).toBe(true);

      // Admin should have a notification
      const adminNotifications = NotificationService.getStore('admin-001');
      expect(adminNotifications.length).toBeGreaterThanOrEqual(1);

      const createdNotification = adminNotifications.find(
        (n) => n.ticketId === ticket.id && n.type === 'TICKET_CREATED'
      );
      expect(createdNotification).toBeDefined();
      expect(createdNotification!.title).toContain('New ticket created');
    });

    it('should create assignee notification when ticket is assigned', async () => {
      const ticket = createTicketInStore(ticketStore, {
        reporterId: 'reporter-001',
      });

      // Assign ticket (this triggers notification internally)
      await ticketService.assignTicket(ticket.id, 'tech-001', 'admin-001');

      // Technician should have a notification
      const techNotifications = NotificationService.getStore('tech-001');
      expect(techNotifications.length).toBeGreaterThanOrEqual(1);

      const assignedNotification = techNotifications.find(
        (n) => n.ticketId === ticket.id && n.type === 'TICKET_ASSIGNED'
      );
      expect(assignedNotification).toBeDefined();
      expect(assignedNotification!.message).toContain(ticket.id);
    });

    it('should deliver notifications for escalation events', async () => {
      const ticket = createTicketInStore(ticketStore, {
        priority: Priority.MEDIUM,
        status: TicketStatus.IN_PROGRESS,
        dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        reporterId: 'reporter-001',
        assigneeId: 'tech-001',
      });

      // Notify escalation directly
      const result = await notificationService.notifyEscalation(
        ticket.id,
        'SLA breach: ticket due date has passed'
      );

      expect(result.success).toBe(true);

      // Admin should have escalation notification
      const adminNotifications = NotificationService.getStore('admin-001');
      const escalationNotification = adminNotifications.find(
        (n) => n.ticketId === ticket.id && n.type === 'TICKET_ESCALATED'
      );
      expect(escalationNotification).toBeDefined();
      expect(escalationNotification!.message).toContain('escalated');
    });
  });

  describe('Permissions: RBAC Enforcement', () => {
    it('reporter cannot assign tickets', async () => {
      const ticket = createTicketInStore(ticketStore, {
        reporterId: 'reporter-001',
      });

      const hasPermission = await userService.hasPermission(
        'reporter-001',
        'assign',
        ticket.id
      );

      expect(hasPermission).toBe(false);
    });

    it('technician cannot assign tickets', async () => {
      const ticket = createTicketInStore(ticketStore, {
        reporterId: 'reporter-001',
        assigneeId: 'tech-001',
      });

      const hasPermission = await userService.hasPermission(
        'tech-001',
        'assign',
        ticket.id
      );

      expect(hasPermission).toBe(false);
    });

    it('admin can assign tickets', async () => {
      const ticket = createTicketInStore(ticketStore, {
        reporterId: 'reporter-001',
      });

      const hasPermission = await userService.hasPermission(
        'admin-001',
        'assign',
        ticket.id
      );

      expect(hasPermission).toBe(true);
    });

    it('admin can perform all operations', async () => {
      const ticket = createTicketInStore(ticketStore, {
        reporterId: 'reporter-001',
      });

      const operations = ['view', 'assign', 'change_status', 'add_comment', 'add_internal_comment', 'close'];

      for (const op of operations) {
        const hasPermission = await userService.hasPermission('admin-001', op, ticket.id);
        expect(hasPermission).toBe(true);
      }
    });

    it('technician can change status on assigned tickets', async () => {
      // Need to set up the ticket lookup for UserService
      // The default UserService uses a ticketLookup function
      const ticketLookupService = new UserService(async (ticketId: string) => {
        const t = ticketStore.get(ticketId);
        if (!t) return null;
        return { reporterId: t.reporterId, assigneeId: t.assigneeId };
      });

      const ticket = createTicketInStore(ticketStore, {
        reporterId: 'reporter-001',
        assigneeId: 'tech-001',
        status: TicketStatus.IN_PROGRESS,
      });

      const hasPermission = await ticketLookupService.hasPermission(
        'tech-001',
        'change_status',
        ticket.id
      );

      expect(hasPermission).toBe(true);
    });

    it('reporter can only view and close own tickets', async () => {
      const ticketLookupService = new UserService(async (ticketId: string) => {
        const t = ticketStore.get(ticketId);
        if (!t) return null;
        return { reporterId: t.reporterId, assigneeId: t.assigneeId };
      });

      const ticket = createTicketInStore(ticketStore, {
        reporterId: 'reporter-001',
      });

      // Can view own ticket
      expect(
        await ticketLookupService.hasPermission('reporter-001', 'view', ticket.id)
      ).toBe(true);

      // Can close own ticket
      expect(
        await ticketLookupService.hasPermission('reporter-001', 'close', ticket.id)
      ).toBe(true);

      // Can add comment to own ticket
      expect(
        await ticketLookupService.hasPermission('reporter-001', 'add_comment', ticket.id)
      ).toBe(true);

      // Cannot add internal comment
      expect(
        await ticketLookupService.hasPermission('reporter-001', 'add_internal_comment', ticket.id)
      ).toBe(false);

      // Cannot assign
      expect(
        await ticketLookupService.hasPermission('reporter-001', 'assign', ticket.id)
      ).toBe(false);

      // Cannot change status
      expect(
        await ticketLookupService.hasPermission('reporter-001', 'change_status', ticket.id)
      ).toBe(false);
    });

    it('reporter cannot view tickets owned by others', async () => {
      const ticketLookupService = new UserService(async (ticketId: string) => {
        const t = ticketStore.get(ticketId);
        if (!t) return null;
        return { reporterId: t.reporterId, assigneeId: t.assigneeId };
      });

      const ticket = createTicketInStore(ticketStore, {
        reporterId: 'other-reporter',
      });

      const hasPermission = await ticketLookupService.hasPermission(
        'reporter-001',
        'view',
        ticket.id
      );

      expect(hasPermission).toBe(false);
    });
  });
});
