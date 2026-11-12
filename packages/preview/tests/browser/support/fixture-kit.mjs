// The fixture kit the browser tests run against, built where a test wants it.
// `prepareFixtureKit(destination)` copies `tests/browser/fixture-kit` there,
// gives it a `node_modules/@scaffold-ui-kit/preview` link to this package
// (the kit names the shell by package, and the preview resolves it from the
// kit's root the way an installed kit would) and renders its components into
// `dist/<target>` with the workspace's own `scaffold-ui-kit build`, which the
// generated preview registries import by the kit's package name.
//
// The copy, never the committed fixture, is built: the scaffolder's build
// also writes the kit's consumer command and a dependency for it into
// package.json, which the fixture does not carry.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

/** This package's root. */
export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** The committed fixture kit. */
export const fixtureKitSource = resolve(packageRoot, 'tests/browser/fixture-kit');

/** The scaffolder's command-line entry, beside the main entry of the package this one depends on. */
const scaffolderCli = resolve(dirname(createRequire(import.meta.url).resolve('scaffold-ui-kit')), 'cli.js');

/** This package's command-line entry. */
export const previewCli = resolve(packageRoot, 'dist/cli.js');

/**
 * Run a command, inheriting the output, and throw when it fails.
 *
 * @param {string} command
 * @param {string[]} parameters
 * @param {{ cwd: string, env?: NodeJS.ProcessEnv }} options
 */
export function run(command, parameters, options) {
  const result = spawnSync(command, parameters, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${parameters.join(' ')} exited with ${result.status}`);
  }
}

/**
 * Copy the fixture kit to `destination` (emptied first) and build its
 * `dist/<target>` with the workspace's scaffolder. The copy's package.json
 * is restored afterwards, so it stays the fixture's own.
 *
 * @param {string} destination - The kit root to create.
 * @param {{ linkPreview?: boolean, svelteMode?: string, mount?: object }} [options] -
 *   `linkPreview` (default true) links this package into the kit's
 *   node_modules; `svelteMode` builds the Svelte target in that mode
 *   (`legacy` or `runes`) in place of the kit's own; `mount` sets the
 *   preview's `mount` wrapper, which the fixture itself has none of.
 */
export function prepareFixtureKit(destination, options = {}) {
  const { linkPreview = true, svelteMode, mount } = options;
  if (!existsSync(previewCli)) {
    throw new Error(`The preview is not built (${previewCli} is missing); run its build script first.`);
  }
  if (!existsSync(scaffolderCli)) {
    throw new Error(`The scaffolder is not built (${scaffolderCli} is missing); run the workspace build first.`);
  }
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  cpSync(fixtureKitSource, destination, { recursive: true });
  if (svelteMode || mount) {
    const configurationPath = join(destination, 'scaffold-ui-kit.json');
    const configuration = JSON.parse(readFileSync(configurationPath, 'utf8'));
    if (svelteMode) configuration.svelte = { ...configuration.svelte, mode: svelteMode };
    if (mount) configuration.preview = { ...configuration.preview, mount };
    writeFileSync(configurationPath, `${JSON.stringify(configuration, null, 2)}\n`);
  }
  const packageManifest = readFileSync(join(destination, 'package.json'), 'utf8');
  run(process.execPath, [scaffolderCli, 'build'], { cwd: destination });
  // The scaffolder's build adds the consumer command: not the fixture's.
  writeFileSync(join(destination, 'package.json'), packageManifest);
  rmSync(join(destination, 'bin'), { recursive: true, force: true });
  if (linkPreview) {
    const scope = join(destination, 'node_modules/@scaffold-ui-kit');
    mkdirSync(scope, { recursive: true });
    symlinkSync(packageRoot, join(scope, 'preview'), 'dir');
  }
  return destination;
}
