import { Service, inject } from '@angular/core';
import { Auth } from './auth';
import { Clock } from './clock';
import { PersonImportRow } from './csv';
import {
  AppNotification,
  Category,
  Db,
  EventStatus,
  Invitation,
  Registration,
  Role,
  School,
  SchoolEvent,
  StudentProfile,
  User,
} from './models';
import {
  DomainError,
  EVENT_TRANSITIONS,
  HOST_DECISION_TRANSITIONS,
  INVITATION_TRANSITIONS,
  SCHOOL_DECISION_TRANSITIONS,
  assertTransition,
} from './state-machines';
import { Store } from './store';

export interface EventDraft {
  title: string;
  description: string;
  venue: string;
  startsAt: string;
  regDeadline: string;
  categories: Omit<Category, 'id' | 'eventId'>[];
}

export interface NewSchool {
  name: string;
  board: string;
  city: string;
  address: string;
  contactEmail: string;
  contactPhone: string;
  adminName: string;
  adminEmail: string;
}

/** A nomination as the host sees it: only name, class, school and category (PRD privacy rule). */
export interface HostNominationView {
  registrationId: string;
  studentName: string;
  className: number;
  schoolName: string;
  categoryName: string;
  hostStatus: Registration['hostStatus'];
}

let seq = 0;
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function isEligible(category: Category, profile: StudentProfile | undefined): boolean {
  if (!profile) return false;
  if (profile.className < category.minClass || profile.className > category.maxClass) return false;
  if (category.genderRule !== 'any' && profile.gender !== category.genderRule) return false;
  return true;
}

/**
 * The single service layer that owns every write. It checks role, tenant scope
 * (`schoolId`), deadlines, quotas and state transitions, then records an audit entry and
 * queues notifications. UI components never mutate the store directly.
 */
@Service()
export class DomainService {
  private readonly store = inject(Store);
  private readonly auth = inject(Auth);
  private readonly clock = inject(Clock);

  // ---------- Reads ----------

  get db(): Db {
    return this.store.db();
  }

  school(schoolId: string | null | undefined): School | undefined {
    return this.db.schools.find((s) => s.id === schoolId);
  }

  user(userId: string | undefined): User | undefined {
    return this.db.users.find((u) => u.id === userId);
  }

  event(eventId: string): SchoolEvent | undefined {
    return this.db.events.find((e) => e.id === eventId);
  }

  categoriesOf(eventId: string): Category[] {
    return this.db.categories.filter((c) => c.eventId === eventId);
  }

  profile(userId: string): StudentProfile | undefined {
    return this.db.students.find((s) => s.userId === userId);
  }

  invitationsOf(eventId: string): Invitation[] {
    return this.db.invitations.filter((i) => i.eventId === eventId);
  }

  registrationsOf(invitationId: string): Registration[] {
    return this.db.registrations.filter((r) => r.invitationId === invitationId);
  }

  isPastDeadline(event: SchoolEvent): boolean {
    return this.clock.now().getTime() > new Date(event.regDeadline).getTime();
  }

