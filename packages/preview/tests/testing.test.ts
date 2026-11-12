// @vitest-environment happy-dom
// The kit browser-test helpers (src/testing.ts) and the protocol they speak
// (src/protocol.ts). The helpers drive a structurally typed page; here a fake
// page runs the functions they hand it in this process's happy-dom window, the
// way a browser page would run them in its own, and the window's postMessage is
// stood in for by a recorder that mounts and unmounts `#app` as an iframe would.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  announcePreviewReady,
  catalogMessage,
  componentFrameUrl,
  globalsMessage,
  isPreviewMessage,
  PREVIEW_MESSAGE,
  propsMessage,
  readPreviewMessage,
  readyMessage,
  selectMessage,
  setStoryMessage,
  standaloneFrameUrl,
  announcePreviewOptions,
  reportRenderError,
  standaloneMessages,
  summarizeArguments,
  viewFrameUrl,
  withEventRecorders,
} from '../src/protocol';
import {
  gotoPreview,
  mountStory,
  openStory,
  readPreviewManifest,
  readRenderError,
  setOptions,
  setProps,
  setStory,
  settle,
  waitForStory,
  type PreviewPage,
  type PreviewScriptedTarget,
} from '../src/testing';

type Step = { kind: 'goto'; url: string } | { kind: 'post'; message: unknown } | { kind: 'wait' };

/** A page whose functions run against this window, recording what it does. */
function createFakePage(): PreviewPage & { steps: Step[]; extra: string } {
  const steps: Step[] = [];
  return {
    steps,
    // Stands for the rest of a real page's API, which the helpers hand back.
    extra: 'page-only member',
    async goto(url) {
      steps.push({ kind: 'goto', url });
      // The loaded preview page: a mount point, and the ready flag its entry sets.
      document.body.innerHTML = '<div id="app"></div>';
      (window as unknown as Record<string, unknown>).__previewStories = ['Button', 'Card', 'Menu'];
      (window as unknown as Record<string, unknown>).__previewOptions = [
        { id: 'mode', values: ['light', 'dark'] },
        { id: 'box' },
      ];
      (window as unknown as Record<string, unknown>).__previewReady = true;
    },
    async waitForFunction(pageFunction, argument) {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (pageFunction(argument)) {
          steps.push({ kind: 'wait' });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      throw new Error('waitForFunction timed out');
    },
    async evaluate(pageFunction, argument) {
      return pageFunction(argument);
    },
  };
}

let page: ReturnType<typeof createFakePage>;

beforeEach(() => {
  page = createFakePage();
  delete (window as unknown as Record<string, unknown>).__previewReady;
  delete (window as unknown as Record<string, unknown>).__previewStories;
  delete (window as unknown as Record<string, unknown>).__previewOptions;
  delete (window as unknown as Record<string, unknown>).__previewMountedStory;
  delete (window as unknown as Record<string, unknown>).__previewRenderError;
  vi.spyOn(window, 'postMessage').mockImplementation(((message: unknown) => {
    page.steps.push({ kind: 'post', message });
    // An iframe mounts a story by id; the empty id has none and unmounts.
    if (isPreviewMessage(message, PREVIEW_MESSAGE.setStory)) {
      const mount = document.getElementById('app')!;
      // Unmount a tick later, so a helper that does not wait would race it.
      setTimeout(() => {
        mount.innerHTML = message.id ? `<button>${message.id}</button>` : '';
        (window as unknown as Record<string, unknown>).__previewMountedStory = message.id;
      }, 0);
    }
  }) as typeof window.postMessage);
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
});

const posted = () => page.steps.filter((step) => step.kind === 'post').map((step) => step.message);

describe('reading a render error', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__previewRenderError;
  });

  it('reads what the pane reports, and an empty message as a throw', async () => {
    expect(await readRenderError(page)).toBeUndefined();
    reportRenderError('boom');
    expect(await readRenderError(page)).toBe('boom');
    reportRenderError('');
    expect(await readRenderError(page)).toBe('');
    reportRenderError();
    expect(await readRenderError(page)).toBeUndefined();
  });

  it('lists the kit options with the values of a choice', () => {
    announcePreviewOptions([
      { id: 'mode', values: [{ value: 'light', label: 'Light' }] },
      { id: 'box' },
    ]);
    expect((window as unknown as Record<string, unknown>).__previewOptions).toEqual([
      { id: 'mode', values: ['light'] },
      { id: 'box' },
    ]);
  });
});

