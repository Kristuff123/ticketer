import { describe, it, expect } from 'vitest';
import { QueueService, sortTickets } from './queue-service.js';
import { Ticket } from '../models/ticket.js';
import { Priority, TicketStatus, TicketCategory } from '../models/enums.js';

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'test-id',
    title: 'Test Ticket',
    description: 'Test description',
    category: TicketCategory.SOFTWARE,
    priority: Priority.MEDIUM,
    status: TicketStatus.NEW,
    reporterId: 'reporter-1',
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
    comments: [],
    history: [],
    ...overrides,
  };
}

describe('sortTickets', () => {
  describe('default sorting (no sortBy)', () => {
    it('sorts by priority DESC then createdAt ASC', () => {
      const tickets: Ticket[] = [
        makeTicket({ id: '1', priority: Priority.LOW, createdAt: new Date('2024-01-01') }),
        makeTicket({ id: '2', priority: Priority.CRITICAL, createdAt: new Date('2024-01-03') }),
        makeTicket({ id: '3', priority: Priority.HIGH, createdAt: new Date('2024-01-02') }),
        makeTicket({ id: '4', priority: Priority.CRITICAL, createdAt: new Date('2024-01-01') }),
      ];

      const result = sortTickets(tickets);

      expect(result.map((t) => t.id)).toEqual(['4', '2', '3', '1']);
    });

    it('returns empty array for empty input', () => {
      expect(sortTickets([])).toEqual([]);
    });

    it('does not mutate the original array', () => {
      const tickets: Ticket[] = [
        makeTicket({ id: '1', priority: Priority.LOW }),
        makeTicket({ id: '2', priority: Priority.CRITICAL }),
      ];
      const original = [...tickets];
      sortTickets(tickets);
      expect(tickets).toEqual(original);
    });
  });

  describe('sort by priority', () => {
    it('defaults to DESC (CRITICAL first)', () => {
      const tickets: Ticket[] = [
        makeTicket({ id: '1', priority: Priority.LOW }),
        makeTicket({ id: '2', priority: Priority.HIGH }),
        makeTicket({ id: '3', priority: Priority.CRITICAL }),
        makeTicket({ id: '4', priority: Priority.MEDIUM }),
      ];

      const result = sortTickets(tickets, 'priority');

      expect(result.map((t) => t.priority)).toEqual([
        Priority.CRITICAL,
        Priority.HIGH,
        Priority.MEDIUM,
        Priority.LOW,
      ]);
    });

    it('supports explicit ASC (LOW first)', () => {
      const tickets: Ticket[] = [
        makeTicket({ id: '1', priority: Priority.CRITICAL }),
        makeTicket({ id: '2', priority: Priority.LOW }),
        makeTicket({ id: '3', priority: Priority.HIGH }),
      ];

      const result = sortTickets(tickets, 'priority', 'asc');

      expect(result.map((t) => t.priority)).toEqual([
        Priority.LOW,
        Priority.HIGH,
        Priority.CRITICAL,
      ]);
    });
  });

  describe('sort by createdAt', () => {
    it('defaults to ASC (oldest first)', () => {
      const tickets: Ticket[] = [
        makeTicket({ id: '1', createdAt: new Date('2024-03-01') }),
        makeTicket({ id: '2', createdAt: new Date('2024-01-01') }),
        makeTicket({ id: '3', createdAt: new Date('2024-02-01') }),
      ];

      const result = sortTickets(tickets, 'createdAt');

      expect(result.map((t) => t.id)).toEqual(['2', '3', '1']);
    });

    it('supports explicit DESC (newest first)', () => {
      const tickets: Ticket[] = [
        makeTicket({ id: '1', createdAt: new Date('2024-01-01') }),
        makeTicket({ id: '2', createdAt: new Date('2024-03-01') }),
        makeTicket({ id: '3', createdAt: new Date('2024-02-01') }),
      ];

      const result = sortTickets(tickets, 'createdAt', 'desc');

      expect(result.map((t) => t.id)).toEqual(['2', '3', '1']);
    });
  });

  describe('sort by dueDate', () => {
    it('defaults to ASC (soonest first)', () => {
      const tickets: Ticket[] = [
        makeTicket({ id: '1', dueDate: new Date('2024-03-01') }),
        makeTicket({ id: '2', dueDate: new Date('2024-01-01') }),
        makeTicket({ id: '3', dueDate: new Date('2024-02-01') }),
      ];

      const result = sortTickets(tickets, 'dueDate');

      expect(result.map((t) => t.id)).toEqual(['2', '3', '1']);
    });

    it('supports explicit DESC (latest first)', () => {
      const tickets: Ticket[] = [
        makeTicket({ id: '1', dueDate: new Date('2024-01-01') }),
        makeTicket({ id: '2', dueDate: new Date('2024-03-01') }),
        makeTicket({ id: '3', dueDate: new Date('2024-02-01') }),
      ];

      const result = sortTickets(tickets, 'dueDate', 'desc');

      expect(result.map((t) => t.id)).toEqual(['2', '3', '1']);
    });

    it('places tickets without dueDate at the end when ASC', () => {
      const tickets: Ticket[] = [
        makeTicket({ id: '1', dueDate: undefined }),
        makeTicket({ id: '2', dueDate: new Date('2024-01-01') }),
        makeTicket({ id: '3', dueDate: new Date('2024-02-01') }),
      ];

      const result = sortTickets(tickets, 'dueDate');

      expect(result.map((t) => t.id)).toEqual(['2', '3', '1']);
    });
  });

  describe('sort by updatedAt', () => {
    it('defaults to DESC (most recently updated first)', () => {
      const tickets: Ticket[] = [
        makeTicket({ id: '1', updatedAt: new Date('2024-01-01') }),
        makeTicket({ id: '2', updatedAt: new Date('2024-03-01') }),
        makeTicket({ id: '3', updatedAt: new Date('2024-02-01') }),
      ];

      const result = sortTickets(tickets, 'updatedAt');

      expect(result.map((t) => t.id)).toEqual(['2', '3', '1']);
    });
  });
});

describe('QueueService statistics', () => {
  it('returns dashboard totals and grouped counts', async () => {
    const tickets: Ticket[] = [
      makeTicket({ id: '1', priority: Priority.HIGH, status: TicketStatus.NEW }),
      makeTicket({ id: '2', priority: Priority.HIGH, status: TicketStatus.RESOLVED, resolvedAt: new Date() }),
      makeTicket({ id: '3', priority: Priority.LOW, status: TicketStatus.CLOSED, resolvedAt: new Date() }),
    ];
    const service = new QueueService(tickets);

    const stats = await service.getQueueStatistics();

    expect(stats.totalTickets).toBe(3);
    expect(stats.openTickets).toBe(1);
    expect(stats.resolvedTickets).toBe(2);
    expect(stats.byPriority[Priority.HIGH]).toBe(2);
    expect(stats.byStatus[TicketStatus.CLOSED]).toBe(1);
  });
});
