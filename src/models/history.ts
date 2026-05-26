import { HistoryActionType } from './enums.js';

export interface TicketHistoryEntry {
  id: string;
  ticketId: string;
  action: HistoryActionType;
  previousValue: string;
  newValue: string;
  userId: string;
  timestamp: Date;
  reason?: string;
}
