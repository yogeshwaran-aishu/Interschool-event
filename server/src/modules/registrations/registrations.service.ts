import { audit } from '../../common/audit.js';
import {
  EVENT_SELECT,
  INVITATION_SELECT,
  assertListOpen,
  isGuestStaff,
  loadEvent,
  loadHostedEvent,
  schoolAdminIds,
  type LoadedEvent,
} from '../../common/access.js';
import { many, one, pool, withTransaction, type Tx } from '../../common/db.js';
import { DomainError, notFound } from '../../common/errors.js';
import type { AuthUser } from '../../common/middleware/auth.js';
import { notify } from '../../common/notify.js';
import {
  categoryJson,
  eventJson,
  registrationJson,
  type CategoryRow,
  type EventRow,
  type InvitationRow,
  type RegistrationRow,
  type RegStatus,
} from '../../common/serializers.js';
import { assertTransition, REGISTRATION_TRANSITIONS } from '../../common/state-machines.js';

/** Categories a student fits: class range and gender rule. */
const ELIGIBLE = `c.min_class <= p.class AND c.max_class >= p.class
                  AND (c.gender_rule = 'any' OR c.gender_rule::text = p.gender::text)`;

type LockedRegistration = RegistrationRow & {
  school_id: string;
  category: CategoryRow;
  invitation: InvitationRow;
  event: LoadedEvent;
};

export class RegistrationsService {
  /** Open events the student's school accepted, with only the categories the student fits. */
  async studentEvents(me: AuthUser) {
    const rows = await many<EventRow & { invitation_id: string; categories: CategoryRow[] }>(
      pool,
      `SELECT ev.*, i.id AS invitation_id,
              (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.position, c.name) FROM categories c
                 JOIN student_profiles p ON p.user_id = $2
                WHERE c.event_id = ev.id AND ${ELIGIBLE}) AS categories
         FROM invitations i JOIN (${EVENT_SELECT}) ev ON ev.id = i.event_id
        WHERE i.guest_school_id = $1 AND i.status = 'accepted' AND ev.status <> 'draft'
        ORDER BY ev.starts_at`,
      [me.schoolId, me.id],
    );
    return rows
      .filter((r) => r.categories?.length)
      .map((r) => ({
        event: eventJson(r),
        invitationId: r.invitation_id,
        categories: r.categories.map(categoryJson),
      }));
  }

