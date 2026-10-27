import { EventStatus, HostDecision, InvitationStatus, SchoolDecision } from './models';

/**
 * Allowed status transitions, mirrored from the API (server/src/common/state-machines.ts).
 * The server enforces them; the UI uses them only to decide which actions to offer.
 */
export const EVENT_TRANSITIONS: Record<EventStatus, readonly EventStatus[]> = {
  draft: ['open', 'cancelled'],
  open: ['closed', 'cancelled'],
  closed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export const INVITATION_TRANSITIONS: Record<InvitationStatus, readonly InvitationStatus[]> = {
  pending: ['accepted', 'rejected', 'expired', 'revoked'],
  accepted: [],
  rejected: [],
  expired: [],
  revoked: [],
};

export const SCHOOL_DECISION_TRANSITIONS: Record<SchoolDecision, readonly SchoolDecision[]> = {
  applied: ['approved', 'rejected', 'withdrawn'],
  approved: ['rejected', 'withdrawn'],
  rejected: ['approved'],
  withdrawn: ['applied'],
};

export const HOST_DECISION_TRANSITIONS: Record<HostDecision, readonly HostDecision[]> = {
  not_submitted: ['pending'],
  pending: ['confirmed', 'rejected'],
  confirmed: ['rejected'],
  rejected: ['confirmed'],
};

/** A rule the server refused, with its message written for the person using the app. */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly code = 'RULE',
    readonly status = 409,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export function canTransition<S extends string>(
  table: Record<S, readonly S[]>,
  from: S,
  to: S,
): boolean {
  return table[from].includes(to);
}
