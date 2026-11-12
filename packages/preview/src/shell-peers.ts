// The packages a shell needs installed beside the preview: the charcell
// shell imports charcell and @zag-js/react, which the preview declares as
// optional peers rather than installing for every kit. A kit that names the
// shell without one would otherwise get a bundler error about an import it
// cannot see, from inside the shell, once Vite runs.

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { PreviewContext } from './context.js';

/** The packages the charcell shell imports that the kit installs: the
 *  preview's peer dependencies. */
export const CHARCELL_SHELL_PEERS = ['charcell', '@zag-js/react'] as const;

/**
 * Whether package `name` resolves from `directory` by Node's lookup: a
 * `node_modules/<name>` in it or any directory above it.
 *
 * @param name - The package name.
 * @param directory - The directory an import of it is made from.
 * @returns Whether a `node_modules/<name>/package.json` is found.
 */
export function resolvesFrom(name: string, directory: string): boolean {
  for (let current = directory; ; current = dirname(current)) {
    if (existsSync(resolve(current, 'node_modules', name, 'package.json')))
      return true;
    if (current === dirname(current)) return false;
  }
}

/**
 * The packages the kit's shell imports that do not resolve from where the
 * shell is, as the bundler would look for them: for the charcell shell,
 * named as it is or configured through a module of the kit's, each of
 * {@link CHARCELL_SHELL_PEERS} the kit has not installed. A shell of the
 * kit's own, or from another package, declares its own dependencies, and
 * gets nothing here.
 *
 * @param context - The preview context.
 * @returns The missing packages' names, empty when none is missing.
 */
export function missingShellPeers(
  context: Pick<PreviewContext, 'charcellShellAbsolute'>
): string[] {
  if (context.charcellShellAbsolute === undefined) return [];
  const shellDirectory = dirname(context.charcellShellAbsolute);
  return CHARCELL_SHELL_PEERS.filter(
    (name) => !resolvesFrom(name, shellDirectory)
  );
}

/**
 * What to say of the shell's missing packages, or `undefined` when none is
 * missing: the packages to install, and the command that installs them.
 *
 * @param missing - The packages {@link missingShellPeers} gives.
 * @returns The message, naming each package.
 * @example
 * ```ts
 * missingShellPeersProblem(['@zag-js/react']);
 * // "the charcell shell needs @zag-js/react, which the kit has not installed: ..."
 * ```
 */
export function missingShellPeersProblem(
  missing: readonly string[]
): string | undefined {
  if (missing.length === 0) return undefined;
  const names = missing.join(' and ');
  return `the charcell shell needs ${names}, which the kit has not installed: add ${missing.length === 1 ? 'it' : 'them'} to the kit's devDependencies, as in \`npm install --save-dev ${missing.join(' ')}\``;
}
