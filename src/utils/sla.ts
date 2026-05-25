import { Priority } from '../models';

/**
 * SLA duration in hours for each priority level.
 */
export const SLA_HOURS: Record<Priority, number> = {
  [Priority.CRITICAL]: 4,
  [Priority.HIGH]: 8,
  [Priority.MEDIUM]: 24,
  [Priority.LOW]: 72,
};

/**
 * Calculates the SLA due date based on priority and creation timestamp.
 * The due date is always strictly later than the creation date.
 *
 * @param priority - The ticket priority level
 * @param createdAt - The ticket creation timestamp
 * @returns The calculated due date
 */
export function calculateDueDate(priority: Priority, createdAt: Date): Date {
  const hours = SLA_HOURS[priority];
  const dueDate = new Date(createdAt.getTime() + hours * 60 * 60 * 1000);
  return dueDate;
}

/**
 * Recalculates the SLA due date when a ticket's priority changes.
 * Uses the original creation time as the base for calculation.
 *
 * @param newPriority - The new priority level after the change
 * @param originalCreatedAt - The original ticket creation timestamp
 * @returns The recalculated due date
 */
export function recalculateDueDate(newPriority: Priority, originalCreatedAt: Date): Date {
  return calculateDueDate(newPriority, originalCreatedAt);
}
