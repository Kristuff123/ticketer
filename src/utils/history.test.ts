import { describe, it, expect } from 'vitest';
import { HistoryActionType } from '../models';
import { createHistoryEntry, getTicketHistory } from './history';

describe('createHistoryEntry', () => {
  it('creates a valid history entry with all required fields', () => {
    const entry = createHistoryEntry({
      ticketId: 'ticket-1',
      action: HistoryActionType.STATUS_CHANGED,
      previousValue: 'NEW',
      newValue: 'IN_PROGRESS',
      userId: 'user-1',
    });

    expect(entry.id).toBeDefined();
    expect(entry.ticketId).toBe('ticket-1');
    expect(entry.action).toBe(HistoryActionType.STATUS_CHANGED);
    expect(entry.previousValue).toBe('NEW');
    expect(entry.newValue).toBe('IN_PROGRESS');
    expect(entry.userId).toBe('user-1');
    expect(entry.timestamp).toBeInstanceOf(Date);
    expect(entry.reason).toBeUndefined();
  });

  it('includes reason when provided', () => {
    const entry = createHistoryEntry({
      ticketId: 'ticket-1',
      action: HistoryActionType.ESCALATED,
      previousValue: 'MEDIUM',
      newValue: 'HIGH',
      userId: 'SYSTEM',
      reason: 'SLA breach',
    });

    expect(entry.reason).toBe('SLA breach');
    expect(entry.userId).toBe('SYSTEM');
  });

  it('throws when action is empty', () => {
    expect(() =>
      createHistoryEntry({
        ticketId: 'ticket-1',
        action: '' as HistoryActionType,
        previousValue: 'NEW',
        newValue: 'IN_PROGRESS',
        userId: 'user-1',
      })
    ).toThrow('History entry action type must not be null or empty');
  });

  it('throws when userId is empty', () => {
    expect(() =>
      createHistoryEntry({
        ticketId: 'ticket-1',
        action: HistoryActionType.ASSIGNED,
        previousValue: '',
        newValue: 'user-2',
        userId: '',
      })
    ).toThrow('History entry userId must not be null or empty');
  });

  it('generates unique ids for each entry', () => {
    const entry1 = createHistoryEntry({
      ticketId: 'ticket-1',
      action: HistoryActionType.STATUS_CHANGED,
      previousValue: 'NEW',
      newValue: 'IN_PROGRESS',
      userId: 'user-1',
    });
    const entry2 = createHistoryEntry({
      ticketId: 'ticket-1',
      action: HistoryActionType.STATUS_CHANGED,
      previousValue: 'IN_PROGRESS',
      newValue: 'RESOLVED',
      userId: 'user-1',
    });

    expect(entry1.id).not.toBe(entry2.id);
  });

  it('supports all action types', () => {
    const actions = [
      HistoryActionType.STATUS_CHANGED,
      HistoryActionType.ASSIGNED,
      HistoryActionType.ESCALATED,
      HistoryActionType.PRIORITY_CHANGED,
    ];

    for (const action of actions) {
      const entry = createHistoryEntry({
        ticketId: 'ticket-1',
        action,
        previousValue: 'old',
        newValue: 'new',
        userId: 'user-1',
      });
      expect(entry.action).toBe(action);
    }
  });
});

describe('getTicketHistory', () => {
  it('returns entries sorted by timestamp ascending', () => {
    const entries = [
      {
        id: '3',
        ticketId: 'ticket-1',
        action: HistoryActionType.ESCALATED,
        previousValue: 'MEDIUM',
        newValue: 'HIGH',
        userId: 'SYSTEM',
        timestamp: new Date('2024-01-03T00:00:00Z'),
      },
      {
        id: '1',
        ticketId: 'ticket-1',
        action: HistoryActionType.STATUS_CHANGED,
        previousValue: 'NEW',
        newValue: 'IN_PROGRESS',
        userId: 'user-1',
        timestamp: new Date('2024-01-01T00:00:00Z'),
      },
      {
        id: '2',
        ticketId: 'ticket-1',
        action: HistoryActionType.ASSIGNED,
        previousValue: '',
        newValue: 'user-2',
        userId: 'admin-1',
        timestamp: new Date('2024-01-02T00:00:00Z'),
      },
    ];

    const sorted = getTicketHistory(entries);

    expect(sorted[0].id).toBe('1');
    expect(sorted[1].id).toBe('2');
    expect(sorted[2].id).toBe('3');
  });

  it('returns empty array for empty input', () => {
    expect(getTicketHistory([])).toEqual([]);
  });

  it('does not mutate the original array', () => {
    const entries = [
      {
        id: '2',
        ticketId: 'ticket-1',
        action: HistoryActionType.ASSIGNED,
        previousValue: '',
        newValue: 'user-2',
        userId: 'admin-1',
        timestamp: new Date('2024-01-02T00:00:00Z'),
      },
      {
        id: '1',
        ticketId: 'ticket-1',
        action: HistoryActionType.STATUS_CHANGED,
        previousValue: 'NEW',
        newValue: 'IN_PROGRESS',
        userId: 'user-1',
        timestamp: new Date('2024-01-01T00:00:00Z'),
      },
    ];

    getTicketHistory(entries);

    // Original array should remain unchanged
    expect(entries[0].id).toBe('2');
    expect(entries[1].id).toBe('1');
  });
});
