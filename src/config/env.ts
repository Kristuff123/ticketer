const DEFAULT_JWT_SECRET = 'dev-secret-do-not-use-in-production';
const DEFAULT_TOKEN_EXPIRATION = '15m';

interface DemoPasswords {
  admin: string;
  technician: string;
  reporter: string;
}

const DEVELOPMENT_PASSWORDS: DemoPasswords = {
  admin: 'admin123',
  technician: 'tech123',
  reporter: 'reporter123',
};

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function getPort(): number {
  return parseInt(process.env.PORT || '3000', 10);
}

export function getJwtSecret(): string {
  return process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
}

export function getTokenExpiration(): string {
  return process.env.JWT_EXPIRES_IN || DEFAULT_TOKEN_EXPIRATION;
}

export function getJsonBodyLimit(): string {
  return process.env.JSON_BODY_LIMIT || '100kb';
}

export function getAllowedCorsOrigins(): string[] {
  const origins = process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || '';
  return origins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getDemoPasswords(): DemoPasswords {
  return {
    admin: process.env.ADMIN_PASSWORD || DEVELOPMENT_PASSWORDS.admin,
    technician: process.env.TECHNICIAN_PASSWORD || DEVELOPMENT_PASSWORDS.technician,
    reporter: process.env.REPORTER_PASSWORD || DEVELOPMENT_PASSWORDS.reporter,
  };
}

export function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL;
}

export function validateRuntimeConfig(): string[] {
  if (!isProduction()) {
    return [];
  }

  const issues: string[] = [];
  const jwtSecret = getJwtSecret();

  if (jwtSecret === DEFAULT_JWT_SECRET || jwtSecret.length < 32) {
    issues.push('JWT_SECRET must be set to a unique value with at least 32 characters.');
  }

  if (!process.env.ADMIN_PASSWORD || !process.env.TECHNICIAN_PASSWORD || !process.env.REPORTER_PASSWORD) {
    issues.push('ADMIN_PASSWORD, TECHNICIAN_PASSWORD, and REPORTER_PASSWORD must be set in production while demo users are active.');
  }

  return issues;
}

export function assertRuntimeConfig(): void {
  const issues = validateRuntimeConfig();
  if (issues.length > 0) {
    throw new Error(`Invalid production configuration:\n- ${issues.join('\n- ')}`);
  }
}
