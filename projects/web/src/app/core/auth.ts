import { DOCUMENT } from '@angular/common';
import { Service, computed, effect, inject, signal } from '@angular/core';
import { User } from './models';
import { Store } from './store';

const SESSION_KEY = 'isc-session';

export type LoginResult = { ok: true; user: User } | { ok: false; message: string };

/** Demo session handling. A real deployment verifies hashed passwords server-side. */
@Service()
export class Auth {
  private readonly store = inject(Store);
  private readonly document = inject(DOCUMENT);
  private readonly userId = signal<string | null>(this.restore());

  readonly user = computed(() => {
    const id = this.userId();
    return id ? (this.store.db().users.find((u) => u.id === id) ?? null) : null;
  });
  readonly school = computed(() => {
    const schoolId = this.user()?.schoolId;
    return schoolId ? (this.store.db().schools.find((s) => s.id === schoolId) ?? null) : null;
  });

  constructor() {
    effect(() => {
      const id = this.userId();
      try {
        const storage = this.document.defaultView?.sessionStorage;
        if (id) storage?.setItem(SESSION_KEY, id);
        else storage?.removeItem(SESSION_KEY);
      } catch {
        // Session-only fallback.
      }
    });
  }

  login(email: string, password: string): LoginResult {
    const db = this.store.db();
    const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    // One message for unknown email and wrong password, so accounts can't be enumerated.
    if (!user || user.password !== password) {
      return {
        ok: false,
        message: 'That email and password do not match an account. Check both and try again.',
      };
    }
    if (user.status === 'suspended') {
      return { ok: false, message: 'This account is suspended. Contact your school office.' };
    }
    const school = user.schoolId ? db.schools.find((s) => s.id === user.schoolId) : null;
    if (school?.status === 'suspended') {
      return {
        ok: false,
        message: `${school.name} is suspended on InterSchool Connect. Contact the platform team.`,
      };
    }
    if (user.role === 'student' && !db.students.find((s) => s.userId === user.id)?.consent) {
      return {
        ok: false,
        message: 'Your account activates once your school records guardian consent.',
      };
    }
    this.userId.set(user.id);
    return { ok: true, user };
  }

  changePassword(current: string, next: string): string | null {
    const user = this.user();
    if (!user) return 'You are signed out.';
    if (user.password !== current) return 'Your current password is not correct.';
    if (next.length < 8) return 'Use at least 8 characters.';
    if (next === current) return 'Choose a password different from your current one.';
    this.store.update((db) => {
      const u = db.users.find((x) => x.id === user.id)!;
      u.password = next;
      u.mustChangePassword = false;
      u.status = 'active';
    });
    return null;
  }

  logout(): void {
    this.userId.set(null);
  }

  private restore(): string | null {
    try {
      return this.document.defaultView?.sessionStorage.getItem(SESSION_KEY) ?? null;
    } catch {
      return null;
    }
  }
}
