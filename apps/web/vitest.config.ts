import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@mol/engine': path.resolve(import.meta.dirname, '../../packages/engine/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    // RTL otomatik temizliği ve test içi ergonomik API'ler için.
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
