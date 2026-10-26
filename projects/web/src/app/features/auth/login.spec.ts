import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Store } from '../../core/store';
import Login from './login';

describe('Login', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([{ path: '**', children: [] }])],
    }).compileComponents();
    TestBed.inject(Store).reset();
  });

  function setup() {
    const fixture = TestBed.createComponent(Login);
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el };
  }

  it('labels its inputs and links hints with aria-describedby', async () => {
    const { fixture, el } = setup();
    await fixture.whenStable();
    const password = el.querySelector<HTMLInputElement>('input[autocomplete="current-password"]')!;
    const label = el.querySelector(`label[for="${password.id}"]`);
    expect(label?.textContent).toContain('Password');
    expect(password.getAttribute('aria-describedby')).toContain('hint');
  });

  it('shows field errors after an empty submit', async () => {
    const { fixture, el } = setup();
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    const email = el.querySelector<HTMLInputElement>('input[type="email"]')!;
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(el.textContent).toContain('Enter your email address.');
  });

  it('signs in with a demo account and navigates to the dashboard', async () => {
    const { fixture, el } = setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await fixture.whenStable();
    const demo = Array.from(el.querySelectorAll<HTMLButtonElement>('.auth__demo-btn')).find((b) =>
      b.textContent?.includes('School Admin (host)'),
    )!;
    demo.click();
    await fixture.whenStable();
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('shows an alert for wrong credentials', async () => {
    const { fixture, el } = setup();
    await fixture.whenStable();
    const email = el.querySelector<HTMLInputElement>('input[type="email"]')!;
    const password = el.querySelector<HTMLInputElement>('input[autocomplete="current-password"]')!;
    email.value = 'principal@sunrise.test';
    email.dispatchEvent(new Event('input'));
    password.value = 'nope';
    password.dispatchEvent(new Event('input'));
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('do not match');
  });
});
