import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { TicketStatus } from '../models/index.js';
import {
  validateStatusTransition,
  getAllowedTransitions,
  TRANSITION_MAP,
} from '../utils/status-transitions.js';

/**
 * Property 1: Valid Status Transitions
 *
 * For any ticket and any sequence of status changes applied to it, each transition
 * must be permitted by the defined state machine, and any transition not in this set
 * must be rejected.
 *
 * **Validates: Requirements 2.1, 2.2**
 */

const allStatuses = Object.values(TicketStatus);

const statusArb = fc.constantFrom(...allStatuses);

describe('Property 1: Valid Status Transitions', () => {
  it('validateStatusTransition returns true for all valid transitions defined in TRANSITION_MAP', () => {
    // Build all valid (from, to) pairs from the TRANSITION_MAP
    const validPairs: [TicketStatus, TicketStatus][] = [];
    for (const [from, targets] of Object.entries(TRANSITION_MAP)) {
      for (const to of targets) {
        validPairs.push([from as TicketStatus, to]);
      }
    }

    const validPairArb = fc.constantFrom(...validPairs);

    fc.assert(
      fc.property(validPairArb, ([from, to]) => {
        expect(validateStatusTransition(from, to)).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it('validateStatusTransition returns false for all invalid transitions (not in TRANSITION_MAP)', () => {
    fc.assert(
      fc.property(statusArb, statusArb, (from, to) => {
        const allowed = TRANSITION_MAP[from];
        if (!allowed.includes(to)) {
          expect(validateStatusTransition(from, to)).toBe(false);
        }
      }),
      { numRuns: 500 }
    );
  });

  it('getAllowedTransitions returns the same array as TRANSITION_MAP[status]', () => {
    fc.assert(
      fc.property(statusArb, (status) => {
        const result = getAllowedTransitions(status);
        const expected = TRANSITION_MAP[status];
        expect(result).toEqual(expected);
      }),
      { numRuns: 100 }
    );
  });

  it('random sequences of status changes starting from NEW are correctly accepted or rejected', () => {
    // Generate a random sequence of statuses to attempt transitioning through
    const statusSequenceArb = fc.array(statusArb, { minLength: 1, maxLength: 20 });

    fc.assert(
      fc.property(statusSequenceArb, (sequence) => {
        let currentStatus = TicketStatus.NEW;

        for (const nextStatus of sequence) {
          const isValid = validateStatusTransition(currentStatus, nextStatus);
          const allowed: TicketStatus[] = TRANSITION_MAP[currentStatus];

          if (allowed.includes(nextStatus)) {
            // Valid transition: should be accepted
            expect(isValid).toBe(true);
            currentStatus = nextStatus;
          } else {
            // Invalid transition: should be rejected
            expect(isValid).toBe(false);
            // Status should NOT change on invalid transition
          }
        }
      }),
      { numRuns: 500 }
    );
  });
});
