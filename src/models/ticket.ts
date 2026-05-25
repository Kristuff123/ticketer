import { TicketCategory, Priority, TicketStatus } from './enums.js';
import { Comment } from './comment.js';
import { TicketHistoryEntry } from './history.js';

export interface Ticket {
  id: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: Priority;
  status: TicketStatus;
  reporterId: string;
  assigneeId?: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  dueDate?: Date;
  comments: Comment[];
  history: TicketHistoryEntry[];
}

export interface TicketCreateInput {
  title: string;
  description: string;
  category: TicketCategory;
  priority: Priority;
  reporterId: string;
}

export interface TicketUpdateInput {
  title?: string;
  description?: string;
  category?: TicketCategory;
  priority?: Priority;
}

export type TicketResult =
  | { success: true; ticket: Ticket }
  | { success: false; error: string };
