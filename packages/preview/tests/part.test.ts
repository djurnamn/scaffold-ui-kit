// The `part` slot fill: content a story declares once, by name, and calls,
// whose body may call it again, so a tree renders to the depth of its data.
// Each registry declares it as its target would by hand - a function
// component in the story's React entry, a component among the story's Vue
// components, a snippet at the top of the Svelte wrapper - and the editor
// keeps a call as a locked node. The printed source and the html are
// story-source.test.ts's.

import { describe, expect, it } from 'vitest';
import { compileTemplate } from 'vue/compiler-sfc';
import { compile as compileSvelte } from 'svelte/compiler';
import { emitReactRegistry } from '../src/emit/react';
import { emitVueRegistry } from '../src/emit/vue';
import { emitSvelteWrapper } from '../src/emit/svelte';
import { collectParts, collectSlotComponents } from '../src/lib/slot-fill';
import { seedSlots, toPayload } from '../src/controller/editor-tree';
import type { ResolvedStory } from '../src/lib/types';
import { BRANCH } from './support/source-kit';

const kit = (_name: string, target: string) => `kit/${target}`;

const outline: ResolvedStory = {
  name: 'Outline',
  title: 'Components/Outline',
  omit: false,
  standalone: true,
  unlisted: false,
  propTypes: [],
  defaultProps: {},
  scenarios: [],
  slots: { default: BRANCH },
  slotComponents: ['Badge'],
  contentSlots: { default: true, named: [] },
  targets: ['react', 'vue', 'svelte'],
};

describe('a part in the registries', () => {
  it('React: a function component declared in the story entry, called with its props', () => {
    const registry = emitReactRegistry([outline], kit);
    expect(registry).toContain(
      `  "components-outline": (() => {
    function Branch({ items }: Record<string, any>) {
      return (${BRANCH.react});
    }
    return (props: Record<string, any>) => (
      <Outline {...props}>
        <Branch items={[{ "name": "docs", "children": [{ "name": "guides", "children": [] }] }, { "name": "src", "children": [] }]} />
      </Outline>
    );
  })(),`,
    );
  });

  it("Vue: a component among the story's, named so its template calls itself", () => {
    const registry = emitVueRegistry([outline], kit);
    expect(registry).toContain(
      `Branch: { name: "Branch", props: ["items"], components: { Outline: d.Outline, Badge: d.Badge }, setup: () => ({ Outline: d.Outline, Badge: d.Badge }), template: ${JSON.stringify(BRANCH.vue)} }`,
    );
    expect(registry).toContain(`<Outline v-bind=\\"props\\"><Branch :items='[`);
    expect(compileTemplate({ source: BRANCH.vue, filename: 'Branch.vue', id: 'branch' }).errors).toEqual([]);
  });

  it('Svelte: a snippet at the top of the wrapper, outside the component it fills', () => {
    const { source } = emitSvelteWrapper(outline, kit);
    expect(source).toContain(
      `{#snippet Branch({ items }: Record<string, any>)}${BRANCH.svelte}{/snippet}\n<Outline {...rest}>\n  {@render Branch({ "items": [`,
    );
    expect(() => compileSvelte(source, { filename: 'Outline.render.svelte', runes: true })).not.toThrow();
  });

  it('a story with no part keeps its plain entry', () => {
    const plain = { ...outline, slots: { default: { kind: 'text' as const, value: 'leaf' } } };
    expect(emitReactRegistry([plain], kit)).toContain('"components-outline": (props) => (');
    expect(emitSvelteWrapper(plain, kit).source).not.toContain('{#snippet');
  });
});

describe('collecting parts', () => {
  it("imports a part's components, or leaves them out where the part is declared apart", () => {
    const all = new Set<string>();
    collectSlotComponents(BRANCH, all);
    expect([...all]).toEqual(['Badge']);
    const outside = new Set<string>();
    collectSlotComponents(BRANCH, outside, false);
    expect([...outside]).toEqual([]);
  });

  it('declares a part called twice once, and refuses two declarations of one name', () => {
    const again = { ...BRANCH, props: { items: [] } };
    expect([...collectParts([{ kind: 'fragment', children: [BRANCH, again] }]).keys()]).toEqual(['Branch']);
    expect(() => collectParts([BRANCH, { ...BRANCH, react: '<ol />' }])).toThrow(
      'Two calls of the part Branch declare it differently; every call carries the same declaration.',
    );
  });
});

describe('a part in the editor', () => {
  it('is a locked node, saved back as it was authored', () => {
    const slots = seedSlots({ default: BRANCH }, {});
    expect(slots.default).toEqual([{ kind: 'opaque', fill: BRANCH }]);
    expect(toPayload({ root: 'Outline', props: {}, slots }).slots).toEqual({ default: BRANCH });
  });
});
