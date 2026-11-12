// @vitest-environment happy-dom
// The preview controller on its own (src/controller): what the host
// characterization tests (tests/host.test.ts) do not reach through a shell's
// actions - the catalog built from a manifest, the rules behind `createNode`
// and `resolveDrop`, a controller without a regeneration transport, the handshake's
// source check, the lifetime of the editor's tree, and the helpers a shell
// builds on (the store view, `select`, `moveBy`, `nodeSlots`, the kit's
// targets).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import manifest from './fixtures/host/manifest.json';
import { options as previewOptions } from './fixtures/host/preview-configuration';
import { views } from './fixtures/host/views';
import {
  catalogFromManifest,
  createPreviewController,
  DEFAULT_PANE_WIDTHS,
  nodeAddSlots,
  nodeSlots,
  previewStore,
  scenarioChoices,
  storyFrameKey,
  type CatalogManifest,
  type PreviewController,
  type PreviewState,
} from '../src/controller';
import { buildManifest } from '../src/emit/manifest';
import { resolveStory } from '../src/model';

const BUTTON = 'components-button';
const CARD = 'components-layout-card';

const catalog = catalogFromManifest(manifest as CatalogManifest, views);

// The controller keeps its state in the page's query parameters: each test starts bare.
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
});

function create(options: Partial<Parameters<typeof createPreviewController>[0]> = {}): PreviewController {
  return createPreviewController({ catalog, options: previewOptions, ...options });
}

describe('catalogFromManifest', () => {
  it('orders the sources, strips their labels from short titles and marks the components that are not standalone', () => {
    expect(catalog.kitName).toBe('acme');
    expect(catalog.kitVersion).toBe('1.2.3');
    expect(catalog.sources.map((source) => source.id)).toEqual(['core', 'icons']);
    expect(catalog.components.map((component) => [component.id, component.shortTitle, component.standalone])).toEqual([
      [BUTTON, 'Button', true],
      [CARD, 'Layout/Card', true],
      ['components-layout-tab', 'Layout/Tab', false],
      ['icons-icon', 'Icon', true],
    ]);
    expect(catalog.colorTokens).toEqual([null, 'primary', 'accent']);
    expect(catalog.htmlTags).toContain('section');
  });

  it("carries each prop's declaration beside its control, apart from the story's defaults", () => {
    const button = catalog.components.find((component) => component.id === BUTTON)!;
    expect(button.propTypes[0]).toEqual({
      name: 'variant',
      control: 'select',
      options: ['solid', 'ghost'],
      include: true,
      declaredType: "'solid' | 'ghost'",
      required: false,
      declaredDefault: 'solid',
    });
    const card = catalog.components.find((component) => component.id === CARD)!;
    expect(card.propTypes.map(({ name, required, declaredDefault }) => [name, required, declaredDefault])).toEqual([
      ['elevated', false, false],
      ['tone', false, undefined],
    ]);
  });

  it('gives a component with slot content the Empty scenario first, labeled as the kit says', () => {
    const button = catalog.components.find((component) => component.id === BUTTON)!;
    expect(button.scenarios[0]).toEqual({ id: 'empty', label: 'Blank', props: {}, empty: true });
    const icon = catalog.components.find((component) => component.id === 'icons-icon')!;
    expect(icon.scenarios.map((scenario) => scenario.id)).toEqual(['heart']);
  });

  it('builds the navigation: the root source hoisted, views and the component tree by order, other sources grouped', () => {
    expect(catalog.navigation).toEqual([
      { kind: 'view', id: 'gallery', label: 'Gallery' },
      {
        kind: 'group',
        key: 'components:core',
        label: 'Components',
        children: [
          {
            kind: 'group',
            key: 'components:core/Layout',
            label: 'Layout',
            children: [{ kind: 'component', id: CARD, label: 'Card', title: 'Components/Layout/Card' }],
          },
          { kind: 'component', id: BUTTON, label: 'Button', title: 'Components/Button' },
        ],
      },
      {
        kind: 'group',
        key: 'source:icons',
        label: 'Icons',
        children: [
          {
            kind: 'group',
            key: 'components:icons',
            label: 'Components',
            children: [{ kind: 'component', id: 'icons-icon', label: 'Icon', title: 'Icons/Icon' }],
          },
        ],
      },
    ]);
    expect(catalog.views).toEqual([{ id: 'gallery', label: 'Gallery', framework: 'dom', source: 'core', order: 0 }]);
  });

  it("gives a source whose views set no component tree its tree, labeled Components, first among its order's entries", () => {
    const withViews = catalogFromManifest(manifest as CatalogManifest, [
      ...views,
      { id: 'glyphs', label: 'Glyphs', source: 'icons', mount: () => {} },
      { id: 'sizes', label: 'Sizes', source: 'icons', order: -1, mount: () => {} },
    ]);
    const icons = withViews.navigation.find((node) => node.kind === 'group' && node.key === 'source:icons');
    expect(icons?.kind === 'group' && icons.children.map((child) => child.label)).toEqual(['Sizes', 'Components', 'Glyphs']);
  });

  it('lists the scenario choices with the baseline first, or none without a real choice', () => {
    const [button, card, , icon] = catalog.components;
    const regenerating = { regeneration: true };
    expect(scenarioChoices(button, regenerating)).toEqual([
      { value: '', label: '(default)' },
      { value: 'empty', label: 'Blank' },
      { value: 'ghost', label: 'Ghost' },
      { value: 'disabled-true', label: 'disabled' },
    ]);
    expect(scenarioChoices(card, regenerating)[0]).toEqual({ value: 'raised', label: 'Raised (default)' });
    expect(scenarioChoices(icon, regenerating)).toEqual([{ value: '', label: '(default)' }, { value: 'heart', label: 'Heart' }]);
    expect(scenarioChoices({ ...icon, scenarios: [] }, regenerating)).toEqual([]);
  });

  it('leaves the Empty scenario out where the preview cannot regenerate', () => {
    const [button] = catalog.components;
    expect(scenarioChoices(button, { regeneration: false })).toEqual([
      { value: '', label: '(default)' },
      { value: 'ghost', label: 'Ghost' },
      { value: 'disabled-true', label: 'disabled' },
    ]);
    // A component whose only other scenario is Empty offers no choice at all.
    const onlyEmpty = { ...button, scenarios: button.scenarios.filter((scenario) => scenario.empty) };
    expect(scenarioChoices(onlyEmpty, { regeneration: false })).toEqual([]);
  });
});

