// What both host drivers (tests/support/host-driver.ts and
// controller-driver.ts) stand up around the code under test in happy-dom: a
// recording `fetch` for the regeneration and html source endpoints, a stand-in window per iframe
// element (the host posts to it, and it is the `source` of what the iframe
// sends back), fake timers, a bare URL and empty local storage, and a
// collector for promise rejections nothing handled. `restore` puts everything back.

import { vi } from 'vitest';
import type { PreviewController, PreviewStoryReference } from '../../src/controller';

export type Target = 'react' | 'vue' | 'svelte';
/** A preview iframe: one per target, the html pane where the kit builds
 *  html, and the single custom-view iframe. */
export type FrameTarget = Target | 'html' | 'view';

/** One `fetch('/__preview_regenerate')` call: its URL, method and parsed body. */
export interface RegenerationRequest {
  url: string;
  method: string | undefined;
  body: unknown;
}

/** How the regeneration endpoint answers: 200, a 500 response, or a rejected fetch. */
export type RegenerationOutcome = 'ok' | 'http-error' | 'network-error';

/** A message posted to a preview iframe, with the frame it went to. */
export interface PostedMessage {
  /** The frame the message went to: a target, the view, or a detached pane's title. */
  target: FrameTarget | string;
  message: unknown;
}

export const SCRIPTED_TARGETS: Target[] = ['react', 'vue', 'svelte'];

/** Which preview iframe an element is: the view pane by its page, else by its title. */
export function targetOf(iframe: HTMLIFrameElement): FrameTarget {
  return (iframe.getAttribute('src') ?? '').startsWith('/preview/view/')
    ? 'view'
    : (iframe.title as Target);
}

export interface PreviewEnvironment {
  log: PostedMessage[];
  regeneration: RegenerationRequest[];
  /** The calls to the html source endpoint, recorded apart. */
  htmlSource: RegenerationRequest[];
  rejections: unknown[];
  setRegenerationOutcome(outcome: RegenerationOutcome): void;
  /** The stand-in window of an iframe element. */
  windowOf(iframe: HTMLIFrameElement): { postMessage: (message: unknown) => void };
  clearMessages(): void;
  /** Put the globals back; rethrows the first rejection that was not a failed regeneration. */
  restore(): Promise<void>;
}

/** Stand up the environment; call `restore` when the test is done. */
export function installPreviewEnvironment(): PreviewEnvironment {
  let log: PostedMessage[] = [];
  const regeneration: RegenerationRequest[] = [];
  const htmlSource: RegenerationRequest[] = [];
  const rejections: unknown[] = [];
  let outcome: RegenerationOutcome = 'ok';
  const windows = new WeakMap<HTMLIFrameElement, { postMessage: (message: unknown) => void }>();

  function windowOf(iframe: HTMLIFrameElement) {
    let stand = windows.get(iframe);
    if (!stand) {
      stand = {
        postMessage: (message: unknown) => {
          // Clone, as postMessage does, so later mutation cannot rewrite history.
          log.push({ target: targetOf(iframe), message: structuredClone(message) });
        },
      };
      windows.set(iframe, stand);
    }
    return stand;
  }

  // A failed regeneration's fetch rejects inside a timer nobody awaits. Collect such
  // rejections for the test to assert on, instead of letting the runner report
  // them; `restore` rethrows any other kind.
  const runnerListeners = process.listeners('unhandledRejection');
  process.removeAllListeners('unhandledRejection');
  const collect = (reason: unknown) => rejections.push(reason);
  process.on('unhandledRejection', collect);

  // Two warnings printed on every run, neither a behavior these tests pin:
  // happy-dom refusing to load the panes' pages, and React flagging the
  // editor's prop controls (a Field's <div>) inside a <p>.
  const consoleError = console.error;
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation((...parameters: unknown[]) => {
    const text = parameters.map(String).join(' ');
    if (text.includes('Iframe page loading is disabled')) return;
    if (text.includes('cannot be a descendant of') || text.includes('cannot contain a nested')) return;
    consoleError(...parameters);
  });

  // The preview keeps its state in the page's query parameters and, when
  // asked, local storage: every test starts from a bare URL and empty storage.
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();

  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      // The html source endpoint answers apart from the regeneration one.
      if (url === '/__preview_html_source') {
        htmlSource.push({ url, method: init?.method, body: JSON.parse(String(init?.body)) });
        return Response.json({ markup: '<p>markup</p>\n' });
      }
      regeneration.push({ url, method: init?.method, body: JSON.parse(String(init?.body)) });
      if (outcome === 'network-error') throw new TypeError('Failed to fetch');
      return new Response('', { status: outcome === 'ok' ? 200 : 500 });
    }),
  );
  const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
    configurable: true,
    get(this: HTMLIFrameElement) {
      return windowOf(this);
    },
  });

  return {
    get log() {
      return log;
    },
    regeneration,
    htmlSource,
    rejections,
    setRegenerationOutcome(next) {
      outcome = next;
    },
    windowOf,
    clearMessages() {
      log = [];
    },
    async restore() {
      consoleSpy.mockRestore();
      vi.unstubAllGlobals();
      vi.useRealTimers();
      // Let any last rejection surface before the runner's listeners return.
      await new Promise((resolve) => setImmediate(resolve));
      if (descriptor) Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', descriptor);
      process.off('unhandledRejection', collect);
      for (const listener of runnerListeners) process.on('unhandledRejection', listener);
      const unexpected = rejections.filter(
        (reason) => !(reason instanceof TypeError && reason.message === 'Failed to fetch'),
      );
      if (unexpected.length > 0) throw unexpected[0];
    },
  };
}

