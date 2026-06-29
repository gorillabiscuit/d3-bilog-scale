import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist-hatch',
    rollupOptions: {
      input: { hatch: 'hatch-embed.html' },
    },
  },
});
