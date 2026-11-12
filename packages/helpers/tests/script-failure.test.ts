// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  scriptFailureAttribute,
  scriptFailureBootstrapScript,
} from '../src/runtime/index.js';

describe('scriptFailureAttribute', () => {
  it("names the attribute after the kit's prefix", () => {
    expect(scriptFailureAttribute('djui')).toBe('data-djui-scripts');
    expect(scriptFailureAttribute('char-cell2')).toBe(
      'data-char-cell2-scripts'
    );
  });

  it('refuses a prefix that cannot name an attribute', () => {
    for (const prefix of ['', 'Djui', '1kit', 'kit"', 'kit scripts', '-kit']) {
      expect(() => scriptFailureAttribute(prefix)).toThrow(
        /cannot name an attribute/
      );
    }
  });
});

describe('scriptFailureBootstrapScript', () => {
  const stamped = () =>
    document.documentElement.getAttribute('data-charcell-scripts');
  const listeners: [string, EventListener, boolean][] = [];

  beforeEach(() => {
    // Run the script as a page would, keeping its listeners so each test
    // starts from a page that has seen no failure.
    const add = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation(((
      type: string,
      listener: EventListener,
      options?: boolean
    ) => {
      listeners.push([type, listener, Boolean(options)]);
      add(type, listener, options);
    }) as typeof window.addEventListener);
    new Function(scriptFailureBootstrapScript({ prefix: 'charcell' }))();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    for (const [type, listener, capture] of listeners.splice(0)) {
      window.removeEventListener(type, listener, capture);
    }
    document.head.replaceChildren();
    document.documentElement.removeAttribute('data-charcell-scripts');
  });

  /** An element's failed request: an `error` event that does not bubble. */
  function failToLoad(element: Element) {
    document.head.append(element);
    element.dispatchEvent(new Event('error'));
  }

  function link(rel: string, as?: string) {
    const element = document.createElement('link');
    element.rel = rel;
    if (as) element.setAttribute('as', as);
    return element;
  }

  function rejection(reason: unknown) {
    const event = new Event('unhandledrejection');
    Object.assign(event, { reason });
    window.dispatchEvent(event);
  }

  it('stamps nothing while nothing fails', () => {
    expect(stamped()).toBeNull();
  });

  it('stamps the page when a script fails to load', () => {
    failToLoad(document.createElement('script'));
    expect(stamped()).toBe('failed');
  });

  it('stamps the page when a module or script preload fails to load', () => {
    failToLoad(link('modulepreload'));
    expect(stamped()).toBe('failed');
    document.documentElement.removeAttribute('data-charcell-scripts');
    failToLoad(link('preload', 'script'));
    expect(stamped()).toBe('failed');
  });

  it('leaves the page alone when an image, a stylesheet or a font preload fails', () => {
    failToLoad(document.createElement('img'));
    failToLoad(link('stylesheet'));
    failToLoad(link('preload', 'font'));
    expect(stamped()).toBeNull();
  });

  it('leaves the page alone when a script that loaded throws', () => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }));
    expect(stamped()).toBeNull();
  });

  it('stamps the page when a dynamically imported module cannot be fetched', () => {
    rejection(new Error('The request was refused'));
    rejection(new TypeError('Cannot read properties of undefined'));
    expect(stamped()).toBeNull();
    rejection(
      new TypeError('Failed to fetch dynamically imported module: /tabs.js')
    );
    expect(stamped()).toBe('failed');
  });

  it("stamps only the given kit's attribute", () => {
    failToLoad(document.createElement('script'));
    expect(
      document.documentElement.getAttribute('data-djui-scripts')
    ).toBeNull();
  });

  it('refuses a prefix that cannot name an attribute', () => {
    expect(() =>
      scriptFailureBootstrapScript({ prefix: '");alert(1);("' })
    ).toThrow(/cannot name an attribute/);
  });
});
