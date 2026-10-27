import { audit } from '../common/audit.js';
import { EVENT_SELECT } from '../common/access.js';
import { many, one, pool, withTransaction } from '../common/db.js';
import { mailer, render } from '../common/mailer.js';
import { notify } from '../common/notify.js';
import type { EventRow } from '../common/serializers.js';
import { env } from '../config/env.js';
import { UsersService } from '../modules/users/users.service.js';

export type JobHandler = (
  payload: Record<string, unknown>,
  job: { id: string },
) => Promise<unknown>;

const FANOUT_CHUNK = 500;

/** email.send: renders a template and sends it through the Mailer, to the user or their guardian. */
const emailSend: JobHandler = async (payload, job) => {
  const { userId, to, template, vars } = payload as {
    userId: string;
    to: 'user' | 'guardian';
    template: string;
    vars: Record<string, string>;
  };
  const user = await one<{
    full_name: string;
    email: string | null;
    guardian_email: string | null;
    guardian_name: string | null;
  }>(
    pool,
    `SELECT u.full_name, u.email, p.guardian_email, p.guardian_name
       FROM users u LEFT JOIN student_profiles p ON p.user_id = u.id WHERE u.id = $1`,
    [userId],
  );
  const address = to === 'guardian' ? user?.guardian_email : user?.email;
  if (!user || !address) return { skipped: 'no address' };
  const name = to === 'guardian' ? (user.guardian_name ?? 'Parent or guardian') : user.full_name;
  const mail = render(template, { ...vars, name, appUrl: env.APP_URL });
  await mailer.send({ to: address, ...mail });
  // Don't keep temporary passwords in the jobs table once they are sent.
  if (vars['tempPassword'])
    await pool.query(`UPDATE jobs SET payload = payload #- '{vars,tempPassword}' WHERE id = $1`, [
      job.id,
    ]);
  return { sent: true };
};

/** users.import: validate rows, create users in batches of 500, store row errors as the job result. */
const usersImport: JobHandler = async (payload) =>
  new UsersService().runImport(payload as { csv: string; actorId: string; schoolId: string });

/** event.fanout: after an invitation is accepted, tell every eligible student (and guardians), in chunks. */
const eventFanout: JobHandler = async (payload) => {
  const { invitationId } = payload as { invitationId: string };
  const ctx = await one<{ event_id: string; title: string; guest_school_id: string }>(
    pool,
    `SELECT e.id AS event_id, e.title, i.guest_school_id FROM invitations i JOIN events e ON e.id = i.event_id
      WHERE i.id = $1 AND i.status = 'accepted' AND e.status = 'open'`,
    [invitationId],
  );
  if (!ctx) return { skipped: 'invitation no longer accepted' };
  const students = await many<{ id: string }>(
    pool,
    `SELECT DISTINCT u.id FROM users u
       JOIN student_profiles p ON p.user_id = u.id
       JOIN categories c ON c.event_id = $1
      WHERE u.school_id = $2 AND u.role = 'student' AND u.status <> 'suspended'
        AND c.min_class <= p.class AND c.max_class >= p.class
        AND (c.gender_rule = 'any' OR c.gender_rule::text = p.gender::text)
        AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = u.id AND n.type = 'event_open'
                         AND n.payload->>'link' = '/explore' AND n.payload->>'eventId' = $1::text)`,
    [ctx.event_id, ctx.guest_school_id],
  );
  for (let i = 0; i < students.length; i += FANOUT_CHUNK)
    await withTransaction((tx) =>
      notify(
        tx,
        students.slice(i, i + FANOUT_CHUNK).map((s) => s.id),
        'event_open',
        {
          title: 'New event open to you',
          body: `${ctx.title} is open for applications.`,
          link: '/explore',
          eventId: ctx.event_id,
        },
      ),
    );
  return { notified: students.length };
};

