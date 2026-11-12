// @vitest-environment happy-dom
// The shell contract (src/shell.ts) and the shell's own options in the
// controller: `defineShell` and the refusal of a shell written against
// another contract version, and a shell option's namespaced id in the
// state, the address and local storage, never in what the iframes receive.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import manifest from './fixtures/host/manifest.json';
import { options as previewOptions } from './fixtures/host/preview-configuration';
import { views } from './fixtures/host/views';
import {
  defineShell,
  PREVIEW_SHELL_API_VERSION,
  shellOptionId,
  type PreviewController,
  type PreviewShellOption,
} from '../src/shell';
import { shellOptionsFor, shellProblem } from '../src/shell-acceptance';
import {
  catalogFromManifest,
  createPreviewController,
  storageKey,
  type CatalogManifest,
} from '../src/controller';
import { installPreviewEnvironment, postFromFrame, type PreviewEnvironment } from './support/preview-environment';

const catalog = catalogFromManifest(manifest as CatalogManifest, views);

const SHELL_OPTIONS: PreviewShellOption[] = [
  {
    id: 'mode',
    label: 'mode',
    values: [
      { value: 'light', label: 'light' },
      { value: 'dark', label: 'dark' },
    ],
    default: 'light',
  },
  { id: 'dense', label: 'dense', default: false, group: 'layout' },
];

describe('defineShell and shellProblem', () => {
  it('returns the shell it is given', () => {
    const shell = defineShell({ apiVersion: 1, mount: () => {} });
    expect(shell.apiVersion).toBe(PREVIEW_SHELL_API_VERSION);
    expect(shellProblem(shell)).toBeUndefined();
  });

  it('refuses a shell of another contract version, naming both versions', () => {
    expect(shellProblem({ apiVersion: 2, mount: () => {} })).toBe(
      'This preview serves shell API version 1, and the shell declares version 2.',
    );
    expect(shellProblem({ mount: () => {} })).toBe(
      'This preview serves shell API version 1, and the shell declares version undefined.',
    );
  });

  it("gives a shell's options, calling them with the catalog when they are a function", () => {
    expect(shellOptionsFor({}, catalog)).toEqual([]);
    expect(shellOptionsFor({ options: SHELL_OPTIONS }, catalog)).toBe(SHELL_OPTIONS);
    expect(
      shellOptionsFor(
        { options: (given) => [{ id: 'kit', label: given.kitName, default: false }] },
        catalog,
      ),
    ).toEqual([{ id: 'kit', label: 'acme', default: false }]);
  });

  it('refuses what is not a shell', () => {
    expect(shellProblem(undefined)).toMatch(/does not default-export a shell/);
    expect(shellProblem({ apiVersion: 1 })).toMatch(/no mount function/);
  });
});

describe('the shell options in the controller', () => {
  const controllers: PreviewController[] = [];
  const storage = () => window.localStorage;

  function create(persistence?: 'url' | 'url-and-local-storage'): PreviewController {
    const controller = createPreviewController({
      catalog,
      options: previewOptions,
      shellOptions: SHELL_OPTIONS,
      persistence,
    });
    controllers.push(controller);
    return controller;
  }

  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
  });

  afterEach(() => {
    for (const controller of controllers.splice(0)) controller.dispose();
  });

  it('lists them after the kit options, namespaced, global, and marked as the shell’s', () => {
    const controller = create();
    const shell = controller.options.filter((option) => option.origin === 'shell');
    expect(shell.map((option) => [option.id, option.scope, option.group])).toEqual([
      ['shell.mode', 'global', undefined],
      ['shell.dense', 'global', 'layout'],
    ]);
    expect(controller.options.slice(0, previewOptions.length).every((option) => option.origin === 'kit')).toBe(true);
    expect(shellOptionId('mode')).toBe('shell.mode');
  });

  it('keeps their values in the state and the address, apart from the kit’s', () => {
    const controller = create();
    expect(controller.getState().options['shell.mode']).toBe('light');
    controller.actions.setOption('shell.mode', 'dark');
    expect(controller.getState().options['shell.mode']).toBe('dark');
    expect(controller.getState().options.theme).toBe('light');
    expect(window.location.search).toBe('?component=components-button&option.shell.mode=dark');
  });

  it('reads them back from a deep link', () => {
    window.history.replaceState(null, '', '/?option.shell.dense=true&option.shell.mode=sepia');
    const controller = create();
    expect(controller.getState().options['shell.dense']).toBe(true);
    // A value the option cannot hold is ignored.
    expect(controller.getState().options['shell.mode']).toBe('light');
  });

  it('remembers them in local storage with the kit’s globals', () => {
    const controller = create('url-and-local-storage');
    controller.actions.setOption('shell.dense', true);
    controller.actions.setOption('theme', 'dark');
    expect(JSON.parse(storage().getItem(storageKey('acme'))!)).toEqual({ theme: 'dark', 'shell.dense': true });
    controller.dispose();
    window.history.replaceState(null, '', '/');
    expect(create('url-and-local-storage').getState().options).toMatchObject({ theme: 'dark', 'shell.dense': true });
  });

  it('never sends them to the iframes', async () => {
    const environment: PreviewEnvironment = installPreviewEnvironment();
    try {
      const controller = create();
      const element = document.createElement('div');
      document.body.appendChild(element);
      controller.frames.mount(element, 'react');
      postFromFrame(environment, element.querySelector('iframe')!, { type: 'preview:ready' });
      controller.actions.setOption('shell.mode', 'dark');
      const globals = environment.log
        .map((entry) => entry.message as { type: string; options: object })
        .filter((message) => message.type === 'preview:globals');
      // The ready handshake's globals alone: a shell option's change posts nothing.
      expect(globals).toHaveLength(1);
      for (const message of globals) expect(Object.keys(message.options)).toEqual(['theme', 'mode', 'box', 'padded']);
      element.remove();
    } finally {
      await environment.restore();
    }
  });
});
