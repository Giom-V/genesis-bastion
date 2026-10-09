/**
 * @file vite.config.js
 * @description Vite configuration for Genesis Bastion.
 * Configured to bind on all Cloudtop interfaces (`host: true`, `allowedHosts: true`,
 * `cors: true`) so `http://giom-us.c.googlers.com:5173/` is reachable remotely.
 */

import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    allowedHosts: true,
    cors: true,
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
    cors: true,
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: true,
  },
});
