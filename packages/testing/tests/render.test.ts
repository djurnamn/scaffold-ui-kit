import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { defineComponent, h, Teleport, type Slots } from 'vue';

import {
  createRenderer,
  renderReact,
  renderSvelte,
  renderVue,
  scopedSlot,
  slot,
  type RenderProps,
  type ScopedSlotFill,
  type SlotFill,
  type Target,
} from '../src/render/index.js';
import { renderComponent } from '../src/render/renderer.js';
import { partitionProps } from '../src/render/slots.js';
import { svelteComponent } from './support/svelte.js';

/** The record each test component hands its `trigger` scope. */
const triggerRecord = { 'aria-expanded': 'false', id: 'trigger' };

function ReactCard(props: {
  title?: string;
  children?: ReactNode;
  icon?: ReactNode;
  trigger?: (scope: { triggerProps: Record<string, string> }) => ReactNode;
}) {
  return createElement(
    'section',
    { className: 'Card', 'data-title': props.title },
    props.icon,
    props.trigger?.({ triggerProps: triggerRecord }),
    props.children
  );
}

const VueCard = defineComponent({
  props: { title: String },
  setup(props, { slots }: { slots: Slots }) {
    return () =>
      h('section', { class: 'Card', 'data-title': props.title }, [
        slots.icon?.(),
        slots.trigger?.({ triggerProps: triggerRecord }),
        slots.default?.(),
      ]);
  },
});

const svelteCardSource = `<script>
  let { title, children, icon, trigger } = $props();
</script>
<section class="Card" data-title={title}>{@render icon?.()}{@render trigger?.({ triggerProps: { 'aria-expanded': 'false', id: 'trigger' } })}{@render children?.()}</section>`;

const svelteLegacyCardSource = `<script>
  export let title = undefined;
</script>
<section class="Card" data-title={title}><slot name="icon" /><slot name="trigger" triggerProps={{ 'aria-expanded': 'false', id: 'trigger' }} /><slot /></section>`;

const expected =
  '<section class="Card" data-title="Hi"><em class="SlotFill">I</em><button aria-expanded="false" id="trigger" class="SlotFill">Open</button><em class="SlotFill">Body</em></section>';

const props = {
  title: 'Hi',
  icon: slot('I'),
  trigger: scopedSlot('triggerProps', 'Open'),
  children: slot('Body'),
};

/** Markup without Svelte's hydration comments. */
function withoutComments(markup: string): string {
  return markup.replace(/<!--[\s\S]*?-->/g, '');
}

describe('slot fills render the same element in every target', () => {
  it('in React', async () => {
    expect(await renderReact(ReactCard, props)).toBe(expected);
  });

  it('in Vue, the children prop as the default slot', async () => {
    expect(withoutComments(await renderVue(VueCard, props))).toBe(expected);
  });

  it('in Svelte, as snippets', async () => {
    const card = await svelteComponent('Card', svelteCardSource);
    expect(withoutComments(await renderSvelte(card, props))).toBe(expected);
  });

  it('in Svelte, as the slots of a legacy component', async () => {
    const card = await svelteComponent('LegacyCard', svelteLegacyCardSource);
    expect(withoutComments(await renderSvelte(card, props))).toBe(expected);
  });

  it('escapes a slot fill text in a raw snippet', async () => {
    const card = await svelteComponent('Card', svelteCardSource);
    expect(
      withoutComments(await renderSvelte(card, { children: slot('a < b') }))
    ).toBe(
      '<section class="Card"><em class="SlotFill">a &lt; b</em></section>'
    );
  });
});

/** A component in each target that hands its `trigger` slot the `scope` prop. */
function ReactScoped(props: {
  scope?: unknown;
  trigger: (scope: unknown) => ReactNode;
}) {
  return createElement('div', null, props.trigger(props.scope));
}

const VueScoped = defineComponent({
  props: { scope: { type: null, default: undefined } },
  setup(props, { slots }: { slots: Slots }) {
    return () => h('div', slots.trigger?.(props.scope as never));
  },
});

const svelteScopedSource = `<script>
  let { scope, trigger } = $props();
</script>
<div>{@render trigger(scope)}</div>`;

