import { createApp } from './app.js';
import { pool } from './common/db.js';
import { logger } from './common/logger.js';
import { env } from './config/env.js';
import { startWorker } from './jobs/runner.js';

const app = createApp();
const server = app.listen(env.PORT, () =>
  logger.info(`API listening on http://localhost:${env.PORT}`),
);
const stopWorker = env.RUN_WORKER_IN_API ? startWorker() : null;

async function shutdown(signal: string) {
  logger.info(`${signal}: shutting down`);
  server.close();
  await stopWorker?.();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
