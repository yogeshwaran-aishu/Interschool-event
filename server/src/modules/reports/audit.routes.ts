import { Router } from 'express';
import { z } from 'zod';
import { many, pool } from '../../common/db.js';
import { actor, requireRole, type AuthUser } from '../../common/middleware/auth.js';
import { validate } from '../../common/middleware/validate.js';

const listQuery = z
  .object({
    cursor: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(500).default(200),
  })
  .strict();

export interface AuditRow {
  id: number;
  actor_id: string | null;
  actor_name: string | null;
  school_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  before: unknown;
  after: unknown;
  at: string;
}

export const auditJson = (a: AuditRow) => ({
  id: String(a.id),
  actorId: a.actor_id ?? 'system',
  actorName: a.actor_name ?? 'System',
  schoolId: a.school_id,
  action: a.action,
  entity: a.entity,
  entityId: a.entity_id,
  before: a.before ?? undefined,
  after: a.after ?? undefined,
  at: a.at,
});

/** App Admin sees every entry; a School Admin sees their own school's. */
export async function auditFor(me: AuthUser, limit = 200, before?: number) {
  const rows = await many<AuditRow>(
    pool,
    `SELECT a.*, u.full_name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
      WHERE ($1::uuid IS NULL OR a.school_id = $1) AND ($2::bigint IS NULL OR a.id < $2)
      ORDER BY a.id DESC LIMIT $3`,
    [me.role === 'app_admin' ? null : me.schoolId, before ?? null, limit],
  );
  return rows.map(auditJson);
}

export function auditRouter(): Router {
  const r = Router();
  r.get(
    '/audit',
    requireRole('app_admin', 'school_admin'),
    validate({ query: listQuery }),
    async (req, res) => {
      const { cursor, limit } = req.query as unknown as z.infer<typeof listQuery>;
      const items = await auditFor(actor(req), limit + 1, cursor);
      const page = items.slice(0, limit);
      res.json({ items: page, nextCursor: items.length > limit ? Number(page.at(-1)!.id) : null });
    },
  );
  return r;
}
