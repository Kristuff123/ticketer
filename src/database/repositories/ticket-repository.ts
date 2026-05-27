import { query } from "../connection.js";
import { Ticket } from "../../models/ticket.js";
import { TicketCategory, Priority, TicketStatus } from "../../models/enums.js";

/**
 * Marker error class for validation failures (e.g. malformed UUID input).
 * Callers can distinguish these from generic database errors by checking
 * `error.name === 'ValidationError'` or `error instanceof ValidationError`.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface TicketRow {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  location: string | null;
  reporter_id: string;
  assignee_id: string | null;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
  due_date: Date | null;
}

export interface TicketFilters {
  status?: TicketStatus;
  priority?: Priority;
  category?: TicketCategory;
  assigneeId?: string;
  reporterId?: string;
  excludeStatuses?: TicketStatus[];
}

function mapRowToTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category as TicketCategory,
    priority: row.priority as Priority,
    status: row.status as TicketStatus,
    location: row.location ?? undefined,
    reporterId: row.reporter_id,
    assigneeId: row.assignee_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at ?? undefined,
    dueDate: row.due_date ?? undefined,
    comments: [],
    history: [],
  };
}

export class TicketRepository {
  async findById(id: string): Promise<Ticket | null> {
    if (typeof id !== "string" || !UUID_V4_REGEX.test(id)) {
      throw new ValidationError("Invalid ticket ID: not a well-formed UUID");
    }

    const result = await query<TicketRow>(
      "SELECT * FROM tickets WHERE id = $1",
      [id],
    );
    if (result.rows.length === 0) return null;
    return mapRowToTicket(result.rows[0]);
  }

  async create(ticket: {
    id: string;
    title: string;
    description: string;
    category: TicketCategory;
    priority: Priority;
    status: TicketStatus;
    location?: string;
    reporterId: string;
    createdAt: Date;
    updatedAt: Date;
    dueDate?: Date;
  }): Promise<Ticket> {
    const result = await query<TicketRow>(
      `INSERT INTO tickets (id, title, description, category, priority, status, location, reporter_id, created_at, updated_at, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        ticket.id,
        ticket.title,
        ticket.description,
        ticket.category,
        ticket.priority,
        ticket.status,
        ticket.location ?? null,
        ticket.reporterId,
        ticket.createdAt,
        ticket.updatedAt,
        ticket.dueDate ?? null,
      ],
    );
    return mapRowToTicket(result.rows[0]);
  }

  async update(
    id: string,
    fields: Partial<{
      title: string;
      description: string;
      category: TicketCategory;
      priority: Priority;
      status: TicketStatus;
      location: string | null;
      assigneeId: string | null;
      resolvedAt: Date | null;
      dueDate: Date | null;
    }>,
  ): Promise<Ticket | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    // Note: `updated_at` is intentionally NOT in this map. It is set
    // server-side via `NOW()` below so callers cannot override it.
    const columnMap: Record<string, string> = {
      title: "title",
      description: "description",
      category: "category",
      priority: "priority",
      status: "status",
      location: "location",
      assigneeId: "assignee_id",
      resolvedAt: "resolved_at",
      dueDate: "due_date",
    };

    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      const column = columnMap[key];
      if (column) {
        setClauses.push(`${column} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    // No-op update: return existing record without executing UPDATE.
    if (setClauses.length === 0) return this.findById(id);

    // Always refresh `updated_at` server-side when at least one field changes.
    setClauses.push("updated_at = NOW()");

    values.push(id);
    const result = await query<TicketRow>(
      `UPDATE tickets SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) return null;
    return mapRowToTicket(result.rows[0]);
  }

  async findByFilters(filters: TicketFilters): Promise<Ticket[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters.status) {
      conditions.push(`status = $${paramIndex}`);
      values.push(filters.status);
      paramIndex++;
    }

    if (filters.priority) {
      conditions.push(`priority = $${paramIndex}`);
      values.push(filters.priority);
      paramIndex++;
    }

    if (filters.category) {
      conditions.push(`category = $${paramIndex}`);
      values.push(filters.category);
      paramIndex++;
    }

    if (filters.assigneeId) {
      conditions.push(`assignee_id = $${paramIndex}`);
      values.push(filters.assigneeId);
      paramIndex++;
    }

    if (filters.reporterId) {
      conditions.push(`reporter_id = $${paramIndex}`);
      values.push(filters.reporterId);
      paramIndex++;
    }

    if (filters.excludeStatuses && filters.excludeStatuses.length > 0) {
      const placeholders = filters.excludeStatuses.map(
        (_, i) => `$${paramIndex + i}`,
      );
      conditions.push(`status NOT IN (${placeholders.join(", ")})`);
      values.push(...filters.excludeStatuses);
      paramIndex += filters.excludeStatuses.length;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query<TicketRow>(
      `SELECT * FROM tickets ${whereClause} ORDER BY created_at ASC`,
      values,
    );

    return result.rows.map(mapRowToTicket);
  }
}
