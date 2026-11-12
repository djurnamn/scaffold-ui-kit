// The preview check and what it reads: a manual component's props from its
// driver's interface, `fixed` props, generated scenarios, and the story file
// mistakes the check fails on. One small kit on disk drives the whole path.

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkPreview } from '../src/check';
import { loadPreviewContext } from '../src/context';
import { loadKit } from '../src/load';
import { parseType } from '../src/lib/parse-type';
import { resolveStory } from '../src/model';
import { readPropsFrom } from '../src/props-from';
import type { EnumeratedComponent, Story } from '../src/lib/types';

let kitRoot: string;

function write(path: string, content: string): void {
  mkdirSync(join(kitRoot, path, '..'), { recursive: true });
  writeFileSync(join(kitRoot, path), content);
}

beforeAll(() => {
  kitRoot = mkdtempSync(join(tmpdir(), 'preview-check-'));
  write(
    'scaffold-ui-kit.json',
    JSON.stringify({
      name: 'kit',
      targets: ['react', 'vue', 'svelte'],
      preview: {
        shell: 'preview/shell.ts',
        sources: [
          {
            id: 'kit',
            label: 'kit',
            order: 0,
            moduleBase: 'kit',
            templatesDirectory: 'src/components',
            manualModule: 'preview/manual.ts',
            storiesDirectory: 'preview/stories',
          },
        ],
        labels: { category: 'components' },
      },
    })
  );
  write('preview/shell.ts', 'export {};\n');
  write(
    'src/components/badge.ts',
    `export default {
  type: 'component',
  name: 'Badge',
  props: { tone: { type: "'calm' | 'loud'", default: 'calm' }, label: { type: 'string' } },
  children: [{ type: 'element', tag: 'span', passthrough: true, children: [{ type: 'slot', name: 'icon' }] }],
};
`
  );
  write(
    'src/drivers/react/List.tsx',
    `type Snap = 'row' | 'none';
export interface ListProps<Item> extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  items: Item[];
  snap?: Snap | undefined;
  dense?: boolean;
  onChange?: (items: Item[]) => void;
  children: (scope: { item: Item }) => ReactNode;
}
`
  );
  write(
    'preview/manual.ts',
    `export default () => [
  { name: 'List', file: 'drivers/<target>/List', propsFrom: 'src/drivers/react/List.tsx#ListProps' },
];
`
  );
  write(
    'preview/stories/Badge.story.ts',
    `export default {
  defaultProps: { label: 'new', title: 'a native attribute', tonne: 'calm' },
  fixed: { label: 'fixed' },
  slots: { named: { icon: { kind: 'element', component: 'Icon' }, badge: { kind: 'text', value: 'x' } } },
  scenarios: [
    { id: 'shout', props: { tone: 'shout' } },
    { id: 'relabel', props: { label: 'other' } },
    { id: 'tone-loud', props: { tone: 'calm', title: 'not loud' } },
    { id: 'marked', slots: { named: { mark: { kind: 'text', value: 'x' } } } },
  ],
};
`
  );
  write(
    'preview/stories/List.story.ts',
    `export default {
  defaultProps: { items: ['a', 'b'] },
  generate: ['snap'],
  slots: { named: { children: { kind: 'scoped', slot: { react: 'children', vue: 'default', svelte: 'children' }, parameters: ['item'], react: '{item}', vue: '{{ item }}', svelte: '{item}' } } },
};
`
  );
  write('preview/stories/Gone.story.ts', 'export default {};\n');
  // A scoped default slot, given text, and a fill a model refuses.
  write(
    'src/components/choice.ts',
    `export default {
  type: 'component',
  name: 'Choice',
  children: [{ type: 'element', tag: 'div', children: [{ type: 'slot', exposes: { option: 'option' } }] }],
};
`
  );
  write(
    'preview/stories/Choice.story.ts',
    `export default { defaultProps: { children: 'Pick' }, scenarios: [{ id: 'other', props: { children: 'Other', tabIndex: 0 } }] };\n`
  );
  write(
    'src/components/frame.ts',
    `export default {
  type: 'component',
  name: 'Frame',
  children: [{ type: 'element', tag: 'div', children: [{ type: 'slot' }] }],
};
`
  );
  // The compound root from the getting-started guide: a context fragment
  // around its element, so the consumer's attributes reach the element through `rest`.
  write(
    'src/components/field.ts',
    `export default {
  type: 'component',
  name: 'Field',
  rest: { tag: 'div' },
  imports: ['let nextFieldId = 0;'],
  script: 'nextFieldId += 1;\\nconst id = "field-" + nextFieldId;',
  extensions: {
    react: {
      imports: ["import { createContext, useId } from 'react';", "export const FieldContext = createContext('');"],
      script: 'const id = useId();',
      scriptStrategy: 'replace',
    },
    vue: { imports: ["import { provide } from 'vue';", "export const fieldKey = Symbol('field');"], script: 'provide(fieldKey, id);' },
    svelte: { imports: ["import { setContext } from 'svelte';", "export const fieldKey = Symbol('field');"], script: 'setContext(fieldKey, id);' },
  },
  children: [
    {
      type: 'fragment',
      extensions: {
        react: { tag: 'FieldContext', attributes: { value: { $expression: 'id' } } },
      },
      children: [
        {
          type: 'element',
          tag: 'div',
          attributes: { $spread: { $expression: 'rest' }, 'data-part': 'field' },
          children: [{ type: 'slot' }],
        },
      ],
    },
  ],
};
`
  );
  write(
    'preview/stories/Field.story.ts',
    `export default {
  defaultProps: { 'aria-label': 'Email', class: 'field', children: 'Email' },
  scenarios: [
    { id: 'described', props: { 'aria-describedby': 'hint', 'data-state': 'open', title: 'a native attribute' } },
    { id: 'misnamed', props: { labelText: 'not an attribute', autoComplete: 'email', className: 'wide' } },
  ],
};
`
  );
  // A passthrough label that routes the input's attributes to it: a scenario
  // may set them as it sets the root's, and the check reports none of them.
  write(
    'src/components/checkbox.ts',
    `export default {
  type: 'component',
  name: 'Checkbox',
  props: { label: { type: 'string' } },
  children: [
    {
      type: 'element',
      tag: 'label',
      passthrough: true,
      children: [
        { type: 'element', tag: 'input', passthrough: { attributes: ['aria-*', 'on*', 'name', 'required', 'form'] }, attributes: { type: 'checkbox' } },
        { type: 'text', expression: 'label' },
      ],
    },
  ],
};
`
  );
  write(
    'preview/stories/Checkbox.story.ts',
    `export default {
  defaultProps: { label: 'Accept', name: 'terms' },
  scenarios: [{ id: 'field', props: { required: true, form: 'signup', 'aria-describedby': 'hint', 'data-testid': 'terms', title: 'Terms' } }],
};
`
  );
  write(
    'preview/stories/Frame.story.ts',
    `export default { slots: { default: { kind: 'element', component: 'Badge', slots: { default: { kind: 'text', value: 'x' } } } } };\n`
  );
});

afterAll(() => {
  rmSync(kitRoot, { recursive: true, force: true });
});

describe('parseType', () => {
  it('controls an optional union as its non-nullish members', () => {
    expect(parseType("'a' | 'b' | undefined")).toEqual({
      kind: 'enum',
      options: ['a', 'b'],
    });
    expect(parseType('boolean | null')).toEqual({ kind: 'boolean' });
    expect(parseType('"row" | "none"')).toEqual({
      kind: 'enum',
      options: ['row', 'none'],
    });
  });

  it('reads a union of literals with an open string or a structured member as a select of the literals, saying what else it takes', () => {
    expect(parseType("'label' | 'body' | (string & {})")).toEqual({
      kind: 'enum',
      options: ['label', 'body'],
      open: true,
    });
    expect(
      parseType("'row' | 'column' | ReadonlyArray<Band<'row' | 'column'>>")
    ).toEqual({
      kind: 'enum',
      options: ['row', 'column'],
      structural: true,
    });
    expect(
      parseType("'a' | { from: 'x' | 'y' } | ['a', 'b'] | string[]")
    ).toEqual({ kind: 'enum', options: ['a'], structural: true });
    expect(parseType("'a' | (string & {}) | { base: 'a' }")).toEqual({
      kind: 'enum',
      options: ['a'],
      open: true,
      structural: true,
    });
    expect(parseType("'a' | 'b'")).toEqual({ kind: 'enum', options: ['a', 'b'] });
  });

  it('reads a union of booleans and string literals as a select of each', () => {
    expect(parseType("boolean | 'indeterminate'")).toEqual({
      kind: 'enum',
      options: [true, false, 'indeterminate'],
    });
    expect(parseType("'mixed' | true | undefined")).toEqual({
      kind: 'enum',
      options: [true, 'mixed'],
    });
    expect(parseType("false | 'auto' | 'always'")).toEqual({
      kind: 'enum',
      options: [false, 'auto', 'always'],
    });
  });

  it('keeps a union complex when a member is a value the select cannot offer', () => {
    expect(parseType("false | 'inherit' | string").kind).toBe('complex');
    expect(parseType("'a' | number").kind).toBe('complex');
    expect(parseType("'a' | Placement").kind).toBe('complex');
    expect(parseType('(string & {})').kind).toBe('complex');
  });
});

