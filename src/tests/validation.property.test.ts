import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateTicketInput, validateCommentInput } from '../utils/validation';
import { TicketCategory, Priority } from '../models';

/**
 * Property 2: Input Validation Correctness
 *
 * For any string input, the ticket validation function shall accept titles of 1-200 characters
 * and reject empty or longer titles; accept descriptions of 1-5000 characters and reject empty
 * or longer descriptions; accept only valid category values; accept only valid priority values;
 * and accept comment content of 1-2000 characters and reject empty or longer content.
 *
 * **Validates: Requirements 1.2, 1.3, 1.4, 11.1, 11.2, 11.3, 11.4, 11.6**
 */

const validCategories = Object.values(TicketCategory);
const validPriorities = Object.values(Priority);

// Helper: generate a string with at least one non-whitespace character within a length range
function nonWhitespaceString(minLength: number, maxLength: number): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.integer({ min: minLength, max: maxLength }),
      fc.integer({ min: 0, max: maxLength - 1 }),
    )
    .chain(([len, pos]) => {
      const nonWsPos = Math.min(pos, len - 1);
      return fc.tuple(
        fc.constant(len),
        fc.constant(nonWsPos),
        // Generate a non-whitespace character for the required position
        fc.string({ minLength: 1, maxLength: 1 }).filter((c: string) => c.trim().length > 0),
        // Fill the rest with arbitrary characters
        fc.string({ minLength: len - 1, maxLength: len - 1 }),
      );
    })
    .map(([len, nonWsPos, nonWsChar, rest]) => {
      // Insert the non-whitespace char at the specified position
      const chars = rest.slice(0, len - 1).padEnd(len - 1, ' ');
      return chars.slice(0, nonWsPos) + nonWsChar + chars.slice(nonWsPos);
    })
    .filter((s) => s.length >= minLength && s.length <= maxLength && s.trim().length > 0);
}

// Simpler approach: generate valid strings by ensuring at least one non-whitespace char
function validString(minLength: number, maxLength: number): fc.Arbitrary<string> {
  return fc
    .string({ minLength, maxLength })
    .filter((s) => s.trim().length > 0);
}

