import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pool, withTransaction } from '../common/db.js';

const dir = fileURLToPath(new URL('../../migrations/', import.meta.url));

/**
 * Applies migrations/*.sql in name order, each in its own transaction, recording them in
 * schema_migrations. Runs as a separate release step, never on app start.
 */
export async function migrate(log = console.log): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
  );
  const done = new Set(
    (await pool.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(
      (r) => r.name,
    ),
  );
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    if (done.has(file)) continue;
    await withTransaction(async (tx) => {
      await tx.query(readFileSync(dir + file, 'utf8'));
      await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    log(`applied ${file}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await migrate();
  await pool.end();
}
