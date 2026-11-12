// @vitest-environment happy-dom
// A scenario with slot content of its own: the model takes and checks its
// plan, each target's registry gets a story for it beside the component's,
// the manifest and catalog carry its content and its story's id, the
// controller mounts that story when the scenario is picked, and a story's
// printed source shows the scenario's content.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  catalogFromManifest,
  createPreviewController,
  type PreviewController,
} from '../src/controller';
import { printStorySource } from '../src/controller/source';
import { buildManifest } from '../src/emit/manifest';
import { emitReactRegistry } from '../src/emit/react';
import { emitSvelteRegistry, emitSvelteWrapper } from '../src/emit/svelte';
import { emitVueRegistry } from '../src/emit/vue';
import {
  scenarioSlotPlan,
  scenarioStories,
  storyOnScenario,
  storyRegistryId,
} from '../src/lib/scenario-story';
import { scenarioStoryId } from '../src/lib/naming';
import type { EnumeratedComponent, SlotFill, Story } from '../src/lib/types';
import { resolveStory } from '../src/model';
import { sourceStoryOf } from '../src/story-source';

const kit = (_name: string, target: string) => `kit/${target}`;
const text = (value: string): SlotFill => ({ kind: 'text', value });

function notice(over: Partial<EnumeratedComponent> = {}): EnumeratedComponent {
  return {
    name: 'Notice',
    file: 'Notice.ts',
    props: { tone: { type: "'calm' | 'loud'", default: 'calm' } },
    hasDefaultSlot: true,
    slotNames: ['action'],
    ...over,
  };
}

/** A story with content, one scenario with a body of its own, one with an
 *  action of its own, and one that sets a prop alone. */
const storyFile: Story = {
  generate: false,
  slots: {
    default: text('Saved.'),
    named: { action: { kind: 'element', component: 'Link' } },
  },
  scenarios: [
    {
      id: 'loud',
      props: { tone: 'loud' },
      slots: { default: text('Failed.') },
    },
    {
      id: 'with-button',
      slots: { named: { action: { kind: 'element', component: 'Button' } } },
    },
    { id: 'plain', props: { tone: 'loud' } },
  ],
};

const model = resolveStory(notice(), storyFile, {});

describe('scenarioSlotPlan', () => {
  it("lays a scenario's fills over the story's, slot by slot", () => {
    expect(
      scenarioSlotPlan(storyFile.slots, { default: text('Failed.') })
    ).toEqual({
      default: text('Failed.'),
      named: { action: { kind: 'element', component: 'Link' } },
    });
    expect(
      scenarioSlotPlan(storyFile.slots, {
        named: { action: { kind: 'element', component: 'Button' } },
      })
    ).toEqual({
      default: text('Saved.'),
      named: { action: { kind: 'element', component: 'Button' } },
    });
    expect(scenarioSlotPlan(storyFile.slots, undefined)).toBe(storyFile.slots);
    expect(scenarioSlotPlan(undefined, undefined)).toBeUndefined();
    expect(scenarioSlotPlan(undefined, {})).toEqual({});
  });
});

describe('resolveStory - a scenario with slots', () => {
  it("imports what a scenario's content names, with the story's", () => {
    expect(model.slotComponents.sort()).toEqual(['Button', 'Link']);
  });

  it("checks a scenario's plan as the story's, naming the scenario", () => {
    const bad = (slots: unknown): Story =>
      ({ scenarios: [{ id: 'odd', slots }] }) as unknown as Story;
    expect(() =>
      resolveStory(notice(), bad({ action: text('x') }), {})
    ).toThrow(
      'Notice: scenario \'odd\': unknown slot-plan key(s) action - named slots go under "named": { slots: { named: { ... } } }.'
    );
    expect(() => resolveStory(notice(), bad('Failed.'), {})).toThrow(
      "Notice: scenario 'odd': slots must be a slot plan, { default, named }"
    );
    expect(() =>
      resolveStory(
        notice(),
        bad({ default: { kind: 'html', tag: 'br', children: text('x') } }),
        {}
      )
    ).toThrow('Notice: the html fill <br> has children');
  });
});

