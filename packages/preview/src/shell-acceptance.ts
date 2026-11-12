// How the preview takes a shell: whether a module's default export is a
// shell this preview serves, and the shell's options for a kit. The host page
// uses these; a shell does not. Browser-safe.

import type { PreviewCatalog } from './controller/index.js';
import type { PreviewShellOption } from './options.js';
import { PREVIEW_SHELL_API_VERSION, type PreviewShell } from './shell.js';

/**
 * A shell's own options for a kit: its `options`, called with the catalog
 * when it is a function.
 *
 * @param shell - The shell.
 * @param catalog - The kit's catalog.
 * @returns The options, none when the shell declares none.
 */
export function shellOptionsFor(
  shell: Pick<PreviewShell, 'options'>,
  catalog: PreviewCatalog
): PreviewShellOption[] {
  const options = shell.options;
  return typeof options === 'function' ? options(catalog) : (options ?? []);
}

/**
 * Why `candidate` cannot serve as this preview's shell: it is not a shell, or
 * it was written against another contract version. The message names both
 * versions.
 *
 * @param candidate - A shell module's default export.
 * @returns The problem, or `undefined` when the candidate is a shell this preview serves.
 */
export function shellProblem(candidate: unknown): string | undefined {
  if (typeof candidate !== 'object' || candidate === null) {
    return 'The shell module does not default-export a shell: expected an object made with defineShell.';
  }
  const shell = candidate as Partial<PreviewShell>;
  if (typeof shell.mount !== 'function') {
    return 'The shell module does not default-export a shell: it has no mount function.';
  }
  if (shell.apiVersion !== PREVIEW_SHELL_API_VERSION) {
    return `This preview serves shell API version ${PREVIEW_SHELL_API_VERSION}, and the shell declares version ${String(shell.apiVersion)}.`;
  }
  return undefined;
}
