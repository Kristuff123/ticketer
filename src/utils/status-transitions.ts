import { TicketStatus } from '../models/index.js';

/**
 * Defines all valid status transitions in the ticket lifecycle state machine.
 */
export const TRANSITION_MAP: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.NEW]: [TicketStatus.IN_PROGRESS, TicketStatus.CLOSED],
  [TicketStatus.IN_PROGRESS]: [TicketStatus.WAITING_FOR_INFO, TicketStatus.RESOLVED, TicketStatus.CLOSED],
  [TicketStatus.WAITING_FOR_INFO]: [TicketStatus.IN_PROGRESS, TicketStatus.CLOSED],
  [TicketStatus.RESOLVED]: [TicketStatus.CLOSED, TicketStatus.REOPENED],
  [TicketStatus.CLOSED]: [TicketStatus.REOPENED],
  [TicketStatus.REOPENED]: [TicketStatus.IN_PROGRESS, TicketStatus.CLOSED],
};

/**
 * Validates whether a status transition from one state to another is allowed.
 */
export function validateStatusTransition(from: TicketStatus, to: TicketStatus): boolean {
  const allowed = TRANSITION_MAP[from];
  return allowed.includes(to);
}

/**
 * Returns the list of statuses that can be transitioned to from the given status.
 */
export function getAllowedTransitions(from: TicketStatus): TicketStatus[] {
  return TRANSITION_MAP[from];
}