describe('createPreviewController', () => {
  let controller: PreviewController;

  beforeEach(() => {
    controller = create({ regeneration: async () => {} });
  });

  afterEach(() => {
    controller.dispose();
  });

  it('starts on the first story with its options merged and every target on', () => {
    const state = controller.getState();
    expect(state.selection).toEqual({ kind: 'component', id: BUTTON });
    expect(state.scenario).toBe('');
    expect(state.options).toEqual({ theme: 'light', mode: false, box: true, padded: false });
    expect(state.targets).toEqual({
      supported: ['react', 'vue', 'svelte'],
      visible: ['react', 'vue', 'svelte'],
      panes: ['react', 'vue', 'svelte'],
    });
    expect(state.editor).toEqual({ open: false, modified: false });
    expect(state.regeneration).toEqual({ status: 'idle' });
    expect(controller.capabilities.regeneration).toBe(true);
    expect(controller.apiVersion).toBe(1);
  });

  it('notifies subscribers with each new state and keeps unchanged slices by reference', () => {
    const states: PreviewState[] = [];
    const stop = controller.subscribe((state) => states.push(state));
    const before = controller.getState();
    controller.actions.setOption('theme', 'dark');
    expect(states).toHaveLength(1);
    expect(states[0].options.theme).toBe('dark');
    expect(states[0].targets).toBe(before.targets);
    stop();
    controller.actions.setOption('theme', 'light');
    expect(states).toHaveLength(1);
  });

  it('routes a story option and a global option by the descriptor, and marks the unavailable ones', () => {
    controller.actions.selectComponent(CARD);
    expect(controller.getState().unavailableOptions).toEqual(['box']);
    controller.actions.setOption('padded', false);
    controller.actions.setOption('mode', true);
    expect(controller.getState().options).toEqual({ theme: 'light', mode: true, box: true, padded: false });
    controller.actions.selectComponent(BUTTON);
    // The story override is gone, the global value stays.
    expect(controller.getState().options).toEqual({ theme: 'light', mode: true, box: true, padded: false });
    expect(controller.getState().unavailableOptions).toEqual([]);
  });

  it('ignores a component that is not standalone or unknown and an unknown view', () => {
    const before = controller.getState();
    controller.actions.selectComponent('components-layout-tab');
    controller.actions.selectComponent('missing');
    controller.actions.selectView('missing');
    expect(controller.getState()).toBe(before);
  });

  describe('editor.createNode', () => {
    it('makes text and html nodes', () => {
      expect(controller.editor.createNode({ kind: 'text', value: 'Hi' })).toEqual({ kind: 'text', value: 'Hi' });
      expect(controller.editor.createNode({ kind: 'html', tag: 'section' })).toEqual({
        kind: 'html',
        tag: 'section',
        props: {},
        slots: {},
      });
    });

    it('brings a component in empty by default, with its defaults and content as default, or on a scenario', () => {
      expect(controller.editor.createNode({ kind: 'component', name: 'Card' })).toEqual({
        kind: 'element',
        component: 'Card',
        props: {},
        slots: {},
      });
      // The baseline scenario's props over the defaults, and the curated content;
      // a string `children` becomes no prop.
      expect(controller.editor.createNode({ kind: 'component', name: 'Card', importAs: 'default' })).toEqual({
        kind: 'element',
        component: 'Card',
        props: { elevated: true },
        slots: {
          default: [{ kind: 'element', component: 'Button', props: { variant: 'ghost' }, slots: { default: [{ kind: 'text', value: 'Go' }] } }],
          header: [{ kind: 'text', value: 'Title' }],
        },
      });
      expect(
        controller.editor.createNode({ kind: 'component', name: 'Card', importAs: { scenario: 'toned' } }),
      ).toMatchObject({ props: { elevated: false, tone: 'accent' } });
      // A scenario it does not have falls back to the defaults.
      expect(
        controller.editor.createNode({ kind: 'component', name: 'Card', importAs: { scenario: 'missing' } }),
      ).toMatchObject({ props: { elevated: false } });
    });

    it('always brings a component without slot content or scenarios in with its defaults', () => {
      const icon = catalog.components.find((component) => component.name === 'Icon')!;
      const bare = { ...catalog, components: [{ ...icon, scenarios: [] }] };
      const own = create({ catalog: bare });
      expect(own.editor.createNode({ kind: 'component', name: 'Icon' })).toEqual({
        kind: 'element',
        component: 'Icon',
        props: { name: 'star' },
        slots: {},
      });
      own.dispose();
      // With a scenario to pick, the choice is real and `empty` is honored.
      expect(controller.editor.createNode({ kind: 'component', name: 'Icon' })).toEqual({
        kind: 'element',
        component: 'Icon',
        props: {},
        slots: {},
      });
    });

    it('refuses a component the catalog does not have', () => {
      expect(() => controller.editor.createNode({ kind: 'component', name: 'Nope' })).toThrow(/no component named "Nope"/);
    });
  });

  it('resolves a sortable drop into a move, counting the target before the removal', () => {
    const list = { parent: [], slot: 'default' };
    expect(
      controller.editor.resolveDrop({ source: list, target: list, sameList: true, fromIndex: 0, toIndex: 2 }),
    ).toEqual({ from: [{ slot: 'default', index: 0 }], to: { parent: [], slot: 'default', index: 3 } });
    expect(
      controller.editor.resolveDrop({ source: list, target: list, sameList: true, fromIndex: 2, toIndex: 0 }),
    ).toEqual({ from: [{ slot: 'default', index: 2 }], to: { parent: [], slot: 'default', index: 0 } });
    const header = { parent: [], slot: 'header' };
    expect(
      controller.editor.resolveDrop({ source: list, target: header, sameList: false, fromIndex: 1, toIndex: 1 }),
    ).toEqual({ from: [{ slot: 'default', index: 1 }], to: { parent: [], slot: 'header', index: 1 } });
  });

  it('keeps the tree when the editor closes and shows it again on open', () => {
    controller.actions.selectComponent(CARD);
    controller.editor.open();
    controller.editor.setText([{ slot: 'header', index: 0 }], 'Hello');
    const tree = controller.getState().editor.tree;
    controller.editor.close();
    expect(controller.getState().editor).toEqual({ open: false, tree, modified: true });
    controller.editor.open();
    expect(controller.getState().editor.tree).toBe(tree);
  });

  it('seeds the tree on open and only then; opening on Empty keeps the empty tree', () => {
    controller.editor.open();
    expect(controller.getState().editor.tree).toEqual({
      root: 'Button',
      props: { variant: 'solid' },
      slots: { default: [{ kind: 'text', value: 'Click', id: expect.any(String) }] },
    });
    controller.actions.pickScenario('empty');
    const empty = controller.getState().editor.tree;
    expect(empty).toEqual({ root: 'Button', props: { variant: 'solid' }, slots: {} });
    controller.editor.close();
    controller.editor.open();
    expect(controller.getState().editor.tree).toBe(empty);
  });

  it('hides each iframe it mounts until the iframe shows its content, and again while it reloads', () => {
    const own = create({ catalog: { ...catalog, codeBlock: { framework: 'react' } } });
    const paneElement = document.createElement('div');
    const codeElement = document.createElement('div');
    own.frames.mount(paneElement, 'react');
    own.frames.mountCode(codeElement, 'react');
    const pane = paneElement.querySelector('iframe')!;
    const code = codeElement.querySelector('iframe')!;
    const show = (source: unknown) =>
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'preview:shown' }, source: source as Window }));
    for (const iframe of [pane, code]) {
      Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn(), location: { reload: vi.fn() } } });
      expect(iframe.style.visibility).toBe('hidden');
      expect(iframe.hasAttribute('data-preview-shown')).toBe(false);
    }

    // Another window's word shows nothing.
    show({ postMessage: vi.fn() });
    expect(pane.style.visibility).toBe('hidden');
    show(pane.contentWindow);
    show(code.contentWindow);
    for (const iframe of [pane, code]) {
      expect(iframe.style.visibility).toBe('');
      expect(iframe.hasAttribute('data-preview-shown')).toBe(true);
    }

    own.frames.reload('react');
    expect(pane.style.visibility).toBe('hidden');
    expect(pane.hasAttribute('data-preview-shown')).toBe(false);
    show(pane.contentWindow);
    expect(pane.style.visibility).toBe('');
    own.dispose();
  });

  it('answers preview:ready only from an iframe it mounted, and tracks readiness', async () => {
    const element = document.createElement('div');
    const unmount = controller.frames.mount(element, 'vue');
    const iframe = element.querySelector('iframe')!;
    expect(iframe.getAttribute('title')).toBe('vue');
    await Promise.resolve();
    expect(controller.getState().frames).toEqual({ vue: 'loading' });

    const stranger = { postMessage: vi.fn() };
    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'preview:ready' }, source: stranger as unknown as Window }),
    );
    expect(stranger.postMessage).not.toHaveBeenCalled();
    expect(controller.getState().frames).toEqual({ vue: 'loading' });

    const posted: unknown[] = [];
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: (message: unknown) => posted.push(message) } });
    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'preview:ready' }, source: iframe.contentWindow }),
    );
    expect(posted.map((message) => (message as { type: string }).type)).toEqual([
      'preview:set-story',
      'preview:globals',
      'preview:catalog',
    ]);
    expect(controller.getState().frames).toEqual({ vue: 'ready' });

    unmount();
    expect(element.querySelector('iframe')).toBeNull();
    expect(controller.getState().frames).toEqual({});
  });

  it("mounts the kit's code block for a target, answering it with the global options and the source, and the source again as it changes", () => {
    const own = create({ catalog: { ...catalog, codeBlock: { framework: 'react' } } });
    const element = document.createElement('div');
    const unmount = own.frames.mountCode(element, 'vue');
    const iframe = element.querySelector('iframe')!;
    expect(iframe.getAttribute('title')).toBe('vue code');
    expect(iframe.getAttribute('src')).toBe('/preview/code/code.html?target=vue&framework=react');
    const posted: Array<Record<string, unknown>> = [];
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: (message: Record<string, unknown>) => posted.push(message) },
    });
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'preview:ready' }, source: iframe.contentWindow }));
    expect(posted.map((message) => message.type)).toEqual(['preview:globals', 'preview:code']);
    // A code block shows source, not a story: it hears only the global options.
    const sent = Object.keys(posted[0].options as Record<string, unknown>);
    const storyOptions = previewOptions.filter((option) => option.scope === 'story').map((option) => option.id);
    expect(storyOptions.length).toBeGreaterThan(0);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.filter((id) => storyOptions.includes(id))).toEqual([]);
    expect(posted[1]).toEqual({
      type: 'preview:code',
      target: 'vue',
      language: 'vue',
      wrap: false,
      source: own.getState().code!.targets.vue,
    });
    // A code block is the block's own: it reaches no readiness in the state.
    expect(own.getState().frames).toEqual({});

    own.actions.setProps({ ...own.getState().props, children: 'Changed' });
    expect(posted.at(-1)).toMatchObject({ type: 'preview:code', target: 'vue' });
    expect(String(posted.at(-1)!.source)).toContain('Changed');

    unmount();
    expect(element.querySelector('iframe')).toBeNull();
    own.dispose();
  });

  it("tells the kit's code blocks whether the shell wraps, from the first content and on each toggle", () => {
    const own = create({ catalog: { ...catalog, codeBlock: { framework: 'react' } } });
    const element = document.createElement('div');
    own.frames.mountCode(element, 'react');
    // A shell sets its wrapping as it mounts, before the block is ready.
    own.frames.wrapCode(true);
    const iframe = element.querySelector('iframe')!;
    const posted: Array<Record<string, unknown>> = [];
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: (message: Record<string, unknown>) => posted.push(message) },
    });
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'preview:ready' }, source: iframe.contentWindow }));
    expect(posted.at(-1)).toMatchObject({ type: 'preview:code', target: 'react', wrap: true });
    const source = posted.at(-1)!.source;

    own.frames.wrapCode(false);
    expect(posted.at(-1)).toMatchObject({ type: 'preview:code', wrap: false, source });
    // The same choice again sends nothing.
    const count = posted.length;
    own.frames.wrapCode(false);
    expect(posted).toHaveLength(count);
    // A new source carries the choice as it stands.
    own.actions.setProps({ ...own.getState().props, children: 'Changed' });
    expect(posted.at(-1)).toMatchObject({ type: 'preview:code', wrap: false });
    own.dispose();
  });

  it("logs the events the selection's panes record, clears them on request and with another story", () => {
    const element = document.createElement('div');
    controller.frames.mount(element, 'react');
    const iframe = element.querySelector('iframe')!;
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } });
    const fire = (source: unknown, name: string, payload: string) =>
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'preview:event', name, payload }, source: source as Window }),
      );
    fire({ postMessage: vi.fn() }, 'onSave', '"stranger"');
    expect(controller.getState().events).toEqual([]);
    fire(iframe.contentWindow, 'onSave', '"draft"');
    fire(iframe.contentWindow, 'onClose', '');
    expect(controller.getState().events).toEqual([
      { id: 1, target: 'react', name: 'onSave', payload: '"draft"', time: expect.any(Number) },
      { id: 2, target: 'react', name: 'onClose', payload: '', time: expect.any(Number) },
    ]);
    controller.actions.clearEvents();
    expect(controller.getState().events).toEqual([]);
    fire(iframe.contentWindow, 'onSave', '"again"');
    controller.actions.selectComponent(catalog.components[1].id);
    expect(controller.getState().events).toEqual([]);
  });

  it('keeps the content size its own panes report beside their readiness, until they unmount', async () => {
    const element = document.createElement('div');
    const unmount = controller.frames.mount(element, 'vue');
    const iframe = element.querySelector('iframe')!;
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } });
    await Promise.resolve();
    const report = (source: unknown, data: Record<string, unknown>) =>
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'preview:content-size', ...data }, source: source as Window }),
      );
    const listener = vi.fn();
    controller.subscribe(listener);

    report({ postMessage: vi.fn() }, { width: 10, height: 20 });
    expect(controller.getState().frameSizes).toEqual({});

    report(iframe.contentWindow, { width: 320, height: 48 });
    expect(controller.getState().frameSizes).toEqual({ vue: { width: 320, height: 48 } });
    expect(controller.getState().frames).toEqual({ vue: 'loading' });
    expect(listener).toHaveBeenCalledTimes(1);

    // An unchanged size and a malformed one change nothing.
    report(iframe.contentWindow, { width: 320, height: 48 });
    report(iframe.contentWindow, { width: 320, height: -1 });
    report(iframe.contentWindow, { width: '320', height: 48 });
    expect(listener).toHaveBeenCalledTimes(1);

    report(iframe.contentWindow, { width: 320, height: 96 });
    expect(controller.getState().frameSizes).toEqual({ vue: { width: 320, height: 96 } });

    unmount();
    expect(controller.getState().frameSizes).toEqual({});
    expect(controller.getState().frames).toEqual({});
  });

  it('keeps the view pane\'s size under view, and a pane\'s size through a reload', async () => {
    const own = create({
      regeneration: async () => {},
      timers: { setTimeout: (callback) => callback(), clearTimeout: () => {} },
    });
    const view = document.createElement('div');
    own.frames.mountView(view, 'gallery');
    const pane = document.createElement('div');
    own.frames.mount(pane, 'react');
    const viewWindow = { postMessage: vi.fn() };
    const paneWindow = { postMessage: vi.fn() };
    Object.defineProperty(view.querySelector('iframe')!, 'contentWindow', { value: viewWindow });
    Object.defineProperty(pane.querySelector('iframe')!, 'contentWindow', { value: paneWindow });
    for (const [source, height] of [[viewWindow, 600], [paneWindow, 40]] as const)
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'preview:content-size', width: 800, height },
          source: source as unknown as Window,
        }),
      );
    expect(own.getState().frameSizes).toEqual({
      view: { width: 800, height: 600 },
      react: { width: 800, height: 40 },
    });

    // A regeneration reloads the pane, which keeps its last size until it reports again.
    own.actions.selectComponent(CARD);
    own.editor.open();
    own.editor.setText([{ slot: 'header', index: 0 }], 'Hello');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pane.querySelector('iframe')!.getAttribute('src')).toBe('/preview/react/preview.html?r=1');
    expect(own.getState().frames.react).toBe('loading');
    expect(own.getState().frameSizes.react).toEqual({ width: 800, height: 40 });
    own.dispose();
  });

  it('reports a mounted pane after mount returns, never during it', async () => {
    const calls: string[] = [];
    controller.subscribe((state) => calls.push(`notified: ${JSON.stringify(state.frames)}`));
    const element = document.createElement('div');
    calls.push('mount called');
    controller.frames.mount(element, 'react');
    controller.frames.mountView(document.createElement('div'), 'gallery');
    calls.push('mount returned');
    expect(calls).toEqual(['mount called', 'mount returned']);
    expect(controller.getState().frames).toEqual({});
    await Promise.resolve();
    expect(controller.getState().frames).toEqual({ react: 'loading', view: 'loading' });
    expect(calls.slice(2)).toHaveLength(2);
  });

  it('leaves no readiness behind for a pane unmounted before it was reported', async () => {
    const listener = vi.fn();
    controller.subscribe(listener);
    const unmount = controller.frames.mount(document.createElement('div'), 'svelte');
    unmount();
    await Promise.resolve();
    expect(controller.getState().frames).toEqual({});
    expect(listener).not.toHaveBeenCalled();
  });

  it('loads the iframes from the base URL it is given', () => {
    const own = create({ baseUrl: 'https://example.com/kit/' });
    const element = document.createElement('div');
    own.frames.mount(element, 'vue');
    own.frames.mountView(element, 'gallery');
    expect([...element.querySelectorAll('iframe')].map((iframe) => iframe.getAttribute('src'))).toEqual([
      'https://example.com/kit/preview/vue/preview.html?r=0',
      'https://example.com/kit/preview/view/view.html?view=gallery',
    ]);
    // A shell routing in the address does not move them.
    window.history.replaceState(null, '', '/docs/button#story');
    own.frames.mount(element, 'react');
    expect(element.querySelector('iframe[title="react"]')?.getAttribute('src')).toBe(
      'https://example.com/kit/preview/react/preview.html?r=0',
    );
    own.dispose();
  });

  it('listens on the window it is given, and stops and unmounts its panes on dispose', () => {
    const hostWindow = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const own = create({ window: hostWindow as unknown as Window });
    expect(hostWindow.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    const element = document.createElement('div');
    own.frames.mountView(element, 'gallery');
    expect(element.querySelector('iframe')?.getAttribute('src')).toBe('/preview/view/view.html?view=gallery');
    expect(element.querySelector('iframe')?.getAttribute('title')).toBe('gallery');
    own.dispose();
    expect(element.querySelector('iframe')).toBeNull();
    const listener = hostWindow.addEventListener.mock.calls[0][1];
    expect(hostWindow.removeEventListener).toHaveBeenCalledWith('message', listener);
  });
});

