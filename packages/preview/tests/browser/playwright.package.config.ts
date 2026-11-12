// The packed-install smoke test: the preview packed with `pnpm pack`,
// installed from the tarball into a kit outside the workspace beside
// charcell, built with its `build` command and loaded once from a subpath
// (`/kit/`). Run with
// `pnpm test:package` from the package; not part of `test` or `verify`. See
// `support/package-server.mjs` for what the server does and the variables
// that steer it (PREVIEW_PACKAGE_PORT, default 6220; CHARCELL_PATH;
// PREVIEW_PACKAGE_SMOKE_DIRECTORY).
import { defineConfig } from '@playwright/test';

const port = process.env.PREVIEW_PACKAGE_PORT ?? '6220';

export default defineConfig({
  testDir: '.',
  testMatch: /package\.spec\.ts$/,
  // Apart from the interaction tests', so a run of this one after them keeps
  // their failures' screenshots and traces.
  outputDir: './test-results/package',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'node tests/browser/support/package-server.mjs',
    url: `http://localhost:${port}/kit/`,
    cwd: '../..',
    // Every run packs and installs afresh: a server left over would test the last build.
    reuseExistingServer: false,
    timeout: 600_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
