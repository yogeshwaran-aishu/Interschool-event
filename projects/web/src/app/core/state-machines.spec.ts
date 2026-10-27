import {
  EVENT_TRANSITIONS,
  HOST_DECISION_TRANSITIONS,
  INVITATION_TRANSITIONS,
  SCHOOL_DECISION_TRANSITIONS,
  canTransition,
} from './state-machines';

describe('state machines', () => {
  it('lets an open event close or be cancelled, but never return to draft', () => {
    expect(canTransition(EVENT_TRANSITIONS, 'open', 'closed')).toBe(true);
    expect(canTransition(EVENT_TRANSITIONS, 'open', 'cancelled')).toBe(true);
    expect(canTransition(EVENT_TRANSITIONS, 'open', 'draft')).toBe(false);
  });

  it('treats cancelled and completed events as terminal', () => {
    expect(EVENT_TRANSITIONS.cancelled).toEqual([]);
    expect(EVENT_TRANSITIONS.completed).toEqual([]);
  });

  it('only lets a pending invitation change state', () => {
    for (const to of ['accepted', 'rejected', 'expired', 'revoked'] as const) {
      expect(canTransition(INVITATION_TRANSITIONS, 'pending', to)).toBe(true);
    }
    expect(canTransition(INVITATION_TRANSITIONS, 'accepted', 'revoked')).toBe(false);
    expect(canTransition(INVITATION_TRANSITIONS, 'rejected', 'accepted')).toBe(false);
  });

  it('allows re-applying after withdrawal but not approving a withdrawn application', () => {
    expect(canTransition(SCHOOL_DECISION_TRANSITIONS, 'withdrawn', 'applied')).toBe(true);
    expect(canTransition(SCHOOL_DECISION_TRANSITIONS, 'withdrawn', 'approved')).toBe(false);
  });

  it('requires a nomination to be submitted before the host can decide', () => {
    expect(canTransition(HOST_DECISION_TRANSITIONS, 'not_submitted', 'confirmed')).toBe(false);
    expect(canTransition(HOST_DECISION_TRANSITIONS, 'pending', 'confirmed')).toBe(true);
  });
});
