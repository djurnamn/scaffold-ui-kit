import { defineConfig } from '@playwright/test';

const port = 4173;

export default defineConfig({
  testDir: 'tests/browser',
  timeout: 300_000,
  workers: 1,
  use: { baseURL: `http://localhost:${port}` },
  // One project per target: the test reads its target from the project's name.
  projects: [{ name: 'react' }, { name: 'vue' }, { name: 'svelte' }],
  webServer: {
    command: `npm run preview -- --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
  },
});
