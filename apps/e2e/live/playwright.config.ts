import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'smoke.spec.ts',
  outputDir: './artifacts',
  timeout: 600_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'https://mol-game.kocakkburhann.workers.dev',
    trace: 'off', // Admin şifresi ve kimlik çerezleri kayda alınmaz.
    screenshot: 'off',
  },
});
