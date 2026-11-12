// The browser sweep against the preview's fixture kit, one project per
// target. Run with `pnpm test:e2e` from the package; not part of `test`,
// which needs no browser. The server builds the kit under
// `tests/browser/.kit` and serves it on TESTING_E2E_PORT (default 6230); a
// server already on that port is reused outside CI. A second server builds
// the same kit with a `mount` wrapper under `tests/browser/.kit-wrapped` and
// serves it on TESTING_E2E_WRAPPED_PORT (default 6231). Chromium comes from
// the Playwright browsers already installed for this version.
import { defineConfig } from '@playwright/test';

const port = process.env.TESTING_E2E_PORT ?? '6230';
const wrappedPort = process.env.TESTING_E2E_WRAPPED_PORT ?? '6231';

export default defineConfig({
  testDir: '.',
  testMatch: /\.spec\.ts$/,
  outputDir: './test-results',
  // The dev server compiles the kit on its first load.
  timeout: 120_000,
  expect: { timeout: 10_000 },
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'react' }, { name: 'vue' }, { name: 'svelte' }],
  webServer: [
    {
      command: 'node tests/browser/support/preview-server.mjs',
      url: `http://localhost:${port}/`,
      cwd: '../..',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'node tests/browser/support/preview-server.mjs --wrapped',
      url: `http://localhost:${wrappedPort}/`,
      cwd: '../..',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
