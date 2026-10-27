import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from './api';
import { Db, User } from './models';
import { EMPTY_DB } from './store';

/** HttpClient with the app's interceptor, backed by HttpTestingController. */
export const httpTestingProviders = () => [
  provideHttpClient(withInterceptors([authInterceptor])),
  provideHttpClientTesting(),
];

export const testUser = (overrides: Partial<User> = {}): User => ({
  id: 'u-1',
  schoolId: 's-1',
  role: 'school_admin',
  name: 'Anita Deshmukh',
  email: 'principal@sunrise.test',
  status: 'active',
  mustChangePassword: false,
  ...overrides,
});

export const testDb = (overrides: Partial<Db> = {}): Db => ({ ...EMPTY_DB, ...overrides });

/** Lets queued promise callbacks run so the next HTTP request is issued. */
export const settle = () => new Promise((resolve) => setTimeout(resolve));

/** Answers the next request to `url` (and method) and lets the caller continue. */
export async function respond(
  url: string,
  body: object | null,
  opts: { method?: string; status?: number } = {},
) {
  await settle();
  const http = TestBed.inject(HttpTestingController);
  const req = http.expectOne((r) => r.url === url && (!opts.method || r.method === opts.method));
  if (opts.status && opts.status >= 400)
    req.flush(body, { status: opts.status, statusText: 'Error' });
  else req.flush(body);
  return req.request;
}
