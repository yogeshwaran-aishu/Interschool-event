import { Service, inject, signal } from '@angular/core';
import { Api } from './api';
import { Db } from './models';

export const EMPTY_DB: Db = {
  schools: [],
  users: [],
  students: [],
  events: [],
  categories: [],
  invitations: [],
  registrations: [],
  nominations: [],
  notifications: [],
  audit: [],
};

/**
 * Client-side cache of what the API lets the signed-in person see (GET /api/v1/state).
 * Pages read it through signals; after every write `DomainService` reloads it, so the
 * PostgreSQL database stays the single source of truth.
 */
@Service()
export class Store {
  private readonly api = inject(Api);
  readonly db = signal<Db>(EMPTY_DB);
  readonly loaded = signal(false);

  async refresh(): Promise<void> {
    this.db.set(await this.api.get<Db>('/state'));
    this.loaded.set(true);
  }

  clear(): void {
    this.db.set(EMPTY_DB);
    this.loaded.set(false);
  }

  /** Development only: the API re-seeds the demo data (POST /dev/reset). */
  async resetDemo(): Promise<void> {
    await this.api.post('/dev/reset');
  }
}
