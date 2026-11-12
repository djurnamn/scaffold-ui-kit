// A template's props as the preview reads them: the component's shared props,
// for a discriminated surface root the props its branches declare, merged
// across the branches, and a prop typed by a named type expanded through the
// template's imports.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enumerateComponents } from '../src/enumerate';
import { propTypeForProp } from '../src/prop-types';

let directory: string;
const templates: Record<string, unknown> = {
  'input-visual.ts': {
    name: 'InputVisual',
    props: { value: { type: 'string' }, size: { type: 'number' } },
    children: [
      {
        type: 'conditional',
        conditions: [
          {
            statement: 'if',
            condition: 'nonInteractive',
            props: {
              nonInteractive: {
                type: 'true',
                required: true,
                description: 'Renders an inert look-alike.',
              },
              label: { type: 'string', required: true },
            },
            children: [{ type: 'element', tag: 'div', passthrough: true }],
          },
          {
            statement: 'else',
            props: {
              nonInteractive: { type: 'false' },
              label: { type: 'string', required: true },
              size: { type: "'small' | 'large'" },
            },
            children: [{ type: 'element', tag: 'input', passthrough: true }],
          },
        ],
      },
    ],
  },
  'stack.ts': {
    name: 'Stack',
    props: {
      direction: { type: 'Responsive<StackDirection>' },
      align: { type: 'StackAlign' },
      gap: { type: 'string' },
      frame: { type: 'Frame' },
    },
    extensions: {
      react: {
        imports: [
          "import { stackStyle } from '../scripts/layout';",
          "import type { Frame, Responsive, StackAlign, StackDirection } from '../scripts/layout';",
        ],
      },
      vue: {
        imports: ["import type { Frame, Responsive, StackAlign, StackDirection } from '../scripts/layout';"],
      },
    },
    children: [{ type: 'element', tag: 'div' }],
  },
  'popover.ts': {
    name: 'Popover',
    children: [
      {
        type: 'element',
        tag: 'div',
        children: [
          { type: 'slot', name: 'trigger', exposes: { triggerProps: 'triggerProps' }, scopeRequired: true },
          { type: 'slot', exposes: { close: 'close' }, scopeRequired: true },
          // Without values to take, the key requires nothing.
          { type: 'slot', name: 'icon', scopeRequired: true },
        ],
      },
    ],
  },
  'radio-group.ts': {
    name: 'RadioGroup',
    props: { options: { type: 'string[]' } },
    children: [
      {
        type: 'element',
        tag: 'div',
        children: [
          {
            type: 'slot',
            exposes: { option: { value: 'option', type: 'string' } },
            fallback: [{ type: 'text', content: 'Fallback' }],
          },
        ],
      },
    ],
  },
  'listbox.ts': {
    name: 'Listbox',
    rest: { tag: 'ul' },
    children: [
      {
        type: 'element',
        tag: 'ul',
        attributes: { $spread: { $expression: 'rest' }, role: 'listbox' },
        children: [{ type: 'slot' }],
      },
    ],
  },
  // Templates in each form the kit's build reads, and one named from its
  // file as the build names it.
  'tag.json': { name: 'Tag', props: {}, children: [{ type: 'element', tag: 'span' }] },
  'chip.js': { name: 'Chip', props: {}, children: [{ type: 'element', tag: 'span' }] },
  'pill.mjs': { name: 'Pill', props: {}, children: [{ type: 'element', tag: 'span' }] },
  'crumb.cjs': { name: 'Crumb', props: {}, children: [{ type: 'element', tag: 'span' }] },
  'theme.toggle.ts': { props: {}, children: [{ type: 'element', tag: 'button' }] },
  'types.d.ts': { name: 'Types', props: {}, children: [] },
  'badge.ts': {
    name: 'Badge',
    description: 'A short label, set beside a heading.',
    props: { tone: { type: "'plain' | 'strong'" } },
    children: [
      {
        type: 'conditional',
        conditions: [
          { statement: 'if', condition: 'tone', children: [{ type: 'element', tag: 'span' }] },
        ],
      },
      { type: 'slot' },
    ],
  },
};

