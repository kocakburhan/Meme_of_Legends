import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // shadcn/ui için '@' takma adı (components.json ile uyumlu).
      '@': path.resolve(import.meta.dirname, 'src'),
      // Motor tipi ve yardımcıları doğrudan kaynaktan: dist beklemeden dev/test çalışır.
      '@mol/engine': path.resolve(import.meta.dirname, '../../packages/engine/src/index.ts'),
    },
  },
});
