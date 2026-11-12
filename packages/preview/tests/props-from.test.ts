// A manual component's props are read from its React props type without a type
// checker: own members of an interface or object type, or of each object operand
// of an intersection, with type aliases resolved across files - through a
// relative import, a barrel's re-export, a tsconfig path, or the kit's own
// package name - so a union stays a select instead of an opaque, hidden prop.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EnumeratedComponent } from '../src/lib/types';
import { resolveStory } from '../src/model';
import { readPropsFrom, resolveManualComponent } from '../src/props-from';

let kitRoot: string;
const write = (path: string, content: string): void => {
  mkdirSync(dirname(join(kitRoot, path)), { recursive: true });
  writeFileSync(join(kitRoot, path), content);
};

beforeAll(() => {
  kitRoot = mkdtempSync(join(tmpdir(), 'preview-props-from-'));
  write(
    'package.json',
    JSON.stringify({ name: '@acme/kit', type: 'module', exports: { './scripts': './src/scripts/index.ts' } }),
  );
  write(
    'tsconfig.json',
    JSON.stringify({ compilerOptions: { moduleResolution: 'bundler', module: 'esnext', paths: { '#tokens': ['./src/tokens.ts'] } } }),
  );
  write('src/scripts/orientation.ts', "export type Orientation = 'horizontal' | 'vertical';\n");
  write('src/scripts/index.ts', "export * from './orientation';\nexport { type Size as SizeName } from './size';\n");
  write('src/scripts/size.ts', "export type Size = 'small' | 'large';\n");
  write('src/tokens.ts', "export type ColorToken = `accent-${string}` | 'backdrop';\n");
  write('src/drivers/align.ts', "export type Align = 'start' | 'end';\n");
  write(
    'src/drivers/Toolbar.tsx',
    [
      "import type { Orientation, SizeName } from '@acme/kit/scripts';",
      "import type { ColorToken } from '#tokens';",
      "import type { Align } from './align';",
      'export interface ToolbarProps {',
      '  orientation?: Orientation;',
      '  size: SizeName;',
      '  align?: Align;',
      '  color?: ColorToken;',
      '  label?: string;',
      '}',
      '',
    ].join('\n'),
  );
  write(
    'src/drivers/Textarea.tsx',
    [
      "import type { ComponentProps } from 'react';",
      "import { TextareaVisual } from './TextareaVisual';",
      'type VisualProps = ComponentProps<typeof TextareaVisual>;',
      "type WithoutChange<Props> = Props extends unknown ? Omit<Props, 'onChange'> : never;",
      'export type TextareaProps = WithoutChange<VisualProps> & {',
      '  autosize?: boolean;',
      '  onChange?: (value: string) => void;',
      '};',
      '',
    ].join('\n'),
  );
  write(
    'src/drivers/NativeCheckbox.tsx',
    [
      "import type { InputHTMLAttributes } from 'react';",
      'interface NativeCheckboxBaseProps {',
      '  label?: string;',
      '  error?: boolean;',
      '}',
      "export type NativeCheckboxProps = NativeCheckboxBaseProps &",
      "  Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> & {",
      '    checked?: boolean;',
      "    tone?: 'plain' | 'strong';",
      '    error?: string;',
      '  };',
      '',
    ].join('\n'),
  );
});

afterAll(() => rmSync(kitRoot, { recursive: true, force: true }));

describe('readPropsFrom', () => {
  it('resolves union aliases imported by relative path, package name, re-export and tsconfig path', () => {
    const read = readPropsFrom('src/drivers/Toolbar.tsx#ToolbarProps', kitRoot);
    expect(read.props.orientation.type).toBe("'horizontal' | 'vertical'");
    expect(read.props.size).toEqual({ type: "'small' | 'large'", required: true });
    expect(read.props.align.type).toBe("'start' | 'end'");
    expect(read.props.color.type).toBe("`accent-${string}` | 'backdrop'");
    expect(read.hiddenProps).not.toContain('orientation');
  });

  it("reads each object operand of an intersection, a later operand winning a shared name", () => {
    const read = readPropsFrom('src/drivers/NativeCheckbox.tsx#NativeCheckboxProps', kitRoot);
    expect(Object.keys(read.props)).toEqual(['label', 'error', 'checked', 'tone']);
    expect(read.props.error.type).toBe('string');
    expect(read.props.tone.type).toBe("'plain' | 'strong'");
  });

  it('still fails for a name that is not an object type', () => {
    write('src/drivers/Plain.tsx', 'export type PlainProps = Partial<Record<string, string>>;\n');
    expect(() => readPropsFrom('src/drivers/Plain.tsx#PlainProps', kitRoot)).toThrow(/no interface or object type/);
  });
});