describe('protocol', () => {
  it('builds each message with its wire type and payload', () => {
    expect(readyMessage()).toEqual({ type: 'preview:ready' });
    expect(setStoryMessage('Button', { variant: 'solid' })).toEqual({
      type: 'preview:set-story',
      id: 'Button',
      props: { variant: 'solid' },
    });
    expect(propsMessage({ disabled: true })).toEqual({ type: 'preview:props', props: { disabled: true } });
    expect(globalsMessage({ mode: 'dark' })).toEqual({ type: 'preview:globals', options: { mode: 'dark' } });
    expect(catalogMessage({ kitName: 'acme', sources: [], components: [] })).toEqual({
      type: 'preview:catalog',
      kitName: 'acme',
      sources: [],
      components: [],
    });
    expect(selectMessage('Card', { elevated: true })).toEqual({
      type: 'preview:select',
      id: 'Card',
      props: { elevated: true },
    });
  });

  it('reads only objects carrying a preview message type', () => {
    expect(readPreviewMessage({ type: 'preview:props', props: {} })).toEqual({ type: 'preview:props', props: {} });
    expect(readPreviewMessage({ type: 'vite:update' })).toBeUndefined();
    expect(readPreviewMessage('preview:ready')).toBeUndefined();
    expect(readPreviewMessage(null)).toBeUndefined();
    expect(isPreviewMessage({ type: 'preview:select', id: 'Card' }, PREVIEW_MESSAGE.select)).toBe(true);
    expect(isPreviewMessage({ type: 'preview:select', id: 'Card' }, PREVIEW_MESSAGE.ready)).toBe(false);
  });

  it('names the iframe URLs', () => {
    expect(componentFrameUrl('svelte')).toBe('/preview/svelte/preview.html');
    expect(componentFrameUrl('react', 2)).toBe('/preview/react/preview.html?r=2');
    expect(viewFrameUrl('tokens')).toBe('/preview/view/view.html?view=tokens');
  });

  it("names a standalone pane's story in its address, and the pane gives itself that story", () => {
    const url = standaloneFrameUrl('vue', { id: 'components-tag', props: { tone: 'loud' }, options: { mode: 'dark' } });
    expect(url.startsWith('/preview/vue/preview.html?story=components-tag&')).toBe(true);
    const search = url.slice(url.indexOf('?'));
    expect(standaloneMessages(search)).toEqual([
      { type: 'preview:set-story', id: 'components-tag', props: { tone: 'loud' } },
      { type: 'preview:globals', options: { mode: 'dark' } },
    ]);
    expect(standaloneMessages('?props=%7B%7D')).toEqual([]);
    // A pane with no host posts those to itself, and no ready message.
    const posted: unknown[] = [];
    const frame = { location: { search }, postMessage: (message: unknown) => posted.push(message) } as unknown as Window;
    (frame as unknown as { parent: Window }).parent = frame;
    announcePreviewReady(frame);
    expect(posted).toEqual(standaloneMessages(search));
  });

  it("records a story's events: each call reported to the host, summarized, and passed on", () => {
    const posted: unknown[] = [];
    const frame = { parent: { postMessage: (message: unknown) => posted.push(message) } } as unknown as Window;
    const own = vi.fn(() => 'kept');
    const props = withEventRecorders({ label: 'Save', onSave: own }, ['onSave', 'onClose'], frame);
    expect(props.label).toBe('Save');
    expect((props.onSave as (...parameters: unknown[]) => unknown)('draft', { id: 2 })).toBe('kept');
    expect(own).toHaveBeenCalledWith('draft', { id: 2 });
    (props.onClose as () => void)();
    expect(posted).toEqual([
      { type: 'preview:event', name: 'onSave', payload: '"draft", {"id":2}', value: 'draft' },
      { type: 'preview:event', name: 'onClose', payload: '' },
    ]);
    expect(withEventRecorders({ label: 'Save' }, [], frame)).toEqual({ label: 'Save' });
    expect(summarizeArguments([undefined, () => 1, 'x'.repeat(300)])).toMatch(/^undefined, function, "x+\.\.\.$/);
  });

  it("carries an event's first argument as its value when it is plain data, a copy of it", () => {
    const posted: { value?: unknown }[] = [];
    const frame = { parent: { postMessage: (message: { value?: unknown }) => posted.push(message) } } as unknown as Window;
    const props = withEventRecorders({}, ['onChange'], frame);
    const onChange = props.onChange as (...parameters: unknown[]) => void;
    const keys = ['a', { b: [1, null, true] }];
    onChange(false);
    onChange(null);
    onChange(keys);
    onChange(new MouseEvent('click'));
    onChange(document.createElement('div'));
    onChange(Number.NaN);
    onChange(new Date(0));
    onChange(undefined);
    expect(posted.map((message) => ('value' in message ? message.value : 'none'))).toEqual([
      false,
      null,
      keys,
      'none',
      'none',
      'none',
      'none',
      'none',
    ]);
    expect(posted[2].value).not.toBe(keys);
  });

  it('summarizes an event alike in every target: the browser\'s, React\'s wrapper of it, and what JSON cannot hold', () => {
    const click = new MouseEvent('click');
    expect(summarizeArguments([click])).toBe('MouseEvent click');
    // React's synthetic event holds the browser's, and refers to itself through its target.
    const synthetic: Record<string, unknown> = { nativeEvent: click, type: 'click' };
    synthetic.currentTarget = synthetic;
    expect(summarizeArguments([synthetic])).toBe('MouseEvent click');
    class Point {
      self: Point = this;
    }
    expect(summarizeArguments([new Point()])).toBe('Point');
  });

  it('announces readiness with the flag and a ready message to the parent', () => {
    const parent = { postMessage: vi.fn() };
    const frame = { parent } as unknown as Window;
    announcePreviewReady(frame);
    expect((frame as unknown as Record<string, unknown>).__previewReady).toBe(true);
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'preview:ready' }, '*');
  });
});

