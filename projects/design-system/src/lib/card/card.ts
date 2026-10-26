import { Component, input } from '@angular/core';

@Component({
  selector: 'ds-card',
  template: '<ng-content />',
  host: {
    class: 'ds-card',
    '[class.ds-card--interactive]': 'interactive()',
    '[class.ds-card--flush]': 'flush()',
  },
})
export class DsCard {
  readonly interactive = input(false);
  readonly flush = input(false);
}
