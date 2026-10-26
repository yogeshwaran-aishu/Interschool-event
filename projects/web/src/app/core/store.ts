import { DOCUMENT } from '@angular/common';
import { Service, effect, inject, signal } from '@angular/core';
import { Clock } from './clock';
import { Db } from './models';
import { createSeed } from './seed';

const STORAGE_KEY = 'isc-db-v1';

/**
 * In-browser stand-in for the PostgreSQL database described in the PRD. Holds all
 * tables in one signal and persists them to localStorage so the demo survives reloads.
 * Only `DomainService` writes to it.
 */
@Service()
export class Store {
  private readonly document = inject(DOCUMENT);
  private readonly clock = inject(Clock);
  readonly db = signal<Db>(this.load());

  constructor() {
    effect(() => {
      const db = this.db();
      try {
        this.document.defaultView?.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      } catch {
        // Storage unavailable: data lives for this session only.
      }
    });
  }

  update(mutator: (draft: Db) => void): void {
    this.db.update((db) => {
      const draft = structuredClone(db);
      mutator(draft);
      return draft;
    });
  }

  reset(): void {
    this.db.set(createSeed(this.clock.now()));
  }

  private load(): Db {
    try {
      const raw = this.document.defaultView?.localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as Db;
    } catch {
      // Fall through to fresh seed data.
    }
    return createSeed(this.clock.now());
  }
}
