import { Component, inject } from '@angular/core';
import { DsIcon, DsIconName } from '../icon/icon';
import { DsMotion, DsPreferencesService, DsTextSize, DsThemeMode } from './preferences';

interface Choice<T> {
  value: T;
  label: string;
  icon: DsIconName;
}

let nextId = 0;

/** Radio-group controls for theme, motion and text size. */
@Component({
  selector: 'ds-preferences-panel',
  imports: [DsIcon],
  template: `
    <div class="ds-stack" style="--ds-stack-gap: var(--ds-space-5)">
      <fieldset
        class="ds-stack"
        style="--ds-stack-gap: var(--ds-space-2); border: 0; padding: 0; margin: 0"
      >
        <legend class="ds-field__label">Theme</legend>
        <div class="ds-segmented">
          @for (c of themes; track c.value) {
            <label>
              <input
                type="radio"
                [name]="uid + '-theme'"
                [value]="c.value"
                [checked]="prefs.preferences().theme === c.value"
                (change)="prefs.set('theme', c.value)"
              />
              <ds-icon [name]="c.icon" />{{ c.label }}
            </label>
          }
        </div>
      </fieldset>
      <fieldset
        class="ds-stack"
        style="--ds-stack-gap: var(--ds-space-2); border: 0; padding: 0; margin: 0"
      >
        <legend class="ds-field__label">Motion</legend>
        <div class="ds-segmented">
          @for (c of motions; track c.value) {
            <label>
              <input
                type="radio"
                [name]="uid + '-motion'"
                [value]="c.value"
                [checked]="prefs.preferences().motion === c.value"
                (change)="prefs.set('motion', c.value)"
              />
              <ds-icon [name]="c.icon" />{{ c.label }}
            </label>
          }
        </div>
      </fieldset>
      <fieldset
        class="ds-stack"
        style="--ds-stack-gap: var(--ds-space-2); border: 0; padding: 0; margin: 0"
      >
        <legend class="ds-field__label">Text size</legend>
        <div class="ds-segmented">
          @for (c of sizes; track c.value) {
            <label>
              <input
                type="radio"
                [name]="uid + '-text'"
                [value]="c.value"
                [checked]="prefs.preferences().text === c.value"
                (change)="prefs.set('text', c.value)"
              />
              <ds-icon [name]="c.icon" />{{ c.label }}
            </label>
          }
        </div>
      </fieldset>
    </div>
  `,
})
export class DsPreferencesPanel {
  protected readonly prefs = inject(DsPreferencesService);
  protected readonly uid = `ds-prefs-${nextId++}`;

  protected readonly themes: Choice<DsThemeMode>[] = [
    { value: 'light', label: 'Light', icon: 'sun' },
    { value: 'dark', label: 'Dark', icon: 'moon' },
    { value: 'system', label: 'System', icon: 'monitor' },
  ];
  protected readonly motions: Choice<DsMotion>[] = [
    { value: 'system', label: 'System', icon: 'monitor' },
    { value: 'reduce', label: 'Reduced', icon: 'ban' },
    { value: 'full', label: 'Full', icon: 'motion' },
  ];
  protected readonly sizes: Choice<DsTextSize>[] = [
    { value: 'default', label: 'Default', icon: 'type' },
    { value: 'large', label: 'Larger', icon: 'type' },
  ];
}
