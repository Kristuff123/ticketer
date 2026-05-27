import { query } from "../connection.js";
import type { TicketHistoryEntry } from "../../models/history.js";
import type { HistoryActionType } from "../../models/enums.js";

interface TicketHistoryRow {
  id: string;
  ticket_id: string;
  action: string;
  previous_value: string | null;
  new_value: string | null;
  user_id: string;
  timestamp: Date;
  reason: string | null;
}

function mapRowToHistoryEntry(row: TicketHistoryRow): TicketHistoryEntry {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    action: row.action as HistoryActionType,
    previousValue: row.previous_value ?? "",
    newValue: row.new_value ?? "",
    userId: row.user_id,
    timestamp: row.timestamp,
    reason: row.reason ?? undefined,
  };
}

export class TicketHistoryRepository {
  async append(entry: {
    id: string;
    ticketId: string;
    action: HistoryActionType;
    previousValue?: string;
    newValue?: string;
    userId: string;
    timestamp: Date;
    reason?: string;
  }): Promise<TicketHistoryEntry> {
    const result = await query<TicketHistoryRow>(
      `INSERT INTO ticket_history (
         id, ticket_id, action, previous_value, new_value, user_id, timestamp, reason
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        entry.id,
        entry.ticketId,
        entry.action,
        entry.previousValue ?? null,
        entry.newValue ?? null,
        entry.userId,
        entry.timestamp,
        entry.reason ?? null,
      ],
    );
    return mapRowToHistoryEntry(result.rows[0]);
  }

  async findByTicketId(ticketId: string): Promise<TicketHistoryEntry[]> {
    const result = await query<TicketHistoryRow>(
      `SELECT * FROM ticket_history
       WHERE ticket_id = $1
       ORDER BY timestamp ASC`,
      [ticketId],
    );
    return result.rows.map(mapRowToHistoryEntry);
  }
}
