import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateDueDate, recalculateDueDate, SLA_HOURS } from '../utils/sla.js';
import { Priority } from '../models/index.js';

/**
 * Property 3: SLA Due Date Calculation
 * Validates: Requirements 1.5, 9.1, 9.2, 9.3, 9.4, 9.5
 */
describe('Property 3: SLA Due Date Calculation', () => {
  const priorityArb = fc.constantFrom(
    Priority.CRITICAL,
    Priority.HIGH,
    Priority.MEDIUM,
    Priority.LOW
  );

  const validDateArb = fc.date({
    min: new Date('2000-01-01T00:00:00.000Z'),
    max: new Date('2100-01-01T00:00:00.000Z'),
    noInvalidDate: true,
  });

  it('calculateDueDate returns createdAt + SLA_HOURS[priority] hours for any priority and date', () => {
    /**
     * Validates: Requirements 1.5, 9.1, 9.2, 9.3, 9.4, 9.5
     */
    fc.assert(
      fc.property(priorityArb, validDateArb, (priority, createdAt) => {
        const dueDate = calculateDueDate(priority, createdAt);
        const expectedMs = createdAt.getTime() + SLA_HOURS[priority] * 60 * 60 * 1000;
        expect(dueDate.getTime()).toBe(expectedMs);
      })
    );
  });

  it('due date is always strictly later than creation date for any priority and date', () => {
    /**
     * Validates: Requirements 1.5, 9.1, 9.2, 9.3, 9.4, 9.5
     */
    fc.assert(
      fc.property(priorityArb, validDateArb, (priority, createdAt) => {
        const dueDate = calculateDueDate(priority, createdAt);
        expect(dueDate.getTime()).toBeGreaterThan(createdAt.getTime());
      })
    );
  });

  it('recalculateDueDate returns the same result as calculateDueDate with the same arguments', () => {
    /**
     * Validates: Requirements 1.5, 9.1, 9.2, 9.3, 9.4, 9.5
     */
    fc.assert(
      fc.property(priorityArb, validDateArb, (priority, createdAt) => {
        const dueDate = calculateDueDate(priority, createdAt);
        const recalculated = recalculateDueDate(priority, createdAt);
        expect(recalculated.getTime()).toBe(dueDate.getTime());
      })
    );
  });
});
