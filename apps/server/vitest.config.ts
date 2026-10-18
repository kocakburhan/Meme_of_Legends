import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
const migrations = await readD1Migrations('./migrations');
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          TOKEN_SECRET: 'test-only-secret-at-least-thirty-two-characters',
          TEST_MIGRATIONS: migrations,
        },
      },
    }),
  ],
  test: { setupFiles: ['./test/setup.ts'] },
});
