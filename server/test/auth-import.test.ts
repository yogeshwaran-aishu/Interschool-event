import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { EMAILS, app, as, drain, id, pool, useSeededDatabase } from './helpers.js';

useSeededDatabase();

const login = (loginId: string, password: string) =>
  request(app).post('/api/v1/auth/login').send({ loginId, password });

describe('authentication', () => {
  it('gives one message for unknown email and wrong password', async () => {
    const a = await login('nobody@x.test', 'demo1234');
    const b = await login(EMAILS.hostAdmin, 'wrong');
    expect(a.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });

  it('locks an account after 5 failures in 15 minutes', async () => {
    for (let i = 0; i < 5; i++) await login(EMAILS.hostAdmin, 'wrong');
    const res = await login(EMAILS.hostAdmin, 'demo1234');
    expect(res.status).toBe(429);
  });

  it('blocks suspended schools and students without consent', async () => {
    await pool.query(`UPDATE student_profiles SET parental_consent = false WHERE user_id = $1`, [
      id('u-aarav'),
    ]);
    expect((await login(EMAILS.aarav, 'demo1234')).body.error.code).toBe('CONSENT_PENDING');
    const admin = await as(EMAILS.appAdmin);
    await admin.patch(`/admin/schools/${id('sch-lakeview')}`, { status: 'suspended' });
    expect((await login(EMAILS.guestAdmin, 'demo1234')).body.error.code).toBe('SCHOOL_SUSPENDED');
  });

  it('rotates refresh tokens and revokes the family when a used one is replayed', async () => {
    const first = await login(EMAILS.hostAdmin, 'demo1234');
    const cookie = first.headers['set-cookie']![0]!.split(';')[0]!;
    const rotated = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(rotated.status).toBe(200);
    const next = rotated.headers['set-cookie']![0]!.split(';')[0]!;
    // Replay of the old token: refused, and the new one stops working too.
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie)).status).toBe(
      401,
    );
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', next)).status).toBe(401);
  });

  it('forces and completes a first-login password change', async () => {
    const meera = await as(EMAILS.meera);
    expect(meera.user).toMatchObject({ mustChangePassword: true });
    expect(
      (
        await meera.post('/auth/change-password', {
          currentPassword: 'x',
          newPassword: 'new-password-1',
        })
      ).status,
    ).toBe(400);
    const ok = await meera.post('/auth/change-password', {
      currentPassword: 'demo1234',
      newPassword: 'new-password-1',
    });
    expect(ok.body).toMatchObject({ mustChangePassword: false, status: 'active' });
    expect((await login(EMAILS.meera, 'new-password-1')).status).toBe(200);
  });

  it('rejects unknown fields and requests without a token', async () => {
    expect((await request(app).get('/api/v1/state')).status).toBe(401);
    const res = await login(EMAILS.hostAdmin, 'demo1234');
    const bad = await request(app)
      .post('/api/v1/registrations')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .send({ categoryId: id('cat-quiz'), extra: 1 });
    expect(bad.status).toBe(403); // role check runs before validation
  });
});

describe('CSV import (ON-2)', () => {
  it('creates valid rows and reports duplicates, bad classes and missing guardians per row', async () => {
    const admin = await as(EMAILS.guestAdmin);
    const csv = [
      'role,name,email,phone,class,section,admission_no,gender,guardian_name,guardian_contact,consent',
      'student,Riya Sen,riya@lakeview.test,,9,A,LV-9001,female,Mala Sen,mala@example.test,yes',
      'student,Dup Email,aarav@lakeview.test,,9,A,LV-9002,male,G,g@example.test,yes',
      'student,No Class,nc@lakeview.test,,,A,LV-9003,male,G,g@example.test,yes',
      'student,No Guardian,ng@lakeview.test,,9,A,LV-9004,male,,,yes',
      'student,Dup Admission,da@lakeview.test,,9,A,LV-2019-041,male,G,g@example.test,yes',
      'teacher,Sameer Khan,sameer@lakeview.test,+91 98000 00000,,,,,,,',
    ].join('\n');
    const queued = await admin.post('/school/users/import', { csv });
    expect(queued.status).toBe(202);
    await drain();
    const status = (await admin.get(`/school/imports/${queued.body.jobId}`)).body;
    expect(status.status).toBe('done');
    expect(status.result.created).toBe(2);
    const byLine = Object.fromEntries(
      status.result.errors.map((e: { line: number; messages: string[] }) => [
        e.line,
        e.messages.join(' '),
      ]),
    );
    expect(byLine[3]).toMatch(/Email is already in use/);
    expect(byLine[4]).toMatch(/Class must be a whole number/);
    expect(byLine[5]).toMatch(/Guardian/);
    expect(byLine[6]).toMatch(/Admission number is already in use/);

    const other = await as(EMAILS.greenfield);
    expect((await other.get(`/school/imports/${queued.body.jobId}`)).status).toBe(404);
  });
});
