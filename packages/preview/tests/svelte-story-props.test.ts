// @vitest-environment happy-dom
// The Svelte pane's story props (application/preview/svelte/story-props.ts)
// mounted through a generated story wrapper with the real Svelte 5 compiler,
// in both of the kit's Svelte modes. A component's own two-way value, a
// bindable the story leaves out, survives a change to another prop, as it
// does under a parent that leaves the prop out; a prop the story gives still
// reaches the component.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { compile, compileModule } from 'svelte/compiler';
import { afterAll, describe, expect, it } from 'vitest';

import {
  paneProps,
  setStoryProps,
  storyProps,
  type GivenProps,
} from '../application/preview/svelte/story-props';
import { cleanRecord } from '../src/controller/editor-tree';
import { emitSvelteWrapper } from '../src/emit/svelte';
import type { ResolvedStory } from '../src/lib/types';

// Svelte's client entry, by its file: Node resolves `svelte` to the server's.
const svelteRoot = dirname(
  createRequire(import.meta.url).resolve('svelte/package.json')
);
const { flushSync, mount, unmount } = (await import(
  pathToFileURL(join(svelteRoot, 'src/index-client.js')).href
)) as typeof import('svelte');

const temporaryDirectory = mkdtempSync(
  join(dirname(fileURLToPath(import.meta.url)), '.svelte-story-props-')
);
afterAll(() => rmSync(temporaryDirectory, { recursive: true, force: true }));

// A chip group in the shape the engine generates in each Svelte mode: a
// two-way `selected` whose own value starts from `defaultSelected`, and a
// `label` the story changes.
const COMPONENTS = {
  legacy:
    `<script>\n` +
    `  export let selected = undefined;\n` +
    `  export let defaultSelected = [];\n` +
    `  export let label = '';\n` +
    `  $: selectedKeys = selected !== undefined ? selected : defaultSelected;\n` +
    `  function setSelected(value) { selected = value; }\n` +
    `</script>\n\n` +
    `<button class="pick" on:click={() => setSelected([...selectedKeys, 'chip'])}>{label}</button>\n` +
    `<span class="count">{selectedKeys.length}</span>\n`,
  runes:
    `<script>\n` +
    `  let { selected = $bindable(), defaultSelected = [], label = '' } = $props();\n` +
    `  const selectedKeys = $derived(selected !== undefined ? selected : defaultSelected);\n` +
    `  function setSelected(value) { selected = value; }\n` +
    `</script>\n\n` +
    `<button class="pick" onclick={() => setSelected([...selectedKeys, 'chip'])}>{label}</button>\n` +
    `<span class="count">{selectedKeys.length}</span>\n`,
} as const;

function model(over: Partial<ResolvedStory> = {}): ResolvedStory {
  return {
    name: 'ChipGroup',
    title: 'Components/ChipGroup',
    omit: false,
    standalone: true,
    unlisted: false,
    propTypes: [],
    defaultProps: {},
    scenarios: [],
    slotComponents: [],
    contentSlots: { default: false, named: [] },
    targets: ['react', 'vue', 'svelte'],
    ...over,
  };
}

function writeClient(
  source: string,
  fileName: string,
  moduleName: string,
  runes: boolean
): string {
  const compiled = compile(source, {
    generate: 'client',
    runes,
    filename: fileName,
  });
  const modulePath = join(temporaryDirectory, `${moduleName}.js`);
  writeFileSync(modulePath, compiled.js.code);
  return modulePath;
}

/** A `$state` record, made where runes compile: in a module of its own. */
async function givenRecord(): Promise<GivenProps> {
  const modulePath = join(temporaryDirectory, 'given.js');
  writeFileSync(
    modulePath,
    compileModule(
      'export function createGiven() {\n  const given = $state({});\n  return given;\n}\n',
      {
        generate: 'client',
        filename: 'given.svelte.js',
      }
    ).js.code
  );
  const { createGiven } = await import(pathToFileURL(modulePath).href);
  return createGiven();
}

