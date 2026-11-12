import { configDefaults, defineConfig } from 'vitest/config';

// Vue's production build is chosen from the NODE_ENV the test process starts
// with, so its test has a run of its own: `NODE_ENV=production vitest run`.
const PRODUCTION_TEST = 'tests/render-vue-production.test.ts';
const production = process.env.NODE_ENV === 'production';

export default defineConfig({
  // The React target's components are written as .tsx with no React import.
  esbuild: { jsx: 'automatic' },
  test: {
    include: production ? [PRODUCTION_TEST] : ['tests/**/*.test.ts'],
    exclude: production
      ? configDefaults.exclude
      : [...configDefaults.exclude, PRODUCTION_TEST],
    environment: 'node',
    testTimeout: 30_000,
  },
});
