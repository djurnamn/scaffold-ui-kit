import { defineConfig } from '@playwright/test';

const port = Number(process.env.PREVIEW_PORT ?? 4173);

export default defineConfig({
  testDir: 'tests/browser',
  timeout: 10 * 60_000,
  use: { baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: `npx vite preview --outDir .preview-static --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'ignore',
  },
  projects: [{ name: 'react' }, { name: 'vue' }, { name: 'svelte' }],
});