describe('Property 2: Input Validation Correctness', () => {
  describe('Title validation', () => {
    it('should accept any string with length 1-200 containing at least one non-whitespace character', () => {
      fc.assert(
        fc.property(validString(1, 200), (title) => {
          const result = validateTicketInput({
            title,
            description: 'Valid description',
            category: TicketCategory.HARDWARE,
            priority: Priority.MEDIUM,
            reporterId: 'user-1',
          });
          expect(result.errors.title).toBeUndefined();
        }),
        { numRuns: 200 },
      );
    });

    it('should reject empty strings', () => {
      const result = validateTicketInput({
        title: '',
        description: 'Valid description',
        category: TicketCategory.HARDWARE,
        priority: Priority.MEDIUM,
        reporterId: 'user-1',
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.title).toBeDefined();
    });

    it('should reject strings exceeding 200 characters', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 201, maxLength: 500 }).filter((s) => s.trim().length > 0),
          (title) => {
            const result = validateTicketInput({
              title,
              description: 'Valid description',
              category: TicketCategory.HARDWARE,
              priority: Priority.MEDIUM,
              reporterId: 'user-1',
            });
            expect(result.isValid).toBe(false);
            expect(result.errors.title).toBeDefined();
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should reject whitespace-only strings', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 200 }).map((arr) => arr.join('')),
          (title) => {
            const result = validateTicketInput({
              title,
              description: 'Valid description',
              category: TicketCategory.HARDWARE,
              priority: Priority.MEDIUM,
              reporterId: 'user-1',
            });
            expect(result.isValid).toBe(false);
            expect(result.errors.title).toBeDefined();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Description validation', () => {
    it('should accept any string with length 1-5000 containing at least one non-whitespace character', () => {
      fc.assert(
        fc.property(validString(1, 5000), (description) => {
          const result = validateTicketInput({
            title: 'Valid title',
            description,
            category: TicketCategory.HARDWARE,
            priority: Priority.MEDIUM,
            reporterId: 'user-1',
          });
          expect(result.errors.description).toBeUndefined();
        }),
        { numRuns: 200 },
      );
    });

    it('should reject empty strings', () => {
      const result = validateTicketInput({
        title: 'Valid title',
        description: '',
        category: TicketCategory.HARDWARE,
        priority: Priority.MEDIUM,
        reporterId: 'user-1',
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.description).toBeDefined();
    });

    it('should reject strings exceeding 5000 characters', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5001, maxLength: 6000 }).filter((s) => s.trim().length > 0),
          (description) => {
            const result = validateTicketInput({
              title: 'Valid title',
              description,
              category: TicketCategory.HARDWARE,
              priority: Priority.MEDIUM,
              reporterId: 'user-1',
            });
            expect(result.isValid).toBe(false);
            expect(result.errors.description).toBeDefined();
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should reject whitespace-only strings', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 200 }).map((arr) => arr.join('')),
          (description) => {
            const result = validateTicketInput({
              title: 'Valid title',
              description,
              category: TicketCategory.HARDWARE,
              priority: Priority.MEDIUM,
              reporterId: 'user-1',
            });
            expect(result.isValid).toBe(false);
            expect(result.errors.description).toBeDefined();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Category validation', () => {
    it('should accept all valid TicketCategory values', () => {
      fc.assert(
        fc.property(fc.constantFrom(...validCategories), (category) => {
          const result = validateTicketInput({
            title: 'Valid title',
            description: 'Valid description',
            category,
            priority: Priority.MEDIUM,
            reporterId: 'user-1',
          });
          expect(result.errors.category).toBeUndefined();
        }),
      );
    });

    it('should reject any string not in the TicketCategory enum', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(
            (s) => !validCategories.includes(s as TicketCategory),
          ),
          (category) => {
            const result = validateTicketInput({
              title: 'Valid title',
              description: 'Valid description',
              category: category as TicketCategory,
              priority: Priority.MEDIUM,
              reporterId: 'user-1',
            });
            expect(result.isValid).toBe(false);
            expect(result.errors.category).toBeDefined();
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  describe('Priority validation', () => {
    it('should accept all valid Priority values', () => {
      fc.assert(
        fc.property(fc.constantFrom(...validPriorities), (priority) => {
          const result = validateTicketInput({
            title: 'Valid title',
            description: 'Valid description',
            category: TicketCategory.HARDWARE,
            priority,
            reporterId: 'user-1',
          });
          expect(result.errors.priority).toBeUndefined();
        }),
      );
    });

    it('should reject any string not in the Priority enum', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(
            (s) => !validPriorities.includes(s as Priority),
          ),
          (priority) => {
            const result = validateTicketInput({
              title: 'Valid title',
              description: 'Valid description',
              category: TicketCategory.HARDWARE,
              priority: priority as Priority,
              reporterId: 'user-1',
            });
            expect(result.isValid).toBe(false);
            expect(result.errors.priority).toBeDefined();
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  describe('Comment content validation', () => {
    it('should accept any string with length 1-2000 containing at least one non-whitespace character', () => {
      fc.assert(
        fc.property(validString(1, 2000), (content) => {
          const result = validateCommentInput(content);
          expect(result.isValid).toBe(true);
          expect(result.errors.content).toBeUndefined();
        }),
        { numRuns: 200 },
      );
    });

    it('should reject empty strings', () => {
      const result = validateCommentInput('');
      expect(result.isValid).toBe(false);
      expect(result.errors.content).toBeDefined();
    });

    it('should reject strings exceeding 2000 characters', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 2001, maxLength: 3000 }).filter((s) => s.trim().length > 0),
          (content) => {
            const result = validateCommentInput(content);
            expect(result.isValid).toBe(false);
            expect(result.errors.content).toBeDefined();
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should reject whitespace-only strings', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 200 }).map((arr) => arr.join('')),
          (content) => {
            const result = validateCommentInput(content);
            expect(result.isValid).toBe(false);
            expect(result.errors.content).toBeDefined();
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