describe('readPropsFrom', () => {
  it('reads own members, resolving same-file aliases, with children as a slot', () => {
    const read = readPropsFrom('src/drivers/react/List.tsx#ListProps', kitRoot);
    expect(read.props).toEqual({
      items: { type: 'Item[]', required: true },
      snap: { type: "'row' | 'none' | undefined" },
      dense: { type: 'boolean' },
      onChange: { type: '(items: Item[]) => void' },
    });
    // A render-function `children` is a scoped slot, not the default slot.
    expect(read.hasChildren).toBe(false);
    expect(read.hiddenProps).toEqual(['items', 'onChange']);
    expect(read.memberNames).toContain('children');
  });

  it('fails on a missing interface', () => {
    expect(() =>
      readPropsFrom('src/drivers/react/List.tsx#Nope', kitRoot)
    ).toThrow(/no interface or object type named Nope/);
  });
});

describe('resolveStory', () => {
  const component: EnumeratedComponent = {
    name: 'Button',
    file: 'button.ts',
    props: {
      variant: { type: "'solid' | 'soft' | 'ghost'", default: 'solid' },
      disabled: { type: 'boolean' },
      tone: { type: "'a' | 'b'" },
      size: { type: 'number' },
    },
    hasDefaultSlot: false,
    slotNames: [],
  };

  it('generates a scenario per enum value and flipped boolean, after the curated ones', () => {
    const story: Story = {
      controls: { tone: false },
      scenarios: [{ id: 'quiet', label: 'quiet', props: { variant: 'soft' } }],
    };
    const model = resolveStory(component, story);
    expect(
      model.scenarios.map((scenario) => [
        scenario.id,
        scenario.label,
        scenario.generated,
      ])
    ).toEqual([
      ['quiet', 'quiet', undefined],
      ['variant-ghost', 'variant: ghost', true],
      ['disabled', 'disabled', true],
    ]);
  });

  it('narrows, excludes from or turns off generation', () => {
    expect(
      resolveStory(component, { generate: ['disabled'] }).scenarios.map(
        (scenario) => scenario.id
      )
    ).toEqual(['disabled']);
    expect(
      resolveStory(component, {
        generate: { exclude: ['disabled'] },
      }).scenarios.map((scenario) => scenario.id)
    ).toEqual(['variant-soft', 'variant-ghost', 'tone-a', 'tone-b']);
    expect(resolveStory(component, { generate: false }).scenarios).toEqual([]);
  });

  it("labels generated scenarios with the kit's generatedScenario", () => {
    const generatedScenario = (
      prop: string,
      value: string | boolean
    ): string =>
      value === true
        ? `${prop[0].toUpperCase()}${prop.slice(1)}`
        : `${prop[0].toUpperCase()}${prop.slice(1)} ${String(value)}`;
    const model = resolveStory(
      component,
      { controls: { tone: false } },
      {},
      { generatedScenario }
    );
    expect(
      model.scenarios.map((scenario) => [scenario.id, scenario.label])
    ).toEqual([
      ['variant-soft', 'Variant soft'],
      ['variant-ghost', 'Variant ghost'],
      ['disabled', 'Disabled'],
    ]);
  });

  it('replaces a generated scenario with a curated one that takes its id', () => {
    const model = resolveStory(component, {
      controls: { tone: false },
      scenarios: [
        {
          id: 'variant-ghost',
          label: 'Ghost, with an icon',
          props: { variant: 'ghost', disabled: true },
        },
      ],
    });
    expect(
      model.scenarios.map((scenario) => [scenario.id, scenario.generated])
    ).toEqual([
      ['variant-ghost', undefined],
      ['variant-soft', true],
      ['disabled', true],
    ]);
  });

  it('always passes a fixed prop and never shows it', () => {
    const model = resolveStory(component, {
      fixed: { variant: 'ghost' },
      defaultProps: { variant: 'soft' },
    });
    expect(model.defaultProps.variant).toBe('ghost');
    expect(
      model.propTypes.find((propType) => propType.name === 'variant')?.include
    ).toBe(false);
    expect(
      model.scenarios.some((scenario) => 'variant' in (scenario.props ?? {}))
    ).toBe(false);
  });

  it('takes the kit category label', () => {
    expect(
      resolveStory(component, undefined, {}, { category: 'components' }).title
    ).toBe('components/Button');
  });
});

describe('loadStory', () => {
  it('fails on a story file with no default export', async () => {
    write('broken/Field.story.ts', 'const story = { scenarios: [] };\n');
    const { loadStory } = await import('../src/story');
    const { createJiti } = await import('jiti');
    const jiti = createJiti(import.meta.url);
    await expect(
      loadStory('Field', join(kitRoot, 'broken'), (path) => jiti.import(path))
    ).rejects.toThrow(/must default-export the Field story object/);
  });
});

