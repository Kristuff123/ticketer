import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { HistoryActionType } from '../models/index.js';
import { createHistoryEntry, getTicketHistory } from '../utils/history.js';

/**
 * Property 5: History Audit Trail Integrity
 *
 * For any ticket, after any modification, a history entry shall be created containing
 * a non-null action type, non-null user reference, non-null timestamp not in the future,
 * and the previous and new values. All history entries for a ticket shall be in
 * chronological order.
 *
 * **Validates: Requirements 2.4, 3.4, 5.4, 10.1, 10.2, 10.3, 10.4**
 */

const allActions = Object.values(HistoryActionType);
const actionArb = fc.constantFrom(...allActions);
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 50 });
const ticketIdArb = fc.uuid();
const userIdArb = fc.string({ minLength: 1, maxLength: 36 });

const validHistoryParamsArb = fc.record({
  ticketId: ticketIdArb,
  action: actionArb,
  previousValue: fc.string({ minLength: 0, maxLength: 100 }),
  newValue: fc.string({ minLength: 0, maxLength: 100 }),
  userId: userIdArb,
});

describe('Property 5: History Audit Trail Integrity', () => {
  it('createHistoryEntry produces an entry with non-null id, action, userId, and timestamp for any valid params', () => {
    fc.assert(
      fc.property(validHistoryParamsArb, (params) => {
        const entry = createHistoryEntry(params);

        // id must be non-null and non-empty
        expect(entry.id).toBeDefined();
        expect(entry.id).not.toBe('');
        expect(typeof entry.id).toBe('string');

        // action must be non-null
        expect(entry.action).toBeDefined();
        expect(entry.action).not.toBe('');
        expect(entry.action).toBe(params.action);

        // userId must be non-null
        expect(entry.userId).toBeDefined();
        expect(entry.userId).not.toBe('');
        expect(entry.userId).toBe(params.userId);

        // timestamp must be non-null and a Date
        expect(entry.timestamp).toBeDefined();
        expect(entry.timestamp).toBeInstanceOf(Date);

        // previous and new values are preserved
        expect(entry.previousValue).toBe(params.previousValue);
        expect(entry.newValue).toBe(params.newValue);
      }),
      { numRuns: 200 }
    );
  });

  it('timestamp is never in the future (within reasonable tolerance)', () => {
    fc.assert(
      fc.property(validHistoryParamsArb, (params) => {
        const entry = createHistoryEntry(params);
        const now = new Date();
        // Allow 1 second tolerance for execution time
        const tolerance = 1000;

        expect(entry.timestamp.getTime()).toBeLessThanOrEqual(now.getTime() + tolerance);
      }),
      { numRuns: 200 }
    );
  });

  it('getTicketHistory always returns entries sorted by timestamp ascending', () => {
    // Generate arrays of history entries with random timestamps
    // Use integer-based date generation to avoid NaN dates from fc.date shrinking
    const validDateArb = fc.integer({
      min: new Date('2020-01-01').getTime(),
      max: new Date('2030-01-01').getTime(),
    }).map((ms) => new Date(ms));

    const historyEntryArb = fc.record({
      id: fc.uuid(),
      ticketId: fc.constant('ticket-1'),
      action: actionArb,
      previousValue: fc.string({ minLength: 0, maxLength: 50 }),
      newValue: fc.string({ minLength: 0, maxLength: 50 }),
      userId: userIdArb,
      timestamp: validDateArb,
    });

    const historyArrayArb = fc.array(historyEntryArb, { minLength: 0, maxLength: 30 });

    fc.assert(
      fc.property(historyArrayArb, (entries) => {
        const sorted = getTicketHistory(entries);

        // Result length must equal input length
        expect(sorted.length).toBe(entries.length);

        // Verify chronological order: each entry's timestamp <= next entry's timestamp
        for (let i = 0; i < sorted.length - 1; i++) {
          expect(sorted[i].timestamp.getTime()).toBeLessThanOrEqual(
            sorted[i + 1].timestamp.getTime()
          );
        }
      }),
      { numRuns: 300 }
    );
  });

  it('after multiple modifications, history length equals number of modifications', () => {
    // Generate a random number of modifications to simulate
    const modificationCountArb = fc.integer({ min: 1, max: 20 });

    fc.assert(
      fc.property(modificationCountArb, ticketIdArb, userIdArb, (count, ticketId, userId) => {
        const history = [];

        for (let i = 0; i < count; i++) {
          const entry = createHistoryEntry({
            ticketId,
            action: allActions[i % allActions.length],
            previousValue: `value-${i}`,
            newValue: `value-${i + 1}`,
            userId,
          });
          history.push(entry);
        }

        // History length must equal number of modifications
        expect(history.length).toBe(count);

        // All entries should have the same ticketId
        for (const entry of history) {
          expect(entry.ticketId).toBe(ticketId);
        }

        // getTicketHistory should return all entries sorted
        const sorted = getTicketHistory(history);
        expect(sorted.length).toBe(count);

        // Since entries are created sequentially, they should already be in order
        for (let i = 0; i < sorted.length - 1; i++) {
          expect(sorted[i].timestamp.getTime()).toBeLessThanOrEqual(
            sorted[i + 1].timestamp.getTime()
          );
        }
      }),
      { numRuns: 100 }
    );
  });
});
