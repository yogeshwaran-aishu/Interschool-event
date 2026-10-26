import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  DsAvatar,
  DsButton,
  DsDialog,
  DsIcon,
  DsPreferencesPanel,
  DsToastService,
} from '@isc/design-system';
import { Auth } from '../core/auth';
import { DomainService } from '../core/domain';
import { ROLE_LABEL } from '../core/models';
import { Store } from '../core/store';
import { navFor } from './nav';

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    DsIcon,
    DsButton,
    DsAvatar,
    DsDialog,
    DsPreferencesPanel,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export default class Shell {
  private readonly auth = inject(Auth);
  private readonly domain = inject(DomainService);
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly toast = inject(DsToastService);

  protected readonly user = this.auth.user;
  protected readonly school = this.auth.school;
  protected readonly roleLabel = computed(() => {
    const user = this.user();
    return user ? ROLE_LABEL[user.role] : '';
  });
  protected readonly nav = computed(() => {
    const user = this.user();
    return user ? navFor(user) : [];
  });
  protected readonly bottomNav = computed(() => this.nav().slice(0, 4));
  protected readonly unread = computed(
    () => this.domain.myNotifications().filter((n) => !n.readAt).length,
  );

  protected readonly drawerOpen = signal(false);
  protected readonly prefsOpen = signal(false);

  protected signOut(): void {
    this.auth.logout();
    this.toast.clear();
    this.router.navigateByUrl('/login');
  }

  protected resetDemo(): void {
    this.store.reset();
    this.prefsOpen.set(false);
    this.toast.success(
      'Demo data reset',
      'All schools, events and applications are back to their starting state.',
    );
  }
}