/** The same legacy component's scope, written as its slot's attributes. */
const svelteLegacyScopedSource = `<script>
  export let column = undefined;
  export let value = undefined;
</script>
<div><slot name="trigger" {column} {value} /></div>`;

const scopedTargets: [string, (props: RenderProps) => Promise<string>][] = [
  ['React', (given) => renderReact(ReactScoped, given)],
  ['Vue', (given) => renderVue(VueScoped, given)],
  [
    'Svelte',
    async (given) =>
      renderSvelte(await svelteComponent('Scoped', svelteScopedSource), given),
  ],
];

describe.each(scopedTargets)('a scoped fill in %s', (_name, render) => {
  const scope = { triggerProps: { id: 'a' }, value: 'Ada', items: ['x'] };

  it('spreads the record under its binding', async () => {
    expect(
      withoutComments(
        await render({ scope, trigger: scopedSlot('triggerProps', 'Go') })
      )
    ).toBe('<div><button id="a" class="SlotFill">Go</button></div>');
  });

  it('throws on a binding the scope lacks, listing the keys', async () => {
    await expect(
      render({ scope, trigger: scopedSlot('nope', 'Go') })
    ).rejects.toThrow(
      "scopedSlot('nope') names a binding the slot's scope does not have. The scope's keys are triggerProps, value, items."
    );
  });

  it('throws on a primitive rather than spreading its characters', async () => {
    await expect(
      render({ scope, trigger: scopedSlot('value', 'Go') })
    ).rejects.toThrow(
      "scopedSlot('value') spreads a record onto its button, and the scope's value is a string. The scope's keys are triggerProps, value, items."
    );
  });

  it('throws on an array', async () => {
    await expect(
      render({ scope, trigger: scopedSlot('items', 'Go') })
    ).rejects.toThrow("the scope's items is an array");
  });

  it('throws on a null value', async () => {
    await expect(
      render({
        scope: { triggerProps: null },
        trigger: scopedSlot('triggerProps', 'Go'),
      })
    ).rejects.toThrow("the scope's triggerProps is null");
  });

  it('throws when the slot is given no scope', async () => {
    await expect(
      render({ trigger: scopedSlot('triggerProps', 'Go') })
    ).rejects.toThrow('The scope has no keys.');
  });

  it('drops key and ref from the record', async () => {
    expect(
      withoutComments(
        await render({
          scope: { column: { key: 'name', ref: 'cell', label: 'Name' } },
          trigger: scopedSlot('column', 'Go'),
        })
      )
    ).toBe('<div><button label="Name" class="SlotFill">Go</button></div>');
  });
});

describe('the props type', () => {
  it('is exported as RenderProps, and not as Props', () => {
    const props: RenderProps = { title: 'Hi' };
    // @ts-expect-error The render entry has no type named `Props`.
    const unnamed: import('../src/render/index.js').Props = props;
    expect(unnamed).toBe(props);
  });
});

describe('what counts as a fill', () => {
  const lookalikes = {
    note: { slotFillText: 'Not a fill' },
    action: { scopedSlotBinding: 'triggerProps', scopedSlotText: 'Not a fill' },
  };

  it('keeps a look-alike record among the plain props', () => {
    expect(partitionProps(lookalikes)).toEqual({
      plain: lookalikes,
      slots: {},
      scopedSlots: {},
    });
  });

  it('takes what slot and scopedSlot make as fills', () => {
    const note = slot('Note');
    const action = scopedSlot('triggerProps', 'Open');
    expect(partitionProps({ note, action })).toEqual({
      plain: {},
      slots: { note },
      scopedSlots: { action },
    });
  });

  it('takes a spread copy of a fill as a fill', () => {
    const note = { ...slot('Note') };
    expect(partitionProps({ note })).toEqual({
      plain: {},
      slots: { note },
      scopedSlots: {},
    });
  });

  it('hands a look-alike record to a component as the prop it is', async () => {
    function Note(props: { note: { slotFillText: string } }) {
      return createElement('p', null, props.note.slotFillText);
    }
    expect(
      await renderReact(Note, { note: { slotFillText: 'Plain text' } })
    ).toBe('<p>Plain text</p>');
  });

  it('does not take a record typed by hand for a fill', () => {
    // @ts-expect-error A fill is made by `slot`.
    const handMade: SlotFill = { slotFillText: 'x' };
    // @ts-expect-error A fill is made by `scopedSlot`.
    const handMadeScoped: ScopedSlotFill = {
      scopedSlotBinding: 'triggerProps',
      scopedSlotText: 'x',
    };
    const made: [SlotFill, ScopedSlotFill] = [
      slot('x'),
      scopedSlot('triggerProps', 'x'),
    ];
    expect(partitionProps({ handMade, handMadeScoped }).plain).toEqual({
      handMade,
      handMadeScoped,
    });
    expect(made).toHaveLength(2);
  });
});

