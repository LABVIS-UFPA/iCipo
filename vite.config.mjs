import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

function pageConfig(name, input, outDir) {
  return {
    plugins: [svelte()],
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

  switch (target) {
    case 'projects':
      return pageConfig(
        'projects',
        path.resolve('ui/projects/src/main.js'),
        path.resolve('ui/projects/dist')
      );

    case 'popup':
      return pageConfig(
        'popup',
        path.resolve('ui/popup/src/main.js'),
        path.resolve('ui/popup/dist')
      );

    case 'options':
      return pageConfig(
        'options',
        path.resolve('ui/options/src/main.js'),
        path.resolve('ui/options/dist')
      );

    case 'dashboard':
      return pageConfig(
        'dashboard',
        path.resolve('ui/dashboard/src/main.js'),
        path.resolve('ui/dashboard/dist')
      );

    default:
      throw new Error(
        'Defina UI_TARGET como projects, popup, options ou dashboard.'
      );
  }
});
