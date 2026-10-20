import { defineConfig } from 'vite';

export default defineConfig({
  // The world loads its assets with top-level await.
  build: { target: 'esnext', chunkSizeWarningLimit: 8000 },
  optimizeDeps: { esbuildOptions: { target: 'esnext' } },
});
