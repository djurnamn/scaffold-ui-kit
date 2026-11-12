// A story's `around`: content rendered beside its component, as its
// siblings - a hint whose id the component's aria-describedby names.
// Each registry renders it around the component (a fragment in React, the
// template's other roots in Vue, the wrapper's markup in Svelte), each printed
// source prints it as siblings, the html renders it beside the component's
// markup, and the editor carries it outside its root, unchanged through the
// scratch regeneration. The model and the check refuse what has no place
// there.

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { compileTemplate } from 'vue/compiler-sfc';
import { compile as compileSvelte } from 'svelte/compiler';
import { checkPreview } from '../src/check';
import { resolveSourceStory } from '../src/controller/source';
import type { PreviewComponent } from '../src/controller/catalog';
import { seedRoot, toPayload } from '../src/controller/editor-tree';
import { emitReactRegistry } from '../src/emit/react';
import { emitVueRegistry } from '../src/emit/vue';
import { emitSvelteWrapper } from '../src/emit/svelte';
import { htmlSource } from '../src/emit/html-source';
import { writeScratch } from '../src/emit/scratch';
import {
  reactSource,
  svelteSource,
  vueSource,
  type SourceStory,
} from '../src/emit/source';
import { resolveStory } from '../src/model';
import type {
  AroundFill,
  EnumeratedComponent,
  StoryAround,
  ResolvedStory,
} from '../src/lib/types';

const kit = (_name: string, target: string) => `kit/${target}`;

const hint: AroundFill = {
  kind: 'html',
  tag: 'p',
  props: { id: 'agree-hint', class: 'hint' },
  children: { kind: 'text', value: 'You can change this later.' },
};
const heading: AroundFill = {
  kind: 'element',
  component: 'Badge',
  props: { tone: 'calm' },
  children: { kind: 'text', value: 'New' },
};
const around: StoryAround = { before: heading, after: hint };

const checkbox: ResolvedStory = {
  name: 'Checkbox',
  title: 'Components/Checkbox',
  omit: false,
  standalone: true,
  unlisted: false,
  propTypes: [],
  defaultProps: {},
  scenarios: [],
  around,
  slotComponents: ['Badge'],
  contentSlots: { default: false, named: [] },
  targets: ['react', 'vue', 'svelte'],
};

describe('around in the registries', () => {
  it('React: a fragment holding the component between its siblings', () => {
    expect(emitReactRegistry([checkbox], kit)).toContain(
      `  "components-checkbox": (props) => (
    <><Badge tone={"calm"}>{"New"}</Badge><Checkbox {...props}></Checkbox><p id={"agree-hint"} className={"hint"}>{"You can change this later."}</p></>
  ),`
    );
  });

  it('React: an after alone, and no fragment without around', () => {
    const after = emitReactRegistry(
      [{ ...checkbox, around: { after: hint } }],
      kit
    );
    expect(after).toContain('<><Checkbox {...props}></Checkbox><p ');
    const none = emitReactRegistry([{ ...checkbox, around: undefined }], kit);
    expect(none).toContain('    <Checkbox {...props}></Checkbox>\n');
  });

  it("Vue: the siblings as the template's other roots", () => {
    const registry = emitVueRegistry([checkbox], kit);
    const template = `<Badge :tone='"calm"'>New</Badge><Checkbox v-bind="props" /><p :id='"agree-hint"' :class='"hint"'>You can change this later.</p>`;
    expect(registry).toContain(`template: ${JSON.stringify(template)}`);
    expect(
      compileTemplate({ source: template, filename: 'Story.vue', id: 'story' })
        .errors
    ).toEqual([]);
  });

  it("Svelte: the siblings in the wrapper's markup, around the component", () => {
    const { source } = emitSvelteWrapper(checkbox, kit);
    expect(source).toContain('import { Checkbox, Badge }');
    expect(source).toContain(
      '</script>\n\n<Badge tone={"calm"}>New</Badge>\n<Checkbox {...rest} />\n<p id={"agree-hint"} class={"hint"}>You can change this later.</p>\n'
    );
    expect(() =>
      compileSvelte(source, { filename: 'Checkbox.render.svelte', runes: true })
    ).not.toThrow();
  });

  it('declares a part called beside the component', () => {
    const part: AroundFill = {
      kind: 'part',
      name: 'Note',
      parameters: ['text'],
      props: { text: 'hi' },
      react: '<em>{text}</em>',
      vue: '<em>{{ text }}</em>',
      svelte: '<em>{text}</em>',
    };
    const model = { ...checkbox, around: { after: part } };
    expect(emitReactRegistry([model], kit)).toContain(
      'function Note({ text }: Record<string, any>)'
    );
    expect(emitVueRegistry([model], kit)).toContain('Note: { name: "Note"');
    expect(emitSvelteWrapper(model, kit).source).toContain(
      '{#snippet Note({ text }: Record<string, any>)}'
    );
  });
});

