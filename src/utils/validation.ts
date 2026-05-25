import { TicketCategory, Priority } from '../models/index.js';
import { TicketCreateInput } from '../models/index.js';

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export function validateTicketInput(data: TicketCreateInput): ValidationResult {
  const errors: Record<string, string> = {};

  // Title validation: 1-200 characters, non-whitespace-only
  if (!data.title || data.title.trim().length === 0) {
    errors.title = 'Title must contain at least 1 non-whitespace character';
  } else if (data.title.length > 200) {
    errors.title = 'Title must not exceed 200 characters';
  }

  // Description validation: 1-5000 characters, non-whitespace-only
  if (!data.description || data.description.trim().length === 0) {
    errors.description = 'Description must contain at least 1 non-whitespace character';
  } else if (data.description.length > 5000) {
    errors.description = 'Description must not exceed 5000 characters';
  }

  // Category validation: must be valid TicketCategory enum value
  const validCategories = Object.values(TicketCategory);
  if (!validCategories.includes(data.category)) {
    errors.category = `Category must be one of: ${validCategories.join(', ')}`;
  }

  // Priority validation: must be valid Priority enum value
  const validPriorities = Object.values(Priority);
  if (!validPriorities.includes(data.priority)) {
    errors.priority = `Priority must be one of: ${validPriorities.join(', ')}`;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateCommentInput(content: string): ValidationResult {
  const errors: Record<string, string> = {};

  // Content validation: 1-2000 characters, non-whitespace-only
  if (!content || content.trim().length === 0) {
    errors.content = 'Comment content must contain at least 1 non-whitespace character';
  } else if (content.length > 2000) {
    errors.content = 'Comment content must not exceed 2000 characters';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateEmail(email: string): ValidationResult {
  const errors: Record<string, string> = {};

  if (!email || email.trim().length === 0) {
    errors.email = 'Email is required';
  } else {
    // Normalize to lowercase for case-insensitive comparison
    const normalized = email.toLowerCase();
    // Must match pattern: local-part@domain where domain has at least one dot
    // local-part: at least 1 character
    // domain: at least one dot (e.g., "example.com")
    const atIndex = normalized.indexOf('@');

    if (atIndex < 1) {
      errors.email = 'Email must have a local-part of at least 1 character before @';
    } else {
      const domain = normalized.slice(atIndex + 1);
      if (!domain || !domain.includes('.')) {
        errors.email = 'Email domain must contain at least one dot (e.g., example.com)';
      } else {
        // Ensure domain doesn't start or end with a dot and has content between dots
        const domainParts = domain.split('.');
        const hasInvalidPart = domainParts.some((part) => part.length === 0);
        if (hasInvalidPart) {
          errors.email = 'Email domain must have valid parts separated by dots';
        }
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
