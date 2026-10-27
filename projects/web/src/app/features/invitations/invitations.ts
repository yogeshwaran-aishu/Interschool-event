import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
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
import { DomainService } from '../../core/domain';
import { INVITATION_STATUS, classRange } from '../../core/labels';
import { Invitation } from '../../core/models';
import { injectAction } from '../../shared/action';

@Component({
  selector: 'app-invitations',
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
  templateUrl: './invitations.html',
  styleUrl: './invitations.scss',
})
export default class Invitations {
  protected readonly domain = inject(DomainService);
  private readonly run = injectAction();
  protected readonly status = INVITATION_STATUS;
  protected readonly classRange = classRange;

  protected readonly items = computed(() =>
    this.domain
      .receivedInvitations()
      .map((invitation) => {
        const event = this.domain.event(invitation.eventId)!;
        return {
          invitation,
          event,
          host: this.domain.school(event.hostSchoolId)?.name ?? '',
          categories: this.domain.categoriesOf(event.id),
          pastDeadline: this.domain.isPastDeadline(event),
        };
      })
      .sort(
        (a, b) =>
          Number(b.invitation.status === 'pending') - Number(a.invitation.status === 'pending') ||
          a.event.regDeadline.localeCompare(b.event.regDeadline),
      ),
  );
  protected readonly pending = computed(() =>
    this.items().filter((i) => i.invitation.status === 'pending'),
  );
  protected readonly answered = computed(() =>
    this.items().filter((i) => i.invitation.status !== 'pending'),
  );

  protected readonly responding = signal<{
    invitation: Invitation;
    accept: boolean;
    title: string;
  } | null>(null);
  protected readonly note = signal('');

  protected respond(invitation: Invitation, accept: boolean, title: string): void {
    this.note.set('');
    this.responding.set({ invitation, accept, title });
  }

  protected async confirm(): Promise<void> {
    const r = this.responding();
    if (!r) return;
    const ok = await this.run(
      () => this.domain.respondToInvitation(r.invitation.id, r.accept, this.note()),
      r.accept ? `Accepted: ${r.title}` : `Declined: ${r.title}`,
      r.accept
        ? 'Eligible students can now apply. Review their applications under Approvals.'
        : 'The host school has been told.',
    );
    if (ok) this.responding.set(null);
  }
}