const story: SourceStory = {
  component: 'Checkbox',
  props: { 'aria-describedby': 'agree-hint' },
  named: {},
  around: { after: hint },
  imports: new Map([
    ['Checkbox', { module: 'kit/react', exported: 'Checkbox' }],
  ]),
};

describe('around in the printed source', () => {
  it('React returns the component and its siblings in a fragment', () => {
    expect(reactSource(story)).toBe(
      `import { Checkbox } from 'kit/react';

export function CheckboxExample() {
  return (
    <>
      <Checkbox aria-describedby="agree-hint" />
      <p id="agree-hint" className="hint">You can change this later.</p>
    </>
  );
}
`
    );
  });

  it('Vue lists them in the template', () => {
    expect(vueSource(story)).toContain(
      `<template>
  <Checkbox aria-describedby="agree-hint" />
  <p id="agree-hint" class="hint">You can change this later.</p>
</template>`
    );
  });

  it('Svelte lists them in the markup, before as well as after', () => {
    const source = svelteSource({
      ...story,
      around: {
        before: {
          kind: 'html',
          tag: 'span',
          props: { id: 'lead' },
          children: { kind: 'text', value: 'Terms' },
        },
        after: hint,
      },
    });
    expect(source).toContain(
      `</script>

<span id="lead">Terms</span>
<Checkbox aria-describedby="agree-hint" />
<p id="agree-hint" class="hint">You can change this later.</p>
`
    );
  });

  it("resolves the story's around, with or without the editor's tree, as the catalog has it now", () => {
    const component = {
      name: 'Checkbox',
      propTypes: [],
      previewDefaults: {},
      bindings: [],
      around,
    } as unknown as PreviewComponent;
    expect(resolveSourceStory(component, { props: {} }).around).toEqual(around);
    const tree = seedRoot({ name: 'Checkbox', defaultProps: {} }, {});
    expect(resolveSourceStory(component, { props: {}, tree }).around).toEqual(
      around
    );
    // A story file edit to around reaches a tree seeded before it.
    const edited = { ...component, around: { after: hint } } as PreviewComponent;
    expect(resolveSourceStory(edited, { props: {}, tree }).around).toEqual({
      after: hint,
    });
    const without = { ...component, around: undefined } as PreviewComponent;
    expect(
      resolveSourceStory(without, { props: {}, tree }).around
    ).toBeUndefined();
  });
});

describe('around in the html', () => {
  const component: EnumeratedComponent = {
    name: 'Checkbox',
    file: 'checkbox.ts',
    template: {
      type: 'component',
      name: 'Checkbox',
      children: [
        { type: 'element', tag: 'input', attributes: { type: 'checkbox' } },
      ],
    },
    props: {},
    hasDefaultSlot: false,
    slotNames: [],
  };

  it("renders the siblings beside the component's markup", () => {
    const result = htmlSource({
      component,
      props: {},
      named: {},
      around: { before: { kind: 'text', value: 'Agree' }, after: hint },
      components: [component],
      styling: { extensions: [], placement: 'in-file' },
      scope: {},
      handWrittenComponents: {},
    });
    expect(result.markup).toBe(
      'Agree\n<input type="checkbox">\n<p class="hint" id="agree-hint">You can change this later.</p>\n'
    );
  });

  it('names a raw sibling with no html as missing', () => {
    const result = htmlSource({
      component,
      props: {},
      named: {},
      around: {
        after: { kind: 'raw', react: '<b />', vue: '<b />', svelte: '<b />' },
      },
      components: [component],
      styling: { extensions: [], placement: 'in-file' },
      scope: {},
      handWrittenComponents: {},
    });
    expect(result).toEqual({ missing: ['a raw slot fill with no html'] });
  });
});