describe('checkPreview', () => {
  it('reports story file mistakes and hidden props', async () => {
    const report = await checkPreview(kitRoot);
    expect(report.errors.map((line) => line.replace(kitRoot, '<kit>'))).toEqual(
      [
        "Badge: defaultProps sets unknown prop 'tonne'",
        "Badge: scenario 'shout' sets tone to 'shout', not one of 'calm', 'loud'",
        "Badge: scenario 'relabel' sets 'label', which is fixed",
        "Badge: slots fill named slot 'badge', which Badge lacks",
        "Badge: scenario 'marked' slots fill named slot 'mark', which Badge lacks",
        "Badge: slot content references 'Icon', which no source declares",
        "Choice: defaultProps sets children, which Choice's default slot cannot take: it exposes values, so its content is a function of them, not text",
        "Choice: scenario 'other' sets children, which Choice's default slot cannot take: it exposes values, so its content is a function of them, not text",
        // Choice takes no native attributes, so neither spelling would do.
        "Choice: scenario 'other' sets unknown prop 'tabIndex'",
        "Field: scenario 'misnamed' sets unknown prop 'labelText'",
        "Field: scenario 'misnamed' sets unknown prop 'autoComplete'; a story spells native attributes as HTML does: 'autocomplete'",
        "Field: scenario 'misnamed' sets unknown prop 'className'; a story spells native attributes as HTML does: 'class'",
        "Frame: the element fill of 'Badge' sets slots.default - its default slot takes children",
        "Gone: <kit>/preview/stories/Gone.story.ts matches no component in source 'kit'; name it after a template, or list a hand-written component in the source's manualModule",
      ]
    );
    expect(report.hidden).toEqual([
      'List: items (Item[])',
      'List: onChange ((items: Item[]) => void)',
    ]);
  });

  it('leaves a prop generate omits out of coverage, and lists it', async () => {
    // List narrows generation to `snap`, so `dense` is a choice, not a gap.
    const report = await checkPreview(kitRoot, { strict: true });
    expect(report.ungenerated).toEqual(['List: dense']);
    expect(report.errors.some((line) => line.includes('dense'))).toBe(false);
  });

  it('warns on a value a curated scenario id displaces, naming it, and fails on it under strict', async () => {
    // Badge's curated 'tone-loud' takes the generated id but sets another value.
    const message =
      "Badge: no scenario sets tone to 'loud' (scenario 'tone-loud' replaces the generated one and does not set it)";
    expect((await checkPreview(kitRoot)).warnings).toEqual([message]);
    const strict = await checkPreview(kitRoot, { strict: true });
    expect(strict.warnings).toEqual([]);
    expect(strict.errors).toContain(message);
  });

  it('lists the props an exclude leaves out as ungenerated', async () => {
    write(
      'preview/stories/List.story.ts',
      `export default {
  defaultProps: { items: ['a', 'b'] },
  generate: { exclude: ['dense'] },
  slots: { named: { children: { kind: 'scoped', slot: { react: 'children', vue: 'default', svelte: 'children' }, parameters: ['item'], react: '{item}', vue: '{{ item }}', svelte: '{item}' } } },
};
`
    );
    const report = await checkPreview(kitRoot, { strict: true });
    expect(report.ungenerated).toEqual(['List: dense']);
    expect(report.errors.some((line) => line.startsWith('List:'))).toBe(false);
  });

  it("checks the option values a scenario sets against the kit's options", async () => {
    // Modules already imported stay cached for the run, so the kit's
    // story files move to new files.
    write(
      'scaffold-ui-kit.json',
      JSON.stringify({
        name: 'kit',
        targets: ['react', 'vue', 'svelte'],
        preview: {
          shell: 'preview/shell.ts',
          sources: [
            {
              id: 'kit',
              label: 'kit',
              order: 0,
              moduleBase: 'kit',
              templatesDirectory: 'src/components',
              manualModule: 'preview/manual.ts',
              storiesDirectory: 'preview/stories-with-options',
            },
          ],
          labels: { category: 'components' },
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
              apply: { type: 'root-attribute', attribute: 'data-mode' },
            },
            {
              id: 'padded',
              label: 'padded',
              default: true,
              scope: 'story',
              apply: { type: 'class', className: 'is-padded' },
            },
          ],
        },
      })
    );
    write(
      'preview/stories-with-options/List.story.ts',
      `export default {
  defaultProps: { items: ['a', 'b'] },
  generate: false,
  options: { padded: false },
  slots: { named: { children: { kind: 'scoped', slot: { react: 'children', vue: 'default', svelte: 'children' }, parameters: ['item'], react: '{item}', vue: '{{ item }}', svelte: '{item}' } } },
  scenarios: [
    { id: 'dark', options: { mode: 'dark' } },
    { id: 'dim', options: { mode: 'dim', surface: '2', padded: true } },
  ],
};
`
    );
    const report = await checkPreview(kitRoot);
    expect(report.errors.filter((line) => line.startsWith('List:'))).toEqual([
      `List: scenario 'dim' sets option 'mode' to "dim", which it cannot hold`,
      "List: scenario 'dim' sets unknown option 'surface'",
      "List: scenario 'dim' sets option 'padded', which the story file makes unavailable",
    ]);
  });
});

describe('checkPreview - unlisted', () => {
  let unlistedKitRoot: string;

  beforeAll(() => {
    unlistedKitRoot = mkdtempSync(join(tmpdir(), 'preview-check-unlisted-'));
    const put = (path: string, content: string) => {
      mkdirSync(join(unlistedKitRoot, path, '..'), { recursive: true });
      writeFileSync(join(unlistedKitRoot, path), content);
    };
    put(
      'scaffold-ui-kit.json',
      JSON.stringify({
        name: 'kit',
        targets: ['react', 'vue', 'svelte'],
        preview: {
          shell: 'preview/shell.ts',
          sources: [
            {
              id: 'kit',
              label: 'kit',
              order: 0,
              moduleBase: 'kit',
              templatesDirectory: 'src/components',
              manualModule: 'preview/manual.ts',
              storiesDirectory: 'preview/stories',
            },
          ],
        },
      })
    );
    put('preview/shell.ts', 'export {};\n');
    for (const name of ['Probe', 'Part', 'Dropped']) {
      put(
        `src/components/${name.toLowerCase()}.ts`,
        `export default { type: 'component', name: '${name}', children: [{ type: 'element', tag: 'span' }] };\n`
      );
    }
    put(
      'preview/manual.ts',
      `export default () => [{ name: 'Driver', file: 'drivers/<target>/Driver', props: {}, standalone: false, unlisted: true }];\n`
    );
    put(
      'preview/stories/Probe.story.ts',
      'export default { unlisted: true };\n'
    );
    put(
      'preview/stories/Part.story.ts',
      'export default { standalone: false, unlisted: true };\n'
    );
    put(
      'preview/stories/Dropped.story.ts',
      'export default { omit: true, unlisted: true };\n'
    );
  });

  afterAll(() => {
    rmSync(unlistedKitRoot, { recursive: true, force: true });
  });

  it('accepts an unlisted story, and reports unlisted beside omit or standalone: false', async () => {
    const report = await checkPreview(unlistedKitRoot);
    expect([...report.errors].sort()).toEqual([
      'Driver: unlisted has no story to hide, as the component is standalone: false',
      'Dropped: unlisted has no story to hide, as the component is omitted',
      'Part: unlisted has no story to hide, as the component is standalone: false',
    ]);
  });
});

describe('checkPreview - the landing entry and the pane widths', () => {
  const roots: string[] = [];

  /** A kit with one story, `Probe`, whose preview block takes `preview`. */
  function kit(preview: Record<string, unknown>): string {
    const root = mkdtempSync(join(tmpdir(), 'preview-check-landing-'));
    roots.push(root);
    const put = (path: string, content: string) => {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), content);
    };
    put(
      'scaffold-ui-kit.json',
      JSON.stringify({
        name: 'kit',
        targets: ['react', 'vue', 'svelte'],
        preview: {
          shell: 'preview/shell.ts',
          sources: [
            {
              id: 'kit',
              label: 'kit',
              order: 0,
              moduleBase: 'kit',
              templatesDirectory: 'src/components',
            },
          ],
          ...preview,
        },
      })
    );
    put('preview/shell.ts', 'export {};\n');
    put(
      'src/components/probe.ts',
      `export default { type: 'component', name: 'Probe', props: { tone: { type: "'calm' | 'loud'", default: 'calm' } }, children: [{ type: 'element', tag: 'span' }] };\n`
    );
    return root;
  }

  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  it('accepts a landing story and scenario the kit has, and a view, which only the browser knows', async () => {
    for (const landing of [
      { component: 'components-probe' },
      { component: 'components-probe', scenario: 'tone-loud' },
      { view: 'foundations' },
    ])
      expect((await checkPreview(kit({ landing }))).errors).toEqual([]);
  });

  it('reports a landing story or scenario the kit has none of', async () => {
    expect(
      (
        await checkPreview(
          kit({ landing: { component: 'components-missing' } })
        )
      ).errors
    ).toEqual([
      "preview.landing names component 'components-missing', which has no story; a story's id is the one the preview's address carries as component=",
    ]);
    expect(
      (
        await checkPreview(
          kit({
            landing: { component: 'components-probe', scenario: 'tone-calm' },
          })
        )
      ).errors
    ).toEqual([
      "preview.landing names scenario 'tone-calm' of 'components-probe', which has the scenarios tone-loud",
    ]);
  });

  it('accepts the pane widths the preview block gives, and reports unsound ones', async () => {
    expect(
      await checkPreview(kit({ paneWidths: [{ label: 'sm', width: 640 }] }), {
        strict: true,
      })
    ).toMatchObject({
      errors: [],
      warnings: [],
    });
    const [error] = (await checkPreview(kit({ paneWidths: 'wide' }))).errors;
    expect(error).toMatch(
      /^preview\.paneWidths must be a list of \{ label, width \}/
    );
  });

  it('reports a key an option, one of its values or its apply does not take', async () => {
    const report = await checkPreview(
      kit({
        options: [
          {
            id: 'mode',
            label: 'mode',
            description: 'Color mode',
            values: [{ value: 'light', label: 'light', hint: 'day' }],
            default: 'light',
            scope: 'global',
            apply: {
              type: 'root-attribute',
              attribute: 'data-mode',
              className: 'is-mode',
            },
          },
        ],
      }),
      { strict: true }
    );
    expect(report.errors).toEqual([
      "preview.options[0] ('mode'): unknown key 'description'; an option takes id, label, title, values, default, group, scope, apply",
      "preview.options[0] ('mode'): unknown key 'values[0].hint'; a value takes value, label",
      "preview.options[0] ('mode'): unknown key 'apply.className'; a 'root-attribute' apply takes type, attribute, target, omitAtDefault",
    ]);
  });
});

