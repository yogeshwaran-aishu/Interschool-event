import {
  HttpBackend,
  HttpClient,
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { Service, inject, signal } from '@angular/core';
import { Observable, firstValueFrom, from, switchMap, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { User } from './models';
import { DomainError } from './state-machines';

/** Base path of the Node.js API. The dev server proxies it (proxy.conf.json). */
export const API_BASE = '/api/v1';

export interface SessionResponse {
  accessToken: string;
  user: User;
}

/**
 * Holds the short-lived access token in memory. The refresh token lives in an httpOnly
 * cookie the browser sends to /auth/* only, so scripts never see it.
 */
@Service()
export class Session {
  // Bypasses interceptors so a refresh can never trigger another refresh.
  private readonly raw = new HttpClient(inject(HttpBackend));
  readonly accessToken = signal<string | null>(null);
  private refreshing: Promise<SessionResponse | null> | null = null;

  /** Rotates the refresh cookie and stores the new access token. Concurrent callers share one call. */
  refresh(): Promise<SessionResponse | null> {
    this.refreshing ??= firstValueFrom(
      this.raw.post<SessionResponse>(`${API_BASE}/auth/refresh`, null, { withCredentials: true }),
    )
      .then((s) => {
        this.accessToken.set(s.accessToken);
        return s;
      })
      .catch(() => {
        this.accessToken.set(null);
        return null;
      })
      .finally(() => (this.refreshing = null));
    return this.refreshing;
  }
}

const withToken = (req: HttpRequest<unknown>, token: string | null) =>
  token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

/** Adds the bearer token; on an expired token, refreshes once and retries the request. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API_BASE)) return next(req);
  const session = inject(Session);
  const authRoute =
    req.url.startsWith(`${API_BASE}/auth/`) && !req.url.endsWith('/change-password');
  return next(withToken(req, session.accessToken())).pipe(
    catchError((err: unknown) => {
      const expired =
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        err.error?.error?.code === 'TOKEN_EXPIRED';
      if (!expired || authRoute) return throwError(() => err);
      return from(session.refresh()).pipe(
        switchMap((s) => (s ? next(withToken(req, s.accessToken)) : throwError(() => err))),
      );
    }),
  );
};

/** The API's error envelope, turned into a DomainError so pages can show its message. */
export function toDomainError(err: unknown): unknown {
  if (!(err instanceof HttpErrorResponse)) return err;
  const body = err.error?.error as { code?: string; message?: string } | undefined;
  if (body?.message) return new DomainError(body.message, body.code ?? 'UNKNOWN', err.status);
  if (err.status === 0)
    return new DomainError(
      'The server could not be reached. Check your connection and try again.',
      'NETWORK',
      0,
    );
  return new DomainError(
    'Something went wrong on our side. Please try again.',
    'INTERNAL',
    err.status,
  );
}

/** Thin promise-based wrapper over HttpClient for the /api/v1 endpoints. */
@Service()
export class Api {
  private readonly http = inject(HttpClient);

  get<T>(path: string): Promise<T> {
    return this.call(this.http.get<T>(API_BASE + path));
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.call(this.http.post<T>(API_BASE + path, body, { withCredentials: true }));
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.call(this.http.put<T>(API_BASE + path, body));
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.call(this.http.patch<T>(API_BASE + path, body));
  }

  /** Downloads a file, returning its body and the server's suggested filename. */
  async download(path: string): Promise<{ blob: Blob; filename: string | null }> {
    const res = await this.call(
      this.http.get(API_BASE + path, { responseType: 'blob', observe: 'response' }),
    );
    const disposition = res.headers.get('Content-Disposition') ?? '';
    return { blob: res.body!, filename: /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? null };
  }

  private async call<T>(request: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (err) {
      throw toDomainError(err);
    }
  }
}
