import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { DsBadge, DsButton, DsCard, DsEmptyState, DsIcon, DsPageHeader } from '@isc/design-system';
import { DomainService } from '../../core/domain';
import { SCHOOL_DECISION, classRange } from '../../core/labels';
import { injectAction } from '../../shared/action';

@Component({
  selector: 'app-explore',
  imports: [DatePipe, DsPageHeader, DsCard, DsBadge, DsButton, DsIcon, DsEmptyState],
  template: `
    <ds-page-header
      heading="Explore events"
      eyebrow="Open to you"
      lede="Competitions your school has joined, showing only the categories you are eligible for. Your school approves each application."
    />

    @for (item of items(); track item.event.id) {
      <ds-card class="event">
        <div class="event__head">
          <div class="event__date" aria-hidden="true">
            <span>{{ item.event.startsAt | date: 'MMM' }}</span
            ><strong>{{ item.event.startsAt | date: 'd' }}</strong>
          </div>
          <div class="event__info">
            <p class="ds-eyebrow">Hosted by {{ domain.school(item.event.hostSchoolId)?.name }}</p>
            <h2 class="event__title">{{ item.event.title }}</h2>
            <ul class="meta-list">
              <li><ds-icon name="map-pin" /> {{ item.event.venue }}</li>
              <li>
                <ds-icon name="clock" /> Apply by
                {{ item.event.regDeadline | date: 'EEE d MMM, h:mm a' }}
              </li>
            </ul>
          </div>
        </div>
        @if (item.event.description) {
          <p class="event__desc">{{ item.event.description }}</p>
        }
        @if (item.closed) {
          <div class="ds-callout ds-callout--warning">
            <ds-icon name="lock" />
            <p>Applications are closed for this event.</p>
          </div>
        }
        <ul class="cats" [attr.aria-label]="'Categories in ' + item.event.title">
          @for (c of item.categories; track c.category.id) {
            <li class="cat">
              <div>
                <h3 class="cat__name">{{ c.category.name }}</h3>
                <p class="ds-muted cat__meta">
                  {{ classRange(c.category.minClass, c.category.maxClass) }} ·
                  {{ c.category.type === 'team' ? 'Team of ' + c.category.teamSize : 'Individual' }}
                  · your school can send up to {{ c.category.maxPerSchool }}
                </p>
              </div>
              @if (c.reg && c.reg.schoolStatus !== 'withdrawn') {
                <ds-badge [tone]="decision[c.reg.schoolStatus].tone">{{
                  decision[c.reg.schoolStatus].label
                }}</ds-badge>
              } @else if (!item.closed) {
                <button
                  dsButton="primary"
                  type="button"
                  (click)="apply(item.event.id, c.category.id, c.category.name)"
                >
                  Apply<span class="ds-visually-hidden"> for {{ c.category.name }}</span>
                </button>
              }
            </li>
          }
        </ul>
      </ds-card>
    } @empty {
      <ds-empty-state
        heading="No events open to you yet"
        message="When your school accepts an invitation with a category that fits your class, it will show up here."
        icon="trophy"
      />
    }
  `,
  styles: `
    .event {
      display: grid;
      gap: var(--ds-space-4);
      margin-bottom: var(--ds-space-5);
    }
    .event__head {
      display: flex;
      gap: var(--ds-space-4);
      align-items: flex-start;
    }
    .event__date {
      display: grid;
      place-items: center;
      flex: none;
      width: 64px;
      height: 70px;
      border-radius: var(--ds-radius-md);
      background: var(--ds-gradient-brand);
      color: #ffffff;
      line-height: 1.1;
    }
    .event__date span {
      font-size: var(--ds-fs-xs);
      font-weight: 700;
      text-transform: uppercase;
    }
    .event__date strong {
      font-size: var(--ds-fs-xl);
    }
    .event__info {
      display: grid;
      gap: var(--ds-space-2);
    }
    .event__title {
      font-size: var(--ds-fs-xl);
    }
    .cats {
      display: grid;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .cat {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ds-space-3);
      padding: var(--ds-space-3) 0;
      border-top: 1px solid var(--ds-border);
    }
    .cat__name {
      font-size: var(--ds-fs-md);
    }
    .cat__meta {
      font-size: var(--ds-fs-sm);
    }
  `,
})
export default class Explore {
  protected readonly domain = inject(DomainService);
  private readonly run = injectAction();
  protected readonly decision = SCHOOL_DECISION;
  protected readonly classRange = classRange;

  protected readonly items = computed(() => {
    const regs = this.domain.myRegistrations();
    return this.domain.openEventsForStudent().map(({ event, categories }) => ({
      event,
      closed: event.status !== 'open' || this.domain.isPastDeadline(event),
      categories: categories.map((category) => ({
        category,
        reg: regs.find((r) => r.categoryId === category.id),
      })),
    }));
  });

  protected apply(eventId: string, categoryId: string, name: string): void {
    this.run(
      () => this.domain.apply(eventId, categoryId),
      `Applied for ${name}`,
      'Your school will review your application. You’ll be notified of the decision.',
    );
  }
}
