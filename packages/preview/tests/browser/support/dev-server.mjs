// What the interaction tests' Playwright `webServer` runs: build the fixture
// kit into `tests/browser/.kit`, then serve it with this package's own `dev`
// command, so the tests drive the development server (the scenario editor's
// regeneration exists there alone). The port is PREVIEW_E2E_PORT, default 6210.
// PREVIEW_E2E_SVELTE_MODE (`legacy` or `runes`) builds the kit's Svelte
// target in that mode, so a spec can be run against each.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { packageRoot, prepareFixtureKit, previewCli } from './fixture-kit.mjs';

const port = process.env.PREVIEW_E2E_PORT ?? '6210';
const kitRoot = resolve(packageRoot, 'tests/browser/.kit');

prepareFixtureKit(kitRoot, { svelteMode: process.env.PREVIEW_E2E_SVELTE_MODE });

const server = spawn(process.execPath, [previewCli, '--kit', kitRoot, 'dev', '--port', port], {
  stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
server.on('exit', (code) => process.exit(code ?? 0));
