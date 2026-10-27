import request from 'supertest';
import { afterAll, beforeEach } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/common/db.js';
import { resetDatabase } from '../src/db/seed.js';
import { DEMO_PASSWORD, seedId } from '../src/db/seed-ids.js';
import { drain } from '../src/jobs/runner.js';

export const app = createApp();
export { pool, drain, seedId as id };

/** Fresh demo data before every test; the pool closes after the file. */
export function useSeededDatabase(): void {
  beforeEach(() => resetDatabase());
  afterAll(() => pool.end());
}

export const EMAILS = {
  appAdmin: 'admin@interschool.test',
  hostAdmin: 'principal@sunrise.test',
  hostCoordinator: 'coordinator@sunrise.test',
  guestAdmin: 'principal@lakeview.test',
  guestTeacher: 'teacher@lakeview.test',
  aurelia: 'principal@aurelia.test',
  greenfield: 'principal@greenfield.test',
  aarav: 'aarav@lakeview.test',
  kabir: 'kabir@lakeview.test',
  ishita: 'ishita@lakeview.test',
  meera: 'meera@lakeview.test',
} as const;

/** Signs in and returns a small client that sends the bearer token. */
export async function as(email: string, password = DEMO_PASSWORD) {
  const res = await request(app).post('/api/v1/auth/login').send({ loginId: email, password });
  if (res.status !== 200)
    throw new Error(`login ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  const auth = { Authorization: `Bearer ${res.body.accessToken}` };
  return {
    user: res.body.user as { id: string; schoolId: string | null },
    get: (path: string) => request(app).get(`/api/v1${path}`).set(auth),
    post: (path: string, body: object = {}) =>
      request(app).post(`/api/v1${path}`).set(auth).send(body),
    patch: (path: string, body: object) =>
      request(app).patch(`/api/v1${path}`).set(auth).send(body),
    put: (path: string, body: object) => request(app).put(`/api/v1${path}`).set(auth).send(body),
  };
}

/** Moves an event's registration deadline relative to the database clock. */
export async function setDeadline(eventId: string, interval: string): Promise<void> {
  await pool.query(`UPDATE events SET reg_deadline = now() + $2::interval WHERE id = $1`, [
    eventId,
    interval,
  ]);
}