describe('a scoped fill in a legacy Svelte component', () => {
  const legacy = () =>
    svelteComponent('LegacyScoped', svelteLegacyScopedSource);

  it('drops key and ref from the record', async () => {
    expect(
      withoutComments(
        await renderSvelte(await legacy(), {
          column: { key: 'name', ref: 'cell', label: 'Name' },
          trigger: scopedSlot('column', 'Go'),
        })
      )
    ).toBe('<div><button label="Name" class="SlotFill">Go</button></div>');
  });

  it('throws on a binding the slot does not hand over', async () => {
    await expect(
      renderSvelte(await legacy(), { trigger: scopedSlot('nope', 'Go') })
    ).rejects.toThrow('names a binding');
  });

  it('throws on a primitive', async () => {
    await expect(
      renderSvelte(await legacy(), {
        value: 'Ada',
        trigger: scopedSlot('value', 'Go'),
      })
    ).rejects.toThrow("the scope's value is a string");
  });
});

describe('a host renders around a part', () => {
  it('in React', async () => {
    const Host = (hostProps: { label: string; children?: ReactNode }) =>
      createElement(
        'div',
        { 'aria-label': hostProps.label },
        hostProps.children
      );
    expect(
      await renderReact(
        ReactCard,
        { title: 'Hi' },
        {
          host: {
            component: Host,
            props: { label: 'List' },
          },
        }
      )
    ).toBe(
      '<div aria-label="List"><section class="Card" data-title="Hi"></section></div>'
    );
  });

  it('in Vue', async () => {
    const Host = defineComponent({
      props: { label: String },
      setup(hostProps, { slots }: { slots: Slots }) {
        return () =>
          h('div', { 'aria-label': hostProps.label }, slots.default?.());
      },
    });
    expect(
      withoutComments(
        await renderVue(
          VueCard,
          { title: 'Hi' },
          {
            host: {
              component: Host,
              props: { label: 'List' },
            },
          }
        )
      )
    ).toBe(
      '<div aria-label="List"><section class="Card" data-title="Hi"></section></div>'
    );
  });

  it('in Svelte, sharing the host context with the part', async () => {
    const host = await svelteComponent(
      'Host',
      `<script>
        import { setContext } from 'svelte';
        let { label, children } = $props();
        setContext('list', label);
      </script>
      <div aria-label={label}>{@render children?.()}</div>`
    );
    const part = await svelteComponent(
      'Part',
      `<script>
        import { getContext } from 'svelte';
        let { trigger } = $props();
        const list = getContext('list');
      </script>
      <span data-list={list}>{@render trigger?.({ triggerProps: { id: 'x' } })}</span>`
    );
    expect(
      withoutComments(
        await renderSvelte(
          part,
          { trigger: scopedSlot('triggerProps', 'Go') },
          { host: { component: host, props: { label: 'List' } } }
        )
      )
    ).toBe(
      '<div aria-label="List"><span data-list="List"><button id="x" class="SlotFill">Go</button></span></div>'
    );
  });
});

