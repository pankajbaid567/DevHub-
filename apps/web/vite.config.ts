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
        // Long-lived vendor chunks: app deploys don't invalidate cached libraries.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('monaco-editor')) return 'monaco';
          if (/[\\/](yjs|y-monaco|y-protocols|lib0)[\\/]/.test(id)) return 'collab';
          if (
            /[\\/](react-markdown|remark|rehype|micromark|mdast|hast|unified|highlight\.js)/.test(
              id,
            )
          )
            return 'markdown';
          if (/[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id))
            return 'react';
          return 'vendor';
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
