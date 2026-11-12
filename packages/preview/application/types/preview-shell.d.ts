// The shell module as the app type-checks against it: `@preview-shell` is
// aliased at build time to the module `preview.shell` names, whose
// default export is a shell.
import type { PreviewShell } from '../../src/shell';

declare const shell: PreviewShell;
export default shell;
