// The charcell shell: the preview's interface drawn in charcell's terminal
// look. `charcellShell(configuration)` makes a shell with fills for its named
// slots and a mapping of option groups to its regions; the module's default
// export is the shell with no configuration, so a kit can name this module
// as its `preview.shell`. The shell is built on the preview's
// public shell contract and React bindings alone.
import { createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { defineShell, PREVIEW_SHELL_API_VERSION, type PreviewController, type PreviewShell } from '../../../src/shell';
import { CharcellApplication } from './shell';
import type { CharcellRegion, CharcellShellConfiguration, CharcellSlotFill, CharcellSlotName } from './configuration';

export type { CharcellRegion, CharcellShellConfiguration, CharcellSlotFill, CharcellSlotName };

/**
 * Make the charcell shell, with content for its slots and a placement for
 * the kit's option groups.
 *
 * @param configuration - The slot fills and the group placement.
 * @returns The shell, for a kit's shell module to default-export.
 * @example
 * ```tsx
 * import { charcellShell, reactFill } from '@scaffold-ui-kit/preview/shells/charcell';
 *
 * export default charcellShell({
 *   slots: {
 *     'top-bar-end': reactFill((controller) => <KitVersionPicker controller={controller} />),
 *     'status-bar': (element, controller) => mountBadge(element, controller),
 *   },
 *   groups: { canvas: 'status-bar' },
 * });
 * ```
 */
export function charcellShell(configuration: CharcellShellConfiguration = {}): PreviewShell {
  return defineShell({
    apiVersion: PREVIEW_SHELL_API_VERSION,
    // Whether the navigation shows, which of the stage's four views show (the
    // scenario row, the preview panes, the code panes and the events log),
    // and whether the code panes wrap their lines, kept in the address.
    options: [
      { id: 'navigation', label: 'navigation', default: true },
      { id: 'scenario', label: 'scenario', default: false },
      { id: 'output', label: 'output', default: true },
      { id: 'code', label: 'code', default: false },
      { id: 'events', label: 'events', default: false },
      { id: 'wrap', label: 'wrap', default: true },
    ],
    mount(root, controller) {
      const reactRoot = createRoot(root);
      reactRoot.render(createElement(CharcellApplication, { controller, configuration }));
      return () => reactRoot.unmount();
    },
  });
}

/**
 * A slot fill written in React: `render` runs as a component of its own
 * React tree inside the slot's element, so it may use hooks, such as
 * `usePreview(controller, selector)` from `@scaffold-ui-kit/preview/react`.
 *
 * @param render - Renders the fill for the preview's controller.
 * @returns The fill, for a slot of {@link charcellShell}.
 * @example
 * ```tsx
 * reactFill((controller) => <span>{controller.catalog.kitName}</span>)
 * ```
 */
export function reactFill(render: (controller: PreviewController) => ReactNode): CharcellSlotFill {
  return (element, controller) => {
    const root = createRoot(element);
    root.render(createElement(ReactFill, { controller, render }));
    // The shell unmounts its slots from inside its own React commit, and a
    // root cannot be unmounted while another is rendering: so, just after.
    return () => queueMicrotask(() => root.unmount());
  };
}

function ReactFill(props: { controller: PreviewController; render: (controller: PreviewController) => ReactNode }) {
  return props.render(props.controller);
}

export default charcellShell();
