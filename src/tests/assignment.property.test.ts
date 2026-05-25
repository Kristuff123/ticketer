import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  TicketStatus,
  TicketCategory,
  Priority,
  UserRole,
  Ticket,
  User,
} from '../models';
import { TicketService } from '../services/ticket-service';
import { INotificationService } from '../services/interfaces/notification-service.interface';
import { IUserService } from '../services/interfaces/user-service.interface';

/**
 * Property 4: Assignment Role Enforcement
 *
 * For any ticket assignment operation:
 * - If target user has role TECHNICIAN or ADMIN and ticket is not CLOSED/RESOLVED,
 *   assignment succeeds and status becomes IN_PROGRESS
 * - If target user has role REPORTER, assignment is rejected
 * - If ticket is CLOSED or RESOLVED, assignment is rejected regardless of role
 *
 * **Validates: Requirements 3.1, 3.2, 3.3**
 */

// Statuses that allow assignment (not terminal)
const assignableStatuses = [
  TicketStatus.NEW,
  TicketStatus.IN_PROGRESS,
  TicketStatus.WAITING_FOR_INFO,
  TicketStatus.REOPENED,
];

// Terminal statuses that reject assignment
const terminalStatuses = [TicketStatus.CLOSED, TicketStatus.RESOLVED];

// Arbitraries
const assignableStatusArb = fc.constantFrom(...assignableStatuses);
const terminalStatusArb = fc.constantFrom(...terminalStatuses);
const assignableRoleArb = fc.constantFrom(UserRole.TECHNICIAN, UserRole.ADMIN);
const priorityArb = fc.constantFrom(...Object.values(Priority));
const categoryArb = fc.constantFrom(...Object.values(TicketCategory));

// Helper to create a mock notification service
function createMockNotificationService(): INotificationService {
  const noop = async () => ({ success: true as const, notification: {} as any });
  return {
    notifyTicketCreated: noop,
    notifyTicketAssigned: noop,
    notifyStatusChanged: noop,
    notifyCommentAdded: noop,
    notifyTicketResolved: noop,
    notifyEscalation: noop,
    getUserNotifications: noop,
    markAsRead: noop,
  };
}

// Helper to create a mock user service that returns a user with a given role
function createMockUserService(usersMap: Map<string, User>): IUserService {
  return {
    getUser: async (id: string) => usersMap.get(id) ?? null,
    getUserByRole: async (role: UserRole) =>
      Array.from(usersMap.values()).filter((u) => u.role === role),
    authenticateUser: async () => ({ success: false as const, error: 'Not implemented' }),
    hasPermission: async () => true,
    updateUserPreferences: async () => null,
  };
}

// Helper to create a test ticket with a given status
function createTestTicket(id: string, status: TicketStatus, priority: Priority, category: TicketCategory): Ticket {
  return {
    id,
    title: 'Test Ticket',
    description: 'Test description',
    category,
    priority,
    status,
    reporterId: 'reporter-test',
    createdAt: new Date(),
    updatedAt: new Date(),
    comments: [],
    history: [],
  };
}

// Helper to create a test user with a given role
function createTestUser(id: string, role: UserRole): User {
  return {
    id,
    email: `${id}@test.com`,
    name: `User ${id}`,
    role,
    department: 'IT',
    isActive: true,
    preferences: { emailNotifications: true, dashboardNotifications: true, language: 'en' },
    createdAt: new Date(),
  };
}

describe('Property 4: Assignment Role Enforcement', () => {
  let ticketService: TicketService;
  let usersMap: Map<string, User>;
  let ticketStore: Map<string, Ticket>;

  beforeEach(() => {
    usersMap = new Map();
    const mockNotificationService = createMockNotificationService();
    const mockUserService = createMockUserService(usersMap);
    ticketService = new TicketService(mockNotificationService, mockUserService);
    ticketStore = ticketService.getTicketStore();
    // Clear the shared in-memory ticket store
    ticketStore.clear();
  });

  it('assignment succeeds when target user has TECHNICIAN or ADMIN role and ticket is not CLOSED/RESOLVED', async () => {
    await fc.assert(
      fc.asyncProperty(
        assignableStatusArb,
        assignableRoleArb,
        priorityArb,
        categoryArb,
        fc.uuid(),
        fc.uuid(),
        async (status, role, priority, category, ticketId, assigneeId) => {
          // Clean store for each run
          ticketStore.clear();

          // Setup: create ticket with assignable status
          const ticket = createTestTicket(ticketId, status, priority, category);
          ticketStore.set(ticketId, ticket);

          // Setup: create user with valid role (use different ID from ticket)
          const user = createTestUser(assigneeId, role);
          usersMap.set(assigneeId, user);

          // Act
          const result = await ticketService.assignTicket(ticketId, assigneeId, 'admin-actor');

          // Assert: assignment succeeds
          expect(result.success).toBe(true);
          if (result.success) {
            // Status becomes IN_PROGRESS
            expect(result.ticket.status).toBe(TicketStatus.IN_PROGRESS);
            // Assignee is set
            expect(result.ticket.assigneeId).toBe(assigneeId);
          }

          // Cleanup
          usersMap.delete(assigneeId);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('assignment is rejected when target user has REPORTER role', async () => {
    await fc.assert(
      fc.asyncProperty(
        assignableStatusArb,
        priorityArb,
        categoryArb,
        fc.uuid(),
        fc.uuid(),
        async (status, priority, category, ticketId, assigneeId) => {
          // Clean store for each run
          ticketStore.clear();

          // Setup: create ticket with assignable status
          const ticket = createTestTicket(ticketId, status, priority, category);
          ticketStore.set(ticketId, ticket);

          // Setup: create user with REPORTER role
          const user = createTestUser(assigneeId, UserRole.REPORTER);
          usersMap.set(assigneeId, user);

          // Act
          const result = await ticketService.assignTicket(ticketId, assigneeId, 'admin-actor');

          // Assert: assignment is rejected
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toContain('TECHNICIAN or ADMIN role');
          }

          // Verify ticket status unchanged
          const storedTicket = ticketStore.get(ticketId)!;
          expect(storedTicket.status).toBe(status);

          // Cleanup
          usersMap.delete(assigneeId);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('assignment is rejected when ticket is CLOSED or RESOLVED regardless of user role', async () => {
    await fc.assert(
      fc.asyncProperty(
        terminalStatusArb,
        assignableRoleArb,
        priorityArb,
        categoryArb,
        fc.uuid(),
        fc.uuid(),
        async (status, role, priority, category, ticketId, assigneeId) => {
          // Clean store for each run
          ticketStore.clear();

          // Setup: create ticket with terminal status
          const ticket = createTestTicket(ticketId, status, priority, category);
          ticketStore.set(ticketId, ticket);

          // Setup: create user with valid role (TECHNICIAN or ADMIN)
          const user = createTestUser(assigneeId, role);
          usersMap.set(assigneeId, user);

          // Act
          const result = await ticketService.assignTicket(ticketId, assigneeId, 'admin-actor');

          // Assert: assignment is rejected
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toContain('CLOSED or RESOLVED');
          }

          // Verify ticket status unchanged
          const storedTicket = ticketStore.get(ticketId)!;
          expect(storedTicket.status).toBe(status);

          // Cleanup
          usersMap.delete(assigneeId);
        }
      ),
      { numRuns: 200 }
    );
  });
});
