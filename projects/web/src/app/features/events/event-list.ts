import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DsBadge, DsButton, DsCard, DsEmptyState, DsIcon, DsPageHeader } from '@isc/design-system';
import { DomainService } from '../../core/domain';
import { EVENT_STATUS } from '../../core/labels';

@Component({
  selector: 'app-event-list',
  imports: [RouterLink, DatePipe, DsPageHeader, DsButton, DsIcon, DsCard, DsBadge, DsEmptyState],
  template: `
    <ds-page-header
      heading="Hosted events"
      eyebrow="Host"
      lede="Competitions your school runs. Invite schools, then confirm the nominations they send."
    >
      @if (domain.canHostEvents()) {
        <a dsButton="primary" routerLink="/events/new"><ds-icon name="plus" /> Create event</a>
      }
    </ds-page-header>

    @if (events().length) {
      <ul class="ds-grid cards" role="list">
        @for (e of events(); track e.event.id) {
          <li>
            <ds-card [interactive]="true" class="card">
              <div class="card__top">
                <ds-badge [tone]="status[e.event.status].tone">{{
                  status[e.event.status].label
                }}</ds-badge>
                <span class="ds-muted card__date">{{
                  e.event.startsAt | date: 'EEE d MMM y'
                }}</span>
              </div>
              <h2 class="card__title">
                <a [routerLink]="['/events', e.event.id]" class="card__link">{{ e.event.title }}</a>
              </h2>
              <ul class="meta-list">
                <li><ds-icon name="map-pin" /> {{ e.event.venue }}</li>
                <li><ds-icon name="clock" /> Apply by {{ e.event.regDeadline | date: 'd MMM' }}</li>
              </ul>
              <dl class="card__stats">
                <div>
                  <dt>Invited</dt>
                  <dd>{{ e.invited }}</dd>
                </div>
                <div>
                  <dt>Accepted</dt>
                  <dd>{{ e.accepted }}</dd>
                </div>
                <div>
                  <dt>Nominations</dt>
                  <dd>{{ e.nominations }}</dd>
                </div>
              </dl>
            </ds-card>
          </li>
        }
      </ul>
    } @else {
      <ds-empty-state
        heading="No hosted events yet"
        message="Create an event, add its categories and invite schools."
        icon="calendar"
      >
        @if (domain.canHostEvents()) {
          <a dsButton="primary" routerLink="/events/new"
            ><ds-icon name="plus" /> Create your first event</a
          >
        }
      </ds-empty-state>
    }
  `,
  styles: `
    .cards {
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
    .card__top {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: var(--ds-space-2);
    }
    .card__date {
      font-size: var(--ds-fs-sm);
      font-weight: 600;
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
      border-radius: inherit;
    }
    .card__link:hover {
      text-decoration: underline;
    }
    .card__stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--ds-space-2);
      margin: var(--ds-space-2) 0 0;
      padding-top: var(--ds-space-3);
      border-top: 1px solid var(--ds-border);
    }
    .card__stats dt {
      font-size: var(--ds-fs-xs);
      color: var(--ds-text-muted);
      font-weight: 600;
    }
    .card__stats dd {
      margin: 0;
      font-size: var(--ds-fs-xl);
      font-weight: 800;
    }
  `,
})
export default class EventList {
  protected readonly domain = inject(DomainService);
  protected readonly status = EVENT_STATUS;

  protected readonly events = computed(() =>
    this.domain.hostedEvents().map((event) => {
      const invitations = this.domain.invitationsOf(event.id);
      return {
        event,
        invited: invitations.length,
        accepted: invitations.filter((i) => i.status === 'accepted').length,
        nominations: this.domain.hostNominations(event.id).length,
      };
    }),
  );
}
