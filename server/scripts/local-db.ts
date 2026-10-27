/**
 * Runs a real PostgreSQL server for local development without Docker or a system install
 * (embedded-postgres downloads the binaries through npm). Data lives in server/.pgdata.
 *
 *   npm run db:local             # start, create the database, migrate, seed on first run
 *   npm run db:local -- --reset  # also wipe and re-seed the demo data
 *
 * Connection: postgres://isc:isc@localhost:5433/interschool (matches .env.example).
 */
import { existsSync } from 'node:fs';
import EmbeddedPostgres from 'embedded-postgres';

const port = Number(process.env['PGPORT'] ?? 5433);
const dataDir = new URL('../.pgdata', import.meta.url).pathname;
const firstRun = !existsSync(dataDir);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'isc',
  password: 'isc',
  port,
  persistent: true,
  onLog: () => undefined,
});
if (firstRun) await pg.initialise();
await pg.start();
if (firstRun) await pg.createDatabase('interschool');

process.env['DATABASE_URL'] ??= `postgres://isc:isc@localhost:${port}/interschool`;
const { migrate } = await import('../src/db/migrate.js');
const { resetDatabase } = await import('../src/db/seed.js');
const { pool } = await import('../src/common/db.js');
await migrate();
const empty = (await pool.query('SELECT count(*)::int AS n FROM schools')).rows[0].n === 0;
if (empty || process.argv.includes('--reset')) {
  await resetDatabase();
  console.log('Seeded demo data (password for every account: demo1234).');
}
await pool.end();

console.log(`PostgreSQL running on port ${port} (data in server/.pgdata). Press Ctrl+C to stop.`);
const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => undefined, 1 << 30);
