import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { DsControl, DsEmptyState, DsField, DsPageHeader } from '@isc/design-system';
import { Auth } from '../../core/auth';
import { DomainService } from '../../core/domain';

const PAGE = 25;

@Component({
  selector: 'app-audit-log',
  imports: [DatePipe, DsPageHeader, DsField, DsControl, DsEmptyState],
  template: `
    <ds-page-header
      heading="Audit log"
      eyebrow="Accountability"
      [lede]="
        isAppAdmin()
          ? 'Every invitation, approval and edit across the platform. Append-only.'
          : 'Every invitation, approval and edit at your school. Append-only.'
      "
    />

    <div class="toolbar">
      <ds-field label="Filter by action" hint="For example: invitation, registration, event">
        <input
          dsControl
          type="search"
          [value]="query()"
          (input)="query.set($any($event.target).value); limit.set(${PAGE})"
        />
      </ds-field>
      <p class="ds-muted" aria-live="polite">
        {{ entries().length }} entr{{ entries().length === 1 ? 'y' : 'ies' }}
      </p>
    </div>

    @if (entries().length) {
      <div class="ds-table-wrap">
        <table class="ds-table ds-table--stack">
          <caption class="ds-visually-hidden">
            Audit entries, newest first
          </caption>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Who</th>
              <th scope="col">Action</th>
              <th scope="col">Record</th>
              @if (isAppAdmin()) {
                <th scope="col">School</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (a of visible(); track a.id) {
              <tr>
                <td data-label="When">
                  <time [attr.datetime]="a.at">{{ a.at | date: 'd MMM y, h:mm a' }}</time>
                </td>
                <td data-label="Who">{{ actor(a.actorId) }}</td>
                <td data-label="Action">
                  <code>{{ a.action }}</code>
                </td>
                <td data-label="Record">
                  {{ a.entity }} <span class="ds-muted">{{ a.entityId }}</span>
                </td>
                @if (isAppAdmin()) {
                  <td data-label="School">{{ domain.school(a.schoolId)?.name ?? '—' }}</td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (entries().length > visible().length) {
        <div class="ds-cluster" style="justify-content: center; margin-top: var(--ds-space-5)">
          <button class="ds-button" type="button" (click)="limit.set(limit() + ${PAGE})">
            Show more ({{ entries().length - visible().length }} remaining)
          </button>
        </div>
      }
    } @else {
      <ds-empty-state heading="No matching entries" icon="history" />
    }
  `,
})
export default class AuditLog {
  protected readonly domain = inject(DomainService);
  private readonly auth = inject(Auth);
  protected readonly isAppAdmin = computed(() => this.auth.user()?.role === 'app_admin');
  protected readonly query = signal('');
  protected readonly limit = signal(PAGE);

  protected readonly entries = computed(() => {
    const me = this.auth.user();
    const q = this.query().trim().toLowerCase();
    return this.domain.db.audit
      .filter((a) => this.isAppAdmin() || a.schoolId === me?.schoolId)
      .filter((a) => !q || a.action.includes(q) || a.entity.toLowerCase().includes(q))
      .sort((a, b) => b.at.localeCompare(a.at));
  });
  protected readonly visible = computed(() => this.entries().slice(0, this.limit()));

  protected actor(id: string): string {
    const user = this.domain.user(id);
    return user ? user.name : 'System';
  }
}