async function mountStory(
  mode: keyof typeof COMPONENTS,
  storyModel: ResolvedStory,
  initial: Record<string, unknown>,
  source: string = COMPONENTS[mode]
) {
  const name = `${mode}-${Object.keys(initial).join('-') || 'none'}-${storyModel.defaultProps.children === undefined ? 'plain' : 'text'}${source === COMPONENTS[mode] ? '' : '-own'}`;
  writeClient(
    source,
    'ChipGroup.svelte',
    `chip-group-${name}`,
    mode === 'runes'
  );
  writeFileSync(
    join(temporaryDirectory, `barrel-${name}.js`),
    `export { default as ChipGroup } from './chip-group-${name}.js';\n`
  );
  const wrapper = emitSvelteWrapper(storyModel, () => `./barrel-${name}.js`);
  const wrapperPath = writeClient(
    wrapper.source,
    wrapper.fileName,
    `wrapper-${name}`,
    true
  );
  const { default: Wrapper } = await import(pathToFileURL(wrapperPath).href);
  const given = await givenRecord();
  setStoryProps(given, initial);
  const target = document.createElement('div');
  document.body.append(target);
  const instance = mount(Wrapper, {
    target,
    props: { props: storyProps(given) },
  });
  flushSync();
  return {
    given,
    target,
    count: () => target.querySelector('.count')?.textContent,
    label: () => target.querySelector('.pick')?.textContent,
    pick: () => {
      target.querySelector<HTMLButtonElement>('.pick')!.click();
      flushSync();
    },
    set: (next: Record<string, unknown>) => {
      setStoryProps(given, next);
      flushSync();
    },
    destroy: () => unmount(instance),
  };
}

describe.each(['legacy', 'runes'] as const)(
  'the Svelte pane in %s mode',
  (mode) => {
    it("keeps a component's own two-way value when the story changes another prop", async () => {
      const story = await mountStory(mode, model(), { label: 'One' });
      story.pick();
      expect(story.count()).toBe('1');
      story.set({ label: 'Two' });
      expect(story.label()).toBe('Two');
      expect(story.count()).toBe('1');
      story.destroy();
    });

    it('keeps it beside a story whose text prop renders as the child', async () => {
      const story = await mountStory(
        mode,
        model({ defaultProps: { children: 'Hi' } }),
        {
          label: 'One',
          children: 'Hi',
        }
      );
      story.pick();
      story.set({ label: 'Two', children: 'Hello' });
      expect(story.count()).toBe('1');
      story.destroy();
    });

    it('keeps it when the story gives an array again with the same content, as each host message does', async () => {
    const story = await mountStory(mode, model(), { label: 'One', defaultSelected: [] });
    story.pick();
    story.set({ label: 'Two', defaultSelected: [] });
    expect(story.count()).toBe('1');
    story.destroy();
  });

  it("keeps a given array the component assigned while the story gives the same content again", async () => {
    const story = await mountStory(mode, model(), { label: 'One', selected: ['a'] });
    story.pick();
    expect(story.count()).toBe('2');
    story.set({ label: 'Two', selected: ['a'] });
    expect(story.count()).toBe('2');
    story.set({ label: 'Two', selected: ['a', 'b', 'c'] });
    expect(story.count()).toBe('3');
    story.destroy();
  });

  it('gives the component a two-way prop the story gives, and its change', async () => {
      const story = await mountStory(mode, model(), {
        label: 'One',
        selected: ['a', 'b'],
      });
      expect(story.count()).toBe('2');
      story.set({ label: 'One', selected: ['a'] });
      expect(story.count()).toBe('1');
      story.destroy();
    });
  }
);

// A combobox in the engine's legacy Svelte shape: a two-way `query` whose
// own value starts from `defaultQuery`, declared `''`, and read as a string.
// Legacy Svelte applies a declared default once, at mount: a later update
// that sets the prop to `undefined` leaves it `undefined`.
const LEGACY_COMBOBOX =
  `<script>\n` +
  `  export let query = undefined;\n` +
  `  export let defaultQuery = '';\n` +
  `  export let label = '';\n` +
  `  $: currentQuery = query !== undefined ? query : defaultQuery;\n` +
  `</script>\n\n` +
  `<button class="pick">{label}</button>\n` +
  `<span class="count">{currentQuery.trim().length}</span>\n`;

