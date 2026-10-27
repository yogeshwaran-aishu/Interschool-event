import { describe, expect, it } from 'vitest';
import { EMAILS, as, drain, id, pool, setDeadline, useSeededDatabase } from './helpers.js';

useSeededDatabase();

const FIESTA = id('ev-fiesta');
const INV_LAKE = id('inv-fiesta-lake');

describe('end-to-end flow', () => {
  it('runs invite → accept → apply → approve → submit → confirm → export', async () => {
    const host = await as(EMAILS.hostAdmin);
    expect(
      (await host.post(`/events/${FIESTA}/invitations`, { schoolIds: [id('sch-greenfield')] })).body
        .sent,
    ).toBe(1);

    const green = await as(EMAILS.greenfield);
    const received = (await green.get('/invitations/received')).body;
    const inv = received.find((i: { eventId: string }) => i.eventId === FIESTA);
    expect(
      (await green.post(`/invitations/${inv.id}/accept`, { note: 'See you there' })).body.status,
    ).toBe('accepted');

    const aarav = await as(EMAILS.aarav);
    const events = (await aarav.get('/student/events')).body;
    expect(events.map((e: { event: { id: string } }) => e.event.id)).toContain(FIESTA);
    const applied = await aarav.post('/registrations', { categoryId: id('cat-poster') });
    expect(applied.status).toBe(201);
    expect(applied.body).toMatchObject({ schoolStatus: 'applied', hostStatus: 'not_submitted' });

    const teacher = await as(EMAILS.guestTeacher);
    expect(
      (await teacher.post(`/registrations/${applied.body.id}/school-approve`)).body.schoolStatus,
    ).toBe('approved');
    expect((await teacher.post(`/invitations/${INV_LAKE}/submit`)).body.submitted).toBe(2); // + Kabir from the seed

    const noms = (await host.get(`/events/${FIESTA}/nominations`)).body;
    expect(noms).toHaveLength(2);
    expect(Object.keys(noms[0]).sort()).toEqual(
      [
        'categoryName',
        'className',
        'eventId',
        'hostStatus',
        'invitationId',
        'registrationId',
        'schoolName',
        'studentName',
      ].sort(),
    );
    expect(
      (await host.post(`/registrations/${applied.body.id}/host-confirm`)).body.hostStatus,
    ).toBe('confirmed');

    const csv = await host.get(`/events/${FIESTA}/export?format=csv`);
    expect(csv.headers['content-disposition']).toContain(
      'inter-school-science-fiesta-2026-participants.csv',
    );
    expect(csv.text).toContain('Lakeview Vidyalaya,Research Poster,Aarav Mehta,9');
    expect(
      (await pool.query(`SELECT 1 FROM audit_logs WHERE action = 'event.exported'`)).rowCount,
    ).toBe(1);

    const mine = (await aarav.get('/notifications')).body.items;
    expect(mine[0].title).toBe('Participation confirmed');
  });
});

describe('state transitions', () => {
  it('refuses disallowed moves with 409 INVALID_TRANSITION', async () => {
    const host = await as(EMAILS.hostAdmin);
    const publishAgain = await host.post(`/events/${FIESTA}/publish`);
    expect(publishAgain.status).toBe(409);
    expect(publishAgain.body.error.code).toBe('INVALID_TRANSITION');

    const revokeAccepted = await host.post(`/invitations/${INV_LAKE}/revoke`);
    expect(revokeAccepted.body.error.code).toBe('INVALID_TRANSITION');

    // Host cannot decide a nomination that was never submitted.
    const notSubmitted = await host.post(`/registrations/${id('reg-1')}/host-confirm`);
    expect(notSubmitted.status).toBe(404);

    const guest = await as(EMAILS.guestAdmin);
    const twice = await guest.post(`/invitations/${INV_LAKE}/accept`, {});
    expect(twice.body.error.code).toBe('INVALID_TRANSITION');
  });
});

