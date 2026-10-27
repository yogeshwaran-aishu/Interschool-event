import { DOCUMENT } from '@angular/common';
import { Component, Injector, afterNextRender, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { DsPreferencesService, DsToaster } from '@isc/design-system';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, DsToaster],
  template: `
    <a class="ds-skip-link" href="#main">Skip to main content</a>
    <router-outlet />
    <ds-toaster />
    <p class="ds-visually-hidden" aria-live="polite" aria-atomic="true">{{ announcement() }}</p>
  `,
})
export class App {
  private readonly document = inject(DOCUMENT);
  protected readonly announcement = signal('');

  constructor() {
    // Instantiating the service applies the saved theme before first paint of routed views.
    inject(DsPreferencesService);

    const injector = inject(Injector);
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => {
        // Single-page navigation: announce the new page and move focus to its heading.
        // The initial load keeps the browser's default focus.
        afterNextRender(
          () => {
            this.announcement.set(this.document.title);
            if (e.id > 1) this.document.querySelector<HTMLElement>('[data-page-heading]')?.focus();
          },
          { injector },
        );
      });
  }
}