/** Deliver a message to the host window as if `iframe` had posted it. */
export function postFromFrame(
  environment: PreviewEnvironment,
  iframe: HTMLIFrameElement | undefined,
  message: unknown,
): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: message,
      source: iframe ? (environment.windowOf(iframe) as unknown as Window) : null,
    }),
  );
}

/** A detached story pane a driver mounted: what was posted to it, its source, and its handshake. */
export interface StoryPane {
  /** The iframe's title, which the message log files its messages under. */
  title: string;
  /** The messages posted to the pane since the last `clearMessages`, in order. */
  messages(): unknown[];
  /** The URL the pane loads. */
  source(): string | undefined;
  /** The pane announces it has loaded: `preview:ready`. */
  ready(): Promise<void>;
  unmount(): Promise<void>;
}

/** The element detached panes are mounted in, apart from the shell's panes. */
export const DETACHED_PANES_ATTRIBUTE = 'data-detached-panes';

/** Whether an iframe is a detached pane a test mounted. */
export function isDetached(iframe: HTMLIFrameElement): boolean {
  return iframe.closest(`[${DETACHED_PANES_ATTRIBUTE}]`) !== null;
}

/**
 * Mount a detached story pane through `controller`, in an element of its own
 * appended to the body, as a shell's documentation page would.
 */
export async function mountStoryPane(
  environment: PreviewEnvironment,
  controller: PreviewController,
  target: Target,
  story: PreviewStoryReference,
  settle: (work: () => void | Promise<void>) => Promise<void> = async (work) => {
    await work();
  },
): Promise<StoryPane> {
  const element = document.createElement('div');
  element.setAttribute(DETACHED_PANES_ATTRIBUTE, '');
  document.body.appendChild(element);
  let unmountPane: () => void = () => {};
  await settle(() => {
    unmountPane = controller.frames.mountStory(element, target, story);
  });
  const iframe = element.querySelector('iframe')!;
  const title = iframe.title;
  return {
    title,
    messages: () => environment.log.filter((entry) => entry.target === title).map((entry) => entry.message),
    source: () => element.querySelector('iframe')?.getAttribute('src') ?? undefined,
    ready: () => settle(() => postFromFrame(environment, iframe, { type: 'preview:ready' })),
    unmount: () =>
      settle(() => {
        unmountPane();
        element.remove();
      }),
  };
}
