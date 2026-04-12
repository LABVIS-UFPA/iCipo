import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: path.resolve('dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        projects: path.resolve('ui/projects/projects.html'),
        // Ativar os htmls abaixo após migrar cada tela:
        // popup: path.resolve('ui/popup/popup.html'),
        // options: path.resolve('ui/options/options.html'),
        // dashboard: path.resolve('ui/dashboard/dashboard.html')
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
});