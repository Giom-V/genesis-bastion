/**
 * @file vite.config.js
 * @description Vite configuration for Genesis Bastion.
 * Strictly binds the development and preview servers to 127.0.0.1 (loopback)
 * in accordance with security requirements (never 0.0.0.0).
 */

import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: true,
  },
});
