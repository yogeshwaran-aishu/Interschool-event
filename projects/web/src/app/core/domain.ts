import { Service, inject } from '@angular/core';
import { Api } from './api';
import { Auth } from './auth';
import { Clock } from './clock';
import { ImportRowError } from './csv';
import {
  AppNotification,
  Category,
  Db,
  Invitation,
  Nomination,
  Registration,
  School,
  SchoolEvent,
  StudentProfile,
  User,
} from './models';
import { DomainError } from './state-machines';
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

export type HostNominationView = Nomination;

export interface ImportJob {
  jobId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  result: { created: number; errors: ImportRowError[] } | null;
  error: string | null;
}

export function isEligible(category: Category, profile: StudentProfile | undefined): boolean {
  if (!profile) return false;
  if (profile.className < category.minClass || profile.className > category.maxClass) return false;
  if (category.genderRule !== 'any' && profile.gender !== category.genderRule) return false;
  return true;
}

/**
 * The single service layer for data. Reads come from the store (the API's scoped state);
 * every write is a call to the Node.js API, which enforces roles, tenant scope, deadlines,
 * quotas and state transitions in PostgreSQL. After a write the store reloads, so pages
 * always show what the database holds. UI components never mutate the store directly.
 */
@Service()
export class DomainService {
  private readonly store = inject(Store);
  private readonly auth = inject(Auth);
  private readonly clock = inject(Clock);
  private readonly api = inject(Api);

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
        r.schoolStatus === 'approved' &&
        r.hostStatus !== 'rejected',
    ).length;
  }

  hostNominations(eventId: string): HostNominationView[] {
    const event = this.event(eventId);
    if (!event || !this.isHostStaff(event)) return [];
    return this.db.nominations.filter((n) => n.eventId === eventId);
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

  // ---------- App Admin ----------

  async createSchool(input: NewSchool): Promise<School> {
    return this.write(this.api.post<School>('/admin/schools', input));
  }

  async setSchoolStatus(schoolId: string, status: School['status']): Promise<void> {
    await this.write(this.api.patch(`/admin/schools/${schoolId}`, { status }));
  }

  // ---------- School Admin: people ----------

  /** ON-2: uploads the CSV; the server validates every row again and creates people in a job. */
  async importPeople(csv: string): Promise<ImportJob['result']> {
    const { jobId } = await this.api.post<{ jobId: string }>('/school/users/import', { csv });
    let job: ImportJob;
    for (let wait = 200; ; wait = Math.min(wait * 1.5, 2000)) {
      job = await this.api.get<ImportJob>(`/school/imports/${jobId}`);
      if (job.status === 'done' || job.status === 'failed') break;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    await this.store.refresh();
    if (job.status === 'failed') throw new DomainError(job.error ?? 'The import failed.');
    return job.result;
  }

  async setTeacherCanHost(teacherId: string, canHost: boolean): Promise<void> {
    await this.write(this.api.patch(`/school/users/${teacherId}`, { canHostEvents: canHost }));
  }

  // ---------- Host: events ----------

  async createEvent(draft: EventDraft, publish: boolean): Promise<SchoolEvent> {
    return this.write(this.api.post<SchoolEvent>('/events', { ...toApiDraft(draft), publish }));
  }

  /** EV-4: the server notifies accepted schools and applied students of material changes. */
  async updateEvent(eventId: string, draft: EventDraft): Promise<void> {
    await this.write(this.api.patch(`/events/${eventId}`, toApiDraft(draft)));
  }

  async publishEvent(eventId: string): Promise<void> {
    await this.write(this.api.post(`/events/${eventId}/publish`));
  }

  async cancelEvent(eventId: string, reason: string): Promise<void> {
    if (!reason.trim())
      throw new DomainError('Give a reason so schools and students understand why.');
    await this.write(this.api.post(`/events/${eventId}/cancel`, { reason: reason.trim() }));
  }

  async assignEventCoordinators(eventId: string, teacherIds: string[]): Promise<void> {
    await this.write(this.api.put(`/events/${eventId}/coordinators`, { teacherIds }));
  }

  /** Data export (RP-1): the server builds the CSV and audits the export. */
  exportParticipants(eventId: string): Promise<{ blob: Blob; filename: string | null }> {
    return this.api.download(`/events/${eventId}/export?format=csv`);
  }

  // ---------- Host: invitations ----------

  async inviteSchools(eventId: string, schoolIds: string[]): Promise<number> {
    if (!schoolIds.length) throw new DomainError('Choose at least one school.');
    const { sent } = await this.write(
      this.api.post<{ sent: number }>(`/events/${eventId}/invitations`, { schoolIds }),
    );
    return sent;
  }

  async revokeInvitation(invitationId: string): Promise<void> {
    await this.write(this.api.post(`/invitations/${invitationId}/revoke`));
  }

  // ---------- Guest school: respond, approve, submit ----------

  async respondToInvitation(invitationId: string, accept: boolean, note: string): Promise<void> {
    await this.write(
      this.api.post(`/invitations/${invitationId}/${accept ? 'accept' : 'reject'}`, {
        note: note.trim(),
      }),
    );
  }

  async assignInvitationCoordinators(invitationId: string, teacherIds: string[]): Promise<void> {
    await this.write(this.api.put(`/invitations/${invitationId}/coordinators`, { teacherIds }));
  }

  /** RG-3: the server locks the invitation row so approvals never exceed the quota. */
  async decideApplication(registrationId: string, approve: boolean): Promise<void> {
    await this.write(
      this.api.post(
        `/registrations/${registrationId}/${approve ? 'school-approve' : 'school-reject'}`,
      ),
    );
  }

  /** RG-4: sends every approved, unsent nomination to the host in one action. */
  async submitNominations(invitationId: string): Promise<number> {
    const { submitted } = await this.write(
      this.api.post<{ submitted: number }>(`/invitations/${invitationId}/submit`),
    );
    return submitted;
  }

  // ---------- Host: confirm nominations (RG-5) ----------

  async decideNomination(registrationId: string, confirm: boolean): Promise<void> {
    await this.write(
      this.api.post(`/registrations/${registrationId}/${confirm ? 'host-confirm' : 'host-reject'}`),
    );
  }

  // ---------- Student (RG-1, RG-6) ----------

  async apply(_eventId: string, categoryId: string): Promise<void> {
    await this.write(this.api.post('/registrations', { categoryId }));
  }

  async withdraw(registrationId: string): Promise<void> {
    await this.write(this.api.post(`/registrations/${registrationId}/withdraw`));
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

  async markAllRead(): Promise<void> {
    await this.write(this.api.post('/notifications/read', { all: true }));
  }

  // ---------- Internals ----------

  /** Runs a write, then reloads the state so every page reflects the database. */
  private async write<T>(request: Promise<T>): Promise<T> {
    try {
      return await request;
    } finally {
      // Reload even after a refusal: the refusal may come from a change someone else made.
      await this.store.refresh().catch(() => undefined);
    }
  }
}

function toApiDraft(draft: EventDraft): EventDraft {
  return {
    ...draft,
    startsAt: new Date(draft.startsAt).toISOString(),
    regDeadline: new Date(draft.regDeadline).toISOString(),
  };
}
