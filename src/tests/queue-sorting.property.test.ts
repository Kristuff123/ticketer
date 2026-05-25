import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { sortTickets } from '../services/queue-service.js';
import { Priority, TicketCategory, TicketStatus } from '../models/enums.js';
import { Ticket } from '../models/ticket.js';

/**
 * Property 7: Queue Sorting Correctness
 * Validates: Requirements 4.3, 4.4
 *
 * For any set of tickets in the queue:
 * - Sorting by priority shall produce the order CRITICAL > HIGH > MEDIUM > LOW
 * - Sorting by date fields shall produce results in the specified ascending or descending order
 */

const PRIORITY_ORDER: Record<Priority, number> = {
  [Priority.CRITICAL]: 0,
  [Priority.HIGH]: 1,
  [Priority.MEDIUM]: 2,
  [Priority.LOW]: 3,
};

const priorityArb = fc.constantFrom(
  Priority.CRITICAL,
  Priority.HIGH,
  Priority.MEDIUM,
  Priority.LOW
);

const statusArb = fc.constantFrom(
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

const validDateArb = fc.date({
  min: new Date('2020-01-01T00:00:00.000Z'),
  max: new Date('2030-01-01T00:00:00.000Z'),
  noInvalidDate: true,
});

function ticketArb(): fc.Arbitrary<Ticket> {
  return fc.record({
    id: fc.uuid(),
    title: fc.string({ minLength: 1, maxLength: 50 }),
    description: fc.string({ minLength: 1, maxLength: 100 }),
    category: categoryArb,
    priority: priorityArb,
    status: statusArb,
    reporterId: fc.uuid(),
    assigneeId: fc.option(fc.uuid(), { nil: undefined }),
    createdAt: validDateArb,
    updatedAt: validDateArb,
    resolvedAt: fc.constant(undefined),
    dueDate: fc.option(validDateArb, { nil: undefined }),
    comments: fc.constant([]),
    history: fc.constant([]),
  });
}

const ticketArrayArb = fc.array(ticketArb(), { minLength: 0, maxLength: 30 });

describe('Property 7: Queue Sorting Correctness', () => {
  it('sorting by priority produces CRITICAL > HIGH > MEDIUM > LOW order (DESC)', () => {
    /**
     * Validates: Requirements 4.3, 4.4
     */
    fc.assert(
      fc.property(ticketArrayArb, (tickets) => {
        const sorted = sortTickets(tickets, 'priority');

        for (let i = 1; i < sorted.length; i++) {
          const prevOrder = PRIORITY_ORDER[sorted[i - 1].priority];
          const currOrder = PRIORITY_ORDER[sorted[i].priority];
          expect(prevOrder).toBeLessThanOrEqual(currOrder);
        }
      })
    );
  });

  it('sorting by createdAt produces chronological order (ASC default)', () => {
    /**
     * Validates: Requirements 4.3, 4.4
     */
    fc.assert(
      fc.property(ticketArrayArb, (tickets) => {
        const sorted = sortTickets(tickets, 'createdAt');

        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i - 1].createdAt.getTime()).toBeLessThanOrEqual(
            sorted[i].createdAt.getTime()
          );
        }
      })
    );
  });

  it('sorting by dueDate produces chronological order (ASC default)', () => {
    /**
     * Validates: Requirements 4.3, 4.4
     */
    fc.assert(
      fc.property(ticketArrayArb, (tickets) => {
        const sorted = sortTickets(tickets, 'dueDate');

        for (let i = 1; i < sorted.length; i++) {
          const prevTime = sorted[i - 1].dueDate
            ? sorted[i - 1].dueDate!.getTime()
            : Number.MAX_SAFE_INTEGER;
          const currTime = sorted[i].dueDate
            ? sorted[i].dueDate!.getTime()
            : Number.MAX_SAFE_INTEGER;
          expect(prevTime).toBeLessThanOrEqual(currTime);
        }
      })
    );
  });

  it('explicit sort direction overrides defaults', () => {
    /**
     * Validates: Requirements 4.3, 4.4
     */
    fc.assert(
      fc.property(ticketArrayArb, (tickets) => {
        // Priority ASC should produce LOW > MEDIUM > HIGH > CRITICAL
        const sortedPriorityAsc = sortTickets(tickets, 'priority', 'asc');
        for (let i = 1; i < sortedPriorityAsc.length; i++) {
          const prevOrder = PRIORITY_ORDER[sortedPriorityAsc[i - 1].priority];
          const currOrder = PRIORITY_ORDER[sortedPriorityAsc[i].priority];
          expect(prevOrder).toBeGreaterThanOrEqual(currOrder);
        }

        // createdAt DESC should produce reverse chronological order
        const sortedDateDesc = sortTickets(tickets, 'createdAt', 'desc');
        for (let i = 1; i < sortedDateDesc.length; i++) {
          expect(sortedDateDesc[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(
            sortedDateDesc[i].createdAt.getTime()
          );
        }

        // dueDate DESC should produce reverse chronological order
        const sortedDueDateDesc = sortTickets(tickets, 'dueDate', 'desc');
        for (let i = 1; i < sortedDueDateDesc.length; i++) {
          const prevTime = sortedDueDateDesc[i - 1].dueDate
            ? sortedDueDateDesc[i - 1].dueDate!.getTime()
            : Number.MAX_SAFE_INTEGER;
          const currTime = sortedDueDateDesc[i].dueDate
            ? sortedDueDateDesc[i].dueDate!.getTime()
            : Number.MAX_SAFE_INTEGER;
          expect(prevTime).toBeGreaterThanOrEqual(currTime);
        }
      })
    );
  });
});
