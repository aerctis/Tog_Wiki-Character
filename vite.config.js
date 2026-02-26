import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: './',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        sheet: resolve(__dirname, 'sheet.html'),
        compendium: resolve(__dirname, 'compendium.html'),
        admin: resolve(__dirname, 'admin.html'),
      }
    }
  }
});