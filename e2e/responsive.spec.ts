import { IDS, expect, test, USERS, signIn } from './support';

const PATHS = [
  '/dashboard',
  '/events',
  `/events/${IDS.fiesta}`,
  `/events/${IDS.fiesta}/nominations`,
  '/events/new',
  '/invitations',
  '/people',
  '/audit',
];

test.describe('responsive layout', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    await expect(page.locator('[data-page-heading]')).toBeVisible();
  });

  test('navigation adapts to the viewport', async ({ page }, testInfo) => {
    const sidebarNav = page.locator('aside').getByRole('navigation', { name: 'Main' });
    const bottomNav = page.getByRole('navigation', { name: 'Quick links' });
    const menuButton = page.getByRole('button', { name: 'Open menu' });

    if (testInfo.project.name === 'mobile') {
      await expect(sidebarNav).toBeHidden();
      await expect(bottomNav).toBeVisible();
      await menuButton.click();
      const drawer = page.getByRole('dialog', { name: 'Menu' });
      await drawer.getByRole('link', { name: 'People' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'People' })).toBeVisible();
      await expect(drawer).toBeHidden();
    } else {
      await expect(sidebarNav).toBeVisible();
      await expect(bottomNav).toBeHidden();
      await expect(menuButton).toBeHidden();
      await sidebarNav.getByRole('link', { name: 'People' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'People' })).toBeVisible();
      await expect(sidebarNav.getByRole('link', { name: 'People' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }
  });

  test('no page scrolls horizontally', async ({ page }) => {
    for (const path of PATHS) {
      await page.goto(path);
      await expect(page.locator('[data-page-heading]')).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
    }
  });

  test('interactive targets are at least 44 × 44 px (WCAG 2.5.5 AAA)', async ({ page }) => {
    for (const path of ['/dashboard', `/events/${IDS.fiesta}`, '/invitations']) {
      await page.goto(path);
      await expect(page.locator('[data-page-heading]')).toBeVisible();
      const small = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll<HTMLElement>(
            'button, a[href], input:not([type="hidden"]), select, textarea, [role="tab"]',
          ),
        )
          .filter((el) => {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return false;
            if (el.closest('.ds-skip-link, dialog:not([open])')) return false;
            // Inline links inside running text are exempt from 2.5.5.
            if (
              el.tagName === 'A' &&
              el.closest('p, td, dd, li') &&
              !el.classList.contains('ds-button')
            )
              return false;
            // Radio inputs are covered by their full-size label.
            if (
              el instanceof HTMLInputElement &&
              (el.type === 'radio' || el.type === 'checkbox') &&
              el.closest('label')
            )
              return false;
            return r.width < 44 || r.height < 44;
          })
          .map(
            (el) =>
              `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}"`,
          ),
      );
      expect(small, `small targets on ${path}`).toEqual([]);
    }
  });

  test('tables reflow into labelled rows on phones', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'phone-only layout');
    await page.goto(`/events/${IDS.fiesta}/invitations`);
    const cell = page.getByRole('cell', { name: 'Lakeview Vidyalaya', exact: true });
    await expect(cell).toBeVisible();
    const label = await cell.evaluate((td) => getComputedStyle(td, '::before').content);
    expect(label).toContain('School');
  });
});