describe('gotoPreview', () => {
  it("loads the target's preview page and waits for its ready flag", async () => {
    await gotoPreview(page, 'vue');
    expect(page.steps).toEqual([{ kind: 'goto', url: '/preview/vue/preview.html' }, { kind: 'wait' }]);
  });

  it('prefixes a base URL, without doubling its slash', async () => {
    await gotoPreview(page, 'react', { baseUrl: 'http://localhost:6100/' });
    expect(page.steps[0]).toEqual({ kind: 'goto', url: 'http://localhost:6100/preview/react/preview.html' });
  });

  it('does not resolve until the page sets the ready flag', async () => {
    page.goto = async (url) => {
      page.steps.push({ kind: 'goto', url });
    };
    await expect(gotoPreview(page, 'svelte')).rejects.toThrow('timed out');
  });
});

describe('waitForStory', () => {
  const flags = window as unknown as Record<string, unknown>;

  it('resolves once the page reports the story mounted, whatever it rendered', async () => {
    await gotoPreview(page, 'react');
    flags.__previewMountedStory = 'Menu';
    await expect(waitForStory(page, 'Menu')).resolves.toBeUndefined();
    expect(document.getElementById('app')!.childElementCount).toBe(0);
  });

  it('does not take the report of another story', async () => {
    await gotoPreview(page, 'react');
    flags.__previewMountedStory = 'Card';
    await expect(waitForStory(page, 'Menu')).rejects.toThrow('timed out');
  });

  it('does not take a render error for a finished mount', async () => {
    await gotoPreview(page, 'react');
    reportRenderError('boom');
    await expect(waitForStory(page, 'Menu')).rejects.toThrow('timed out');
  });

  it('throws from mountStory on a page whose mount never empties, naming the story', async () => {
    await gotoPreview(page, 'react');
    vi.useFakeTimers();
    try {
      page.waitForFunction = () => new Promise(() => {});
      const mounting = expect(mountStory(page, 'Menu')).rejects.toThrow(
        "never cleared the mount ahead of the story 'Menu': the story before it may have thrown as it unmounted"
      );
      await vi.advanceTimersByTimeAsync(15_000);
      await mounting;
    } finally {
      vi.useRealTimers();
    }
  });

  it('throws at the deadline, naming the story', async () => {
    vi.useFakeTimers();
    try {
      page.waitForFunction = () => new Promise(() => {});
      const waiting = expect(waitForStory(page, 'Menu')).rejects.toThrow(
        "the story 'Menu' never finished mounting"
      );
      await vi.advanceTimersByTimeAsync(15_000);
      await waiting;
    } finally {
      vi.useRealTimers();
    }
  });

  it("mountStory clears the page's last report itself, between the unmount and the next story", async () => {
    await gotoPreview(page, 'react');
    // The page reported a story, and reports the unmount only after its
    // paint: the report is cleared here, so the same story mounted again
    // cannot pass waitForStory on the report of its first mount.
    flags.__previewMountedStory = 'Menu';
    page.steps.length = 0;
    const reports: unknown[] = [];
    vi.spyOn(page, 'evaluate').mockImplementation(async (pageFunction, argument) => {
      const result = await pageFunction(argument);
      reports.push(flags.__previewMountedStory);
      return result;
    });
    await mountStory(page, 'Menu');
    const unmounted = page.steps.findIndex((step) => step.kind === 'wait');
    expect(page.steps[unmounted - 1]).toMatchObject({ kind: 'post', message: { id: '' } });
    expect(page.steps[unmounted + 1]).toMatchObject({ kind: 'post', message: { id: 'Menu' } });
    // The report read '' once mountStory set it, before the story was set.
    expect(reports).toContain('');
    await expect(waitForStory(page, 'Menu')).resolves.toBeUndefined();
  });

  it('mountStory does not wait for the page to report the unmount, which a story that threw as it unmounted never does', async () => {
    await gotoPreview(page, 'react');
    // The page empties the mount but never sets the report.
    vi.spyOn(window, 'postMessage').mockImplementation(((message: unknown) => {
      page.steps.push({ kind: 'post', message });
      if (isPreviewMessage(message, PREVIEW_MESSAGE.setStory)) {
        document.getElementById('app')!.innerHTML = message.id ? `<button>${message.id}</button>` : '';
      }
    }) as typeof window.postMessage);
    flags.__previewMountedStory = 'Card';
    await expect(mountStory(page, 'Menu')).resolves.toBeUndefined();
    expect(document.getElementById('app')!.textContent).toBe('Menu');
  });
});

