// What the browser test's Playwright `webServer` runs: build the preview's
// own fixture kit into `tests/browser/.kit` with the preview's support, then
// serve it with the preview's `dev` command on TESTING_E2E_PORT (default
// 6230). The kit is built here, apart from the preview's own browser tests,
// so a preview server already running on theirs is left alone. With
// `--wrapped` it builds the same kit with a `mount` wrapper around every story
// into `tests/browser/.kit-wrapped` and serves it on
// TESTING_E2E_WRAPPED_PORT (default 6231).
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  prepareFixtureKit,
  previewCli,
} from '../../../../preview/tests/browser/support/fixture-kit.mjs';

// A padded frame with an element of its own beside the story, as a kit's gutter
// or surface frame has: only the node marked `mount` holds the story.
const MOUNT_WRAPPER = {
  classes: ['FixtureFrame'],
  style: 'padding: 16px',
  children: [
    { classes: ['FixtureFrame__chrome'] },
    { classes: ['FixtureFrame__story'], mount: true },
  ],
};

const wrapped = process.argv.includes('--wrapped');
const port = wrapped
  ? (process.env.TESTING_E2E_WRAPPED_PORT ?? '6231')
  : (process.env.TESTING_E2E_PORT ?? '6230');
const kitRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  wrapped ? '../.kit-wrapped' : '../.kit'
);

prepareFixtureKit(kitRoot, wrapped ? { mount: MOUNT_WRAPPER } : {});

const server = spawn(
  process.execPath,
  [previewCli, '--kit', kitRoot, 'dev', '--port', port],
  {
    stdio: 'inherit',
  }
);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
server.on('exit', (code) => process.exit(code ?? 0));