describe('checkPreview - the kit exports', () => {
  let exportsKitRoot: string;
  const put = (path: string, content: string) => {
    mkdirSync(join(exportsKitRoot, path, '..'), { recursive: true });
    writeFileSync(join(exportsKitRoot, path), content);
  };

  beforeAll(() => {
    exportsKitRoot = mkdtempSync(join(tmpdir(), 'preview-check-exports-'));
    put(
      'scaffold-ui-kit.json',
      JSON.stringify({
        name: 'exports-kit',
        targets: ['react', 'vue'],
        preview: {
          shell: 'preview/shell.ts',
          sources: [
            {
              id: 'kit',
              label: 'kit',
              order: 0,
              moduleBase: 'exports-kit',
              templatesDirectory: 'src/components',
            },
          ],
        },
      })
    );
    put('preview/shell.ts', 'export {};\n');
    put(
      'src/components/probe.ts',
      `export default { type: 'component', name: 'Probe', children: [{ type: 'element', tag: 'span' }] };\n`
    );
  });

  afterAll(() => {
    rmSync(exportsKitRoot, { recursive: true, force: true });
  });

  it('reports a target the kit package does not export', async () => {
    put(
      'package.json',
      JSON.stringify({
        name: 'exports-kit',
        exports: { './react': './dist/react/index.ts' },
      })
    );
    const report = await checkPreview(exportsKitRoot);
    expect(report.errors).toEqual([
      `${join(exportsKitRoot, 'package.json')}: the kit builds the vue target, but its package.json has no exports entry for './vue', so the preview cannot import 'exports-kit/vue'; add one, such as "./vue": "./dist/vue/index.ts"`,
    ]);
  });

  it('accepts a kit exporting every target, or a source importing another package', async () => {
    put(
      'package.json',
      JSON.stringify({
        name: 'exports-kit',
        exports: {
          './react': './dist/react/index.ts',
          './vue': './dist/vue/index.ts',
        },
      })
    );
    expect((await checkPreview(exportsKitRoot)).errors).toEqual([]);
    put('package.json', JSON.stringify({ name: 'another-name' }));
    expect((await checkPreview(exportsKitRoot)).errors).toEqual([]);
  });

  it('accepts a subpath pattern covering a target, and refuses one a null entry excludes', async () => {
    put(
      'package.json',
      JSON.stringify({
        name: 'exports-kit',
        exports: { './*': './dist/*/index.ts' },
      })
    );
    expect((await checkPreview(exportsKitRoot)).errors).toEqual([]);
    put(
      'package.json',
      JSON.stringify({
        name: 'exports-kit',
        exports: { './*': './dist/*/index.ts', './vue': null },
      })
    );
    expect((await checkPreview(exportsKitRoot)).errors).toEqual([
      expect.stringContaining("has no exports entry for './vue'"),
    ]);
    put(
      'package.json',
      JSON.stringify({
        name: 'exports-kit',
        exports: { './react': null, './*': './dist/*/index.ts' },
      })
    );
    expect((await checkPreview(exportsKitRoot)).errors).toEqual([
      expect.stringContaining("has no exports entry for './react'"),
    ]);
  });

  it("reports an add.shared specifier of the kit's own package that its exports does not export", async () => {
    const configuration = JSON.parse(
      readFileSync(join(exportsKitRoot, 'scaffold-ui-kit.json'), 'utf8')
    );
    put(
      'scaffold-ui-kit.json',
      JSON.stringify({
        ...configuration,
        add: {
          shared: [
            { source: 'src/scripts', specifier: 'exports-kit/scripts' },
            { source: 'src/tokens.ts', specifier: 'exports-kit/tokens' },
            { source: 'src/styles' },
            { source: 'vendor/other', specifier: 'another-package/helpers' },
          ],
        },
      })
    );
    put('src/scripts/index.ts', 'export const nextId = () => 1;\n');
    put('src/tokens.ts', 'export const space = 4;\n');
    try {
      const targets = {
        './react': './dist/react/index.ts',
        './vue': './dist/vue/index.ts',
      };
      put(
        'package.json',
        JSON.stringify({ name: 'exports-kit', exports: targets })
      );
      expect((await checkPreview(exportsKitRoot)).errors).toEqual([
        `${join(exportsKitRoot, 'package.json')}: add.shared gives 'src/scripts' the specifier 'exports-kit/scripts', but the kit's exports has no './scripts' entry, so the preview and the kit's consumers cannot import it; add one, such as "./scripts": "./src/scripts/index.ts"`,
        `${join(exportsKitRoot, 'package.json')}: add.shared gives 'src/tokens.ts' the specifier 'exports-kit/tokens', but the kit's exports has no './tokens' entry, so the preview and the kit's consumers cannot import it; add one, such as "./tokens": "./src/tokens.ts"`,
      ]);
      put(
        'package.json',
        JSON.stringify({
          name: 'exports-kit',
          exports: {
            ...targets,
            './scripts': './src/scripts/index.ts',
            './tokens': './src/tokens.ts',
          },
        })
      );
      expect((await checkPreview(exportsKitRoot)).errors).toEqual([]);
    } finally {
      put('scaffold-ui-kit.json', JSON.stringify(configuration));
    }
  });

  describe('an add.shared specifier exported other ways', () => {
    const targets = {
      './react': './dist/react/index.ts',
      './vue': './dist/vue/index.ts',
    };
    /** The add.shared errors of the kit with `shared` and its package.json fields. */
    async function sharedErrors(
      shared: unknown[],
      manifest: Record<string, unknown>
    ): Promise<string[]> {
      const configuration = JSON.parse(
        readFileSync(join(exportsKitRoot, 'scaffold-ui-kit.json'), 'utf8')
      );
      put(
        'scaffold-ui-kit.json',
        JSON.stringify({ ...configuration, add: { shared } })
      );
      put('package.json', JSON.stringify({ name: 'exports-kit', ...manifest }));
      try {
        return (await checkPreview(exportsKitRoot)).errors.filter((line) =>
          line.includes('add.shared')
        );
      } finally {
        put('scaffold-ui-kit.json', JSON.stringify(configuration));
      }
    }
    const scripts = [
      { source: 'src/scripts', specifier: 'exports-kit/scripts' },
    ];

    it('accepts an entry with conditions, a pattern covering it and a pattern covering paths below it', async () => {
      put('src/scripts/index.ts', '');
      const conditions = {
        types: './src/scripts/index.ts',
        import: './src/scripts/index.ts',
      };
      expect(
        await sharedErrors(scripts, {
          exports: { ...targets, './scripts': conditions },
        })
      ).toEqual([]);
      expect(
        await sharedErrors(scripts, { exports: { './*': './dist/*/index.ts' } })
      ).toEqual([]);
      expect(
        await sharedErrors(scripts, {
          exports: { ...targets, './scripts/*': './src/scripts/*.ts' },
        })
      ).toEqual([]);
      // A null entry below it exports nothing.
      expect(
        await sharedErrors(scripts, {
          exports: { ...targets, './scripts/*': null },
        })
      ).toHaveLength(1);
    });

    it("accepts the package's own name under a string exports or one of conditions alone", async () => {
      const tokens = [{ source: 'src/tokens.ts', specifier: 'exports-kit' }];
      expect(
        await sharedErrors(tokens, { exports: './src/tokens.ts' })
      ).toEqual([]);
      expect(
        await sharedErrors(tokens, {
          exports: { import: './src/tokens.ts', types: './src/tokens.ts' },
        })
      ).toEqual([]);
      expect(
        await sharedErrors(tokens, {
          exports: { ...targets, '.': './src/tokens.ts' },
        })
      ).toEqual([]);
      // Subpath entries alone export nothing at the name.
      expect(await sharedErrors(tokens, { exports: targets })).toEqual([
        expect.stringContaining(`add one, such as ".": "./src/tokens.ts"`),
      ]);
    });

    it('reports a specifier of a scoped package name', async () => {
      const configuration = JSON.parse(
        readFileSync(join(exportsKitRoot, 'scaffold-ui-kit.json'), 'utf8')
      );
      put('src/scripts/index.ts', '');
      put(
        'scaffold-ui-kit.json',
        JSON.stringify({
          ...configuration,
          add: {
            shared: [{ source: 'src/scripts', specifier: '@acme/kit/scripts' }],
          },
        })
      );
      put(
        'package.json',
        JSON.stringify({ name: '@acme/kit', exports: targets })
      );
      try {
        expect(
          (await checkPreview(exportsKitRoot)).errors.filter((line) =>
            line.includes('add.shared')
          )
        ).toEqual([
          expect.stringContaining(
            `'@acme/kit/scripts', but the kit's exports has no './scripts' entry`
          ),
        ]);
      } finally {
        put('scaffold-ui-kit.json', JSON.stringify(configuration));
      }
    });

    it("suggests a directory's index.js, or no entry when it has no index", async () => {
      rmSync(join(exportsKitRoot, 'src/scripts'), {
        recursive: true,
        force: true,
      });
      put('src/scripts/index.js', '');
      expect(await sharedErrors(scripts, { exports: targets })).toEqual([
        expect.stringContaining(
          `add one, such as "./scripts": "./src/scripts/index.js"`
        ),
      ]);
      rmSync(join(exportsKitRoot, 'src/scripts/index.js'));
      put('src/scripts/focus.ts', '');
      expect(await sharedErrors(scripts, { exports: targets })).toEqual([
        expect.stringContaining(
          `add one naming the module 'src/scripts' exports from`
        ),
      ]);
      rmSync(join(exportsKitRoot, 'src/scripts'), {
        recursive: true,
        force: true,
      });
    });
  });

  it('reports a package.json that is not JSON instead of failing', async () => {
    put('package.json', '{ "name": "exports-kit",');
    const report = await checkPreview(exportsKitRoot);
    expect(report.errors).toEqual([
      expect.stringMatching(/package\.json: cannot be read as JSON \(/),
    ]);
  });
});

describe('checkPreview - a prop named color', () => {
  const colorKitRoots: string[] = [];

  /** A kit with a Swatch whose color is a union, under the control hints
   *  given. */
  function colorKit(controlHints?: Record<string, unknown>): string {
    const root = mkdtempSync(join(tmpdir(), 'preview-check-color-'));
    colorKitRoots.push(root);
    const put = (path: string, content: string) => {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), content);
    };
    put(
      'scaffold-ui-kit.json',
      JSON.stringify({
        name: 'kit',
        targets: ['react', 'vue', 'svelte'],
        preview: {
          shell: 'preview/shell.ts',
          sources: [
            {
              id: 'kit',
              label: 'kit',
              order: 0,
              moduleBase: 'kit',
              templatesDirectory: 'src/components',
              storiesDirectory: 'preview/stories',
            },
          ],
          ...(controlHints ? { controlHints } : {}),
        },
      })
    );
    put('preview/shell.ts', 'export {};\n');
    put(
      'src/components/swatch.ts',
      `export default { type: 'component', name: 'Swatch', props: { color: { type: "'blue' | 'red'", default: 'blue' } }, children: [{ type: 'element', tag: 'span' }] };\n`
    );
    put(
      'preview/stories/Swatch.story.ts',
      `export default { scenarios: [{ id: 'red', props: { color: 'red' } }, { id: 'primary', props: { color: 'primary' } }] };\n`
    );
    return root;
  }

  afterAll(() => {
    for (const root of colorKitRoots)
      rmSync(root, { recursive: true, force: true });
  });

  it('checks its values against the declared union when the kit gives no color tokens', async () => {
    expect((await checkPreview(colorKit())).errors).toEqual([
      "Swatch: scenario 'primary' sets color to 'primary', not one of 'blue', 'red'",
    ]);
  });

  it("checks its values against the kit's color tokens when it gives them", async () => {
    // JSON's null is the unset choice.
    const root = colorKit({ colorTokens: [null, 'primary', 'accent'] });
    expect((await checkPreview(root)).errors).toEqual([
      "Swatch: scenario 'red' sets color to 'red', not one of 'primary', 'accent'",
    ]);
  });
});

