import { expect, test, PASSWORD, USERS, signIn } from './support';

test.describe('sign in', () => {
  test('redirects signed-out visitors to sign in and back', async ({ page }) => {
    await page.goto('/events');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fevents/);
    await page.getByLabel('Email').fill(USERS.hostAdmin);
    await page.getByLabel(/^\s*Password/).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Hosted events' })).toBeVisible();
  });

  test('shows field errors and a credential error', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Enter your email address.')).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');

    await page.getByLabel('Email').fill(USERS.hostAdmin);
    await page.getByLabel(/^\s*Password/).fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('do not match');
  });

  test('demo account buttons fill the form', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /^Student\b.*Class 9/ }).click();
    await expect(page.getByLabel('Email')).toHaveValue(USERS.student);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Hello, Aarav' })).toBeVisible();
  });

  test('forces a password change on first sign-in (ON-3)', async ({ page }) => {
    await signIn(page, USERS.newStudent);
    await expect(page).toHaveURL(/\/account\/password/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/account\/password/);

    await page.getByLabel('Current password').fill(PASSWORD);
    await page.getByLabel(/^\s*New password/).fill('my-new-pass-1');
    await page.getByLabel('Confirm new password').fill('different');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page.getByText('The two passwords do not match.')).toBeVisible();

    await page.getByLabel('Confirm new password').fill('my-new-pass-1');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Hello, Meera' })).toBeVisible();
  });

  test('blocks pages outside the signed-in role', async ({ page }) => {
    await signIn(page, USERS.student);
    await expect(page.getByRole('heading', { level: 1, name: 'Hello, Aarav' })).toBeVisible();
    await page.goto('/schools');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
