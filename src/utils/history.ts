import crypto from 'node:crypto';
import { HistoryActionType, TicketHistoryEntry } from '../models/index.js';

export interface CreateHistoryEntryParams {
  ticketId: string;
  action: HistoryActionType;
  previousValue: string;
  newValue: string;
  userId: string;
  reason?: string;
}

/**
 * Creates a complete history entry with generated id and timestamp.
 * Validates that action, userId, and timestamp are non-null.
 * For automated processes (e.g., escalation), use "SYSTEM" as the userId.
 */
export function createHistoryEntry(params: CreateHistoryEntryParams): TicketHistoryEntry {
  const { ticketId, action, previousValue, newValue, userId, reason } = params;

  if (!action) {
    throw new Error('History entry action type must not be null or empty');
  }

  if (!userId) {
    throw new Error('History entry userId must not be null or empty');
  }

  const timestamp = new Date();

  if (!timestamp) {
    throw new Error('History entry timestamp must not be null');
  }

  const entry: TicketHistoryEntry = {
    id: crypto.randomUUID(),
    ticketId,
    action,
    previousValue,
    newValue,
    userId,
    timestamp,
  };

  if (reason) {
    entry.reason = reason;
  }

  return entry;
}

/**
 * Returns history entries sorted in chronological order (by timestamp ascending).
 * This ensures requirement 10.4: history entries maintained in chronological order.
 * Entries with invalid timestamps (NaN) are placed at the end of the list.
 */
export function getTicketHistory(history: TicketHistoryEntry[]): TicketHistoryEntry[] {
  return [...history].sort((a, b) => {
    const timeA = a.timestamp.getTime();
    const timeB = b.timestamp.getTime();

    // Handle NaN timestamps: push them to the end
    const aIsNaN = isNaN(timeA);
    const bIsNaN = isNaN(timeB);

    if (aIsNaN && bIsNaN) return 0;
    if (aIsNaN) return 1;
    if (bIsNaN) return -1;

    return timeA - timeB;
  });
}
