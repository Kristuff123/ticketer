import { afterEach, describe, expect, it } from 'vitest';
import { validateRuntimeConfig } from './env.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('runtime configuration', () => {
  it('allows development defaults', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.TECHNICIAN_PASSWORD;
    delete process.env.REPORTER_PASSWORD;

    expect(validateRuntimeConfig()).toEqual([]);
  });

  it('rejects unsafe production defaults', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'short';
    delete process.env.ADMIN_PASSWORD;
    delete process.env.TECHNICIAN_PASSWORD;
    delete process.env.REPORTER_PASSWORD;

    const issues = validateRuntimeConfig();

    expect(issues).toContain(
      'JWT_SECRET must be set to a unique value with at least 32 characters.'
    );
    expect(issues).toContain(
      'ADMIN_PASSWORD, TECHNICIAN_PASSWORD, and REPORTER_PASSWORD must be set in production while demo users are active.'
    );
  });

  it('accepts required production settings', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-production-secret-with-enough-length';
    process.env.ADMIN_PASSWORD = 'admin-production-password';
    process.env.TECHNICIAN_PASSWORD = 'technician-production-password';
    process.env.REPORTER_PASSWORD = 'reporter-production-password';

    expect(validateRuntimeConfig()).toEqual([]);
  });
});