beforeAll(() => {
  const root = mkdtempSync(join(tmpdir(), 'preview-enumerate-'));
  directory = join(root, 'components');
  mkdirSync(directory, { recursive: true });
  mkdirSync(join(root, 'scripts'));
  writeFileSync(
    join(root, 'scripts', 'layout.ts'),
    [
      "export type StackDirection = 'row' | 'column';",
      "export type StackAlign = 'start' | 'center' | 'end';",
      'export type Responsive<T> = T | ReadonlyArray<{ value: T; from?: string }>;',
      'export interface Frame { inset: string }',
      'export function stackStyle(): void {}',
      '',
    ].join('\n'),
  );
  for (const file of Object.keys(templates)) writeFileSync(join(directory, file), '');
});

afterAll(() => rmSync(join(directory, '..'), { recursive: true, force: true }));

const importModule = async (path: string) => ({ default: templates[basename(path)] });

describe('enumerateComponents', () => {
  it("reads every template file the kit's build reads, named as the build names it, and no declaration file", async () => {
    const names = (await enumerateComponents(directory, importModule)).map((component) => component.name);
    expect(names).toEqual(expect.arrayContaining(['Tag', 'Chip', 'Pill', 'Crumb', 'ThemeToggle', 'Badge']));
    expect(names).not.toContain('Types');
    expect(names).not.toContain('Theme.toggle');
  });

  it("reads a discriminated root's branch props, merged across the branches", async () => {
    const components = await enumerateComponents(directory, importModule);
    const input = components.find((component) => component.name === 'InputVisual');
    expect(input?.props).toEqual({
      value: { type: 'string' },
      // A shared prop keeps its own definition over a branch's.
      size: { type: 'number' },
      nonInteractive: { type: 'boolean', description: 'Renders an inert look-alike.' },
      label: { type: 'string', required: true },
    });
  });

  it("expands a named type through the template's imports, keeping the type as written", async () => {
    const components = await enumerateComponents(directory, importModule);
    const stack = components.find((component) => component.name === 'Stack');
    expect(stack?.props.direction).toEqual({
      type: 'Responsive<StackDirection>',
      resolvedType: "'row' | 'column' | ReadonlyArray<{ value: T; from?: string }>",
    });
    expect(stack?.props.align).toEqual({ type: 'StackAlign', resolvedType: "'start' | 'center' | 'end'" });
    expect(stack?.props.gap).toEqual({ type: 'string' });
    expect(stack?.props.frame).toEqual({ type: 'Frame', resolvedType: '{}' });
    const direction = propTypeForProp('Stack', 'direction', stack!.props.direction);
    expect(direction).toMatchObject({ control: 'select', options: [undefined, 'row', 'column'], include: true });
    expect(propTypeForProp('Stack', 'frame', stack!.props.frame).include).toBe(false);
  });

  it('reads only the shared props when the root is not a single conditional', async () => {
    const components = await enumerateComponents(directory, importModule);
    const badge = components.find((component) => component.name === 'Badge');
    expect(badge?.props).toEqual({ tone: { type: "'plain' | 'strong'" } });
    expect(badge?.hasDefaultSlot).toBe(true);
    expect(badge && 'defaultSlotScoped' in badge).toBe(false);
  });

  it('marks a default slot that exposes values as scoped', async () => {
    const components = await enumerateComponents(directory, importModule);
    const radioGroup = components.find((component) => component.name === 'RadioGroup');
    expect(radioGroup?.hasDefaultSlot).toBe(true);
    expect(radioGroup?.defaultSlotScoped).toBe(true);
  });

  it('lists the slots whose content must take their scope, the default slot as default', async () => {
    const components = await enumerateComponents(directory, importModule);
    const popover = components.find((component) => component.name === 'Popover');
    expect(popover?.scopeRequiredSlots).toEqual(['trigger', 'default']);
    const radioGroup = components.find((component) => component.name === 'RadioGroup');
    expect(radioGroup && 'scopeRequiredSlots' in radioGroup).toBe(false);
  });

  it("reads the template's description, and leaves it out for a template without one", async () => {
    const components = await enumerateComponents(directory, importModule);
    const badge = components.find((component) => component.name === 'Badge');
    expect(badge?.description).toBe('A short label, set beside a heading.');
    const stack = components.find((component) => component.name === 'Stack');
    expect(stack && 'description' in stack).toBe(false);
  });

  it("records a template's rest and its tag, and leaves it out for a template without one", async () => {
    const components = await enumerateComponents(directory, importModule);
    const listbox = components.find((component) => component.name === 'Listbox');
    expect(listbox?.rest).toEqual({ tag: 'ul' });
    expect(listbox && 'passthrough' in listbox).toBe(false);
    const stack = components.find((component) => component.name === 'Stack');
    expect(stack && 'rest' in stack).toBe(false);
  });
});
