import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { UserService, TicketLookupFn } from '../services/user-service.js';
import { UserRole } from '../models/index.js';

/**
 * Property 10: Permission Enforcement
 *
 * For any user-ticket-operation combination, a Reporter shall only be able to
 * view and close their own tickets; a Technician shall only be able to change
 * status on tickets assigned to them; an Administrator shall be able to perform
 * all operations on all tickets. Any unauthorized operation shall be rejected.
 *
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
 */

const OPERATIONS = ['view', 'close', 'change_status', 'assign', 'add_comment', 'add_internal_comment'] as const;
type Operation = typeof OPERATIONS[number];

const operationArb = fc.constantFrom(...OPERATIONS);
const userIdArb = fc.constantFrom('admin-001', 'tech-001', 'reporter-001');
const ticketIdArb = fc.string({ minLength: 1, maxLength: 10 });

describe('Property 10: Permission Enforcement', () => {
  /**
   * 1. ADMIN users should always have permission for any operation on any ticket
   * **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
   */
  it('ADMIN users should always have permission for any operation on any ticket', async () => {
    const lookupFn: TicketLookupFn = async () => ({
      reporterId: 'reporter-001',
      assigneeId: 'tech-001',
    });

    const service = new UserService(lookupFn);

    await fc.assert(
      fc.asyncProperty(operationArb, ticketIdArb, async (operation, ticketId) => {
        const result = await service.hasPermission('admin-001', operation, ticketId);
        expect(result).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * 2. TECHNICIAN users should have 'view' permission for any ticket
   * **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
   */
  it('TECHNICIAN users should have view permission for any ticket', async () => {
    const lookupFn: TicketLookupFn = async () => ({
      reporterId: 'reporter-001',
      assigneeId: 'someone-else',
    });

    const service = new UserService(lookupFn);

    await fc.assert(
      fc.asyncProperty(ticketIdArb, async (ticketId) => {
        const result = await service.hasPermission('tech-001', 'view', ticketId);
        expect(result).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * 3. TECHNICIAN users should have 'change_status', 'add_comment', 'add_internal_comment'
   *    permission ONLY on tickets assigned to them
   * **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
   */
  it('TECHNICIAN users should have change_status, add_comment, add_internal_comment only on assigned tickets', async () => {
    const techOps = fc.constantFrom('change_status', 'add_comment', 'add_internal_comment') as fc.Arbitrary<Operation>;

    // When assigned to them - should have permission
    const assignedLookup: TicketLookupFn = async () => ({
      reporterId: 'reporter-001',
      assigneeId: 'tech-001',
    });
    const serviceAssigned = new UserService(assignedLookup);

    await fc.assert(
      fc.asyncProperty(techOps, ticketIdArb, async (operation, ticketId) => {
        const result = await serviceAssigned.hasPermission('tech-001', operation, ticketId);
        expect(result).toBe(true);
      }),
      { numRuns: 100 }
    );

    // When NOT assigned to them - should NOT have permission
    const notAssignedLookup: TicketLookupFn = async () => ({
      reporterId: 'reporter-001',
      assigneeId: 'someone-else',
    });
    const serviceNotAssigned = new UserService(notAssignedLookup);

    await fc.assert(
      fc.asyncProperty(techOps, ticketIdArb, async (operation, ticketId) => {
        const result = await serviceNotAssigned.hasPermission('tech-001', operation, ticketId);
        expect(result).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * 4. TECHNICIAN users should never have 'assign' permission
   * **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
   */
  it('TECHNICIAN users should never have assign permission', async () => {
    const assignedLookup: TicketLookupFn = async () => ({
      reporterId: 'reporter-001',
      assigneeId: 'tech-001',
    });
    const service = new UserService(assignedLookup);

    await fc.assert(
      fc.asyncProperty(ticketIdArb, async (ticketId) => {
        const result = await service.hasPermission('tech-001', 'assign', ticketId);
        expect(result).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * 5. REPORTER users should have 'view', 'close', 'add_comment' permission
   *    ONLY on tickets they reported
   * **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
   */
  it('REPORTER users should have view, close, add_comment only on own tickets', async () => {
    const reporterOps = fc.constantFrom('view', 'close', 'add_comment') as fc.Arbitrary<Operation>;

    // When they are the reporter - should have permission
    const ownTicketLookup: TicketLookupFn = async () => ({
      reporterId: 'reporter-001',
      assigneeId: 'tech-001',
    });
    const serviceOwn = new UserService(ownTicketLookup);

    await fc.assert(
      fc.asyncProperty(reporterOps, ticketIdArb, async (operation, ticketId) => {
        const result = await serviceOwn.hasPermission('reporter-001', operation, ticketId);
        expect(result).toBe(true);
      }),
      { numRuns: 100 }
    );

    // When they are NOT the reporter - should NOT have permission
    const otherTicketLookup: TicketLookupFn = async () => ({
      reporterId: 'someone-else',
      assigneeId: 'tech-001',
    });
    const serviceOther = new UserService(otherTicketLookup);

    await fc.assert(
      fc.asyncProperty(reporterOps, ticketIdArb, async (operation, ticketId) => {
        const result = await serviceOther.hasPermission('reporter-001', operation, ticketId);
        expect(result).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * 6. REPORTER users should never have 'add_internal_comment', 'assign', or 'change_status' permission
   * **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
   */
  it('REPORTER users should never have add_internal_comment, assign, or change_status permission', async () => {
    const forbiddenOps = fc.constantFrom('add_internal_comment', 'assign', 'change_status') as fc.Arbitrary<Operation>;

    // Even on their own tickets, these operations should be denied
    const ownTicketLookup: TicketLookupFn = async () => ({
      reporterId: 'reporter-001',
      assigneeId: 'tech-001',
    });
    const service = new UserService(ownTicketLookup);

    await fc.assert(
      fc.asyncProperty(forbiddenOps, ticketIdArb, async (operation, ticketId) => {
        const result = await service.hasPermission('reporter-001', operation, ticketId);
        expect(result).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});
