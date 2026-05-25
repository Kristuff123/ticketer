export interface Comment {
  id: string;
  ticketId: string;
  authorId: string;
  content: string;
  isInternal: boolean;
  createdAt: Date;
}

export interface CommentInput {
  ticketId: string;
  authorId: string;
  content: string;
  isInternal: boolean;
}

export type CommentResult =
  | { success: true; comment: Comment }
  | { success: false; error: string };
