import { EventStatus, HostDecision, InvitationStatus, SchoolDecision } from './models';

/**
 * Allowed status transitions. Every status change in the app goes through
 * `assertTransition`, so a record can never jump to a state the PRD does not allow.
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

export class DomainError extends Error {
  constructor(message: string) {
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

export function assertTransition<S extends string>(
  table: Record<S, readonly S[]>,
  from: S,
  to: S,
  entity: string,
): void {
  if (!canTransition(table, from, to)) {
    throw new DomainError(`A ${entity} cannot move from “${from}” to “${to}”.`);
  }
}