describe('around in the editor', () => {
  const roots: string[] = [];
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  it('leaves it out of the tree, and renders it in the scratch story from the payload the controller adds it to', () => {
    const tree = seedRoot({ name: 'Checkbox', defaultProps: {} }, {});
    expect(tree).toEqual({ root: 'Checkbox', props: {}, slots: {} });
    expect(toPayload(tree)).not.toHaveProperty('around');
    const payload = { ...toPayload(tree), around };
    const generatedRoot = mkdtempSync(
      join(tmpdir(), 'preview-around-scratch-')
    );
    roots.push(generatedRoot);
    writeFileSync(
      join(generatedRoot, 'modules.json'),
      JSON.stringify({
        defaultModule: 'kit',
        moduleByName: {},
        importOverrideByName: {},
        exportByName: {},
      })
    );
    writeScratch(payload, generatedRoot);
    const react = readFileSync(
      join(generatedRoot, 'scratch', 'react.tsx'),
      'utf8'
    );
    expect(react).toContain("import { Checkbox, Badge } from 'kit/react';");
    expect(react).toContain(
      '<><Badge tone={"calm"}>{"New"}</Badge><Checkbox {...props}></Checkbox><p '
    );
    expect(
      toPayload({ root: 'Checkbox', props: {}, slots: {} })
    ).not.toHaveProperty('around');
  });
});

describe('around in the model and the check', () => {
  const component: EnumeratedComponent = {
    name: 'Checkbox',
    file: 'checkbox.ts',
    props: { label: { type: 'string' } },
    hasDefaultSlot: false,
    slotNames: [],
  };
  const model = (storyAround: unknown) =>
    resolveStory(
      component,
      { around: storyAround } as never,
      {},
      undefined,
      undefined,
      ['react', 'vue', 'svelte']
    );

  it('carries around to the model, importing its components', () => {
    const built = model(around);
    expect(built.around).toEqual(around);
    expect(built.slotComponents).toEqual(['Badge']);
  });

  it('refuses a scoped fill, an unknown key and a void element with children', () => {
    expect(() =>
      model({
        after: {
          kind: 'scoped',
          slot: { react: 'a', vue: 'a', svelte: 'a' },
          parameters: [],
          react: '',
          vue: '',
          svelte: '',
        },
      })
    ).toThrow(
      'Checkbox: around.after is a scoped fill, which takes values from a slot; beside the component there is none'
    );
    expect(() => model({ below: hint })).toThrow(
      'Checkbox: unknown around key(s) below - around takes before and after'
    );
    expect(() =>
      model({
        before: {
          kind: 'html',
          tag: 'input',
          children: { kind: 'text', value: 'x' },
        },
      })
    ).toThrow(
      'Checkbox: the html fill <input> has children - input is a void element and takes none'
    );
  });

  it('check reports a component around names that no source declares, and a malformed around', async () => {
    const root = mkdtempSync(join(tmpdir(), 'preview-around-check-'));
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
              templatesDirectory: 'templates',
              storiesDirectory: 'preview/stories',
            },
          ],
        },
      })
    );
    put('preview/shell.ts', 'export {};\n');
    put(
      'templates/probe.ts',
      `export default { type: 'component', name: 'Probe', props: {}, children: [{ type: 'element', tag: 'span' }] };\n`
    );
    put(
      'templates/other.ts',
      `export default { type: 'component', name: 'Other', props: {}, children: [{ type: 'element', tag: 'span' }] };\n`
    );
    put(
      'preview/stories/Probe.story.ts',
      `export default { around: { after: { kind: 'element', component: 'Missing' } } };\n`
    );
    put(
      'preview/stories/Other.story.ts',
      `export default { around: { beside: { kind: 'text', value: 'x' } } };\n`
    );
    try {
      const { errors } = await checkPreview(root, { strict: true });
      expect(errors).toContain(
        "Probe: slot content references 'Missing', which no source declares"
      );
      expect(errors).toContain(
        'Other: unknown around key(s) beside - around takes before and after'
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
