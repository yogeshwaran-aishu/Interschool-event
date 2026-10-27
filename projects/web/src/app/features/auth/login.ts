import { Component, inject, signal } from '@angular/core';
import { FormField, email, form, required, submit } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { DsButton, DsControl, DsField, DsIcon } from '@isc/design-system';
import { Auth } from '../../core/auth';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../../core/demo-accounts';

@Component({
  selector: 'app-login',
  imports: [FormField, DsField, DsControl, DsButton, DsIcon],
  templateUrl: './login.html',
  styleUrl: './auth.scss',
})
export default class Login {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly accounts = DEMO_ACCOUNTS;
  protected readonly model = signal({ email: '', password: '' });
  protected readonly form = form(this.model, (p) => {
    required(p.email, { message: 'Enter your email address.' });
    email(p.email, { message: 'Enter an email address like name@school.edu.' });
    required(p.password, { message: 'Enter your password.' });
  });
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  protected errorOf(field: 'email' | 'password'): string | null {
    const state = this.form[field]();
    return state.touched() && state.invalid() ? (state.errors()[0]?.message ?? null) : null;
  }

  protected useDemo(email: string): void {
    this.model.set({ email, password: DEMO_PASSWORD });
    this.error.set(null);
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.form, async () => {
      const { email, password } = this.model();
      const result = await this.auth.login(email, password);
      if (!result.ok) {
        this.error.set(result.message);
        return;
      }
      this.error.set(null);
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      await this.router.navigateByUrl(
        result.user.mustChangePassword ? '/account/password' : (returnUrl ?? '/dashboard'),
      );
    });
  }
}
