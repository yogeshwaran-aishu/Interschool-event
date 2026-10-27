import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Session } from './api';
import { Auth } from './auth';
import { Store } from './store';
import { httpTestingProviders, respond, testDb, testUser } from './test-support';

describe('Auth', () => {
  let auth: Auth;
  let http: HttpTestingController;
  const school = {
    id: 's-1',
    name: 'Sunrise Public School',
    board: 'CBSE',
    city: 'Pune',
    address: '',
    contactEmail: '',
    contactPhone: '',
    status: 'active' as const,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: httpTestingProviders() });
    auth = TestBed.inject(Auth);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('signs in through the API, normalising the email, then loads the state', async () => {
    const result = auth.login('  Principal@Sunrise.test ', 'demo1234');
    const req = await respond('/api/v1/auth/login', { accessToken: 'tok', user: testUser() });
    expect(req.body).toEqual({ loginId: 'principal@sunrise.test', password: 'demo1234' });
    const state = await respond(
      '/api/v1/state',
      testDb({ users: [testUser()], schools: [school] }),
    );
    expect(state.headers.get('Authorization')).toBe('Bearer tok');
    expect(await result).toMatchObject({ ok: true });
    expect(auth.user()?.id).toBe('u-1');
    expect(auth.school()?.name).toBe('Sunrise Public School');
  });

  it('shows the server’s message when sign-in is refused', async () => {
    const result = auth.login('principal@sunrise.test', 'wrong');
    await respond(
      '/api/v1/auth/login',
      { error: { code: 'INVALID_CREDENTIALS', message: 'That email and password do not match.' } },
      { status: 401 },
    );
    expect(await result).toEqual({ ok: false, message: 'That email and password do not match.' });
    expect(auth.user()).toBeNull();
  });

  it('resumes a session from the refresh cookie on start', async () => {
    const restore = auth.restore();
    await respond('/api/v1/auth/refresh', { accessToken: 'tok2', user: testUser() });
    await respond('/api/v1/state', testDb({ users: [testUser()] }));
    await restore;
    expect(auth.user()?.name).toBe('Anita Deshmukh');
    expect(TestBed.inject(Session).accessToken()).toBe('tok2');
  });

  it('stays signed out when there is no session to resume', async () => {
    const restore = auth.restore();
    await respond('/api/v1/auth/refresh', { error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
    await restore;
    expect(auth.user()).toBeNull();
  });

  it('checks a new password locally, then lets the server verify the current one', async () => {
    const login = auth.login('meera@lakeview.test', 'demo1234');
    await respond('/api/v1/auth/login', {
      accessToken: 't',
      user: testUser({ mustChangePassword: true }),
    });
    await respond('/api/v1/state', testDb());
    await login;

    expect(await auth.changePassword('demo1234', 'short')).toMatch(/8 characters/);
    const wrong = auth.changePassword('wrong', 'new-password-1');
    await respond(
      '/api/v1/auth/change-password',
      { error: { code: 'VALIDATION_FAILED', message: 'Your current password is not correct.' } },
      { status: 400 },
    );
    expect(await wrong).toMatch(/not correct/);

    const ok = auth.changePassword('demo1234', 'new-password-1');
    await respond('/api/v1/auth/change-password', testUser({ mustChangePassword: false }));
    await respond('/api/v1/state', testDb());
    expect(await ok).toBeNull();
    expect(auth.user()?.mustChangePassword).toBe(false);
  });

  it('clears the session and cached data on sign-out', async () => {
    const login = auth.login('principal@sunrise.test', 'demo1234');
    await respond('/api/v1/auth/login', { accessToken: 't', user: testUser() });
    await respond('/api/v1/state', testDb({ users: [testUser()] }));
    await login;
    const logout = auth.logout();
    await respond('/api/v1/auth/logout', null);
    await logout;
    expect(auth.user()).toBeNull();
    expect(TestBed.inject(Store).db().users).toEqual([]);
  });
});