describe('actions.setProps and editor.modified', () => {
  let controller: PreviewController;

  beforeEach(() => {
    controller = create({ regeneration: async () => {} });
  });

  afterEach(() => {
    controller.dispose();
  });

  it('starts from the selected scenario\'s props, and replaces them whole', () => {
    expect(controller.getState().props).toEqual({ variant: 'solid', children: 'Click' });
    controller.actions.selectComponent(CARD);
    expect(controller.getState().props).toEqual({ elevated: true, children: 'unused' });
    controller.actions.setProps({ tone: 'accent', elevated: undefined });
    expect(controller.getState().props).toEqual({ tone: 'accent' });
    expect(controller.getState().regeneration).toEqual({ status: 'idle' });
  });

  it('keeps a closed editor\'s tree in step, and goes through setNodeProps for the root', () => {
    controller.actions.selectComponent(CARD);
    controller.editor.open();
    controller.editor.close();
    controller.actions.setProps({ elevated: false });
    expect(controller.getState().editor.tree?.props).toEqual({ elevated: false });
    controller.editor.setNodeProps([], { tone: 'primary' });
    expect(controller.getState().props).toEqual({ tone: 'primary' });
    expect(controller.getState().editor.tree?.props).toEqual({ tone: 'primary' });
    expect(controller.getState().editor.modified).toBe(false);
  });

  it('opens the editor on the props set before it, the root reading them', () => {
    controller.actions.setProps({ variant: 'ghost', children: 'Hi' });
    controller.editor.open();
    const tree = controller.getState().editor.tree!;
    expect(tree.props).toEqual({ variant: 'ghost' });
    expect(tree.slots.default).toEqual([{ kind: 'text', value: 'Hi', id: expect.any(String) }]);
    // The tree holds `children` as the root's text, and the props still show
    // it, as the panes do (it used to drop out of the props here).
    expect(controller.getState().props).toEqual({ variant: 'ghost', children: 'Hi' });
  });

  it("treats `children` as the root's text while the editor holds a tree", () => {
    const posted: unknown[] = [];
    const element = document.createElement('div');
    controller.frames.mount(element, 'react');
    Object.defineProperty(element.querySelector('iframe')!, 'contentWindow', {
      value: { postMessage: (message: unknown) => posted.push(message) },
    });
    controller.editor.open();

    // The root's props through the editor leave its text, and `children`, alone.
    controller.editor.setNodeProps([], { variant: 'ghost', children: 'Ignored' });
    expect(controller.getState().props).toEqual({ variant: 'ghost', children: 'Click' });
    expect(posted).toEqual([{ type: 'preview:props', props: { variant: 'ghost', children: 'Click' }, answers: 0 }]);
    expect(controller.getState().editor.modified).toBe(false);

    // A new `children` through setProps replaces the root's text: a content
    // edit, shown through the regenerated story.
    posted.length = 0;
    controller.actions.setProps({ variant: 'ghost', children: 'Press' });
    expect(controller.getState().editor.tree!.slots.default).toEqual([
      { kind: 'text', value: 'Press', id: expect.any(String) },
    ]);
    expect(controller.getState().props).toEqual({ variant: 'ghost', children: 'Press' });
    expect(controller.getState().editor.modified).toBe(true);
    expect(controller.getState().regeneration).toEqual({ status: 'pending' });
    expect(posted).toEqual([
      { type: 'preview:set-story', id: 'scratch', props: { variant: 'ghost' }, mount: expect.any(Number) },
    ]);

    // Leaving `children` out removes a lone text.
    controller.actions.setProps({ variant: 'ghost' });
    expect(controller.getState().editor.tree!.slots.default).toBeUndefined();
    expect(controller.getState().props).toEqual({ variant: 'ghost' });

    // Content other than a lone text carries no `children` and stays.
    controller.editor.insert({ parent: [], slot: 'default' }, { kind: 'text', value: 'One' });
    controller.editor.insert({ parent: [], slot: 'default' }, { kind: 'text', value: 'Two' });
    expect(controller.getState().props).toEqual({ variant: 'ghost' });
    const texts = controller.getState().editor.tree!.slots.default;
    controller.actions.setProps({ variant: 'solid' });
    expect(controller.getState().editor.tree!.slots.default).toBe(texts);

    // A story with default-slot content of its own shows that content, never
    // `children`: its props carry none, and a `children` given is dropped.
    controller.actions.selectComponent(CARD);
    controller.editor.open();
    const content = controller.getState().editor.tree!.slots.default;
    controller.actions.setProps({ elevated: false, children: 'Hi' });
    expect(controller.getState().editor.tree!.slots.default).toBe(content);
    expect(controller.getState().props).toEqual({ elevated: false });
    controller.editor.remove([{ slot: 'default', index: 0 }]);
    controller.editor.insert({ parent: [], slot: 'default' }, { kind: 'text', value: 'Lone' });
    expect(controller.getState().props).toEqual({ elevated: false });
  });

  it("lands a view's selectComponent props in the state", () => {
    controller.actions.selectView('gallery');
    controller.actions.selectComponent(CARD, { tone: 'primary' });
    expect(controller.getState().scenario).toBe('');
    expect(controller.getState().props).toEqual({ elevated: false, children: 'unused', tone: 'primary' });
  });

  it('marks the tree modified when its content differs from the seed, by value', () => {
    controller.actions.selectComponent(CARD);
    expect(controller.getState().editor.modified).toBe(false);
    controller.editor.open();
    expect(controller.getState().editor.modified).toBe(false);
    const header = [{ slot: 'header', index: 0 }];
    controller.editor.setText(header, 'Hello');
    expect(controller.getState().editor.modified).toBe(true);
    // Undone by hand, the content is the seed's again.
    controller.editor.setText(header, 'Title');
    expect(controller.getState().editor.modified).toBe(false);
    // A nested node's props count; the root's do not.
    controller.actions.setProps({ elevated: false });
    expect(controller.getState().editor.modified).toBe(false);
    controller.editor.setNodeProps([{ slot: 'default', index: 0 }], { variant: 'solid' });
    expect(controller.getState().editor.modified).toBe(true);
    controller.editor.setNodeProps([{ slot: 'default', index: 0 }], { variant: 'ghost' });
    expect(controller.getState().editor.modified).toBe(false);
    controller.editor.remove(header);
    expect(controller.getState().editor.modified).toBe(true);
    // A new seed starts unmodified.
    controller.actions.pickScenario('toned');
    expect(controller.getState().editor).toMatchObject({ open: true, modified: false });
    controller.editor.moveBy([{ slot: 'default', index: 0 }], 1);
    controller.actions.selectComponent(BUTTON);
    expect(controller.getState().editor).toEqual({ open: false, modified: false });
  });

  it('starts the Empty scenario unmodified, and counts content added to it', () => {
    controller.actions.pickScenario('empty');
    expect(controller.getState().editor).toMatchObject({ open: false, modified: false });
    controller.editor.open();
    controller.editor.insert({ parent: [], slot: 'default' }, controller.editor.createNode({ kind: 'text', value: 'x' }));
    expect(controller.getState().editor.modified).toBe(true);
  });
});

