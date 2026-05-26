import { Priority, TicketCategory, TicketStatus } from './enums.js';
import { Ticket } from './ticket.js';

export interface QueueFilters {
  priority?: Priority;
  category?: TicketCategory;
  assigneeId?: string;
  status?: TicketStatus;
  sortBy?: 'priority' | 'createdAt' | 'updatedAt' | 'dueDate';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface QueueStats {
  totalTickets: number;
  openTickets: number;
  resolvedTickets: number;
  slaCompliancePercentage: number;
  averageTimeToFirstResponse: number;
  byPriority: Partial<Record<Priority, number>>;
  byStatus: Partial<Record<TicketStatus, number>>;
}

export interface TicketListResult {
  tickets: Ticket[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
