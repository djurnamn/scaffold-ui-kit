// The shells' interaction tests, in a browser against this package's
// development server. Run with `pnpm test:e2e` from the package (or
// `pnpm --filter @scaffold-ui-kit/preview test:e2e`); not part of `test` or
// `verify`, which need no browser. Two servers run the fixture kit: one with
// the charcell shell, built under `tests/browser/.kit` and served on
// PREVIEW_E2E_PORT (default 6210), for the `chromium` project; one with the
// minimal Svelte shell (`svelte-shell/`), built under
// `tests/browser/.kit-svelte-shell` and served on PREVIEW_E2E_SVELTE_SHELL_PORT
// (default 6211), for the `svelte-shell` project. A server already on its
// port is reused outside CI. Chromium comes from the Playwright browsers
// already installed for this version.
import { defineConfig } from '@playwright/test';

const port = process.env.PREVIEW_E2E_PORT ?? '6210';
const svelteShellPort = process.env.PREVIEW_E2E_SVELTE_SHELL_PORT ?? '6211';

export default defineConfig({
  testDir: '.',
  testMatch: /\.spec\.ts$/,
  outputDir: './test-results',
  // The dev server compiles the kit on first load and regenerates a story on
  // every edit, so each test gets room; the specs tighten the waits that matter.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  // The editor's regeneration rewrites one shared scratch story: the tests
  // run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: [/package\.spec\.ts$/, /svelte-shell\.spec\.ts$/],
      use: { browserName: 'chromium' },
    },
    {
      name: 'svelte-shell',
      testMatch: /svelte-shell\.spec\.ts$/,
      use: { browserName: 'chromium', baseURL: `http://localhost:${svelteShellPort}` },
    },
  ],
  webServer: [
    {
      command: 'node tests/browser/support/dev-server.mjs',
      url: `http://localhost:${port}/`,
      cwd: '../..',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'node tests/browser/support/svelte-shell-server.mjs',
      url: `http://localhost:${svelteShellPort}/`,
      cwd: '../..',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
