// @vitest-environment happy-dom
// The custom-view iframe's entry (application/preview/view/main.ts) and the
// React adapter for views (src/react-view.ts): the entry loads the setup module
// of the view's framework only - the one `?framework=` names, else the view's
// own - mounts the view into the mount element with the context as it stands,
// delivers each new context (the options the host applies, the catalog) to the
// view's subscription, and then announces it is ready. `reactView` renders a
// React view into its own root and re-renders it in place on each context.

import { act, createElement, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactView } from '../src/views';
import type { PreviewView, ViewContext, ViewContextUpdates } from '../src/views';

// Held in a variable so the workspace type-check does not follow the import
// into the app, whose build-time aliases only the app's own config maps.
const entryModule = '../application/preview/view/main';

const loadedSetups: string[] = [];
let mounted: { element: HTMLElement; context: ViewContext; updates: ViewContextUpdates }[] = [];
let posted: unknown[] = [];

function viewsWith(view: PreviewView) {
  return { views: [view], viewById: (id: string) => (id === view.id ? view : undefined) };
}

const recordingMount = (element: HTMLElement, context: ViewContext, updates: ViewContextUpdates) => {
  mounted.push({ element, context, updates });
};

/** Load the entry at `search` with `view` registered, and let it start. */
async function open(search: string, view: PreviewView): Promise<void> {
  vi.resetModules();
  vi.doMock('@preview-views', () => viewsWith(view));
  for (const framework of ['react', 'vue', 'svelte']) {
    vi.doMock(`@preview-setup/${framework}`, () => {
      loadedSetups.push(framework);
      return {};
    });
  }
  window.history.replaceState(null, '', `/preview/view/view.html${search}`);
  posted = [];
  await import(/* @vite-ignore */ entryModule);
  await vi.waitFor(() => expect(posted).toContainEqual({ type: 'preview:ready' }));
}

beforeEach(() => {
  loadedSetups.length = 0;
  mounted = [];
  posted = [];
  document.head.innerHTML = '';
  document.body.innerHTML = '<div id="app"></div>';
  vi.spyOn(window, 'postMessage').mockImplementation(((message: unknown) => {
    posted.push(message);
  }) as typeof window.postMessage);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('@preview-views');
  for (const framework of ['react', 'vue', 'svelte']) vi.doUnmock(`@preview-setup/${framework}`);
});

function deliver(data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data }));
}

describe('the view iframe', () => {
  it('mounts a DOM view with no setup module, then announces it is ready', async () => {
    await open('?view=tokens', { id: 'tokens', label: 'Tokens', mount: recordingMount });
    expect(loadedSetups).toEqual([]);
    expect(mounted).toHaveLength(1);
    expect(mounted[0].element).toBe(document.getElementById('app'));
    expect(mounted[0].context).toMatchObject({ options: {}, kitName: '', sources: [], components: [] });
  });

  it("loads the setup module the URL names, or else the view's own", async () => {
    await open('?view=gallery&framework=vue', {
      id: 'gallery',
      label: 'Gallery',
      framework: 'vue',
      mount: recordingMount,
    });
    expect(loadedSetups).toEqual(['vue']);
    loadedSetups.length = 0;
    await open('?view=gallery', { id: 'gallery', label: 'Gallery', framework: 'svelte', mount: recordingMount });
    expect(loadedSetups).toEqual(['svelte']);
  });

  it('delivers each new context to the mounted view', async () => {
    await open('?view=tokens', { id: 'tokens', label: 'Tokens', mount: recordingMount });
    const contexts: ViewContext[] = [];
    mounted[0].updates.subscribe((context) => contexts.push(context));
    deliver({ type: 'preview:globals', options: { theme: 'dark' } });
    deliver({
      type: 'preview:catalog',
      kitName: 'acme',
      sources: [{ id: 'core', label: 'Components', order: 0 }],
      components: [],
    });
    expect(contexts.map((context) => [context.options, context.kitName])).toEqual([
      [{ theme: 'dark' }, ''],
      [{ theme: 'dark' }, 'acme'],
    ]);
    contexts[1].selectComponent('components-button', { variant: 'ghost' });
    expect(posted).toContainEqual({ type: 'preview:select', id: 'components-button', props: { variant: 'ghost' } });
  });

  it('mounts nothing for a component-tree entry', async () => {
    await open('?view=components', { id: 'components', label: 'Components', componentTree: true });
    expect(mounted).toEqual([]);
  });
});

describe('reactView', () => {
  it('renders into its own root, re-renders in place on each context, and unmounts', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let clicks: (() => void) | undefined;
    function Theme({ theme }: { theme: string }) {
      const [count, setCount] = useState(0);
      clicks = () => setCount((value) => value + 1);
      return `${theme}:${count}`;
    }
    const view = reactView((context) => createElement(Theme, { theme: String(context.options.theme) }));
    expect(view.framework).toBe('react');
    const element = document.createElement('div');
    let listener: ((context: ViewContext) => void) | undefined;
    const context: ViewContext = {
      options: { theme: 'light' },
      kitName: 'acme',
      sources: [],
      components: [],
      selectComponent: () => {},
    };
    let unmount: (() => void) | void = undefined;
    await act(async () => {
      unmount = view.mount(element, context, {
        subscribe: (next) => {
          listener = next;
          return () => {
            listener = undefined;
          };
        },
      });
    });
    expect(element.textContent).toBe('light:0');
    await act(async () => clicks!());
    await act(async () => listener!({ ...context, options: { theme: 'dark' } }));
    // The view's own state outlasts the change of context.
    expect(element.textContent).toBe('dark:1');
    await act(async () => (unmount as unknown as () => void)());
    expect(element.textContent).toBe('');
    expect(listener).toBeUndefined();
  });
});
