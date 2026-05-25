import { query } from '../connection.js';
import { User, UserPreferences } from '../../models/user.js';
import { UserRole } from '../../models/enums.js';

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
    const result = await query<UserRow>(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) return null;
    return mapRowToUser(result.rows[0]);
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await query<UserRow>(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    if (result.rows.length === 0) return null;
    return mapRowToUser(result.rows[0]);
  }

  async findByRole(role: UserRole): Promise<User[]> {
    const result = await query<UserRow>(
      'SELECT * FROM users WHERE role = $1',
      [role]
    );
    return result.rows.map(mapRowToUser);
  }
}
