import pg from "pg";
import { getDatabaseUrl, getPgPoolMax, isPgSslEnabled } from "../config/env.js";

const { Pool } = pg;

const databaseUrl = getDatabaseUrl();
const sslConfig: pg.PoolConfig["ssl"] = isPgSslEnabled()
  ? { rejectUnauthorized: false }
  : false;

const pool = new Pool(
  databaseUrl
    ? {
        connectionString: databaseUrl,
        max: getPgPoolMax(),
        ssl: sslConfig,
      }
    : {
        host: process.env.PGHOST ?? "localhost",
        port: parseInt(process.env.PGPORT ?? "5432", 10),
        database: process.env.PGDATABASE ?? "app_db",
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        max: getPgPoolMax(),
        ssl: sslConfig,
      },
);

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number | null;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const result = await pool.query(text, params);
  return { rows: result.rows as T[], rowCount: result.rowCount };
}

export async function getClient(): Promise<pg.PoolClient> {
  return pool.connect();
}

/**
 * Lightweight health-check probe. Acquires a client from the pool, runs
 * `SELECT 1`, then releases the client. Throws on any database error so
 * callers can treat a rejected promise as a failed connectivity check.
 */
export async function pingDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}

const POOL_DRAIN_TIMEOUT_MS = 30_000;

process.once("SIGTERM", async () => {
  console.log("[db] SIGTERM received, draining connection pool...");

  const drainTimeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("Pool drain timeout")),
      POOL_DRAIN_TIMEOUT_MS,
    ),
  );

  try {
    await Promise.race([pool.end(), drainTimeout]);
    console.log("[db] Pool drained.");
    process.exit(0);
  } catch (error) {
    console.error("[db] Failed to drain pool:", error);
    process.exit(1);
  }
});

export { pool };
