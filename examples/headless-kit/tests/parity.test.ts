import { beforeAll, describe, expect, it } from 'vitest';
import { createRenderer, slot } from '@scaffold-ui-kit/testing/render';
import { canonicalNodes } from '@scaffold-ui-kit/testing/parity';

const renderer = createRenderer({
  react: async (name) => (await import(`../dist/react/${name}.tsx`))[name],
  vue: async (name) => (await import(`../dist/vue/${name}.vue`)).default,
  svelte: async (name) =>
    (await import(`../dist/svelte/${name}.svelte`)).default,
});

const CASES: Array<[string, string, Record<string, unknown>]> = [
  ['Toggle', 'off', { 'aria-label': 'Bold', children: slot('B') }],
  [
    'Toggle',
    'on',
    { 'aria-label': 'Bold', pressed: true, children: slot('B') },
  ],
  [
    'Toggle',
    'disabled',
    { 'aria-label': 'Bold', disabled: true, children: slot('B') },
  ],
  ['Switch', 'checked', { 'aria-label': 'Wi-Fi', checked: true, name: 'wifi' }],
  ['Checkbox', 'mixed', { 'aria-label': 'All', checked: 'indeterminate' }],
  [
    'RadioGroup',
    'selected',
    {
      'aria-label': 'Size',
      value: 'm',
      options: [
        { value: 's', label: 'S' },
        { value: 'm', label: 'M' },
        { value: 'l', label: 'L', disabled: true },
      ],
    },
  ],
  ['Tooltip', 'open', { defaultOpen: true, children: slot('tip') }],
  ['Collapsible', 'open', { defaultOpen: true, children: slot('body') }],
  [
    'Modal',
    'closed',
    {
      title: 'T',
      description: 'D',
      trigger: slot('Open'),
      children: slot('Body'),
    },
  ],
  [
    'Select',
    'labeled',
    {
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      label: 'Pick',
    },
  ],
];

const PARTS: Array<[string, string, Record<string, unknown>]> = [
  ['CollapsibleTrigger', 'Collapsible', { children: slot('toggle') }],
  ['CollapsibleContent', 'Collapsible', { children: slot('body') }],
  ['TooltipTrigger', 'Tooltip', { 'aria-label': 'Save', children: slot('S') }],
];

describe('every target renders the same markup', () => {
  beforeAll(
    () => renderer.load(...new Set(CASES.map(([name]) => name))),
    60_000
  );
  for (const [name, state, props] of CASES) {
    it(`${name} (${state})`, async () => {
      const { react, vue, svelte } = await renderer.renderAll(name, props);
      expect(canonicalNodes(vue!)).toEqual(canonicalNodes(react!));
      expect(canonicalNodes(svelte!)).toEqual(canonicalNodes(react!));
    });
  }
  for (const [name, host, props] of PARTS) {
    it(`${name} inside ${host}`, async () => {
      await renderer.load(name, host);
      const [react, vue, svelte] = await Promise.all(
        (['react', 'vue', 'svelte'] as const).map((target) =>
          renderer.render(target, name, props, { host: { name: host } })
        )
      );
      expect(canonicalNodes(vue!)).toEqual(canonicalNodes(react!));
      expect(canonicalNodes(svelte!)).toEqual(canonicalNodes(react!));
    });
  }
});
