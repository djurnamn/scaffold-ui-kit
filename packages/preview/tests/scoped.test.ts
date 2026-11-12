// Regression tests for the `scoped` slot fill - the cross-framework render-prop the
// Repeater's editable cells use. The same scoped slot is a React *prop* (a render-prop
// arrow), a Vue *scoped slot* (`#name="{ parameters }"`), and a Svelte *snippet*
// (`{#snippet name({ parameters })}`), with a per-target `slot` name that differs from the
// map key. An empty target body omits that target's slot.
//
// Vue and Svelte always destructure `parameters` off one scope object; React takes
// either shape, so `reactScope` says which. The default is the single scope
// object a generated component's scoped slot supplies; `positional` is the
// hand-written driver prop whose React side really takes separate parameters.
// Getting it wrong is silent - both shapes compile, and the wrong one binds the
// whole scope to the first name.

import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { emitReactRegistry } from '../src/emit/react';
import { emitVueRegistry } from '../src/emit/vue';
import { emitSvelteWrapper } from '../src/emit/svelte';
import type { SlotFill, ResolvedStory } from '../src/lib/types';

const kit = (_name: string, target: string) => `kit/${target}`;

function model(over: Partial<ResolvedStory>): ResolvedStory {
  return {
    name: 'Repeater',
    title: 'Components/Form/Repeater',
    omit: false,
    standalone: true,
    unlisted: false,
    propTypes: [],
    defaultProps: {},
    scenarios: [],
    slotComponents: ['TextInput'],
    contentSlots: { default: false, named: [] },
    targets: ['react', 'vue', 'svelte'],
    ...over,
  };
}

const scoped = (over: Partial<Extract<SlotFill, { kind: 'scoped'; parameters: string[] }>> = {}): SlotFill => ({
  kind: 'scoped',
  slot: { react: 'renderCell', vue: 'cell', svelte: 'cell' },
  parameters: ['column', 'row', 'setField'],
  react: '<TextInput value={row.name} />',
  vue: '<TextInput :value="row.name" />',
  svelte: '<TextInput value={row.name} />',
  imports: ['TextInput'],
  ...over,
});

describe('scoped slot fill - per-target slot', () => {
  it('React: a render-prop arrow named by slot.react (not the map key), destructuring one scope object', () => {
    const out = emitReactRegistry([model({ slots: { named: { renderCell: scoped() } } })], kit);
    expect(out).toContain(
      'renderCell={({ column, row, setField }) => (<TextInput value={row.name} />)}',
    );
  });

  it('React: `positional` keeps the separate-parameters arrow head', () => {
    const fill = scoped({ reactScope: 'positional' });
    const out = emitReactRegistry([model({ slots: { named: { renderCell: fill } } })], kit);
    expect(out).toContain(
      'renderCell={(column, row, setField) => (<TextInput value={row.name} />)}',
    );
  });

  it('the React shape leaves Vue and Svelte emission untouched', () => {
    for (const reactScope of ['object', 'positional'] as const) {
      const fill = scoped({ reactScope });
      const vue = emitVueRegistry([model({ slots: { named: { renderCell: fill } } })], kit);
      const wrapper = emitSvelteWrapper(model({ slots: { named: { renderCell: fill } } }), kit);
      expect(vue).toContain('{ column, row, setField }');
      expect(wrapper.source).toContain('{#snippet cell({ column, row, setField })}');
    }
  });

  // The shape an engine-generated scoped slot needs: its React render prop is
  // called with a single object, so a lone binding name must destructure rather
  // than swallow the whole scope (which is what made the miss invisible - the
  // body simply reached one level too shallow).
  it('React: a single-binding scope destructures instead of binding the whole object', () => {
    const trigger = scoped({
      slot: { react: 'trigger', vue: 'trigger', svelte: 'trigger' },
      parameters: ['triggerProps'],
      react: '<Button {...triggerProps} label="Actions" />',
      vue: '<Button v-bind="triggerProps" label="Actions" />',
      svelte: '<Button {...triggerProps} label="Actions" />',
      imports: ['Button'],
    });
    const out = emitReactRegistry(
      [model({ slotComponents: ['Button'], slots: { named: { trigger } } })],
      kit,
    );
    expect(out).toContain(
      'trigger={({ triggerProps }) => (<Button {...triggerProps} label="Actions" />)}',
    );
  });

  it('Vue: a scoped `<template>` named by slot.vue, binding the destructured scope', () => {
    const out = emitVueRegistry([model({ slots: { named: { renderCell: scoped() } } })], kit);
    // The template rides the registry as a JSON string literal (quotes escaped), so
    // assert on the quote-free fragments: the per-target slot name and the scope bind.
    expect(out).toContain('#cell=');
    expect(out).toContain('{ column, row, setField }');
    expect(out).toContain('<TextInput :value=');
  });

  it('Svelte: a snippet named by slot.svelte, destructuring the scope', () => {
    const wrapper = emitSvelteWrapper(model({ slots: { named: { renderCell: scoped() } } }), kit);
    expect(wrapper.source).toContain('{#snippet cell({ column, row, setField })}<TextInput value={row.name} />{/snippet}');
  });

  it('an empty target body omits that target slot only', () => {
    const svelteOff = scoped({ svelte: '' });
    const wrapper = emitSvelteWrapper(model({ slots: { named: { renderCell: svelteOff } } }), kit);
    expect(wrapper.source).not.toContain('{#snippet');
    // React/Vue still emit from the same fill.
    const react = emitReactRegistry([model({ slots: { named: { renderCell: svelteOff } } })], kit);
    expect(react).toContain('renderCell={({ column, row, setField }) =>');
  });
});

