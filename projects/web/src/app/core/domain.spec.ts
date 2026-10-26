import { TestBed } from '@angular/core/testing';
import { Auth } from './auth';
import { Clock } from './clock';
import { DomainService, EventDraft } from './domain';
import { DEMO_PASSWORD } from './seed';
import { DomainError } from './state-machines';
import { Store } from './store';

class FakeClock {
  current = new Date('2026-10-26T10:00:00Z');
  now(): Date {
    return new Date(this.current);
  }
  advanceDays(days: number): void {
    this.current = new Date(this.current.getTime() + days * 86_400_000);
  }
}

describe('DomainService', () => {
  let clock: FakeClock;
  let domain: DomainService;
  let auth: Auth;
  let store: Store;

  const as = (email: string) => {
    auth.logout();
    const result = auth.login(email, DEMO_PASSWORD);
    if (!result.ok) throw new Error(result.message);
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clock = new FakeClock();
    TestBed.configureTestingModule({ providers: [{ provide: Clock, useValue: clock }] });
    store = TestBed.inject(Store);
    store.reset();
    domain = TestBed.inject(DomainService);
    auth = TestBed.inject(Auth);
  });

  describe('end-to-end flow', () => {
    it('runs invite → accept → apply → approve → submit → confirm', () => {
      as('principal@sunrise.test');
      expect(domain.inviteSchools('ev-fiesta', ['sch-greenfield'])).toBe(1);

      as('principal@greenfield.test');
      const inv = domain.receivedInvitations().find((i) => i.eventId === 'ev-fiesta')!;
      domain.respondToInvitation(inv.id, true, 'See you there');
      expect(domain.db.invitations.find((i) => i.id === inv.id)!.status).toBe('accepted');

      // Lakeview already accepted in the seed; Aarav (class 9) applies.
      as('aarav@lakeview.test');
      expect(domain.openEventsForStudent().map((e) => e.event.id)).toContain('ev-fiesta');
      domain.apply('ev-fiesta', 'cat-poster');
      const reg = domain.myRegistrations().find((r) => r.categoryId === 'cat-poster')!;
      expect(reg.schoolStatus).toBe('applied');

      as('teacher@lakeview.test');
      domain.decideApplication(reg.id, true);
      expect(domain.submitNominations('inv-fiesta-lake')).toBe(2); // Aarav + seeded Kabir

      as('coordinator@sunrise.test');
      const nomination = domain
        .hostNominations('ev-fiesta')
        .find((n) => n.registrationId === reg.id)!;
      expect(nomination).toMatchObject({
        studentName: 'Aarav Mehta',
        className: 9,
        schoolName: 'Lakeview Vidyalaya',
      });
      domain.decideNomination(reg.id, true);
      expect(domain.db.registrations.find((r) => r.id === reg.id)!.hostStatus).toBe('confirmed');

      const studentNotes = domain.db.notifications
        .filter((n) => n.userId === 'u-aarav')
        .map((n) => n.type);
      expect(studentNotes).toEqual(
        expect.arrayContaining(['application_approved', 'nomination_confirmed']),
      );
    });
  });

  describe('quota (RG-3)', () => {
    it('never lets approvals exceed the per-school limit', () => {
      // cat-quiz allows 2 per school; Kabir is already approved.
      as('aarav@lakeview.test');
      domain.apply('ev-fiesta', 'cat-quiz');
      as('ishita@lakeview.test');
      domain.apply('ev-fiesta', 'cat-quiz');

      as('principal@lakeview.test');
      const [first, second] = domain.db.registrations.filter(
        (r) => r.categoryId === 'cat-quiz' && r.schoolStatus === 'applied',
      );
      domain.decideApplication(first.id, true);
      expect(() => domain.decideApplication(second.id, true)).toThrow(/Quota reached/);
      expect(domain.approvedCount('inv-fiesta-lake', 'cat-quiz')).toBe(2);
    });
  });

  describe('deadlines (IN-3, RG-4)', () => {
    it('expires unanswered invitations and locks the list after the deadline', () => {
      clock.advanceDays(11);
      domain.sweepDeadlines();
      expect(domain.event('ev-fiesta')!.status).toBe('closed');
      expect(domain.db.invitations.find((i) => i.id === 'inv-fiesta-aur')!.status).toBe('expired');

      as('teacher@lakeview.test');
      expect(() => domain.decideApplication('reg-2', true)).toThrow(/locked/);

      as('aarav@lakeview.test');
      expect(() => domain.apply('ev-fiesta', 'cat-poster')).toThrow(DomainError);
    });
  });

  describe('eligibility (RG-1)', () => {
    it('hides and refuses categories a student is not eligible for', () => {
      as('meera@lakeview.test'); // class 8: robotics (8–12) and quiz (6–10) fit, poster (9–12) does not
      const fiesta = domain.openEventsForStudent().find((e) => e.event.id === 'ev-fiesta')!;
      expect(fiesta.categories.map((c) => c.id).sort()).toEqual(['cat-quiz', 'cat-robotics']);
      expect(() => domain.apply('ev-fiesta', 'cat-poster')).toThrow(/eligibility/);
    });

    it('does not show events from invitations the school has not accepted', () => {
      as('tara@sunrise.test'); // Sunrise has not answered the debate invitation
      expect(domain.openEventsForStudent()).toEqual([]);
      expect(() => domain.apply('ev-debate', 'cat-debate-sr')).toThrow(/not accepted/);
    });
  });

  describe('withdrawal (RG-6)', () => {
    it('lets a student withdraw and re-apply before the deadline', () => {
      as('ishita@lakeview.test');
      domain.withdraw('reg-2');
      expect(domain.db.registrations.find((r) => r.id === 'reg-2')!.schoolStatus).toBe('withdrawn');
      domain.apply('ev-fiesta', 'cat-poster');
      expect(domain.db.registrations.find((r) => r.id === 'reg-2')!.schoolStatus).toBe('applied');
    });
  });

  describe('tenant isolation and roles', () => {
    it('stops a school from acting on another school’s records', () => {
      as('principal@lakeview.test');
      expect(() => domain.inviteSchools('ev-fiesta', ['sch-greenfield'])).toThrow(/host school/);
      expect(() => domain.decideNomination('reg-1', true)).toThrow(DomainError);
      expect(domain.hostNominations('ev-fiesta')).toEqual([]);

      as('principal@sunrise.test');
      expect(() => domain.decideApplication('reg-2', true)).toThrow(/your school/);
      expect(() => domain.respondToInvitation('inv-fiesta-aur', true, '')).toThrow(/not found/);
    });

    it('limits platform actions to the App Admin', () => {
      as('principal@sunrise.test');
      expect(() => domain.setSchoolStatus('sch-lakeview', 'suspended')).toThrow(/permission/);
    });

    it('stops a teacher without hosting rights from creating events', () => {
      as('teacher@lakeview.test');
      expect(domain.canHostEvents()).toBe(false);
      expect(() => domain.createEvent(draft(), true)).toThrow(/permission/);
    });

    it('never invites the host itself, suspended schools or the same school twice', () => {
      as('principal@sunrise.test');
      expect(
        domain.inviteSchools('ev-fiesta', ['sch-sunrise', 'sch-oakridge', 'sch-lakeview']),
      ).toBe(0);
    });
  });

  describe('events (EV-1, EV-4, EV-5)', () => {
    it('validates the deadline is before the start', () => {
      as('principal@sunrise.test');
      expect(() =>
        domain.createEvent({ ...draft(), regDeadline: '2026-12-02T00:00:00Z' }, true),
      ).toThrow(/deadline/);
    });

    it('notifies accepted schools and applicants when the venue changes', () => {
      as('principal@sunrise.test');
      const event = domain.event('ev-fiesta')!;
      const categories = domain
        .categoriesOf('ev-fiesta')
        .map(({ id: _id, eventId: _e, ...c }) => c);
      domain.updateEvent('ev-fiesta', { ...event, venue: 'New Hall', categories });
      const recipients = domain.db.notifications
        .filter((n) => n.type === 'event_changed')
        .map((n) => n.userId);
      expect(recipients).toEqual(
        expect.arrayContaining(['u-lake-admin', 'u-kabir', 'u-ishita', 'u-rohan']),
      );
    });

    it('requires a reason to cancel and records it in the audit log', () => {
      as('principal@sunrise.test');
      expect(() => domain.cancelEvent('ev-fiesta', '  ')).toThrow(/reason/);
      domain.cancelEvent('ev-fiesta', 'Venue flooded');
      expect(domain.event('ev-fiesta')!.status).toBe('cancelled');
      expect(domain.db.audit.at(-1)).toMatchObject({
        action: 'event.cancelled',
        actorId: 'u-sun-admin',
      });
      expect(() => domain.publishEvent('ev-fiesta')).toThrow(DomainError);
    });
  });

  describe('onboarding (ON-1)', () => {
    it('creates a school with an invited admin who must set a password', () => {
      as('admin@interschool.test');
      const school = domain.createSchool({
        name: 'Hilltop School',
        board: 'CBSE',
        city: 'Pune',
        address: '1 Hill Rd',
        contactEmail: 'office@hilltop.test',
        contactPhone: '123',
        adminName: 'Hema',
        adminEmail: 'Hema@Hilltop.test',
      });
      const admin = domain.db.users.find((u) => u.schoolId === school.id)!;
      expect(admin).toMatchObject({
        role: 'school_admin',
        email: 'hema@hilltop.test',
        mustChangePassword: true,
      });
      expect(
        domain.db.notifications.some((n) => n.userId === admin.id && n.channels.includes('email')),
      ).toBe(true);
    });
  });
});

function draft(): EventDraft {
  return {
    title: 'Chess Open',
    description: '',
    venue: 'Hall',
    startsAt: '2026-12-01T09:00:00Z',
    regDeadline: '2026-11-20T18:00:00Z',
    categories: [
      {
        name: 'Under 14',
        minClass: 6,
        maxClass: 8,
        genderRule: 'any',
        type: 'solo',
        teamSize: 1,
        maxPerSchool: 3,
      },
    ],
  };
}
