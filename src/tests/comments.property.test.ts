import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { TicketService } from '../services/ticket-service.js';
import { INotificationService } from '../services/interfaces/notification-service.interface.js';
import { IUserService } from '../services/interfaces/user-service.interface.js';
import {
  UserRole,
  TicketStatus,
  TicketCategory,
  Priority,
  Ticket,
  User,
} from '../models/index.js';

/**
 * Property 11: Internal Comment Visibility
 *
 * For any comment marked as internal:
 * - It shall be visible only to users with TECHNICIAN or ADMIN role
 * - A Reporter shall never be able to create an internal comment
 *
 * **Validates: Requirements 6.3, 6.4**
 */

// --- Mock implementations ---

function createMockNotificationService(): INotificationService {
  const fakeNotification = { id: 'n1', userId: 'u1', type: 'TICKET_CREATED' as any, title: '', message: '', isRead: false, createdAt: new Date() };
  return {
    notifyTicketCreated: async () => ({ success: true as const, notification: fakeNotification }),
    notifyTicketAssigned: async () => ({ success: true as const, notification: fakeNotification }),
    notifyStatusChanged: async () => ({ success: true as const, notification: fakeNotification }),
    notifyCommentAdded: async () => ({ success: true as const, notification: fakeNotification }),
    notifyTicketResolved: async () => ({ success: true as const, notification: fakeNotification }),
    notifyEscalation: async () => ({ success: true as const, notification: fakeNotification }),
    getUserNotifications: async () => ({ success: true as const, notification: fakeNotification }),
    markAsRead: async () => ({ success: true as const, notification: fakeNotification }),
  };
}

function createMockUserService(users: Map<string, User>): IUserService {
  return {
    getUser: async (id: string) => users.get(id) || null,
    getUserByRole: async (role: UserRole) =>
      Array.from(users.values()).filter((u) => u.role === role),
    authenticateUser: async () => ({ success: false as const, error: 'Not implemented' }),
    registerUser: async () => ({ success: false as const, error: 'Not implemented' }),
    hasPermission: async () => true,
    updateUserPreferences: async () => null,
  };
}

function createTestUser(id: string, role: UserRole): User {
  return {
    id,
    email: `${id}@test.com`,
    name: `User ${id}`,
    role,
    department: 'IT',
    isActive: true,
    preferences: {
      emailNotifications: true,
      dashboardNotifications: true,
      language: 'en',
    },
    createdAt: new Date(),
  };
}

function createTestTicket(id: string, reporterId: string): Ticket {
  return {
    id,
    title: 'Test Ticket',
    description: 'Test description',
    category: TicketCategory.SOFTWARE,
    priority: Priority.MEDIUM,
    status: TicketStatus.IN_PROGRESS,
    reporterId,
    assigneeId: 'tech-001',
    createdAt: new Date(),
    updatedAt: new Date(),
    comments: [],
    history: [],
  };
}

// --- Arbitraries ---

const validCommentContentArb = fc.string({ minLength: 1, maxLength: 100 }).filter(
  (s) => s.trim().length > 0
);

const techOrAdminRoleArb = fc.constantFrom(UserRole.TECHNICIAN, UserRole.ADMIN);

const allRolesArb = fc.constantFrom(UserRole.REPORTER, UserRole.TECHNICIAN, UserRole.ADMIN);

describe('Property 11: Internal Comment Visibility', () => {
  let ticketService: TicketService;
  let users: Map<string, User>;
  let ticketStore: Map<string, Ticket>;

  beforeEach(() => {
    users = new Map<string, User>();
    users.set('admin-001', createTestUser('admin-001', UserRole.ADMIN));
    users.set('tech-001', createTestUser('tech-001', UserRole.TECHNICIAN));
    users.set('reporter-001', createTestUser('reporter-001', UserRole.REPORTER));

    const mockNotificationService = createMockNotificationService();
    const mockUserService = createMockUserService(users);

    ticketService = new TicketService(mockNotificationService, mockUserService);
    ticketStore = ticketService.getTicketStore();

    // Set up a test ticket in the in-memory store
    const ticket = createTestTicket('ticket-001', 'reporter-001');
    ticketStore.set('ticket-001', ticket);
  });

  /**
   * 1. TECHNICIAN or ADMIN can create internal comments (isInternal: true) — should succeed
   * **Validates: Requirements 6.3, 6.4**
   */
  it('TECHNICIAN or ADMIN can create internal comments successfully', async () => {
    await fc.assert(
      fc.asyncProperty(
        techOrAdminRoleArb,
        validCommentContentArb,
        async (role, content) => {
          // Reset ticket comments for each run
          const ticket = ticketStore.get('ticket-001')!;
          ticket.comments = [];

          const userId = role === UserRole.TECHNICIAN ? 'tech-001' : 'admin-001';

          const result = await ticketService.addComment(
            'ticket-001',
            { ticketId: 'ticket-001', authorId: userId, content, isInternal: true },
            userId
          );

          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.comment.isInternal).toBe(true);
            expect(result.comment.authorId).toBe(userId);
            expect(result.comment.content).toBe(content);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 2. REPORTER cannot create internal comments — should fail with permission error
   * **Validates: Requirements 6.3, 6.4**
   */
  it('REPORTER cannot create internal comments', async () => {
    await fc.assert(
      fc.asyncProperty(
        validCommentContentArb,
        async (content) => {
          // Reset ticket comments for each run
          const ticket = ticketStore.get('ticket-001')!;
          ticket.comments = [];

          const result = await ticketService.addComment(
            'ticket-001',
            { ticketId: 'ticket-001', authorId: 'reporter-001', content, isInternal: true },
            'reporter-001'
          );

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toContain('TECHNICIAN');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 3. All roles can create public comments (isInternal: false) on tickets they have access to
   * **Validates: Requirements 6.3, 6.4**
   */
  it('All roles can create public comments on accessible tickets', async () => {
    await fc.assert(
      fc.asyncProperty(
        allRolesArb,
        validCommentContentArb,
        async (role, content) => {
          // Reset ticket comments for each run
          const ticket = ticketStore.get('ticket-001')!;
          ticket.comments = [];

          let userId: string;
          switch (role) {
            case UserRole.ADMIN:
              userId = 'admin-001';
              break;
            case UserRole.TECHNICIAN:
              userId = 'tech-001';
              break;
            case UserRole.REPORTER:
              userId = 'reporter-001';
              break;
          }

          const result = await ticketService.addComment(
            'ticket-001',
            { ticketId: 'ticket-001', authorId: userId, content, isInternal: false },
            userId
          );

          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.comment.isInternal).toBe(false);
            expect(result.comment.authorId).toBe(userId);
            expect(result.comment.content).toBe(content);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
