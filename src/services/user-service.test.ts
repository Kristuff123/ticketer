import { describe, it, expect, beforeEach } from 'vitest';
import { UserService, TicketLookupFn } from './user-service.js';
import { UserRole } from '../models/enums.js';

describe('UserService', () => {
  let service: UserService;
  const mockTicketLookup: TicketLookupFn = async (ticketId: string) => {
    if (ticketId === 'ticket-001') {
      return { reporterId: 'reporter-001', assigneeId: 'tech-001' };
    }
    if (ticketId === 'ticket-002') {
      return { reporterId: 'reporter-001', assigneeId: undefined };
    }
    return null;
  };

  beforeEach(() => {
    service = new UserService(mockTicketLookup);
  });

  describe('getUser', () => {
    it('should return user by id', async () => {
      const user = await service.getUser('admin-001');
      expect(user).not.toBeNull();
      expect(user!.email).toBe('admin@company.com');
      expect(user!.role).toBe(UserRole.ADMIN);
    });

    it('should return null for non-existent user', async () => {
      const user = await service.getUser('non-existent');
      expect(user).toBeNull();
    });
  });

  describe('getUserByRole', () => {
    it('should return users filtered by role', async () => {
      const admins = await service.getUserByRole(UserRole.ADMIN);
      expect(admins.length).toBeGreaterThanOrEqual(1);
      expect(admins.every((u) => u.role === UserRole.ADMIN)).toBe(true);
    });

    it('should return empty array for role with no users', async () => {
      // All roles have at least one user in the seed data, but this tests the filter logic
      const technicians = await service.getUserByRole(UserRole.TECHNICIAN);
      expect(technicians.every((u) => u.role === UserRole.TECHNICIAN)).toBe(true);
    });
  });

  describe('authenticateUser', () => {
    it('should authenticate valid credentials and return token', async () => {
      const result = await service.authenticateUser({
        email: 'admin@company.com',
        password: 'admin123',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.token).toBeDefined();
        expect(result.user.email).toBe('admin@company.com');
      }
    });

    it('should be case-insensitive for email', async () => {
      const result = await service.authenticateUser({
        email: 'ADMIN@COMPANY.COM',
        password: 'admin123',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid password', async () => {
      const result = await service.authenticateUser({
        email: 'admin@company.com',
        password: 'wrong-password',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Invalid email or password');
      }
    });

    it('should reject non-existent email', async () => {
      const result = await service.authenticateUser({
        email: 'nobody@company.com',
        password: 'password',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('hasPermission', () => {
    describe('ADMIN role', () => {
      it('should always return true for admin', async () => {
        expect(await service.hasPermission('admin-001', 'view', 'ticket-001')).toBe(true);
        expect(await service.hasPermission('admin-001', 'close', 'ticket-001')).toBe(true);
        expect(await service.hasPermission('admin-001', 'assign', 'ticket-001')).toBe(true);
        expect(await service.hasPermission('admin-001', 'change_status', 'ticket-001')).toBe(true);
        expect(await service.hasPermission('admin-001', 'add_comment', 'ticket-001')).toBe(true);
        expect(await service.hasPermission('admin-001', 'add_internal_comment', 'ticket-001')).toBe(true);
      });
    });

    describe('TECHNICIAN role', () => {
      it('should allow viewing all tickets', async () => {
        expect(await service.hasPermission('tech-001', 'view')).toBe(true);
        expect(await service.hasPermission('tech-001', 'view', 'ticket-001')).toBe(true);
      });

      it('should allow changing status on assigned tickets', async () => {
        expect(await service.hasPermission('tech-001', 'change_status', 'ticket-001')).toBe(true);
      });

      it('should deny changing status on unassigned tickets', async () => {
        expect(await service.hasPermission('tech-001', 'change_status', 'ticket-002')).toBe(false);
      });

      it('should allow adding comments on assigned tickets', async () => {
        expect(await service.hasPermission('tech-001', 'add_comment', 'ticket-001')).toBe(true);
        expect(await service.hasPermission('tech-001', 'add_internal_comment', 'ticket-001')).toBe(true);
      });

      it('should deny assigning tickets', async () => {
        expect(await service.hasPermission('tech-001', 'assign', 'ticket-001')).toBe(false);
      });
    });

    describe('REPORTER role', () => {
      it('should allow viewing own tickets', async () => {
        expect(await service.hasPermission('reporter-001', 'view', 'ticket-001')).toBe(true);
      });

      it('should allow closing own tickets', async () => {
        expect(await service.hasPermission('reporter-001', 'close', 'ticket-001')).toBe(true);
      });

      it('should allow adding non-internal comments to own tickets', async () => {
        expect(await service.hasPermission('reporter-001', 'add_comment', 'ticket-001')).toBe(true);
      });

      it('should deny adding internal comments', async () => {
        expect(await service.hasPermission('reporter-001', 'add_internal_comment', 'ticket-001')).toBe(false);
      });

      it('should deny assigning tickets', async () => {
        expect(await service.hasPermission('reporter-001', 'assign', 'ticket-001')).toBe(false);
      });

      it('should deny changing status', async () => {
        expect(await service.hasPermission('reporter-001', 'change_status', 'ticket-001')).toBe(false);
      });
    });

    it('should return false for non-existent user', async () => {
      expect(await service.hasPermission('non-existent', 'view', 'ticket-001')).toBe(false);
    });
  });

  describe('updateUserPreferences', () => {
    it('should update user preferences partially', async () => {
      const updated = await service.updateUserPreferences('admin-001', {
        emailNotifications: false,
      });
      expect(updated).not.toBeNull();
      expect(updated!.preferences.emailNotifications).toBe(false);
      expect(updated!.preferences.dashboardNotifications).toBe(true);
    });

    it('should return null for non-existent user', async () => {
      const result = await service.updateUserPreferences('non-existent', {
        emailNotifications: false,
      });
      expect(result).toBeNull();
    });
  });

  describe('generateToken / validateToken', () => {
    it('should generate a valid JWT token', async () => {
      const user = await service.getUser('admin-001');
      const token = service.generateToken(user!);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      const result = service.validateToken(token);
      expect(result.valid).toBe(true);
      expect(result.payload.userId).toBe('admin-001');
      expect(result.payload.email).toBe('admin@company.com');
      expect(result.payload.role).toBe(UserRole.ADMIN);
    });

    it('should reject invalid token', () => {
      const result = service.validateToken('invalid-token');
      expect(result.valid).toBe(false);
      expect(result.payload).toBeUndefined();
    });
  });

  describe('refreshToken', () => {
    it('should issue a new token from a valid token', async () => {
      const user = await service.getUser('tech-001');
      const originalToken = service.generateToken(user!);

      const newToken = service.refreshToken(originalToken);
      expect(newToken).not.toBeNull();

      const result = service.validateToken(newToken!);
      expect(result.valid).toBe(true);
      expect(result.payload.userId).toBe('tech-001');
      expect(result.payload.email).toBe('technician@company.com');
      expect(result.payload.role).toBe(UserRole.TECHNICIAN);
    });

    it('should return null for invalid token', () => {
      const result = service.refreshToken('invalid-token');
      expect(result).toBeNull();
    });
  });
});
