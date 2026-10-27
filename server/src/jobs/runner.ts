import { one, pool } from '../common/db.js';
import { enqueue, type JobName } from '../common/jobs.js';
import { logger } from '../common/logger.js';
import { handlers } from './handlers.js';

interface ClaimedJob {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

/** Claims one due job with SKIP LOCKED, so several workers never run the same job twice. */
async function claim(): Promise<ClaimedJob | undefined> {
  return one<ClaimedJob>(
    pool,
    `UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = now()
      WHERE id = (SELECT id FROM jobs WHERE status = 'queued' AND run_after <= now()
                   ORDER BY run_after FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id, name, payload, attempts, max_attempts`,
  );
}

export async function runOne(): Promise<boolean> {
  const job = await claim();
  if (!job) return false;
  const handler = handlers[job.name];
  try {
    if (!handler) throw new Error(`No handler for job ${job.name}`);
    const result = await handler(job.payload, job);
    await pool.query(
      `UPDATE jobs SET status = 'done', result = $2, updated_at = now() WHERE id = $1`,
      [job.id, JSON.stringify(result ?? null)],
    );
  } catch (err) {
    const dead = job.attempts >= job.max_attempts;
    // Exponential backoff: 10 s, 20 s, 40 s, 80 s … then dead-letter (status failed) and alert.
    await pool.query(
      `UPDATE jobs SET status = $2, last_error = $3, updated_at = now(),
              run_after = now() + make_interval(secs => $4) WHERE id = $1`,
      [
        job.id,
        dead ? 'failed' : 'queued',
        String((err as Error)?.message ?? err),
        10 * 2 ** (job.attempts - 1),
      ],
    );
    logger[dead ? 'error' : 'warn'](
      { err, job: job.name, id: job.id, attempt: job.attempts },
      dead ? 'job dead-lettered' : 'job failed, will retry',
    );
  }
  return true;
}

/** Runs every queued job that is due now. Tests call this to process the outbox synchronously. */
export async function drain(): Promise<void> {
  while (await runOne());
}

const IST_OFFSET_MS = 5.5 * 3_600_000;

/** Cron schedule. A (name, period) row in cron_runs makes each run happen once across all workers. */
function duePeriods(now: Date): { name: JobName; period: string }[] {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const day = ist.toISOString().slice(0, 10);
  const due: { name: JobName; period: string }[] = [
    {
      name: 'invitation.expire',
      period: `${day}T${ist.getUTCHours()}:${Math.floor(ist.getUTCMinutes() / 15)}`,
    },
    { name: 'deadline.reminder', period: `${day}T${ist.getUTCHours()}` },
  ];
  if (ist.getUTCHours() >= 17) due.push({ name: 'coordinator.digest', period: day });
  return due;
}

export async function scheduleCron(now = new Date()): Promise<void> {
  for (const { name, period } of duePeriods(now)) {
    const claimed = await pool.query(
      'INSERT INTO cron_runs (name, period) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [name, period],
    );
    if (claimed.rowCount) await enqueue(pool, name, {}, { maxAttempts: 3 });
  }
}

/** Starts polling. Returns a stop function. */
export function startWorker(opts: { pollMs?: number; cronMs?: number } = {}): () => Promise<void> {
  let stopped = false;
  let busy: Promise<void> = Promise.resolve();
  const tick = () => {
    if (stopped) return;
    busy = drain().catch((err) => logger.error({ err }, 'worker tick failed'));
  };
  const cron = () => scheduleCron().catch((err) => logger.error({ err }, 'cron scheduling failed'));
  void cron();
  const poll = setInterval(tick, opts.pollMs ?? 1000);
  const cronTimer = setInterval(cron, opts.cronMs ?? 30_000);
  logger.info('job worker started');
  return async () => {
    stopped = true;
    clearInterval(poll);
    clearInterval(cronTimer);
    await busy;
  };
}
