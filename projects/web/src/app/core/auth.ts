import { Service, computed, inject, signal } from '@angular/core';
import { Api, Session, SessionResponse } from './api';
import { User } from './models';
import { DomainError } from './state-machines';
import { Store } from './store';

export type LoginResult = { ok: true; user: User } | { ok: false; message: string };

/**
 * Session handling against the API: passwords are verified server-side (argon2id), the
 * access token stays in memory and the refresh token in an httpOnly cookie.
 */
@Service()
export class Auth {
  private readonly api = inject(Api);
  private readonly session = inject(Session);
  private readonly store = inject(Store);
  private readonly current = signal<User | null>(null);

  /** The signed-in user, kept fresh from the store after each reload. */
  readonly user = computed(() => {
    const me = this.current();
    return me ? (this.store.db().users.find((u) => u.id === me.id) ?? me) : null;
  });
  readonly school = computed(() => {
    const schoolId = this.user()?.schoolId;
    return schoolId ? (this.store.db().schools.find((s) => s.id === schoolId) ?? null) : null;
  });

  /** On app start: resumes the session from the refresh cookie, if there is one. */
  async restore(): Promise<void> {
    const session = await this.session.refresh();
    if (session) await this.start(session).catch(() => this.end());
  }

  async login(email: string, password: string): Promise<LoginResult> {
    try {
      const session = await this.api.post<SessionResponse>('/auth/login', {
        loginId: email.trim().toLowerCase(),
        password,
      });
      await this.start(session);
      return { ok: true, user: session.user };
    } catch (err) {
      if (err instanceof DomainError) return { ok: false, message: err.message };
      throw err;
    }
  }

  /** Returns a message to show, or null when the password was changed. */
  async changePassword(current: string, next: string): Promise<string | null> {
    if (!this.user()) return 'You are signed out.';
    if (next.length < 8) return 'Use at least 8 characters.';
    if (next === current) return 'Choose a password different from your current one.';
    try {
      const user = await this.api.post<User>('/auth/change-password', {
        currentPassword: current,
        newPassword: next,
      });
      this.current.set(user);
      await this.store.refresh();
      return null;
    } catch (err) {
      if (err instanceof DomainError) return err.message;
      throw err;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.api.post('/auth/logout');
    } catch {
      // Signing out locally still matters if the server can't be reached.
    }
    this.end();
  }

  private async start(session: SessionResponse): Promise<void> {
    this.session.accessToken.set(session.accessToken);
    this.current.set(session.user);
    await this.store.refresh();
  }

  private end(): void {
    this.session.accessToken.set(null);
    this.current.set(null);
    this.store.clear();
  }
}
