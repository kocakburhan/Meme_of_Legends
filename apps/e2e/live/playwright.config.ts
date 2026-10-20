import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'smoke.spec.ts',
  outputDir: process.env.MOL_BROWSER_CHANNEL ? './artifacts/chrome' : './artifacts/chromium',
  timeout: 600_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    channel: process.env.MOL_BROWSER_CHANNEL,
    baseURL: 'https://mol-game.kocakkburhann.workers.dev',
    trace: 'off', // Admin şifresi ve kimlik çerezleri kayda alınmaz.
    screenshot: 'off',
  },
});
