import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Builds the static linear/log comparison page (static.html) for embedding in the website,
// separate from the main app build. Run with:
//   npx vite build --config vite.embed.config.js --base=/charts/adaptive-static/
export default defineConfig({
  build: {
    outDir: 'dist-embed',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(import.meta.dirname, 'static.html'),
    },
  },
});
