import { defineConfig } from 'vite';

export default defineConfig({
  // For GitHub Pages, use the repo name as base path.
  // For Netlify, change to '/'.
  base: '/ExamesLab/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    // Inline small assets for better offline performance
    assetsInlineLimit: 4096,
  },
  server: {
    port: 5173,
    open: true,
  },
});