describe('a Svelte render through the host reads as a static composition', () => {
  const card = svelteComponent('AnchorCard', svelteCardSource);
  const host = svelteComponent(
    'AnchorHost',
    `<script>
      let { label, children } = $props();
    </script>
    <div aria-label={label}>{@render children?.()}</div>`
  );

  it('with a scoped fill, keeping the anchors of the component alone', async () => {
    await card;
    const composition = await svelteComponent(
      'AnchorComposition',
      `<script>
        import Card from './AnchorCard.js';
      </script>
      <Card title="Hi">{#snippet trigger({ triggerProps })}<button {...triggerProps} class="SlotFill">Open</button>{/snippet}</Card>`
    );
    expect(
      await renderSvelte(await card, {
        title: 'Hi',
        trigger: scopedSlot('triggerProps', 'Open'),
      })
    ).toBe(await renderSvelte(composition));
  });

  it('with a host, the part as its children', async () => {
    await Promise.all([card, host]);
    const composition = await svelteComponent(
      'HostedComposition',
      `<script>
        import Host from './AnchorHost.js';
        import Card from './AnchorCard.js';
      </script>
      <Host label="List"><Card title="Hi" /></Host>`
    );
    const rendered = await renderSvelte(
      await card,
      { title: 'Hi' },
      { host: { component: await host, props: { label: 'List' } } }
    );
    expect(rendered).toBe(await renderSvelte(composition));
  });
});

describe('a host takes slot fills in its own props', () => {
  const titled = (label: string) =>
    `<div><header><em class="SlotFill">${label}</em></header><section class="Card" data-title="Hi"></section></div>`;

  it('in React', async () => {
    const Host = (hostProps: { title?: ReactNode; children?: ReactNode }) =>
      createElement(
        'div',
        null,
        createElement('header', null, hostProps.title),
        hostProps.children
      );
    expect(
      await renderReact(
        ReactCard,
        { title: 'Hi' },
        {
          host: {
            component: Host,
            props: { title: slot('Heading') },
          },
        }
      )
    ).toBe(titled('Heading'));
  });

  it('in Vue', async () => {
    const Host = defineComponent({
      setup(_, { slots }: { slots: Slots }) {
        return () =>
          h('div', [h('header', slots.title?.()), slots.default?.()]);
      },
    });
    expect(
      withoutComments(
        await renderVue(
          VueCard,
          { title: 'Hi' },
          {
            host: {
              component: Host,
              props: { title: slot('Heading') },
            },
          }
        )
      )
    ).toBe(titled('Heading'));
  });

  it('in Svelte', async () => {
    const card = await svelteComponent('TitledCard', svelteCardSource);
    const host = await svelteComponent(
      'TitledHost',
      `<script>
        let { title, children } = $props();
      </script>
      <div><header>{@render title?.()}</header>{@render children?.()}</div>`
    );
    expect(
      withoutComments(
        await renderSvelte(
          card,
          { title: 'Hi' },
          {
            host: {
              component: host,
              props: { title: slot('Heading') },
            },
          }
        )
      )
    ).toBe(titled('Heading'));
  });

  it('in a legacy Svelte host, as its named slots', async () => {
    const card = await svelteComponent('TitledCard', svelteCardSource);
    const host = await svelteComponent(
      'LegacyTitledHost',
      `<div><header><slot name="title">Fallback</slot></header><slot /></div>`
    );
    expect(
      withoutComments(
        await renderSvelte(
          card,
          { title: 'Hi' },
          { host: { component: host, props: { title: slot('Heading') } } }
        )
      )
    ).toBe(titled('Heading'));
  });

  it('in a legacy Svelte host, as its scoped slots', async () => {
    const card = await svelteComponent('TitledCard', svelteCardSource);
    const host = await svelteComponent(
      'LegacyScopedHost',
      `<div><header><slot name="title" titleProps={{ id: 'heading' }}>Fallback</slot></header><slot /></div>`
    );
    expect(
      withoutComments(
        await renderSvelte(
          card,
          { title: 'Hi' },
          {
            host: {
              component: host,
              props: { title: scopedSlot('titleProps', 'Heading') },
            },
          }
        )
      )
    ).toBe(
      '<div><header><button id="heading" class="SlotFill">Heading</button></header><section class="Card" data-title="Hi"></section></div>'
    );
  });

  it("leaves a legacy Svelte host's unfilled slot to its fallback", async () => {
    const card = await svelteComponent('TitledCard', svelteCardSource);
    const host = await svelteComponent(
      'LegacyFallbackHost',
      `<div><header><slot name="title">Fallback</slot></header><slot /></div>`
    );
    expect(
      withoutComments(
        await renderSvelte(card, { title: 'Hi' }, { host: { component: host } })
      )
    ).toBe(
      '<div><header>Fallback</header><section class="Card" data-title="Hi"></section></div>'
    );
  });

  it("refuses the host's own children", async () => {
    await expect(
      renderReact(
        ReactCard,
        {},
        {
          host: {
            component: ReactCard,
            props: { children: slot('x') },
          },
        }
      )
    ).rejects.toThrow("A host's children are the part");
  });
});