  /** Events the current user's school hosts (teachers: only ones they coordinate). */
  hostedEvents(): SchoolEvent[] {
    const me = this.auth.user();
    if (!me?.schoolId) return [];
    return this.db.events
      .filter((e) => e.hostSchoolId === me.schoolId)
      .filter(
        (e) =>
          me.role === 'school_admin' || e.coordinatorIds.includes(me.id) || e.createdBy === me.id,
      )
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  /** Invitations addressed to the current user's school (teachers: ones they coordinate). */
  receivedInvitations(): Invitation[] {
    const me = this.auth.user();
    if (!me?.schoolId) return [];
    return this.db.invitations
      .filter((i) => i.guestSchoolId === me.schoolId)
      .filter((i) => me.role === 'school_admin' || i.coordinatorIds.includes(me.id))
      .filter((i) => this.event(i.eventId)?.status !== 'draft');
  }

  /** Events a student can see: their school accepted, and at least one category fits them. */
  openEventsForStudent(): { event: SchoolEvent; invitation: Invitation; categories: Category[] }[] {
    const me = this.auth.user();
    if (me?.role !== 'student') return [];
    const profile = this.profile(me.id);
    return this.db.invitations
      .filter((i) => i.guestSchoolId === me.schoolId && i.status === 'accepted')
      .map((invitation) => {
        const event = this.event(invitation.eventId)!;
        return {
          event,
          invitation,
          categories: this.categoriesOf(event.id).filter((c) => isEligible(c, profile)),
        };
      })
      .filter((x) => x.event && x.event.status !== 'draft' && x.categories.length > 0);
  }

  myRegistrations(): Registration[] {
    const me = this.auth.user();
    return me ? this.db.registrations.filter((r) => r.studentId === me.id) : [];
  }

  approvedCount(invitationId: string, categoryId: string): number {
    return this.db.registrations.filter(
      (r) =>
        r.invitationId === invitationId &&
        r.categoryId === categoryId &&
        r.schoolStatus === 'approved',
    ).length;
  }

  hostNominations(eventId: string): HostNominationView[] {
    const event = this.event(eventId);
    if (!event || !this.isHostStaff(event)) return [];
    const invitations = new Map(this.invitationsOf(eventId).map((i) => [i.id, i]));
    return this.db.registrations
      .filter(
        (r) =>
          invitations.has(r.invitationId) &&
          r.schoolStatus === 'approved' &&
          r.hostStatus !== 'not_submitted',
      )
      .map((r) => {
        const invitation = invitations.get(r.invitationId)!;
        return {
          registrationId: r.id,
          studentName: this.user(r.studentId)?.name ?? 'Unknown',
          className: this.profile(r.studentId)?.className ?? 0,
          schoolName: this.school(invitation.guestSchoolId)?.name ?? 'Unknown',
          categoryName: this.db.categories.find((c) => c.id === r.categoryId)?.name ?? 'Unknown',
          hostStatus: r.hostStatus,
        };
      });
  }

  isHostStaff(event: SchoolEvent, me = this.auth.user()): boolean {
    if (!me || me.schoolId !== event.hostSchoolId) return false;
    return (
      me.role === 'school_admin' ||
      (me.role === 'teacher' && (event.coordinatorIds.includes(me.id) || event.createdBy === me.id))
    );
  }

  isGuestStaff(invitation: Invitation, me = this.auth.user()): boolean {
    if (!me || me.schoolId !== invitation.guestSchoolId) return false;
    return (
      me.role === 'school_admin' ||
      (me.role === 'teacher' && invitation.coordinatorIds.includes(me.id))
    );
  }

  canHostEvents(me = this.auth.user()): boolean {
    return me?.role === 'school_admin' || (me?.role === 'teacher' && !!me.canHostEvents);
  }

  // ---------- Deadline sweep (IN-3) ----------

  /** Closes events past their deadline and expires unanswered invitations. Idempotent. */
  sweepDeadlines(): void {
    const now = this.clock.now().getTime();
    const db = this.db;
    const due = db.events.some(
      (e) =>
        (e.status === 'open' && new Date(e.regDeadline).getTime() < now) ||
        (e.status === 'closed' && new Date(e.startsAt).getTime() < now),
    );
    if (!due) return;
    this.store.update((d) => {
      for (const e of d.events) {
        if (e.status === 'open' && new Date(e.regDeadline).getTime() < now) {
          e.status = 'closed';
          for (const inv of d.invitations.filter(
            (i) => i.eventId === e.id && i.status === 'pending',
          )) {
            inv.status = 'expired';
            this.audit(d, 'invitation.expired', 'Invitation', inv.id, inv.guestSchoolId, null);
          }
        }
        if (e.status === 'closed' && new Date(e.startsAt).getTime() < now) e.status = 'completed';
      }
    });
  }

  // ---------- App Admin ----------

  createSchool(input: NewSchool): School {
    const me = this.require(['app_admin']);
    const email = input.adminEmail.trim().toLowerCase();
    if (this.db.users.some((u) => u.email === email))
      throw new DomainError('That admin email is already in use.');
    const school: School = {
      id: id('sch'),
      name: input.name.trim(),
      board: input.board,
      city: input.city.trim(),
      address: input.address.trim(),
      contactEmail: input.contactEmail.trim(),
      contactPhone: input.contactPhone.trim(),
      status: 'active',
    };
    const admin: User = {
      id: id('u'),
      schoolId: school.id,
      role: 'school_admin',
      name: input.adminName.trim(),
      email,
      status: 'invited',
      password: 'demo1234',
      mustChangePassword: true,
    };
    this.store.update((d) => {
      d.schools.push(school);
      d.users.push(admin);
      this.audit(d, 'school.created', 'School', school.id, school.id, me.id, undefined, school);
      this.notify(d, [admin.id], {
        type: 'account_invite',
        title: 'Welcome to InterSchool Connect',
        body: `You are the School Admin for ${school.name}. Set your password to get started.`,
        link: '/account/password',
        channels: ['email'],
      });
    });
    return school;
  }

  setSchoolStatus(schoolId: string, status: School['status']): void {
    const me = this.require(['app_admin']);
    this.store.update((d) => {
      const school = this.found(
        d.schools.find((s) => s.id === schoolId),
        'School',
      );
      const before = school.status;
      school.status = status;
      this.audit(
        d,
        status === 'suspended' ? 'school.suspended' : 'school.reactivated',
        'School',
        schoolId,
        schoolId,
        me.id,
        { status: before },
        { status },
      );
    });
  }

  // ---------- School Admin: people ----------

  importPeople(rows: PersonImportRow[]): number {
    const me = this.require(['school_admin']);
    this.store.update((d) => {
      for (const row of rows) {
        const user: User = {
          id: id('u'),
          schoolId: me.schoolId,
          role: row.role,
          name: row.name,
          email: row.email,
          phone: row.phone || undefined,
          status: 'invited',
          password: 'demo1234',
          mustChangePassword: true,
        };
        d.users.push(user);
        if (row.role === 'student') {
          d.students.push({
            userId: user.id,
            admissionNo: row.admissionNo!,
            className: row.className!,
            section: row.section!,
            gender: row.gender!,
            guardianName: row.guardianName!,
            guardianContact: row.guardianContact!,
            consent: !!row.consent,
          });
        }
      }
      this.audit(
        d,
        'people.imported',
        'User',
        `${rows.length} rows`,
        me.schoolId,
        me.id,
        undefined,
        { count: rows.length },
      );
    });
    return rows.length;
  }

  setTeacherCanHost(teacherId: string, canHost: boolean): void {
    const me = this.require(['school_admin']);
    this.store.update((d) => {
      const t = this.found(
        d.users.find(
          (u) => u.id === teacherId && u.role === 'teacher' && u.schoolId === me.schoolId,
        ),
        'Teacher',
      );
      t.canHostEvents = canHost;
      this.audit(d, 'teacher.permissions_changed', 'User', t.id, me.schoolId, me.id, undefined, {
        canHostEvents: canHost,
      });
    });
  }

  // ---------- Host: events ----------

  createEvent(draft: EventDraft, publish: boolean): SchoolEvent {
    const me = this.auth.user();
    if (!me || !this.canHostEvents(me) || !me.schoolId)
      throw new DomainError('You do not have permission to create events.');
    this.validateDraft(draft);
    const event: SchoolEvent = {
      id: id('ev'),
      hostSchoolId: me.schoolId,
      title: draft.title.trim(),
      description: draft.description.trim(),
      venue: draft.venue.trim(),
      startsAt: draft.startsAt,
      regDeadline: draft.regDeadline,
      status: publish ? 'open' : 'draft',
      coordinatorIds: me.role === 'teacher' ? [me.id] : [],
      createdBy: me.id,
    };
    this.store.update((d) => {
      d.events.push(event);
      d.categories.push(
        ...draft.categories.map((c) => ({ ...c, id: id('cat'), eventId: event.id })),
      );
      this.audit(
        d,
        publish ? 'event.published' : 'event.created',
        'Event',
        event.id,
        me.schoolId,
        me.id,
        undefined,
        event,
      );
    });
    return event;
  }

  /** EV-4: edits to date, venue or eligibility notify every accepted school and applied student. */
  updateEvent(eventId: string, draft: EventDraft): void {
    const me = this.requireHost(eventId);
    const event = this.event(eventId)!;
    if (event.status === 'cancelled' || event.status === 'completed')
      throw new DomainError('This event can no longer be edited.');
    this.validateDraft(draft);
    const oldCats = this.categoriesOf(eventId);
    const material =
      event.startsAt !== draft.startsAt ||
      event.venue !== draft.venue.trim() ||
      event.regDeadline !== draft.regDeadline ||
      JSON.stringify(oldCats.map(eligibilityKey)) !==
        JSON.stringify(draft.categories.map(eligibilityKey));

    this.store.update((d) => {
      const e = d.events.find((x) => x.id === eventId)!;
      const before = { ...e };
      Object.assign(e, {
        title: draft.title.trim(),
        description: draft.description.trim(),
        venue: draft.venue.trim(),
        startsAt: draft.startsAt,
        regDeadline: draft.regDeadline,
      });
      // Keep ids of categories that still exist by name so registrations stay attached.
      const kept = new Map(oldCats.map((c) => [c.name, c.id]));
      d.categories = d.categories.filter((c) => c.eventId !== eventId);
      d.categories.push(
        ...draft.categories.map((c) => ({ ...c, id: kept.get(c.name) ?? id('cat'), eventId })),
      );
      this.audit(d, 'event.updated', 'Event', eventId, e.hostSchoolId, me.id, before, e);
      if (material && e.status !== 'draft') {
        this.notify(d, this.affectedUsers(d, eventId), {
          type: 'event_changed',
          title: 'Event details changed',
          body: `${e.title} has changed date, venue or eligibility. Please review the updated details.`,
          link: `/events/${eventId}`,
          channels: ['in_app', 'email'],
        });
      }
    });
  }

  publishEvent(eventId: string): void {
    this.transitionEvent(eventId, 'open', 'event.published');
  }

  cancelEvent(eventId: string, reason: string): void {
    if (!reason.trim())
      throw new DomainError('Give a reason so schools and students understand why.');
    const me = this.requireHost(eventId);
    this.store.update((d) => {
      const e = d.events.find((x) => x.id === eventId)!;
      assertTransition(EVENT_TRANSITIONS, e.status, 'cancelled', 'event');
      const recipients = this.affectedUsers(d, eventId);
      e.status = 'cancelled';
      e.cancelReason = reason.trim();
      for (const inv of d.invitations.filter(
        (i) => i.eventId === eventId && i.status === 'pending',
      ))
        inv.status = 'revoked';
      this.audit(d, 'event.cancelled', 'Event', eventId, e.hostSchoolId, me.id, undefined, {
        reason,
      });
      this.notify(d, recipients, {
        type: 'event_cancelled',
        title: 'Event cancelled',
        body: `${e.title} has been cancelled. Reason: ${reason.trim()}`,
        channels: ['in_app', 'email'],
      });
    });
  }

  assignEventCoordinators(eventId: string, teacherIds: string[]): void {
    const me = this.require(['school_admin']);
    this.store.update((d) => {
      const e = this.found(
        d.events.find((x) => x.id === eventId && x.hostSchoolId === me.schoolId),
        'Event',
      );
      e.coordinatorIds = this.ownTeachers(d, me, teacherIds);
      this.audit(
        d,
        'event.coordinators_assigned',
        'Event',
        eventId,
        me.schoolId,
        me.id,
        undefined,
        { teacherIds: e.coordinatorIds },
      );
    });
  }

  // ---------- Host: invitations ----------

  inviteSchools(eventId: string, schoolIds: string[]): number {
    const me = this.requireHost(eventId);
    const event = this.event(eventId)!;
    if (event.status !== 'open')
      throw new DomainError('Publish the event before inviting schools.');
    if (this.isPastDeadline(event)) throw new DomainError('The registration deadline has passed.');
    let sent = 0;
    this.store.update((d) => {
      for (const schoolId of schoolIds) {
        const school = d.schools.find((s) => s.id === schoolId);
        if (!school || school.status !== 'active' || schoolId === event.hostSchoolId) continue;
        // Unique (event_id, guest_school_id).
        if (d.invitations.some((i) => i.eventId === eventId && i.guestSchoolId === schoolId))
          continue;
        const inv: Invitation = {
          id: id('inv'),
          eventId,
          guestSchoolId: schoolId,
          status: 'pending',
          coordinatorIds: [],
        };
        d.invitations.push(inv);
        sent++;
        this.audit(
          d,
          'invitation.sent',
          'Invitation',
          inv.id,
          event.hostSchoolId,
          me.id,
          undefined,
          inv,
        );
        const admins = d.users
          .filter((u) => u.schoolId === schoolId && u.role === 'school_admin')
          .map((u) => u.id);
        this.notify(d, admins, {
          type: 'invitation_received',
          title: 'New invitation',
          body: `${this.school(event.hostSchoolId)?.name} invited you to ${event.title}.`,
          link: '/invitations',
          channels: ['in_app', 'email'],
        });
      }
    });
    return sent;
  }

  revokeInvitation(invitationId: string): void {
    const inv = this.found(
      this.db.invitations.find((i) => i.id === invitationId),
      'Invitation',
    );
    const me = this.requireHost(inv.eventId);
    this.store.update((d) => {
      const i = d.invitations.find((x) => x.id === invitationId)!;
      assertTransition(INVITATION_TRANSITIONS, i.status, 'revoked', 'invitation');
      i.status = 'revoked';
      this.audit(d, 'invitation.revoked', 'Invitation', i.id, me.schoolId, me.id);
    });
  }

  // ---------- Guest school: respond, approve, submit ----------

  respondToInvitation(invitationId: string, accept: boolean, note: string): void {
    const me = this.require(['school_admin']);
    this.sweepDeadlines();
    const inv = this.found(
      this.db.invitations.find((i) => i.id === invitationId && i.guestSchoolId === me.schoolId),
      'Invitation',
    );
    const event = this.event(inv.eventId)!;
    if (this.isPastDeadline(event)) throw new DomainError('The registration deadline has passed.');
    const next = accept ? 'accepted' : 'rejected';
    this.store.update((d) => {
      const i = d.invitations.find((x) => x.id === invitationId)!;
      assertTransition(INVITATION_TRANSITIONS, i.status, next, 'invitation');
      i.status = next;
      i.respondedBy = me.id;
      i.respondedAt = this.clock.now().toISOString();
      i.note = note.trim() || undefined;
      this.audit(
        d,
        `invitation.${next}`,
        'Invitation',
        i.id,
        me.schoolId,
        me.id,
        { status: 'pending' },
        { status: next },
      );
      const hostStaff = d.users
        .filter(
          (u) =>
            u.schoolId === event.hostSchoolId &&
            (u.role === 'school_admin' || event.coordinatorIds.includes(u.id)),
        )
        .map((u) => u.id);
      this.notify(d, hostStaff, {
        type: `invitation_${next}`,
        title: `${this.school(me.schoolId)?.name} ${next} your invitation`,
        body: `${event.title}${i.note ? ` — “${i.note}”` : ''}`,
        link: `/events/${event.id}`,
        channels: ['in_app', 'email'],
      });
      if (accept) {
        const cats = d.categories.filter((c) => c.eventId === event.id);
        const eligible = d.users.filter(
          (u) =>
            u.schoolId === me.schoolId &&
            u.role === 'student' &&
            cats.some((c) =>
              isEligible(
                c,
                d.students.find((s) => s.userId === u.id),
              ),
            ),
        );
        this.notify(
          d,
          eligible.map((u) => u.id),
          {
            type: 'event_open',
            title: 'New event open to you',
            body: `${event.title} is open for applications.`,
            link: '/explore',
            channels: ['in_app', 'guardian_email'],
          },
        );
      }
    });
  }

  assignInvitationCoordinators(invitationId: string, teacherIds: string[]): void {
    const me = this.require(['school_admin']);
    this.store.update((d) => {
      const i = this.found(
        d.invitations.find((x) => x.id === invitationId && x.guestSchoolId === me.schoolId),
        'Invitation',
      );
      i.coordinatorIds = this.ownTeachers(d, me, teacherIds);
      this.audit(
        d,
        'invitation.coordinators_assigned',
        'Invitation',
        i.id,
        me.schoolId,
        me.id,
        undefined,
        { teacherIds: i.coordinatorIds },
      );
    });
  }

  /** RG-3: approvals can never exceed the category's per-school quota. */
  decideApplication(registrationId: string, approve: boolean): void {
    const reg = this.found(
      this.db.registrations.find((r) => r.id === registrationId),
      'Application',
    );
    const inv = this.db.invitations.find((i) => i.id === reg.invitationId)!;
    const me = this.auth.user();
    if (!this.isGuestStaff(inv, me))
      throw new DomainError(
        'Only your school’s admin or assigned coordinator can review this application.',
      );
    const event = this.event(inv.eventId)!;
    if (this.isPastDeadline(event) || event.status !== 'open')
      throw new DomainError('The list is locked: the registration deadline has passed.');
    if (inv.status !== 'accepted') throw new DomainError('This invitation is no longer active.');
    if (reg.hostStatus !== 'not_submitted')
      throw new DomainError('This nomination was already sent to the host.');
    const category = this.db.categories.find((c) => c.id === reg.categoryId)!;
    const next = approve ? 'approved' : 'rejected';
    if (approve && this.approvedCount(inv.id, category.id) >= category.maxPerSchool) {
      throw new DomainError(
        `Quota reached: ${category.name} allows ${category.maxPerSchool} per school.`,
      );
    }
    this.store.update((d) => {
      const r = d.registrations.find((x) => x.id === registrationId)!;
      assertTransition(SCHOOL_DECISION_TRANSITIONS, r.schoolStatus, next, 'application');
      const before = r.schoolStatus;
      r.schoolStatus = next;
      this.audit(
        d,
        `registration.${next}`,
        'Registration',
        r.id,
        me!.schoolId,
        me!.id,
        { schoolStatus: before },
        { schoolStatus: next },
      );
      this.notify(d, [r.studentId], {
        type: `application_${next}`,
        title: approve
          ? 'Your school approved your application'
          : 'Your school did not approve your application',
        body: `${category.name} — ${event.title}`,
        link: '/my-applications',
        channels: ['in_app', 'guardian_email'],
      });
    });
  }

  /** RG-4: sends every approved, unsent nomination to the host in one action. */
  submitNominations(invitationId: string): number {
    const inv = this.found(
      this.db.invitations.find((i) => i.id === invitationId),
      'Invitation',
    );
    const me = this.auth.user();
    if (!this.isGuestStaff(inv, me))
      throw new DomainError('You cannot submit nominations for this school.');
    const event = this.event(inv.eventId)!;
    if (this.isPastDeadline(event) || event.status !== 'open')
      throw new DomainError('The list is locked: the registration deadline has passed.');
    const toSend = this.registrationsOf(invitationId).filter(
      (r) => r.schoolStatus === 'approved' && r.hostStatus === 'not_submitted',
    );
    if (!toSend.length) throw new DomainError('There are no new approved applications to submit.');
    this.store.update((d) => {
      for (const r of d.registrations.filter((x) => toSend.some((t) => t.id === x.id))) {
        assertTransition(HOST_DECISION_TRANSITIONS, r.hostStatus, 'pending', 'nomination');
        r.hostStatus = 'pending';
      }
      d.invitations.find((i) => i.id === invitationId)!.submittedAt = this.clock
        .now()
        .toISOString();
      this.audit(
        d,
        'nominations.submitted',
        'Invitation',
        invitationId,
        me!.schoolId,
        me!.id,
        undefined,
        { count: toSend.length },
      );
      const hostStaff = d.users
        .filter(
          (u) =>
            u.schoolId === event.hostSchoolId &&
            (u.role === 'school_admin' || event.coordinatorIds.includes(u.id)),
        )
        .map((u) => u.id);
      this.notify(d, hostStaff, {
        type: 'nominations_submitted',
        title: 'Nominations received',
        body: `${this.school(me!.schoolId)?.name} submitted ${toSend.length} nomination(s) for ${event.title}.`,
        link: `/events/${event.id}/nominations`,
        channels: ['in_app', 'digest'],
      });
    });
    return toSend.length;
  }

  // ---------- Host: confirm nominations (RG-5) ----------

  decideNomination(registrationId: string, confirm: boolean): void {
    const reg = this.found(
      this.db.registrations.find((r) => r.id === registrationId),
      'Nomination',
    );
    const inv = this.db.invitations.find((i) => i.id === reg.invitationId)!;
    const me = this.requireHost(inv.eventId);
    const event = this.event(inv.eventId)!;
    if (event.status === 'cancelled' || event.status === 'completed')
      throw new DomainError('This event is no longer accepting changes.');
    if (reg.schoolStatus !== 'approved') throw new DomainError('This student has withdrawn.');
    const next = confirm ? 'confirmed' : 'rejected';
    const category = this.db.categories.find((c) => c.id === reg.categoryId)!;
    this.store.update((d) => {
      const r = d.registrations.find((x) => x.id === registrationId)!;
      assertTransition(HOST_DECISION_TRANSITIONS, r.hostStatus, next, 'nomination');
      const before = r.hostStatus;
      r.hostStatus = next;
      this.audit(
        d,
        `nomination.${next}`,
        'Registration',
        r.id,
        me.schoolId,
        me.id,
        { hostStatus: before },
        { hostStatus: next },
      );
      const guestAdmins = d.users
        .filter((u) => u.schoolId === inv.guestSchoolId && u.role === 'school_admin')
        .map((u) => u.id);
      this.notify(d, [r.studentId, ...guestAdmins], {
        type: `nomination_${next}`,
        title: confirm ? 'Participation confirmed' : 'Nomination not accepted by host',
        body: `${this.user(r.studentId)?.name} — ${category.name}, ${event.title}`,
        link: '/my-applications',
        channels: ['in_app', 'email'],
      });
    });
  }

  // ---------- Student (RG-1, RG-6) ----------

  apply(eventId: string, categoryId: string): void {
    const me = this.require(['student']);
    this.sweepDeadlines();
    const event = this.found(this.event(eventId), 'Event');
    if (event.status !== 'open' || this.isPastDeadline(event))
      throw new DomainError('Applications for this event are closed.');
    const inv = this.db.invitations.find(
      (i) => i.eventId === eventId && i.guestSchoolId === me.schoolId && i.status === 'accepted',
    );
    if (!inv) throw new DomainError('Your school has not accepted this event.');
    const category = this.found(
      this.db.categories.find((c) => c.id === categoryId && c.eventId === eventId),
      'Category',
    );
    if (!isEligible(category, this.profile(me.id)))
      throw new DomainError('You do not meet this category’s eligibility.');
    const existing = this.db.registrations.find(
      (r) => r.categoryId === categoryId && r.studentId === me.id,
    );
    if (existing && existing.schoolStatus !== 'withdrawn')
      throw new DomainError('You have already applied to this category.');

    this.store.update((d) => {
      let reg: Registration;
      if (existing) {
        reg = d.registrations.find((r) => r.id === existing.id)!;
        assertTransition(SCHOOL_DECISION_TRANSITIONS, reg.schoolStatus, 'applied', 'application');
        reg.schoolStatus = 'applied';
        reg.hostStatus = 'not_submitted';
        reg.appliedAt = this.clock.now().toISOString();
      } else {
        reg = {
          id: id('reg'),
          invitationId: inv.id,
          categoryId,
          studentId: me.id,
          schoolStatus: 'applied',
          hostStatus: 'not_submitted',
          appliedAt: this.clock.now().toISOString(),
        };
        d.registrations.push(reg);
      }
      this.audit(d, 'registration.applied', 'Registration', reg.id, me.schoolId, me.id, undefined, {
        categoryId,
      });
      const reviewers = d.users
        .filter(
          (u) =>
            u.schoolId === me.schoolId &&
            (u.role === 'school_admin' || inv.coordinatorIds.includes(u.id)),
        )
        .map((u) => u.id);
      this.notify(d, reviewers, {
        type: 'application_submitted',
        title: 'New application to review',
        body: `${me.name} applied for ${category.name} — ${event.title}.`,
        link: `/approvals/${inv.id}`,
        channels: ['in_app', 'digest'],
      });
    });
  }

  withdraw(registrationId: string): void {
    const me = this.require(['student']);
    const reg = this.found(
      this.db.registrations.find((r) => r.id === registrationId && r.studentId === me.id),
      'Application',
    );
    const inv = this.db.invitations.find((i) => i.id === reg.invitationId)!;
    const event = this.event(inv.eventId)!;
    if (this.isPastDeadline(event))
      throw new DomainError('You can only withdraw before the registration deadline.');
    this.store.update((d) => {
      const r = d.registrations.find((x) => x.id === registrationId)!;
      assertTransition(SCHOOL_DECISION_TRANSITIONS, r.schoolStatus, 'withdrawn', 'application');
      r.schoolStatus = 'withdrawn';
      this.audit(d, 'registration.withdrawn', 'Registration', r.id, me.schoolId, me.id);
    });
  }

  // ---------- Notifications ----------

  myNotifications(): AppNotification[] {
    const me = this.auth.user();
    return me
      ? this.db.notifications
          .filter((n) => n.userId === me.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      : [];
  }

  markAllRead(): void {
    const me = this.auth.user();
    if (!me) return;
    const now = this.clock.now().toISOString();
    this.store.update((d) =>
      d.notifications
        .filter((n) => n.userId === me.id && !n.readAt)
        .forEach((n) => (n.readAt = now)),
    );
  }

  // ---------- Internals ----------

  private require(roles: Role[]): User {
    const me = this.auth.user();
    if (!me || !roles.includes(me.role))
      throw new DomainError('You do not have permission to do that.');
    return me;
  }

  private requireHost(eventId: string): User {
    const event = this.found(this.event(eventId), 'Event');
    const me = this.auth.user();
    if (!this.isHostStaff(event, me))
      throw new DomainError('Only the host school can manage this event.');
    return me!;
  }

  private found<T>(value: T | undefined, what: string): T {
    // Not-found and not-yours look the same, so other schools' records can't be probed.
    if (!value) throw new DomainError(`${what} not found.`);
    return value;
  }

  private transitionEvent(eventId: string, to: EventStatus, action: string): void {
    const me = this.requireHost(eventId);
    this.store.update((d) => {
      const e = d.events.find((x) => x.id === eventId)!;
      assertTransition(EVENT_TRANSITIONS, e.status, to, 'event');
      const before = e.status;
      e.status = to;
      this.audit(
        d,
        action,
        'Event',
        eventId,
        e.hostSchoolId,
        me.id,
        { status: before },
        { status: to },
      );
    });
  }

  private validateDraft(draft: EventDraft): void {
    if (!draft.title.trim()) throw new DomainError('Add a title.');
    if (!draft.categories.length) throw new DomainError('Add at least one category.');
    if (new Date(draft.regDeadline) >= new Date(draft.startsAt))
      throw new DomainError('The registration deadline must be before the event starts.');
    for (const c of draft.categories) {
      if (c.minClass > c.maxClass)
        throw new DomainError(`${c.name}: the lowest class must not be above the highest.`);
      if (c.maxPerSchool < 1)
        throw new DomainError(`${c.name}: allow at least one entry per school.`);
    }
  }

  private ownTeachers(d: Db, me: User, ids: string[]): string[] {
    return ids.filter((tid) =>
      d.users.some((u) => u.id === tid && u.role === 'teacher' && u.schoolId === me.schoolId),
    );
  }

  private affectedUsers(d: Db, eventId: string): string[] {
    const invs = d.invitations.filter((i) => i.eventId === eventId && i.status === 'accepted');
    const admins = d.users
      .filter((u) => u.role === 'school_admin' && invs.some((i) => i.guestSchoolId === u.schoolId))
      .map((u) => u.id);
    const students = d.registrations
      .filter((r) => invs.some((i) => i.id === r.invitationId) && r.schoolStatus !== 'withdrawn')
      .map((r) => r.studentId);
    return [...new Set([...admins, ...students])];
  }

  private audit(
    d: Db,
    action: string,
    entity: string,
    entityId: string,
    schoolId: string | null,
    actorId: string | null,
    before?: unknown,
    after?: unknown,
  ): void {
    d.audit.push({
      id: id('a'),
      actorId: actorId ?? 'system',
      schoolId,
      action,
      entity,
      entityId,
      before,
      after,
      at: this.clock.now().toISOString(),
    });
  }

  private notify(
    d: Db,
    userIds: string[],
    n: Omit<AppNotification, 'id' | 'userId' | 'createdAt'>,
  ): void {
    const createdAt = this.clock.now().toISOString();
    for (const userId of new Set(userIds))
      d.notifications.push({ ...n, id: id('n'), userId, createdAt });
  }
}

function eligibilityKey(
  c: Pick<Category, 'name' | 'minClass' | 'maxClass' | 'genderRule'>,
): string {
  return `${c.name}|${c.minClass}|${c.maxClass}|${c.genderRule}`;
}
