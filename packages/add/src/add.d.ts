/**
 * Runs the consumer CLI for a kit: `add` (the default command), with
 * `--target`, `--output-directory`/`-o`, `--own`, `--stylesheet-link`,
 * `--force` and `--list`; `initialize`; `status`, with `--json`; and
 * `update`. Every command takes `--help`. Errors are printed and set a
 * failing exit code rather than thrown.
 *
 * @param kitRoot - The kit package's root directory, where its `package.json`
 *   and `dist/scaffold-ui-kit-manifest.json` live.
 * @param argv - The arguments after the program name, the command
 *   among them (`['add', 'button']`). Defaults to the process's own.
 * @example
 * ```js
 * // A kit's bin/add.mjs:
 * import { fileURLToPath } from 'node:url';
 * import { runAdd } from '@scaffold-ui-kit/add';
 * await runAdd(fileURLToPath(new URL('..', import.meta.url)));
 * ```
 */
export declare function runAdd(kitRoot: string, argv?: string[]): Promise<void>;
