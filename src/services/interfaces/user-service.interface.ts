import { UserRole } from '../../models/enums.js';
import { User, UserPreferences, Credentials, AuthResult, RegisterInput } from '../../models/user.js';

export interface IUserService {
  getUser(id: string): Promise<User | null>;
  getUserByRole(role: UserRole): Promise<User[]>;
  authenticateUser(credentials: Credentials): Promise<AuthResult>;
  registerUser(input: RegisterInput): Promise<AuthResult>;
  hasPermission(userId: string, operation: string, ticketId?: string): Promise<boolean>;
  updateUserPreferences(userId: string, prefs: Partial<UserPreferences>): Promise<User | null>;
}
