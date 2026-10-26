import { TestBed } from '@angular/core/testing';
import { Auth } from './auth';
import { DomainService } from './domain';
import { DEMO_PASSWORD } from './seed';
import { Store } from './store';

describe('Auth', () => {
  let auth: Auth;
  let store: Store;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    store = TestBed.inject(Store);
    store.reset();
    auth = TestBed.inject(Auth);
  });

  it('signs in with matching credentials, case-insensitive email', () => {
    const result = auth.login('  Principal@Sunrise.test ', DEMO_PASSWORD);
    expect(result.ok).toBe(true);
    expect(auth.user()?.id).toBe('u-sun-admin');
    expect(auth.school()?.name).toBe('Sunrise Public School');
  });

  it('gives the same message for unknown email and wrong password', () => {
    const a = auth.login('nobody@x.test', DEMO_PASSWORD);
    const b = auth.login('principal@sunrise.test', 'wrong');
    expect(a.ok || b.ok).toBe(false);
    expect(!a.ok && !b.ok && a.message === b.message).toBe(true);
  });

  it('blocks users of a suspended school', () => {
    auth.login('admin@interschool.test', DEMO_PASSWORD);
    TestBed.inject(DomainService).setSchoolStatus('sch-lakeview', 'suspended');
    auth.logout();
    const result = auth.login('aarav@lakeview.test', DEMO_PASSWORD);
    expect(result.ok).toBe(false);
  });

  it('blocks students without recorded guardian consent', () => {
    store.update((db) => (db.students.find((s) => s.userId === 'u-aarav')!.consent = false));
    const result = auth.login('aarav@lakeview.test', DEMO_PASSWORD);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('consent') });
  });

  it('forces and completes a first-login password change', () => {
    auth.login('meera@lakeview.test', DEMO_PASSWORD);
    expect(auth.user()?.mustChangePassword).toBe(true);
    expect(auth.changePassword('wrong', 'new-password-1')).toMatch(/not correct/);
    expect(auth.changePassword(DEMO_PASSWORD, 'short')).toMatch(/8 characters/);
    expect(auth.changePassword(DEMO_PASSWORD, 'new-password-1')).toBeNull();
    expect(auth.user()?.mustChangePassword).toBe(false);
  });
});
