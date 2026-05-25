import { Priority, TicketCategory, TicketStatus } from './enums';
import { Ticket } from './ticket';

export interface QueueFilters {
  priority?: Priority;
  category?: TicketCategory;
  assigneeId?: string;
  status?: TicketStatus;
  sortBy?: 'priority' | 'createdAt' | 'dueDate';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface QueueStats {
  slaCompliancePercentage: number;
  averageTimeToFirstResponse: number;
}

export interface TicketListResult {
  tickets: Ticket[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
