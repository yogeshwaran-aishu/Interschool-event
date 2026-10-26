import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DsBadge, DsCard, DsEmptyState, DsIcon, DsPageHeader } from '@isc/design-system';
import { DomainService } from '../../core/domain';

@Component({
  selector: 'app-approval-list',
  imports: [RouterLink, DatePipe, DsPageHeader, DsCard, DsBadge, DsIcon, DsEmptyState],
  template: `
    <ds-page-header
      heading="Approvals"
      eyebrow="Your students"
      lede="Events your school accepted. Approve who represents you within each category’s limit, then send the list to the host."
    />
    @if (items().length) {
      <ul class="ds-grid list" role="list">
        @for (item of items(); track item.invitation.id) {
          <li>
            <ds-card [interactive]="true" class="card">
              <p class="ds-eyebrow">Hosted by {{ item.host }}</p>
              <h2 class="card__title">
                <a [routerLink]="['/approvals', item.invitation.id]" class="card__link">{{
                  item.event.title
                }}</a>
              </h2>
              <ul class="meta-list">
                <li>
                  <ds-icon name="clock" /> {{ item.locked ? 'Locked since' : 'Locks' }}
                  {{ item.event.regDeadline | date: 'd MMM, h:mm a' }}
                </li>
              </ul>
              <div class="ds-cluster">
                <ds-badge [tone]="item.toReview ? 'warning' : 'neutral'"
                  >{{ item.toReview }} to review</ds-badge
                >
                <ds-badge tone="success">{{ item.approved }} approved</ds-badge>
                @if (item.unsent) {
                  <ds-badge tone="info">{{ item.unsent }} not yet sent</ds-badge>
                }
                @if (item.locked) {
                  <ds-badge tone="neutral">Locked</ds-badge>
                }
              </div>
            </ds-card>
          </li>
        }
      </ul>
    } @else {
      <ds-empty-state
        heading="Nothing to review"
        message="Applications appear here once your school accepts an invitation and students apply."
        icon="clipboard"
      />
    }
  `,
  styles: `
    .list {
      --ds-grid-min: 320px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .card {
      position: relative;
      display: grid;
      gap: var(--ds-space-3);
      height: 100%;
    }
    .card__title {
      font-size: var(--ds-fs-lg);
    }
    .card__link {
      color: var(--ds-text);
      text-decoration: none;
    }
    .card__link::after {
      content: '';
      position: absolute;
      inset: 0;
    }
    .card__link:hover {
      text-decoration: underline;
    }
  `,
})
export default class ApprovalList {
  private readonly domain = inject(DomainService);

  protected readonly items = computed(() =>
    this.domain
      .receivedInvitations()
      .filter((i) => i.status === 'accepted')
      .map((invitation) => {
        const event = this.domain.event(invitation.eventId)!;
        const regs = this.domain.registrationsOf(invitation.id);
        return {
          invitation,
          event,
          host: this.domain.school(event.hostSchoolId)?.name ?? '',
          toReview: regs.filter((r) => r.schoolStatus === 'applied').length,
          approved: regs.filter((r) => r.schoolStatus === 'approved').length,
          unsent: regs.filter(
            (r) => r.schoolStatus === 'approved' && r.hostStatus === 'not_submitted',
          ).length,
          locked: this.domain.isPastDeadline(event) || event.status !== 'open',
        };
      }),
  );
}
