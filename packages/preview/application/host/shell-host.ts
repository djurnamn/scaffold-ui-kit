// How the host page takes a shell: it checks the module's default export
// against the contract version it serves, refusing one it cannot serve with a
// message shown in the page as well as thrown, and mounts an accepted shell
// into the root element over the controller. Framework-free; the bootstrap
// (main.ts) calls it on load and again on a hot update of the shell.
import type { PreviewController, PreviewShell } from '../../src/shell';
import { shellProblem } from '../../src/shell-acceptance';

/**
 * The shell a module default-exports, once checked. A module whose export is
 * not a shell this preview serves is refused: the reason is written into
 * `root` for the person looking at the page and thrown for the console.
 *
 * @param candidate - The shell module's default export.
 * @param root - The host page's root element.
 * @returns The shell.
 */
export function acceptShell(candidate: unknown, root: HTMLElement): PreviewShell {
  const problem = shellProblem(candidate);
  if (problem !== undefined) {
    const message = `[preview] The configured shell cannot be used. ${problem}`;
    root.replaceChildren();
    const notice = root.ownerDocument.createElement('pre');
    notice.setAttribute('data-preview-shell-problem', '');
    notice.textContent = message;
    root.appendChild(notice);
    throw new Error(message);
  }
  return candidate as PreviewShell;
}

/**
 * Mount `shell` into `root`, emptied first, over `controller`.
 *
 * @param shell - An accepted shell.
 * @param root - The host page's root element.
 * @param controller - The preview's controller, which outlives the shell.
 * @returns A function that unmounts the shell and empties the root.
 */
export function mountShell(shell: PreviewShell, root: HTMLElement, controller: PreviewController): () => void {
  root.replaceChildren();
  const unmount = shell.mount(root, controller);
  return () => {
    unmount?.();
    root.replaceChildren();
  };
}
