// @vitest-environment happy-dom
// Characterization tests for the preview's behavior: what it shows the
// outside world - the messages each preview iframe is posted
// (`preview:set-story`, `preview:props`, `preview:globals`,
// `preview:catalog`), the replies to a frame's `preview:ready`, the
// `/__preview_regenerate` requests and their payloads, the regeneration status, and each
// pane's source URL (a changed `?r=` is a pane reload) - in response to what a
// shell can do: select a component or a view, pick a scenario, set an option,
// toggle a target, edit the scenario editor's tree, or relay a view's
// `preview:select`.
//
// Every test body runs twice, through two drivers of one interface
// (support/host-driver.ts): one runs the real bootstrap, which loads the
// charcell shell, against the fixture kit in fixtures/host/ and works the
// shell's controls the way a person would; the other is a bare shell over
// `createPreviewController`. A test asserts only on the driver's outputs,
// never on React or markup, so the two must agree.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createControllerDriver } from './support/controller-driver';
import {
  createReactHostDriver,
  type FrameTarget,
  type PreviewHostDriver,
} from './support/host-driver';

const BUTTON = 'components-button';
const CARD = 'components-layout-card';
const ICON = 'icons-icon';
const PARTIAL_TAB = 'components-layout-tab';

const SCRIPTED_TARGETS: FrameTarget[] = ['react', 'vue', 'svelte'];

/** The option values every preview starts from: the globals' and the story options' config defaults. */
const DEFAULT_OPTIONS = {
  theme: 'light',
  mode: false,
  box: true,
  padded: false,
};

/** The `preview:catalog` a frame receives: browseable stories only, sources by order. */
const CATALOG = {
  type: 'preview:catalog',
  kitName: 'acme',
  sources: [
    { id: 'core', label: 'Components', order: 0 },
    { id: 'icons', label: 'Icons', order: 1 },
  ],
  components: [
    { id: BUTTON, title: 'Components/Button', source: 'core' },
    { id: CARD, title: 'Components/Layout/Card', source: 'core' },
    { id: ICON, title: 'Icons/Icon', source: 'icons' },
  ],
};

// Each carries the host's mount of the story, which the panes tag their
// events with (the two-way tests check it).
const setStory = (id: string, props: Record<string, unknown>) => ({
  type: 'preview:set-story',
  id,
  props,
  mount: expect.any(Number),
});
// A detached pane's story is its own: none of its events write back, so it
// carries no mount.
const detachedStory = (id: string, props: Record<string, unknown>) => ({
  type: 'preview:set-story',
  id,
  props,
});
const globals = (options: Record<string, unknown>) => ({
  type: 'preview:globals',
  options,
});
// No pane in these tests writes back a value itself, so each props message
// answers none of its writes.
const props = (values: Record<string, unknown>) => ({
  type: 'preview:props',
  props: values,
  answers: 0,
});

const DRIVERS: [string, () => PreviewHostDriver][] = [
  ['React host', createReactHostDriver],
  ['controller', createControllerDriver],
];

