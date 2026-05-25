import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { getDemoPasswords, getJwtSecret, getTokenExpiration } from '../config/env.js';
import { UserRole } from '../models/enums.js';
import { User, UserPreferences, Credentials, AuthResult } from '../models/user.js';
import { IUserService } from './interfaces/index.js';

const JWT_SECRET = getJwtSecret();
const TOKEN_EXPIRATION = getTokenExpiration();
const jwtSignOptions: SignOptions = {
  expiresIn: TOKEN_EXPIRATION as SignOptions['expiresIn'],
};

// In-memory user store (to be replaced with database layer later)
const users: User[] = [
  {
    id: 'admin-001',
    email: 'admin@company.com',
    name: 'System Admin',
    role: UserRole.ADMIN,
    department: 'IT',
    isActive: true,
    preferences: { emailNotifications: true, dashboardNotifications: true, language: 'pl' },
    createdAt: new Date('2024-01-01'),
  },
  {
    id: 'tech-001',
    email: 'technician@company.com',
    name: 'Jan Kowalski',
    role: UserRole.TECHNICIAN,
    department: 'IT',
    isActive: true,
    preferences: { emailNotifications: true, dashboardNotifications: true, language: 'pl' },
    createdAt: new Date('2024-01-01'),
  },
  {
    id: 'reporter-001',
    email: 'reporter@company.com',
    name: 'Anna Nowak',
    role: UserRole.REPORTER,
    department: 'HR',
    isActive: true,
    preferences: { emailNotifications: true, dashboardNotifications: true, language: 'pl' },
    createdAt: new Date('2024-01-01'),
  },
];

function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')): string {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);

  if (expected.length !== actual.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, actual);
}

const demoPasswords = getDemoPasswords();
const passwordHashes: Record<string, string> = {
  'admin@company.com': hashPassword(demoPasswords.admin),
  'technician@company.com': hashPassword(demoPasswords.technician),
  'reporter@company.com': hashPassword(demoPasswords.reporter),
};

// In-memory ticket store reference for permission checks
// This will be injected or replaced with a proper repository later
export interface TicketOwnershipInfo {
  reporterId: string;
  assigneeId?: string;
}

export type TicketLookupFn = (ticketId: string) => Promise<TicketOwnershipInfo | null>;

export class UserService implements IUserService {
  private ticketLookup: TicketLookupFn;

  constructor(ticketLookup?: TicketLookupFn) {
    this.ticketLookup = ticketLookup ?? (async () => null);
  }

  async getUser(id: string): Promise<User | null> {
    return users.find((u) => u.id === id) ?? null;
  }

  async getUserByRole(role: UserRole): Promise<User[]> {
    return users.filter((u) => u.role === role);
  }

  async authenticateUser(credentials: Credentials): Promise<AuthResult> {
    const user = users.find(
      (u) => u.email.toLowerCase() === credentials.email.toLowerCase()
    );

    if (!user) {
      return { success: false, error: 'Invalid email or password' };
    }

    if (!user.isActive) {
      return { success: false, error: 'User account is inactive' };
    }

    const storedPasswordHash = passwordHashes[user.email.toLowerCase()];
    if (!storedPasswordHash || !verifyPassword(credentials.password, storedPasswordHash)) {
      return { success: false, error: 'Invalid email or password' };
    }

    const token = this.generateToken(user);
    return { success: true, token, user };
  }

  async hasPermission(
    userId: string,
    operation: string,
    ticketId?: string
  ): Promise<boolean> {
    const user = users.find((u) => u.id === userId);
    if (!user || !user.isActive) {
      return false;
    }

    // ADMIN: always has permission
    if (user.role === UserRole.ADMIN) {
      return true;
    }

    // TECHNICIAN permissions
    if (user.role === UserRole.TECHNICIAN) {
      // Can view all tickets
      if (operation === 'view') {
        return true;
      }

      // For operations on specific tickets, check assignment
      if (ticketId) {
        const ticket = await this.ticketLookup(ticketId);
        if (!ticket) {
          return false;
        }

        const isAssigned = ticket.assigneeId === userId;

        // Can change status and add comments (including internal) on assigned tickets
        if (
          operation === 'change_status' ||
          operation === 'add_comment' ||
          operation === 'add_internal_comment'
        ) {
          return isAssigned;
        }
      }

      // Technicians cannot assign tickets
      if (operation === 'assign') {
        return false;
      }

      return false;
    }

    // REPORTER permissions
    if (user.role === UserRole.REPORTER) {
      if (ticketId) {
        const ticket = await this.ticketLookup(ticketId);
        if (!ticket) {
          return false;
        }

        const isOwner = ticket.reporterId === userId;

        // Can view own tickets
        if (operation === 'view') {
          return isOwner;
        }

        // Can close own tickets
        if (operation === 'close') {
          return isOwner;
        }

        // Can add non-internal comments to own tickets
        if (operation === 'add_comment') {
          return isOwner;
        }

        // Cannot add internal comments
        if (operation === 'add_internal_comment') {
          return false;
        }
      }

      // Reporters cannot assign, change_status (except close via 'close' op), or add internal comments
      if (
        operation === 'assign' ||
        operation === 'change_status' ||
        operation === 'add_internal_comment'
      ) {
        return false;
      }

      return false;
    }

    return false;
  }

  async updateUserPreferences(
    userId: string,
    prefs: Partial<UserPreferences>
  ): Promise<User | null> {
    const user = users.find((u) => u.id === userId);
    if (!user) {
      return null;
    }

    user.preferences = { ...user.preferences, ...prefs };
    return user;
  }

  generateToken(user: User): string {
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    return jwt.sign(payload, JWT_SECRET, jwtSignOptions);
  }

  validateToken(token: string): { valid: boolean; payload?: any } {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      return { valid: true, payload };
    } catch {
      return { valid: false };
    }
  }

  refreshToken(token: string): string | null {
    const result = this.validateToken(token);
    if (!result.valid || !result.payload) {
      return null;
    }

    // Issue a new token with the same payload but fresh expiration
    const { userId, email, role } = result.payload;
    const newPayload = { userId, email, role };

    return jwt.sign(newPayload, JWT_SECRET, jwtSignOptions);
  }
}

// Export a default instance
export const userService = new UserService();