describe('checkPreview - a two-way prop given null', () => {
  let nullKitRoot: string;
  const put = (path: string, content: string) => {
    mkdirSync(join(nullKitRoot, path, '..'), { recursive: true });
    writeFileSync(join(nullKitRoot, path), content);
  };
  const twoWay = (name: string, type: string) => `export default {
  type: 'component',
  name: '${name}',
  props: {
    value: { type: ${JSON.stringify(type)}, bindable: { current: 'current', setter: 'setCurrent', defaultProp: 'defaultValue', changeProp: 'onValueChange' } },
    defaultValue: { type: ${JSON.stringify(type)} },
    onValueChange: { type: ${JSON.stringify(`(value: ${type}) => void`)} },
    label: { type: 'string' },
    tone: { type: "'calm' | 'loud'" },
    checked: { type: "boolean | 'indeterminate'" },
  },
  children: [{ type: 'element', tag: 'span' }],
};
`;

  beforeAll(() => {
    nullKitRoot = mkdtempSync(join(tmpdir(), 'preview-check-null-'));
    put(
      'scaffold-ui-kit.json',
      JSON.stringify({
        name: 'null-kit',
        targets: ['react', 'vue', 'svelte'],
        preview: {
          shell: 'preview/shell.ts',
          sources: [
            {
              id: 'kit',
              label: 'kit',
              order: 0,
              moduleBase: 'null-kit',
              templatesDirectory: 'src/components',
              storiesDirectory: 'preview/stories',
            },
          ],
        },
      })
    );
    put('preview/shell.ts', 'export {};\n');
    put('src/components/strict-field.ts', twoWay('StrictField', 'string'));
    put(
      'src/components/nullable-field.ts',
      twoWay('NullableField', 'string | null')
    );
    put(
      'src/components/nullable-check.ts',
      twoWay('NullableCheck', "boolean | 'indeterminate' | null")
    );
    put(
      'src/components/nullable-choice.ts',
      twoWay('NullableChoice', "'a' | 'b' | null")
    );
    put(
      'src/components/list-field.ts',
      twoWay('ListField', '(string | null)[]')
    );
    // Each unsets its plain props too: an enum and a boolean-literal union.
    const story = `export default { defaultProps: { label: 'name', tone: 'calm', checked: true }, scenarios: [{ id: 'cleared', props: { value: null, defaultValue: null, label: null, tone: null, checked: null } }] };\n`;
    for (const name of [
      'StrictField',
      'NullableField',
      'NullableCheck',
      'NullableChoice',
      'ListField',
    ])
      put(`preview/stories/${name}.story.ts`, story);
  });

  afterAll(() => {
    rmSync(nullKitRoot, { recursive: true, force: true });
  });

  it('reports one whose type does not take null, and accepts one declared with null or a plain prop unset', async () => {
    expect([...(await checkPreview(nullKitRoot)).errors].sort()).toEqual([
      "ListField: scenario 'cleared' gives two-way prop value null, which its type '(string | null)[]' does not take: declare it '(string | null)[] | null', or leave value out",
      "StrictField: scenario 'cleared' gives two-way prop value null, which its type 'string' does not take: declare it 'string | null', or leave value out",
    ]);
  });
});

