import { query } from "../connection.js";
import type { Comment } from "../../models/comment.js";

interface CommentRow {
  id: string;
  ticket_id: string;
  author_id: string;
  content: string;
  is_internal: boolean;
  created_at: Date;
}

function mapRowToComment(row: CommentRow): Comment {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorId: row.author_id,
    content: row.content,
    isInternal: row.is_internal,
    createdAt: row.created_at,
  };
}

export class CommentRepository {
  async create(comment: {
    id: string;
    ticketId: string;
    authorId: string;
    content: string;
    isInternal: boolean;
  }): Promise<Comment> {
    const result = await query<CommentRow>(
      `INSERT INTO comments (id, ticket_id, author_id, content, is_internal, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [
        comment.id,
        comment.ticketId,
        comment.authorId,
        comment.content,
        comment.isInternal,
      ],
    );
    return mapRowToComment(result.rows[0]);
  }

  async findByTicketId(
    ticketId: string,
    includeInternal?: boolean,
  ): Promise<Comment[]> {
    if (includeInternal === false) {
      const result = await query<CommentRow>(
        `SELECT * FROM comments
         WHERE ticket_id = $1 AND is_internal = FALSE
         ORDER BY created_at ASC`,
        [ticketId],
      );
      return result.rows.map(mapRowToComment);
    }

    const result = await query<CommentRow>(
      `SELECT * FROM comments
       WHERE ticket_id = $1
       ORDER BY created_at ASC`,
      [ticketId],
    );
    return result.rows.map(mapRowToComment);
  }
}
