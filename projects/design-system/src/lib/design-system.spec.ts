import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DsBadge } from './badge/badge';
import { DsButton } from './button/button';
import { DsDialog } from './dialog/dialog';
import { DsMeter } from './display/display';
import { DsControl, DsField } from './field/field';
import { DsPreferencesPanel } from './theme/preferences-panel';
import { DsPreferencesService } from './theme/preferences';
import { DsToastService, DsToaster } from './toast/toast';

@Component({
  imports: [DsButton, DsBadge, DsField, DsControl, DsMeter, DsDialog],
  template: `
    <button dsButton="primary" id="primary">Save</button>
    <a dsButton href="#" id="link">Link</a>
    <ds-badge tone="success">Approved</ds-badge>
    <ds-field label="Email" hint="Work email" [error]="error()" [required]="true">
      <input dsControl type="email" />
    </ds-field>
    <ds-meter label="Approved" [value]="2" [max]="3" />
    <ds-dialog [(open)]="open" heading="Confirm"><p>Body</p></ds-dialog>
  `,
})
class Host {
  readonly error = signal<string | null>(null);
  readonly open = signal(false);
}

describe('design system', () => {
  beforeEach(() => localStorage.clear());

  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement, host: fixture.componentInstance };
  }

  it('styles buttons and links by variant', async () => {
    const { el } = await render();
    expect(el.querySelector('#primary')!.className).toContain('ds-button--primary');
    expect(el.querySelector('#link')!.className).toContain('ds-button');
    expect(el.querySelector('#link')!.className).not.toContain('ds-button--primary');
  });

  it('renders badge tone classes and keeps the text label', async () => {
    const { el } = await render();
    const badge = el.querySelector('ds-badge')!;
    expect(badge.className).toContain('ds-badge--success');
    expect(badge.textContent).toBe('Approved');
  });

  it('connects label, hint and error to the control', async () => {
    const { fixture, el, host } = await render();
    const input = el.querySelector('input')!;
    expect(el.querySelector(`label[for="${input.id}"]`)?.textContent).toContain('Email');
    expect(input.getAttribute('aria-required')).toBe('true');
    expect(input.getAttribute('aria-invalid')).toBeNull();

    host.error.set('Enter a valid email.');
    await fixture.whenStable();
    const ids = input.getAttribute('aria-describedby')!.split(' ');
    expect(ids).toHaveLength(2);
    expect(el.querySelector(`#${ids[1]}`)?.textContent).toContain('Enter a valid email.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('exposes the meter value to assistive technology', async () => {
    const { el } = await render();
    const meter = el.querySelector('[role="meter"]')!;
    expect(meter.getAttribute('aria-valuenow')).toBe('2');
    expect(meter.getAttribute('aria-valuemax')).toBe('3');
    expect(meter.getAttribute('aria-valuetext')).toBe('2 of 3');
  });

  it('labels the dialog by its heading', async () => {
    const { el } = await render();
    const dialog = el.querySelector('dialog')!;
    expect(el.querySelector(`#${dialog.getAttribute('aria-labelledby')}`)?.textContent).toBe(
      'Confirm',
    );
  });
});

describe('DsToastService', () => {
  it('keeps toasts until dismissed and shows the newest three', async () => {
    const toasts = TestBed.inject(DsToastService);
    ['a', 'b', 'c', 'd'].forEach((t) => toasts.success(t));
    expect(toasts.messages().map((m) => m.title)).toEqual(['b', 'c', 'd']);

    const fixture = TestBed.createComponent(DsToaster);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[aria-live="polite"]')).not.toBeNull();
    el.querySelector<HTMLButtonElement>('button[aria-label="Dismiss: d"]')!.click();
    expect(toasts.messages().map((m) => m.title)).toEqual(['a', 'b', 'c']);
  });
});

describe('DsPreferencesService', () => {
  beforeEach(() => localStorage.clear());

  it('writes preferences to <html> and persists them', async () => {
    const fixture = TestBed.createComponent(DsPreferencesPanel);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLInputElement>('input[value="dark"]')!.click();
    el.querySelector<HTMLInputElement>('input[value="large"]')!.click();
    await fixture.whenStable();
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(document.documentElement.dataset['text']).toBe('large');
    expect(JSON.parse(localStorage.getItem('ds-preferences')!)).toMatchObject({
      theme: 'dark',
      text: 'large',
    });
    expect(TestBed.inject(DsPreferencesService).preferences().theme).toBe('dark');
  });
});
