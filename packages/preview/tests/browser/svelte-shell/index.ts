// A second, deliberately minimal shell, written in Svelte, that the browser
// tests run the fixture kit with: proof that the shell contract carries a
// shell of another framework and another layout. It imports the preview by
// its public shell entry alone, the way a kit's own shell would; the tests
// copy it into the prepared kit, where that entry resolves through the kit's
// installed copy of the preview. Its two options change its own layout and
// never reach the kit's iframes: `density`, and `focus`, which shows one
// target's pane alone. `focus` offers the kit's own targets, so the
// options are a function of the catalog.
import { mount, unmount } from 'svelte';
import { defineShell, PREVIEW_SHELL_API_VERSION } from '@scaffold-ui-kit/preview/shell';
import { CONTROLLER_CONTEXT } from './context';
import Shell from './shell.svelte';

export default defineShell({
  apiVersion: PREVIEW_SHELL_API_VERSION,
  options: (catalog) => [
    {
      id: 'density',
      label: 'density',
      values: [
        { value: 'compact', label: 'compact' },
        { value: 'roomy', label: 'roomy' },
      ],
      default: 'compact',
    },
    {
      id: 'focus',
      label: 'focus',
      values: [
        { value: 'all', label: 'all' },
        ...catalog.targets.map((target) => ({ value: target, label: target })),
      ],
      default: 'all',
    },
  ],
  mount(root, controller) {
    const application = mount(Shell, { target: root, context: new Map([[CONTROLLER_CONTEXT, controller]]) });
    return () => {
      void unmount(application);
    };
  },
});
