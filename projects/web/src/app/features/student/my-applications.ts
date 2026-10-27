import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  DsBadge,
  DsButton,
  DsDialog,
  DsEmptyState,
  DsIcon,
  DsPageHeader,
} from '@isc/design-system';
import { DomainService } from '../../core/domain';
import { HOST_DECISION, SCHOOL_DECISION } from '../../core/labels';
import { injectAction } from '../../shared/action';

@Component({
  selector: 'app-my-applications',
  imports: [RouterLink, DatePipe, DsPageHeader, DsBadge, DsButton, DsIcon, DsDialog, DsEmptyState],
  template: `
    <ds-page-header
      heading="My applications"
      eyebrow="Student"
      lede="Each application goes to your school first, then — if approved — to the host school."
    >
      <a dsButton routerLink="/explore"><ds-icon name="trophy" /> Explore events</a>
    </ds-page-header>

    @if (rows().length) {
      <div class="ds-table-wrap">
        <table class="ds-table ds-table--stack">
          <caption class="ds-visually-hidden">
            Your applications
          </caption>
          <thead>
            <tr>
              <th scope="col">Event</th>
              <th scope="col">Category</th>
              <th scope="col">Your school</th>
              <th scope="col">Host</th>
              <th scope="col"><span class="ds-visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.reg.id) {
              <tr>
                <td data-label="Event">
                  <strong>{{ r.event.title }}</strong
                  ><br />
                  <span class="ds-muted">{{ r.event.startsAt | date: 'd MMM y' }}</span>
                </td>
                <td data-label="Category">{{ r.category.name }}</td>
                <td data-label="Your school">
                  <ds-badge [tone]="school[r.reg.schoolStatus].tone">{{
                    school[r.reg.schoolStatus].label
                  }}</ds-badge>
                </td>
                <td data-label="Host">
                  @if (r.reg.schoolStatus === 'approved') {
                    <ds-badge [tone]="host[r.reg.hostStatus].tone">{{
                      host[r.reg.hostStatus].label
                    }}</ds-badge>
                  } @else {
                    <span class="ds-muted">—</span>
                  }
                </td>
                <td data-label="Actions">
                  @if (r.canWithdraw) {
                    <button
                      dsButton="ghost"
                      type="button"
                      (click)="
                        withdrawing.set({
                          id: r.reg.id,
                          label: r.category.name + ', ' + r.event.title,
                        })
                      "
                    >
                      Withdraw<span class="ds-visually-hidden"> from {{ r.category.name }}</span>
                    </button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <ds-empty-state
        heading="No applications yet"
        message="Find an event that fits you and apply — your school takes it from there."
        icon="file-text"
      >
        <a dsButton="primary" routerLink="/explore">Explore events</a>
      </ds-empty-state>
    }

    <ds-dialog
      [open]="!!withdrawing()"
      (openChange)="!$event && withdrawing.set(null)"
      heading="Withdraw this application?"
      [description]="
        'You are withdrawing from ' +
        (withdrawing()?.label ?? '') +
        '. You can apply again before the deadline.'
      "
    >
      <div dsDialogFooter>
        <button dsButton type="button" (click)="withdrawing.set(null)">Keep application</button>
        <button dsButton="danger" type="button" (click)="withdraw()">Withdraw</button>
      </div>
    </ds-dialog>
  `,
})
export default class MyApplications {
  private readonly domain = inject(DomainService);
  private readonly run = injectAction();
  protected readonly school = SCHOOL_DECISION;
  protected readonly host = HOST_DECISION;
  protected readonly withdrawing = signal<{ id: string; label: string } | null>(null);

  protected readonly rows = computed(() =>
    this.domain
      .myRegistrations()
      .map((reg) => {
        const category = this.domain.db.categories.find((c) => c.id === reg.categoryId)!;
        const event = this.domain.event(category.eventId)!;
        return {
          reg,
          category,
          event,
          canWithdraw:
            (reg.schoolStatus === 'applied' || reg.schoolStatus === 'approved') &&
            !this.domain.isPastDeadline(event) &&
            event.status === 'open',
        };
      })
      .sort((a, b) => b.reg.appliedAt.localeCompare(a.reg.appliedAt)),
  );

  protected async withdraw(): Promise<void> {
    const target = this.withdrawing();
    if (!target) return;
    this.withdrawing.set(null);
    await this.run(() => this.domain.withdraw(target.id), 'Application withdrawn');
  }
}
