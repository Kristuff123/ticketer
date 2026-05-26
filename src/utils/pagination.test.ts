import { describe, it, expect } from 'vitest';
import { validatePaginationParams, paginate } from './pagination.js';

describe('validatePaginationParams', () => {
  it('accepts valid params', () => {
    const result = validatePaginationParams({ page: 1, pageSize: 20 });
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('accepts empty params (defaults will be used)', () => {
    const result = validatePaginationParams({});
    expect(result.isValid).toBe(true);
  });

  it('rejects page < 1', () => {
    const result = validatePaginationParams({ page: 0 });
    expect(result.isValid).toBe(false);
    expect(result.errors.page).toBeDefined();
  });

  it('rejects negative page', () => {
    const result = validatePaginationParams({ page: -5 });
    expect(result.isValid).toBe(false);
    expect(result.errors.page).toBeDefined();
  });

  it('rejects pageSize < 1', () => {
    const result = validatePaginationParams({ pageSize: 0 });
    expect(result.isValid).toBe(false);
    expect(result.errors.pageSize).toBeDefined();
  });

  it('rejects pageSize > 100', () => {
    const result = validatePaginationParams({ pageSize: 101 });
    expect(result.isValid).toBe(false);
    expect(result.errors.pageSize).toBeDefined();
  });

  it('accepts pageSize = 100 (boundary)', () => {
    const result = validatePaginationParams({ pageSize: 100 });
    expect(result.isValid).toBe(true);
  });

  it('accepts pageSize = 1 (boundary)', () => {
    const result = validatePaginationParams({ pageSize: 1 });
    expect(result.isValid).toBe(true);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 50 }, (_, i) => i + 1);

  it('uses default page=1 and pageSize=20', () => {
    const result = paginate(items, {});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.items).toEqual(items.slice(0, 20));
    expect(result.totalCount).toBe(50);
    expect(result.totalPages).toBe(3);
  });

  it('returns correct page of results', () => {
    const result = paginate(items, { page: 2, pageSize: 20 });
    expect(result.items).toEqual(items.slice(20, 40));
    expect(result.page).toBe(2);
    expect(result.totalCount).toBe(50);
  });

  it('returns partial last page', () => {
    const result = paginate(items, { page: 3, pageSize: 20 });
    expect(result.items).toEqual(items.slice(40, 50));
    expect(result.items.length).toBe(10);
    expect(result.totalPages).toBe(3);
  });

  it('returns empty items for page beyond total', () => {
    const result = paginate(items, { page: 10, pageSize: 20 });
    expect(result.items).toEqual([]);
    expect(result.totalCount).toBe(50);
    expect(result.totalPages).toBe(3);
  });

  it('handles empty items array', () => {
    const result = paginate([], { page: 1, pageSize: 20 });
    expect(result.items).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it('calculates totalPages correctly', () => {
    const result = paginate(items, { pageSize: 15 });
    expect(result.totalPages).toBe(4); // ceil(50/15) = 4
  });

  it('respects custom pageSize', () => {
    const result = paginate(items, { page: 1, pageSize: 5 });
    expect(result.items).toEqual([1, 2, 3, 4, 5]);
    expect(result.totalPages).toBe(10);
  });
});
