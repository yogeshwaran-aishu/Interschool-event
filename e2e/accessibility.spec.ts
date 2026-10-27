import { IDS, expect, test, USERS, expectAccessible, signIn } from './support';

/** Every page, for the role that can see it, checked with axe at WCAG 2.2 A/AA/AAA in both themes. */
const PAGES: { user: string; paths: string[] }[] = [
  { user: USERS.appAdmin, paths: ['/dashboard', '/schools', '/audit', '/notifications'] },
  {
    user: USERS.hostAdmin,
    paths: [
      '/dashboard',
      '/events',
      '/events/new',
      `/events/${IDS.fiesta}`,
      `/events/${IDS.fiesta}/invitations`,
      `/events/${IDS.fiesta}/nominations`,
      `/events/${IDS.fiesta}/edit`,
      '/invitations',
      '/people',
      // Another school's approvals: must show a titled "not available" page, no data.
      `/approvals/${IDS.invFiestaLake}`,
    ],
  },
  { user: USERS.guestTeacher, paths: ['/approvals', `/approvals/${IDS.invFiestaLake}`] },
  {
    user: USERS.student,
    paths: ['/dashboard', '/explore', '/my-applications', '/notifications', '/does-not-exist'],
  },
];

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test('sign-in page', async ({ page }) => {
      await page.goto('/login');
      await expectAccessible(page, `/login (${scheme})`);
    });

    for (const { user, paths } of PAGES) {
      test(`pages for ${user}`, async ({ page }) => {
        await signIn(page, user);
        await expect(page.locator('[data-page-heading]')).toBeVisible();
        for (const path of paths) {
          await page.goto(path);
          await expect(page.locator('[data-page-heading]')).toBeVisible();
          await expectAccessible(page, `${path} (${scheme})`);
        }
      });
    }

    test('open dialogs', async ({ page }) => {
      await signIn(page, USERS.hostAdmin);
      await page.goto(`/events/${IDS.fiesta}`);
      await page.getByRole('button', { name: 'Invite schools' }).first().click();
      await expect(page.getByRole('dialog', { name: 'Invite schools' })).toBeVisible();
      await expectAccessible(page, `invite dialog (${scheme})`);
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'Display preferences' }).click();
      await expect(page.getByRole('dialog', { name: 'Display preferences' })).toBeVisible();
      await expectAccessible(page, `preferences dialog (${scheme})`);
    });
  });
}

test.describe('keyboard and focus', () => {
  test('skip link moves focus to the main content', async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    await expect(page.locator('[data-page-heading]')).toBeVisible();
    await page.goto('/dashboard');
    // A full load restores the session from the API before the app renders.
    await expect(page.locator('[data-page-heading]')).toBeVisible();
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();
  });

  test('focus moves to the page heading after navigation', async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    await expect(page.locator('[data-page-heading]')).toBeVisible();
    await page.goto(`/events/${IDS.fiesta}`);
    await page.getByRole('link', { name: 'Hosted events' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Hosted events' })).toBeFocused();
  });

  test('dialogs trap focus and restore it on Escape', async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    await expect(page.locator('[data-page-heading]')).toBeVisible();
    const trigger = page.getByRole('button', { name: 'Display preferences' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Display preferences' });
    await expect(dialog).toBeVisible();
    // The page behind a modal is inert: Tab cycles through the dialog (and the browser UI),
    // never reaching background content.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const escaped = await dialog.evaluate(
        (d) => document.activeElement !== document.body && !d.contains(document.activeElement),
      );
      expect(escaped).toBe(false);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('theme preference applies and persists', async ({ page }) => {
    await signIn(page, USERS.student);
    await expect(page.locator('[data-page-heading]')).toBeVisible();
    await page.getByRole('button', { name: 'Display preferences' }).click();
    await page.getByRole('radio', { name: 'Dark' }).check();
    await page.getByRole('radio', { name: 'Larger' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-text', 'large');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
