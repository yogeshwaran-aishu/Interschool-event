import { Component, inject, signal } from '@angular/core';
import { FormField, form, minLength, required, submit, validate } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { DsButton, DsCard, DsControl, DsField, DsIcon, DsToastService } from '@isc/design-system';
import { Auth } from '../../core/auth';

@Component({
  selector: 'app-change-password',
  imports: [FormField, DsField, DsControl, DsButton, DsIcon, DsCard],
  template: `
    <main id="main" tabindex="-1" class="wrap">
      <ds-card class="ds-stack">
        <div class="ds-stack" style="--ds-stack-gap: var(--ds-space-2)">
          <p class="ds-eyebrow"><ds-icon name="key" /> Account security</p>
          <h1 data-page-heading tabindex="-1" style="font-size: var(--ds-fs-2xl)">
            {{ forced ? 'Set a new password' : 'Change password' }}
          </h1>
          @if (forced) {
            <p class="ds-muted">
              This is your first sign-in. Replace the password your school gave you with one only
              you know.
            </p>
          }
        </div>
        @if (error()) {
          <div class="ds-callout ds-callout--danger" role="alert">
            <ds-icon name="alert" />
            <p>{{ error() }}</p>
          </div>
        }
        <form class="ds-stack" novalidate (submit)="onSubmit($event)">
          <ds-field label="Current password" [required]="true" [error]="errorOf('current')">
            <input
              dsControl
              type="password"
              autocomplete="current-password"
              [formField]="form.current"
            />
          </ds-field>
          <ds-field
            label="New password"
            [required]="true"
            hint="At least 8 characters. A short phrase is easy to remember."
            [error]="errorOf('next')"
          >
            <input dsControl type="password" autocomplete="new-password" [formField]="form.next" />
          </ds-field>
          <ds-field label="Confirm new password" [required]="true" [error]="errorOf('confirm')">
            <input
              dsControl
              type="password"
              autocomplete="new-password"
              [formField]="form.confirm"
            />
          </ds-field>
          <button dsButton="primary" size="lg" [block]="true" type="submit">Save password</button>
          <button dsButton="ghost" [block]="true" type="button" (click)="signOut()">
            Sign out
          </button>
        </form>
      </ds-card>
    </main>
  `,
  styles: `
    .wrap {
      display: grid;
      place-items: center;
      min-height: 100dvh;
      padding: var(--ds-space-5) var(--ds-space-4);
    }
    .wrap:focus {
      outline: none;
    }
    ds-card {
      width: 100%;
      max-width: 30rem;
    }
    .ds-eyebrow {
      display: flex;
      gap: var(--ds-space-2);
      align-items: center;
    }
    .ds-eyebrow ::ng-deep svg {
      width: 16px;
    }
  `,
})
export default class ChangePassword {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly toast = inject(DsToastService);

  protected readonly forced = !!this.auth.user()?.mustChangePassword;
  protected readonly error = signal<string | null>(null);
  protected readonly model = signal({ current: '', next: '', confirm: '' });
  protected readonly form = form(this.model, (p) => {
    required(p.current, { message: 'Enter your current password.' });
    required(p.next, { message: 'Enter a new password.' });
    minLength(p.next, 8, { message: 'Use at least 8 characters.' });
    validate(p.confirm, ({ value, valueOf }) =>
      value() === valueOf(p.next)
        ? null
        : { kind: 'mismatch', message: 'The two passwords do not match.' },
    );
  });

  protected errorOf(field: 'current' | 'next' | 'confirm'): string | null {
    const state = this.form[field]();
    return state.touched() && state.invalid() ? (state.errors()[0]?.message ?? null) : null;
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.form, async () => {
      const { current, next } = this.model();
      const problem = this.auth.changePassword(current, next);
      if (problem) {
        this.error.set(problem);
        return;
      }
      this.toast.success('Password updated');
      await this.router.navigateByUrl('/dashboard');
    });
  }

  protected signOut(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
