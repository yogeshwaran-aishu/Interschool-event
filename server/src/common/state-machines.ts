import { DomainError } from './errors.js';

/**
 * Allowed status transitions (Backend PRD "Business rules"). Every status change goes through
 * assertTransition, so a record can never jump to a state the PRD does not allow.
 */
export const EVENT_TRANSITIONS = {
  draft: ['open', 'cancelled'],
  open: ['closed', 'cancelled'],
  closed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
} as const satisfies Record<string, readonly string[]>;

export const INVITATION_TRANSITIONS = {
  pending: ['accepted', 'rejected', 'expired', 'revoked'],
  accepted: [],
  rejected: [],
  expired: [],
  revoked: [],
} as const satisfies Record<string, readonly string[]>;

/** Host decisions additionally need the nomination to have been submitted (checked by the service). */
export const REGISTRATION_TRANSITIONS = {
  applied: ['school_approved', 'school_rejected', 'withdrawn'],
  school_approved: ['school_rejected', 'withdrawn', 'host_confirmed', 'host_rejected'],
  school_rejected: ['school_approved'],
  host_confirmed: ['host_rejected', 'withdrawn'],
  host_rejected: ['host_confirmed', 'withdrawn'],
  withdrawn: ['applied'],
} as const satisfies Record<string, readonly string[]>;

export function canTransition<T extends Record<string, readonly string[]>>(
  table: T,
  from: keyof T,
  to: string,
): boolean {
  return (table[from] as readonly string[]).includes(to);
}

export function assertTransition<T extends Record<string, readonly string[]>>(
  table: T,
  from: keyof T & string,
  to: string,
  entity: string,
): void {
  if (!canTransition(table, from, to))
    throw new DomainError(
      'INVALID_TRANSITION',
      `A ${entity} cannot move from “${from}” to “${to}”.`,
    );
}
