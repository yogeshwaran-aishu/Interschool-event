import { Component, Service, computed, inject, signal } from '@angular/core';
import { DsButton } from '../button/button';
import { DsIcon, DsIconName } from '../icon/icon';

export type DsToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface DsToastMessage {
  id: number;
  tone: DsToastTone;
  title: string;
  detail?: string;
}

/**
 * Toasts stay until dismissed: WCAG 2.2.3 (AAA) rules out content that disappears on a timer.
 * Only the newest three are shown.
 */
@Service()
export class DsToastService {
  private nextId = 0;
  private readonly all = signal<DsToastMessage[]>([]);
  readonly messages = computed(() => this.all().slice(-3));

  show(tone: DsToastTone, title: string, detail?: string): void {
    this.all.update((list) => [...list, { id: this.nextId++, tone, title, detail }]);
  }

  success(title: string, detail?: string): void {
    this.show('success', title, detail);
  }

  error(title: string, detail?: string): void {
    this.show('danger', title, detail);
  }

  dismiss(id: number): void {
    this.all.update((list) => list.filter((m) => m.id !== id));
  }

  clear(): void {
    this.all.set([]);
  }
}

const TONE_ICON: Record<DsToastTone, DsIconName> = {
  info: 'info',
  success: 'check-circle',
  warning: 'alert',
  danger: 'x-circle',
};

@Component({
  selector: 'ds-toaster',
  imports: [DsButton, DsIcon],
  template: `
    <div class="ds-toaster" role="region" aria-label="Notifications">
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        class="ds-stack"
        style="--ds-stack-gap: var(--ds-space-3)"
      >
        @for (toast of toasts.messages(); track toast.id) {
          <div class="ds-toast" [class]="'ds-toast--' + toast.tone">
            <ds-icon [name]="icon[toast.tone]" />
            <div>
              <p class="ds-toast__title">{{ toast.title }}</p>
              @if (toast.detail) {
                <p>{{ toast.detail }}</p>
              }
            </div>
            <button
              dsButton="ghost"
              size="icon"
              type="button"
              (click)="toasts.dismiss(toast.id)"
              [attr.aria-label]="'Dismiss: ' + toast.title"
            >
              <ds-icon name="x" />
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class DsToaster {
  protected readonly toasts = inject(DsToastService);
  protected readonly icon = TONE_ICON;
}