describe('checkPreview - a slot whose content must take its scope', () => {
  let scopeKitRoot: string;
  const put = (path: string, content: string) => {
    mkdirSync(join(scopeKitRoot, path, '..'), { recursive: true });
    writeFileSync(join(scopeKitRoot, path), content);
  };
  const scopeRequired = (name: string, slot: string) => `export default {
  type: 'component',
  name: '${name}',
  children: [{ type: 'element', tag: 'div', children: [{ type: 'slot',${slot} exposes: { triggerProps: 'triggerProps' }, scopeRequired: true }] }],
};
`;
  const scopedFill = `{ kind: 'scoped', slot: { react: 'trigger', vue: 'trigger', svelte: 'trigger' }, parameters: ['triggerProps'], react: '<button {...triggerProps}>Open</button>', vue: '<button v-bind="triggerProps">Open</button>', svelte: '<button {...triggerProps}>Open</button>' }`;

  beforeAll(() => {
    scopeKitRoot = mkdtempSync(join(tmpdir(), 'preview-check-scope-'));
    put(
      'scaffold-ui-kit.json',
      JSON.stringify({
        name: 'scope-kit',
        targets: ['react', 'vue', 'svelte'],
        preview: {
          shell: 'preview/shell.ts',
          sources: [
            {
              id: 'kit',
              label: 'kit',
              order: 0,
              moduleBase: 'scope-kit',
              templatesDirectory: 'src/components',
              storiesDirectory: 'preview/stories',
            },
          ],
        },
      })
    );
    put('preview/shell.ts', 'export {};\n');
    put(
      'src/components/popover.ts',
      scopeRequired('Popover', " name: 'trigger',")
    );
    put(
      'src/components/tooltip.ts',
      scopeRequired('Tooltip', " name: 'trigger',")
    );
    put('src/components/sheet.ts', scopeRequired('Sheet', ''));
    put(
      'preview/stories/Popover.story.ts',
      `export default { slots: { named: { trigger: { kind: 'html', tag: 'button', children: { kind: 'text', value: 'Open' } } } } };\n`
    );
    put(
      'preview/stories/Tooltip.story.ts',
      `export default { slots: { named: { trigger: ${scopedFill} } } };\n`
    );
    put(
      'preview/stories/Sheet.story.ts',
      `export default { slots: { default: { kind: 'text', value: 'Open' } } };\n`
    );
  });

  afterAll(() => {
    rmSync(scopeKitRoot, { recursive: true, force: true });
  });

  it('refuses plain content there and takes a scoped fill', async () => {
    expect([...(await checkPreview(scopeKitRoot)).errors].sort()).toEqual([
      "Popover: slots fill named slot 'trigger' with plain content, which it cannot take: its content must take the values it exposes, so fill it with a scoped fill",
      'Sheet: slots fill the default slot with plain content, which it cannot take: its content must take the values it exposes, so fill it with a scoped fill',
    ]);
  });
});

describe('checkPreview - a scenario prop set to undefined', () => {
  let undefinedKitRoot: string;
  const put = (path: string, content: string) => {
    mkdirSync(join(undefinedKitRoot, path, '..'), { recursive: true });
    writeFileSync(join(undefinedKitRoot, path), content);
  };

  beforeAll(() => {
    undefinedKitRoot = mkdtempSync(join(tmpdir(), 'preview-check-undefined-'));
    put(
      'scaffold-ui-kit.json',
      JSON.stringify({
        name: 'undefined-kit',
        targets: ['react', 'vue', 'svelte'],
        preview: {
          shell: 'preview/shell.ts',
          sources: [
            {
              id: 'kit',
              label: 'kit',
              order: 0,
              moduleBase: 'undefined-kit',
              templatesDirectory: 'src/components',
              storiesDirectory: 'preview/stories',
            },
          ],
        },
      })
    );
    put('preview/shell.ts', 'export {};\n');
    put(
      'src/components/number-input.ts',
      `export default {
  type: 'component',
  name: 'NumberInput',
  props: {
    min: { type: 'number' },
    max: { type: 'number' },
    step: { type: 'number', default: 1 },
    label: { type: 'string' },
  },
  children: [{ type: 'element', tag: 'input' }],
};
`
    );
    // min is the story's from defaultProps, step's undefined leaves the
    // template's own default, label has nothing to unset, max is unset with null.
    put(
      'preview/stories/NumberInput.story.ts',
      `export default { defaultProps: { min: 1, max: 10 }, scenarios: [{ id: 'unbounded', props: { min: undefined, max: null, step: undefined, label: undefined } }] };\n`
    );
  });

  afterAll(() => {
    rmSync(undefinedKitRoot, { recursive: true, force: true });
  });

  const warning =
    "NumberInput: scenario 'unbounded' sets min to undefined, which leaves it at 1, the value the story starts it from: unset it with null";

  it('warns of one a defaultProps value covers, naming null as the unset form', async () => {
    const report = await checkPreview(undefinedKitRoot);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([warning]);
  });

  it('reports it as an error under strict', async () => {
    const report = await checkPreview(undefinedKitRoot, { strict: true });
    expect(report.errors).toEqual([warning]);
    expect(report.warnings).toEqual([]);
  });
});

