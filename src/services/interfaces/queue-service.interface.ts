import { TicketResult } from '../../models/ticket.js';
import { QueueFilters, QueueStats, TicketListResult } from '../../models/queue.js';

export interface IQueueService {
  getPendingTickets(filters: QueueFilters): Promise<TicketListResult>;
  getQueueStatistics(): Promise<QueueStats>;
  escalateTicket(ticketId: string): Promise<TicketResult>;
}
