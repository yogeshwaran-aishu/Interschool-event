import type { Db } from './db.js';

export type JobName =
  | 'email.send'
  | 'users.import'
  | 'event.fanout'
  | 'invitation.expire'
  | 'deadline.reminder'
  | 'coordinator.digest';

/** Queues a job in the caller's transaction (transactional outbox): it runs only if the change commits. */
export async function enqueue(
  tx: Db,
  name: JobName,
  payload: Record<string, unknown>,
  opts: { createdBy?: string; schoolId?: string | null; maxAttempts?: number } = {},
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO jobs (name, payload, created_by, school_id, max_attempts)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [
      name,
      JSON.stringify(payload),
      opts.createdBy ?? null,
      opts.schoolId ?? null,
      opts.maxAttempts ?? 5,
    ],
  );
  return rows[0]!.id;
}