describe("checkPreview - what the kit's build reports", () => {
  let buildKitRoot: string;
  const put = (path: string, content: string) => {
    mkdirSync(join(buildKitRoot, path, '..'), { recursive: true });
    writeFileSync(join(buildKitRoot, path), content);
  };

  beforeAll(() => {
    buildKitRoot = mkdtempSync(join(tmpdir(), 'preview-check-build-'));
    put(
      'scaffold-ui-kit.json',
      JSON.stringify({
        name: 'build-kit',
        targets: ['react', 'vue'],
        preview: {
          shell: 'preview/shell.ts',
          sources: [
            {
              id: 'kit',
              label: 'kit',
              order: 0,
              moduleBase: 'build-kit',
              templatesDirectory: 'src/components',
            },
          ],
        },
      })
    );
    put('preview/shell.ts', 'export {};\n');
    // A prop default the build refuses, and two nodes styling one class differently.
    put(
      'src/components/counter.ts',
      `export default {
  type: 'component',
  name: 'Counter',
  props: { label: { type: 'string', default: 5 } },
  children: [{ type: 'element', tag: 'span' }],
};
`
    );
    put(
      'src/components/pair.ts',
      `export default {
  type: 'component',
  name: 'Pair',
  children: [
    { type: 'element', tag: 'span', attributes: { class: ['side'], style: { color: 'red' } } },
    { type: 'element', tag: 'span', attributes: { class: ['side'], style: { color: 'blue' } } },
  ],
};
`
    );
  });

  afterAll(() => {
    rmSync(buildKitRoot, { recursive: true, force: true });
  });

  it("reports the build's errors and its warnings, each naming the template, the warnings staying warnings under strict", async () => {
    for (const strict of [false, true]) {
      const report = await checkPreview(buildKitRoot, { strict });
      expect(report.errors).toEqual([
        expect.stringMatching(
          /^src\/components\/counter\.ts: .*label.*default/
        ),
      ]);
      expect(report.warnings).toEqual([
        expect.stringMatching(
          /^src\/components\/pair\.ts: The <span class="side"> at children\[0\] and the <span class="side"> here both style \.side and give it different declarations/
        ),
      ]);
    }
  });

  it('reports the same for a kit root given relative to the working directory', async () => {
    const report = await checkPreview(relative(process.cwd(), buildKitRoot));
    expect(report.errors).toEqual([
      expect.stringMatching(/^src\/components\/counter\.ts: .*label.*default/),
    ]);
    expect(report.warnings).toHaveLength(1);
  });

  /** A check of a kit whose own installed scaffold-ui-kit is `index`. */
  async function checkWithKitScaffolder(index: string) {
    const root = mkdtempSync(join(tmpdir(), 'preview-check-own-scaffolder-'));
    try {
      const at = (path: string, content: string) => {
        mkdirSync(join(root, path, '..'), { recursive: true });
        writeFileSync(join(root, path), content);
      };
      at(
        'scaffold-ui-kit.json',
        readFileSync(join(buildKitRoot, 'scaffold-ui-kit.json'), 'utf8')
      );
      at('preview/shell.ts', 'export {};\n');
      // Two nodes styling one class differently: the preview's copy warns.
      at(
        'src/components/pair.ts',
        `export default { type: 'component', name: 'Pair', children: [
  { type: 'element', tag: 'span', attributes: { class: ['side'], style: { color: 'red' } } },
  { type: 'element', tag: 'span', attributes: { class: ['side'], style: { color: 'blue' } } },
] };\n`
      );
      at(
        'node_modules/scaffold-ui-kit/package.json',
        JSON.stringify({
          name: 'scaffold-ui-kit',
          version: '9.0.0',
          main: 'index.js',
        })
      );
      at('node_modules/scaffold-ui-kit/index.js', index);
      return await checkPreview(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  const sharedClass = expect.stringMatching(
    /^src\/components\/pair\.ts: The <span class="side"> at children\[0\]/
  );

  it('asks the scaffolder the kit has installed, before its own', async () => {
    const report = await checkWithKitScaffolder(
      "exports.diagnoseKit = async () => ({ errors: ['from the kit'], warnings: [] });\n"
    );
    expect(report.errors).toEqual(['from the kit']);
    expect(report.warnings).toEqual([]);
  });

  it("falls back to the preview's copy, with a warning, when the kit's returns no report, exports none or throws on import", async () => {
    const cases: Array<[string, RegExp]> = [
      [
        "exports.diagnoseKit = async () => ({ errors: 'broken', warnings: [] });\n",
        /returned a report that isn't lists/,
      ],
      [
        'exports.diagnoseKit = async () => ({ errors: [], warnings: [1] });\n',
        /returned a report that isn't lists/,
      ],
      ['exports.buildCommand = async () => {};\n', /exports no diagnoseKit/],
      [
        "throw new Error('broken install');\n",
        /could not be loaded \(broken install\)/,
      ],
    ];
    for (const [index, reason] of cases) {
      const report = await checkWithKitScaffolder(index);
      expect(report.errors, index).toEqual([]);
      expect(report.warnings, index).toEqual([
        expect.stringMatching(
          new RegExp(
            `^the kit's scaffold-ui-kit ${reason.source}.*the preview's own copy$`
          )
        ),
        sharedClass,
      ]);
    }
  });

  it('reports nothing of the build for a kit with no src/components', async () => {
    const root = mkdtempSync(join(tmpdir(), 'preview-check-manual-'));
    try {
      const at = (path: string, content: string) => {
        mkdirSync(join(root, path, '..'), { recursive: true });
        writeFileSync(join(root, path), content);
      };
      at(
        'scaffold-ui-kit.json',
        JSON.stringify({
          name: 'other-kit',
          targets: ['react'],
          preview: {
            shell: 'preview/shell.ts',
            sources: [
              {
                id: 'kit',
                label: 'kit',
                order: 0,
                moduleBase: 'other-kit',
                templatesDirectory: 'templates',
              },
            ],
          },
        })
      );
      at('preview/shell.ts', 'export {};\n');
      at(
        'templates/probe.ts',
        `export default { type: 'component', name: 'Probe', children: [{ type: 'element', tag: 'span' }] };\n`
      );
      const report = await checkPreview(root);
      expect(report.errors).toEqual([]);
      expect(report.warnings).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails on a configuration the build cannot read, as the preview reads it too', async () => {
    const configurationPath = join(buildKitRoot, 'scaffold-ui-kit.json');
    const configuration = readFileSync(configurationPath, 'utf8');
    writeFileSync(
      configurationPath,
      JSON.stringify({ ...JSON.parse(configuration), targets: undefined })
    );
    try {
      await expect(checkPreview(buildKitRoot)).rejects.toThrow(
        "[preview] scaffold-ui-kit.json is invalid:\n  - 'targets' is required"
      );
    } finally {
      writeFileSync(configurationPath, configuration);
    }
  });
});

describe("checkPreview - components that are not standalone, from a compound's parts", () => {
  let partsKitRoot: string;

  beforeAll(() => {
    partsKitRoot = mkdtempSync(join(tmpdir(), 'preview-check-parts-'));
    const put = (path: string, content: string) => {
      mkdirSync(join(partsKitRoot, path, '..'), { recursive: true });
      writeFileSync(join(partsKitRoot, path), content);
    };
    put(
      'scaffold-ui-kit.json',
      JSON.stringify({
        name: 'kit',
        targets: ['react', 'vue', 'svelte'],
        // A hand-written root, which has no template, lists its parts here.
        parts: { ManualShell: ['ManualShellHeader'] },
        preview: {
          shell: 'preview/shell.ts',
          sources: [
            {
              id: 'kit',
              label: 'kit',
              order: 0,
              moduleBase: 'kit',
              templatesDirectory: 'src/components',
              manualModule: 'preview/manual.ts',
              storiesDirectory: 'preview/stories',
            },
            {
              id: 'elsewhere',
              label: 'elsewhere',
              order: 1,
              moduleBase: 'elsewhere',
              templatesDirectory: 'elsewhere/components',
              storiesDirectory: 'elsewhere/stories',
            },
          ],
        },
      })
    );
    put('preview/shell.ts', 'export {};\n');
    put(
      'src/components/root.ts',
      "export default { type: 'component', name: 'Root', parts: ['Listed'], children: [{ type: 'element', tag: 'div' }] };\n"
    );
    for (const name of ['Listed', 'Flagged']) {
      put(
        `src/components/${name.toLowerCase()}.ts`,
        `export default { type: 'component', name: '${name}', children: [{ type: 'element', tag: 'span' }] };\n`
      );
    }
    put(
      'preview/stories/Flagged.story.ts',
      'export default { standalone: false };\n'
    );
    // Components that are no one compound's part, beside ones that still warn.
    const template = (name: string, body: string, extra = '') =>
      put(
        `src/components/${name.toLowerCase()}.ts`,
        `export default { type: 'component', name: '${name}'${extra}, children: [${body}] };\n`
      );
    const renders = (tag: string) => `{ type: 'element', tag: '${tag}' }`;
    template(
      'First',
      [
        renders('Shared'),
        renders('Once'),
        renders('Member.Item'),
        renders('Recursive'),
        "{ type: 'element', tag: { $expression: 'as', default: 'Dynamic' } }",
        "{ type: 'slot' }",
      ].join(', ')
    );
    template(
      'Second',
      [
        renders('Shared'),
        renders('Member'),
        "{ type: 'fragment', extensions: { react: { tag: 'Dynamic' } }, children: [] }",
        "{ type: 'slot' }",
      ].join(', ')
    );
    for (const name of [
      'Shared',
      'Once',
      'Dynamic',
      'Slotted',
      'Row',
      'Member',
      'ManualFixtured',
      'CrossScoped',
    ])
      template(name, renders('span'));
    template('Recursive', renders('Recursive'));
    template('Rows', renders('span'), ", parts: ['Row']");
    template('EmptyRoot', renders('span'), ', parts: []');
    for (const name of ['Fixtured', 'HiddenFixtured']) {
      template(name, renders('span'));
      template(`${name}Demo`, renders(name));
    }
    for (const name of [
      'Shared',
      'Once',
      'Recursive',
      'Dynamic',
      'Member',
      'ManualPart',
      'ManualFixtured',
      'CrossScoped',
      'Slotted',
      'Rows',
      'EmptyRoot',
      'Fixtured',
      'HiddenFixtured',
    ])
      put(
        `preview/stories/${name}.story.ts`,
        'export default { standalone: false };\n'
      );
    for (const host of ['First', 'Second'])
      put(
        `preview/stories/${host}.story.ts`,
        "export default { slots: { default: { kind: 'element', component: 'Slotted' } } };\n"
      );
    put(
      'preview/stories/FixturedDemo.story.ts',
      "export default { label: 'Fixtured' };\n"
    );
    put(
      'preview/stories/HiddenFixturedDemo.story.ts',
      "export default { label: 'HiddenFixtured', unlisted: true };\n"
    );
    // A hand-written story stands in for a template component; a hand-written
    // component flagged by its story file has no template and no renderer.
    put(
      'preview/manual.ts',
      "export default () => [{ name: 'ManualDemo', file: 'drivers/<target>/ManualDemo', props: {} }, { name: 'ManualPart', file: 'drivers/<target>/ManualPart', props: {} }, { name: 'ManualShell', file: 'drivers/<target>/ManualShell', props: {} }, { name: 'ManualShellHeader', file: 'drivers/<target>/ManualShellHeader', props: {} }];\n"
    );
    for (const name of ['ManualShell', 'ManualShellHeader']) {
      put(
        `preview/stories/${name}.story.ts`,
        'export default { standalone: false };\n'
      );
    }
    put(
      'preview/stories/ManualDemo.story.ts',
      "export default { label: 'ManualFixtured' };\n"
    );
    // Another source's story labeled with the name stands in for nothing here.
    put(
      'elsewhere/components/elsewhere.ts',
      "export default { type: 'component', name: 'Elsewhere', children: [{ type: 'element', tag: 'span' }] };\n"
    );
    put(
      'elsewhere/stories/Elsewhere.story.ts',
      "export default { label: 'CrossScoped' };\n"
    );
  });

  afterAll(() => {
    rmSync(partsKitRoot, { recursive: true, force: true });
  });

  it('makes a listed part not standalone without a flag, and warns of a flag no root backs', async () => {
    const { components } = await loadKit(loadPreviewContext(partsKitRoot));
    const standaloneOf = (name: string) =>
      components.find((loaded) => loaded.component.name === name)?.component
        .standalone;
    expect(standaloneOf('Listed')).toBe(false);
    expect(standaloneOf('Root')).toBeUndefined();

    const report = await checkPreview(partsKitRoot);
    expect(report.warnings).toContain(
      "Flagged: its story file sets standalone: false, but no compound lists it in parts, fewer than two templates render it, no story in its source is labeled 'Flagged' and it lists no parts of its own; list it in its root's parts"
    );
    expect(report.warnings.some((line) => line.startsWith('Listed:'))).toBe(
      false
    );
  });

  it('takes a component no one compound owns, not standalone, without a parts listing', async () => {
    const report = await checkPreview(partsKitRoot);
    const warned = (name: string) =>
      report.warnings.some((line) =>
        line.startsWith(`${name}: its story file sets standalone: false`)
      );
    // Rendered by two templates, through a tag, a member tag, a dynamic tag's
    // default or a target's tag override.
    expect(warned('Shared')).toBe(false);
    expect(warned('Dynamic')).toBe(false);
    expect(warned('Member')).toBe(false);
    // A labeled story stands in for it.
    expect(warned('Fixtured')).toBe(false);
    expect(warned('ManualFixtured')).toBe(false);
    // A root with parts of its own.
    expect(warned('Rows')).toBe(false);
  });

  it('makes a part the kit configuration lists for a hand-written root not standalone, with no warning', async () => {
    const { components, parts } = await loadKit(
      loadPreviewContext(partsKitRoot)
    );
    expect(parts.get('ManualShellHeader')).toBe('ManualShell');
    expect(
      components.find((loaded) => loaded.component.name === 'ManualShellHeader')
        ?.component.standalone
    ).toBe(false);

    const report = await checkPreview(partsKitRoot);
    // Neither the part nor its root, which lists parts of its own, warns.
    expect(
      report.warnings.filter((line) => line.startsWith('ManualShell'))
    ).toEqual([]);
  });

  it('still warns of a component one compound could own, not standalone', async () => {
    const report = await checkPreview(partsKitRoot);
    const warned = (name: string) =>
      report.warnings.some((line) =>
        line.startsWith(`${name}: its story file sets standalone: false`)
      );
    // One template renders it.
    expect(warned('Once')).toBe(true);
    // Its own rendering of itself does not count.
    expect(warned('Recursive')).toBe(true);
    // Two story files' slot plans place it, but no template renders it.
    expect(warned('Slotted')).toBe(true);
    // The story labeled with its name is unlisted.
    expect(warned('HiddenFixtured')).toBe(true);
    // Its parts list is empty.
    expect(warned('EmptyRoot')).toBe(true);
    // A hand-written component flagged by its story file.
    expect(warned('ManualPart')).toBe(true);
    // The story labeled with its name is in another source.
    expect(warned('CrossScoped')).toBe(true);
  });
});

describe('checkPreview - what a story file composes and sets', () => {
  const composeKitRoots: string[] = [];

  /** A kit whose Badge forwards native attributes and has a default slot and
   *  an icon slot, whose Panel's props take more than their literals, and
   *  whose second source has no stories directory yet. */
  function composeKit(stories: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'preview-check-compose-'));
    composeKitRoots.push(root);
    const put = (path: string, content: string) => {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), content);
    };
    put(
      'scaffold-ui-kit.json',
      JSON.stringify({
        name: 'kit',
        targets: ['react', 'vue', 'svelte'],
        preview: {
          shell: 'preview/shell.ts',
          sources: [
            {
              id: 'kit',
              label: 'kit',
              order: 0,
              moduleBase: 'kit',
              templatesDirectory: 'src/components',
              storiesDirectory: 'preview/stories',
            },
            {
              id: 'addons',
              label: 'addons',
              order: 1,
              moduleBase: 'addons',
              templatesDirectory: 'src/addons',
              storiesDirectory: 'preview/addon-stories',
            },
          ],
        },
      })
    );
    put('preview/shell.ts', 'export {};\n');
    mkdirSync(join(root, 'src/addons'), { recursive: true });
    put('src/scripts/types.ts', "export type Variant = 'solid' | 'ghost';\n");
    put(
      'src/components/badge.ts',
      `export default {
  type: 'component',
  name: 'Badge',
  props: { tone: { type: "'calm' | 'loud'", default: 'calm' } },
  children: [{ type: 'element', tag: 'span', passthrough: true, children: [{ type: 'slot' }, { type: 'slot', name: 'icon' }] }],
};
`
    );
    put(
      'src/components/panel.ts',
      `export default {
  type: 'component',
  name: 'Panel',
  props: {
    size: { type: "'sm' | 'md' | { base: 'sm'; md: 'lg' }", default: 'sm' },
    tone: { type: "'primary' | 'accent' | (string & {})", default: 'primary' },
    variant: { type: 'Variant', default: 'solid' },
  },
  extensions: { react: { imports: ["import type { Variant } from '../scripts/types';"] } },
  children: [{ type: 'element', tag: 'div', children: [{ type: 'slot' }] }],
};
`
    );
    for (const [name, content] of Object.entries(stories))
      put(`preview/stories/${name}.story.ts`, content);
    return root;
  }

  afterAll(() => {
    for (const root of composeKitRoots)
      rmSync(root, { recursive: true, force: true });
  });

  it('accepts the values a type takes beside its literals, and refuses the rest, the type read as the control reads it', async () => {
    const root = composeKit({
      Panel: `export default {
  defaultProps: { size: { base: 'sm', md: 'lg' } },
  scenarios: [
    { id: 'brand', props: { tone: 'brand-x' } },
    { id: 'wide', props: { size: 'xl' } },
    { id: 'object-tone', props: { tone: { base: 'primary' } } },
    { id: 'ghost', props: { variant: 'ghost' } },
    { id: 'outline', props: { variant: 'outline' } },
  ],
};
`,
    });
    expect((await checkPreview(root)).errors).toEqual([
      "Panel: scenario 'wide' sets size to 'xl', not one of 'sm', 'md' or a structured value",
      "Panel: scenario 'object-tone' sets tone to {\"base\":\"primary\"}, not one of 'primary', 'accent' or any string",
      "Panel: scenario 'outline' sets variant to 'outline', not one of 'solid', 'ghost'",
    ]);
  });

  it('reports a key a story file does not take, saying what to use where it can', async () => {
    const root = composeKit({
      Badge: `export default { partial: true };
`,
      Panel: `export default { scenario: [] };
`,
    });
    expect((await checkPreview(root)).errors).toEqual([
      "Badge: story sets unknown key 'partial' - use standalone: false",
      "Panel: story sets unknown key 'scenario' - a story sets omit, standalone, unlisted, category, label, defaultProps, controls, fixed, generate, slots, around, scenarios, options",
    ]);
  });

  it('says a story-level description belongs on the template', async () => {
    const root = composeKit({
      Badge: `export default { description: 'A badge.' };
`,
    });
    expect((await checkPreview(root)).errors).toEqual([
      "Badge: story sets unknown key 'description' - use description on the template",
    ]);
  });

  it('accepts children and a forwarded attribute under fixed, as under defaultProps', async () => {
    const root = composeKit({
      Badge: `export default {
  fixed: { children: 'Save', 'aria-label': 'save', nope: true },
};
`,
    });
    expect((await checkPreview(root)).errors).toEqual([
      "Badge: fixed sets unknown prop 'nope'",
    ]);
  });

  it("checks the components a fill composes, at every depth, against what each declares", async () => {
    const root = composeKit({
      Panel: `export default {
  slots: {
    default: {
      kind: 'element',
      component: 'Badge',
      props: { tonne: 'calm', title: 'a native attribute', children: 'text' },
      slots: { badge: { kind: 'text', value: 'x' } },
      children: { kind: 'fragment', children: [
        { kind: 'html', tag: 'em', children: { kind: 'element', component: 'Badge', props: { className: 'x' } } },
      ] },
    },
  },
  around: { after: { kind: 'element', component: 'Badge', props: { tone: 'loud' }, slots: { icon: { kind: 'text', value: '!' } } } },
};
`,
    });
    expect((await checkPreview(root)).errors).toEqual([
      "Panel: slots.default gives Badge unknown prop 'tonne'",
      "Panel: slots.default fills named slot 'badge' of Badge, which it lacks",
      "Panel: slots.default gives Badge unknown prop 'className'; a story spells native attributes as HTML does: 'class'",
    ]);
  });

  it('reads a source whose stories directory does not exist as one with no story files', async () => {
    const root = composeKit({});
    const report = await checkPreview(root);
    expect(report.errors).toEqual([]);
  });
});
