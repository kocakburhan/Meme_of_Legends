import { defineConfig } from '@playwright/test';

/**
 * Uçtan uca testler: yerel wrangler dev (8787) + vite dev (5173) ile.
 * Sunucular test runner tarafından başlatılır ve bitince kapatılır.
 */
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  timeout: 300_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @mol/server dev --port 8787',
      url: 'http://localhost:8787/health',
      reuseExistingServer: false,
      timeout: 150_000,
    },
    {
      command: 'pnpm --filter @mol/web dev --port 5173 --strictPort',
      url: 'http://localhost:5173/',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
