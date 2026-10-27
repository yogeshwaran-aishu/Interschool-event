import { audit } from '../../common/audit.js';
import {
  EVENT_SELECT,
  INVITATION_SELECT,
  assertListOpen,
  hostStaffIds,
  loadGuestInvitation,
  schoolName,
} from '../../common/access.js';
import { many, pool, withTransaction } from '../../common/db.js';
import { DomainError } from '../../common/errors.js';
import { enqueue } from '../../common/jobs.js';
import type { AuthUser } from '../../common/middleware/auth.js';
import { notify } from '../../common/notify.js';
import {
  eventJson,
  invitationJson,
  type EventRow,
  type InvitationRow,
} from '../../common/serializers.js';
import {
  assertTransition,
  INVITATION_TRANSITIONS,
  REGISTRATION_TRANSITIONS,
} from '../../common/state-machines.js';
import { ownTeachers } from '../events/events.service.js';

export class InvitationsService {
  /** Invitations addressed to the caller's school (teachers: the ones they coordinate). */
  async received(me: AuthUser) {
    const rows = await many<InvitationRow & { event: EventRow }>(
      pool,
      `SELECT x.*, to_jsonb(ev) AS event FROM (${INVITATION_SELECT} WHERE i.guest_school_id = $1) x
         JOIN (${EVENT_SELECT}) ev ON ev.id = x.event_id
        WHERE ev.status <> 'draft'
          AND ($2 = 'school_admin' OR $3::uuid = ANY(x.coordinator_ids::uuid[]))
        ORDER BY ev.starts_at`,
      [me.schoolId, me.role, me.id],
    );
    return rows.map((r) => ({ ...invitationJson(r), event: eventJson(r.event) }));
  }

  /** IN-2: accept or decline with an optional note, before the deadline. */
  async respond(
    me: AuthUser,
    invitationId: string,
    accept: boolean,
    note: string,
    requestId?: string,
  ) {
    return withTransaction(async (tx) => {
      const inv = await loadGuestInvitation(tx, invitationId, me, true);
      const next = accept ? 'accepted' : 'rejected';
      assertTransition(INVITATION_TRANSITIONS, inv.status, next, 'invitation');
      if (inv.event.status !== 'open' || inv.event.past_deadline)
        throw new DomainError('DEADLINE_PASSED', 'The registration deadline has passed.');
      await tx.query(
        `UPDATE invitations SET status = $2, responded_by = $3, responded_at = now(), response_note = NULLIF($4, '')
          WHERE id = $1`,
        [invitationId, next, me.id, note],
      );
      await audit(tx, {
        actorId: me.id,
        schoolId: me.schoolId,
        action: `invitation.${next}`,
        entity: 'Invitation',
        entityId: invitationId,
        before: { status: inv.status },
        after: { status: next },
        requestId,
      });
      const guest = await schoolName(tx, me.schoolId);
      await notify(tx, await hostStaffIds(tx, inv.event), `invitation_${next}`, {
        title: `${guest} ${next} your invitation`,
        body: `${inv.event.title}${note ? ` — “${note}”` : ''}`,
        link: `/events/${inv.event.id}`,
      });
      // Fan-out to eligible students runs as a job, so this request returns in milliseconds.
      if (accept) await enqueue(tx, 'event.fanout', { invitationId });
      return invitationJson({ ...inv, status: next, response_note: note || null });
    });
  }

  async setCoordinators(
    me: AuthUser,
    invitationId: string,
    teacherIds: string[],
    requestId?: string,
  ) {
    return withTransaction(async (tx) => {
      const inv = await loadGuestInvitation(tx, invitationId, me, true);
      const ids = await ownTeachers(tx, me, teacherIds);
      await tx.query('DELETE FROM invitation_coordinators WHERE invitation_id = $1', [
        invitationId,
      ]);
      await tx.query(
        'INSERT INTO invitation_coordinators (invitation_id, user_id) SELECT $1, unnest($2::uuid[])',
        [invitationId, ids],
      );
      await audit(tx, {
        actorId: me.id,
        schoolId: me.schoolId,
        action: 'invitation.coordinators_assigned',
        entity: 'Invitation',
        entityId: invitationId,
        after: { teacherIds: ids },
        requestId,
      });
      return invitationJson({ ...inv, coordinator_ids: ids });
    });
  }

  /** RG-4: sends every approved, unsent nomination to the host in one action. */
  async submit(me: AuthUser, invitationId: string, requestId?: string) {
    return withTransaction(async (tx) => {
      const inv = await loadGuestInvitation(tx, invitationId, me, true);
      if (me.role !== 'school_admin' && !inv.coordinator_ids.includes(me.id))
        throw new DomainError('FORBIDDEN', 'You cannot submit nominations for this school.');
      if (inv.status !== 'accepted')
        throw new DomainError('INVALID_TRANSITION', 'This invitation is no longer active.');
      assertListOpen(inv.event);
      const sent = await many<{ id: string; status: 'school_approved' }>(
        tx,
        `UPDATE registrations SET submitted_at = now(), updated_at = now()
          WHERE invitation_id = $1 AND status = 'school_approved' AND submitted_at IS NULL
          RETURNING id, status`,
        [invitationId],
      );
      if (!sent.length)
        throw new DomainError('CONFLICT', 'There are no new approved applications to submit.');
      for (const r of sent)
        assertTransition(REGISTRATION_TRANSITIONS, r.status, 'host_confirmed', 'nomination');
      await tx.query('UPDATE invitations SET submitted_at = now() WHERE id = $1', [invitationId]);
      await audit(tx, {
        actorId: me.id,
        schoolId: me.schoolId,
        action: 'nominations.submitted',
        entity: 'Invitation',
        entityId: invitationId,
        after: { count: sent.length },
        requestId,
      });
      await notify(tx, await hostStaffIds(tx, inv.event), 'nominations_submitted', {
        title: 'Nominations received',
        body: `${await schoolName(tx, me.schoolId)} submitted ${sent.length} nomination(s) for ${inv.event.title}.`,
        link: `/events/${inv.event.id}/nominations`,
      });
      return { submitted: sent.length };
    });
  }
}
