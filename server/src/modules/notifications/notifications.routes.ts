import { Router } from 'express';
import { z } from 'zod';
import { many, pool } from '../../common/db.js';
import { actor } from '../../common/middleware/auth.js';
import { validate } from '../../common/middleware/validate.js';

const listQuery = z
  .object({
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
const readBody = z
  .object({ ids: z.array(z.uuid()).max(500).optional(), all: z.boolean().optional() })
  .strict();

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  payload: { title: string; body: string; link?: string; channels: string[] };
  read_at: string | null;
  created_at: string;
}

export const notificationJson = (n: NotificationRow) => ({
  id: n.id,
  userId: n.user_id,
  type: n.type,
  title: n.payload.title,
  body: n.payload.body,
  link: n.payload.link,
  channels: n.payload.channels,
  createdAt: n.created_at,
  readAt: n.read_at ?? undefined,
});

/** The caller's own feed, newest first, cursor-paginated by (created_at, id). */
export function notificationsRouter(): Router {
  const r = Router();

  r.get('/notifications', validate({ query: listQuery }), async (req, res) => {
    const me = actor(req);
    const { cursor, limit } = req.query as unknown as z.infer<typeof listQuery>;
    const [at, id] = cursor ? Buffer.from(cursor, 'base64url').toString().split('|') : [];
    const rows = await many<NotificationRow>(
      pool,
      `SELECT * FROM notifications WHERE user_id = $1
          AND ($2::timestamptz IS NULL OR (created_at, id) < ($2, $3::uuid))
        ORDER BY created_at DESC, id DESC LIMIT $4`,
      [me.id, at ?? null, id ?? null, limit + 1],
    );
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    res.json({
      items: page.map(notificationJson),
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(`${last.created_at}|${last.id}`).toString('base64url')
          : null,
    });
  });

  r.post('/notifications/read', validate({ body: readBody }), async (req, res) => {
    const me = actor(req);
    const { ids, all } = req.body as z.infer<typeof readBody>;
    const result = await pool.query(
      `UPDATE notifications SET read_at = now()
        WHERE user_id = $1 AND read_at IS NULL AND ($2::boolean OR id = ANY($3::uuid[]))`,
      [me.id, !!all, ids ?? []],
    );
    res.json({ updated: result.rowCount });
  });

  return r;
}