describe('scenarioStories', () => {
  const stories = scenarioStories(model);

  it('gives a story for each scenario with content of its own, under its own id', () => {
    expect(stories.map((story) => story.scenarioStory)).toEqual([
      { id: 'components-notice--loud', renderName: 'Notice_scenario0' },
      { id: 'components-notice--with-button', renderName: 'Notice_scenario1' },
    ]);
    expect(stories.map(storyRegistryId)).toEqual([
      scenarioStoryId('components-notice', 'loud'),
      scenarioStoryId('components-notice', 'with-button'),
    ]);
    expect(storyRegistryId(model)).toBe('components-notice');
    expect(stories[0]!.slots).toEqual(
      scenarioSlotPlan(storyFile.slots, { default: text('Failed.') })
    );
    expect(storyOnScenario(model, model.scenarios[2])).toBe(model);
    expect(storyOnScenario(model, undefined)).toBe(model);
  });

  it("drops the preview's placeholder text where a scenario fills the default slot of a story with no content", () => {
    const bare = resolveStory(
      notice(),
      {
        generate: false,
        scenarios: [{ id: 'filled', slots: { default: text('Hi') } }],
      },
      {}
    );
    expect(bare.defaultProps.children).toBe('Notice');
    const [filled] = scenarioStories(bare);
    expect('children' in filled!.defaultProps).toBe(false);
    expect(filled!.slots).toEqual({ default: text('Hi') });
  });

  it("renders each as the component's story is rendered, in every target", () => {
    const all = [model, ...stories];
    const react = emitReactRegistry(all, kit);
    expect(react).toContain(
      '  "components-notice": (props) => (\n    <Notice {...props} action={<Link></Link>}>\n      {"Saved."}'
    );
    expect(react).toContain(
      '  "components-notice--loud": (props) => (\n    <Notice {...props} action={<Link></Link>}>\n      {"Failed."}'
    );
    expect(react).toContain(
      '  "components-notice--with-button": (props) => (\n    <Notice {...props} action={<Button></Button>}>\n      {"Saved."}'
    );
    const vue = emitVueRegistry(all, kit);
    expect(vue).toContain('"components-notice--loud": {');
    expect(vue).toMatch(/"components-notice--loud": \{[^\n]*Failed\./);
    expect(vue).toMatch(/"components-notice--with-button": \{[^\n]*<Button/);
    const wrappers = all.map((story) => emitSvelteWrapper(story, kit));
    expect(wrappers.map((wrapper) => wrapper.fileName)).toEqual([
      'Notice.render.svelte',
      'Notice_scenario0.render.svelte',
      'Notice_scenario1.render.svelte',
    ]);
    expect(wrappers[1]!.source).toContain('Failed.');
    expect(wrappers[0]!.source).not.toContain('Failed.');
    const svelte = emitSvelteRegistry(all);
    expect(svelte).toContain(
      "import Notice_scenario0_render from './Notice_scenario0.render.svelte';"
    );
    expect(svelte).toContain(
      '  "components-notice--loud": Notice_scenario0_render,'
    );
  });
});

describe("a scenario's content in the manifest, the catalog and the controller", () => {
  const manifest = buildManifest(
    [model],
    [{ id: 'core', label: 'Components', order: 0 }]
  );
  const catalog = catalogFromManifest(manifest);
  let controller: PreviewController;
  const posted: Array<Record<string, unknown>> = [];
  let frameWindow: Window;

  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
    posted.length = 0;
    controller = createPreviewController({ catalog, options: [] });
    const element = document.createElement('div');
    controller.frames.mount(element, 'react');
    const iframe = element.querySelector('iframe')!;
    Object.defineProperty(iframe, 'contentWindow', {
      value: {
        postMessage: (message: Record<string, unknown>) => posted.push(message),
      },
    });
    frameWindow = iframe.contentWindow!;
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'preview:ready' },
        source: frameWindow,
      })
    );
  });

  const stories = () =>
    posted
      .filter((message) => message.type === 'preview:set-story')
      .map((message) => message.id);

  it('lists the content and the story id of a scenario that has its own, and neither for one that sets props alone', () => {
    const [loud, withButton, plain] = manifest.components[0]!.scenarios;
    expect(loud).toMatchObject({
      id: 'loud',
      story: 'components-notice--loud',
      content: {
        default: text('Failed.'),
        named: { action: { kind: 'element', component: 'Link' } },
      },
    });
    expect(withButton!.story).toBe('components-notice--with-button');
    expect('content' in plain!).toBe(false);
    expect('story' in plain!).toBe(false);
    expect(
      catalog.components[0]!.scenarios.find(
        (scenario) => scenario.id === 'loud'
      )?.content?.default
    ).toEqual(text('Failed.'));
  });

  it("mounts the scenario's own story when it is picked, and the component's on any other", () => {
    expect(stories()).toEqual(['components-notice']);
    controller.actions.pickScenario('loud');
    expect(stories().at(-1)).toBe('components-notice--loud');
    expect(posted.at(-1)).toMatchObject({ props: { tone: 'loud' } });
    controller.actions.pickScenario('plain');
    expect(stories().at(-1)).toBe('components-notice');
    controller.actions.pickScenario('with-button');
    expect(stories().at(-1)).toBe('components-notice--with-button');
    controller.actions.pickScenario('');
    expect(stories().at(-1)).toBe('components-notice');
  });

  it("answers a pane that announces ready again with the picked scenario's story", () => {
    controller.actions.pickScenario('loud');
    posted.length = 0;
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'preview:ready' },
        source: frameWindow,
      })
    );
    expect(stories()).toEqual(['components-notice--loud']);
  });

  it("prints the scenario's content in its code, and the story's for the others", () => {
    const code = (scenario: string) =>
      String(
        printStorySource(catalog, { component: 'components-notice', scenario })
          .react
      );
    expect(code('loud')).toContain('Failed.');
    expect(code('loud')).not.toContain('Saved.');
    expect(code('loud')).toContain('tone="loud"');
    expect(code('plain')).toContain('Saved.');
    expect(code('with-button')).toContain('<Button');
    expect(code('with-button')).toContain('Saved.');
  });

  it("seeds the editor's tree from the picked scenario's content", () => {
    controller.actions.pickScenario('loud');
    controller.editor.open();
    const tree = controller.getState().editor.tree!;
    expect(JSON.stringify(tree.slots)).toContain('Failed.');
    expect(JSON.stringify(tree.slots)).not.toContain('Saved.');
  });

  it("leaves the preview's placeholder text out of the props of a scenario that fills the default slot", () => {
    const bare = resolveStory(
      notice(),
      {
        generate: false,
        scenarios: [{ id: 'filled', slots: { default: text('Hi') } }],
      },
      {}
    );
    const bareCatalog = catalogFromManifest(
      buildManifest([bare], [{ id: 'core', label: 'Components', order: 0 }])
    );
    const own = createPreviewController({ catalog: bareCatalog, options: [] });
    expect(own.getState().props.children).toBe('Notice');
    own.actions.pickScenario('filled');
    expect('children' in own.getState().props).toBe(false);
    own.dispose();
  });
});

describe("sourceStoryOf - a scenario's content", () => {
  it("prints the scenario's fills over the story's", () => {
    const loud = model.scenarios[0]!;
    const printed = sourceStoryOf(
      notice(),
      storyFile,
      storyOnScenario(model, loud),
      loud.props ?? {}
    );
    expect(printed.children).toEqual(text('Failed.'));
    expect(printed.named).toEqual({
      action: { kind: 'element', component: 'Link' },
    });
    expect(printed.props).toEqual({ tone: 'loud' });
  });
});
