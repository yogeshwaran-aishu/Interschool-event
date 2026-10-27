import { Router } from 'express';
import { EVENT_SELECT, INVITATION_SELECT } from '../../common/access.js';
import { many, one, pool } from '../../common/db.js';
import { actor, type AuthUser } from '../../common/middleware/auth.js';
import {
  categoryJson,
  eventJson,
  invitationJson,
  profileJson,
  registrationJson,
  schoolJson,
  userJson,
  type CategoryRow,
  type EventRow,
  type InvitationRow,
  type ProfileRow,
  type RegistrationRow,
  type SchoolRow,
  type UserRow,
} from '../../common/serializers.js';
import { nominationsOf } from '../events/events.service.js';
import { notificationJson, type NotificationRow } from '../notifications/notifications.routes.js';
import { auditFor } from '../reports/audit.routes.js';

/**
 * GET /state: everything the signed-in person may see, in the shape the Angular store holds.
 * Scoping happens here, so the client never receives another school's private data: other
 * schools appear as directory entries only, and the host sees nominees as name + class.
 */
export async function stateFor(me: AuthUser) {
  const notifications = (
    await many<NotificationRow>(
      pool,
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200',
      [me.id],
    )
  ).map(notificationJson);
  const self = (await one<UserRow>(pool, 'SELECT * FROM users WHERE id = $1', [me.id]))!;
  const empty = {
    events: [],
    categories: [],
    invitations: [],
    registrations: [],
    nominations: [],
    students: [],
    audit: [],
  };

  if (me.role === 'app_admin') {
    const schools = await many<SchoolRow & { users: number; events: number }>(
      pool,
      `SELECT s.*, (SELECT count(*) FROM users u WHERE u.school_id = s.id) AS users,
              (SELECT count(*) FROM events e WHERE e.host_school_id = s.id) AS events
         FROM schools s ORDER BY s.name`,
    );
    const stats = (await one<{ live_events: number; students: number; registrations: number }>(
      pool,
      `SELECT (SELECT count(*) FROM events WHERE status = 'open') AS live_events,
              (SELECT count(*) FROM users WHERE role = 'student') AS students,
              (SELECT count(*) FROM registrations WHERE status <> 'withdrawn') AS registrations`,
    ))!;
    return {
      ...empty,
      schools: schools.map((s) => schoolJson(s)),
      users: [userJson(self)],
      notifications,
      audit: await auditFor(me, 500),
      platform: {
        activeSchools: schools.filter((s) => s.status === 'active').length,
        suspendedSchools: schools.filter((s) => s.status === 'suspended').length,
        liveEvents: stats.live_events,
        students: stats.students,
        registrations: stats.registrations,
        perSchool: Object.fromEntries(
          schools.map((s) => [s.id, { users: s.users, events: s.events }]),
        ),
      },
    };
  }

  const schools = (await many<SchoolRow>(pool, 'SELECT * FROM schools ORDER BY name')).map((s) =>
    schoolJson(s, s.id === me.schoolId),
  );

  if (me.role === 'student') {
    const invitations = await many<InvitationRow>(
      pool,
      `${INVITATION_SELECT} JOIN events e ON e.id = i.event_id
        WHERE i.guest_school_id = $1 AND i.status = 'accepted' AND e.status <> 'draft'`,
      [me.schoolId],
    );
    const eventIds = invitations.map((i) => i.event_id);
    const [events, categories, registrations, profile] = await Promise.all([
      many<EventRow>(pool, `${EVENT_SELECT} WHERE e.id = ANY($1::uuid[])`, [eventIds]),
      many<CategoryRow>(
        pool,
        'SELECT * FROM categories WHERE event_id = ANY($1::uuid[]) ORDER BY position, name',
        [eventIds],
      ),
      many<RegistrationRow>(pool, 'SELECT * FROM registrations WHERE student_id = $1', [me.id]),
      one<ProfileRow>(pool, 'SELECT * FROM student_profiles WHERE user_id = $1', [me.id]),
    ]);
    return {
      ...empty,
      schools,
      users: [userJson(self)],
      students: profile ? [profileJson(profile)] : [],
      events: events.map(eventJson),
      categories: categories.map(categoryJson),
      invitations: invitations.map((i) => invitationJson({ ...i, coordinator_ids: [] })),
      registrations: registrations.map(registrationJson),
      notifications,
    };
  }

  // School Admin and teachers: own school in full, hosted events, and invitations received.
  const events = await many<EventRow>(
    pool,
    `${EVENT_SELECT} WHERE e.host_school_id = $1
        OR (e.status <> 'draft' AND EXISTS (SELECT 1 FROM invitations i WHERE i.event_id = e.id AND i.guest_school_id = $1))
      ORDER BY e.starts_at`,
    [me.schoolId],
  );
  const eventIds = events.map((e) => e.id);
  const hostedIds = events.filter((e) => e.host_school_id === me.schoolId).map((e) => e.id);
  const [users, students, categories, invitations, registrations, nominations] = await Promise.all([
    many<UserRow>(pool, 'SELECT * FROM users WHERE school_id = $1 ORDER BY full_name', [
      me.schoolId,
    ]),
    many<ProfileRow>(pool, 'SELECT * FROM student_profiles WHERE school_id = $1', [me.schoolId]),
    many<CategoryRow>(
      pool,
      'SELECT * FROM categories WHERE event_id = ANY($1::uuid[]) ORDER BY position, name',
      [eventIds],
    ),
    many<InvitationRow>(
      pool,
      `${INVITATION_SELECT} WHERE i.event_id = ANY($1::uuid[]) OR i.guest_school_id = $2`,
      [hostedIds, me.schoolId],
    ),
    many<RegistrationRow>(pool, 'SELECT * FROM registrations WHERE school_id = $1', [me.schoolId]),
    nominationsOf(pool, hostedIds),
  ]);
  return {
    schools,
    users: users.map(userJson),
    students: students.map(profileJson),
    events: events.map(eventJson),
    categories: categories.map(categoryJson),
    invitations: invitations.map(invitationJson),
    registrations: registrations.map(registrationJson),
    nominations,
    notifications,
    audit: me.role === 'school_admin' ? await auditFor(me, 500) : [],
  };
}

export function stateRouter(): Router {
  const r = Router();
  r.get('/state', async (req, res) => {
    res.set('Cache-Control', 'no-store').json(await stateFor(actor(req)));
  });
  return r;
}
