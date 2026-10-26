import { Directive, input } from '@angular/core';

export type DsButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger';
export type DsButtonSize = 'md' | 'lg' | 'icon';

/** Applies design-system button styling to a native `<button>` or `<a>`. */
@Directive({
  selector: 'button[dsButton], a[dsButton]',
  host: {
    class: 'ds-button',
    '[class.ds-button--primary]': "variant() === 'primary'",
    '[class.ds-button--soft]': "variant() === 'soft'",
    '[class.ds-button--ghost]': "variant() === 'ghost'",
    '[class.ds-button--danger]': "variant() === 'danger'",
    '[class.ds-button--lg]': "size() === 'lg'",
    '[class.ds-button--icon]': "size() === 'icon'",
    '[class.ds-button--block]': 'block()',
  },
})
export class DsButton {
  readonly variant = input<DsButtonVariant, DsButtonVariant | ''>('secondary', {
    alias: 'dsButton',
    transform: toVariant,
  });
  readonly size = input<DsButtonSize>('md');
  readonly block = input(false);
}

function toVariant(value: DsButtonVariant | '' | undefined): DsButtonVariant {
  return value || 'secondary';
}