describe('scenarios that set option values', () => {
  // The fixture's manifest with option values on three scenarios: Button's
  // Ghost sets the theme (global) and box (story), and names an unknown option
  // and a value `mode` cannot hold, both ignored; Card's baseline Raised
  // turns `mode` on; its Toned sets `box`, which Card makes unavailable.
  const carrying = catalogFromManifest(
    {
      ...(manifest as CatalogManifest),
      components: (manifest as CatalogManifest).components.map((component) => ({
        ...component,
        scenarios: component.scenarios.map((scenario) =>
          scenario.id === 'ghost'
            ? { ...scenario, options: { theme: 'dark', box: false, unknown: 'x', mode: 'nope' } }
            : scenario.id === 'raised'
              ? { ...scenario, options: { mode: true } }
              : scenario.id === 'toned'
                ? { ...scenario, options: { box: false } }
                : scenario,
        ),
      })),
    } as CatalogManifest,
    views,
  );
  let controller: PreviewController;

  beforeEach(() => {
    controller = create({ catalog: carrying, regeneration: async () => {} });
  });

  afterEach(() => {
    controller.dispose();
  });

  it('sets them on a pick, a global one for the session and a story one for the story', () => {
    controller.actions.pickScenario('ghost');
    expect(controller.getState().options).toEqual({ theme: 'dark', mode: false, box: false, padded: false });
    expect(window.location.search).toBe(`?component=${BUTTON}&scenario=ghost&option.theme=dark&option.box=false`);
    // Another scenario keeps them: it sets none of its own.
    controller.actions.pickScenario('disabled-true');
    expect(controller.getState().options).toEqual({ theme: 'dark', mode: false, box: false, padded: false });
    // Another story keeps the global one; its story options start over, and
    // its baseline scenario sets `mode`.
    controller.actions.selectComponent(CARD);
    expect(controller.getState().scenario).toBe('raised');
    expect(controller.getState().options).toEqual({ theme: 'dark', mode: true, box: true, padded: true });
  });

  it('posts them to the panes, and skips an option the story makes unavailable', () => {
    const element = document.createElement('div');
    controller.frames.mount(element, 'react');
    const posted: unknown[] = [];
    Object.defineProperty(element.querySelector('iframe')!, 'contentWindow', {
      value: { postMessage: (message: unknown) => posted.push(message) },
    });
    controller.actions.pickScenario('ghost');
    expect(posted).toContainEqual({
      type: 'preview:globals',
      options: { theme: 'dark', mode: false, box: false, padded: false },
    });
    controller.actions.selectComponent(CARD);
    controller.actions.setOption('mode', false);
    controller.actions.pickScenario('toned');
    expect(controller.getState().options).toEqual({ theme: 'dark', mode: false, box: true, padded: true });
  });

  it("keeps in the address a value changed back from the scenario's, and opens it as it was", () => {
    controller.actions.pickScenario('ghost');
    controller.actions.setOption('theme', 'light');
    expect(window.location.search).toBe(`?component=${BUTTON}&scenario=ghost&option.box=false&option.theme=light`);
    const reopened = create({ catalog: carrying, regeneration: async () => {} });
    expect(reopened.getState().scenario).toBe('ghost');
    expect(reopened.getState().options).toEqual({ theme: 'light', mode: false, box: false, padded: false });
    reopened.dispose();
  });

  it('sets them when a link opens on the scenario, the values the link names winning', () => {
    window.history.replaceState(null, '', `/?component=${BUTTON}&scenario=ghost&option.box=true`);
    const linked = create({ catalog: carrying, regeneration: async () => {} });
    expect(linked.getState().options).toEqual({ theme: 'dark', mode: false, box: true, padded: false });
    linked.dispose();
    // A link to a story opens it on its baseline scenario, with that scenario's values.
    window.history.replaceState(null, '', `/?component=${CARD}`);
    const card = create({ catalog: carrying, regeneration: async () => {} });
    expect(card.getState().options.mode).toBe(true);
    card.dispose();
  });

  it("keeps a detached pane on its scenario's values over the global ones", () => {
    const element = document.createElement('div');
    controller.frames.mountStory(element, 'react', { component: BUTTON, scenario: 'ghost' });
    const iframe = element.querySelector('iframe')!;
    const posted: unknown[] = [];
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: (message: unknown) => posted.push(message) } });
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'preview:ready' }, source: iframe.contentWindow }));
    expect(posted).toContainEqual({
      type: 'preview:globals',
      options: { theme: 'dark', mode: false, box: false, padded: false },
    });
    posted.length = 0;
    controller.actions.setOption('mode', true);
    controller.actions.setOption('theme', 'light');
    expect(posted.at(-1)).toEqual({
      type: 'preview:globals',
      options: { theme: 'dark', mode: true, box: false, padded: false },
    });
    // The selection is untouched by the detached pane's scenario.
    expect(controller.getState().options.theme).toBe('light');
  });
});

describe('frames.mountStory', () => {
  let controller: PreviewController;

  beforeEach(() => {
    controller = create({ regeneration: async () => {} });
  });

  afterEach(() => {
    controller.dispose();
  });

  /** Mount a detached pane, recording what it is posted. */
  function mount(target: 'react' | 'vue' | 'svelte', story: Parameters<PreviewController['frames']['mountStory']>[2]) {
    const element = document.createElement('div');
    const unmount = controller.frames.mountStory(element, target, story);
    const iframe = element.querySelector('iframe')!;
    const posted: unknown[] = [];
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: (message: unknown) => posted.push(message) } });
    const ready = () =>
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'preview:ready' }, source: iframe.contentWindow }));
    return { element, iframe, posted, ready, unmount };
  }

  it('refuses an unknown story, one that is not standalone, a target it does not render in, and an unknown or Empty scenario', () => {
    const element = document.createElement('div');
    const mountStory = (target: 'react' | 'vue', story: { component: string; scenario?: string }) => () =>
      controller.frames.mountStory(element, target, story);
    expect(mountStory('react', { component: 'missing' })).toThrow(/no story "missing"/);
    expect(mountStory('react', { component: 'components-layout-tab' })).toThrow(/no story/);
    expect(mountStory('vue', { component: 'icons-icon' })).toThrow(/does not render in vue/);
    expect(mountStory('react', { component: BUTTON, scenario: 'nope' })).toThrow(/no scenario "nope"/);
    expect(mountStory('react', { component: BUTTON, scenario: 'empty' })).toThrow(/Empty scenario/);
    expect(element.querySelector('iframe')).toBeNull();
  });

  it('titles its iframe by the story, and reports readiness under its own key after the call returns', async () => {
    const pane = mount('svelte', { component: CARD, scenario: 'toned' });
    expect(pane.iframe.getAttribute('title')).toBe('Layout/Card: Toned (svelte)');
    const key = storyFrameKey('svelte', { component: CARD, scenario: 'toned' });
    expect(key).toBe(`svelte:${CARD}:toned`);
    expect(controller.getState().storyFrames).toEqual({});
    await Promise.resolve();
    expect(controller.getState().storyFrames).toEqual({ [key]: 'loading' });
    // The selection's panes keep `frames` to themselves.
    expect(controller.getState().frames).toEqual({});
    pane.ready();
    expect(controller.getState().storyFrames).toEqual({ [key]: 'ready' });
    pane.unmount();
    expect(controller.getState().storyFrames).toEqual({});
  });

  it('keeps its content size under its own key, apart from the selection\'s', async () => {
    const pane = mount('react', { component: CARD, scenario: 'toned' });
    const key = storyFrameKey('react', { component: CARD, scenario: 'toned' });
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'preview:content-size', width: 200, height: 120 },
        source: pane.iframe.contentWindow,
      }),
    );
    expect(controller.getState().storyFrameSizes).toEqual({ [key]: { width: 200, height: 120 } });
    expect(controller.getState().frameSizes).toEqual({});
    pane.unmount();
    expect(controller.getState().storyFrameSizes).toEqual({});
  });

  it('answers its handshake with its own story, options and the catalog', () => {
    const pane = mount('react', { component: CARD, props: { tone: 'primary', elevated: undefined } });
    controller.actions.setOption('padded', false);
    controller.actions.setOption('mode', true);
    pane.posted.length = 0;
    pane.ready();
    expect(pane.posted).toEqual([
      { type: 'preview:set-story', id: CARD, props: { elevated: true, children: 'unused', tone: 'primary' } },
      { type: 'preview:globals', options: { theme: 'light', mode: true, box: true, padded: true } },
      expect.objectContaining({ type: 'preview:catalog' }),
    ]);
  });

  it('follows a kit global option, and neither a story option nor a shell option', () => {
    const own = create({ shellOptions: [{ id: 'dense', label: 'dense', default: false }] });
    const element = document.createElement('div');
    own.frames.mountStory(element, 'react', { component: BUTTON });
    const posted: unknown[] = [];
    Object.defineProperty(element.querySelector('iframe')!, 'contentWindow', {
      value: { postMessage: (message: unknown) => posted.push(message) },
    });
    own.actions.setOption('box', false);
    own.actions.setOption('shell.dense', true);
    expect(posted).toEqual([]);
    own.actions.setOption('theme', 'dark');
    expect(posted).toEqual([{ type: 'preview:globals', options: { theme: 'dark', mode: false, box: true, padded: false } }]);
    own.dispose();
  });
});

describe('createPreviewController without a regeneration transport', () => {
  it('reports regeneration as unavailable, and an edit as an error without a request', () => {
    const controller = create();
    expect(controller.capabilities.regeneration).toBe(false);
    controller.actions.selectComponent(CARD);
    controller.editor.open();
    controller.editor.setText([{ slot: 'header', index: 0 }], 'Hello');
    expect(controller.getState().regeneration).toEqual({
      status: 'error',
      message: expect.stringContaining('cannot regenerate'),
    });
    controller.actions.selectComponent(BUTTON);
    expect(controller.getState().regeneration).toEqual({ status: 'error', message: expect.any(String) });
    controller.dispose();
  });

  it('ignores a pick of the Empty scenario, which only a regeneration can render', () => {
    const controller = create();
    const before = controller.getState();
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.actions.pickScenario('empty');
    expect(listener).not.toHaveBeenCalled();
    expect(controller.getState()).toBe(before);
    controller.dispose();
  });
});