/** invitation.expire (every 15 min): closes events past their deadline and expires unanswered invitations. */
export const expireInvitations: JobHandler = async () =>
  withTransaction(async (tx) => {
    const closing = await many<EventRow>(
      tx,
      `${EVENT_SELECT} WHERE e.status = 'open' AND e.reg_deadline < now() FOR UPDATE OF e`,
    );
    for (const e of closing) {
      await tx.query(`UPDATE events SET status = 'closed', updated_at = now() WHERE id = $1`, [
        e.id,
      ]);
      await audit(tx, {
        actorId: null,
        schoolId: e.host_school_id,
        action: 'event.closed',
        entity: 'Event',
        entityId: e.id,
        before: { status: 'open' },
        after: { status: 'closed' },
      });
      const expired = await many<{ id: string; guest_school_id: string }>(
        tx,
        `UPDATE invitations SET status = 'expired' WHERE event_id = $1 AND status = 'pending' RETURNING id, guest_school_id`,
        [e.id],
      );
      for (const inv of expired)
        await audit(tx, {
          actorId: null,
          schoolId: inv.guest_school_id,
          action: 'invitation.expired',
          entity: 'Invitation',
          entityId: inv.id,
        });
    }
    const completed = await tx.query(
      `UPDATE events SET status = 'completed', updated_at = now() WHERE status = 'closed' AND starts_at < now()`,
    );
    return { closed: closing.length, completed: completed.rowCount };
  });

/** deadline.reminder (hourly): invitations still pending 48 h before the deadline get one reminder. */
const deadlineReminder: JobHandler = async () =>
  withTransaction(async (tx) => {
    const due = await many<{ id: string; guest_school_id: string; title: string }>(
      tx,
      `SELECT i.id, i.guest_school_id, e.title FROM invitations i JOIN events e ON e.id = i.event_id
        WHERE i.status = 'pending' AND i.reminder_sent_at IS NULL AND e.status = 'open'
          AND e.reg_deadline BETWEEN now() AND now() + interval '48 hours'
        FOR UPDATE OF i SKIP LOCKED`,
    );
    for (const inv of due) {
      const admins = await many<{ id: string }>(
        tx,
        `SELECT id FROM users WHERE school_id = $1 AND role = 'school_admin'`,
        [inv.guest_school_id],
      );
      await notify(
        tx,
        admins.map((a) => a.id),
        'invitation_reminder',
        {
          title: 'Invitation closes soon',
          body: `Your school has not yet replied to ${inv.title}. The registration deadline is within 48 hours.`,
          link: '/invitations',
        },
      );
      await tx.query('UPDATE invitations SET reminder_sent_at = now() WHERE id = $1', [inv.id]);
    }
    return { reminded: due.length };
  });

/** coordinator.digest (daily 17:00 IST): one email per coordinator listing the day's new items. */
const coordinatorDigest: JobHandler = async () => {
  const rows = await many<{
    user_id: string;
    full_name: string;
    email: string | null;
    items: string[];
  }>(
    pool,
    `SELECT n.user_id, u.full_name, u.email, array_agg(n.payload->>'body' ORDER BY n.created_at) AS items
       FROM notifications n JOIN users u ON u.id = n.user_id
      WHERE n.payload->'channels' ? 'digest' AND n.created_at > now() - interval '24 hours'
      GROUP BY n.user_id, u.full_name, u.email`,
  );
  for (const r of rows) {
    if (!r.email) continue;
    await mailer.send({
      to: r.email,
      ...render('coordinator-digest', {
        name: r.full_name,
        count: String(r.items.length),
        items: r.items.map((i) => `- ${i}`).join('\n'),
        appUrl: env.APP_URL,
      }),
    });
  }
  return { emailed: rows.length };
};

export const handlers: Record<string, JobHandler> = {
  'email.send': emailSend,
  'users.import': usersImport,
  'event.fanout': eventFanout,
  'invitation.expire': expireInvitations,
  'deadline.reminder': deadlineReminder,
  'coordinator.digest': coordinatorDigest,
};
