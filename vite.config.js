import { defineConfig } from 'vite';

export default defineConfig({
  // For Netlify, use '/' (default).
  // For GitHub Pages, change to '/examelab/' (or your repo name).
  base: '/',
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
