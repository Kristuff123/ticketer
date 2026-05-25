import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { TicketStatus, TicketCategory, Priority } from '../models/enums';
import { Ticket } from '../models/ticket';
import { QueueFilters } from '../models/queue';
import { QueueService } from '../services/queue-service';

/**
 * Property 6: Queue Filtering Invariant
 *
 * For any set of tickets and any filter criteria applied to the queue,
 * all returned tickets shall match the filter criteria, and no ticket
 * with status RESOLVED or CLOSED shall appear in the pending queue results.
 *
 * **Validates: Requirements 4.1, 4.2**
 */

// Arbitraries
const priorityArb = fc.constantFrom(...Object.values(Priority));
const categoryArb = fc.constantFrom(...Object.values(TicketCategory));
const statusArb = fc.constantFrom(...Object.values(TicketStatus));
const assigneeIdArb = fc.constantFrom('tech-1', 'tech-2', 'tech-3', 'admin-1', undefined);

// Generate a random ticket
const ticketArb = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 50 }),
  description: fc.string({ minLength: 1, maxLength: 100 }),
  category: categoryArb,
  priority: priorityArb,
  status: statusArb,
  reporterId: fc.constantFrom('reporter-1', 'reporter-2', 'reporter-3'),
  assigneeId: assigneeIdArb,
  createdAt: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
  updatedAt: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
  comments: fc.constant([]),
  history: fc.constant([]),
}) as fc.Arbitrary<Ticket>;

// Generate a random set of tickets (1 to 30)
const ticketSetArb = fc.array(ticketArb, { minLength: 1, maxLength: 30 });

// Generate random filter criteria (each filter is optional)
const filtersArb = fc.record({
  priority: fc.option(priorityArb, { nil: undefined }),
  category: fc.option(categoryArb, { nil: undefined }),
  assigneeId: fc.option(
    fc.constantFrom('tech-1', 'tech-2', 'tech-3', 'admin-1'),
    { nil: undefined }
  ),
});

describe('Property 6: Queue Filtering Invariant', () => {
  it('all returned tickets match ALL specified filter criteria (AND logic)', async () => {
    await fc.assert(
      fc.asyncProperty(
        ticketSetArb,
        filtersArb,
        async (tickets, filterCriteria) => {
          const queueService = new QueueService(tickets);

          const filters: QueueFilters = {
            ...filterCriteria,
            page: 1,
            pageSize: 100, // Large page to get all results
          };

          const result = await queueService.getPendingTickets(filters);

          // Verify all returned tickets match ALL specified filters
          for (const ticket of result.tickets) {
            if (filters.priority !== undefined) {
              expect(ticket.priority).toBe(filters.priority);
            }
            if (filters.category !== undefined) {
              expect(ticket.category).toBe(filters.category);
            }
            if (filters.assigneeId !== undefined) {
              expect(ticket.assigneeId).toBe(filters.assigneeId);
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('no returned ticket has status RESOLVED or CLOSED', async () => {
    await fc.assert(
      fc.asyncProperty(
        ticketSetArb,
        filtersArb,
        async (tickets, filterCriteria) => {
          const queueService = new QueueService(tickets);

          const filters: QueueFilters = {
            ...filterCriteria,
            page: 1,
            pageSize: 100,
          };

          const result = await queueService.getPendingTickets(filters);

          // Verify no returned ticket has RESOLVED or CLOSED status
          for (const ticket of result.tickets) {
            expect(ticket.status).not.toBe(TicketStatus.RESOLVED);
            expect(ticket.status).not.toBe(TicketStatus.CLOSED);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('totalCount matches the number of tickets matching all filters', async () => {
    await fc.assert(
      fc.asyncProperty(
        ticketSetArb,
        filtersArb,
        async (tickets, filterCriteria) => {
          const queueService = new QueueService(tickets);

          const filters: QueueFilters = {
            ...filterCriteria,
            page: 1,
            pageSize: 100, // Large enough to get all results in one page
          };

          const result = await queueService.getPendingTickets(filters);

          // Manually compute expected count
          let expected = tickets.filter(
            (t) => t.status !== TicketStatus.RESOLVED && t.status !== TicketStatus.CLOSED
          );
          if (filters.priority !== undefined) {
            expected = expected.filter((t) => t.priority === filters.priority);
          }
          if (filters.category !== undefined) {
            expected = expected.filter((t) => t.category === filters.category);
          }
          if (filters.assigneeId !== undefined) {
            expected = expected.filter((t) => t.assigneeId === filters.assigneeId);
          }

          expect(result.totalCount).toBe(expected.length);
          expect(result.tickets.length).toBe(expected.length);
        }
      ),
      { numRuns: 200 }
    );
  });
});