  /** RG-1: eligibility is checked again here, never trusted from the list. */
  async apply(me: AuthUser, categoryId: string, requestId?: string) {
    return withTransaction(async (tx) => {
      const category = await one<CategoryRow>(tx, 'SELECT * FROM categories WHERE id = $1', [
        categoryId,
      ]);
      if (!category) throw notFound('Category');
      const event = await loadEvent(tx, category.event_id);
      const inv = await one<InvitationRow>(
        tx,
        `${INVITATION_SELECT} WHERE i.event_id = $1 AND i.guest_school_id = $2 AND i.status = 'accepted'`,
        [category.event_id, me.schoolId],
      );
      if (!event || !inv)
        throw new DomainError('NOT_FOUND', 'Your school has not accepted this event.');
      if (event.status !== 'open' || event.past_deadline)
        throw new DomainError('DEADLINE_PASSED', 'Applications for this event are closed.');
      const profile = await one<{ eligible: boolean; consent: boolean }>(
        tx,
        `SELECT (${ELIGIBLE}) AS eligible, p.parental_consent AS consent
           FROM student_profiles p, categories c WHERE p.user_id = $1 AND c.id = $2`,
        [me.id, categoryId],
      );
      if (!profile?.consent)
        throw new DomainError('CONSENT_MISSING', 'Guardian consent is needed before applying.');
      if (!profile.eligible)
        throw new DomainError('NOT_ELIGIBLE', 'You do not meet this category’s eligibility.');

      const existing = await one<RegistrationRow>(
        tx,
        'SELECT * FROM registrations WHERE category_id = $1 AND student_id = $2 FOR UPDATE',
        [categoryId, me.id],
      );
      let reg: RegistrationRow;
      if (existing) {
        if (existing.status !== 'withdrawn')
          throw new DomainError('ALREADY_APPLIED', 'You have already applied to this category.');
        assertTransition(REGISTRATION_TRANSITIONS, existing.status, 'applied', 'application');
        reg = (await one<RegistrationRow>(
          tx,
          `UPDATE registrations SET status = 'applied', submitted_at = NULL, applied_at = now(), updated_at = now(),
                  school_decided_by = NULL, school_decided_at = NULL, host_decided_by = NULL, host_decided_at = NULL
            WHERE id = $1 RETURNING *`,
          [existing.id],
        ))!;
      } else {
        reg = (await one<RegistrationRow>(
          tx,
          `INSERT INTO registrations (invitation_id, category_id, student_id, school_id)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [inv.id, categoryId, me.id, me.schoolId],
        ))!;
      }
      await audit(tx, {
        actorId: me.id,
        schoolId: me.schoolId,
        action: 'registration.applied',
        entity: 'Registration',
        entityId: reg.id,
        after: { categoryId },
        requestId,
      });
      const student = await one<{ full_name: string }>(
        tx,
        'SELECT full_name FROM users WHERE id = $1',
        [me.id],
      );
      const reviewers = await many<{ id: string }>(
        tx,
        `SELECT id FROM users WHERE school_id = $1 AND (role = 'school_admin' OR id = ANY($2::uuid[]))`,
        [me.schoolId, inv.coordinator_ids],
      );
      await notify(
        tx,
        reviewers.map((r) => r.id),
        'application_submitted',
        {
          title: 'New application to review',
          body: `${student!.full_name} applied for ${category.name} — ${event.title}.`,
          link: `/approvals/${inv.id}`,
        },
      );
      return registrationJson(reg);
    });
  }

  /** RG-6: withdraw before the deadline; frees a quota slot. */
  async withdraw(me: AuthUser, registrationId: string, requestId?: string) {
    return withTransaction(async (tx) => {
      const reg = await this.lock(tx, registrationId, 'student_id', me.id);
      if (reg.event.past_deadline)
        throw new DomainError(
          'DEADLINE_PASSED',
          'You can only withdraw before the registration deadline.',
        );
      assertTransition(REGISTRATION_TRANSITIONS, reg.status, 'withdrawn', 'application');
      const after = await this.setStatus(tx, reg.id, 'withdrawn');
      await audit(tx, {
        actorId: me.id,
        schoolId: me.schoolId,
        action: 'registration.withdrawn',
        entity: 'Registration',
        entityId: reg.id,
        before: { status: reg.status },
        after: { status: 'withdrawn' },
        requestId,
      });
      return registrationJson(after);
    });
  }

  /** The caller's own students' applications, optionally for one event. */
  async schoolList(me: AuthUser, eventId?: string) {
    const rows = await many<
      RegistrationRow & {
        coordinator_ids: string[];
        student_name: string;
        class: number;
        category_name: string;
        event_id: string;
      }
    >(
      pool,
      `SELECT r.*, u.full_name AS student_name, p.class, c.name AS category_name, i.event_id,
              COALESCE((SELECT array_agg(user_id::text) FROM invitation_coordinators WHERE invitation_id = i.id), '{}') AS coordinator_ids
         FROM registrations r
         JOIN invitations i ON i.id = r.invitation_id
         JOIN users u ON u.id = r.student_id
         JOIN student_profiles p ON p.user_id = r.student_id
         JOIN categories c ON c.id = r.category_id
        WHERE r.school_id = $1 AND ($2::uuid IS NULL OR i.event_id = $2)
        ORDER BY r.applied_at DESC`,
      [me.schoolId, eventId ?? null],
    );
    return rows
      .filter((r) => me.role === 'school_admin' || r.coordinator_ids.includes(me.id))
      .map((r) => ({
        ...registrationJson(r),
        eventId: r.event_id,
        studentName: r.student_name,
        className: r.class,
        categoryName: r.category_name,
      }));
  }

  /** RG-3: approvals can never exceed the category's per-school quota, even under concurrency. */
  async schoolDecide(
    me: AuthUser,
    registrationId: string,
    approve: boolean,
    reason: string,
    requestId?: string,
  ) {
    return withTransaction(async (tx) => {
      const reg = await this.lock(tx, registrationId, 'school_id', me.schoolId!);
      if (!isGuestStaff(reg.invitation, me))
        throw new DomainError(
          'FORBIDDEN',
          'Only your school’s admin or assigned coordinator can review this application.',
        );
      assertListOpen(reg.event);
      if (reg.invitation.status !== 'accepted')
        throw new DomainError('INVALID_TRANSITION', 'This invitation is no longer active.');
      if (reg.submitted_at)
        throw new DomainError(
          'INVALID_TRANSITION',
          'This nomination was already sent to the host.',
        );
      const next: RegStatus = approve ? 'school_approved' : 'school_rejected';
      assertTransition(REGISTRATION_TRANSITIONS, reg.status, next, 'application');

      if (approve) {
        // Serialise approvals for this school + event: lock the invitation row first.
        await tx.query('SELECT id FROM invitations WHERE id = $1 FOR UPDATE', [reg.invitation_id]);
        const used = await one<{ n: number }>(
          tx,
          `SELECT count(*) AS n FROM registrations
            WHERE invitation_id = $1 AND category_id = $2 AND status IN ('school_approved','host_confirmed')`,
          [reg.invitation_id, reg.category_id],
        );
        if (used!.n >= reg.category.max_per_school)
          throw new DomainError(
            'QUOTA_FULL',
            `Quota reached: ${reg.category.name} allows ${reg.category.max_per_school} per school.`,
            {
              categoryId: reg.category_id,
              limit: reg.category.max_per_school,
            },
          );
      }
      const after = (await one<RegistrationRow>(
        tx,
        `UPDATE registrations SET status = $2, school_decided_by = $3, school_decided_at = now(),
                reject_reason = $4, updated_at = now() WHERE id = $1 RETURNING *`,
        [reg.id, next, me.id, approve ? null : reason || null],
      ))!;
      await audit(tx, {
        actorId: me.id,
        schoolId: me.schoolId,
        action: `registration.${approve ? 'approved' : 'rejected'}`,
        entity: 'Registration',
        entityId: reg.id,
        before: { status: reg.status },
        after: { status: next },
        requestId,
      });
      await notify(
        tx,
        [reg.student_id],
        approve ? 'application_approved' : 'application_rejected',
        {
          title: approve
            ? 'Your school approved your application'
            : 'Your school did not approve your application',
          body: `${reg.category.name} — ${reg.event.title}${!approve && reason ? `. Reason: ${reason}` : ''}`,
          link: '/my-applications',
        },
      );
      return registrationJson(after);
    });
  }

  /** RG-5: the host confirms or rejects a submitted nomination. */
  async hostDecide(
    me: AuthUser,
    registrationId: string,
    confirm: boolean,
    reason: string,
    requestId?: string,
  ) {
    return withTransaction(async (tx) => {
      const base = await one<{ event_id: string }>(
        tx,
        `SELECT i.event_id FROM registrations r JOIN invitations i ON i.id = r.invitation_id WHERE r.id = $1`,
        [registrationId],
      );
      if (!base) throw notFound('Nomination');
      const event = await loadHostedEvent(tx, base.event_id, me).catch(() => {
        throw notFound('Nomination');
      });
      const reg = await this.lock(tx, registrationId);
      if (!reg.submitted_at) throw notFound('Nomination');
      if (event.status === 'cancelled' || event.status === 'completed')
        throw new DomainError('INVALID_TRANSITION', 'This event is no longer accepting changes.');
      if (reg.status === 'withdrawn')
        throw new DomainError('INVALID_TRANSITION', 'This student has withdrawn.');
      const next: RegStatus = confirm ? 'host_confirmed' : 'host_rejected';
      assertTransition(REGISTRATION_TRANSITIONS, reg.status, next, 'nomination');
      const after = (await one<RegistrationRow>(
        tx,
        `UPDATE registrations SET status = $2, host_decided_by = $3, host_decided_at = now(),
                reject_reason = $4, updated_at = now() WHERE id = $1 RETURNING *`,
        [reg.id, next, me.id, confirm ? null : reason || null],
      ))!;
      await audit(tx, {
        actorId: me.id,
        schoolId: me.schoolId,
        action: `nomination.${confirm ? 'confirmed' : 'rejected'}`,
        entity: 'Registration',
        entityId: reg.id,
        before: { status: reg.status },
        after: { status: next },
        requestId,
      });
      const student = await one<{ full_name: string }>(
        tx,
        'SELECT full_name FROM users WHERE id = $1',
        [reg.student_id],
      );
      await notify(
        tx,
        [reg.student_id, ...(await schoolAdminIds(tx, reg.school_id))],
        confirm ? 'nomination_confirmed' : 'nomination_rejected',
        {
          title: confirm ? 'Participation confirmed' : 'Nomination not accepted by host',
          body: `${student!.full_name} — ${reg.category.name}, ${event.title}`,
          link: '/my-applications',
        },
      );
      return registrationJson(after);
    });
  }

  /** Locks a registration (optionally scoped by student or school) and loads what rules need. */
  private async lock(
    tx: Tx,
    id: string,
    scopeColumn?: 'student_id' | 'school_id',
    scopeValue?: string,
  ): Promise<LockedRegistration> {
    const reg = await one<RegistrationRow & { school_id: string }>(
      tx,
      `SELECT * FROM registrations WHERE id = $1 ${scopeColumn ? `AND ${scopeColumn} = $2` : ''} FOR UPDATE`,
      scopeColumn ? [id, scopeValue] : [id],
    );
    if (!reg) throw notFound('Application');
    const category = await one<CategoryRow>(tx, 'SELECT * FROM categories WHERE id = $1', [
      reg.category_id,
    ]);
    const invitation = await one<InvitationRow>(tx, `${INVITATION_SELECT} WHERE i.id = $1`, [
      reg.invitation_id,
    ]);
    const event = await loadEvent(tx, invitation!.event_id);
    return { ...reg, category: category!, invitation: invitation!, event: event! };
  }

  private async setStatus(tx: Tx, id: string, status: RegStatus) {
    return (await one<RegistrationRow>(
      tx,
      'UPDATE registrations SET status = $2, updated_at = now() WHERE id = $1 RETURNING *',
      [id, status],
    ))!;
  }
}
