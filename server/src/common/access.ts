import { one, type Db } from './db.js';
import { DomainError, notFound } from './errors.js';
import type { AuthUser } from './middleware/auth.js';
import type { EventRow, InvitationRow } from './serializers.js';

/**
 * Relationship checks shared by the modules: "is the caller host staff for this event?",
 * "is the caller guest staff on this invitation?". Records outside the caller's reach are 404.
 */

export type LoadedEvent = EventRow & { past_deadline: boolean };
export type LoadedInvitation = InvitationRow & { event: LoadedEvent };

export const EVENT_SELECT = `
  SELECT e.*, e.reg_deadline < now() AS past_deadline,
         COALESCE((SELECT array_agg(user_id::text) FROM event_coordinators WHERE event_id = e.id), '{}') AS coordinator_ids
    FROM events e`;

export const INVITATION_SELECT = `
  SELECT i.*,
         COALESCE((SELECT array_agg(user_id::text) FROM invitation_coordinators WHERE invitation_id = i.id), '{}') AS coordinator_ids
    FROM invitations i`;

export function isHostStaff(event: EventRow, me: AuthUser): boolean {
  if (me.schoolId !== event.host_school_id) return false;
  return (
    me.role === 'school_admin' ||
    (me.role === 'teacher' && (event.coordinator_ids.includes(me.id) || event.created_by === me.id))
  );
}

export function isGuestStaff(invitation: InvitationRow, me: AuthUser): boolean {
  if (me.schoolId !== invitation.guest_school_id) return false;
  return (
    me.role === 'school_admin' ||
    (me.role === 'teacher' && invitation.coordinator_ids.includes(me.id))
  );
}

/** Loads an event the caller hosts. `lock` takes a row lock for the rest of the transaction. */
export async function loadHostedEvent(
  db: Db,
  eventId: string,
  me: AuthUser,
  lock = false,
): Promise<LoadedEvent> {
  const event = await one<LoadedEvent>(
    db,
    `${EVENT_SELECT} WHERE e.id = $1 AND e.host_school_id = $2 ${lock ? 'FOR UPDATE OF e' : ''}`,
    [eventId, me.schoolId],
  );
  if (!event) throw notFound('Event');
  if (!isHostStaff(event, me))
    throw new DomainError('FORBIDDEN', 'Only the host school can manage this event.');
  return event;
}

export async function loadEvent(db: Db, eventId: string): Promise<LoadedEvent | undefined> {
  return one<LoadedEvent>(db, `${EVENT_SELECT} WHERE e.id = $1`, [eventId]);
}

/** Loads an invitation addressed to the caller's school, with its event. */
export async function loadGuestInvitation(
  db: Db,
  invitationId: string,
  me: AuthUser,
  lock = false,
): Promise<LoadedInvitation> {
  const invitation = await one<InvitationRow>(
    db,
    `${INVITATION_SELECT} WHERE i.id = $1 AND i.guest_school_id = $2 ${lock ? 'FOR UPDATE OF i' : ''}`,
    [invitationId, me.schoolId],
  );
  if (!invitation) throw notFound('Invitation');
  const event = await loadEvent(db, invitation.event_id);
  if (!event || event.status === 'draft') throw notFound('Invitation');
  return { ...invitation, event };
}

export function assertListOpen(event: LoadedEvent): void {
  if (event.status !== 'open' || event.past_deadline)
    throw new DomainError(
      'DEADLINE_PASSED',
      'The list is locked: the registration deadline has passed.',
    );
}

/** Ids of the host school's admins plus the event's coordinators. */
export async function hostStaffIds(db: Db, event: EventRow): Promise<string[]> {
  const rows = await db.query<{ id: string }>(
    `SELECT id FROM users WHERE school_id = $1 AND status <> 'suspended'
        AND (role = 'school_admin' OR id = ANY($2::uuid[]))`,
    [event.host_school_id, event.coordinator_ids],
  );
  return rows.rows.map((r) => r.id);
}

export async function schoolAdminIds(db: Db, schoolId: string): Promise<string[]> {
  const rows = await db.query<{ id: string }>(
    `SELECT id FROM users WHERE school_id = $1 AND role = 'school_admin' AND status <> 'suspended'`,
    [schoolId],
  );
  return rows.rows.map((r) => r.id);
}

export async function schoolName(db: Db, schoolId: string | null): Promise<string> {
  if (!schoolId) return '';
  return (
    (await one<{ name: string }>(db, 'SELECT name FROM schools WHERE id = $1', [schoolId]))?.name ??
    ''
  );
}
