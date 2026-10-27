import { Component, computed, inject, signal } from '@angular/core';
import { FormField, email, form, required, submit } from '@angular/forms/signals';
import {
  DsBadge,
  DsButton,
  DsControl,
  DsDialog,
  DsEmptyState,
  DsField,
  DsIcon,
  DsPageHeader,
} from '@isc/design-system';
import { DomainService, NewSchool } from '../../core/domain';
import { BOARDS } from '../../core/labels';
import { School } from '../../core/models';
import { injectAction } from '../../shared/action';

const EMPTY: NewSchool = {
  name: '',
  board: 'CBSE',
  city: '',
  address: '',
  contactEmail: '',
  contactPhone: '',
  adminName: '',
  adminEmail: '',
};

@Component({
  selector: 'app-schools',
  imports: [
    FormField,
    DsPageHeader,
    DsButton,
    DsIcon,
    DsBadge,
    DsDialog,
    DsField,
    DsControl,
    DsEmptyState,
  ],
  templateUrl: './schools.html',
})
export default class Schools {
  private readonly domain = inject(DomainService);
  private readonly run = injectAction();
  protected readonly boards = BOARDS;

  protected readonly query = signal('');
  protected readonly schools = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.domain.db.schools
      .filter((s) => !q || `${s.name} ${s.city} ${s.board}`.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  protected readonly createOpen = signal(false);
  protected readonly confirmTarget = signal<School | null>(null);
  protected readonly model = signal<NewSchool>({ ...EMPTY });
  protected readonly form = form(this.model, (p) => {
    required(p.name, { message: 'Enter the school’s name.' });
    required(p.city, { message: 'Enter the city.' });
    required(p.address, { message: 'Enter the address.' });
    required(p.contactEmail, { message: 'Enter the office email.' });
    email(p.contactEmail, { message: 'Enter a valid email address.' });
    required(p.contactPhone, { message: 'Enter the office phone number.' });
    required(p.adminName, { message: 'Enter the School Admin’s name.' });
    required(p.adminEmail, { message: 'Enter the School Admin’s email.' });
    email(p.adminEmail, { message: 'Enter a valid email address.' });
  });

  protected counts(schoolId: string): { users: number; events: number } {
    return this.domain.db.platform?.perSchool[schoolId] ?? { users: 0, events: 0 };
  }

  protected errorOf(field: keyof NewSchool): string | null {
    const state = this.form[field]();
    return state.touched() && state.invalid() ? (state.errors()[0]?.message ?? null) : null;
  }

  protected openCreate(): void {
    this.model.set({ ...EMPTY });
    this.form().reset();
    this.createOpen.set(true);
  }

  protected async create(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.form, async () => {
      const ok = await this.run(
        () => this.domain.createSchool(this.model()),
        (s) => `${s.name} onboarded`,
        `An invitation email to set a password was queued for ${this.model().adminEmail}.`,
      );
      if (ok) this.createOpen.set(false);
    });
  }

  protected async toggleStatus(): Promise<void> {
    const school = this.confirmTarget();
    if (!school) return;
    const next = school.status === 'active' ? 'suspended' : 'active';
    this.confirmTarget.set(null);
    await this.run(
      () => this.domain.setSchoolStatus(school.id, next),
      `${school.name} ${next === 'active' ? 'reactivated' : 'suspended'}`,
    );
  }
}
