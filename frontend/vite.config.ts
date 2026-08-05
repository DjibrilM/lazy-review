import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import { fileURLToPath } from 'node:url';

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      { find: '@ui', replacement: fileURLToPath(new URL('./src/ui', import.meta.url)) },
      { find: '@lib', replacement: fileURLToPath(new URL('./src/lib', import.meta.url)) },
      {
        find: '@components',
        replacement: fileURLToPath(new URL('./src/components', import.meta.url)),
      },
    ],
  },
  build: {
    outDir: '../dist/client',
  },
  server: {
    proxy: {
      '/github': {
        target: 'http://localhost:16500',
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), tailwindcss()],
});
