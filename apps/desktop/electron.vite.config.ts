import { fileURLToPath } from 'node:url';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import vue from '@vitejs/plugin-vue';

export const sandboxedPreloadBuild = {
  rollupOptions: {
    output: {
      format: 'cjs' as const,
    },
  },
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    build: sandboxedPreloadBuild,
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src/renderer/src', import.meta.url)),
        '@interview-assistant/contracts': fileURLToPath(
          new URL('../../packages/contracts/src/index.ts', import.meta.url),
        ),
      },
    },
    plugins: [vue()],
  },
});
