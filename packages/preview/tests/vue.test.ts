// The Vue registry's templates, as Vue compiles and renders them: a nested
// fill's string prop holding an apostrophe, which the single-quoted bound
// attribute must not end at, and text fills holding what a template would
// read as a tag, a character reference or an interpolation, which render as
// the text the story gives, also where two text fills meet.

import { describe, expect, it } from 'vitest';
import { createSSRApp, defineComponent, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { emitVueRegistry } from '../src/emit/vue';
import type { ResolvedStory, SlotFill } from '../src/lib/types';

const kit = (_name: string, target: string) => `kit/${target}`;

function model(over: Partial<ResolvedStory>): ResolvedStory {
  return {
    name: 'Card',
    title: 'Card',
    omit: false,
    standalone: true,
    unlisted: false,
    propTypes: [],
    defaultProps: {},
    scenarios: [],
    slotComponents: ['Button'],
    contentSlots: { default: true, named: [] },
    targets: ['react', 'vue', 'svelte'],
    ...over,
  };
}

/** The story's template, read out of the emitted registry module. */
function templateOf(registry: string): string {
  const match = /template: ("(?:[^"\\]|\\.)*") \}/.exec(registry);
  if (!match) throw new Error(`no template in ${registry}`);
  return JSON.parse(match[1]) as string;
}

// Stand-ins for the kit's components: Card renders its default slot, Button
// prints its props so the rendered page shows what the template bound.
const Card = defineComponent({
  setup(_props, { slots }) {
    return () => h('section', slots.default?.());
  },
});
const Button = defineComponent({
  props: ['label', 'items'],
  setup(props) {
    return () =>
      h('button', JSON.stringify({ label: props.label, items: props.items }));
  },
});

async function rendered(story: ResolvedStory): Promise<string> {
  const template = templateOf(emitVueRegistry([story], kit));
  const app = createSSRApp({
    components: { Card, Button },
    data: () => ({ props: {} }),
    template,
  });
  return renderToString(app);
}

describe('emitVueRegistry - what Vue compiles and renders', () => {
  it("binds a nested fill's string prop holding an apostrophe, and one inside an array", async () => {
    const fill: SlotFill = {
      kind: 'element',
      component: 'Button',
      props: { label: "Don't", items: [{ label: "it's <b> & more" }] },
    };
    const registry = emitVueRegistry([model({ slots: { default: fill } })], kit);
    expect(templateOf(registry)).toContain(
      `<Button :label='"Don&#39;t"' :items='[{ "label": "it&#39;s <b> &amp; more" }]'>`
    );
    const html = await rendered(model({ slots: { default: fill } }));
    expect(html).toContain(
      '{&quot;label&quot;:&quot;Don&#39;t&quot;,&quot;items&quot;:[{&quot;label&quot;:&quot;it&#39;s &lt;b&gt; &amp; more&quot;}]}'
    );
  });

  it('renders a text fill as text: a tag, a character reference and an interpolation in it', async () => {
    const text: SlotFill = {
      kind: 'fragment',
      children: [
        { kind: 'text', value: 'Use <Tab> to move; ' },
        { kind: 'text', value: 'Tom &amp; Jerry; ' },
        { kind: 'text', value: 'Type {{ name }} here' },
      ],
    };
    const registry = emitVueRegistry([model({ slots: { default: text } })], kit);
    expect(templateOf(registry)).toBe(
      '<Card v-bind="props">Use &lt;Tab> to move; Tom &amp;amp; Jerry; Type {{ "{{" }} name }} here</Card>'
    );
    const html = await rendered(model({ slots: { default: text } }));
    expect(html).toBe(
      '<section>Use &lt;Tab&gt; to move; Tom &amp;amp; Jerry; Type {{ name }} here</section>'
    );
  });
  it('keeps two text fills that end and start with a brace as text where they meet', async () => {
    const text: SlotFill = {
      kind: 'fragment',
      children: [
        { kind: 'text', value: 'Price: {' },
        { kind: 'text', value: '{ amount }} each' },
      ],
    };
    const registry = emitVueRegistry([model({ slots: { default: text } })], kit);
    expect(templateOf(registry)).toBe(
      `<Card v-bind="props">Price: {{ '{' }}{ amount }} each</Card>`
    );
    const html = await rendered(model({ slots: { default: text } }));
    expect(html).toBe('<section>Price: {{ amount }} each</section>');
  });
});
