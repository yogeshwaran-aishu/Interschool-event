import { Component, computed, input } from '@angular/core';
import { DsIcon, DsIconName } from '../icon/icon';

let nextMeterId = 0;

@Component({
  selector: 'ds-stat',
  imports: [DsIcon],
  template: `
    <div class="ds-stat__icon"><ds-icon [name]="icon()" /></div>
    <p class="ds-stat__value">{{ value() }}</p>
    <p class="ds-stat__label">{{ label() }}</p>
    <ng-content />
  `,
  host: {
    '[class]': "'ds-card ds-stat ds-stat--' + tone()",
  },
})
export class DsStat {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly icon = input<DsIconName>('sparkles');
  readonly tone = input<'primary' | 'accent' | 'warning' | 'success'>('primary');
}

@Component({
  selector: 'ds-empty-state',
  imports: [DsIcon],
  template: `
    <div class="ds-empty__icon"><ds-icon [name]="icon()" /></div>
    @if (level() === 2) {
      <h2 class="ds-empty__title">{{ heading() }}</h2>
    } @else {
      <h3 class="ds-empty__title">{{ heading() }}</h3>
    }
    @if (message()) {
      <p>{{ message() }}</p>
    }
    <ng-content />
  `,
  host: { class: 'ds-empty' },
})
export class DsEmptyState {
  readonly heading = input.required<string>();
  readonly message = input<string>();
  readonly icon = input<DsIconName>('inbox');
  /** Heading level, so the outline stays in order: 2 directly under the page title, 3 inside a section. */
  readonly level = input<2 | 3>(2);
}

@Component({
  selector: 'ds-page-header',
  template: `
    <div class="ds-page-header__text">
      @if (eyebrow()) {
        <p class="ds-eyebrow">{{ eyebrow() }}</p>
      }
      <h1 tabindex="-1" data-page-heading>{{ heading() }}</h1>
      @if (lede()) {
        <p class="ds-page-header__lede">{{ lede() }}</p>
      }
    </div>
    <div class="ds-cluster"><ng-content /></div>
  `,
  host: { class: 'ds-page-header' },
})
export class DsPageHeader {
  readonly heading = input.required<string>();
  readonly eyebrow = input<string>();
  readonly lede = input<string>();
}

/** Labelled progress meter, e.g. approvals used against a per-school quota. */
@Component({
  selector: 'ds-meter',
  template: `
    <div class="ds-cluster" style="justify-content: space-between; font-size: var(--ds-fs-sm)">
      <span [id]="labelId">{{ label() }}</span>
      <span aria-hidden="true"
        ><strong>{{ value() }}</strong> / {{ max() }}</span
      >
    </div>
    <div
      class="ds-meter__track"
      role="meter"
      [attr.aria-labelledby]="labelId"
      [attr.aria-valuenow]="value()"
      aria-valuemin="0"
      [attr.aria-valuemax]="max()"
      [attr.aria-valuetext]="value() + ' of ' + max()"
    >
      <div class="ds-meter__fill" [style.width.%]="percent()"></div>
    </div>
  `,
  host: {
    class: 'ds-meter',
    '[class.ds-meter--full]': 'value() >= max()',
  },
})
export class DsMeter {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly max = input.required<number>();
  protected readonly labelId = `ds-meter-${nextMeterId++}`;
  protected readonly percent = computed(() =>
    this.max() ? Math.min(100, (this.value() / this.max()) * 100) : 0,
  );
}

@Component({
  selector: 'ds-avatar',
  template: '{{ initials() }}',
  host: {
    class: 'ds-avatar',
    'aria-hidden': 'true',
    '[style.--ds-avatar-size.px]': 'size()',
  },
})
export class DsAvatar {
  readonly name = input.required<string>();
  readonly size = input(40);
  protected readonly initials = computed(() =>
    this.name()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(''),
  );
}
