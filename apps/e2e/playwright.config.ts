import { defineConfig } from '@playwright/test';

/**
 * Uçtan uca testler: yerel wrangler dev (8787) + vite dev (5173) ile.
 * Sunucular test runner tarafından başlatılır ve bitince kapatılır.
 * Paralel worktree'lerde portlar `MOL_SERVER_PORT` / `MOL_WEB_PORT` ile değişir.
 */
const server = process.env.MOL_SERVER_PORT ?? '8787';
const web = process.env.MOL_WEB_PORT ?? '5173';

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  timeout: 300_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${web}`,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // `MOL_YOUTUBE_STUB`: e2e'de YouTube doğrulama ucu tarayıcıda sahtelenir;
      // sunucu oEmbed ağ çağrısı yapmaz (testler ağdan bağımsız kalır).
      command: `pnpm --filter @mol/server dev --port ${server} --inspector-port 0 --var MOL_YOUTUBE_STUB:1`,
      url: `http://localhost:${server}/health`,
      reuseExistingServer: false,
      timeout: 150_000,
    },
    {
      command: `pnpm --filter @mol/web dev --port ${web} --strictPort`,
      url: `http://localhost:${web}/`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
