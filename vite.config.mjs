import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: path.resolve('ui/projects/dist'),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: path.resolve('ui/projects/src/main.js'),
      output: {
        format: 'es',
        entryFileNames: 'projects.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'projects.css';
          }
          return 'assets/[name][extname]';
        }
      }
    }
  }
});