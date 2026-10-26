import { Component, input } from '@angular/core';

export type DsTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

/** Status pill. Colour is never the only signal: the label text always carries the meaning. */
@Component({
  selector: 'ds-badge',
  template: '<ng-content />',
  host: {
    '[class]': "'ds-badge ds-badge--' + tone()",
  },
})
export class DsBadge {
  readonly tone = input<DsTone>('neutral');
}
