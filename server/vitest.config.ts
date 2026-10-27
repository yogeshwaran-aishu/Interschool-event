import { defineConfig } from 'vitest/config';

/** API tests run against a real PostgreSQL started in test/global-setup.ts. */
export default defineConfig({
  test: {
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://isc:isc@localhost:5435/isc_test',
      JWT_SECRET: 'test-secret-test-secret-test-secret-00',
      INITIAL_PASSWORD: 'demo1234',
      ALLOW_DEMO_RESET: 'false',
      RUN_WORKER_IN_API: 'false',
    },
  },
});
