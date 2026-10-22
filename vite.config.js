import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the build works both locally and under the GitHub Pages sub-path.
  base: './',
  // The world loads its assets with top-level await.
  build: { target: 'esnext', chunkSizeWarningLimit: 8000 },
  optimizeDeps: { esbuildOptions: { target: 'esnext' } },
});
