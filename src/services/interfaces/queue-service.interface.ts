import { TicketResult } from '../../models/ticket';
import { QueueFilters, QueueStats, TicketListResult } from '../../models/queue';

export interface IQueueService {
  getPendingTickets(filters: QueueFilters): Promise<TicketListResult>;
  getQueueStatistics(): Promise<QueueStats>;
  escalateTicket(ticketId: string): Promise<TicketResult>;
}
