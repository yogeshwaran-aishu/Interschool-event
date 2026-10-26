import { DsTone } from '@isc/design-system';
import { EventStatus, HostDecision, InvitationStatus, SchoolDecision } from './models';

export interface StatusLabel {
  label: string;
  tone: DsTone;
}

export const EVENT_STATUS: Record<EventStatus, StatusLabel> = {
  draft: { label: 'Draft', tone: 'neutral' },
  open: { label: 'Open', tone: 'success' },
  closed: { label: 'Registration closed', tone: 'warning' },
  completed: { label: 'Completed', tone: 'info' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

export const INVITATION_STATUS: Record<InvitationStatus, StatusLabel> = {
  pending: { label: 'Awaiting reply', tone: 'warning' },
  accepted: { label: 'Accepted', tone: 'success' },
  rejected: { label: 'Declined', tone: 'danger' },
  expired: { label: 'Expired', tone: 'neutral' },
  revoked: { label: 'Revoked', tone: 'neutral' },
};

export const SCHOOL_DECISION: Record<SchoolDecision, StatusLabel> = {
  applied: { label: 'Awaiting school', tone: 'warning' },
  approved: { label: 'Approved by school', tone: 'success' },
  rejected: { label: 'Not approved', tone: 'danger' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
};

export const HOST_DECISION: Record<HostDecision, StatusLabel> = {
  not_submitted: { label: 'Not sent to host', tone: 'neutral' },
  pending: { label: 'Awaiting host', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  rejected: { label: 'Not accepted', tone: 'danger' },
};

export const BOARDS = ['CBSE', 'ICSE', 'State', 'IB', 'Cambridge'] as const;

export function classRange(min: number, max: number): string {
  return min === max ? `Class ${min}` : `Classes ${min}–${max}`;
}
