import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Svelte's client runtime, not its server build, where effects never run.
  resolve: { conditions: ['browser'] },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
