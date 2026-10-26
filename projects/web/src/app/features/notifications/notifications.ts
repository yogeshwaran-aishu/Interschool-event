import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DsButton, DsCard, DsEmptyState, DsIcon, DsPageHeader } from '@isc/design-system';
import { DomainService } from '../../core/domain';
import { AppNotification } from '../../core/models';

const CHANNEL: Record<AppNotification['channels'][number], string> = {
  in_app: 'In app',
  email: 'Email',
  guardian_email: 'Email to guardian',
  digest: 'Daily digest',
};

@Component({
  selector: 'app-notifications',
  imports: [RouterLink, DatePipe, DsPageHeader, DsCard, DsButton, DsIcon, DsEmptyState],
  template: `
    <ds-page-header
      heading="Notifications"
      eyebrow="Inbox"
      lede="Updates about your events, invitations and applications."
    >
      <button dsButton type="button" [disabled]="!unread()" (click)="domain.markAllRead()">
        <ds-icon name="check" /> Mark all as read
      </button>
    </ds-page-header>

    @if (items().length) {
      <ds-card [flush]="true">
        <ul class="list">
          @for (n of items(); track n.id) {
            <li class="item" [class.item--unread]="!n.readAt">
              <span class="item__dot" aria-hidden="true"></span>
              <div class="item__body">
                <p class="item__title">
                  @if (!n.readAt) {
                    <span class="ds-visually-hidden">Unread: </span>
                  }
                  @if (n.link) {
                    <a [routerLink]="n.link">{{ n.title }}</a>
                  } @else {
                    {{ n.title }}
                  }
                </p>
                <p>{{ n.body }}</p>
                <p class="ds-muted item__meta">
                  <time [attr.datetime]="n.createdAt">{{
                    n.createdAt | date: 'd MMM y, h:mm a'
                  }}</time>
                  · Sent by {{ channels(n) }}
                </p>
              </div>
            </li>
          }
        </ul>
      </ds-card>
    } @else {
      <ds-empty-state
        heading="No notifications"
        message="You’ll see invitations, approvals and changes here."
        icon="bell"
      />
    }
  `,
  styles: `
    .list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .item {
      display: grid;
      grid-template-columns: 12px 1fr;
      gap: var(--ds-space-3);
      padding: var(--ds-space-4) var(--ds-space-5);
    }
    .item + .item {
      border-top: 1px solid var(--ds-border);
    }
    .item--unread {
      background: color-mix(in srgb, var(--ds-primary-soft) 55%, transparent);
    }
    .item__dot {
      width: 10px;
      height: 10px;
      margin-top: 0.55em;
      border-radius: 50%;
    }
    .item--unread .item__dot {
      background: var(--ds-primary);
    }
    .item__body {
      display: grid;
      gap: var(--ds-space-1);
    }
    .item__title {
      font-weight: 700;
    }
    .item__meta {
      font-size: var(--ds-fs-xs);
    }
  `,
})
export default class Notifications {
  protected readonly domain = inject(DomainService);
  protected readonly items = computed(() => this.domain.myNotifications());
  protected readonly unread = computed(() => this.items().filter((n) => !n.readAt).length);

  protected channels(n: AppNotification): string {
    return n.channels.map((c) => CHANNEL[c]).join(', ');
  }
}
