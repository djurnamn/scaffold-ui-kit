// The minimal Svelte shell's page: what the host page holds before the shell
// mounts. The head keeps a mark for the life of the page; the root shows a
// note and a picture served from beside this module, which the shell mounts
// over.
import { fileURLToPath } from 'node:url';
import { defineShellPage } from '@scaffold-ui-kit/preview/shell';

const mark = fileURLToPath(new URL('./mark.svg', import.meta.url));

export default defineShellPage({
  head: '<meta name="svelte-shell-page" content="start" />',
  root: ({ asset }) =>
    `<p data-svelte-shell-note>one moment</p><img data-svelte-shell-mark src="${asset(mark)}" alt="" />`,
});
