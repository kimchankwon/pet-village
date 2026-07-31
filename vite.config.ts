import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Project Pages URL: https://kimchankwon.github.io/pet-village/
  base: '/pet-village/',
  plugins: [react()],
  build: {
    // The guide, controls and fishing-prototype pages are plain static HTML, but
    // they still have to be listed here or the deploy (which publishes `dist`)
    // drops them.
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        guide: resolve(__dirname, 'guide.html'),
        controls: resolve(__dirname, 'controls.html'),
        fishingPrototypes: resolve(__dirname, 'fishing-prototypes.html'),
      },
    },
  },
});
