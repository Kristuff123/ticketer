import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  database: process.env.PGDATABASE || 'ticketer',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
});

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number | null;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const result = await pool.query(text, params);
  return { rows: result.rows as T[], rowCount: result.rowCount };
}

export async function getClient(): Promise<pg.PoolClient> {
  return pool.connect();
}

export { pool };
