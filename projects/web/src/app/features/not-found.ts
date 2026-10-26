import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DsButton, DsEmptyState, DsIcon, DsPageHeader } from '@isc/design-system';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, DsPageHeader, DsEmptyState, DsButton, DsIcon],
  template: `
    <ds-page-header heading="Page not found" />
    <ds-empty-state
      heading="We couldn’t find that page"
      message="The link may be out of date, or the page belongs to another school."
      icon="search"
    >
      <a dsButton="primary" routerLink="/dashboard"><ds-icon name="home" /> Go to your dashboard</a>
    </ds-empty-state>
  `,
})
export default class NotFound {}
