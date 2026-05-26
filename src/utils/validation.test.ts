import { describe, it, expect } from 'vitest';
import { validateTicketInput, validateCommentInput, validateEmail } from './validation.js';
import { TicketCategory, Priority } from '../models/index.js';
import { TicketCreateInput } from '../models/index.js';

describe('validateTicketInput', () => {
  const validInput: TicketCreateInput = {
    title: 'Monitor not working',
    description: 'The screen is frozen and unresponsive',
    category: TicketCategory.HARDWARE,
    priority: Priority.MEDIUM,
    reporterId: 'user-123',
  };

  it('should accept valid input', () => {
    const result = validateTicketInput(validInput);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
  });

  // Title validation
  it('should reject empty title', () => {
    const result = validateTicketInput({ ...validInput, title: '' });
    expect(result.isValid).toBe(false);
    expect(result.errors.title).toBeDefined();
  });

  it('should reject whitespace-only title', () => {
    const result = validateTicketInput({ ...validInput, title: '   ' });
    expect(result.isValid).toBe(false);
    expect(result.errors.title).toBeDefined();
  });

  it('should reject title exceeding 200 characters', () => {
    const result = validateTicketInput({ ...validInput, title: 'a'.repeat(201) });
    expect(result.isValid).toBe(false);
    expect(result.errors.title).toBeDefined();
  });

  it('should accept title at exactly 200 characters', () => {
    const result = validateTicketInput({ ...validInput, title: 'a'.repeat(200) });
    expect(result.isValid).toBe(true);
  });

  // Description validation
  it('should reject empty description', () => {
    const result = validateTicketInput({ ...validInput, description: '' });
    expect(result.isValid).toBe(false);
    expect(result.errors.description).toBeDefined();
  });

  it('should reject whitespace-only description', () => {
    const result = validateTicketInput({ ...validInput, description: '  \n\t  ' });
    expect(result.isValid).toBe(false);
    expect(result.errors.description).toBeDefined();
  });

  it('should reject description exceeding 5000 characters', () => {
    const result = validateTicketInput({ ...validInput, description: 'a'.repeat(5001) });
    expect(result.isValid).toBe(false);
    expect(result.errors.description).toBeDefined();
  });

  it('should accept description at exactly 5000 characters', () => {
    const result = validateTicketInput({ ...validInput, description: 'a'.repeat(5000) });
    expect(result.isValid).toBe(true);
  });

  // Category validation
  it('should reject invalid category', () => {
    const result = validateTicketInput({ ...validInput, category: 'INVALID' as TicketCategory });
    expect(result.isValid).toBe(false);
    expect(result.errors.category).toBeDefined();
  });

  it('should accept all valid categories', () => {
    for (const category of Object.values(TicketCategory)) {
      const result = validateTicketInput({ ...validInput, category });
      expect(result.isValid).toBe(true);
    }
  });

  // Priority validation
  it('should reject invalid priority', () => {
    const result = validateTicketInput({ ...validInput, priority: 'URGENT' as Priority });
    expect(result.isValid).toBe(false);
    expect(result.errors.priority).toBeDefined();
  });

  it('should accept all valid priorities', () => {
    for (const priority of Object.values(Priority)) {
      const result = validateTicketInput({ ...validInput, priority });
      expect(result.isValid).toBe(true);
    }
  });

  // Multiple errors
  it('should collect all errors without short-circuiting', () => {
    const result = validateTicketInput({
      title: '',
      description: '',
      category: 'INVALID' as TicketCategory,
      priority: 'INVALID' as Priority,
      reporterId: 'user-123',
    });
    expect(result.isValid).toBe(false);
    expect(Object.keys(result.errors)).toHaveLength(4);
    expect(result.errors.title).toBeDefined();
    expect(result.errors.description).toBeDefined();
    expect(result.errors.category).toBeDefined();
    expect(result.errors.priority).toBeDefined();
  });
});

describe('validateCommentInput', () => {
  it('should accept valid comment content', () => {
    const result = validateCommentInput('This is a valid comment');
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('should reject empty content', () => {
    const result = validateCommentInput('');
    expect(result.isValid).toBe(false);
    expect(result.errors.content).toBeDefined();
  });

  it('should reject whitespace-only content', () => {
    const result = validateCommentInput('   \t\n  ');
    expect(result.isValid).toBe(false);
    expect(result.errors.content).toBeDefined();
  });

  it('should reject content exceeding 2000 characters', () => {
    const result = validateCommentInput('a'.repeat(2001));
    expect(result.isValid).toBe(false);
    expect(result.errors.content).toBeDefined();
  });

  it('should accept content at exactly 2000 characters', () => {
    const result = validateCommentInput('a'.repeat(2000));
    expect(result.isValid).toBe(true);
  });

  it('should accept single character content', () => {
    const result = validateCommentInput('x');
    expect(result.isValid).toBe(true);
  });
});

describe('validateEmail', () => {
  it('should accept valid email', () => {
    const result = validateEmail('user@example.com');
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('should accept email with subdomain', () => {
    const result = validateEmail('user@mail.example.com');
    expect(result.isValid).toBe(true);
  });

  it('should reject empty email', () => {
    const result = validateEmail('');
    expect(result.isValid).toBe(false);
    expect(result.errors.email).toBeDefined();
  });

  it('should reject email without @', () => {
    const result = validateEmail('userexample.com');
    expect(result.isValid).toBe(false);
    expect(result.errors.email).toBeDefined();
  });

  it('should reject email without domain dot', () => {
    const result = validateEmail('user@example');
    expect(result.isValid).toBe(false);
    expect(result.errors.email).toBeDefined();
  });

  it('should reject email with empty local-part', () => {
    const result = validateEmail('@example.com');
    expect(result.isValid).toBe(false);
    expect(result.errors.email).toBeDefined();
  });

  it('should reject email with domain starting with dot', () => {
    const result = validateEmail('user@.example.com');
    expect(result.isValid).toBe(false);
    expect(result.errors.email).toBeDefined();
  });

  it('should reject email with domain ending with dot', () => {
    const result = validateEmail('user@example.');
    expect(result.isValid).toBe(false);
    expect(result.errors.email).toBeDefined();
  });

  it('should handle case-insensitive emails (normalization)', () => {
    const result = validateEmail('User@Example.COM');
    expect(result.isValid).toBe(true);
  });
});