describe('the shell helpers', () => {
  let controller: PreviewController;

  beforeEach(() => {
    controller = create({ regeneration: async () => {} });
  });

  afterEach(() => {
    controller.dispose();
  });

  describe('previewStore', () => {
    it('calls a subscriber with the current state at once, then with each new one', () => {
      const states: PreviewState[] = [];
      const stop = previewStore(controller).subscribe((state) => states.push(state));
      expect(states).toEqual([controller.getState()]);
      controller.actions.setOption('theme', 'dark');
      expect(states).toHaveLength(2);
      expect(states[1].options.theme).toBe('dark');
      stop();
      controller.actions.setOption('theme', 'light');
      expect(states).toHaveLength(2);
    });

    it('calls a slice subscriber only when its slice changes', () => {
      const scenarios: string[] = [];
      const store = previewStore(controller, (state) => state.scenario);
      const stop = store.subscribe((scenario) => scenarios.push(scenario));
      controller.actions.setOption('theme', 'dark');
      controller.actions.pickScenario('empty');
      controller.actions.setOption('mode', true);
      expect(scenarios).toEqual(['', 'empty']);
      // Each subscriber starts from the current value.
      const late: string[] = [];
      store.subscribe((scenario) => late.push(scenario))();
      expect(late).toEqual(['empty']);
      stop();
    });
  });

  describe('actions.select', () => {
    it('selects a component or a view by the selection it is handed', () => {
      controller.actions.select({ kind: 'component', id: CARD });
      expect(controller.getState().selection).toEqual({ kind: 'component', id: CARD });
      controller.actions.select({ kind: 'view', id: 'gallery' });
      expect(controller.getState().selection).toEqual({ kind: 'view', id: 'gallery' });
      const before = controller.getState();
      controller.actions.select({ kind: 'view', id: 'missing' });
      controller.actions.select({ kind: 'component', id: 'components-layout-tab' });
      expect(controller.getState()).toBe(before);
    });
  });

  it('marks every story option unavailable while a view is selected', () => {
    controller.actions.selectView('gallery');
    expect(controller.getState().unavailableOptions).toEqual(['box', 'padded']);
    controller.actions.selectComponent(BUTTON);
    expect(controller.getState().unavailableOptions).toEqual([]);
  });

  describe('editor.moveBy', () => {
    const texts = () =>
      (controller.getState().editor.tree?.slots.default ?? []).map((node) =>
        node.kind === 'text' ? node.value : node.kind,
      );

    beforeEach(() => {
      controller.editor.open();
      for (const value of ['b', 'c']) {
        controller.editor.insert({ parent: [], slot: 'default' }, controller.editor.createNode({ kind: 'text', value }));
      }
      expect(texts()).toEqual(['Click', 'b', 'c']);
    });

    it('moves a node within its slot by the offset', () => {
      controller.editor.moveBy([{ slot: 'default', index: 0 }], 1);
      expect(texts()).toEqual(['b', 'Click', 'c']);
      controller.editor.moveBy([{ slot: 'default', index: 2 }], -1);
      expect(texts()).toEqual(['b', 'c', 'Click']);
      controller.editor.moveBy([{ slot: 'default', index: 2 }], -2);
      expect(texts()).toEqual(['Click', 'b', 'c']);
    });

    it('stops at the ends of the slot and leaves the tree alone at them', () => {
      controller.editor.moveBy([{ slot: 'default', index: 0 }], 5);
      expect(texts()).toEqual(['b', 'c', 'Click']);
      const tree = controller.getState().editor.tree;
      controller.editor.moveBy([{ slot: 'default', index: 0 }], -1);
      controller.editor.moveBy([{ slot: 'default', index: 2 }], 1);
      controller.editor.moveBy([{ slot: 'default', index: 7 }], -1);
      controller.editor.moveBy([], 1);
      expect(controller.getState().editor.tree).toBe(tree);
    });

    it('moves a nested node within its own slot', () => {
      controller.editor.insert({ parent: [], slot: 'default' }, controller.editor.createNode({ kind: 'html', tag: 'p' }));
      const paragraph = [{ slot: 'default', index: 3 }];
      for (const value of ['x', 'y']) {
        controller.editor.insert({ parent: paragraph, slot: 'default' }, controller.editor.createNode({ kind: 'text', value }));
      }
      controller.editor.moveBy([...paragraph, { slot: 'default', index: 1 }], -1);
      const node = controller.getState().editor.tree!.slots.default[3];
      expect(node.kind === 'html' && node.slots.default.map((child) => (child.kind === 'text' ? child.value : ''))).toEqual([
        'y',
        'x',
      ]);
      expect(texts()).toEqual(['Click', 'b', 'c', 'html']);
    });
  });

  describe('nodeSlots', () => {
    it("lists a component's default slot and then its named ones, by the catalog", () => {
      controller.actions.selectComponent(CARD);
      controller.editor.open();
      const tree = controller.getState().editor.tree!;
      expect(nodeSlots(catalog, tree)).toEqual(['default', 'header']);
      expect(nodeSlots(catalog, tree.slots.default[0])).toEqual(['default']);
      expect(nodeSlots(catalog, controller.editor.createNode({ kind: 'component', name: 'Icon' }))).toEqual([]);
    });

    it('gives an HTML tag its default slot, and text, an opaque fill or an unknown component none', () => {
      expect(nodeSlots(catalog, { kind: 'html', tag: 'p', props: {}, slots: {} })).toEqual(['default']);
      expect(nodeSlots(catalog, { kind: 'text', value: 'Hi' })).toEqual([]);
      expect(nodeSlots(catalog, { kind: 'opaque', fill: { kind: 'raw', react: '', vue: '', svelte: '' } })).toEqual([]);
      expect(nodeSlots(catalog, { kind: 'element', component: 'Missing', props: {}, slots: {} })).toEqual([]);
    });
  });
});

describe('the pane width', () => {
  it("offers the preview's widths when the kit names none, and the kit's narrowest first when it does", () => {
    expect(catalog.paneWidths).toEqual(DEFAULT_PANE_WIDTHS);
    expect(catalog.paneWidths.map(({ label, width }) => `${label} ${width}`)).toEqual([
      'small 375',
      'medium 768',
      'large 1280',
    ]);
    const kitCatalog = catalogFromManifest(
      {
        ...(manifest as CatalogManifest),
        paneWidths: [
          { label: 'wide', width: 1440 },
          { label: 'tiny', width: 200 },
        ],
      },
      views,
    );
    expect(kitCatalog.paneWidths).toEqual([
      { label: 'tiny', width: 200 },
      { label: 'wide', width: 1440 },
    ]);
    expect(catalogFromManifest({ ...(manifest as CatalogManifest), paneWidths: [] }, views).paneWidths).toEqual([]);
  });

  it('carries the kit\'s widths through the manifest only when it names them', () => {
    expect(buildManifest([], []).paneWidths).toBeUndefined();
    const paneWidths = [{ label: 'narrow', width: 360 }];
    expect(
      buildManifest([], [], [], 'kit', {}, undefined, 'url', undefined, undefined, undefined, paneWidths).paneWidths,
    ).toEqual(paneWidths);
  });

  it('fits the panes to start with, and lays them out at a width set until it is cleared', () => {
    const controller = create();
    const states: PreviewState[] = [];
    controller.subscribe((state) => states.push(state));
    expect(controller.getState().paneWidth).toBeUndefined();
    controller.actions.setPaneWidth(768);
    expect(controller.getState().paneWidth).toBe(768);
    controller.actions.selectComponent(CARD);
    controller.actions.selectView('gallery');
    controller.actions.selectComponent(BUTTON);
    expect(controller.getState().paneWidth).toBe(768);
    controller.actions.setPaneWidth(undefined);
    expect('paneWidth' in controller.getState()).toBe(false);
    expect(states[0].paneWidth).toBe(768);
    controller.dispose();
  });

  it('ignores a width that is not a whole number from 1 to 7680, and one already set', () => {
    const controller = create();
    controller.actions.setPaneWidth(375);
    const listener = vi.fn();
    controller.subscribe(listener);
    for (const width of [0, -1, 375.5, 7681, Number.NaN, Number.POSITIVE_INFINITY, 375]) controller.actions.setPaneWidth(width);
    expect(listener).not.toHaveBeenCalled();
    expect(controller.getState().paneWidth).toBe(375);
    controller.dispose();
  });
});

describe('a kit that builds some of the targets', () => {
  const kitCatalog = catalogFromManifest({ ...(manifest as CatalogManifest), targets: ['vue', 'react'] }, views);

  it("lists the kit's targets in order and narrows each component's targets to them", () => {
    expect(catalog.targets).toEqual(['react', 'vue', 'svelte']);
    expect(kitCatalog.targets).toEqual(['react', 'vue']);
    expect(kitCatalog.components.find((component) => component.id === BUTTON)!.targets).toEqual(['react', 'vue']);
    expect(kitCatalog.components.find((component) => component.id === 'icons-icon')!.targets).toEqual(['react']);
  });

  it('offers no pane for a target the kit does not build, even turned on', () => {
    const controller = create({ catalog: kitCatalog });
    expect(controller.getState().targets).toEqual({
      supported: ['react', 'vue'],
      visible: ['react', 'vue'],
      panes: ['react', 'vue'],
    });
    controller.actions.selectComponent('icons-icon');
    expect(controller.getState().targets.panes).toEqual(['react']);
    controller.actions.setTargetVisible('svelte', true);
    expect(controller.getState().targets.visible).toEqual(['react', 'vue']);
    controller.actions.selectComponent(BUTTON);
    expect(controller.getState().targets.panes).toEqual(['react', 'vue']);
    controller.dispose();
  });
});

