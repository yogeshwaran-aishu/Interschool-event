import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test as base } from '@playwright/test';

export { IDS } from '../server/src/db/seed-ids';
export { expect };

/** URL of the e2e API (server/scripts/e2e-api.ts), started by playwright.config.ts. */
export const API_URL = `http://localhost:${process.env['E2E_API_PORT'] ?? 3100}`;

/**
 * Every test starts from the seeded demo data: the database is shared, so the reset runs
 * before each test and the suite runs one test at a time.
 */
export const test = base.extend<{ resetData: void }>({
  resetData: [
    async ({ request }, use) => {
      const res = await request.post(`${API_URL}/api/v1/dev/reset`);
      expect(res.status(), 'demo data reset').toBe(204);
      await use();
    },
    { auto: true },
  ],
});

export const PASSWORD = 'demo1234';

export const USERS = {
  appAdmin: 'admin@interschool.test',
  hostAdmin: 'principal@sunrise.test',
  hostCoordinator: 'coordinator@sunrise.test',
  guestAdmin: 'principal@lakeview.test',
  guestTeacher: 'teacher@lakeview.test',
  student: 'aarav@lakeview.test',
  newStudent: 'meera@lakeview.test',
  greenfieldAdmin: 'principal@greenfield.test',
} as const;

export async function signIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/^\s*Password/).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await expect(page).toHaveURL(/\/login/);
}

/** Signs out and in as someone else in the same browser. */
export async function switchUser(page: Page, email: string): Promise<void> {
  await signOut(page);
  await signIn(page, email);
  await expect(page.locator('[data-page-heading]')).toBeVisible();
}

/** WCAG 2.0/2.1/2.2 A, AA and AAA rules, plus axe best practices. */
export const WCAG_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag2aaa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
  'best-practice',
];

export async function expectAccessible(page: Page, context: string): Promise<void> {
  // Let entry animations settle so contrast is measured on final colours.
  await page.waitForTimeout(250);
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
  }));
  expect(summary, `axe violations on ${context}`).toEqual([]);
}
