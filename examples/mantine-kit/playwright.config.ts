import { defineConfig } from '@playwright/test';

const port = process.env.PORT ?? '6100';

export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.ts/,
  timeout: 600_000,
  workers: 1,
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: 'react' }, { name: 'vue' }, { name: 'svelte' }],
  webServer: {
    command: `npx scaffold-ui-kit-preview dev --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
  },
});
