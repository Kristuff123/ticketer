import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { QueueService, getNextPriority } from '../services/queue-service.js';
import { Ticket } from '../models/ticket.js';
import { Priority, TicketStatus, TicketCategory, HistoryActionType } from '../models/enums.js';
import crypto from 'node:crypto';

/**
 * Property 9: Escalation Trigger Conditions
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4
 *
 * For any ticket that has passed its due date, or has had no activity for 48 hours,
 * or has HIGH/CRITICAL priority with no assignee for >1h, the escalation function
 * shall increase the ticket's priority and record the escalation reason.
 */
describe('Property 9: Escalation Trigger Conditions', () => {
  const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
  const ONE_HOUR_MS = 60 * 60 * 1000;

  const priorityArb = fc.constantFrom(
    Priority.LOW,
    Priority.MEDIUM,
    Priority.HIGH,
    Priority.CRITICAL
  );

  const escalatableStatusArb = fc.constantFrom(
    TicketStatus.NEW,
    TicketStatus.IN_PROGRESS,
    TicketStatus.WAITING_FOR_INFO,
    TicketStatus.REOPENED
  );

  const categoryArb = fc.constantFrom(
    TicketCategory.HARDWARE,
    TicketCategory.SOFTWARE,
    TicketCategory.NETWORK,
    TicketCategory.ACCESS,
    TicketCategory.OTHER
  );

  function makeTicket(overrides: Partial<Ticket>): Ticket {
    const now = new Date();
    return {
      id: crypto.randomUUID(),
      title: 'Test Ticket',
      description: 'Test description',
      category: TicketCategory.SOFTWARE,
      priority: Priority.MEDIUM,
      status: TicketStatus.NEW,
      reporterId: 'reporter-1',
      createdAt: now,
      updatedAt: now,
      comments: [],
      history: [],
      ...overrides,
    };
  }

  it('tickets with dueDate in the past should be escalated (SLA breach)', async () => {
    /**
     * Validates: Requirements 5.1, 5.2
     */
    await fc.assert(
      fc.asyncProperty(
        priorityArb,
        escalatableStatusArb,
        categoryArb,
        fc.integer({ min: 1, max: 72 }), // hours past due
        async (priority, status, category, hoursPastDue) => {
          const now = new Date();
          const pastDueDate = new Date(now.getTime() - hoursPastDue * 60 * 60 * 1000);
          const recentUpdate = new Date(now.getTime() - 1000); // updated 1 second ago (no inactivity)

          const ticket = makeTicket({
            priority,
            status,
            category,
            dueDate: pastDueDate,
            updatedAt: recentUpdate,
            createdAt: recentUpdate,
            assigneeId: 'tech-1', // assigned so no unassigned condition
          });

          const service = new QueueService([ticket]);
          const result = await service.escalateTicket(ticket.id);

          expect(result.success).toBe(true);
          if (result.success) {
            // Priority should increase unless already CRITICAL
            if (priority === Priority.CRITICAL) {
              expect(result.ticket.priority).toBe(Priority.CRITICAL);
            } else {
              expect(result.ticket.priority).toBe(getNextPriority(priority));
            }
            // History should record escalation
            const escalationEntry = result.ticket.history.find(
              (h) => h.action === HistoryActionType.ESCALATED
            );
            expect(escalationEntry).toBeDefined();
            expect(escalationEntry!.reason).toContain('SLA breach');
          }
        }
      )
    );
  });

  it('tickets with updatedAt > 48 hours ago should be escalated (inactivity)', async () => {
    /**
     * Validates: Requirements 5.1, 5.3
     */
    await fc.assert(
      fc.asyncProperty(
        priorityArb,
        escalatableStatusArb,
        categoryArb,
        fc.integer({ min: 1, max: 168 }), // extra hours beyond 48
        async (priority, status, category, extraHours) => {
          const now = new Date();
          const staleUpdate = new Date(now.getTime() - FORTY_EIGHT_HOURS_MS - extraHours * 60 * 60 * 1000);
          // No dueDate so SLA breach won't trigger
          // Assign the ticket so unassigned condition won't trigger
          const ticket = makeTicket({
            priority,
            status,
            category,
            updatedAt: staleUpdate,
            createdAt: staleUpdate,
            assigneeId: 'tech-1',
          });

          const service = new QueueService([ticket]);
          const result = await service.escalateTicket(ticket.id);

          expect(result.success).toBe(true);
          if (result.success) {
            if (priority === Priority.CRITICAL) {
              expect(result.ticket.priority).toBe(Priority.CRITICAL);
            } else {
              expect(result.ticket.priority).toBe(getNextPriority(priority));
            }
            const escalationEntry = result.ticket.history.find(
              (h) => h.action === HistoryActionType.ESCALATED
            );
            expect(escalationEntry).toBeDefined();
            expect(escalationEntry!.reason).toContain('Inactivity');
          }
        }
      )
    );
  });

  it('HIGH/CRITICAL tickets with no assignee and createdAt > 1 hour ago should be escalated', async () => {
    /**
     * Validates: Requirements 5.1, 5.3
     */
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(Priority.HIGH, Priority.CRITICAL),
        escalatableStatusArb,
        categoryArb,
        fc.integer({ min: 1, max: 48 }), // extra hours beyond 1
        async (priority, status, category, extraHours) => {
          const now = new Date();
          const createdLongAgo = new Date(now.getTime() - ONE_HOUR_MS - extraHours * 60 * 60 * 1000);
          // Recent update so inactivity won't trigger, no dueDate so SLA won't trigger
          const recentUpdate = new Date(now.getTime() - 1000);

          const ticket = makeTicket({
            priority,
            status,
            category,
            createdAt: createdLongAgo,
            updatedAt: recentUpdate,
            // No assigneeId - unassigned
          });

          const service = new QueueService([ticket]);
          const result = await service.escalateTicket(ticket.id);

          expect(result.success).toBe(true);
          if (result.success) {
            if (priority === Priority.CRITICAL) {
              expect(result.ticket.priority).toBe(Priority.CRITICAL);
            } else {
              expect(result.ticket.priority).toBe(getNextPriority(priority));
            }
            const escalationEntry = result.ticket.history.find(
              (h) => h.action === HistoryActionType.ESCALATED
            );
            expect(escalationEntry).toBeDefined();
            expect(escalationEntry!.reason).toContain('Unassigned high priority');
          }
        }
      )
    );
  });

  it('after escalation, priority increases by one level (unless already CRITICAL)', async () => {
    /**
     * Validates: Requirements 5.2, 5.4
     */
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(Priority.LOW, Priority.MEDIUM, Priority.HIGH),
        escalatableStatusArb,
        async (priority, status) => {
          const now = new Date();
          // Use SLA breach as the trigger
          const pastDueDate = new Date(now.getTime() - 2 * 60 * 60 * 1000);
          const recentUpdate = new Date(now.getTime() - 1000);

          const ticket = makeTicket({
            priority,
            status,
            dueDate: pastDueDate,
            updatedAt: recentUpdate,
            createdAt: recentUpdate,
            assigneeId: 'tech-1',
          });

          const expectedPriority = getNextPriority(priority);
          const service = new QueueService([ticket]);
          const result = await service.escalateTicket(ticket.id);

          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.ticket.priority).toBe(expectedPriority);
            // Verify it's exactly one level up
            expect(result.ticket.priority).not.toBe(priority);
          }
        }
      )
    );
  });

  it('CRITICAL tickets still get escalation recorded but priority stays CRITICAL', async () => {
    /**
     * Validates: Requirements 5.2, 5.4
     */
    await fc.assert(
      fc.asyncProperty(
        escalatableStatusArb,
        categoryArb,
        fc.integer({ min: 1, max: 72 }),
        async (status, category, hoursPastDue) => {
          const now = new Date();
          const pastDueDate = new Date(now.getTime() - hoursPastDue * 60 * 60 * 1000);
          const recentUpdate = new Date(now.getTime() - 1000);

          const ticket = makeTicket({
            priority: Priority.CRITICAL,
            status,
            category,
            dueDate: pastDueDate,
            updatedAt: recentUpdate,
            createdAt: recentUpdate,
            assigneeId: 'tech-1',
          });

          const service = new QueueService([ticket]);
          const result = await service.escalateTicket(ticket.id);

          expect(result.success).toBe(true);
          if (result.success) {
            // Priority stays CRITICAL
            expect(result.ticket.priority).toBe(Priority.CRITICAL);
            // But escalation is still recorded
            const escalationEntry = result.ticket.history.find(
              (h) => h.action === HistoryActionType.ESCALATED
            );
            expect(escalationEntry).toBeDefined();
            expect(escalationEntry!.reason).toBeDefined();
            expect(escalationEntry!.reason!.length).toBeGreaterThan(0);
          }
        }
      )
    );
  });

  it('RESOLVED/CLOSED tickets should NOT be escalated', async () => {
    /**
     * Validates: Requirements 5.1
     */
    await fc.assert(
      fc.asyncProperty(
        priorityArb,
        fc.constantFrom(TicketStatus.RESOLVED, TicketStatus.CLOSED),
        categoryArb,
        fc.integer({ min: 1, max: 72 }),
        async (priority, status, category, hoursPastDue) => {
          const now = new Date();
          const pastDueDate = new Date(now.getTime() - hoursPastDue * 60 * 60 * 1000);
          const staleUpdate = new Date(now.getTime() - FORTY_EIGHT_HOURS_MS - 1000);

          const ticket = makeTicket({
            priority,
            status,
            category,
            dueDate: pastDueDate,
            updatedAt: staleUpdate,
            createdAt: staleUpdate,
          });

          const service = new QueueService([ticket]);
          const result = await service.escalateTicket(ticket.id);

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toContain('resolved or closed');
          }
        }
      )
    );
  });
});
