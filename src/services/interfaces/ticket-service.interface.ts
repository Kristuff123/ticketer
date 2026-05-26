import { TicketStatus } from '../../models/enums.js';
import { Ticket, TicketCreateInput, TicketUpdateInput, TicketResult } from '../../models/ticket.js';
import { CommentInput, CommentResult } from '../../models/comment.js';
import { TicketHistoryEntry } from '../../models/history.js';
import { TicketListResult } from '../../models/queue.js';

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
