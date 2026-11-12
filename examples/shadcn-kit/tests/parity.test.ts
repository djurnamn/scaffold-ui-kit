import { beforeAll, describe, expect, it } from 'vitest';
import { createRenderer, slot } from '@scaffold-ui-kit/testing/render';
import {
  canonicalNodes,
  GENERATED_IDENTIFIER,
  rootAttributes,
} from '@scaffold-ui-kit/testing/parity';

const renderer = createRenderer({
  react: async (name) => (await import(`../dist/react/${name}.tsx`))[name],
  vue: async (name) => (await import(`../dist/vue/${name}.vue`)).default,
  svelte: async (name) =>
    (await import(`../dist/svelte/${name}.svelte`)).default,
});

// Svelte's legacy mode numbers its generated ids from a counter, which the
// comparison reads as written, so each id, with an item's index after it,
// becomes the token React's and Vue's generated ids compare as.
const svelteNodes = (markup: string) =>
  canonicalNodes(
    markup.replace(
      /\b(tabs|dialog|accordion)-\d+(?:-\d+)*\b/g,
      `$1-${GENERATED_IDENTIFIER}`
    )
  );

beforeAll(
  () =>
    renderer.load(
      'Button',
      'Badge',
      'Card',
      'Alert',
      'Switch',
      'Accordion',
      'Tabs',
      'TabsTrigger'
    ),
  60_000
);

const cases: Array<[string, Record<string, unknown>]> = [
  ['Button', { children: slot('Save') }],
  ['Button', { as: 'a', href: '#', variant: 'link', children: slot('Docs') }],
  ['Badge', { variant: 'secondary', children: slot('New') }],
  ['Alert', { variant: 'destructive', title: slot('Heads up'), children: slot('Body') }],
  ['Card', { title: 'Title', action: slot('Act'), footer: slot('Foot'), children: slot('Body') }],
  ['Switch', { defaultChecked: true, 'aria-label': 'Wifi' }],
  [
    'Accordion',
    {
      type: 'single',
      defaultValue: ['a'],
      items: [
        { value: 'a', title: 'A', content: 'a' },
        { value: 'b', title: 'B', content: 'b', disabled: true },
      ],
    },
  ],
];

describe('every target renders the same markup', () => {
  it.each(cases)('%s %j', async (name, props) => {
    const { react, vue, svelte } = await renderer.renderAll(name, props);
    expect(canonicalNodes(vue!)).toEqual(canonicalNodes(react!));
    expect(svelteNodes(svelte!)).toEqual(canonicalNodes(react!));
  });

  it('a compound part renders inside its root', async () => {
    const host = { host: { name: 'Tabs', props: { defaultValue: 'a' } } };
    const props = { value: 'a', children: slot('A') };
    const react = await renderer.render('react', 'TabsTrigger', props, host);
    const vue = await renderer.render('vue', 'TabsTrigger', props, host);
    const svelte = await renderer.render('svelte', 'TabsTrigger', props, host);
    expect(canonicalNodes(vue)).toEqual(canonicalNodes(react));
    expect(svelteNodes(svelte)).toEqual(canonicalNodes(react));
  }, 20_000);
});

describe('a consumer class overrides the Tailwind it collides with', () => {
  it.each([
    ['Button', 'h-12', 'h-9'],
    ['Badge', 'rounded-full', 'rounded-md'],
    ['Tabs', 'gap-8', 'gap-2'],
  ])('%s', async (name, consumer, replaced) => {
    const props = { children: slot('x') };
    const roots = await Promise.all([
      renderer.render('react', name, { ...props, className: consumer }),
      renderer.render('vue', name, { ...props, class: consumer }),
      renderer.render('svelte', name, { ...props, class: consumer }),
    ]);
    for (const markup of roots) {
      const { classes } = rootAttributes(markup);
      expect(classes.has(consumer)).toBe(true);
      expect(classes.has(replaced)).toBe(false);
    }
  });
});