describe('quota (RG-3)', () => {
  it('never lets approvals exceed the per-school limit', async () => {
    // Junior Science Quiz allows 2 per school; Kabir is already approved.
    const aarav = await as(EMAILS.aarav);
    const ishita = await as(EMAILS.ishita);
    const a = (await aarav.post('/registrations', { categoryId: id('cat-quiz') })).body;
    const b = (await ishita.post('/registrations', { categoryId: id('cat-quiz') })).body;
    const admin = await as(EMAILS.guestAdmin);
    expect((await admin.post(`/registrations/${a.id}/school-approve`)).status).toBe(200);
    const full = await admin.post(`/registrations/${b.id}/school-approve`);
    expect(full.status).toBe(409);
    expect(full.body.error).toMatchObject({ code: 'QUOTA_FULL', details: { limit: 2 } });
  });

  it('lets exactly the quota through when 10 approvals race', async () => {
    // Research Poster: set the quota to 2 and create 10 applications directly.
    await pool.query(`UPDATE categories SET max_per_school = 2 WHERE id = $1`, [id('cat-poster')]);
    const students = await pool.query<{ id: string }>(
      `INSERT INTO users (school_id, role, full_name, login_id, email)
       SELECT $1, 'student', 'Racer ' || g, 'racer' || g || '@lakeview.test', 'racer' || g || '@lakeview.test'
         FROM generate_series(1, 10) g RETURNING id`,
      [id('sch-lakeview')],
    );
    const regs = await pool.query<{ id: string }>(
      `INSERT INTO registrations (invitation_id, category_id, student_id, school_id)
       SELECT $1, $2, unnest($3::uuid[]), $4 RETURNING id`,
      [INV_LAKE, id('cat-poster'), students.rows.map((s) => s.id), id('sch-lakeview')],
    );
    const admin = await as(EMAILS.guestAdmin);
    const results = await Promise.all(
      regs.rows.map((r) => admin.post(`/registrations/${r.id}/school-approve`)),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(2);
    expect(results.filter((r) => r.body.error?.code === 'QUOTA_FULL')).toHaveLength(8);
  });
});

describe('deadlines (IN-3)', () => {
  it('refuses apply, approve and accept one second after the deadline', async () => {
    const aarav = await as(EMAILS.aarav);
    const applied = (await aarav.post('/registrations', { categoryId: id('cat-poster') })).body;
    await setDeadline(FIESTA, '-1 second');

    expect(
      (await aarav.post('/registrations', { categoryId: id('cat-quiz') })).body.error.code,
    ).toBe('DEADLINE_PASSED');
    const admin = await as(EMAILS.guestAdmin);
    expect((await admin.post(`/registrations/${applied.id}/school-approve`)).body.error.code).toBe(
      'DEADLINE_PASSED',
    );
    const aurelia = await as(EMAILS.aurelia);
    expect(
      (await aurelia.post(`/invitations/${id('inv-fiesta-aur')}/accept`, {})).body.error.code,
    ).toBe('DEADLINE_PASSED');
    expect((await aarav.post(`/registrations/${applied.id}/withdraw`)).body.error.code).toBe(
      'DEADLINE_PASSED',
    );
  });

  it('closes the event and expires pending invitations in the expiry job', async () => {
    await setDeadline(FIESTA, '-1 minute');
    const { expireInvitations } = await import('../src/jobs/handlers.js');
    await expireInvitations({}, { id: 'test' });
    const { rows } = await pool.query(`SELECT status FROM invitations WHERE id = $1`, [
      id('inv-fiesta-aur'),
    ]);
    expect(rows[0].status).toBe('expired');
    expect(
      (await pool.query(`SELECT status FROM events WHERE id = $1`, [FIESTA])).rows[0].status,
    ).toBe('closed');
    // Idempotent: a second run changes nothing.
    expect(await expireInvitations({}, { id: 'test' })).toMatchObject({ closed: 0 });
  });
});

describe('eligibility (RG-1)', () => {
  it('lists only fitting categories and re-checks on apply', async () => {
    const aarav = await as(EMAILS.aarav); // class 9
    await pool.query(`UPDATE categories SET min_class = 11 WHERE id = $1`, [id('cat-poster')]);
    const events = (await aarav.get('/student/events')).body;
    const fiesta = events.find((e: { event: { id: string } }) => e.event.id === FIESTA);
    expect(fiesta.categories.map((c: { name: string }) => c.name)).not.toContain('Research Poster');
    const refused = await aarav.post('/registrations', { categoryId: id('cat-poster') });
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('NOT_ELIGIBLE');
  });

  it('refuses a second live application to the same category', async () => {
    const aarav = await as(EMAILS.aarav);
    await aarav.post('/registrations', { categoryId: id('cat-poster') });
    expect(
      (await aarav.post('/registrations', { categoryId: id('cat-poster') })).body.error.code,
    ).toBe('ALREADY_APPLIED');
  });
});

describe('withdrawal (RG-6)', () => {
  it('lets a student withdraw, freeing the slot, and re-apply', async () => {
    const aarav = await as(EMAILS.aarav);
    const reg = (await aarav.post('/registrations', { categoryId: id('cat-poster') })).body;
    expect((await aarav.post(`/registrations/${reg.id}/withdraw`)).body.schoolStatus).toBe(
      'withdrawn',
    );
    const again = await aarav.post('/registrations', { categoryId: id('cat-poster') });
    expect(again.status).toBe(201);
    expect(again.body.id).toBe(reg.id);
  });
});

describe('events (EV-1, EV-4, EV-5)', () => {
  const draft = {
    title: 'Chess Open',
    description: '',
    venue: 'Library',
    startsAt: new Date(Date.now() + 20 * 86_400_000).toISOString(),
    regDeadline: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    categories: [{ name: 'Under 16', minClass: 8, maxClass: 10, maxPerSchool: 1 }],
  };

  it('validates the deadline is before the start', async () => {
    const host = await as(EMAILS.hostAdmin);
    const res = await host.post('/events', { ...draft, regDeadline: draft.startsAt });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/deadline must be before/);
  });

  it('stops a teacher without hosting rights from creating events', async () => {
    const teacher = await as(EMAILS.guestTeacher);
    expect((await teacher.post('/events', draft)).status).toBe(403);
    const coordinator = await as(EMAILS.hostCoordinator);
    expect((await coordinator.post('/events', draft)).status).toBe(201);
  });

  it('notifies accepted schools and applicants when the venue changes', async () => {
    const host = await as(EMAILS.hostAdmin);
    const current = (await host.get(`/events/${FIESTA}`)).body;
    const res = await host.patch(`/events/${FIESTA}`, {
      title: current.title,
      description: current.description,
      venue: 'New Hall',
      startsAt: current.startsAt,
      regDeadline: current.regDeadline,
      categories: current.categories.map(
        ({
          name,
          minClass,
          maxClass,
          genderRule,
          type,
          teamSize,
          maxPerSchool,
        }: Record<string, unknown>) => ({
          name,
          minClass,
          maxClass,
          genderRule,
          type,
          teamSize,
          maxPerSchool,
        }),
      ),
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const guest = await as(EMAILS.guestAdmin);
    expect((await guest.get('/notifications')).body.items[0].title).toBe('Event details changed');
  });

  it('refuses lowering a quota below what a school already approved', async () => {
    await pool.query(`UPDATE registrations SET status = 'school_approved' WHERE id = $1`, [
      id('reg-2'),
    ]);
    await pool.query(`UPDATE registrations SET category_id = $2 WHERE id = $1`, [
      id('reg-2'),
      id('cat-quiz'),
    ]);
    const host = await as(EMAILS.hostAdmin);
    const current = (await host.get(`/events/${FIESTA}`)).body;
    const res = await host.patch(`/events/${FIESTA}`, {
      ...draft,
      startsAt: current.startsAt,
      regDeadline: current.regDeadline,
      title: current.title,
      venue: current.venue,
      categories: current.categories.map(
        ({ name, minClass, maxClass, maxPerSchool }: Record<string, unknown>) => ({
          name,
          minClass,
          maxClass,
          maxPerSchool: name === 'Junior Science Quiz' ? 1 : maxPerSchool,
        }),
      ),
    });
    expect(res.status).toBe(409);
  });

  it('requires a reason to cancel, revokes pending invitations and audits it', async () => {
    const host = await as(EMAILS.hostAdmin);
    expect((await host.post(`/events/${FIESTA}/cancel`, { reason: ' ' })).status).toBe(400);
    expect(
      (await host.post(`/events/${FIESTA}/cancel`, { reason: 'Exams moved' })).body.status,
    ).toBe('cancelled');
    expect(
      (await pool.query(`SELECT status FROM invitations WHERE id = $1`, [id('inv-fiesta-aur')]))
        .rows[0].status,
    ).toBe('revoked');
    expect(
      (await pool.query(`SELECT after FROM audit_logs WHERE action = 'event.cancelled'`)).rows[0]
        .after,
    ).toEqual({ reason: 'Exams moved' });
  });

  it('never invites the host itself, suspended schools or the same school twice', async () => {
    const host = await as(EMAILS.hostAdmin);
    const res = await host.post(`/events/${FIESTA}/invitations`, {
      schoolIds: [id('sch-sunrise'), id('sch-oakridge'), id('sch-lakeview')],
    });
    expect(res.body.sent).toBe(0);
  });
});

describe('onboarding (ON-1) and outbox', () => {
  it('creates a school with an invited admin, and the email job runs only after commit', async () => {
    const admin = await as(EMAILS.appAdmin);
    const res = await admin.post('/admin/schools', {
      name: 'Hilltop School',
      board: 'CBSE',
      city: 'Pune',
      address: '1 Hill Road',
      contactEmail: 'office@hilltop.test',
      contactPhone: '',
      adminName: 'Hema Rao',
      adminEmail: 'hema@hilltop.test',
    });
    expect(res.status).toBe(201);
    const hema = await as('hema@hilltop.test');
    expect(hema.user).toMatchObject({ mustChangePassword: true });
    const job = await pool.query(`SELECT status FROM jobs WHERE name = 'email.send'`);
    expect(job.rows.map((j) => j.status)).toEqual(['queued']);
    await drain();
    const done = await pool.query(`SELECT status, payload FROM jobs WHERE name = 'email.send'`);
    expect(done.rows[0].status).toBe('done');
    expect(done.rows[0].payload.vars.tempPassword).toBeUndefined();
  });

  it('limits platform actions to the App Admin', async () => {
    const host = await as(EMAILS.hostAdmin);
    const res = await host.patch(`/admin/schools/${id('sch-lakeview')}`, { status: 'suspended' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
  });
});
