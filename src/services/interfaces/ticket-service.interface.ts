import { TicketStatus } from '../../models/enums';
import { Ticket, TicketCreateInput, TicketUpdateInput, TicketResult } from '../../models/ticket';
import { CommentInput, CommentResult } from '../../models/comment';
import { TicketHistoryEntry } from '../../models/history';
import { TicketListResult } from '../../models/queue';

export interface ITicketService {
  createTicket(data: TicketCreateInput): Promise<TicketResult>;
  getTicket(id: string): Promise<TicketResult>;
  updateTicket(id: string, data: TicketUpdateInput): Promise<TicketResult>;
  assignTicket(id: string, assigneeId: string, assignedBy: string): Promise<TicketResult>;
  changeStatus(id: string, status: TicketStatus, userId: string): Promise<TicketResult>;
  addComment(id: string, comment: CommentInput, userId: string): Promise<CommentResult>;
  getTicketsByUser(userId: string): Promise<TicketListResult>;
  getTicketHistory(id: string): Promise<TicketHistoryEntry[]>;
}
