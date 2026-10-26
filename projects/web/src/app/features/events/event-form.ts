import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import {
  FormField,
  applyEach,
  form,
  max,
  min,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { DsButton, DsCard, DsControl, DsField, DsIcon, DsPageHeader } from '@isc/design-system';
import { DomainService, EventDraft } from '../../core/domain';
import { Category } from '../../core/models';
import { injectAction } from '../../shared/action';

type CategoryModel = Omit<Category, 'id' | 'eventId'>;

interface EventFormModel {
  title: string;
  description: string;
  venue: string;
  startsAt: string;
  regDeadline: string;
  categories: CategoryModel[];
}

const newCategory = (): CategoryModel => ({
  name: '',
  minClass: 6,
  maxClass: 12,
  genderRule: 'any',
  type: 'solo',
  teamSize: 1,
  maxPerSchool: 2,
});

/** ISO string → value for <input type="datetime-local"> (local time, minutes precision). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

@Component({
  selector: 'app-event-form',
  imports: [FormField, RouterLink, DsPageHeader, DsCard, DsField, DsControl, DsButton, DsIcon],
  templateUrl: './event-form.html',
  styleUrl: './event-form.scss',
})
export default class EventForm {
  /** Route param; absent when creating. */
  readonly id = input<string>();

  private readonly domain = inject(DomainService);
  private readonly router = inject(Router);
  private readonly run = injectAction();

  protected readonly existing = computed(() =>
    this.id() ? this.domain.event(this.id()!) : undefined,
  );
  protected readonly isEdit = computed(() => !!this.existing());

  protected readonly model = linkedSignal<EventFormModel>(() => {
    const e = this.existing();
    if (!e) {
      return {
        title: '',
        description: '',
        venue: '',
        startsAt: '',
        regDeadline: '',
        categories: [newCategory()],
      };
    }
    return {
      title: e.title,
      description: e.description,
      venue: e.venue,
      startsAt: toLocalInput(e.startsAt),
      regDeadline: toLocalInput(e.regDeadline),
      categories: this.domain
        .categoriesOf(e.id)
        .map(({ id: _id, eventId: _eventId, ...rest }) => rest),
    };
  });

  protected readonly form = form(this.model, (p) => {
    required(p.title, { message: 'Give the event a title.' });
    required(p.venue, { message: 'Add the venue.' });
    required(p.startsAt, { message: 'Choose when the event starts.' });
    required(p.regDeadline, { message: 'Choose the registration deadline.' });
    validate(p.regDeadline, ({ value, valueOf }) => {
      const start = valueOf(p.startsAt);
      return value() && start && value() >= start
        ? { kind: 'order', message: 'The deadline must be before the event starts.' }
        : null;
    });
    applyEach(p.categories, (c) => {
      required(c.name, { message: 'Name the category.' });
      min(c.minClass, 1, { message: 'Lowest class is 1.' });
      max(c.minClass, 12, { message: 'Highest class is 12.' });
      min(c.maxClass, 1, { message: 'Lowest class is 1.' });
      max(c.maxClass, 12, { message: 'Highest class is 12.' });
      validate(c.maxClass, ({ value, valueOf }) =>
        value() < valueOf(c.minClass)
          ? { kind: 'range', message: 'Must not be below the lowest class.' }
          : null,
      );
      min(c.maxPerSchool, 1, { message: 'Allow at least 1 entry per school.' });
      min(c.teamSize, 1, { message: 'At least 1.' });
    });
  });

  protected readonly categoryFields = computed(() =>
    this.model().categories.map((_, i) => this.form.categories[i]),
  );

  protected errorOf(state: {
    touched(): boolean;
    invalid(): boolean;
    errors(): { message?: string }[];
  }): string | null {
    return state.touched() && state.invalid() ? (state.errors()[0]?.message ?? null) : null;
  }

  protected addCategory(): void {
    this.model.update((m) => ({ ...m, categories: [...m.categories, newCategory()] }));
  }

  protected removeCategory(index: number): void {
    this.model.update((m) => ({ ...m, categories: m.categories.filter((_, i) => i !== index) }));
  }

  protected async save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const publish = (event.submitter as HTMLButtonElement | null)?.value === 'publish';
    await submit(this.form, async () => {
      const m = this.model();
      const draft: EventDraft = {
        ...m,
        startsAt: new Date(m.startsAt).toISOString(),
        regDeadline: new Date(m.regDeadline).toISOString(),
        categories: m.categories.map((c) => ({
          ...c,
          teamSize: c.type === 'solo' ? 1 : c.teamSize,
        })),
      };
      const existing = this.existing();
      if (existing) {
        const ok = this.run(() => this.domain.updateEvent(existing.id, draft), 'Event updated');
        if (ok) await this.router.navigate(['/events', existing.id]);
      } else {
        let createdId = '';
        const ok = this.run(
          () => (createdId = this.domain.createEvent(draft, publish).id),
          publish ? 'Event published' : 'Draft saved',
          publish ? 'Next: invite schools from the event page.' : undefined,
        );
        if (ok)
          await this.router.navigate(['/events', createdId, publish ? 'invitations' : 'overview']);
      }
    });
  }
}