describe('readPropsFrom - props built on a template component', () => {
  // A template component as the enumerator reads it: a union-typed surface on
  // `nonInteractive`, with its own `onChange` and a default slot.
  const textareaVisual: EnumeratedComponent = {
    name: 'TextareaVisual',
    file: 'src/components/textarea-visual.ts',
    props: {
      value: { type: 'string | number' },
      placeholder: { type: 'string' },
      radius: { type: "'small' | 'large'" },
      nonInteractive: { type: 'boolean' },
      onChange: { type: 'FormEventHandler<HTMLTextAreaElement>' },
    },
    hasDefaultSlot: true,
    slotNames: [],
  };

  it("reads ComponentProps<typeof X> as X's template props, through a generic alias, a distributive conditional and an Omit", () => {
    const read = readPropsFrom('src/drivers/Textarea.tsx#TextareaProps', kitRoot, [textareaVisual]);
    expect(read.memberNames).toEqual(['value', 'placeholder', 'radius', 'nonInteractive', 'children', 'autosize', 'onChange']);
    expect(read.props.nonInteractive).toEqual({ type: 'boolean' });
    expect(read.props.autosize.type).toBe('boolean');
    // The driver's own onChange replaces the template's, which the Omit removed.
    expect(read.props.onChange.type).toBe('(value: string) => void');
    expect(read.hasChildren).toBe(true);
    expect(read.hiddenProps).toEqual(['onChange']);
  });

  it('reads only the driver\'s own members when no template has the name', () => {
    const read = readPropsFrom('src/drivers/Textarea.tsx#TextareaProps', kitRoot);
    expect(read.memberNames).toEqual(['autosize', 'onChange']);
  });

  it('reads React.ComponentProps and an Omit of an object type directly', () => {
    write(
      'src/drivers/Direct.tsx',
      [
        "import type * as React from 'react';",
        "export type DirectProps = Omit<React.ComponentPropsWithRef<typeof TextareaVisual>, 'value' | 'children'> &",
        "  Omit<{ tone?: 'plain' | 'strong'; hidden?: boolean }, 'hidden'>;",
        '',
      ].join('\n'),
    );
    const read = readPropsFrom('src/drivers/Direct.tsx#DirectProps', kitRoot, [textareaVisual]);
    expect(read.memberNames).toEqual(['placeholder', 'radius', 'nonInteractive', 'onChange', 'tone']);
    expect(read.hasChildren).toBe(false);
  });

  it('reads nothing from a conditional that may not hold', () => {
    write(
      'src/drivers/Conditional.tsx',
      [
        'type OnlyStrings<Props> = Props extends string ? { label: Props } : never;',
        'export type ConditionalProps = OnlyStrings<string> & { size?: number };',
        '',
      ].join('\n'),
    );
    const read = readPropsFrom('src/drivers/Conditional.tsx#ConditionalProps', kitRoot);
    expect(read.memberNames).toEqual(['size']);
  });

  it('passes the templates through resolveManualComponent', () => {
    const component = resolveManualComponent(
      { name: 'Textarea', file: 'src/drivers/Textarea.tsx', propsFrom: 'src/drivers/Textarea.tsx#TextareaProps' },
      kitRoot,
      [textareaVisual],
    );
    expect(Object.keys(component.props)).toEqual(['value', 'placeholder', 'radius', 'nonInteractive', 'autosize', 'onChange']);
    expect(component.hasDefaultSlot).toBe(true);
    expect('defaultSlotScoped' in component).toBe(false);
  });

  it("carries a template's scoped default slot through ComponentProps, and a hand-written specification's", () => {
    const scoped = { ...textareaVisual, defaultSlotScoped: true };
    const read = readPropsFrom('src/drivers/Textarea.tsx#TextareaProps', kitRoot, [scoped]);
    expect(read.hasChildren).toBe(true);
    expect(read.childrenScoped).toBe(true);
    const component = resolveManualComponent(
      { name: 'Textarea', file: 'src/drivers/Textarea.tsx', propsFrom: 'src/drivers/Textarea.tsx#TextareaProps' },
      kitRoot,
      [scoped],
    );
    expect(component.defaultSlotScoped).toBe(true);
    const handWritten = resolveManualComponent(
      { name: 'Picker', file: 'src/drivers/Picker.tsx', props: {}, hasDefaultSlot: true, defaultSlotScoped: true },
      kitRoot,
    );
    expect(handWritten.defaultSlotScoped).toBe(true);
  });
});

describe('controls from resolved types', () => {
  it('gives a resolved union a select and a color-token prop the color select', () => {
    const component = resolveManualComponent(
      { name: 'Toolbar', file: 'src/drivers/Toolbar.tsx', propsFrom: 'src/drivers/Toolbar.tsx#ToolbarProps' },
      kitRoot,
    );
    const story = resolveStory(component, undefined, { colorTokens: [undefined, 'accent-blue', 'backdrop'] });
    const control = (name: string) => story.propTypes.find((propType) => propType.name === name);
    expect(control('orientation')).toMatchObject({ control: 'select', include: true });
    expect(control('color')).toMatchObject({ control: 'color-select', include: true });
  });

  it('treats a color prop by its declared type when the kit gives no color tokens', () => {
    const component = resolveManualComponent(
      { name: 'Toolbar', file: 'src/drivers/Toolbar.tsx', propsFrom: 'src/drivers/Toolbar.tsx#ToolbarProps' },
      kitRoot,
    );
    const story = resolveStory(component, undefined, {});
    const color = story.propTypes.find((propType) => propType.name === 'color');
    expect(color?.control).not.toBe('color-select');
  });
});
