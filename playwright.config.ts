import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env['E2E_PORT'] ?? 4300);
const API_PORT = Number(process.env['E2E_API_PORT'] ?? 3100);

/**
 * E2E runs the Angular dev server against the real Node.js API and PostgreSQL, on three form
 * factors: desktop, tablet and phone. Tests share one database, so they run one at a time and
 * each starts from freshly seeded data (see `test` in e2e/support.ts).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI']
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, hasTouch: true },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'npx tsx scripts/e2e-api.ts',
      cwd: 'server',
      url: `http://localhost:${API_PORT}/health`,
      env: { E2E_API_PORT: String(API_PORT) },
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
    {
      command: `npx ng serve web --port ${PORT}`,
      url: `http://localhost:${PORT}`,
      // CI=true turns off Angular's persistent build cache, so this server never fights over it.
      env: { API_URL: `http://localhost:${API_PORT}`, CI: 'true' },
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
  ],
});