describe.each(DRIVERS)('%s', (name, createDriver) => {
  const driver = createDriver();

  /** The address apart from a shell's own options, such as the charcell
   *  shell's views, which the controller driver has none of. */
  function previewSearch(): string {
    return driver
      .search()
      .replace(/&?option\.shell\.[^&]*/g, '')
      .replace(/^\?&/, '?');
  }

  beforeEach(async () => {
    await driver.start();
  });

  afterEach(async () => {
    await driver.stop();
  });

  /** Every target pane received exactly `messages`, in order. */
  function expectEveryTarget(messages: unknown[]) {
    for (const target of SCRIPTED_TARGETS)
      expect(driver.messages(target)).toEqual(messages);
  }

  describe('host - start and the ready handshake', () => {
    it('starts on the first browseable story, three panes, and posts nothing until a frame is ready', () => {
      expect(driver.frames()).toEqual(['react', 'vue', 'svelte']);
      for (const target of SCRIPTED_TARGETS) {
        expect(driver.frameSource(target)).toBe(
          `/preview/${target}/preview.html?r=0`
        );
      }
      expect(driver.allMessages()).toEqual([]);
      expect(driver.regenerationRequests()).toEqual([]);
      expect(driver.editorVisible()).toBe(false);
    });

    it('answers a ready frame, and only that frame, with the story, the merged options and the catalog', async () => {
      await driver.frameReady('vue');
      expect(driver.messages('vue')).toEqual([
        setStory(BUTTON, { variant: 'solid', children: 'Click' }),
        globals(DEFAULT_OPTIONS),
        CATALOG,
      ]);
      expect(driver.messages('react')).toEqual([]);
      expect(driver.messages('svelte')).toEqual([]);
    });

    it('answers a late-loading frame with the state as it stands now', async () => {
      await driver.selectComponent(CARD);
      await driver.pickScenario('toned');
      await driver.setOption('theme', 'dark');
      await driver.setStoryOption('padded', false);
      driver.clearMessages();

      await driver.frameReady('svelte');
      expect(driver.messages('svelte')).toEqual([
        // A picked scenario's props land over the component's defaults, not over
        // its default-flagged scenario (Raised), so `elevated` is back to false.
        setStory(CARD, { elevated: false, children: 'unused', tone: 'accent' }),
        globals({ theme: 'dark', mode: false, box: true, padded: false }),
        CATALOG,
      ]);
    });
  });

  describe('host - selecting a component', () => {
    it('seeds the props from the default-flagged scenario and pushes the story option defaults', async () => {
      await driver.selectComponent(CARD);
      expectEveryTarget([
        setStory(CARD, { elevated: true, children: 'unused' }),
        // Card's story file marks `box` unavailable (it keeps its config default) and
        // turns `padded` on.
        globals({ theme: 'light', mode: false, box: true, padded: true }),
      ]);
      expect(driver.regenerationRequests()).toEqual([]);
    });

    it('offers only the story options the story file leaves available', async () => {
      // The story options show in the scenario row.
      await driver.openEditor();
      expect(await driver.storyOptionsOffered()).toEqual(['box', 'padded']);
      await driver.selectComponent(CARD);
      expect(await driver.storyOptionsOffered()).toEqual(['padded']);
    });

    it('shows only the panes of the targets a component targets, and posts to those alone', async () => {
      await driver.selectComponent(ICON);
      expect(driver.frames()).toEqual(['react']);
      expect(driver.targetToggles()).toEqual({
        react: { visible: true, supported: true },
        vue: { visible: false, supported: false },
        svelte: { visible: false, supported: false },
      });
      driver.clearMessages();
      await driver.setOption('theme', 'dark');
      expect(driver.allMessages()).toEqual([
        {
          target: 'react',
          message: globals({
            theme: 'dark',
            mode: false,
            box: true,
            padded: false,
          }),
        },
      ]);

      // The other targets come back with a story that targets them.
      await driver.selectComponent(BUTTON);
      expect(driver.frames()).toEqual(['react', 'vue', 'svelte']);
    });
  });

  describe('host - scenarios', () => {
    it('sends a picked scenario as the real story, its props over the component defaults', async () => {
      await driver.pickScenario('ghost');
      expectEveryTarget([
        setStory(BUTTON, { variant: 'ghost', children: 'Click' }),
      ]);
      driver.clearMessages();

      // A generated scenario (one enum value or boolean) behaves the same.
      await driver.pickScenario('disabled-true');
      expectEveryTarget([
        setStory(BUTTON, {
          variant: 'solid',
          children: 'Click',
          disabled: true,
        }),
      ]);
      driver.clearMessages();

      await driver.pickScenario('');
      expectEveryTarget([
        setStory(BUTTON, { variant: 'solid', children: 'Click' }),
      ]);
      // Scenarios carry no options and never regenerate.
      expect(driver.regenerationRequests()).toEqual([]);
    });

    it('renders the Empty scenario through a hidden editor: scratch story, regeneration, reload', async () => {
      await driver.pickScenario('empty');
      // The editor mounts but stays hidden, and switches the panes to the
      // scratch story at once, with the story's props minus its slot content.
      expect(driver.editorVisible()).toBe(false);
      expectEveryTarget([setStory('scratch', { variant: 'solid' })]);
      expect(driver.regenerationRequests()).toEqual([]);

      await driver.advanceTime(250);
      expect(driver.regenerationRequests()).toEqual([
        {
          url: '/__preview_regenerate',
          method: 'POST',
          // No slot content at all: the payload's `slots` is undefined, so absent.
          body: { rootComponent: 'Button', props: { variant: 'solid' } },
        },
      ]);
      for (const target of SCRIPTED_TARGETS) {
        expect(driver.frameSource(target)).toBe(
          `/preview/${target}/preview.html?r=1`
        );
      }

      // The reloaded panes handshake again and get the scratch story back.
      driver.clearMessages();
      await driver.frameReady('react');
      expect(driver.messages('react')[0]).toEqual(
        setStory('scratch', { variant: 'solid' })
      );
    });

    it('leaves Empty for the real story again, keeping the reload count', async () => {
      await driver.pickScenario('empty');
      await driver.advanceTime(250);
      driver.clearMessages();

      await driver.pickScenario('ghost');
      expectEveryTarget([
        setStory(BUTTON, { variant: 'ghost', children: 'Click' }),
      ]);
      expect(driver.frameSource('react')).toBe(
        '/preview/react/preview.html?r=1'
      );
      driver.clearMessages();
      await driver.frameReady('react');
      expect(driver.messages('react')[0]).toEqual(
        setStory(BUTTON, { variant: 'ghost', children: 'Click' })
      );
    });
  });

  describe('host - options', () => {
    it('broadcasts a global option merged with the story options, and keeps it across stories', async () => {
      await driver.setOption('theme', 'dark');
      expectEveryTarget([globals({ ...DEFAULT_OPTIONS, theme: 'dark' })]);
      driver.clearMessages();

      await driver.setOption('mode', true);
      expectEveryTarget([
        globals({ ...DEFAULT_OPTIONS, theme: 'dark', mode: true }),
      ]);
      driver.clearMessages();

      await driver.selectComponent(CARD);
      expect(driver.messages('react')).toEqual([
        setStory(CARD, { elevated: true, children: 'unused' }),
        globals({ theme: 'dark', mode: true, box: true, padded: true }),
      ]);
    });

    it('broadcasts a story option merged with the globals, and drops it on the next story', async () => {
      await driver.setStoryOption('box', false);
      expectEveryTarget([globals({ ...DEFAULT_OPTIONS, box: false })]);
      driver.clearMessages();

      // Back on the same component, the override is gone: story options reset
      // to the story file defaults on every selection.
      await driver.selectComponent(CARD);
      await driver.selectComponent(BUTTON);
      expect(driver.messages('react')).toEqual([
        setStory(CARD, { elevated: true, children: 'unused' }),
        globals({ theme: 'light', mode: false, box: true, padded: true }),
        setStory(BUTTON, { variant: 'solid', children: 'Click' }),
        globals(DEFAULT_OPTIONS),
      ]);
    });
  });

  describe('host - target visibility', () => {
    it('drops a hidden target pane, stops posting to it, and keeps it hidden across stories', async () => {
      await driver.setTargetVisible('vue', false);
      expect(driver.frames()).toEqual(['react', 'svelte']);
      expect(driver.targetToggles().vue).toEqual({
        visible: false,
        supported: true,
      });
      expect(driver.allMessages()).toEqual([]);

      await driver.setOption('theme', 'dark');
      expect(driver.messages('vue')).toEqual([]);
      expect(driver.messages('react')).toHaveLength(1);

      await driver.selectComponent(CARD);
      expect(driver.frames()).toEqual(['react', 'svelte']);

      await driver.setTargetVisible('vue', true);
      expect(driver.frames()).toEqual(['react', 'vue', 'svelte']);
      // A pane shown again starts at the current reload count and waits for its handshake.
      expect(driver.frameSource('vue')).toBe('/preview/vue/preview.html?r=0');
      expect(driver.messages('vue')).toEqual([]);
    });

    it('keeps the visible targets in the address while not every one is on', async () => {
      await driver.setTargetVisible('vue', false);
      expect(previewSearch()).toBe(`?component=${BUTTON}&targets=react,svelte`);
      await driver.selectView('gallery');
      expect(previewSearch()).toBe('?view=gallery&targets=react,svelte');
      await driver.selectComponent(BUTTON);
      await driver.setTargetVisible('vue', true);
      expect(previewSearch()).toBe(`?component=${BUTTON}`);
    });

    it('opens a link with the targets it names, ignoring those the kit does not build', async () => {
      await driver.stop();
      await driver.start({ url: `/?component=${BUTTON}&targets=svelte,angular` });
      expect(driver.frames()).toEqual(['svelte']);
      expect(driver.targetToggles().react).toEqual({ visible: false, supported: true });
    });
  });

  describe('host - props', () => {
    it('sets the root props live, without a regeneration, and holds them in the state', async () => {
      expect(driver.props()).toEqual({ variant: 'solid', children: 'Click' });
      await driver.setProps({ variant: 'ghost', children: 'Hi' });
      expectEveryTarget([props({ variant: 'ghost', children: 'Hi' })]);
      expect(driver.props()).toEqual({ variant: 'ghost', children: 'Hi' });
      await driver.advanceTime(1000);
      expect(driver.regenerationRequests()).toEqual([]);
      expect(driver.frameSource('react')).toBe('/preview/react/preview.html?r=0');

      // A pane that loads now gets the story with them.
      driver.clearMessages();
      await driver.frameReady('react');
      expect(driver.messages('react')[0]).toEqual(setStory(BUTTON, { variant: 'ghost', children: 'Hi' }));
    });

    it('drops props set to undefined, and seeds them afresh with a scenario or a story', async () => {
      await driver.setProps({ variant: 'ghost', children: undefined });
      expect(driver.props()).toEqual({ variant: 'ghost' });
      await driver.pickScenario('disabled-true');
      expect(driver.props()).toEqual({ variant: 'solid', children: 'Click', disabled: true });
      await driver.setProps({ variant: 'ghost' });
      await driver.selectComponent(CARD);
      expect(driver.props()).toEqual({ elevated: true, children: 'unused' });
    });

    it('is ignored while a view is selected', async () => {
      await driver.selectView('gallery');
      const before = driver.props();
      driver.clearMessages();
      await driver.setProps({ variant: 'ghost' });
      expect(driver.allMessages()).toEqual([]);
      expect(driver.props()).toBe(before);
    });

    it("hands props set from outside to the editor's root, and the root's edits to the state", async () => {
      await driver.selectComponent(CARD);
      await driver.openEditor();
      expect(driver.props()).toEqual({ elevated: true });
      driver.clearMessages();
      await driver.setProps({ elevated: false });
      expectEveryTarget([props({ elevated: false })]);
      await driver.editRootProps({ tone: 'primary' });
      expect(driver.props()).toEqual({ elevated: false, tone: 'primary' });
      // A structural edit renders the scratch story with them.
      driver.clearMessages();
      await driver.setText([{ slot: 'header', index: 0 }], 'Hello');
      expectEveryTarget([setStory('scratch', { elevated: false, tone: 'primary' })]);
      await driver.advanceTime(250);
      expect(driver.regenerationRequests()[0].body).toMatchObject({ props: { elevated: false, tone: 'primary' } });
    });
  });

  describe('host - detached story panes', () => {
    it("mounts a pane of any story apart from the selection's, answering its handshake with its own story", async () => {
      const pane = await driver.mountStory('vue', { component: CARD, scenario: 'toned' });
      expect(driver.frames()).toEqual(['react', 'vue', 'svelte']);
      expect(pane.source()).toBe('/preview/vue/preview.html?r=0');
      expect(pane.messages()).toEqual([]);
      await pane.ready();
      expect(pane.messages()).toEqual([
        detachedStory(CARD, { elevated: false, children: 'unused', tone: 'accent' }),
        // Card's own story options, as selecting it would seed them.
        globals({ theme: 'light', mode: false, box: true, padded: true }),
        CATALOG,
      ]);
      // The selection's panes heard nothing.
      expect(driver.messages('vue')).toEqual([]);
    });

    it("starts on the story's starting scenario, with given props over it", async () => {
      const raised = await driver.mountStory('react', { component: CARD });
      const plain = await driver.mountStory('react', { component: CARD, scenario: '', props: { tone: 'primary' } });
      await raised.ready();
      await plain.ready();
      expect(raised.messages()[0]).toEqual(detachedStory(CARD, { elevated: true, children: 'unused' }));
      expect(plain.messages()[0]).toEqual(detachedStory(CARD, { elevated: false, children: 'unused', tone: 'primary' }));
    });

    it("follows the global options, and nothing of the selection's story, props or story options", async () => {
      const pane = await driver.mountStory('react', { component: ICON, props: { name: 'heart' } });
      await pane.ready();
      expect(pane.messages()[0]).toEqual(detachedStory(ICON, { name: 'heart' }));
      driver.clearMessages();

      await driver.setOption('theme', 'dark');
      expect(pane.messages()).toEqual([globals({ theme: 'dark', mode: false, box: true, padded: false })]);
      driver.clearMessages();

      await driver.setStoryOption('box', false);
      await driver.setProps({ variant: 'ghost' });
      await driver.pickScenario('ghost');
      await driver.selectComponent(CARD);
      expect(pane.messages()).toEqual([]);
    });

    it('stays on its story through a regeneration, unreloaded, and goes on unmount', async () => {
      const pane = await driver.mountStory('react', { component: BUTTON, scenario: 'ghost' });
      await driver.selectComponent(CARD);
      await driver.openEditor();
      await driver.setText([{ slot: 'header', index: 0 }], 'Hello');
      await driver.advanceTime(250);
      expect(driver.frameSource('react')).toBe('/preview/react/preview.html?r=1');
      expect(pane.source()).toBe('/preview/react/preview.html?r=0');
      expect(pane.messages()).toEqual([]);

      await pane.unmount();
      expect(pane.source()).toBeUndefined();
      expect(driver.frames()).toEqual(['react', 'vue', 'svelte']);
    });
  });

  describe('host - the scenario editor', () => {
    beforeEach(async () => {
      await driver.selectComponent(CARD);
      driver.clearMessages();
    });

    it('opens over the real story without posting or regenerating', async () => {
      await driver.openEditor();
      expect(driver.editorVisible()).toBe(true);
      await driver.advanceTime(1000);
      expect(driver.allMessages()).toEqual([]);
      expect(driver.regenerationRequests()).toEqual([]);

      // The props now read from the tree. The Card's own content stands in its
      // default slot, which the panes render in place of its unused string
      // `children`, so the props leave that `children` out and a frame that
      // handshakes gets the story without it, the same on screen.
      await driver.frameReady('react');
      expect(driver.messages('react')[0]).toEqual(
        setStory(CARD, { elevated: true })
      );
    });

    it("keeps a story's string children in its props and address as the root's text, open, reseeded and on Empty", async () => {
      await driver.selectComponent(BUTTON);
      await driver.openEditor();
      // The editor holds `children` as the root's text, and the props still show it.
      expect(driver.props()).toEqual({ variant: 'solid', children: 'Click' });
      expect(previewSearch()).toBe(`?component=${BUTTON}`);
      driver.clearMessages();
      await driver.frameReady('react');
      expect(driver.messages('react')[0]).toEqual(
        setStory(BUTTON, { variant: 'solid', children: 'Click' })
      );

      // A root prop edit keeps the text, live, and a link made now names
      // only the edit: the text is the scenario's, which the link keeps.
      driver.clearMessages();
      await driver.editRootProps({ variant: 'ghost' });
      expectEveryTarget([props({ variant: 'ghost', children: 'Click' })]);
      expect(
        JSON.parse(new URLSearchParams(driver.search()).get('props')!)
      ).toEqual({ variant: 'ghost' });

      // A scenario picked with the editor open reseeds the tree, its text in the props.
      await driver.pickScenario('disabled-true');
      expect(driver.props()).toEqual({
        variant: 'solid',
        children: 'Click',
        disabled: true,
      });
      expect(previewSearch()).toBe(`?component=${BUTTON}&scenario=disabled-true`);

      // Editing the root's text is a content edit, and `children` follows it.
      driver.clearMessages();
      await driver.setText([{ slot: 'default', index: 0 }], 'Press');
      expectEveryTarget([
        setStory('scratch', { variant: 'solid', disabled: true }),
      ]);
      expect(driver.props()).toEqual({
        variant: 'solid',
        children: 'Press',
        disabled: true,
      });

      // The Empty scenario has no content, so no `children`.
      await driver.pickScenario('empty');
      expect(driver.props()).toEqual({ variant: 'solid' });
    });

    it('sends root-prop edits live as preview:props, without a regeneration or reload', async () => {
      await driver.openEditor();
      await driver.editRootProps({ tone: 'primary' });
      expectEveryTarget([
        props({ elevated: true, tone: 'primary' }),
      ]);
      driver.clearMessages();

      // Unsetting a prop drops it from the payload.
      await driver.editRootProps({ tone: '' });
      expectEveryTarget([
        props({ elevated: true }),
      ]);

      await driver.advanceTime(1000);
      expect(driver.regenerationRequests()).toEqual([]);
      expect(driver.frameSource('react')).toBe(
        '/preview/react/preview.html?r=0'
      );

      // The panes stay on the real story, with the edited props.
      driver.clearMessages();
      await driver.editRootProps({ tone: 'accent' });
      driver.clearMessages();
      await driver.frameReady('react');
      expect(driver.messages('react')[0]).toEqual(
        setStory(CARD, { elevated: true, tone: 'accent' })
      );
    });

    it('switches the panes to scratch on a nested edit, then regenerates after 250ms and reloads', async () => {
      await driver.openEditor();
      await driver.setText([{ slot: 'header', index: 0 }], 'Hello');
      expectEveryTarget([setStory('scratch', { elevated: true })]);
      expect(driver.regenerationRequests()).toEqual([]);

      await driver.advanceTime(249);
      expect(driver.regenerationRequests()).toEqual([]);
      await driver.advanceTime(1);
      expect(driver.regenerationRequests()).toEqual([
        {
          url: '/__preview_regenerate',
          method: 'POST',
          body: {
            rootComponent: 'Card',
            props: { elevated: true },
            slots: {
              default: {
                kind: 'element',
                component: 'Button',
                props: { variant: 'ghost' },
                children: { kind: 'text', value: 'Go' },
              },
              named: { header: { kind: 'text', value: 'Hello' } },
            },
          },
        },
      ]);
      for (const target of SCRIPTED_TARGETS) {
        expect(driver.frameSource(target)).toBe(
          `/preview/${target}/preview.html?r=1`
        );
      }

      driver.clearMessages();
      await driver.frameReady('vue');
      expect(driver.messages('vue')).toEqual([
        setStory('scratch', { elevated: true }),
        globals({ theme: 'light', mode: false, box: true, padded: true }),
        CATALOG,
      ]);
    });

    it('coalesces a burst of edits into one regeneration of the last tree, each edit still posting scratch', async () => {
      await driver.openEditor();
      await driver.setText([{ slot: 'header', index: 0 }], 'Hello');
      await driver.advanceTime(200);
      await driver.editNestedProps([{ slot: 'default', index: 0 }], {
        variant: 'solid',
        disabled: true,
      });
      await driver.advanceTime(200);
      await driver.setText(
        [
          { slot: 'default', index: 0 },
          { slot: 'default', index: 0 },
        ],
        'Went'
      );
      // One set-story per edit (a prop panel's two controls are two edits).
      expect(driver.messages('react')).toEqual(
        Array.from({ length: 4 }, () => setStory('scratch', { elevated: true }))
      );
      expect(driver.regenerationRequests()).toEqual([]);

      await driver.advanceTime(250);
      expect(driver.regenerationRequests()).toHaveLength(1);
      expect(driver.regenerationRequests()[0].body).toEqual({
        rootComponent: 'Card',
        props: { elevated: true },
        slots: {
          default: {
            kind: 'element',
            component: 'Button',
            props: { variant: 'solid', disabled: true },
            children: { kind: 'text', value: 'Went' },
          },
          named: { header: { kind: 'text', value: 'Hello' } },
        },
      });
      expect(driver.frameSource('react')).toBe(
        '/preview/react/preview.html?r=1'
      );
    });

    it('carries live root props into the scratch story and its regeneration', async () => {
      await driver.openEditor();
      await driver.editRootProps({ tone: 'primary' });
      driver.clearMessages();
      await driver.removeNode([{ slot: 'header', index: 0 }]);
      expectEveryTarget([
        setStory('scratch', { elevated: true, tone: 'primary' }),
      ]);
      await driver.advanceTime(250);
      expect(driver.regenerationRequests()[0].body).toEqual({
        rootComponent: 'Card',
        props: { elevated: true, tone: 'primary' },
        slots: {
          default: {
            kind: 'element',
            component: 'Button',
            props: { variant: 'ghost' },
            children: { kind: 'text', value: 'Go' },
          },
        },
      });
    });

    it('regenerates on a move, and ignores a move into the node itself', async () => {
      await driver.openEditor();
      await driver.moveNode([{ slot: 'default', index: 0 }], {
        parent: [{ slot: 'default', index: 0 }],
        slot: 'default',
        index: 0,
      });
      await driver.advanceTime(1000);
      expect(driver.allMessages()).toEqual([]);
      expect(driver.regenerationRequests()).toEqual([]);

      await driver.moveNode([{ slot: 'header', index: 0 }], {
        parent: [],
        slot: 'default',
        index: 0,
      });
      expectEveryTarget([setStory('scratch', { elevated: true })]);
      await driver.advanceTime(250);
      expect(driver.regenerationRequests()[0].body).toEqual({
        rootComponent: 'Card',
        props: { elevated: true },
        slots: {
          default: {
            kind: 'fragment',
            children: [
              { kind: 'text', value: 'Title' },
              {
                kind: 'element',
                component: 'Button',
                props: { variant: 'ghost' },
                children: { kind: 'text', value: 'Go' },
              },
            ],
          },
        },
      });
      expect(driver.frameSource('react')).toBe(
        '/preview/react/preview.html?r=1'
      );
    });

    it('reports a regeneration that answers with an error and leaves the panes alone', async () => {
      // A failed write must not reload the panes onto a stale scratch module.
      driver.setRegenerationOutcome('http-error');
      await driver.openEditor();
      expect(driver.regenerationStatus()).toEqual({ status: 'idle' });
      await driver.setText([{ slot: 'header', index: 0 }], 'Hello');
      expect(driver.regenerationStatus()).toEqual({ status: 'pending' });
      await driver.advanceTime(250);
      expect(driver.regenerationRequests()).toHaveLength(1);
      expect(driver.frameSource('react')).toBe(
        '/preview/react/preview.html?r=0'
      );
      expect(driver.regenerationStatus()).toEqual({
        status: 'error',
        message: 'HTTP 500',
      });

      // The next edit tries again, and a success clears the error.
      driver.setRegenerationOutcome('ok');
      await driver.setText([{ slot: 'header', index: 0 }], 'Hello again');
      expect(driver.regenerationStatus()).toEqual({ status: 'pending' });
      await driver.advanceTime(250);
      expect(driver.regenerationRequests()).toHaveLength(2);
      expect(driver.frameSource('react')).toBe(
        '/preview/react/preview.html?r=1'
      );
      expect(driver.regenerationStatus()).toEqual({ status: 'idle' });
    });

    it('reports a regeneration request that itself fails, with nothing left unhandled', async () => {
      driver.setRegenerationOutcome('network-error');
      await driver.openEditor();
      await driver.setText([{ slot: 'header', index: 0 }], 'Hello');
      await driver.advanceTime(250);
      expect(driver.regenerationRequests()).toHaveLength(1);
      // The panes stay on the scratch story they were switched to, unreloaded.
      expect(driver.frameSource('react')).toBe(
        '/preview/react/preview.html?r=0'
      );
      expect(driver.regenerationStatus()).toEqual({
        status: 'error',
        message: 'Failed to fetch',
      });
      expect(driver.unhandledRejections()).toHaveLength(0);

      // The next edit tries again.
      driver.setRegenerationOutcome('ok');
      await driver.setText([{ slot: 'header', index: 0 }], 'Hello again');
      await driver.advanceTime(250);
      expect(driver.regenerationRequests()).toHaveLength(2);
      expect(driver.frameSource('react')).toBe(
        '/preview/react/preview.html?r=1'
      );
      expect(driver.regenerationStatus()).toEqual({ status: 'idle' });
    });

    it('starts afresh on another selection, going back to the real story', async () => {
      await driver.openEditor();
      await driver.setText([{ slot: 'header', index: 0 }], 'Hello');
      await driver.advanceTime(250);
      driver.clearMessages();

      // The editor closes. In the charcell shell the scenario row still
      // shows, and opens it again on the new story's own tree, posting
      // nothing more.
      await driver.selectComponent(BUTTON);
      expect(driver.editorVisible()).toBe(name === 'React host');
      expect(driver.messages('react')).toEqual([
        setStory(BUTTON, { variant: 'solid', children: 'Click' }),
        globals(DEFAULT_OPTIONS),
      ]);
      driver.clearMessages();
      await driver.frameReady('react');
      expect(driver.messages('react')[0]).toEqual(
        setStory(BUTTON, { variant: 'solid', children: 'Click' })
      );
    });

    it('drops a pending regeneration when another story is selected', async () => {
      // An edit made just before switching stories must not regenerate the old
      // tree and reload the panes now showing the new story.
      await driver.openEditor();
      await driver.setText([{ slot: 'header', index: 0 }], 'Hello');
      expect(driver.regenerationStatus()).toEqual({ status: 'pending' });
      await driver.selectComponent(BUTTON);
      expect(driver.regenerationStatus()).toEqual({ status: 'idle' });
      driver.clearMessages();

      await driver.advanceTime(250);
      expect(driver.regenerationRequests()).toEqual([]);
      expect(driver.frameSource('react')).toBe(
        '/preview/react/preview.html?r=0'
      );
      expect(driver.allMessages()).toEqual([]);
    });

    it('reseeds the tree when a scenario is picked with the editor open', async () => {
      await driver.openEditor();
      await driver.setText([{ slot: 'header', index: 0 }], 'Hello');
      await driver.advanceTime(250);
      driver.clearMessages();

      await driver.pickScenario('toned');
      // Back to the real story; the editor stays open on a fresh, lazy tree.
      expect(driver.editorVisible()).toBe(true);
      expectEveryTarget([
        setStory(CARD, { elevated: false, children: 'unused', tone: 'accent' }),
      ]);
      await driver.advanceTime(1000);
      expect(driver.regenerationRequests()).toHaveLength(1);

      await driver.setText([{ slot: 'header', index: 0 }], 'Again');
      await driver.advanceTime(250);
      expect(driver.regenerationRequests()[1].body).toMatchObject({
        rootComponent: 'Card',
        props: { elevated: false, tone: 'accent' },
        slots: { named: { header: { kind: 'text', value: 'Again' } } },
      });
    });
  });

  describe('host - the URL', () => {
    it('writes the selection, the scenario and the changed options as they change, from the first action on', async () => {
      // An untouched page keeps the address it was opened with.
      expect(previewSearch()).toBe('');
      await driver.selectComponent(CARD);
      await driver.pickScenario('toned');
      await driver.setOption('theme', 'dark');
      await driver.setStoryOption('padded', false);
      expect(previewSearch()).toBe(
        `?component=${CARD}&scenario=toned&option.theme=dark&option.padded=false`
      );
      await driver.selectView('gallery');
      expect(previewSearch()).toBe('?view=gallery&option.theme=dark');
    });

    it('opens a deep link, the story, scenario and options reaching a ready frame', async () => {
      await driver.stop();
      await driver.start({
        url: `/?component=${CARD}&scenario=toned&option.mode=true&option.padded=false&option.theme=sepia`,
      });
      await driver.frameReady('react');
      expect(driver.messages('react')).toEqual([
        setStory(CARD, { elevated: false, children: 'unused', tone: 'accent' }),
        globals({ ...DEFAULT_OPTIONS, mode: true, padded: false }),
        CATALOG,
      ]);
      await driver.openEditor();
      expect(await driver.storyOptionsOffered()).toEqual(['padded']);
    });

    it("carries the props only while they differ from the scenario's, never the editor's content", async () => {
      await driver.setProps({ variant: 'ghost', children: 'Hi' });
      expect(previewSearch()).toBe(`?component=${BUTTON}&props=%7B%22variant%22:%22ghost%22,%22children%22:%22Hi%22%7D`);
      expect(JSON.parse(new URLSearchParams(driver.search()).get('props')!)).toEqual({ variant: 'ghost', children: 'Hi' });
      // Set back to the scenario's, they leave the address.
      await driver.setProps({ variant: 'solid', children: 'Click' });
      expect(previewSearch()).toBe(`?component=${BUTTON}`);
      // A scenario seeds them afresh.
      await driver.setProps({ variant: 'ghost' });
      await driver.pickScenario('disabled-true');
      expect(previewSearch()).toBe(`?component=${BUTTON}&scenario=disabled-true`);

      // The editor's root props go in the address, its content never.
      await driver.selectComponent(CARD);
      await driver.openEditor();
      expect(previewSearch()).toBe(`?component=${CARD}`);
      await driver.setText([{ slot: 'header', index: 0 }], 'Hello');
      expect(previewSearch()).toBe(`?component=${CARD}`);
      await driver.editRootProps({ tone: 'primary' });
      // Only the edit: `elevated` is the scenario's.
      expect(JSON.parse(new URLSearchParams(driver.search()).get('props')!)).toEqual({ tone: 'primary' });
    });

    it('opens a link with props, the panes showing them over the scenario', async () => {
      await driver.stop();
      const linked = encodeURIComponent(JSON.stringify({ elevated: true, children: 'unused', tone: 'primary' }));
      await driver.start({ url: `/?component=${CARD}&scenario=toned&props=${linked}` });
      expect(driver.props()).toEqual({ elevated: true, children: 'unused', tone: 'primary' });
      await driver.frameReady('react');
      expect(driver.messages('react')[0]).toEqual(setStory(CARD, { elevated: true, children: 'unused', tone: 'primary' }));
    });

    it('opens a view by its deep link', async () => {
      await driver.stop();
      await driver.start({ url: '/?view=gallery' });
      expect(driver.frames()).toEqual(['view']);
    });
  });

  describe('host - custom views', () => {
    it('shows a view in the single view pane, posting nothing on selection', async () => {
      await driver.selectView('gallery');
      expect(driver.frames()).toEqual(['view']);
      expect(driver.frameSource('view')).toBe(
        '/preview/view/view.html?view=gallery'
      );
      expect(driver.allMessages()).toEqual([]);

      await driver.setOption('theme', 'dark');
      expect(driver.allMessages()).toEqual([
        {
          target: 'view',
          message: globals({ ...DEFAULT_OPTIONS, theme: 'dark' }),
        },
      ]);
    });

    it("answers the view's handshake like a pane's, the story naming the view", async () => {
      await driver.selectView('gallery');
      await driver.frameReady('view');
      expect(driver.messages('view')).toEqual([
        // The view ignores the story message; it carries the view's id and the
        // last story's props.
        setStory('gallery', { variant: 'solid', children: 'Click' }),
        globals(DEFAULT_OPTIONS),
        CATALOG,
      ]);
    });

    it("selects a component on the view's preview:select, the panes picking it up on their handshake", async () => {
      await driver.selectView('gallery');
      await driver.sendFromView({ type: 'preview:select', id: CARD });
      expect(driver.frames()).toEqual(['react', 'vue', 'svelte']);
      // The panes mount after the selection is posted, so only the view, still
      // mounted at that moment, receives it.
      expect(driver.allMessages()).toEqual([
        {
          target: 'view',
          message: setStory(CARD, { elevated: true, children: 'unused' }),
        },
        {
          target: 'view',
          message: globals({
            theme: 'light',
            mode: false,
            box: true,
            padded: true,
          }),
        },
      ]);
      driver.clearMessages();
      await driver.frameReady('react');
      expect(driver.messages('react')).toEqual([
        setStory(CARD, { elevated: true, children: 'unused' }),
        globals({ theme: 'light', mode: false, box: true, padded: true }),
        CATALOG,
      ]);
    });

    it('deep-links with props: they land over the defaults, skipping the default-flagged scenario', async () => {
      await driver.selectView('gallery');
      await driver.sendFromView({
        type: 'preview:select',
        id: CARD,
        props: { tone: 'primary' },
      });
      await driver.frameReady('react');
      expect(driver.messages('react')).toContainEqual(
        setStory(CARD, { elevated: false, children: 'unused', tone: 'primary' })
      );
    });

    it('treats props that are not an object as none', async () => {
      await driver.selectView('gallery');
      await driver.sendFromView({
        type: 'preview:select',
        id: CARD,
        props: ['tone'],
      });
      await driver.frameReady('react');
      expect(driver.messages('react')).toContainEqual(
        setStory(CARD, { elevated: true, children: 'unused' })
      );
    });

    it('ignores an unknown id, a component that is not standalone, and a malformed message', async () => {
      await driver.selectView('gallery');
      await driver.sendFromView({
        type: 'preview:select',
        id: 'components-missing',
      });
      await driver.sendFromView({ type: 'preview:select', id: PARTIAL_TAB });
      await driver.sendFromView({ type: 'preview:select', id: 7 });
      await driver.sendFromView({ type: 'preview:select' });
      expect(driver.frames()).toEqual(['view']);
      expect(driver.allMessages()).toEqual([]);
    });

    it('ignores preview:select from a window that is not the view pane', async () => {
      // With no view pane mounted, the message comes from nowhere the preview knows.
      await driver.sendFromView({ type: 'preview:select', id: CARD });
      expect(driver.frames()).toEqual(['react', 'vue', 'svelte']);
      expect(driver.allMessages()).toEqual([]);
      expect(driver.editorVisible()).toBe(false);
    });
  });
});
