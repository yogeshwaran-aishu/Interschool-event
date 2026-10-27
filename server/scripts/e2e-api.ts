/**
 * API for the Playwright suite: a throwaway PostgreSQL (embedded-postgres), migrated and seeded,
 * plus the API with its job worker in-process. Specs reset the data with POST /api/v1/dev/reset.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const apiPort = Number(process.env['E2E_API_PORT'] ?? 3100);
const pgPort = Number(process.env['E2E_PG_PORT'] ?? 5434);

const pg = new EmbeddedPostgres({
  databaseDir: mkdtempSync(join(tmpdir(), 'isc-e2e-')),
  user: 'isc',
  password: 'isc',
  port: pgPort,
  persistent: false,
  onLog: () => undefined,
});
await pg.initialise();
await pg.start();
await pg.createDatabase('interschool_e2e');

Object.assign(process.env, {
  NODE_ENV: 'development',
  DATABASE_URL: `postgres://isc:isc@localhost:${pgPort}/interschool_e2e`,
  JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
  PORT: String(apiPort),
  ALLOW_DEMO_RESET: 'true',
  INITIAL_PASSWORD: 'demo1234',
  RUN_WORKER_IN_API: 'false',
  LOG_LEVEL: 'warn',
  CORS_ORIGINS: 'http://localhost:4300',
});

const { migrate } = await import('../src/db/migrate.js');
const { resetDatabase } = await import('../src/db/seed.js');
const { createApp } = await import('../src/app.js');
const { startWorker } = await import('../src/jobs/runner.js');
await migrate(() => undefined);
await resetDatabase();
const stopWorker = startWorker({ pollMs: 100 });
const server = createApp().listen(apiPort, () => console.log(`e2e API ready on ${apiPort}`));

const stop = async () => {
  server.close();
  await stopWorker();
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
