import { DOCUMENT } from '@angular/common';
import { Service, effect, inject, signal } from '@angular/core';

export type DsThemeMode = 'light' | 'dark' | 'system';
export type DsMotion = 'system' | 'reduce' | 'full';
export type DsTextSize = 'default' | 'large';

export interface DsPreferences {
  theme: DsThemeMode;
  motion: DsMotion;
  text: DsTextSize;
}

const STORAGE_KEY = 'ds-preferences';
const DEFAULTS: DsPreferences = { theme: 'system', motion: 'system', text: 'default' };

/**
 * Display preferences (theme, motion, text size). Written to `<html>` as
 * `data-theme`, `data-motion` and `data-text`, which the token stylesheet reads.
 */
@Service()
export class DsPreferencesService {
  private readonly document = inject(DOCUMENT);
  readonly preferences = signal<DsPreferences>(this.load());

  constructor() {
    effect(() => {
      const prefs = this.preferences();
      const root = this.document.documentElement;
      root.dataset['theme'] = prefs.theme;
      root.dataset['motion'] = prefs.motion;
      root.dataset['text'] = prefs.text;
      try {
        this.document.defaultView?.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
      } catch {
        // Storage can be unavailable (private mode); preferences then last for the session.
      }
    });
  }

  set<K extends keyof DsPreferences>(key: K, value: DsPreferences[K]): void {
    this.preferences.update((p) => ({ ...p, [key]: value }));
  }

  private load(): DsPreferences {
    try {
      const raw = this.document.defaultView?.localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<DsPreferences>) } : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  }
}
