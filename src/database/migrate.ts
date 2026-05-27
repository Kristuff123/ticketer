import "dotenv/config";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { runner } from "node-pg-migrate";
import { assertPersistenceConfig, getDatabaseUrl } from "../config/env.js";

const CONNECTION_TIMEOUT_MS = 10_000;
const MIGRATIONS_TABLE = "pgmigrations";

interface MigrationLikeError extends Error {
  migration?: { name?: string };
}

/**
 * Builds a fallback PostgreSQL connection URL from individual PG* env vars.
 * Encodes user and password to keep the URL well-formed when credentials
 * include reserved characters.
 */
function buildFallbackDatabaseUrl(): string {
  const user = encodeURIComponent(process.env.PGUSER ?? "");
  const password = encodeURIComponent(process.env.PGPASSWORD ?? "");
  const host = process.env.PGHOST ?? "localhost";
  const port = process.env.PGPORT ?? "5432";
  const database = process.env.PGDATABASE ?? "app_db";
  const credentials = user || password ? `${user}:${password}@` : "";
  return `postgresql://${credentials}${host}:${port}/${database}`;
}

/**
 * Verifies the database is reachable before attempting migrations.
 * Logs and exits with status 1 on timeout or any other connection error.
 */
async function probeConnection(connectionString: string): Promise<void> {
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });

  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("__MIGRATE_PROBE_TIMEOUT__")),
      CONNECTION_TIMEOUT_MS,
    );
  });

  try {
    await Promise.race([client.connect(), timeoutPromise]);
  } catch (err) {
    if (timer) clearTimeout(timer);
    if (err instanceof Error && err.message === "__MIGRATE_PROBE_TIMEOUT__") {
      process.stderr.write("[migrate] Database connection timeout after 10s\n");
    } else {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `[migrate] Failed to connect to database: ${message}\n`,
      );
    }
    try {
      await client.end();
    } catch {
      // ignore: connection never opened or already closed
    }
    process.exit(1);
  } finally {
    if (timer) clearTimeout(timer);
  }

  try {
    await client.query("SELECT 1");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `[migrate] Failed to verify database connectivity: ${message}\n`,
    );
    try {
      await client.end();
    } catch {
      // ignore
    }
    process.exit(1);
  }

  await client.end();
}

/**
 * Runs all pending database migrations from the `migrations/` directory.
 *
 * - Resolves the connection string from `DATABASE_URL` or PG* env vars.
 * - Performs a 10-second pre-flight connection probe (Req 1.4, 1.11).
 * - Applies pending migrations in ascending order via `node-pg-migrate`.
 * - Exits the process with status 1 on any connection or migration failure
 *   so the HTTP server never starts against a broken schema.
 */
export async function runMigrations(): Promise<void> {
  const databaseUrlFromEnv = getDatabaseUrl();
  const databaseUrl = databaseUrlFromEnv ?? buildFallbackDatabaseUrl();

  if (process.env.NODE_ENV === "production" && !databaseUrlFromEnv) {
    process.stderr.write(
      "[migrate] WARNING: NODE_ENV=production but DATABASE_URL is unset; falling back to individual PG* environment variables.\n",
    );
  }

  await probeConnection(databaseUrl);

  const migrationsDir = path.resolve(process.cwd(), "migrations");

  let applied: ReadonlyArray<{ name: string; path: string }>;
  try {
    applied = await runner({
      databaseUrl,
      dir: migrationsDir,
      direction: "up",
      migrationsTable: MIGRATIONS_TABLE,
      verbose: false,
      singleTransaction: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failingName = (err as MigrationLikeError | undefined)?.migration
      ?.name;
    if (failingName) {
      process.stderr.write(
        `[migrate] Migration failed at "${failingName}": ${message}\n`,
      );
    } else {
      process.stderr.write(`[migrate] Migration failed: ${message}\n`);
    }
    process.exit(1);
  }

  if (applied.length === 0) {
    process.stdout.write("[migrate] No pending migrations.\n");
    return;
  }

  const last = applied[applied.length - 1];
  const version = last.name ?? last.path;
  process.stdout.write(
    `[migrate] Applied ${applied.length} migration(s); schema version: ${version}\n`,
  );
}

/**
 * Entry point for the `npm run migrate` script.
 * Enforces the production guard, runs migrations, then exits cleanly.
 */
export async function runMigrationsScript(): Promise<void> {
  try {
    assertPersistenceConfig();
    await runMigrations();
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[migrate] Unexpected error: ${message}\n`);
    process.exit(1);
  }
}

// CLI: when invoked directly (e.g., via `npm run migrate`), execute the script.
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  void runMigrationsScript();
}
