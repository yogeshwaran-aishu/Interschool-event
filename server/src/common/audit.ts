import type { Db } from './db.js';

export interface AuditInput {
  actorId: string | null;
  schoolId: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  requestId?: string;
}

/**
 * Appends to audit_logs inside the caller's transaction, so an audit row exists if and only if
 * the change committed. Called for every state transition, user change and export.
 */
export async function audit(tx: Db, a: AuditInput): Promise<void> {
  await tx.query(
    `INSERT INTO audit_logs (actor_id, school_id, action, entity, entity_id, before, after, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      a.actorId,
      a.schoolId,
      a.action,
      a.entity,
      a.entityId,
      a.before === undefined ? null : JSON.stringify(a.before),
      a.after === undefined ? null : JSON.stringify(a.after),
      a.requestId ?? null,
    ],
  );
}
