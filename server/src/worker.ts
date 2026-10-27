import { pool } from './common/db.js';
import { logger } from './common/logger.js';
import { startWorker } from './jobs/runner.js';

/** Job worker entry: same codebase as the API, run as its own process. */
const stop = startWorker();

async function shutdown(signal: string) {
  logger.info(`${signal}: stopping worker`);
  await stop();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