describe("the Svelte pane's empty strings", () => {
  it("keeps a legacy component's declared '' default through an update the host sends", async () => {
    // The story mounts with the story's props as they are, then each update
    // gives the props as the host cleans them for every message.
    const story = await mountStory(
      'legacy',
      model(),
      { label: 'Country', defaultQuery: '' },
      LEGACY_COMBOBOX
    );
    expect(story.count()).toBe('0');
    story.set(cleanRecord({ label: 'Land', defaultQuery: '' }));
    expect(story.label()).toBe('Land');
    expect(story.count()).toBe('0');
    story.destroy();
  });

  it("gives a legacy component a two-way '' the story sets, not its default", async () => {
    const story = await mountStory(
      'legacy',
      model(),
      cleanRecord({ label: 'Country', query: 'fin', defaultQuery: 'seed' }),
      LEGACY_COMBOBOX
    );
    expect(story.count()).toBe('3');
    story.set(cleanRecord({ label: 'Country', query: '', defaultQuery: 'seed' }));
    expect(story.count()).toBe('0');
    story.destroy();
  });
});

describe("the Svelte pane's controlled two-way props", () => {
  const settings = {
    events: ['onSelectedChange'],
    bindings: [{ prop: 'selected', changeProp: 'onSelectedChange' }],
    mount: 7,
  };

  async function pane() {
    const given = await givenRecord();
    const reports: Record<string, unknown>[] = [];
    const target = {
      parent: { postMessage: (message: Record<string, unknown>) => reports.push(message) },
    } as unknown as Window;
    const story = paneProps(given, target);
    const props = storyProps(given);
    const change = (value: string[]) =>
      (props.onSelectedChange as (value: string[]) => void)(value);
    return { given, reports, story, change };
  }

  it('takes the new value in the event, and reports it under the story\'s mount', async () => {
    const { given, reports, story, change } = await pane();
    story.setStory({ selected: ['a'] }, settings);
    change(['a', 'b']);
    expect(given.selected.value).toEqual(['a', 'b']);
    expect(reports).toEqual([expect.objectContaining({ name: 'onSelectedChange', value: ['a', 'b'], mount: 7 })]);
  });

  it("keeps its newest value over props the host sent before it took that write, then takes the host's", async () => {
    const { given, reports, story, change } = await pane();
    story.setStory({ selected: ['a'] }, settings);
    change(['a', 'b']);
    change(['a', 'b', 'c']);
    expect(reports.map((report) => report.write)).toEqual([1, 2]);
    // Another control's change, sent before the host took either write.
    story.setProps({ selected: ['a'], label: 'Tags' }, 0);
    expect(given.selected.value).toEqual(['a', 'b', 'c']);
    // The late echo of the first write.
    story.setProps({ selected: ['a', 'b'] }, 1);
    expect(given.selected.value).toEqual(['a', 'b', 'c']);
    story.setProps({ selected: ['a', 'b', 'c'] }, 2);
    expect(given.selected.value).toEqual(['a', 'b', 'c']);
    story.setProps({ selected: ['from a control'] }, 2);
    expect(given.selected.value).toEqual(['from a control']);
  });

  it("forgets the last story's writes when the host sets a story", async () => {
    const { given, story, change } = await pane();
    story.setStory({ selected: ['a'] }, settings);
    change(['a', 'b']);
    change(['a', 'b', 'c']);
    story.setStory({ selected: ['a'] }, settings);
    story.setProps({ selected: ['a', 'b'] }, 0);
    expect(given.selected.value).toEqual(['a', 'b']);
  });

  it('leaves a two-way prop the story leaves out to the component', async () => {
    const { given, story, change } = await pane();
    story.setStory({}, settings);
    change(['a']);
    expect('selected' in given).toBe(false);
  });
});