describe('a kit that builds html', () => {
  const htmlCatalog = catalogFromManifest(
    { ...(manifest as CatalogManifest), targets: ['react', 'vue', 'svelte', 'html'] },
    views,
  );
  const immediate = { setTimeout: (callback: () => void) => callback(), clearTimeout: () => {} };

  /** The html pane's iframe, mounted, with a stand-in window recording what it is sent. */
  function mountHtml(controller: PreviewController) {
    const element = document.createElement('div');
    const unmount = controller.frames.mount(element, 'html');
    const iframe = element.querySelector('iframe')!;
    const posted: { type: string; [key: string]: unknown }[] = [];
    const frameWindow = { postMessage: (message: { type: string }) => posted.push(message) };
    Object.defineProperty(iframe, 'contentWindow', { value: frameWindow });
    const ready = () =>
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'preview:ready' }, source: frameWindow as unknown as Window }),
      );
    return { iframe, posted, ready, unmount };
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('lists html after the targets, and leaves it out where the manifest does not name it', () => {
    expect(htmlCatalog.targets).toEqual(['react', 'vue', 'svelte', 'html']);
    expect(htmlCatalog.components.find((component) => component.id === BUTTON)!.targets).toEqual([
      'react',
      'vue',
      'svelte',
    ]);
    expect(catalog.targets).toEqual(['react', 'vue', 'svelte']);
  });

  it('gives every story an html pane, toggled like a target and kept in the address', () => {
    const controller = create({ catalog: htmlCatalog });
    expect(controller.getState().targets).toEqual({
      supported: ['react', 'vue', 'svelte', 'html'],
      visible: ['react', 'vue', 'svelte', 'html'],
      panes: ['react', 'vue', 'svelte', 'html'],
    });
    // A story that renders in React alone still has its html.
    controller.actions.selectComponent('icons-icon');
    expect(controller.getState().targets.panes).toEqual(['react', 'html']);
    controller.actions.setTargetVisible('html', false);
    expect(controller.getState().targets.panes).toEqual(['react']);
    expect(new URLSearchParams(window.location.search).get('targets')).toBe('react,vue,svelte');
    controller.actions.setTargetVisible('vue', false);
    controller.actions.setTargetVisible('html', true);
    expect(new URLSearchParams(window.location.search).get('targets')).toBe('react,svelte,html');
    controller.dispose();

    window.history.replaceState(null, '', '/?component=components-button&targets=vue,html');
    const restored = create({ catalog: htmlCatalog });
    expect(restored.getState().targets.panes).toEqual(['vue', 'html']);
    restored.dispose();
  });

  it('offers no html pane where the kit does not build html, even turned on', () => {
    const controller = create();
    controller.actions.setTargetVisible('html', true);
    expect(controller.getState().targets.panes).toEqual(['react', 'vue', 'svelte']);
    controller.dispose();
  });

  it("loads the html page, answers its handshake with the options and the story's markup, and follows it", async () => {
    const requests: unknown[] = [];
    const controller = create({
      catalog: htmlCatalog,
      timers: immediate,
      regeneration: async () => {},
      htmlSource: async (request) => {
        requests.push(request);
        const variant = String(request.props.variant ?? 'solid');
        return variant === 'missing' ? { missing: ['TimerDriver'] } : { markup: `<button>${variant}</button>` };
      },
    });
    const pane = mountHtml(controller);
    expect(pane.iframe.getAttribute('src')).toBe('/preview/html/preview.html?r=0');
    expect(pane.iframe.getAttribute('title')).toBe('html');
    await Promise.resolve();
    expect(controller.getState().frames.html).toBe('loading');
    await settle();
    pane.ready();
    expect(pane.posted).toEqual([
      { type: 'preview:globals', options: controller.getState().options },
      { type: 'preview:markup', markup: '<button>solid</button>' },
    ]);
    expect(controller.getState().frames.html).toBe('ready');

    // A scenario and a props edit each print afresh; the pane hears of each
    // state of the html once, and of no story or props message.
    pane.posted.length = 0;
    controller.actions.pickScenario('ghost');
    await settle();
    controller.actions.setProps({ ...controller.getState().props, variant: 'missing' });
    await settle();
    expect(pane.posted).toEqual([
      { type: 'preview:markup' },
      { type: 'preview:markup', markup: '<button>ghost</button>' },
      { type: 'preview:markup' },
      { type: 'preview:markup', reason: 'This story has no html: it holds TimerDriver.' },
    ]);

    // Options reach it; a regeneration does not reload it.
    pane.posted.length = 0;
    controller.actions.setOption('mode', true);
    expect(pane.posted).toEqual([{ type: 'preview:globals', options: controller.getState().options }]);
    controller.actions.selectComponent(CARD);
    controller.editor.open();
    controller.editor.setText([{ slot: 'header', index: 0 }], 'Hello');
    await settle();
    expect(pane.iframe.getAttribute('src')).toBe('/preview/html/preview.html?r=0');
    expect(controller.getState().frames.html).toBe('ready');
    // The editor's tree is printed with its content.
    expect(requests.at(-1)).toMatchObject({ rootComponent: 'Card', slots: { named: { header: expect.anything() } } });
    pane.unmount();
    expect(controller.getState().frames).toEqual({});
    controller.dispose();
  });

  it("shows the static build's reason when the props differ from the scenario's", async () => {
    const controller = create({
      catalog: htmlCatalog,
      scenarioHtmlSources: async () => ({ '': { markup: '<button>solid</button>' } }),
    });
    const pane = mountHtml(controller);
    await settle();
    pane.ready();
    controller.actions.setProps({ ...controller.getState().props, variant: 'ghost' });
    expect(pane.posted.at(-1)).toEqual({
      type: 'preview:markup',
      reason:
        'The static build prints html for the scenarios alone: there is none for changed props or edited content.',
    });
    controller.dispose();
  });

  it("sends the html pane the styles of the markup's components with it", async () => {
    const controller = create({
      catalog: htmlCatalog,
      timers: immediate,
      htmlSource: async () => ({ markup: '<button class="button">Go</button>', stylesheet: '.button { color: red; }' }),
    });
    const pane = mountHtml(controller);
    await settle();
    pane.ready();
    expect(pane.posted.at(-1)).toEqual({
      type: 'preview:markup',
      markup: '<button class="button">Go</button>',
      stylesheet: '.button { color: red; }',
    });
    expect(controller.getState().code!.html).toEqual({
      status: 'ready',
      source: '<button class="button">Go</button>',
      stylesheet: '.button { color: red; }',
    });
    controller.dispose();
  });

  it('holds the warnings for what the html leaves out at rest beside its source', async () => {
    const controller = create({
      catalog: htmlCatalog,
      timers: immediate,
      htmlSource: async () => ({
        markup: '<button class="button">Go</button>',
        warnings: ['Button: could not evaluate pressed() (pressed is not defined)'],
      }),
    });
    await settle();
    expect(controller.getState().code!.html).toEqual({
      status: 'ready',
      source: '<button class="button">Go</button>',
      warnings: ['Button: could not evaluate pressed() (pressed is not defined)'],
    });
    controller.dispose();
  });

  it('refuses a detached html pane, which has no story of its own to print', () => {
    const controller = create({ catalog: htmlCatalog });
    expect(() =>
      controller.frames.mountStory(document.createElement('div'), 'html' as 'react', { component: BUTTON }),
    ).toThrow(/does not render in html/);
    controller.dispose();
  });
});

describe('a slot whose content must take its scope', () => {
  const sources = [{ id: 'core', label: 'Components', order: 0 }];
  const trigger = {
    kind: 'scoped' as const,
    slot: { react: 'trigger', vue: 'trigger', svelte: 'trigger' },
    parameters: ['triggerProps'],
    react: '<button {...triggerProps}>Open</button>',
    vue: '<button v-bind="triggerProps">Open</button>',
    svelte: '<button {...triggerProps}>Open</button>',
  };
  const scopeCatalog = catalogFromManifest(
    buildManifest(
      [
        resolveStory(
          {
            name: 'ActionMenu',
            file: 'ActionMenu.ts',
            props: {},
            hasDefaultSlot: true,
            slotNames: ['trigger'],
            scopeRequiredSlots: ['trigger'],
          },
          { slots: { default: { kind: 'text', value: 'Item' }, named: { trigger } } },
          {}
        ),
      ],
      sources
    )
  );

  it('keeps its frame and fill and the Empty scenario, and is no add target', () => {
    const component = scopeCatalog.components.find((candidate) => candidate.name === 'ActionMenu')!;
    expect(component.slots).toEqual({ default: true, named: ['trigger'], scopeRequired: ['trigger'] });
    expect(component.scenarios[0]?.id).toBe('empty');
    const controller = create({ catalog: scopeCatalog });
    controller.actions.selectComponent(component.id);
    controller.editor.open();
    const tree = controller.getState().editor.tree!;
    expect(nodeSlots(scopeCatalog, tree)).toEqual(['default', 'trigger']);
    expect(tree.slots.trigger?.map((node) => node.kind)).toEqual(['opaque']);
    expect(nodeAddSlots(scopeCatalog, tree)).toEqual(['default']);
    controller.dispose();
  });

  it('refuses plain content dropped into it and its scoped fill dropped elsewhere', () => {
    const component = scopeCatalog.components.find((candidate) => candidate.name === 'ActionMenu')!;
    const controller = create({ catalog: scopeCatalog });
    controller.actions.selectComponent(component.id);
    controller.editor.open();
    const kinds = () => {
      const slots = controller.getState().editor.tree!.slots;
      return { default: slots.default?.map((node) => node.kind), trigger: slots.trigger?.map((node) => node.kind) };
    };
    const before = { default: ['text'], trigger: ['opaque'] };
    expect(kinds()).toEqual(before);
    controller.editor.move([{ slot: 'default', index: 0 }], { parent: [], slot: 'trigger', index: 0 });
    expect(kinds()).toEqual(before);
    controller.editor.move([{ slot: 'trigger', index: 0 }], { parent: [], slot: 'default', index: 0 });
    expect(kinds()).toEqual(before);
    controller.editor.insert({ parent: [], slot: 'trigger', index: 0 }, { kind: 'text', value: 'Open' });
    expect(kinds()).toEqual(before);
    controller.editor.insert({ parent: [], slot: 'default', index: 1 }, { kind: 'text', value: 'More' });
    expect(kinds()).toEqual({ default: ['text', 'text'], trigger: ['opaque'] });
    controller.editor.move([{ slot: 'default', index: 1 }], { parent: [], slot: 'default', index: 0 });
    expect(controller.getState().editor.tree!.slots.default?.map((node) => (node.kind === 'text' ? node.value : ''))).toEqual([
      'More',
      'Item',
    ]);
    controller.dispose();
  });
});

describe('an unlisted story', () => {
  const sources = [{ id: 'core', label: 'Components', order: 0 }];
  const story = (name: string, story = {}) =>
    resolveStory(
      { name, file: `${name}.ts`, props: {}, hasDefaultSlot: false, slotNames: [] },
      story,
      {}
    );
  // `Alert` sorts first, so a controller that picked it would show it unasked.
  const unlistedCatalog = catalogFromManifest(
    buildManifest([story('Alert', { unlisted: true }), story('Badge')], sources)
  );

  it('is not selected first, but opens from its address and by its id', () => {
    const opened = create({ catalog: unlistedCatalog });
    expect(opened.getState().selection).toEqual({ kind: 'component', id: 'components-badge' });
    opened.actions.selectComponent('components-alert');
    expect(opened.getState().selection).toEqual({ kind: 'component', id: 'components-alert' });
    opened.dispose();

    window.history.replaceState(null, '', '/?component=components-alert');
    const linked = create({ catalog: unlistedCatalog });
    expect(linked.getState().selection).toEqual({ kind: 'component', id: 'components-alert' });
    linked.dispose();
  });

  it('is left out of the catalog a pane receives', () => {
    const controller = create({ catalog: unlistedCatalog });
    const element = document.createElement('div');
    const unmount = controller.frames.mount(element, 'vue');
    const iframe = element.querySelector('iframe')!;
    const posted: unknown[] = [];
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: (message: unknown) => posted.push(message) } });
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'preview:ready' }, source: iframe.contentWindow }));
    const payload = posted.find((message) => (message as { type: string }).type === 'preview:catalog') as {
      components: { id: string }[];
    };
    expect(payload.components.map((component) => component.id)).toEqual(['components-badge']);
    unmount();
    controller.dispose();
  });
});

