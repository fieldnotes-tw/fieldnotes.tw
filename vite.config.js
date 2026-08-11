import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // Prod assets are served under /assets/*; dev middleware uses "/".
  base: command === 'build' ? '/assets/' : '/',
  // Don't copy the site's public/ tree into the asset outDir.
  publicDir: false,
  build: {
    outDir: 'server/public/assets',
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'client/main.js'),
      },
      output: {
        entryFileNames: '[name]-[hash].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash][extname]',
      },
    },
  },
  server: {
    // Used when Vite runs in middleware mode from the Hono server.
    middlewareMode: true,
  },
  appType: 'custom',
}));
