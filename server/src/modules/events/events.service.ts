import { audit } from '../../common/audit.js';
import {
  EVENT_SELECT,
  INVITATION_SELECT,
  loadHostedEvent,
  schoolAdminIds,
  schoolName,
} from '../../common/access.js';
import { many, one, pool, withTransaction, type Db, type Tx } from '../../common/db.js';
import { DomainError } from '../../common/errors.js';
import type { AuthUser } from '../../common/middleware/auth.js';
import { notify } from '../../common/notify.js';
import {
  categoryJson,
  eventJson,
  invitationJson,
  type CategoryRow,
  type EventRow,
  type InvitationRow,
} from '../../common/serializers.js';
import {
  assertTransition,
  EVENT_TRANSITIONS,
  INVITATION_TRANSITIONS,
} from '../../common/state-machines.js';
import type { EventDraft } from './events.schemas.js';

export class EventsService {
  async hosted(me: AuthUser) {
    const rows = await many<EventRow>(
      pool,
      `${EVENT_SELECT} WHERE e.host_school_id = $1
          AND ($2 = 'school_admin' OR e.created_by = $3
               OR EXISTS (SELECT 1 FROM event_coordinators c WHERE c.event_id = e.id AND c.user_id = $3))
        ORDER BY e.starts_at`,
      [me.schoolId, me.role, me.id],
    );
    return rows.map(eventJson);
  }

  async get(me: AuthUser, eventId: string) {
    const event = await loadHostedEvent(pool, eventId, me);
    return {
      ...eventJson(event),
      categories: (await this.categories(pool, eventId)).map(categoryJson),
    };
  }

