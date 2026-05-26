import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { paginate } from '../utils/pagination.js';

/**
 * Property 8: Pagination Consistency
 *
 * For any page number, page size, and total ticket count, the returned page shall contain
 * at most pageSize items, the offset shall equal (page-1)*pageSize, and the total count
 * shall reflect the full unfiltered result set size.
 *
 * **Validates: Requirements 4.5**
 */

describe('Property 8: Pagination Consistency', () => {
  // Generator for valid pagination params (page >= 1, pageSize 1-100)
  const validPage = fc.integer({ min: 1, max: 50 });
  const validPageSize = fc.integer({ min: 1, max: 100 });

  it('items.length <= pageSize for any array and valid pagination params', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 200 }),
        validPage,
        validPageSize,
        (items, page, pageSize) => {
          const result = paginate(items, { page, pageSize });
          expect(result.items.length).toBeLessThanOrEqual(pageSize);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('totalCount equals the original array length for any array and valid pagination params', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 200 }),
        validPage,
        validPageSize,
        (items, page, pageSize) => {
          const result = paginate(items, { page, pageSize });
          expect(result.totalCount).toBe(items.length);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('items returned are the correct slice at offset = (page-1)*pageSize', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 200 }),
        validPage,
        validPageSize,
        (items, page, pageSize) => {
          const result = paginate(items, { page, pageSize });
          const offset = (page - 1) * pageSize;
          const expectedSlice = items.slice(offset, offset + pageSize);
          expect(result.items).toEqual(expectedSlice);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('totalPages = Math.ceil(totalCount / pageSize)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 200 }),
        validPage,
        validPageSize,
        (items, page, pageSize) => {
          const result = paginate(items, { page, pageSize });
          const expectedTotalPages = Math.ceil(items.length / pageSize);
          expect(result.totalPages).toBe(expectedTotalPages);
        },
      ),
      { numRuns: 500 },
    );
  });
});
