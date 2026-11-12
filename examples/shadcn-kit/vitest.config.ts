import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [vue(), svelte()],
  esbuild: { jsx: 'automatic' },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
