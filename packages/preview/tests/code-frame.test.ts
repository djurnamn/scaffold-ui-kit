// @vitest-environment happy-dom
// The code iframe's entry (application/preview/code/main.ts): it loads the
// setup module of the kit's code block's framework (named by `?framework=`),
// announces it is ready, mounts the block with the first source the host
// sends for its target (`?target=`), in that target's language, and hands
// the block each source after through its subscription.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CodeBlockContent, CodeBlockUpdates } from '../src/views';

// Held in a variable so the workspace type-check does not follow the import
// into the app, whose build-time aliases only the app's own config maps.
const entryModule = '../application/preview/code/main';

const loadedSetups: string[] = [];
let mounted: { element: HTMLElement; content: CodeBlockContent; updates: CodeBlockUpdates }[] = [];
let posted: unknown[] = [];

/** Load the entry at `search` with a recording code block, and let it start. */
async function open(search: string): Promise<void> {
  vi.resetModules();
  vi.doMock('@preview-code-block', () => ({
    default: (element: HTMLElement, content: CodeBlockContent, updates: CodeBlockUpdates) => {
      mounted.push({ element, content, updates });
    },
  }));
  for (const framework of ['react', 'vue', 'svelte']) {
    vi.doMock(`@preview-setup/${framework}`, () => {
      loadedSetups.push(framework);
      return {};
    });
  }
  window.history.replaceState(null, '', `/preview/code/code.html${search}`);
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
  vi.doUnmock('@preview-code-block');
  for (const framework of ['react', 'vue', 'svelte']) vi.doUnmock(`@preview-setup/${framework}`);
});

function deliver(data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data }));
}

describe('the code iframe', () => {
  it('marks its root as the code frame, for the kit to style its page by', () => {
    const page = readFileSync(resolve(__dirname, '../application/preview/code/code.html'), 'utf8');
    expect(page).toContain('<html lang="en" data-preview-frame="code">');
    expect(page).toContain('<div id="app" data-preview-code></div>');
  });

  it("loads the block's setup module and mounts the block with its target's first source", async () => {
    await open('?target=vue&framework=react');
    expect(loadedSetups).toEqual(['react']);
    expect(mounted).toHaveLength(0);
    deliver({ type: 'preview:code', target: 'vue', language: 'vue', source: '<Tag />' });
    expect(mounted).toHaveLength(1);
    expect(mounted[0].element).toBe(document.getElementById('app'));
    expect(mounted[0].content).toEqual({ target: 'vue', language: 'vue', source: '<Tag />', reason: undefined, wrap: false });
  });

  it("hands the block the shell's wrapping, first and as it is toggled", async () => {
    await open('?target=react');
    deliver({ type: 'preview:code', target: 'react', language: 'tsx', source: '<Tag />', wrap: true });
    expect(mounted[0].content.wrap).toBe(true);
    const heard: CodeBlockContent[] = [];
    mounted[0].updates.subscribe((content) => heard.push(content));
    deliver({ type: 'preview:code', target: 'react', language: 'tsx', source: '<Tag />', wrap: false });
    expect(heard).toEqual([{ target: 'react', language: 'tsx', source: '<Tag />', reason: undefined, wrap: false }]);
  });

  it('hands the block each source after, and nothing once it stops listening', async () => {
    await open('?target=html');
    expect(loadedSetups).toEqual([]);
    deliver({ type: 'preview:code', target: 'html', language: 'html' });
    const heard: CodeBlockContent[] = [];
    const stop = mounted[0].updates.subscribe((content) => heard.push(content));
    deliver({ type: 'preview:code', target: 'html', language: 'html', source: '<span></span>' });
    deliver({ type: 'preview:code', target: 'html', language: 'html', reason: 'No html for this story.' });
    stop();
    deliver({ type: 'preview:code', target: 'html', language: 'html', source: 'later' });
    expect(mounted).toHaveLength(1);
    expect(heard.map((content) => content.source ?? content.reason)).toEqual(['<span></span>', 'No html for this story.']);
    expect(heard[0].language).toBe('html');
  });
});
