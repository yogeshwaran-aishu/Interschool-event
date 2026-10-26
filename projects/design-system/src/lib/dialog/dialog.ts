import { Component, ElementRef, effect, input, model, viewChild } from '@angular/core';
import { DsButton } from '../button/button';
import { DsIcon } from '../icon/icon';

let nextId = 0;

/**
 * Modal dialog built on native `<dialog>`: focus is trapped and restored by the
 * browser, and Escape closes it. Put actions in an element marked `dsDialogFooter`.
 */
@Component({
  selector: 'ds-dialog',
  imports: [DsButton, DsIcon],
  template: `
    <dialog
      #dialog
      class="ds-dialog"
      [class.ds-dialog--wide]="wide()"
      [attr.aria-labelledby]="headingId"
      [attr.aria-describedby]="description() ? descriptionId : null"
      (close)="open.set(false)"
    >
      <div class="ds-dialog__header">
        <div class="ds-stack" style="--ds-stack-gap: var(--ds-space-1)">
          <h2 [id]="headingId" style="font-size: var(--ds-fs-xl)">{{ heading() }}</h2>
          @if (description()) {
            <p [id]="descriptionId" class="ds-muted">{{ description() }}</p>
          }
        </div>
        <button
          dsButton="ghost"
          size="icon"
          type="button"
          (click)="open.set(false)"
          [attr.aria-label]="'Close ' + heading()"
        >
          <ds-icon name="x" />
        </button>
      </div>
      <div class="ds-dialog__body">
        <ng-content />
      </div>
      <div class="ds-dialog__footer">
        <ng-content select="[dsDialogFooter]" />
      </div>
    </dialog>
  `,
  host: { style: 'display: contents' },
})
export class DsDialog {
  readonly open = model(false);
  readonly heading = input.required<string>();
  readonly description = input<string>();
  readonly wide = input(false);

  private readonly uid = `ds-dialog-${nextId++}`;
  protected readonly headingId = `${this.uid}-title`;
  protected readonly descriptionId = `${this.uid}-desc`;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.open() && !el.open) {
        el.showModal?.();
      } else if (!this.open() && el.open) {
        el.close();
      }
    });
  }
}
