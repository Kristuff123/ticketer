const DEFAULT_JWT_SECRET = "dev-secret-do-not-use-in-production";
const DEFAULT_TOKEN_EXPIRATION = "15m";
const DEFAULT_PG_POOL_MAX = 10;
const PG_POOL_MAX_MIN = 1;
const PG_POOL_MAX_MAX = 100;
const DEFAULT_REDIS_HOST = "localhost";
const DEFAULT_REDIS_PORT = "6379";

interface DemoPasswords {
  admin: string;
  technician: string;
  reporter: string;
}

const DEVELOPMENT_PASSWORDS: DemoPasswords = {
  admin: "admin123",
  technician: "tech123",
  reporter: "reporter123",
};

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function getPort(): number {
  return parseInt(process.env.PORT || "3000", 10);
}

export function getJwtSecret(): string {
  return process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
}

export function getTokenExpiration(): string {
  return process.env.JWT_EXPIRES_IN || DEFAULT_TOKEN_EXPIRATION;
}

export function getJsonBodyLimit(): string {
  return process.env.JSON_BODY_LIMIT || "100kb";
}

export function getAllowedCorsOrigins(): string[] {
  const origins = process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || "";
  return origins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getDemoPasswords(): DemoPasswords {
  return {
    admin: process.env.ADMIN_PASSWORD || DEVELOPMENT_PASSWORDS.admin,
    technician:
      process.env.TECHNICIAN_PASSWORD || DEVELOPMENT_PASSWORDS.technician,
    reporter: process.env.REPORTER_PASSWORD || DEVELOPMENT_PASSWORDS.reporter,
  };
}

export function getDatabaseUrl(): string | null {
  return process.env.DATABASE_URL ?? null;
}

export function getRedisUrl(): string {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }
  const host = process.env.REDIS_HOST ?? DEFAULT_REDIS_HOST;
  const port = process.env.REDIS_PORT ?? DEFAULT_REDIS_PORT;
  return `redis://${host}:${port}`;
}

export function getPgPoolMax(): number {
  const raw = process.env.PG_POOL_MAX;
  if (raw === undefined || raw === "") {
    return DEFAULT_PG_POOL_MAX;
  }

  // Reject decimals and any non-integer-looking input by requiring the
  // string to consist of an optional sign followed by digits only.
  if (!/^[+-]?\d+$/.test(raw)) {
    return DEFAULT_PG_POOL_MAX;
  }

  const parsed = Number.parseInt(raw, 10);
  if (
    Number.isNaN(parsed) ||
    parsed < PG_POOL_MAX_MIN ||
    parsed > PG_POOL_MAX_MAX
  ) {
    return DEFAULT_PG_POOL_MAX;
  }

  return parsed;
}

export function isPgSslEnabled(): boolean {
  return process.env.PGSSL === "true" || process.env.DATABASE_SSL === "true";
}

export function assertPersistenceConfig(): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
  const hasPgHost = Boolean(process.env.PGHOST);

  if (!hasDatabaseUrl && !hasPgHost) {
    process.stderr.write(
      "FATAL: NODE_ENV=production requires DATABASE_URL or PGHOST to be set.\n",
    );
    process.exit(1);
  }

  if (!hasDatabaseUrl) {
    process.stderr.write(
      "WARNING: NODE_ENV=production but DATABASE_URL is not set; falling back to individual PG* environment variables.\n",
    );
  }
}

export function validateRuntimeConfig(): string[] {
  if (!isProduction()) {
    return [];
  }

  const issues: string[] = [];
  const jwtSecret = getJwtSecret();

  if (jwtSecret === DEFAULT_JWT_SECRET || jwtSecret.length < 32) {
    issues.push(
      "JWT_SECRET must be set to a unique value with at least 32 characters.",
    );
  }

  if (
    !process.env.ADMIN_PASSWORD ||
    !process.env.TECHNICIAN_PASSWORD ||
    !process.env.REPORTER_PASSWORD
  ) {
    issues.push(
      "ADMIN_PASSWORD, TECHNICIAN_PASSWORD, and REPORTER_PASSWORD must be set in production while demo users are active.",
    );
  }

  return issues;
}

export function assertRuntimeConfig(): void {
  const issues = validateRuntimeConfig();
  if (issues.length > 0) {
    throw new Error(
      `Invalid production configuration:\n- ${issues.join("\n- ")}`,
    );
  }
}
