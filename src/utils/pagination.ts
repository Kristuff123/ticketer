import { ValidationResult } from './validation';

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginationResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationError {
  field: string;
  message: string;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export function validatePaginationParams(params: PaginationParams): ValidationResult {
  const errors: Record<string, string> = {};

  if (params.page !== undefined && params.page < 1) {
    errors.page = 'Page number must be at least 1';
  }

  if (params.pageSize !== undefined) {
    if (params.pageSize < 1) {
      errors.pageSize = 'Page size must be at least 1';
    } else if (params.pageSize > MAX_PAGE_SIZE) {
      errors.pageSize = `Page size must not exceed ${MAX_PAGE_SIZE}`;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function paginate<T>(items: T[], params: PaginationParams): PaginationResult<T> {
  const page = params.page ?? DEFAULT_PAGE;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;

  const totalCount = items.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const offset = (page - 1) * pageSize;
  const paginatedItems = items.slice(offset, offset + pageSize);

  return {
    items: paginatedItems,
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}
