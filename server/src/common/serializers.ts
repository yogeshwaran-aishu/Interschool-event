/**
 * Row → JSON shapes the Angular client uses (projects/web/src/app/core/models.ts). Keeping
 * them in one place means the database can stay normalised while the API stays stable.
 */

export type SchoolDecision = 'applied' | 'approved' | 'rejected' | 'withdrawn';
export type HostDecision = 'not_submitted' | 'pending' | 'confirmed' | 'rejected';

export interface UserRow {
  id: string;
  school_id: string | null;
  role: 'app_admin' | 'school_admin' | 'teacher' | 'student';
  full_name: string;
  email: string | null;
  login_id: string;
  phone: string | null;
  status: 'invited' | 'active' | 'suspended';
  must_change_password: boolean;
  can_host_events: boolean;
}

export const userJson = (u: UserRow) => ({
  id: u.id,
  schoolId: u.school_id,
  role: u.role,
  name: u.full_name,
  email: u.email ?? u.login_id,
  phone: u.phone ?? undefined,
  status: u.status,
  mustChangePassword: u.must_change_password,
  canHostEvents: u.role === 'teacher' ? u.can_host_events : undefined,
});

export interface SchoolRow {
  id: string;
  name: string;
  board: string;
  city: string;
  address: string;
  contact_email: string;
  contact_phone: string;
  status: 'active' | 'suspended';
}

export const schoolJson = (s: SchoolRow, full = true) => ({
  id: s.id,
  name: s.name,
  board: s.board,
  city: s.city,
  address: full ? s.address : '',
  contactEmail: full ? s.contact_email : '',
  contactPhone: full ? s.contact_phone : '',
  status: s.status,
});

export interface ProfileRow {
  user_id: string;
  admission_no: string;
  class: number;
  section: string;
  gender: 'female' | 'male' | 'other';
  guardian_name: string;
  guardian_email: string | null;
  guardian_phone: string | null;
  parental_consent: boolean;
}

export const profileJson = (p: ProfileRow) => ({
  userId: p.user_id,
  admissionNo: p.admission_no,
  className: p.class,
  section: p.section,
  gender: p.gender,
  guardianName: p.guardian_name,
  guardianContact: p.guardian_email ?? p.guardian_phone ?? '',
  consent: p.parental_consent,
});

export interface EventRow {
  id: string;
  host_school_id: string;
  title: string;
  description: string;
  venue: string;
  starts_at: string;
  reg_deadline: string;
  status: 'draft' | 'open' | 'closed' | 'completed' | 'cancelled';
  cancel_reason: string | null;
  created_by: string;
  coordinator_ids: string[];
}

export const eventJson = (e: EventRow) => ({
  id: e.id,
  hostSchoolId: e.host_school_id,
  title: e.title,
  description: e.description,
  venue: e.venue,
  startsAt: e.starts_at,
  regDeadline: e.reg_deadline,
  status: e.status,
  cancelReason: e.cancel_reason ?? undefined,
  coordinatorIds: e.coordinator_ids ?? [],
  createdBy: e.created_by,
});

export interface CategoryRow {
  id: string;
  event_id: string;
  name: string;
  min_class: number;
  max_class: number;
  gender_rule: 'any' | 'female' | 'male';
  type: 'solo' | 'team';
  team_size: number | null;
  max_per_school: number;
}

export const categoryJson = (c: CategoryRow) => ({
  id: c.id,
  eventId: c.event_id,
  name: c.name,
  minClass: c.min_class,
  maxClass: c.max_class,
  genderRule: c.gender_rule,
  type: c.type,
  teamSize: c.team_size ?? 1,
  maxPerSchool: c.max_per_school,
});

export interface InvitationRow {
  id: string;
  event_id: string;
  guest_school_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired' | 'revoked';
  responded_by: string | null;
  responded_at: string | null;
  response_note: string | null;
  submitted_at: string | null;
  coordinator_ids: string[];
}

export const invitationJson = (i: InvitationRow) => ({
  id: i.id,
  eventId: i.event_id,
  guestSchoolId: i.guest_school_id,
  status: i.status,
  respondedBy: i.responded_by ?? undefined,
  respondedAt: i.responded_at ?? undefined,
  note: i.response_note ?? undefined,
  coordinatorIds: i.coordinator_ids ?? [],
  submittedAt: i.submitted_at ?? undefined,
});

export type RegStatus =
  | 'applied'
  | 'school_approved'
  | 'school_rejected'
  | 'host_confirmed'
  | 'host_rejected'
  | 'withdrawn';

export interface RegistrationRow {
  id: string;
  invitation_id: string;
  category_id: string;
  student_id: string;
  status: RegStatus;
  submitted_at: string | null;
  applied_at: string;
}

/** The database keeps the PRD's single status; the UI shows the school and host decisions apart. */
export function decisions(
  status: RegStatus,
  submitted: boolean,
): {
  schoolStatus: SchoolDecision;
  hostStatus: HostDecision;
} {
  switch (status) {
    case 'applied':
      return { schoolStatus: 'applied', hostStatus: 'not_submitted' };
    case 'school_approved':
      return { schoolStatus: 'approved', hostStatus: submitted ? 'pending' : 'not_submitted' };
    case 'school_rejected':
      return { schoolStatus: 'rejected', hostStatus: 'not_submitted' };
    case 'host_confirmed':
      return { schoolStatus: 'approved', hostStatus: 'confirmed' };
    case 'host_rejected':
      return { schoolStatus: 'approved', hostStatus: 'rejected' };
    case 'withdrawn':
      return { schoolStatus: 'withdrawn', hostStatus: submitted ? 'pending' : 'not_submitted' };
  }
}

export const registrationJson = (r: RegistrationRow) => ({
  id: r.id,
  invitationId: r.invitation_id,
  categoryId: r.category_id,
  studentId: r.student_id,
  ...decisions(r.status, !!r.submitted_at),
  appliedAt: r.applied_at,
});
