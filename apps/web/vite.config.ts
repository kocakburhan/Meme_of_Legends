import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
const apiOrigin = `http://localhost:${process.env.MOL_SERVER_PORT ?? '8787'}`;

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
  // Yerel geliştirmede API + WebSocket wrangler dev'e (8787; `MOL_SERVER_PORT`)
  // vekillenir; sunucunun kaynak kökeni denetimi için Origin başlığı hedef kökene yazılır.
  server: {
    proxy: {
      '/media': { target: apiOrigin, changeOrigin: true },
      '/api': {
        target: apiOrigin,
        changeOrigin: true,
        ws: true,
        headers: { origin: apiOrigin },
      },
    },
  },
});
