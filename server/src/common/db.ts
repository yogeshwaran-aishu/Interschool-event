import pg from 'pg';
import { env } from '../config/env.js';

// Return timestamps as ISO strings and bigint/count as numbers so JSON stays predictable.
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (v) => new Date(v).toISOString());
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });

/** Anything that can run a query: the pool or a client inside a transaction. */
export type Db = Pick<pg.PoolClient, 'query'>;
export type Tx = pg.PoolClient;

export async function many<T>(db: Db, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query(sql, params)).rows as T[];
}

export async function one<T>(db: Db, sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await db.query(sql, params)).rows[0] as T | undefined;
}

/**
 * Runs `fn` in a transaction. Data changes, audit rows, notifications and queued jobs commit
 * or roll back together (transactional outbox).
 */
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
