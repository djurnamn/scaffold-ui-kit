// Regression tests for the React scratch emitter's slot translation. Named slots
// map to React *props* (prop position), so their fill must be a bare JSX
// expression - a text fill is a plain string literal, NOT the brace-wrapped
// children form (which produced the invalid `description={{"..."}}` double-brace
// that broke PageHeader-with-text in the preview editor, 2026-07-01).

import { describe, expect, it } from 'vitest';
import { transpileModule, JsxEmit, ScriptTarget } from 'typescript';
import { emitReactRegistry } from '../src/emit/react';
import { reactSource } from '../src/emit/source';
import type { SlotFill, ResolvedStory } from '../src/lib/types';

/** The syntax errors TypeScript reports for a JSX module. */
function syntaxErrors(source: string): string[] {
  const { diagnostics } = transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: { jsx: JsxEmit.Preserve, target: ScriptTarget.ES2020 },
  });
  return (diagnostics ?? []).map((diagnostic) =>
    typeof diagnostic.messageText === 'string' ? diagnostic.messageText : diagnostic.messageText.messageText,
  );
}

// Every component in these fixtures is core, so it imports from kit/<target>.
const kit = (_name: string, target: string) => `kit/${target}`;

function model(over: Partial<ResolvedStory>): ResolvedStory {
  return {
    name: 'PageHeader',
    title: 'scratch',
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

describe('emitReactRegistry - named slot as prop', () => {
  it('emits a text-filled named slot as a bare string literal (no double brace)', () => {
    const out = emitReactRegistry(
      [model({ slots: { named: { description: { kind: 'text', value: 'The text content' } } } })],
      kit,
    );
    expect(out).toContain('description={"The text content"}');
    expect(out).not.toContain('description={{');
  });

  it('emits an element-filled named slot as a JSX element expression', () => {
    const fill: SlotFill = { kind: 'element', component: 'TextLink', children: { kind: 'text', value: 'Go' } };
    const out = emitReactRegistry(
      [model({ slotComponents: ['TextLink'], slots: { named: { trigger: fill } } })],
      kit,
    );
    expect(out).toContain('trigger={<TextLink>{"Go"}</TextLink>}');
  });

  it('holds a raw fill of sibling roots, or of text, in a fragment, which the module then transpiles', () => {
    const siblings: SlotFill = { kind: 'raw', react: '<i>a</i><i>b</i>', vue: '', svelte: '' };
    const text: SlotFill = { kind: 'raw', react: 'plain {name}', vue: '', svelte: '' };
    const single: SlotFill = { kind: 'raw', react: '<i>a</i>', vue: '', svelte: '' };
    const registry = emitReactRegistry(
      [model({ slots: { named: { footer: siblings, header: text, aside: single } } })],
      kit,
    );
    expect(registry).toContain('footer={<><i>a</i><i>b</i></>}');
    expect(registry).toContain('header={<>plain {name}</>}');
    expect(registry).toContain('aside={<i>a</i>}');
    expect(syntaxErrors(registry)).toEqual([]);
    expect(syntaxErrors(registry.replace('footer={<><i>a</i><i>b</i></>}', 'footer={<i>a</i><i>b</i>}'))).toEqual([
      'JSX expressions must have one parent element.',
    ]);
    // The printed React source holds the same rule.
    const source = reactSource({
      component: 'PageHeader',
      props: {},
      named: { footer: siblings, aside: single },
      imports: new Map([['PageHeader', { module: 'kit/react', exported: 'PageHeader' }]]),
    });
    expect(source).toContain('<PageHeader footer={<><i>a</i><i>b</i></>} aside={<i>a</i>} />');
    expect(syntaxErrors(source)).toEqual([]);
  });

  it('wraps a multi-child fragment named slot in a fragment expression', () => {
    const fill: SlotFill = {
      kind: 'fragment',
      children: [
        { kind: 'text', value: 'a' },
        { kind: 'text', value: 'b' },
      ],
    };
    const out = emitReactRegistry([model({ slots: { named: { label: fill } } })], kit);
    expect(out).toContain('label={<>{"a"}{"b"}</>}');
  });

  it('still uses children position (brace-wrapped) for the default slot', () => {
    const out = emitReactRegistry([model({ slots: { default: { kind: 'text', value: 'Body' } } })], kit);
    expect(out).toContain('>\n      {"Body"}\n    </PageHeader>');
  });
});

describe("emitReactRegistry - a component's attributes", () => {
  const trigger: SlotFill = {
    kind: 'element',
    component: 'MenuTrigger',
    props: { class: 'px-2', tabindex: 0, style: 'padding-inline: 1ch; --gap: 2px' },
  };
  const menu = model({ name: 'Menu', slotComponents: ['MenuTrigger'], slots: { default: trigger } });

  it('spells the attributes a fill gives a component as React takes them', () => {
    const out = emitReactRegistry([menu], kit);
    expect(out).toContain(
      '<MenuTrigger className={"px-2"} tabIndex={0} style={{ "paddingInline": "1ch", "--gap": "2px" }}></MenuTrigger>',
    );
    // The root's live props are the pane's to spell, with what the registry exports.
    expect(out).toContain('<Menu {...props}>');
    expect(out).toContain('export const reactAttributeNames: Record<string, string> = {');
    expect(out).toContain('"tabindex":"tabIndex"');
    expect(out).toContain('"for":"htmlFor"');
    expect(out).toContain('export const declaredAttributes: Record<string, string[]> = {};');
  });

  it("spells an html element's attributes as React takes them", () => {
    const label: SlotFill = { kind: 'html', tag: 'label', props: { for: 'width', class: 'note', tabindex: 0 }, children: { kind: 'text', value: 'Width' } };
    const out = emitReactRegistry([model({ name: 'Menu', slots: { default: label } })], kit);
    expect(out).toContain('<label htmlFor={"width"} className={"note"} tabIndex={0}>{"Width"}</label>');
  });

  it('keeps a name the component declares as a prop of its own', () => {
    const out = emitReactRegistry([menu], kit, (name) => name, (name) =>
      name === 'MenuTrigger' ? ['class', 'tabindex'] : name === 'Menu' ? ['for'] : [],
    );
    expect(out).toContain('<MenuTrigger class={"px-2"} tabindex={0} style={{ "paddingInline": "1ch", "--gap": "2px" }}></MenuTrigger>');
    expect(out).toContain('export const declaredAttributes: Record<string, string[]> = {"scratch":["for"]};');
  });
});