  /** EV-1/EV-2: creates a draft (or publishes straight away) with its categories. */
  async create(me: AuthUser, draft: EventDraft, publish: boolean, requestId?: string) {
    const canHost =
      me.role === 'school_admin' ||
      (me.role === 'teacher' &&
        !!(await one(pool, 'SELECT 1 FROM users WHERE id = $1 AND can_host_events', [me.id])));
    if (!canHost)
      throw new DomainError('FORBIDDEN', 'You do not have permission to create events.');
    validateDraft(draft);
    return withTransaction(async (tx) => {
      if (publish) await assertDeadlineAhead(tx, draft.regDeadline);
      const event = (await one<EventRow>(
        tx,
        `INSERT INTO events (host_school_id, title, description, venue, starts_at, reg_deadline, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          me.schoolId,
          draft.title,
          draft.description,
          draft.venue,
          draft.startsAt,
          draft.regDeadline,
          publish ? 'open' : 'draft',
          me.id,
        ],
      ))!;
      if (me.role === 'teacher')
        await tx.query('INSERT INTO event_coordinators (event_id, user_id) VALUES ($1, $2)', [
          event.id,
          me.id,
        ]);
      await this.writeCategories(tx, event.id, draft.categories);
      const json = eventJson({ ...event, coordinator_ids: me.role === 'teacher' ? [me.id] : [] });
      await audit(tx, {
        actorId: me.id,
        schoolId: me.schoolId,
        action: publish ? 'event.published' : 'event.created',
        entity: 'Event',
        entityId: event.id,
        after: json,
        requestId,
      });
      return json;
    });
  }

  /** EV-4: edits to date, venue or eligibility notify every accepted school and applied student. */
  async update(me: AuthUser, eventId: string, draft: EventDraft, requestId?: string) {
    validateDraft(draft);
    return withTransaction(async (tx) => {
      const event = await loadHostedEvent(tx, eventId, me, true);
      if (event.status === 'cancelled' || event.status === 'completed')
        throw new DomainError('INVALID_TRANSITION', 'This event can no longer be edited.');
      const oldCats = await this.categories(tx, eventId);
      const material =
        new Date(event.starts_at).getTime() !== new Date(draft.startsAt).getTime() ||
        new Date(event.reg_deadline).getTime() !== new Date(draft.regDeadline).getTime() ||
        event.venue !== draft.venue ||
        JSON.stringify(oldCats.map(categoryJson).map(eligibilityKey)) !==
          JSON.stringify(draft.categories.map(eligibilityKey));

      const after = (await one<EventRow>(
        tx,
        `UPDATE events SET title = $2, description = $3, venue = $4, starts_at = $5, reg_deadline = $6, updated_at = now()
          WHERE id = $1 RETURNING *`,
        [eventId, draft.title, draft.description, draft.venue, draft.startsAt, draft.regDeadline],
      ))!;
      await this.replaceCategories(tx, eventId, oldCats, draft.categories);
      const json = eventJson({ ...after, coordinator_ids: event.coordinator_ids });
      await audit(tx, {
        actorId: me.id,
        schoolId: me.schoolId,
        action: 'event.updated',
        entity: 'Event',
        entityId: eventId,
        before: eventJson(event),
        after: json,
        requestId,
      });
      if (material && event.status !== 'draft')
        await notify(tx, await affectedUsers(tx, eventId), 'event_changed', {
          title: 'Event details changed',
          body: `${after.title} has changed date, venue or eligibility. Please review the updated details.`,
          link: `/events/${eventId}`,
        });
      return json;
    });
  }

  async publish(me: AuthUser, eventId: string, requestId?: string) {
    return withTransaction(async (tx) => {
      const event = await loadHostedEvent(tx, eventId, me, true);
      assertTransition(EVENT_TRANSITIONS, event.status, 'open', 'event');
      if (!(await this.categories(tx, eventId)).length)
        throw new DomainError('VALIDATION_FAILED', 'Add at least one category.');
      await assertDeadlineAhead(tx, event.reg_deadline);
      await tx.query(`UPDATE events SET status = 'open', updated_at = now() WHERE id = $1`, [
        eventId,
      ]);
      await audit(tx, {
        actorId: me.id,
        schoolId: me.schoolId,
        action: 'event.published',
        entity: 'Event',
        entityId: eventId,
        before: { status: event.status },
        after: { status: 'open' },
        requestId,
      });
      return eventJson({ ...event, status: 'open' });
    });
  }

  /** EV-5: cancels with a reason, revokes pending invitations and tells everyone affected. */
  async cancel(me: AuthUser, eventId: string, reason: string, requestId?: string) {
    if (!reason.trim())
      throw new DomainError(
        'VALIDATION_FAILED',
        'Give a reason so schools and students understand why.',
      );
    return withTransaction(async (tx) => {
      const event = await loadHostedEvent(tx, eventId, me, true);
      assertTransition(EVENT_TRANSITIONS, event.status, 'cancelled', 'event');
      const recipients = await affectedUsers(tx, eventId);
      await tx.query(
        `UPDATE events SET status = 'cancelled', cancel_reason = $2, updated_at = now() WHERE id = $1`,
        [eventId, reason],
      );
      await tx.query(
        `UPDATE invitations SET status = 'revoked' WHERE event_id = $1 AND status = 'pending'`,
        [eventId],
      );
      await audit(tx, {
        actorId: me.id,
        schoolId: me.schoolId,
        action: 'event.cancelled',
        entity: 'Event',
        entityId: eventId,
        after: { reason },
        requestId,
      });
      await notify(tx, recipients, 'event_cancelled', {
        title: 'Event cancelled',
        body: `${event.title} has been cancelled. Reason: ${reason}`,
      });
      return eventJson({ ...event, status: 'cancelled', cancel_reason: reason });
    });
  }

  async setCoordinators(me: AuthUser, eventId: string, teacherIds: string[], requestId?: string) {
    if (me.role !== 'school_admin')
      throw new DomainError('FORBIDDEN_ROLE', 'Only the School Admin can assign coordinators.');
    return withTransaction(async (tx) => {
      const event = await loadHostedEvent(tx, eventId, me, true);
      const ids = await ownTeachers(tx, me, teacherIds);
      await tx.query('DELETE FROM event_coordinators WHERE event_id = $1', [eventId]);
      await tx.query(
        'INSERT INTO event_coordinators (event_id, user_id) SELECT $1, unnest($2::uuid[])',
        [eventId, ids],
      );
      await audit(tx, {
        actorId: me.id,
        schoolId: me.schoolId,
        action: 'event.coordinators_assigned',
        entity: 'Event',
        entityId: eventId,
        after: { teacherIds: ids },
        requestId,
      });
      return eventJson({ ...event, coordinator_ids: ids });
    });
  }

  // ---------- Invitations sent by the host (IN-1, IN-4) ----------

  async invite(me: AuthUser, eventId: string, schoolIds: string[], requestId?: string) {
    return withTransaction(async (tx) => {
      const event = await loadHostedEvent(tx, eventId, me, true);
      if (event.status !== 'open')
        throw new DomainError('INVALID_TRANSITION', 'Publish the event before inviting schools.');
      if (event.past_deadline)
        throw new DomainError('DEADLINE_PASSED', 'The registration deadline has passed.');
      const host = await schoolName(tx, event.host_school_id);
      const created = await many<InvitationRow>(
        tx,
        `INSERT INTO invitations (event_id, guest_school_id)
         SELECT $1, s.id FROM schools s
          WHERE s.id = ANY($2::uuid[]) AND s.status = 'active' AND s.id <> $3
         ON CONFLICT (event_id, guest_school_id) DO NOTHING
         RETURNING *`,
        [eventId, schoolIds, event.host_school_id],
      );
      for (const inv of created) {
        await audit(tx, {
          actorId: me.id,
          schoolId: me.schoolId,
          action: 'invitation.sent',
          entity: 'Invitation',
          entityId: inv.id,
          after: invitationJson({ ...inv, coordinator_ids: [] }),
          requestId,
        });
        await notify(tx, await schoolAdminIds(tx, inv.guest_school_id), 'invitation_received', {
          title: 'New invitation',
          body: `${host} invited you to ${event.title}.`,
          link: '/invitations',
        });
      }
      return {
        sent: created.length,
        invitations: created.map((i) => invitationJson({ ...i, coordinator_ids: [] })),
      };
    });
  }

  async invitations(me: AuthUser, eventId: string) {
    await loadHostedEvent(pool, eventId, me);
    const rows = await many<InvitationRow & { school_name: string }>(
      pool,
      `SELECT x.*, s.name AS school_name FROM (${INVITATION_SELECT} WHERE i.event_id = $1) x
         JOIN schools s ON s.id = x.guest_school_id ORDER BY s.name`,
      [eventId],
    );
    return rows.map((r) => ({ ...invitationJson(r), schoolName: r.school_name }));
  }

  async revoke(me: AuthUser, invitationId: string, requestId?: string) {
    return withTransaction(async (tx) => {
      const inv = await one<InvitationRow>(
        tx,
        `${INVITATION_SELECT} WHERE i.id = $1 FOR UPDATE OF i`,
        [invitationId],
      );
      if (!inv) throw new DomainError('NOT_FOUND', 'Invitation not found.');
      const event = await loadHostedEvent(tx, inv.event_id, me).catch(() => {
        throw new DomainError('NOT_FOUND', 'Invitation not found.');
      });
      assertTransition(INVITATION_TRANSITIONS, inv.status, 'revoked', 'invitation');
      await tx.query(`UPDATE invitations SET status = 'revoked' WHERE id = $1`, [invitationId]);
      await audit(tx, {
        actorId: me.id,
        schoolId: me.schoolId,
        action: 'invitation.revoked',
        entity: 'Invitation',
        entityId: invitationId,
        requestId,
      });
      await notify(tx, await schoolAdminIds(tx, inv.guest_school_id), 'invitation_revoked', {
        title: 'Invitation withdrawn',
        body: `${await schoolName(tx, event.host_school_id)} withdrew its invitation to ${event.title}.`,
        link: '/invitations',
      });
      return invitationJson({ ...inv, status: 'revoked' });
    });
  }

  // ---------- Nominations and export (RG-5, RP-1) ----------

  /** Submitted nominations as the host sees them: name, class, school and category only. */
  async nominations(me: AuthUser, eventId: string, db: Db = pool) {
    await loadHostedEvent(db, eventId, me);
    return nominationsOf(db, [eventId]);
  }

  async export(me: AuthUser, eventId: string, requestId?: string) {
    return withTransaction(async (tx) => {
      const event = await loadHostedEvent(tx, eventId, me);
      const rows = (await nominationsOf(tx, [eventId])).filter((n) => n.hostStatus === 'confirmed');
      // Exports move student data off the platform, so they are audited.
      await audit(tx, {
        actorId: me.id,
        schoolId: me.schoolId,
        action: 'event.exported',
        entity: 'Event',
        entityId: eventId,
        after: { rows: rows.length },
        requestId,
      });
      return { event: eventJson(event), rows };
    });
  }

  private categories(db: Db, eventId: string) {
    return many<CategoryRow>(
      db,
      'SELECT * FROM categories WHERE event_id = $1 ORDER BY position, name',
      [eventId],
    );
  }

  private async writeCategories(tx: Tx, eventId: string, cats: EventDraft['categories']) {
    for (const [i, c] of cats.entries())
      await tx.query(
        `INSERT INTO categories (event_id, name, min_class, max_class, gender_rule, type, team_size, max_per_school, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          eventId,
          c.name,
          c.minClass,
          c.maxClass,
          c.genderRule,
          c.type,
          c.type === 'team' ? c.teamSize : null,
          c.maxPerSchool,
          i,
        ],
      );
  }

  /** Keeps categories by name so registrations stay attached; refuses changes that would break them. */
  private async replaceCategories(
    tx: Tx,
    eventId: string,
    old: CategoryRow[],
    next: EventDraft['categories'],
  ) {
    const byName = new Map(old.map((c) => [c.name, c]));
    const used = new Map(
      (
        await many<{ category_id: string; active: number; approved: number }>(
          tx,
          `SELECT category_id,
                count(*) FILTER (WHERE r.status NOT IN ('withdrawn')) AS active,
                count(*) FILTER (WHERE r.status IN ('school_approved','host_confirmed')) AS approved
           FROM registrations r JOIN invitations i ON i.id = r.invitation_id
          WHERE i.event_id = $1 GROUP BY category_id`,
          [eventId],
        )
      ).map((u) => [u.category_id, u]),
    );
    const keep = new Set(next.map((c) => c.name));
    for (const c of old) {
      if (!keep.has(c.name) && (used.get(c.id)?.active ?? 0) > 0)
        throw new DomainError('CONFLICT', `${c.name} has applications, so it cannot be removed.`);
    }
    // Approvals by school can't exceed the new quota for any school.
    for (const [i, c] of next.entries()) {
      const existing = byName.get(c.name);
      if (existing) {
        const over = await one<{ n: number }>(
          tx,
          `SELECT max(n) AS n FROM (SELECT count(*) AS n FROM registrations
            WHERE category_id = $1 AND status IN ('school_approved','host_confirmed') GROUP BY invitation_id) x`,
          [existing.id],
        );
        if ((over?.n ?? 0) > c.maxPerSchool)
          throw new DomainError(
            'CONFLICT',
            `${c.name}: a school already has ${over!.n} approved, so the limit cannot go below that.`,
          );
        await tx.query(
          `UPDATE categories SET min_class = $2, max_class = $3, gender_rule = $4, type = $5, team_size = $6,
                  max_per_school = $7, position = $8 WHERE id = $1`,
          [
            existing.id,
            c.minClass,
            c.maxClass,
            c.genderRule,
            c.type,
            c.type === 'team' ? c.teamSize : null,
            c.maxPerSchool,
            i,
          ],
        );
      } else {
        await tx.query(
          `INSERT INTO categories (event_id, name, min_class, max_class, gender_rule, type, team_size, max_per_school, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            eventId,
            c.name,
            c.minClass,
            c.maxClass,
            c.genderRule,
            c.type,
            c.type === 'team' ? c.teamSize : null,
            c.maxPerSchool,
            i,
          ],
        );
      }
    }
    await tx.query('DELETE FROM categories WHERE event_id = $1 AND NOT (name = ANY($2))', [
      eventId,
      [...keep],
    ]);
  }
}

export interface NominationView {
  registrationId: string;
  eventId: string;
  invitationId: string;
  studentName: string;
  className: number;
  schoolName: string;
  categoryName: string;
  hostStatus: 'pending' | 'confirmed' | 'rejected';
}

export async function nominationsOf(db: Db, eventIds: string[]): Promise<NominationView[]> {
  const rows = await many<{
    id: string;
    event_id: string;
    invitation_id: string;
    full_name: string;
    class: number;
    school: string;
    category: string;
    status: string;
  }>(
    db,
    `SELECT r.id, i.event_id, r.invitation_id, u.full_name, p.class, s.name AS school, c.name AS category, r.status
       FROM registrations r
       JOIN invitations i ON i.id = r.invitation_id
       JOIN users u ON u.id = r.student_id
       JOIN student_profiles p ON p.user_id = r.student_id
       JOIN schools s ON s.id = r.school_id
       JOIN categories c ON c.id = r.category_id
      WHERE i.event_id = ANY($1::uuid[]) AND r.submitted_at IS NOT NULL
        AND r.status IN ('school_approved','host_confirmed','host_rejected')
      ORDER BY s.name, c.name, u.full_name`,
    [eventIds],
  );
  return rows.map((r) => ({
    registrationId: r.id,
    eventId: r.event_id,
    invitationId: r.invitation_id,
    studentName: r.full_name,
    className: r.class,
    schoolName: r.school,
    categoryName: r.category,
    hostStatus:
      r.status === 'host_confirmed'
        ? 'confirmed'
        : r.status === 'host_rejected'
          ? 'rejected'
          : 'pending',
  }));
}

/** Admins of accepted guest schools plus students with a live application. */
export async function affectedUsers(db: Db, eventId: string): Promise<string[]> {
  const rows = await many<{ id: string }>(
    db,
    `SELECT u.id FROM users u JOIN invitations i ON i.guest_school_id = u.school_id
      WHERE i.event_id = $1 AND i.status = 'accepted' AND u.role = 'school_admin'
     UNION
     SELECT r.student_id FROM registrations r JOIN invitations i ON i.id = r.invitation_id
      WHERE i.event_id = $1 AND i.status = 'accepted' AND r.status <> 'withdrawn'`,
    [eventId],
  );
  return rows.map((r) => r.id);
}

async function ownTeachers(db: Db, me: AuthUser, ids: string[]): Promise<string[]> {
  const rows = await many<{ id: string }>(
    db,
    `SELECT id FROM users WHERE id = ANY($1::uuid[]) AND role = 'teacher' AND school_id = $2`,
    [ids, me.schoolId],
  );
  return rows.map((r) => r.id);
}

export { ownTeachers };

async function assertDeadlineAhead(db: Db, deadline: string): Promise<void> {
  const row = await one<{ ahead: boolean }>(db, 'SELECT $1::timestamptz > now() AS ahead', [
    deadline,
  ]);
  if (!row?.ahead)
    throw new DomainError('DEADLINE_PASSED', 'The registration deadline must be in the future.');
}

function validateDraft(draft: EventDraft): void {
  if (!draft.title) throw new DomainError('VALIDATION_FAILED', 'Add a title.');
  if (!draft.categories.length)
    throw new DomainError('VALIDATION_FAILED', 'Add at least one category.');
  if (new Date(draft.regDeadline) >= new Date(draft.startsAt))
    throw new DomainError(
      'VALIDATION_FAILED',
      'The registration deadline must be before the event starts.',
    );
  const names = new Set<string>();
  for (const c of draft.categories) {
    if (c.minClass > c.maxClass)
      throw new DomainError(
        'VALIDATION_FAILED',
        `${c.name}: the lowest class must not be above the highest.`,
      );
    if (c.maxPerSchool < 1)
      throw new DomainError('VALIDATION_FAILED', `${c.name}: allow at least one entry per school.`);
    if (names.has(c.name))
      throw new DomainError('VALIDATION_FAILED', `Two categories are called ${c.name}.`);
    names.add(c.name);
  }
}

function eligibilityKey(c: {
  name: string;
  minClass: number;
  maxClass: number;
  genderRule: string;
}): string {
  return `${c.name}|${c.minClass}|${c.maxClass}|${c.genderRule}`;
}
