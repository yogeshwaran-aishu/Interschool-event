import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DsBadge, DsButton, DsCard, DsEmptyState, DsIcon, DsStat } from '@isc/design-system';
import { Auth } from '../../core/auth';
import { DomainService } from '../../core/domain';
import { EVENT_STATUS, INVITATION_STATUS } from '../../core/labels';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DatePipe, DsCard, DsStat, DsBadge, DsButton, DsIcon, DsEmptyState],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export default class Dashboard {
  private readonly auth = inject(Auth);
  protected readonly domain = inject(DomainService);
  protected readonly eventStatus = EVENT_STATUS;
  protected readonly invitationStatus = INVITATION_STATUS;

  protected readonly user = this.auth.user;
  protected readonly school = this.auth.school;
  protected readonly firstName = computed(() => this.user()?.name.split(' ')[0] ?? '');

  // App admin sees counts only — never student personal data.
  protected readonly platform = computed(
    () =>
      this.domain.db.platform ?? {
        activeSchools: 0,
        suspendedSchools: 0,
        liveEvents: 0,
        students: 0,
        registrations: 0,
      },
  );

  protected readonly hosted = computed(() => this.domain.hostedEvents());
  protected readonly received = computed(() => this.domain.receivedInvitations());
  protected readonly pendingInvites = computed(() =>
    this.received().filter((i) => i.status === 'pending'),
  );
  protected readonly toReview = computed(() =>
    this.received()
      .filter((i) => i.status === 'accepted')
      .flatMap((i) => this.domain.registrationsOf(i.id))
      .filter((r) => r.schoolStatus === 'applied'),
  );
  protected readonly awaitingHost = computed(() =>
    this.hosted()
      .flatMap((e) => this.domain.hostNominations(e.id))
      .filter((n) => n.hostStatus === 'pending'),
  );

  protected readonly studentEvents = computed(() => this.domain.openEventsForStudent());
  protected readonly myRegs = computed(() =>
    this.domain.myRegistrations().filter((r) => r.schoolStatus !== 'withdrawn'),
  );
  protected readonly confirmed = computed(() =>
    this.myRegs().filter((r) => r.hostStatus === 'confirmed'),
  );

  protected schoolName(id: string): string {
    return this.domain.school(id)?.name ?? '';
  }

  protected eventTitle(id: string): string {
    return this.domain.event(id)?.title ?? '';
  }

  protected acceptedCount(eventId: string): number {
    return this.domain.invitationsOf(eventId).filter((i) => i.status === 'accepted').length;
  }
}
