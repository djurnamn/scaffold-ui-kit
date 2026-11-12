// @vitest-environment happy-dom
// The Vue iframe's entry (application/preview/vue/main.ts): it mounts the
// story the host sets, and an error the story throws as it sets up or
// renders shows in the pane, as the React page's error boundary shows one,
// until the next story mounts. Its registry is the fixture in
// tests/fixtures/vue/registry.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Held in a variable so the workspace type-check does not follow the import
// into the app, whose build-time aliases only the app's own config maps.
const entryModule = '../application/preview/vue/main';

let posted: unknown[] = [];

async function open(): Promise<void> {
  vi.resetModules();
  window.history.replaceState(null, '', '/preview/vue/preview.html');
  await import(/* @vite-ignore */ entryModule);
  await vi.waitFor(() => expect(posted).toContainEqual({ type: 'preview:ready' }));
}

/** Send the iframe a message as the host does. */
function send(data: Record<string, unknown>): void {
  window.dispatchEvent(new MessageEvent('message', { data }));
}

const pane = () => document.getElementById('app')!;

beforeEach(() => {
  posted = [];
  document.head.innerHTML = '';
  document.body.innerHTML = '<div id="app"></div>';
  vi.spyOn(window, 'postMessage').mockImplementation(((message: unknown) => {
    posted.push(message);
  }) as typeof window.postMessage);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the Vue iframe', () => {
  it('mounts the story the host sets, and updates its props in place', async () => {
    await open();
    send({ type: 'preview:set-story', id: 'fine', props: { label: 'first' } });
    await vi.waitFor(() => expect(pane().querySelector('.Fine')?.textContent).toBe('first'));
    send({ type: 'preview:props', props: { label: 'second' } });
    await vi.waitFor(() => expect(pane().querySelector('.Fine')?.textContent).toBe('second'));
  });

  it("reads the story's components as values in its template's expressions, in a part too", async () => {
    await open();
    send({ type: 'preview:set-story', id: 'component-as-value', props: {} });
    await vi.waitFor(() =>
      expect([...pane().querySelectorAll('.Badge')].map((badge) => badge.textContent)).toEqual(['direct', 'in a part']),
    );
    expect(pane().querySelector('i')).toBeNull();
  });

  it('shows an error the story throws as it sets up, then the next story as usual', async () => {
    await open();
    send({ type: 'preview:set-story', id: 'throws-in-setup', props: {} });
    await vi.waitFor(() => expect(pane().querySelector('pre')?.textContent).toBe('render error: no setup for you'));
    send({ type: 'preview:set-story', id: 'fine', props: { label: 'back' } });
    await vi.waitFor(() => expect(pane().querySelector('.Fine')?.textContent).toBe('back'));
    expect(pane().querySelector('pre')).toBeNull();
  });

  it('shows an error the story throws as it renders', async () => {
    await open();
    send({ type: 'preview:set-story', id: 'throws-in-render', props: {} });
    await vi.waitFor(() =>
      expect(pane().querySelector('pre')?.textContent).toMatch(/^render error: Cannot read properties of undefined/),
    );
  });

  describe('a controlled two-way prop', () => {
    const story = {
      type: 'preview:set-story',
      id: 'controlled-field',
      props: { value: 'hello' },
      events: ['onValueChange'],
      bindings: [{ prop: 'value', changeProp: 'onValueChange' }],
      mount: 4,
    };
    const field = () => pane().querySelector<HTMLInputElement>('.Field')!;
    /** Type `value` into the field, as the browser does, and let Vue flush. */
    async function type(value: string): Promise<void> {
      field().value = value;
      field().dispatchEvent(new Event('input'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

    it('takes the new value in the event, so the restore at the next tick keeps it', async () => {
      await open();
      send(story);
      await vi.waitFor(() => expect(field().value).toBe('hello'));
      await type('hXello');
      expect(field().value).toBe('hXello');
      // Reported to the host under the story's mount.
      expect(posted).toContainEqual(
        expect.objectContaining({ type: 'preview:event', name: 'onValueChange', value: 'hXello', mount: 4 }),
      );
    });

    it("keeps its newest value over props the host sent before it took that write, then takes the host's", async () => {
      await open();
      send(story);
      await vi.waitFor(() => expect(field().value).toBe('hello'));
      await type('hXello');
      await type('hXYello');
      // Each write is numbered on the event that reports it.
      const writes = posted
        .filter((message) => (message as { name?: string }).name === 'onValueChange')
        .map((message) => (message as { write?: number }).write);
      expect(writes).toHaveLength(2);
      const [first, second] = writes as number[];
      expect(second).toBe(first + 1);
      // Another control's change sent before the host took either write.
      send({ type: 'preview:props', props: { value: 'hello', label: 'Full name' }, answers: first - 1 });
      await settle();
      expect(field().value).toBe('hXYello');
      // The late echo of the first write.
      send({ type: 'preview:props', props: { value: 'hXello' }, answers: first });
      await settle();
      expect(field().value).toBe('hXYello');
      send({ type: 'preview:props', props: { value: 'hXYello' }, answers: second });
      await settle();
      expect(field().value).toBe('hXYello');
      // A control's value once the host has every write is taken as it is.
      send({ type: 'preview:props', props: { value: 'reset' }, answers: second });
      await settle();
      expect(field().value).toBe('reset');
    });

    it('forgets the last story\'s writes when the host sets a story', async () => {
      await open();
      send(story);
      await vi.waitFor(() => expect(field().value).toBe('hello'));
      await type('hXello');
      await type('hXYello');
      send(story);
      await vi.waitFor(() => expect(field().value).toBe('hello'));
      // No longer a write of the pane's waiting: taken as it is.
      send({ type: 'preview:props', props: { value: 'hXello' }, answers: 0 });
      await settle();
      expect(field().value).toBe('hXello');
    });
  });
});
