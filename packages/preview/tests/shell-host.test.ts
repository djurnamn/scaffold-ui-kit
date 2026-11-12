// @vitest-environment happy-dom
// The host page's handling of a shell (application/host/shell-host.ts): a
// shell of another contract version is refused with the reason in the page
// and thrown, and a changed shell is mounted over the same controller, so
// what was selected and edited survives the swap. The bootstrap resolves a
// shell's options against the catalog before it builds the controller.

import { afterEach, describe, expect, it, vi } from 'vitest';
import manifest from './fixtures/host/manifest.json';
import { options as previewOptions } from './fixtures/host/preview-configuration';
import { views } from './fixtures/host/views';
import { acceptShell, mountShell } from '../application/host/shell-host';
import { defineShell, type PreviewController } from '../src/shell';
import {
  catalogFromManifest,
  createPreviewController,
  type CatalogManifest,
} from '../src/controller';

const CARD = 'components-layout-card';

describe('acceptShell', () => {
  it('refuses a shell of another version: the reason in the page, and thrown', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>stale</p>';
    expect(() => acceptShell({ apiVersion: 3, mount: () => {} }, root)).toThrow(
      '[preview] The configured shell cannot be used. This preview serves shell API version 1, and the shell declares version 3.',
    );
    expect(root.querySelector('[data-preview-shell-problem]')?.textContent).toContain('declares version 3');
    expect(root.querySelector('p')).toBeNull();
  });

  it('returns a shell it serves', () => {
    const shell = defineShell({ apiVersion: 1, mount: () => {} });
    expect(acceptShell(shell, document.createElement('div'))).toBe(shell);
  });
});

describe('mountShell and a hot remount', () => {
  let controller: PreviewController | undefined;

  afterEach(() => {
    controller?.dispose();
    window.history.replaceState(null, '', '/');
  });

  it('mounts the next shell over the same controller, keeping the selection and the editor’s tree', () => {
    window.history.replaceState(null, '', '/');
    controller = createPreviewController({
      catalog: catalogFromManifest(manifest as CatalogManifest, views),
      options: previewOptions,
      regeneration: async () => {},
    });
    const root = document.createElement('div');
    const mounted: PreviewController[] = [];
    const unmountFirst = vi.fn();
    const first = defineShell({
      apiVersion: 1,
      mount(element, given) {
        mounted.push(given);
        element.textContent = 'first';
        return unmountFirst;
      },
    });
    const second = defineShell({
      apiVersion: 1,
      mount(element, given) {
        mounted.push(given);
        element.textContent = `second: ${given.getState().selection.id}`;
      },
    });

    let unmount = mountShell(first, root, controller);
    expect(root.textContent).toBe('first');
    controller.actions.selectComponent(CARD);
    controller.editor.open();
    controller.editor.setText([{ slot: 'header', index: 0 }], 'Edited');

    // What the bootstrap does on a hot update of the shell module.
    unmount();
    expect(unmountFirst).toHaveBeenCalledTimes(1);
    expect(root.textContent).toBe('');
    unmount = mountShell(second, root, controller);

    expect(mounted).toEqual([controller, controller]);
    expect(root.textContent).toBe(`second: ${CARD}`);
    const state = controller.getState();
    expect(state.selection).toEqual({ kind: 'component', id: CARD });
    expect(state.editor.open).toBe(true);
    expect(state.editor.tree?.slots.header?.[0]).toMatchObject({ kind: 'text', value: 'Edited' });
    unmount();
  });
});

describe('the bootstrap and a shell whose options depend on the catalog', () => {
  afterEach(() => {
    vi.doUnmock('@preview-shell');
    vi.doUnmock('@preview-configuration');
    vi.resetModules();
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });

  it("calls the options with the kit's catalog before it builds the controller", async () => {
    vi.resetModules();
    vi.doMock('@preview-configuration', () => import('./fixtures/host/preview-configuration'));
    const seen: unknown[] = [];
    vi.doMock('@preview-shell', () => ({
      default: defineShell({
        apiVersion: 1,
        options(catalog) {
          seen.push(catalog.kitName);
          return [
            {
              id: 'pane',
              label: 'pane',
              values: catalog.targets.map((target) => ({ value: target, label: target })),
              default: catalog.targets[0],
            },
          ];
        },
        mount: () => {},
      }),
    }));
    document.body.innerHTML = '<div id="root"></div>';
    // Held in a variable so the workspace type-check does not follow the
    // import into the app, whose build-time aliases only its own config maps.
    const mainModule = '../application/host/main';
    const entry = (await import(/* @vite-ignore */ mainModule)) as { controller: PreviewController };
    expect(seen).toEqual(['acme']);
    const pane = entry.controller.options.find((option) => option.id === 'shell.pane');
    expect(pane?.values?.map((choice) => choice.value)).toEqual(['react', 'vue', 'svelte']);
    expect(entry.controller.getState().options['shell.pane']).toBe('react');
    entry.controller.dispose();
  });
});