describe('readPreviewManifest', () => {
  it("reads the components of a kit's preview manifest", () => {
    const kitRoot = mkdtempSync(join(tmpdir(), 'preview-manifest-'));
    try {
      mkdirSync(join(kitRoot, '.preview-generated'));
      writeFileSync(
        join(kitRoot, '.preview-generated', 'manifest.json'),
        JSON.stringify({ components: [{ id: 'components-button', name: 'Button' }] })
      );
      expect(readPreviewManifest(kitRoot)).toEqual([{ id: 'components-button', name: 'Button' }]);
    } finally {
      rmSync(kitRoot, { recursive: true, force: true });
    }
  });
});

describe('gotoPreview on a page that never starts listening', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    page.waitForFunction = () => new Promise(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws within seconds, naming the page and where to look', async () => {
    const loading = expect(
      gotoPreview(page, 'react', { baseUrl: 'http://localhost:6100' })
    ).rejects.toThrow(
      'the preview page at http://localhost:6100/preview/react/preview.html never announced itself: look for a page error'
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await loading;
  });

  it('leaves no timer behind once the page is ready', async () => {
    page.waitForFunction = async () => undefined;
    await gotoPreview(page, 'vue');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('swallows the abandoned wait rejecting after the deadline', async () => {
    let reject: (reason: Error) => void = () => {};
    page.waitForFunction = () =>
      new Promise((_, rejectWait) => {
        reject = rejectWait;
      });
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const loading = expect(gotoPreview(page, 'vue')).rejects.toThrow('never announced itself');
    await vi.advanceTimersByTimeAsync(15_000);
    await loading;
    reject(new Error('the page closed'));
    vi.useRealTimers();
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe('the story messages', () => {
  beforeEach(async () => {
    await gotoPreview(page, 'react');
    page.steps.length = 0;
  });

  it('posts set-story, props and globals to the page window', async () => {
    await setStory(page, 'Button', { variant: 'solid' });
    await setStory(page, 'Card');
    await setProps(page, { variant: 'ghost' });
    await setOptions(page, { mode: 'dark', box: false });
    expect(posted()).toEqual([
      { type: 'preview:set-story', id: 'Button', props: { variant: 'solid' } },
      { type: 'preview:set-story', id: 'Card', props: {} },
      { type: 'preview:props', props: { variant: 'ghost' } },
      { type: 'preview:globals', options: { mode: 'dark', box: false } },
    ]);
  });

  it('mounts from nothing: blurs, unmounts, waits for the empty mount point, then sets the story', async () => {
    await setStory(page, 'Menu');
    await vi.waitFor(() => expect(document.getElementById('app')!.childElementCount).toBe(1));
    const focused = document.getElementById('app')!.firstElementChild as HTMLElement;
    focused.tabIndex = 0;
    focused.focus();
    page.steps.length = 0;

    await mountStory(page, 'Menu', { defaultOpen: true });

    expect(document.activeElement).not.toBe(focused);
    expect(page.steps).toEqual([
      { kind: 'post', message: { type: 'preview:set-story', id: '', props: {} } },
      { kind: 'wait' },
      { kind: 'post', message: { type: 'preview:set-story', id: 'Menu', props: { defaultOpen: true } } },
    ]);
  });

  it('rejects a story id the page has not, listing those it has, and posts nothing', async () => {
    await expect(setStory(page, 'Buton')).rejects.toThrow(
      "setStory: this preview has no story with the id 'Buton'. Its stories: Button, Card, Menu."
    );
    await expect(mountStory(page, 'Buton')).rejects.toThrow(
      "mountStory: this preview has no story with the id 'Buton'. Its stories: Button, Card, Menu."
    );
    expect(page.steps).toEqual([]);
  });

  it('rejects an option id the page does not define, listing those it does, and posts nothing', async () => {
    await expect(setOptions(page, { mode: 'midnight' })).rejects.toThrow(
      `setOptions: option 'mode' has no value "midnight". Its values: light, dark.`
    );
    await expect(setOptions(page, { mode: true })).rejects.toThrow(`option 'mode' has no value true`);
    await expect(setOptions(page, { box: 'yes' })).rejects.toThrow(
      `setOptions: option 'box' takes true or false, not "yes".`
    );
    await expect(setOptions(page, { colorScheme: 'dark', mode: 'dark' })).rejects.toThrow(
      "setOptions: this preview defines no option 'colorScheme'. Its options: mode, box."
    );
    expect(page.steps).toEqual([]);
  });

  it('reads a ready page with no list as a preview page that mounts no story', async () => {
    delete (window as unknown as Record<string, unknown>).__previewStories;
    delete (window as unknown as Record<string, unknown>).__previewOptions;
    await expect(setStory(page, 'Button')).rejects.toThrow(
      'setStory: this is a preview page that mounts no story (its html or view page, or a preview older than these helpers).'
    );
    await expect(setOptions(page, { mode: 'dark' })).rejects.toThrow('mounts no story');
    expect(page.steps).toEqual([]);
  });

  it('says so when the page is not a loaded preview page', async () => {
    delete (window as unknown as Record<string, unknown>).__previewReady;
    delete (window as unknown as Record<string, unknown>).__previewStories;
    delete (window as unknown as Record<string, unknown>).__previewOptions;
    await expect(setStory(page, 'Button')).rejects.toThrow('load it with gotoPreview first');
    await expect(setOptions(page, { mode: 'dark' })).rejects.toThrow('load it with gotoPreview first');
    expect(page.steps).toEqual([]);
  });

  it('settles after two animation frames', async () => {
    const frame = vi.spyOn(window, 'requestAnimationFrame');
    await settle(page);
    expect(frame).toHaveBeenCalledTimes(2);
  });
});

describe('openStory', () => {
  it('loads the page, applies the options, then mounts the story', async () => {
    const story = await openStory(page, {
      target: 'vue',
      id: 'Button',
      props: { variant: 'solid' },
      options: { mode: 'dark' },
    });
    expect(page.steps).toEqual([
      { kind: 'goto', url: '/preview/vue/preview.html' },
      { kind: 'wait' },
      { kind: 'post', message: { type: 'preview:globals', options: { mode: 'dark' } } },
      { kind: 'post', message: { type: 'preview:set-story', id: 'Button', props: { variant: 'solid' } } },
    ]);
    expect(story.target).toBe('vue');
    // The page comes back with its own type, the rest of its API included.
    expect(story.page.extra).toBe('page-only member');
  });

  it('rejects a target with no story page, naming those that have one', async () => {
    await expect(gotoPreview(page, 'html' as PreviewScriptedTarget)).rejects.toThrow(
      "'html' has no story page; the story pages are react, vue, svelte"
    );
    expect(page.steps).toEqual([]);
  });

  it('rejects an unknown story or option id rather than opening an empty page', async () => {
    await expect(openStory(page, { target: 'vue', id: 'Buton' })).rejects.toThrow(
      "openStory: this preview has no story with the id 'Buton'. Its stories: Button, Card, Menu."
    );
    await expect(openStory(page, { target: 'vue', id: 'Button', options: { colorScheme: 'dark' } })).rejects.toThrow(
      "no option 'colorScheme'"
    );
  });

  it('binds the story controls to its page', async () => {
    const story = await openStory(page, { target: 'svelte', id: 'Button' });
    page.steps.length = 0;
    await story.setProps({ variant: 'ghost' });
    await story.setOptions({ mode: 'light' });
    await story.setStory('Card', { elevated: true });
    expect(posted()).toEqual([
      { type: 'preview:props', props: { variant: 'ghost' } },
      { type: 'preview:globals', options: { mode: 'light' } },
      { type: 'preview:set-story', id: 'Card', props: { elevated: true } },
    ]);
    await story.mountStory('Card');
    expect(posted().slice(3)).toEqual([
      { type: 'preview:set-story', id: '', props: {} },
      { type: 'preview:set-story', id: 'Card', props: {} },
    ]);
  });
});
