import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  DsBadge,
  DsButton,
  DsCard,
  DsDialog,
  DsEmptyState,
  DsIcon,
  DsMeter,
  DsPageHeader,
} from '@isc/design-system';
import { Auth } from '../../core/auth';
import { DomainService } from '../../core/domain';
import { HOST_DECISION, SCHOOL_DECISION, classRange } from '../../core/labels';
import { injectAction } from '../../shared/action';

@Component({
  selector: 'app-approval-detail',
  imports: [
    RouterLink,
    DatePipe,
    DsPageHeader,
    DsCard,
    DsBadge,
    DsButton,
    DsIcon,
    DsMeter,
    DsDialog,
    DsEmptyState,
  ],
  templateUrl: './approval-detail.html',
  styleUrl: './approval-detail.scss',
})
export default class ApprovalDetail {
  readonly invitationId = input.required<string>();

  protected readonly domain = inject(DomainService);
  private readonly auth = inject(Auth);
  private readonly run = injectAction();
  protected readonly schoolDecision = SCHOOL_DECISION;
  protected readonly hostDecision = HOST_DECISION;
  protected readonly classRange = classRange;

  protected readonly invitation = computed(() => {
    const inv = this.domain.db.invitations.find((i) => i.id === this.invitationId());
    return inv && this.domain.isGuestStaff(inv) && inv.status === 'accepted' ? inv : undefined;
  });
  protected readonly event = computed(() =>
    this.invitation() ? this.domain.event(this.invitation()!.eventId) : undefined,
  );
  protected readonly locked = computed(() => {
    const e = this.event();
    return !e || e.status !== 'open' || this.domain.isPastDeadline(e);
  });
  protected readonly isAdmin = computed(() => this.auth.user()?.role === 'school_admin');
  protected readonly teachers = computed(() =>
    this.domain.db.users.filter(
      (u) => u.role === 'teacher' && u.schoolId === this.auth.user()?.schoolId,
    ),
  );

  protected readonly groups = computed(() => {
    const inv = this.invitation();
    if (!inv) return [];
    const regs = this.domain.registrationsOf(inv.id);
    return this.domain.categoriesOf(inv.eventId).map((category) => ({
      category,
      approved: this.domain.approvedCount(inv.id, category.id),
      rows: regs
        .filter((r) => r.categoryId === category.id && r.schoolStatus !== 'withdrawn')
        .map((r) => ({
          reg: r,
          user: this.domain.user(r.studentId)!,
          profile: this.domain.profile(r.studentId)!,
        }))
        .sort((a, b) => a.reg.appliedAt.localeCompare(b.reg.appliedAt)),
    }));
  });
  protected readonly unsent = computed(
    () =>
      this.groups()
        .flatMap((g) => g.rows)
        .filter((r) => r.reg.schoolStatus === 'approved' && r.reg.hostStatus === 'not_submitted')
        .length,
  );

  protected readonly submitOpen = signal(false);
  protected readonly coordOpen = signal(false);
  protected readonly selectedCoords = signal<string[]>([]);

  protected decide(registrationId: string, approve: boolean, name: string): void {
    this.run(
      () => this.domain.decideApplication(registrationId, approve),
      approve ? `${name} approved` : `${name} not approved`,
    );
  }

  protected submit(): void {
    const ok = this.run(
      () => this.domain.submitNominations(this.invitationId()),
      (n) => `${n} nomination(s) sent to the host`,
      'The host will confirm each one. Students are notified of the result.',
    );
    if (ok) this.submitOpen.set(false);
  }

  protected openCoordinators(): void {
    this.selectedCoords.set([...(this.invitation()?.coordinatorIds ?? [])]);
    this.coordOpen.set(true);
  }

  protected toggleCoord(id: string, checked: boolean): void {
    this.selectedCoords.update((ids) => (checked ? [...ids, id] : ids.filter((x) => x !== id)));
  }

  protected saveCoordinators(): void {
    const ok = this.run(
      () => this.domain.assignInvitationCoordinators(this.invitationId(), this.selectedCoords()),
      'Reviewers updated',
    );
    if (ok) this.coordOpen.set(false);
  }
}
