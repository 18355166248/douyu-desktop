import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const sharedAlias = {
  '@shared': resolve('src/shared'),
};
const coreAlias = {
  ...sharedAlias,
  '@core': resolve('src/core'),
};
const mainAlias = {
  ...coreAlias,
  '@main': resolve('src/main'),
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: mainAlias },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
  },
  renderer: {
    resolve: {
      alias: {
        ...sharedAlias,
        '@renderer': resolve('src/renderer/src'),
      },
    },
    plugins: [react()],
  },
});