describe('Vue teleports', () => {
  it('are appended after the markup, ordered by target', async () => {
    const Overlay = defineComponent({
      setup() {
        return () => [
          h('span', 'anchor'),
          h(Teleport, { to: '#z' }, [h('p', 'second')]),
          h(Teleport, { to: '#a' }, [h('p', 'first')]),
        ];
      },
    });
    const markup = withoutComments(await renderVue(Overlay));
    expect(markup).toBe('<span>anchor</span><p>first</p><p>second</p>');
  });
});

describe('html is not a render target', () => {
  const html = 'html' as Target;
  const message =
    'html is not a render target. The targets are react, vue, svelte; storySource from @scaffold-ui-kit/preview renders the html.';

  it('rejects from render, with no html loader in play', async () => {
    const renderer = createRenderer({ react: async () => ReactCard });
    await expect(renderer.render(html, 'Card')).rejects.toThrow(message);
  });

  it('rejects from renderComponent rather than resolving undefined', async () => {
    await expect(renderComponent(html, ReactCard)).rejects.toThrow(message);
  });

  it('throws on an html loader rather than leaving it out of renderAll', () => {
    expect(() =>
      createRenderer({
        html: async () => '<div></div>',
      } as unknown as Parameters<typeof createRenderer>[0])
    ).toThrow(message);
  });

  it('names another unknown target without the html advice', async () => {
    await expect(renderComponent('solid' as Target, ReactCard)).rejects.toThrow(
      'solid is not a render target. The targets are react, vue, svelte.'
    );
  });
});

describe('createRenderer', () => {
  const svelteCard = svelteComponent('Card', svelteCardSource);
  const calls: string[] = [];
  const renderer = createRenderer({
    react: async (name) => {
      calls.push(`react:${name}`);
      return { Card: ReactCard }[name];
    },
    vue: async (name) => ({ Card: VueCard })[name],
    svelte: async (name) => (name === 'Card' ? svelteCard : undefined),
  });

  it('renders a component by name in every target', async () => {
    const rendered = await renderer.renderAll('Card', props);
    expect(Object.keys(rendered)).toEqual(['react', 'vue', 'svelte']);
    for (const markup of Object.values(rendered)) {
      expect(withoutComments(markup ?? '')).toBe(expected);
    }
  });

  it('loads each component once', async () => {
    await renderer.load('Card');
    await renderer.render('react', 'Card');
    expect(calls.filter((call) => call === 'react:Card')).toHaveLength(1);
  });

  it('renders a host by name around a part', async () => {
    const markup = await renderer.render(
      'react',
      'Card',
      { title: 'Inner' },
      { host: { name: 'Card', props: { title: 'Outer' } } }
    );
    expect(markup).toBe(
      '<section class="Card" data-title="Outer"><section class="Card" data-title="Inner"></section></section>'
    );
  });

  it('fails for a name its loader does not resolve', async () => {
    await expect(renderer.render('vue', 'Missing')).rejects.toThrow(
      'The vue loader resolved no component named Missing.'
    );
  });

  it('lists only the targets it has a loader for, and fails for the others', async () => {
    const reactOnly = createRenderer({ react: async () => ReactCard });
    expect(reactOnly.targets).toEqual(['react']);
    expect(Object.keys(await reactOnly.renderAll('Card'))).toEqual(['react']);
    await expect(reactOnly.render('svelte', 'Card')).rejects.toThrow(
      'No loader was given for the svelte target.'
    );
  });
});