describe('the landing entry', () => {
  const landingCatalog = (landing: CatalogManifest['landing']) =>
    catalogFromManifest({ ...(manifest as CatalogManifest), landing }, views);

  it('carries the manifest\'s landing entry into the catalog', () => {
    expect(catalog.landing).toBeUndefined();
    expect(landingCatalog({ view: 'gallery' }).landing).toEqual({ kind: 'view', id: 'gallery' });
    expect(landingCatalog({ component: CARD, scenario: 'toned' }).landing).toEqual({
      kind: 'component',
      id: CARD,
      scenario: 'toned',
    });
    expect(landingCatalog({ component: CARD }).landing).toEqual({ kind: 'component', id: CARD });
  });

  it('opens on the view the kit names when the address names no entry', () => {
    const controller = create({ catalog: landingCatalog({ view: 'gallery' }) });
    expect(controller.getState().selection).toEqual({ kind: 'view', id: 'gallery' });
    controller.dispose();
  });

  it('opens on the story and scenario the kit names, with the options that scenario sets', () => {
    const controller = create({ catalog: landingCatalog({ component: CARD, scenario: 'toned' }) });
    expect(controller.getState().selection).toEqual({ kind: 'component', id: CARD });
    expect(controller.getState().scenario).toBe('toned');
    expect(controller.getState().props).toMatchObject({ tone: 'accent' });
    controller.dispose();
    // Without a scenario, on the story's baseline.
    const baseline = create({ catalog: landingCatalog({ component: CARD }) });
    expect(baseline.getState().scenario).toBe('raised');
    baseline.dispose();
  });

  it('gives way to an address that names a view or a story', () => {
    window.history.replaceState(null, '', `/?component=${BUTTON}`);
    const linked = create({ catalog: landingCatalog({ view: 'gallery' }) });
    expect(linked.getState().selection).toEqual({ kind: 'component', id: BUTTON });
    linked.dispose();
    window.history.replaceState(null, '', '/?view=gallery');
    const viewed = create({ catalog: landingCatalog({ component: CARD }) });
    expect(viewed.getState().selection).toEqual({ kind: 'view', id: 'gallery' });
    viewed.dispose();
    // An address with only option values still lands on the kit's entry.
    window.history.replaceState(null, '', '/?option.shell.navigation=false');
    const optioned = create({ catalog: landingCatalog({ component: CARD }) });
    expect(optioned.getState().selection).toEqual({ kind: 'component', id: CARD });
    optioned.dispose();
  });

  it('opens a landing on the Empty scenario on its baseline, saying why, where nothing regenerates', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const regenerating = create({
      catalog: landingCatalog({ component: CARD, scenario: 'empty' }),
      regeneration: async () => {},
    });
    expect(regenerating.getState().scenario).toBe('empty');
    regenerating.dispose();
    expect(warn).not.toHaveBeenCalled();
    const fixed = create({ catalog: landingCatalog({ component: CARD, scenario: 'empty' }) });
    expect(fixed.getState().selection).toEqual({ kind: 'component', id: CARD });
    expect(fixed.getState().scenario).toBe('raised');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("names the scenario 'empty'"));
    warn.mockRestore();
    fixed.dispose();
  });

  it('opens on the first story, saying why, when the kit names a view it does not register', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const controller = create({ catalog: landingCatalog({ view: 'foundations' }) });
    expect(controller.getState().selection).toEqual({ kind: 'component', id: BUTTON });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("names view 'foundations'"));
    warn.mockRestore();
    controller.dispose();
    // A story it lacks opens the first story too.
    const unknown = create({ catalog: landingCatalog({ component: 'components-missing' }) });
    expect(unknown.getState().selection).toEqual({ kind: 'component', id: BUTTON });
    unknown.dispose();
  });
});

