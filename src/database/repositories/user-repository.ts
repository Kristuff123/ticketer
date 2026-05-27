import { query } from "../connection.js";
import { User, UserPreferences } from "../../models/user.js";
import { UserRole } from "../../models/enums.js";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  department: string;
  is_active: boolean;
  email_notifications: boolean;
  dashboard_notifications: boolean;
  language: string;
  created_at: Date;
}

function mapRowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as UserRole,
    department: row.department,
    isActive: row.is_active,
    preferences: {
      emailNotifications: row.email_notifications,
      dashboardNotifications: row.dashboard_notifications,
      language: row.language,
    },
    createdAt: row.created_at,
  };
}

export class UserRepository {
  async findById(id: string): Promise<User | null> {
    const result = await query<UserRow>("SELECT * FROM users WHERE id = $1", [
      id,
    ]);
    if (result.rows.length === 0) return null;
    return mapRowToUser(result.rows[0]);
  }

  async findAll(): Promise<User[]> {
    const result = await query<UserRow>(
      "SELECT * FROM users ORDER BY name ASC",
    );
    return result.rows.map(mapRowToUser);
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await query<UserRow>(
      "SELECT * FROM users WHERE LOWER(email) = LOWER($1)",
      [email],
    );
    if (result.rows.length === 0) return null;
    return mapRowToUser(result.rows[0]);
  }

  async findByRole(role: UserRole): Promise<User[]> {
    const result = await query<UserRow>(
      "SELECT * FROM users WHERE is_active = true AND role = $1",
      [role],
    );
    return result.rows.map(mapRowToUser);
  }

  async create(user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    department: string;
    isActive: boolean;
    preferences: UserPreferences;
    createdAt: Date;
  }): Promise<User> {
    const result = await query<UserRow>(
      `INSERT INTO users (
         id,
         email,
         name,
         role,
         department,
         is_active,
         email_notifications,
         dashboard_notifications,
         language,
         created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        user.id,
        user.email,
        user.name,
        user.role,
        user.department,
        user.isActive,
        user.preferences.emailNotifications,
        user.preferences.dashboardNotifications,
        user.preferences.language,
        user.createdAt,
      ],
    );
    return mapRowToUser(result.rows[0]);
  }

  async update(
    id: string,
    fields: Partial<{
      email: string;
      name: string;
      role: UserRole;
      department: string;
      isActive: boolean;
      preferences: UserPreferences;
    }>,
  ): Promise<User | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const simpleColumnMap: Record<string, string> = {
      email: "email",
      name: "name",
      role: "role",
      department: "department",
      isActive: "is_active",
    };

    for (const [key, value] of Object.entries(fields)) {
      if (key === "preferences") continue;
      const column = simpleColumnMap[key];
      if (column) {
        setClauses.push(`${column} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (fields.preferences) {
      setClauses.push(`email_notifications = $${paramIndex}`);
      values.push(fields.preferences.emailNotifications);
      paramIndex++;

      setClauses.push(`dashboard_notifications = $${paramIndex}`);
      values.push(fields.preferences.dashboardNotifications);
      paramIndex++;

      setClauses.push(`language = $${paramIndex}`);
      values.push(fields.preferences.language);
      paramIndex++;
    }

    // Empty update object: do not execute UPDATE; return findById(id) (Req 4.8).
    if (setClauses.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const result = await query<UserRow>(
      `UPDATE users SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) return null;
    return mapRowToUser(result.rows[0]);
  }
}
