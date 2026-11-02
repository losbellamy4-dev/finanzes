/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

/**
 * NEXUS_SINGLE=1 genera un único bundle (sin división de código) para
 * incrustarlo en un HTML autocontenido que se abre con doble clic
 * (ver scripts/build-single.mjs).
 */
const single = process.env.NEXUS_SINGLE === '1';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  publicDir: single ? false : 'public',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: single
    ? {
        target: 'es2022',
        outDir: 'dist-single',
        emptyOutDir: true,
        cssCodeSplit: false,
        modulePreload: false,
        assetsInlineLimit: 100_000_000,
        chunkSizeWarningLimit: 5_000,
        rollupOptions: { output: { inlineDynamicImports: true } },
      }
    : {
        target: 'es2022',
        chunkSizeWarningLimit: 900,
        rollupOptions: {
          output: {
            manualChunks: {
              react: ['react', 'react-dom'],
              charts: ['recharts'],
            },
          },
        },
      },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
});
