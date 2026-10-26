import { Component, Directive, ElementRef, computed, inject, input } from '@angular/core';
import { DsIcon } from '../icon/icon';

let nextId = 0;

/**
 * Labelled form field. Wire the native control with `dsControl`; the field supplies
 * its id, `aria-describedby` (hint + error) and `aria-invalid`.
 *
 * ```html
 * <ds-field label="Email" hint="We send invites here" [error]="emailError()">
 *   <input dsControl type="email" [formField]="form.email" />
 * </ds-field>
 * ```
 */
@Component({
  selector: 'ds-field',
  imports: [DsIcon],
  template: `
    <label class="ds-field__label" [attr.for]="controlId">
      {{ label() }}
      @if (required()) {
        <span class="ds-field__required" aria-hidden="true">*</span>
        <span class="ds-visually-hidden">(required)</span>
      }
    </label>
    @if (hint()) {
      <span class="ds-field__hint" [id]="hintId">{{ hint() }}</span>
    }
    <ng-content />
    @if (error()) {
      <span class="ds-field__error" [id]="errorId">
        <ds-icon name="alert" />
        <span>{{ error() }}</span>
      </span>
    }
  `,
  host: { class: 'ds-field' },
})
export class DsField {
  readonly label = input.required<string>();
  readonly hint = input<string>();
  readonly error = input<string | null | undefined>();
  readonly required = input(false);

  private readonly uid = `ds-field-${nextId++}`;
  readonly controlId = `${this.uid}-control`;
  readonly hintId = `${this.uid}-hint`;
  readonly errorId = `${this.uid}-error`;

  readonly describedBy = computed(
    () =>
      [this.hint() ? this.hintId : null, this.error() ? this.errorId : null]
        .filter(Boolean)
        .join(' ') || null,
  );
}

@Directive({
  selector: 'input[dsControl], select[dsControl], textarea[dsControl]',
  host: {
    '[id]': 'field?.controlId ?? null',
    '[attr.aria-describedby]': 'field?.describedBy() ?? null',
    '[attr.aria-invalid]': 'field?.error() ? "true" : null',
    '[attr.aria-required]': 'field?.required() ? "true" : null',
    '[class.ds-input]': 'kind === "input"',
    '[class.ds-select]': 'kind === "select"',
    '[class.ds-textarea]': 'kind === "textarea"',
  },
})
export class DsControl {
  protected readonly field = inject(DsField, { optional: true });
  private readonly tag = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement.tagName;
  protected readonly kind =
    this.tag === 'SELECT' ? 'select' : this.tag === 'TEXTAREA' ? 'textarea' : 'input';
}
