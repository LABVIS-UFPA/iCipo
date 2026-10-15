import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

export function pageConfig(name, input, outDir) {
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

export const targets = {
  projects: {
    name: 'projects',
    input: path.resolve('ui/projects/src/main.js'),
    outDir: path.resolve('ui/projects/dist')
  },
  popup: {
    name: 'popup',
    input: path.resolve('ui/popup/src/main.js'),
    outDir: path.resolve('ui/popup/dist')
  },
  options: {
    name: 'options',
    input: path.resolve('ui/options/src/main.js'),
    outDir: path.resolve('ui/options/dist')
  },
  dashboard: {
    name: 'dashboard',
    input: path.resolve('ui/dashboard/src/main.js'),
    outDir: path.resolve('ui/dashboard/dist')
  }
};

export default defineConfig(({ mode }) => {
  const target = process.env.UI_TARGET || (targets[mode] ? mode : 'projects');
  const cfg = targets[target];

  if (!cfg) {
    throw new Error(`Target inválido: "${target}". Escolha entre: ${Object.keys(targets).join(', ')}`);
  }

  return pageConfig(cfg.name, cfg.input, cfg.outDir);
});
