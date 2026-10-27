import type { RequestHandler } from 'express';
import { many, pool } from '../db.js';

/**
 * Replays the stored response when a mutating request repeats its Idempotency-Key, so a
 * double click or a retry never creates two records. Keys live for 24 hours.
 */
export const idempotency: RequestHandler = async (req, res, next) => {
  const key = req.header('Idempotency-Key');
  if (!key || req.method === 'GET' || !req.user) return next();
  const [hit] = await many<{ status: number; response: unknown; method: string; path: string }>(
    pool,
    `SELECT status, response, method, path FROM idempotency_keys
      WHERE user_id = $1 AND key = $2 AND created_at > now() - interval '24 hours'`,
    [req.user.id, key],
  );
  if (hit && hit.method === req.method && hit.path === req.originalUrl) {
    res.status(hit.status).json(hit.response);
    return;
  }
  const json = res.json.bind(res);
  res.json = (body: unknown) => {
    if (res.statusCode < 500)
      pool
        .query(
          `INSERT INTO idempotency_keys (key, user_id, method, path, status, response)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id, key) DO UPDATE
             SET method = $3, path = $4, status = $5, response = $6, created_at = now()`,
          [key, req.user!.id, req.method, req.originalUrl, res.statusCode, JSON.stringify(body)],
        )
        .catch(() => undefined);
    return json(body);
  };
  next();
};
