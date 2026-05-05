import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

function pageConfig(name, input, outDir) {
  return {
    plugins: [svelte()],
    base: './',
    build: {
      outDir,
      emptyOutDir: true,
      cssCodeSplit: false,
      rollupOptions: {
        input,
        output: {
          format: 'es',
          entryFileNames: `${name}.js`,
          chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name && assetInfo.name.endsWith('.css')) {
              return `${name}.css`;
            }
            return 'assets/[name][extname]';
          }
        }
      }
    }
  };
}

export default defineConfig(() => {
  const target = process.env.UI_TARGET;

  if (target !== 'projects') {
    throw new Error('Defina UI_TARGET como projects.');
  }

  return pageConfig(
    'projects',
    path.resolve('ui/projects/src/main.js'),
    path.resolve('ui/projects/dist')
  );
});
