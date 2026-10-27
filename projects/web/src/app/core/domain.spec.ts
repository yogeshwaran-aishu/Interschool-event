import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Auth } from './auth';
import { DomainService } from './domain';
import { Category, Db, Invitation, Nomination, Registration, SchoolEvent } from './models';
import { DomainError } from './state-machines';
import { httpTestingProviders, respond, testDb, testUser } from './test-support';

const event: SchoolEvent = {
  id: 'ev-1',
  hostSchoolId: 's-1',
  title: 'Science Fiesta',
  description: '',
  venue: 'Hall',
  startsAt: '2030-01-20T09:00:00.000Z',
  regDeadline: '2030-01-10T18:00:00.000Z',
  status: 'open',
  coordinatorIds: [],
  createdBy: 'u-1',
};
const category: Category = {
  id: 'cat-1',
  eventId: 'ev-1',
  name: 'Quiz',
  minClass: 6,
  maxClass: 10,
  genderRule: 'any',
  type: 'solo',
  teamSize: 1,
  maxPerSchool: 2,
};
const invitation: Invitation = {
  id: 'inv-1',
  eventId: 'ev-1',
  guestSchoolId: 's-2',
  status: 'accepted',
  coordinatorIds: [],
};
const reg = (id: string, hostStatus: Registration['hostStatus']): Registration => ({
  id,
  invitationId: 'inv-1',
  categoryId: 'cat-1',
  studentId: `stu-${id}`,
  schoolStatus: 'approved',
  hostStatus,
  appliedAt: '2030-01-01T00:00:00.000Z',
});
const nomination: Nomination = {
  registrationId: 'r-1',
  eventId: 'ev-1',
  invitationId: 'inv-1',
  studentName: 'Aarav Mehta',
  className: 9,
  schoolName: 'Lakeview Vidyalaya',
  categoryName: 'Quiz',
  hostStatus: 'pending',
};

describe('DomainService', () => {
  let domain: DomainService;
  let http: HttpTestingController;

  async function signIn(db: Partial<Db>, user = testUser()) {
    const login = TestBed.inject(Auth).login(user.email, 'demo1234');
    await respond('/api/v1/auth/login', { accessToken: 't', user });
    await respond('/api/v1/state', testDb({ users: [user], ...db }));
    await login;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: httpTestingProviders() });
    domain = TestBed.inject(DomainService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends each write to its API action route, then reloads the state', async () => {
    await signIn({ events: [event] });
    const done = domain.publishEvent('ev-1');
    const req = await respond('/api/v1/events/ev-1/publish', { ...event, status: 'open' });
    expect(req.method).toBe('POST');
    await respond('/api/v1/state', testDb({ users: [testUser()], events: [{ ...event }] }));
    await done;
  });

  it('turns an API refusal into a DomainError with the server’s message, and still reloads', async () => {
    await signIn({});
    const done = domain.decideApplication('r-9', true);
    await respond(
      '/api/v1/registrations/r-9/school-approve',
      { error: { code: 'QUOTA_FULL', message: 'Quota reached: Quiz allows 2 per school.' } },
      { status: 409 },
    );
    await respond('/api/v1/state', testDb({ users: [testUser()] }));
    await expect(done).rejects.toMatchObject({
      constructor: DomainError,
      code: 'QUOTA_FULL',
      message: 'Quota reached: Quiz allows 2 per school.',
    });
  });

  it('asks for a reason before calling the API to cancel', async () => {
    await signIn({});
    await expect(domain.cancelEvent('ev-1', '  ')).rejects.toThrow(/Give a reason/);
  });

  it('shows the host only nominations for events it hosts', async () => {
    await signIn({
      events: [event],
      nominations: [nomination, { ...nomination, eventId: 'other' }],
    });
    expect(domain.hostNominations('ev-1')).toEqual([nomination]);
    expect(domain.hostNominations('other')).toEqual([]);
  });

  it('counts approvals against the quota, leaving out host-rejected ones', async () => {
    await signIn(
      {
        events: [event],
        categories: [category],
        invitations: [invitation],
        registrations: [reg('a', 'not_submitted'), reg('b', 'confirmed'), reg('c', 'rejected')],
      },
      testUser({ schoolId: 's-2' }),
    );
    expect(domain.approvedCount('inv-1', 'cat-1')).toBe(2);
  });

  it('uploads the CSV and waits for the import job', async () => {
    await signIn({});
    const done = domain.importPeople('role,name,email\nteacher,A,a@x.test');
    const upload = await respond('/api/v1/school/users/import', { jobId: 'job-1' });
    expect(upload.body).toEqual({ csv: 'role,name,email\nteacher,A,a@x.test' });
    await respond('/api/v1/school/imports/job-1', {
      jobId: 'job-1',
      status: 'done',
      result: { created: 1, errors: [] },
      error: null,
    });
    await respond('/api/v1/state', testDb({ users: [testUser()] }));
    expect(await done).toEqual({ created: 1, errors: [] });
  });
});
