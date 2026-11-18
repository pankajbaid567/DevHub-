/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API = process.env.VITE_API_PROXY ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Same-origin in development: the refresh cookie and WebSockets just work.
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/socket.io': { target: API, ws: true, changeOrigin: true },
      '/docs': { target: API, changeOrigin: true },
      '/openapi.json': { target: API, changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Only split out the heavy, self-contained editor stacks. A catch-all "vendor" chunk
        // created a circular chunk dependency (a TDZ crash in production), so everything
        // else is left to Rollup's automatic, cycle-free chunking.
        manualChunks(id) {
          if (id.includes('node_modules/monaco-editor')) return 'monaco';
          if (/node_modules[\\/](yjs|y-monaco|y-protocols|lib0)[\\/]/.test(id)) return 'collab';
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
