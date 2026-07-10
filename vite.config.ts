import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Project Pages URL: https://kimchankwon.github.io/pet-village/
  base: '/pet-village/',
  plugins: [react()],
});
