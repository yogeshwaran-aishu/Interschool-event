import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

/** Starts a throwaway PostgreSQL on port 5435 and applies the migrations once per run. */
export default async function setup() {
  const pg = new EmbeddedPostgres({
    databaseDir: mkdtempSync(join(tmpdir(), 'isc-test-')),
    user: 'isc',
    password: 'isc',
    port: 5435,
    persistent: false,
    onLog: () => undefined,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('isc_test');
  process.env['DATABASE_URL'] = 'postgres://isc:isc@localhost:5435/isc_test';
  process.env['JWT_SECRET'] = 'test-secret-test-secret-test-secret-00';
  const { migrate } = await import('../src/db/migrate.js');
  const { pool } = await import('../src/common/db.js');
  await migrate(() => undefined);
  await pool.end();
  return () => pg.stop();
}
