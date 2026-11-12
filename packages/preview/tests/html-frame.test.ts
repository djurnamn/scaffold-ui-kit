// @vitest-environment happy-dom
// The html iframe's entry (application/preview/html/main.ts): it builds the
// kit's mount wrapper and applies its options as the framework iframes do,
// loads no framework setup module, shows the markup the host sends with
// whatever would run taken out, keeps what it shows while the next markup is
// printed, shows the reason when a story has none, stops a form's submission,
// and announces it is ready and reports its content's size.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Held in a variable so the workspace type-check does not follow the import
// into the app, whose build-time aliases only the app's own config maps.
const entryModule = '../application/preview/html/main';

const loadedSetups: string[] = [];
let posted: unknown[] = [];

async function open(): Promise<void> {
  vi.resetModules();
  vi.doMock('@preview-configuration', () => ({
    options: [
      {
        id: 'mode',
        label: 'mode',
        values: [
          { value: 'light', label: 'light' },
          { value: 'dark', label: 'dark' },
        ],
        default: 'light',
        scope: 'global',
        apply: { type: 'root-attribute', attribute: 'data-test-mode' },
      },
    ],
    canvas: { namePrefix: 'test' },
    themes: [],
    viewCanvas: undefined,
    mount: { tag: 'div', classes: ['Frame'], children: [{ tag: 'div', ref: 'story', mount: true }] },
  }));
  for (const framework of ['react', 'vue', 'svelte']) {
    vi.doMock(`@preview-setup/${framework}`, () => {
      loadedSetups.push(framework);
      return {};
    });
  }
  window.history.replaceState(null, '', '/preview/html/preview.html');
  await import(/* @vite-ignore */ entryModule);
  await vi.waitFor(() => expect(posted).toContainEqual({ type: 'preview:ready' }));
}

/** Send the iframe a message as the host does. */
function send(data: Record<string, unknown>): void {
  window.dispatchEvent(new MessageEvent('message', { data }));
}

const mount = () => document.getElementById('app')!;

beforeEach(() => {
  loadedSetups.length = 0;
  posted = [];
  document.head.innerHTML = '';
  document.body.innerHTML = '<div id="app"></div>';
  vi.spyOn(window, 'postMessage').mockImplementation(((message: unknown) => {
    posted.push(message);
  }) as typeof window.postMessage);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('@preview-configuration');
  for (const framework of ['react', 'vue', 'svelte']) vi.doUnmock(`@preview-setup/${framework}`);
});

describe('the html iframe', () => {
  it("wraps the mount as the kit asks, applies its options and loads no framework's setup", async () => {
    await open();
    expect(mount().parentElement!.parentElement!.classList.contains('Frame')).toBe(true);
    expect(document.documentElement.getAttribute('data-test-mode')).toBe('light');
    send({ type: 'preview:globals', options: { mode: 'dark' } });
    expect(document.documentElement.getAttribute('data-test-mode')).toBe('dark');
    expect(loadedSetups).toEqual([]);
    expect((window as unknown as Record<string, unknown>).__previewReady).toBe(true);
    // Its content's size reaches the host, as the framework panes' does.
    await vi.waitFor(() =>
      expect(posted).toContainEqual(expect.objectContaining({ type: 'preview:content-size' })),
    );
  });

  it('shows the markup with nothing in it that runs, and keeps it while the next is printed', async () => {
    await open();
    send({
      type: 'preview:markup',
      markup:
        '<!-- on click: press --><button class="Button" onclick="alert(1)">Go</button>' +
        '<script>window.ran = true</script><a href="javascript:alert(1)" title="link">Link</a>',
    });
    expect(mount().innerHTML).toBe(
      '<!-- on click: press --><button class="Button">Go</button><a title="link">Link</a>',
    );
    expect((window as unknown as Record<string, unknown>).ran).toBeUndefined();

    send({ type: 'preview:markup' });
    expect(mount().getAttribute('aria-busy')).toBe('true');
    expect(mount().querySelector('.Button')).not.toBeNull();

    send({ type: 'preview:markup', reason: 'This story has no html.' });
    expect(mount().getAttribute('aria-busy')).toBeNull();
    expect(mount().querySelector('[data-preview-html-unavailable]')!.textContent).toBe('This story has no html.');
  });

  it("shows the markup under its components' styles, replaced with each markup", async () => {
    await open();
    const componentStyle = () => document.head.querySelector('style[data-preview-html-components]')!;
    send({ type: 'preview:markup', markup: '<button class="button">Go</button>', stylesheet: '.button { color: red; }' });
    expect(componentStyle().textContent).toBe('.button { color: red; }');
    // Printing the next keeps the styles with what the pane still shows.
    send({ type: 'preview:markup' });
    expect(componentStyle().textContent).toBe('.button { color: red; }');
    send({ type: 'preview:markup', markup: '<p>Plain</p>' });
    expect(componentStyle().textContent).toBe('');
  });

  it("stops a form's submission", async () => {
    await open();
    send({ type: 'preview:markup', markup: '<form action="/elsewhere"><button>Send</button></form>' });
    const event = new Event('submit', { bubbles: true, cancelable: true });
    mount().querySelector('form')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