describe('two-way props', () => {
  const sources = [{ id: 'core', label: 'Components', order: 0 }];
  const toggleProps = {
    pressed: {
      type: 'boolean',
      bindable: { current: 'isPressed', setter: 'setPressed', defaultProp: 'defaultPressed', changeProp: 'onPressedChange' },
    },
    defaultPressed: { type: 'boolean', default: false },
    onPressedChange: { type: '(pressed: boolean) => void' },
    disabled: { type: 'boolean', default: false },
  };
  const toggle = (story = {}) =>
    resolveStory(
      {
        name: 'Toggle',
        file: 'toggle.ts',
        template: {
          type: 'component',
          name: 'Toggle',
          props: toggleProps,
          children: [],
          extensions: { vue: { model: 'pressed' } },
        } as never,
        props: toggleProps,
        hasDefaultSlot: false,
        slotNames: [],
      },
      story,
      {},
    );
  const TOGGLE = 'components-toggle';

  it("lists a component's events, the props it declares as functions that return nothing, and its bindings", () => {
    const model = resolveStory(
      {
        name: 'Form',
        file: 'form.ts',
        props: {
          onSave: { type: '(value: string) => void' },
          shape: { type: '{ draw: () => void }' },
          onLoad: { type: 'event => Promise<void>' },
          onApply: { type: '(change: { apply: () => void }) => void' },
          // Asked of the consumer, with the component's own as the fallback.
          highlight: { type: '(code: string) => SyntaxRun[] | undefined' },
          sortIcon: { type: '(direction: Direction) => ReactNode' },
          build: { type: '() => () => void' },
        },
        hasDefaultSlot: false,
        slotNames: [],
      },
      undefined,
      {},
    );
    const listed = catalogFromManifest(buildManifest([model, toggle()], sources));
    expect(listed.components[0].events).toEqual(['onSave', 'onLoad', 'onApply']);
    // A component written by hand declares no bindings.
    expect(listed.components[0].bindings).toEqual([]);
    expect(listed.components[1].events).toEqual(['onPressedChange']);
    expect(listed.components[1].bindings).toEqual([
      { prop: 'pressed', defaultProp: 'defaultPressed', changeProp: 'onPressedChange', vueModel: true },
    ]);
    // A component with type parameters marks its bindings generic.
    const generic = resolveStory(
      {
        name: 'Toggle',
        file: 'toggle.ts',
        template: { type: 'component', name: 'Toggle', typeParameters: ['Value'], props: toggleProps, children: [] } as never,
        props: toggleProps,
        hasDefaultSlot: false,
        slotNames: [],
      },
      undefined,
      {},
    );
    expect(generic.bindings).toEqual([
      { prop: 'pressed', defaultProp: 'defaultPressed', changeProp: 'onPressedChange', generic: true },
    ]);
    // A manifest that lists neither gives a component none.
    const bare = catalogFromManifest({ components: [{ ...buildManifest([model], sources).components[0], events: undefined }] });
    expect(bare.components[0]).toMatchObject({ events: [], bindings: [] });
  });

  function mounted(story = {}, model = toggle(story)) {
    const controller = create({ catalog: catalogFromManifest(buildManifest([model], sources)) });
    const element = document.createElement('div');
    controller.frames.mount(element, 'react');
    const iframe = element.querySelector('iframe')!;
    const postMessage = vi.fn();
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage } });
    const fire = (name: string, data: Record<string, unknown>) =>
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'preview:event', name, payload: '', ...data },
          source: iframe.contentWindow as Window,
        }),
      );
    const ready = () =>
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'preview:ready' }, source: iframe.contentWindow as Window }),
      );
    return { controller, postMessage, fire, ready };
  }

  it('tells the panes the story\'s two-way props, so a pane can write a value back itself', () => {
    const { controller, postMessage } = mounted();
    postMessage.mockClear();
    controller.actions.selectComponent(TOGGLE);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview:set-story',
        events: ['onPressedChange'],
        bindings: [{ prop: 'pressed', changeProp: 'onPressedChange' }],
      }),
      '*',
    );
    controller.dispose();
  });

  it('tells the panes no two-way prop whose change prop is not a recorded event, as a pane could not report its write', () => {
    // A change prop that returns something is no event the panes record.
    const props = { ...toggleProps, onPressedChange: { type: '(pressed: boolean) => boolean' } };
    const model = resolveStory(
      {
        name: 'Toggle',
        file: 'toggle.ts',
        template: { type: 'component', name: 'Toggle', props, children: [] } as never,
        props,
        hasDefaultSlot: false,
        slotNames: [],
      },
      undefined,
      {},
    );
    const { controller, postMessage } = mounted({}, model);
    postMessage.mockClear();
    controller.actions.selectComponent(TOGGLE);
    const setStory = postMessage.mock.calls.map(([message]) => message).find((message) => message.type === 'preview:set-story');
    expect(setStory).toBeDefined();
    expect(setStory).not.toHaveProperty('bindings');
    expect(setStory).not.toHaveProperty('events');
    controller.dispose();
  });

  it("takes the value a controlled story's change prop reports as the story's prop, into the panes and the address", () => {
    const { controller, postMessage, fire } = mounted();
    controller.actions.selectComponent(TOGGLE);
    controller.actions.setProps({ ...controller.getState().props, pressed: false });
    postMessage.mockClear();
    fire('onPressedChange', { value: true });
    expect(controller.getState().props.pressed).toBe(true);
    // Logged as any event, and sent to the panes as a prop change.
    expect(controller.getState().events.map((event) => event.name)).toEqual(['onPressedChange']);
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'preview:props', props: expect.objectContaining({ pressed: true }), answers: 0 },
      '*',
    );
    expect(JSON.parse(new URLSearchParams(window.location.search).get('props')!)).toMatchObject({ pressed: true });
    fire('onPressedChange', { value: false });
    expect(controller.getState().props.pressed).toBe(false);
    controller.dispose();
  });

  it("keeps an empty string in every pane on an update, a story's two-way value and a declared default alike", () => {
    // A combobox in the shape the engine generates: a two-way `query`, its
    // declared `''` default, and a story that controls it.
    const comboboxProps = {
      query: {
        type: 'string',
        bindable: { current: 'currentQuery', setter: 'setQuery', defaultProp: 'defaultQuery', changeProp: 'onQueryChange' },
      },
      defaultQuery: { type: 'string', default: '' },
      onQueryChange: { type: '(query: string) => void' },
      label: { type: 'string' },
    };
    const model = resolveStory(
      {
        name: 'Combobox',
        file: 'combobox.ts',
        template: { type: 'component', name: 'Combobox', props: comboboxProps, children: [] } as never,
        props: comboboxProps,
        hasDefaultSlot: false,
        slotNames: [],
      },
      { defaultProps: { query: 'fin', defaultQuery: '', label: 'Country' } },
      {},
    );
    const { controller, postMessage, fire } = mounted({}, model);
    controller.actions.selectComponent('components-combobox');
    const lastProps = () =>
      postMessage.mock.calls.map(([message]) => message).filter((message) => message.type === 'preview:props').at(-1)?.props;
    controller.actions.setProps({ ...controller.getState().props, label: 'Land' });
    expect(lastProps()).toEqual({ query: 'fin', defaultQuery: '', label: 'Land' });
    // The pane reports `''`: the story, the panes and the address hold it.
    fire('onQueryChange', { value: '' });
    expect(controller.getState().props.query).toBe('');
    expect(lastProps()).toEqual({ query: '', defaultQuery: '', label: 'Land' });
    expect(JSON.parse(new URLSearchParams(window.location.search).get('props')!)).toMatchObject({ query: '' });
    // A control emptied to `''` gives `''` too; only `null` leaves a prop out.
    controller.actions.setProps({ ...controller.getState().props, label: '', defaultQuery: null });
    expect(lastProps()).toEqual({ query: '', label: '' });
    controller.dispose();
  });

  it('leaves an uncontrolled story to the component, and ignores an unchanged value, a value it cannot read and another event', () => {
    const { controller, postMessage, fire } = mounted();
    controller.actions.selectComponent(TOGGLE);
    expect(controller.getState().props.pressed).toBeUndefined();
    postMessage.mockClear();
    fire('onPressedChange', { value: true });
    expect(controller.getState().props.pressed).toBeUndefined();
    controller.actions.setProps({ ...controller.getState().props, pressed: true });
    const props = controller.getState().props;
    postMessage.mockClear();
    fire('onPressedChange', { value: true });
    fire('onPressedChange', {});
    fire('onOther', { value: false });
    expect(controller.getState().props).toBe(props);
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'preview:props' }), '*');
    controller.dispose();
  });

  it('writes back every given two-way prop that reports through the change prop', () => {
    // `mirrored` reports through `onPressedChange` too.
    const props = {
      ...toggleProps,
      mirrored: {
        type: 'boolean',
        bindable: { current: 'isMirrored', setter: 'setMirrored', changeProp: 'onPressedChange' },
      },
    };
    const model = resolveStory(
      {
        name: 'Toggle',
        file: 'toggle.ts',
        template: { type: 'component', name: 'Toggle', props, children: [] } as never,
        props,
        hasDefaultSlot: false,
        slotNames: [],
      },
      undefined,
      {},
    );
    const { controller, fire } = mounted({}, model);
    controller.actions.selectComponent(TOGGLE);
    controller.actions.setProps({ ...controller.getState().props, pressed: false, mirrored: false });
    fire('onPressedChange', { value: true });
    expect(controller.getState().props).toMatchObject({ pressed: true, mirrored: true });
    // One the story leaves out stays the component's.
    controller.actions.setProps({ ...controller.getState().props, pressed: true, mirrored: undefined });
    fire('onPressedChange', { value: false });
    expect(controller.getState().props.pressed).toBe(false);
    expect(controller.getState().props.mirrored).toBeUndefined();
    controller.dispose();
  });

  it('writes back nothing of an event a pane recorded under a story the host has since replaced', () => {
    const { controller, postMessage, fire } = mounted();
    controller.actions.selectComponent(TOGGLE);
    controller.actions.setProps({ ...controller.getState().props, pressed: false });
    const mountOf = () =>
      postMessage.mock.calls.map(([message]) => message).filter((message) => message.type === 'preview:set-story').at(-1)
        .mount as number;
    const first = mountOf();
    // The same story mounted afresh, as picking a scenario does.
    controller.actions.selectComponent(TOGGLE, { pressed: false });
    const second = mountOf();
    expect(second).toBeGreaterThan(first);
    fire('onPressedChange', { value: true, mount: first });
    expect(controller.getState().props.pressed).toBe(false);
    // Still logged: the pane did call it.
    expect(controller.getState().events.map((event) => event.name)).toEqual(['onPressedChange']);
    fire('onPressedChange', { value: true, mount: second });
    expect(controller.getState().props.pressed).toBe(true);
    controller.dispose();
  });

  it("names on each props message the newest of that pane's own writes it has taken", () => {
    const { controller, postMessage, fire, ready } = mounted();
    controller.actions.selectComponent(TOGGLE);
    const lastAnswers = () =>
      postMessage.mock.calls.map(([message]) => message).filter((message) => message.type === 'preview:props').at(-1)
        .answers as number;
    controller.actions.setProps({ ...controller.getState().props, pressed: false });
    expect(lastAnswers()).toBe(0);
    // The pane's first write, which changes the story, is answered at once.
    fire('onPressedChange', { value: true, write: 1 });
    expect(lastAnswers()).toBe(1);
    // A write that changes nothing is taken all the same, and the next
    // props, another control's, answer it; an older number lowers nothing.
    fire('onPressedChange', { value: true, write: 3 });
    fire('onPressedChange', { value: true, write: 2 });
    controller.actions.setProps({ ...controller.getState().props, disabled: true });
    expect(lastAnswers()).toBe(3);
    // A pane announcing ready again was reloaded: its count starts over.
    ready();
    controller.actions.setProps({ ...controller.getState().props, disabled: false });
    expect(lastAnswers()).toBe(0);
    controller.dispose();
  });

  it("answers each pane's own writes on the props it sends that pane alone", () => {
    const controller = create({ catalog: catalogFromManifest(buildManifest([toggle()], sources)) });
    const panes = (['react', 'vue'] as const).map((target) => {
      const element = document.createElement('div');
      controller.frames.mount(element, target);
      const iframe = element.querySelector('iframe')!;
      const postMessage = vi.fn();
      Object.defineProperty(iframe, 'contentWindow', { value: { postMessage } });
      const fire = (data: Record<string, unknown>) =>
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { type: 'preview:event', name: 'onPressedChange', payload: '', ...data },
            source: iframe.contentWindow as Window,
          }),
        );
      const lastAnswers = () =>
        postMessage.mock.calls.map(([message]) => message).filter((message) => message.type === 'preview:props').at(-1)
          ?.answers as number;
      return { fire, lastAnswers };
    });
    controller.actions.selectComponent(TOGGLE);
    controller.actions.setProps({ ...controller.getState().props, pressed: false });
    const [react, vue] = panes;
    react.fire({ value: true, write: 4 });
    expect(react.lastAnswers()).toBe(4);
    expect(vue.lastAnswers()).toBe(0);
    vue.fire({ value: false, write: 2 });
    expect(react.lastAnswers()).toBe(4);
    expect(vue.lastAnswers()).toBe(2);
    controller.dispose();
  });

  it("writes back into the editor's root while the editor is open", () => {
    const { controller, fire } = mounted();
    controller.actions.selectComponent(TOGGLE);
    controller.editor.open();
    controller.actions.setProps({ ...controller.getState().props, pressed: false });
    fire('onPressedChange', { value: true });
    expect(controller.getState().props.pressed).toBe(true);
    expect(controller.getState().editor.tree?.props.pressed).toBe(true);
    controller.dispose();
  });

  it("controls a story whose scenario gives the prop, and keeps a value changed from the scenario's in the address", () => {
    // Opened at its address, with no action taken since.
    window.history.replaceState(null, '', `/?component=${TOGGLE}&scenario=controlled`);
    const { controller, fire } = mounted({ scenarios: [{ id: 'controlled', props: { pressed: false } }] });
    expect(controller.getState().scenario).toBe('controlled');
    expect(controller.getState().props.pressed).toBe(false);
    fire('onPressedChange', { value: true });
    expect(controller.getState().props.pressed).toBe(true);
    const address = new URLSearchParams(window.location.search);
    expect(address.get('scenario')).toBe('controlled');
    expect(JSON.parse(address.get('props')!)).toMatchObject({ pressed: true });
    controller.dispose();
  });

  it('leaves a prop the story unsets with null out of what the panes mount, keeping a two-way prop controlled at null', () => {
    window.history.replaceState(null, '', `/?component=${TOGGLE}&scenario=cleared`);
    const { controller, postMessage } = mounted({
      defaultProps: { disabled: true, defaultPressed: true },
      scenarios: [{ id: 'cleared', props: { disabled: null, defaultPressed: null, pressed: null } }],
    });
    const element = document.createElement('div');
    controller.frames.mount(element, 'vue');
    const vuePost = vi.fn();
    Object.defineProperty(element.querySelector('iframe')!, 'contentWindow', { value: { postMessage: vuePost } });
    postMessage.mockClear();
    controller.actions.pickScenario('cleared');
    const story = postMessage.mock.calls.map(([message]) => message).find((message) => message.type === 'preview:set-story');
    expect(story.props).not.toHaveProperty('disabled');
    expect(story.props).not.toHaveProperty('defaultPressed');
    expect(story.props).toHaveProperty('pressed', null);
    // The story keeps the null, for its controls and its code.
    expect(controller.getState().props).toMatchObject({ disabled: null, pressed: null });
    // A props change reaches every target pane the same way.
    postMessage.mockClear();
    vuePost.mockClear();
    controller.actions.setProps({ ...controller.getState().props, disabled: null });
    for (const post of [postMessage, vuePost]) {
      const props = post.mock.calls.map(([message]) => message).find((message) => message.type === 'preview:props')?.props;
      expect(props).not.toHaveProperty('disabled');
      expect(props).toHaveProperty('pressed', null);
    }
    expect(new URL(controller.frames.standaloneUrl('vue'), 'http://localhost').search).not.toContain('disabled');
    controller.dispose();
  });
});

describe('the content beside a story’s component', () => {
  const hint = { kind: 'html' as const, tag: 'p', props: { id: 'button-hint' }, children: { kind: 'text' as const, value: 'Saves the draft.' } };
  const aroundManifest = {
    ...(manifest as CatalogManifest),
    targets: ['react', 'vue', 'svelte', 'html'],
    components: (manifest as CatalogManifest).components.map((component) =>
      component.id === BUTTON ? { ...component, around: { after: hint } } : component,
    ),
  } as CatalogManifest;
  const aroundCatalog = catalogFromManifest(aroundManifest, views);
  const immediate = { setTimeout: (callback: () => void) => callback(), clearTimeout: () => {} };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('is in the catalog, the printed source, the html request and each regeneration, never in the editor’s tree', async () => {
    const requests: unknown[] = [];
    const payloads: unknown[] = [];
    const controller = create({
      catalog: aroundCatalog,
      timers: immediate,
      regeneration: async (payload) => {
        payloads.push(payload);
      },
      htmlSource: async (request) => {
        requests.push(request);
        return { markup: '<button>Click</button>' };
      },
    });
    expect(aroundCatalog.components.find((component) => component.id === BUTTON)!.around).toEqual({ after: hint });
    controller.actions.selectComponent(BUTTON);
    await settle();
    expect(controller.getState().code!.targets.react).toContain('<p id="button-hint">Saves the draft.</p>');
    expect(requests.at(-1)).toMatchObject({ rootComponent: 'Button', around: { after: hint } });
    controller.editor.open();
    expect(controller.getState().editor.tree).not.toHaveProperty('around');
    controller.editor.setText([{ slot: 'default', index: 0 }], 'Save');
    await settle();
    expect(payloads.at(-1)).toMatchObject({ rootComponent: 'Button', around: { after: hint } });
    controller.actions.pickScenario('empty');
    expect(controller.getState().editor.tree).toEqual({ root: 'Button', props: { variant: 'solid' }, slots: {} });
    controller.dispose();
  });
});