describe('scoped slot fill - default slot', () => {
  const children = scoped({
    slot: { react: 'children', vue: 'default', svelte: 'children' },
    parameters: ['item'],
    react: '<span>{item}</span>',
    vue: '<span>{{ item }}</span>',
    svelte: '<span>{item}</span>',
    imports: [],
  });
  const list = model({ name: 'List', slots: { default: children } });

  it('React: the function child', () => {
    expect(emitReactRegistry([list], kit)).toContain('{({ item }) => (<span>{item}</span>)}');
  });

  it('Vue: a #default template binding the scope', () => {
    // The registry holds each template as a JSON string.
    expect(emitVueRegistry([list], kit)).toContain(
      JSON.stringify('<template #default="{ item }"><span>{{ item }}</span></template>').slice(1, -1),
    );
  });

  it('Svelte: the children snippet', () => {
    expect(emitSvelteWrapper(list, kit).source).toContain('{#snippet children({ item })}<span>{item}</span>{/snippet}');
  });
});

describe('scoped slot fill - several root nodes', () => {
  // Sibling roots are no arrow body: the React registry wraps them in a
  // fragment, and Vue and Svelte take them as they are.
  const siblings = scoped({
    react: '<TextInput value={row.name} /><TextInput value={row.email} />',
    vue: '<TextInput :value="row.name" /><TextInput :value="row.email" />',
    svelte: '<TextInput value={row.name} /><TextInput value={row.email} />',
  });

  /** The syntax errors a TSX module has. */
  function syntaxErrors(source: string): unknown[] {
    const parsed = ts.createSourceFile('registry.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    return (parsed as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics;
  }

  it('React: a render-prop arrow returning a fragment, in a registry that parses', () => {
    const out = emitReactRegistry([model({ slots: { named: { renderCell: siblings } } })], kit);
    expect(out).toContain(
      'renderCell={({ column, row, setField }) => (<><TextInput value={row.name} /><TextInput value={row.email} /></>)}',
    );
    expect(syntaxErrors(out)).toEqual([]);
  });

  it('React: the default slot function child returns a fragment too', () => {
    const fill = { ...siblings, slot: { react: 'children', vue: 'default', svelte: 'children' } } as SlotFill;
    const out = emitReactRegistry([model({ slots: { default: fill } })], kit);
    expect(out).toContain('{({ column, row, setField }) => (<><TextInput value={row.name} /><TextInput value={row.email} /></>)}');
    expect(syntaxErrors(out)).toEqual([]);
  });

  it('React: a part body of sibling roots returns a fragment', () => {
    const part: SlotFill = {
      kind: 'part',
      name: 'Pair',
      parameters: ['row'],
      props: { row: { name: 'a' } },
      react: '<TextInput value={row.name} /><TextInput value={row.name} />',
      vue: '<TextInput :value="row.name" /><TextInput :value="row.name" />',
      svelte: '<TextInput value={row.name} /><TextInput value={row.name} />',
    };
    const out = emitReactRegistry([model({ slots: { default: part } })], kit);
    expect(out).toContain('return (<><TextInput value={row.name} /><TextInput value={row.name} /></>);');
    expect(syntaxErrors(out)).toEqual([]);
  });

  it('React: text, alone or beside an element, returns a fragment', () => {
    for (const [react, expected] of [
      ['{row.name}', '(<>{row.name}</>)'],
      ['name {row.name} <TextInput value={row.name} />', '(<>name {row.name} <TextInput value={row.name} /></>)'],
    ]) {
      const out = emitReactRegistry([model({ slots: { named: { renderCell: scoped({ react }) } } })], kit);
      expect(out).toContain(`renderCell={({ column, row, setField }) => ${expected}}`);
      expect(syntaxErrors(out)).toEqual([]);
    }
  });

  it('React: a part body of text returns a fragment', () => {
    const part: SlotFill = {
      kind: 'part',
      name: 'Label',
      parameters: ['row'],
      props: { row: { name: 'a' } },
      react: '{row.name}',
      vue: '{{ row.name }}',
      svelte: '{row.name}',
    };
    const out = emitReactRegistry([model({ slots: { default: part } })], kit);
    expect(out).toContain('return (<>{row.name}</>);');
    expect(syntaxErrors(out)).toEqual([]);
  });

  it('a single root stays as it is', () => {
    const out = emitReactRegistry([model({ slots: { named: { renderCell: scoped() } } })], kit);
    expect(out).not.toContain('<>');
  });

  it('Vue and Svelte keep the siblings bare', () => {
    const story = model({ slots: { named: { renderCell: siblings } } });
    expect(emitVueRegistry([story], kit)).not.toContain('<>');
    expect(emitSvelteWrapper(story, kit).source).toContain(
      '{#snippet cell({ column, row, setField })}<TextInput value={row.name} /><TextInput value={row.email} />{/snippet}',
    );
  });
});
