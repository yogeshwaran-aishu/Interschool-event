import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  DsBadge,
  DsButton,
  DsCard,
  DsControl,
  DsDialog,
  DsEmptyState,
  DsField,
  DsIcon,
  DsPageHeader,
} from '@isc/design-system';
import { Auth } from '../../core/auth';
import { DomainService } from '../../core/domain';
import { Exporter } from '../../core/export';
import { EVENT_STATUS, HOST_DECISION, INVITATION_STATUS, classRange } from '../../core/labels';
import { injectAction } from '../../shared/action';

type Tab = 'overview' | 'invitations' | 'nominations';

@Component({
  selector: 'app-event-detail',
  imports: [
    RouterLink,
    DatePipe,
    DsPageHeader,
    DsCard,
    DsBadge,
    DsButton,
    DsIcon,
    DsDialog,
    DsField,
    DsControl,
    DsEmptyState,
  ],
  templateUrl: './event-detail.html',
  styleUrl: './event-detail.scss',
})
export default class EventDetail {
  readonly id = input.required<string>();
  readonly tab = input<Tab, string | undefined>('overview', {
    transform: (v) => (v === 'invitations' || v === 'nominations' ? v : 'overview'),
  });

  protected readonly domain = inject(DomainService);
  private readonly auth = inject(Auth);
  private readonly exporter = inject(Exporter);
  private readonly run = injectAction();

  protected readonly eventStatus = EVENT_STATUS;
  protected readonly invitationStatus = INVITATION_STATUS;
  protected readonly hostDecision = HOST_DECISION;
  protected readonly classRange = classRange;
  protected readonly tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'invitations', label: 'Invitations' },
    { id: 'nominations', label: 'Nominations' },
  ];

  protected readonly event = computed(() => {
    const e = this.domain.event(this.id());
    return e && this.domain.isHostStaff(e) ? e : undefined;
  });
  protected readonly isAdmin = computed(() => this.auth.user()?.role === 'school_admin');
  protected readonly categories = computed(() => this.domain.categoriesOf(this.id()));
  protected readonly invitations = computed(() =>
    this.domain
      .invitationsOf(this.id())
      .map((i) => ({ ...i, school: this.domain.school(i.guestSchoolId)?.name ?? '' })),
  );
  protected readonly editable = computed(() => {
    const s = this.event()?.status;
    return s === 'draft' || s === 'open' || s === 'closed';
  });
  protected readonly canInvite = computed(() => {
    const e = this.event();
    return !!e && e.status === 'open' && !this.domain.isPastDeadline(e);
  });
  protected readonly teachers = computed(() =>
    this.domain.db.users.filter(
      (u) => u.role === 'teacher' && u.schoolId === this.event()?.hostSchoolId,
    ),
  );

  // Nominations
  protected readonly schoolFilter = signal('');
  protected readonly categoryFilter = signal('');
  protected readonly nominations = computed(() =>
    this.domain
      .hostNominations(this.id())
      .filter((n) => !this.schoolFilter() || n.schoolName === this.schoolFilter())
      .filter((n) => !this.categoryFilter() || n.categoryName === this.categoryFilter())
      .sort(
        (a, b) =>
          a.schoolName.localeCompare(b.schoolName) || a.categoryName.localeCompare(b.categoryName),
      ),
  );
  protected readonly nominationSchools = computed(() =>
    [...new Set(this.domain.hostNominations(this.id()).map((n) => n.schoolName))].sort(),
  );
  protected readonly confirmedCount = computed(
    () => this.domain.hostNominations(this.id()).filter((n) => n.hostStatus === 'confirmed').length,
  );

  // Dialogs
  protected readonly inviteOpen = signal(false);
  protected readonly selectedSchools = signal<string[]>([]);
  protected readonly invitable = computed(() => {
    const invited = new Set(this.domain.invitationsOf(this.id()).map((i) => i.guestSchoolId));
    return this.domain.db.schools.filter(
      (s) => s.status === 'active' && s.id !== this.event()?.hostSchoolId && !invited.has(s.id),
    );
  });
  protected readonly cancelOpen = signal(false);
  protected readonly cancelReason = signal('');
  protected readonly cancelError = signal<string | null>(null);
  protected readonly coordOpen = signal(false);
  protected readonly selectedCoords = signal<string[]>([]);

  protected toggle(list: ReturnType<typeof signal<string[]>>, id: string, checked: boolean): void {
    list.update((ids) => (checked ? [...ids, id] : ids.filter((x) => x !== id)));
  }

  protected openInvite(): void {
    this.selectedSchools.set([]);
    this.inviteOpen.set(true);
  }

  protected async sendInvites(): Promise<void> {
    const ok = await this.run(
      () => this.domain.inviteSchools(this.id(), this.selectedSchools()),
      (n) => `${n} invitation(s) sent`,
      'School admins are notified in the app and by email.',
    );
    if (ok) this.inviteOpen.set(false);
  }

  protected async revoke(invitationId: string, school: string): Promise<void> {
    await this.run(
      () => this.domain.revokeInvitation(invitationId),
      `Invitation to ${school} revoked`,
    );
  }

  protected async publish(): Promise<void> {
    await this.run(
      () => this.domain.publishEvent(this.id()),
      'Event published',
      'You can now invite schools.',
    );
  }

  protected async confirmCancel(): Promise<void> {
    if (!this.cancelReason().trim()) {
      this.cancelError.set('Give a reason so schools and students understand why.');
      return;
    }
    const ok = await this.run(
      () => this.domain.cancelEvent(this.id(), this.cancelReason()),
      'Event cancelled',
      'Every school and applied student has been notified.',
    );
    if (ok) this.cancelOpen.set(false);
  }

  protected openCoordinators(): void {
    this.selectedCoords.set([...(this.event()?.coordinatorIds ?? [])]);
    this.coordOpen.set(true);
  }

  protected async saveCoordinators(): Promise<void> {
    const ok = await this.run(
      () => this.domain.assignEventCoordinators(this.id(), this.selectedCoords()),
      'Coordinators updated',
    );
    if (ok) this.coordOpen.set(false);
  }

  protected async decide(registrationId: string, confirm: boolean, name: string): Promise<void> {
    await this.run(
      () => this.domain.decideNomination(registrationId, confirm),
      confirm ? `${name} confirmed` : `${name} not accepted`,
    );
  }

  protected coordinatorNames(): string {
    return (
      (this.event()?.coordinatorIds ?? [])
        .map((id) => this.domain.user(id)?.name)
        .filter(Boolean)
        .join(', ') || 'None assigned'
    );
  }

  private exportRows(): (string | number)[][] {
    const rows = this.domain.hostNominations(this.id()).filter((n) => n.hostStatus === 'confirmed');
    return [
      ['School', 'Category', 'Student', 'Class'],
      ...rows.map((n) => [n.schoolName, n.categoryName, n.studentName, n.className]),
    ];
  }

  /** The server builds the CSV (and audits the export); the browser saves it. */
  protected async exportCsv(): Promise<void> {
    const e = this.event()!;
    await this.run(async () => {
      const { blob, filename } = await this.domain.exportParticipants(e.id);
      this.exporter.saveBlob(
        filename ?? `${e.title.replace(/\W+/g, '-').toLowerCase()}-participants.csv`,
        blob,
      );
    });
  }

  protected exportPdf(): void {
    this.exporter.printTable(`${this.event()!.title} — confirmed participants`, this.exportRows());
  }
}
