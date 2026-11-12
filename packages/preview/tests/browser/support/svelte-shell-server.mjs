// What the Svelte shell's Playwright `webServer` runs: the fixture kit built
// into `tests/browser/.kit-svelte-shell`, with the minimal Svelte shell
// (`tests/browser/svelte-shell`) copied into the kit and named as its
// `preview.shell`, served with this package's own `dev` command.
// Inside the kit, the shell's `@scaffold-ui-kit/preview/shell` import resolves
// through the kit's link to this package, the way a kit's own shell resolves
// the installed preview. The port is PREVIEW_E2E_SVELTE_SHELL_PORT, default 6211.
import { spawn } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { packageRoot, prepareFixtureKit, previewCli } from './fixture-kit.mjs';

const port = process.env.PREVIEW_E2E_SVELTE_SHELL_PORT ?? '6211';
const kitRoot = resolve(packageRoot, 'tests/browser/.kit-svelte-shell');
const shellDirectory = 'preview/svelte-shell';

prepareFixtureKit(kitRoot);
cpSync(resolve(packageRoot, 'tests/browser/svelte-shell'), join(kitRoot, shellDirectory), { recursive: true });
const configurationPath = join(kitRoot, 'scaffold-ui-kit.json');
const configuration = JSON.parse(readFileSync(configurationPath, 'utf8'));
configuration.preview.shell = {
  module: `${shellDirectory}/index.ts`,
  page: `${shellDirectory}/page.ts`,
};
configuration.preview.port = Number(port);
writeFileSync(configurationPath, `${JSON.stringify(configuration, null, 2)}\n`);

const server = spawn(process.execPath, [previewCli, '--kit', kitRoot, 'dev', '--port', port], {
  stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
server.on('exit', (code) => process.exit(code ?? 0));
