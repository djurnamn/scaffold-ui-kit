// The host page's bootstrap: the one module that reads the build aliases. It
// loads the shell the kit configured (`@preview-shell`), checks it, builds the
// controller with the shell's own options (resolved against the catalog when
// the shell gives them as a function), and mounts the shell into the root
// element. During development a changed shell is unmounted and the new one
// mounted over the same controller, so the selection and the editor's tree
// survive an edit to the shell.
import shellModule from '@preview-shell';
import { createHostController } from './bootstrap';
import { acceptShell, mountShell } from './shell-host';

const root = document.getElementById('root')!;
const shell = acceptShell(shellModule, root);

/** The host's controller, built once per page load. */
export const controller = createHostController(shell);

let unmountShell = mountShell(shell, root, controller);

/** Unmount the shell; the controller stays. */
export function unmount(): void {
  unmountShell();
}

if (import.meta.hot) {
  import.meta.hot.accept('@preview-shell', (updated) => {
    if (!updated) return;
    unmountShell();
    unmountShell = mountShell(acceptShell(updated.default, root), root, controller);
  });
}
