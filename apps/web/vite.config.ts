import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Relative paths so the build works from any static host subfolder (GitHub Pages etc.).
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
