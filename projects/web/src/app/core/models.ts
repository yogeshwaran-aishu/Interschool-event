export type Role = 'app_admin' | 'school_admin' | 'teacher' | 'student';

export const ROLE_LABEL: Record<Role, string> = {
  app_admin: 'App Admin',
  school_admin: 'School Admin',
  teacher: 'Event Coordinator',
  student: 'Student',
};

export type SchoolStatus = 'active' | 'suspended';
export type UserStatus = 'invited' | 'active' | 'suspended';
export type Gender = 'female' | 'male' | 'other';
export type GenderRule = 'any' | 'female' | 'male';

export type EventStatus = 'draft' | 'open' | 'closed' | 'completed' | 'cancelled';
export type InvitationStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'revoked';
export type SchoolDecision = 'applied' | 'approved' | 'rejected' | 'withdrawn';
export type HostDecision = 'not_submitted' | 'pending' | 'confirmed' | 'rejected';

export interface School {
  id: string;
  name: string;
  board: string;
  city: string;
  address: string;
  contactEmail: string;
  contactPhone: string;
  status: SchoolStatus;
}

export interface User {
  id: string;
  schoolId: string | null;
  role: Role;
  name: string;
  email: string;
  phone?: string;
  status: UserStatus;
  mustChangePassword: boolean;
  /** Teachers only: may create events for their school. */
  canHostEvents?: boolean;
}

export interface StudentProfile {
  userId: string;
  admissionNo: string;
  className: number;
  section: string;
  gender: Gender;
  guardianName: string;
  guardianContact: string;
  /** DPDP Act: no student account activates without recorded guardian consent. */
  consent: boolean;
}

export interface Category {
  id: string;
  eventId: string;
  name: string;
  minClass: number;
  maxClass: number;
  genderRule: GenderRule;
  type: 'solo' | 'team';
  teamSize: number;
  maxPerSchool: number;
}

export interface SchoolEvent {
  id: string;
  hostSchoolId: string;
  title: string;
  description: string;
  venue: string;
  startsAt: string;
  regDeadline: string;
  status: EventStatus;
  cancelReason?: string;
  coordinatorIds: string[];
  createdBy: string;
}

export interface Invitation {
  id: string;
  eventId: string;
  guestSchoolId: string;
  status: InvitationStatus;
  respondedBy?: string;
  respondedAt?: string;
  note?: string;
  /** Guest-side teachers who review their students' applications. */
  coordinatorIds: string[];
  /** Set when the guest school submits its approved list to the host (RG-4). */
  submittedAt?: string;
}

export interface Registration {
  id: string;
  invitationId: string;
  categoryId: string;
  studentId: string;
  schoolStatus: SchoolDecision;
  hostStatus: HostDecision;
  appliedAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  channels: ('in_app' | 'email' | 'guardian_email' | 'digest')[];
  createdAt: string;
  readAt?: string;
}

export interface AuditEntry {
  id: string;
  actorId: string;
  actorName: string;
  schoolId: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  at: string;
}

/** A submitted nomination as the host sees it: name, class, school and category only (PRD privacy rule). */
export interface Nomination {
  registrationId: string;
  eventId: string;
  invitationId: string;
  studentName: string;
  className: number;
  schoolName: string;
  categoryName: string;
  hostStatus: Exclude<HostDecision, 'not_submitted'>;
}

/** Platform-wide counts for the App Admin, who never receives student records. */
export interface PlatformStats {
  activeSchools: number;
  suspendedSchools: number;
  liveEvents: number;
  students: number;
  registrations: number;
  perSchool: Record<string, { users: number; events: number }>;
}

/** What GET /api/v1/state returns: everything the signed-in person may see, scoped by the server. */
export interface Db {
  schools: School[];
  users: User[];
  students: StudentProfile[];
  events: SchoolEvent[];
  categories: Category[];
  invitations: Invitation[];
  registrations: Registration[];
  nominations: Nomination[];
  notifications: AppNotification[];
  audit: AuditEntry[];
  platform?: PlatformStats;
}
