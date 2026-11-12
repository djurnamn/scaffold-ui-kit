// A story printed as consumer source per target: imports from the kit's
// package entry, the props a story file and scenario set (minus the template's
// declared defaults), and slot content in each target's own form.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createSSRApp, defineComponent } from 'vue';
import { renderToString } from 'vue/server-renderer';
import {
  compileScript,
  compileTemplate,
  parse as parseSfc,
} from 'vue/compiler-sfc';
import { compile as compileSvelte } from 'svelte/compiler';
import { renderInstance } from '@js-template-engine/core';
import { tailwind } from '@js-template-engine/extension-tailwind';
import type { Template } from '@js-template-engine/types';
import type { SlotFill } from '../src/lib/types';
import {
  reactSource,
  svelteSource,
  vueSource,
  type SourceStory,
} from '../src/emit/source';
import { storySource } from '../src/story-source';
import { BRANCH, writeSourceKit } from './support/source-kit';

// Where a virtual file compiled with the package's own React types sits.
const here = dirname(fileURLToPath(import.meta.url));

const modal: SourceStory = {
  component: 'Modal',
  props: { label: 'bulletin', open: true, size: 2 },
  children: { kind: 'text', value: 'the line goes down at 23:00' },
  named: {
    trigger: {
      kind: 'scoped',
      slot: { react: 'trigger', vue: 'trigger', svelte: 'trigger' },
      parameters: ['triggerProps'],
      react: '<Button {...triggerProps} label="read" />',
      vue: '<Button v-bind="triggerProps" label="read" />',
      svelte: '<Button {...triggerProps} label="read" />',
    },
    footer: { kind: 'element', component: 'Button', props: { label: 'close' } },
  },
  imports: new Map([
    ['Modal', { module: 'kit/react', exported: 'Modal' }],
    ['Button', { module: 'kit/react', exported: 'Button' }],
  ]),
};

/** The errors strict TypeScript reports for a React module against the
 *  kit's declared components and React's own types. */
function reactErrors(source: string, kit: string): string[] {
  const files: Record<string, string> = {
    'Example.tsx': source,
    'kit.d.ts': `declare module 'kit/react' {\n${kit}\n}`,
  };
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile;
  host.getSourceFile = (name, version) =>
    name in files
      ? ts.createSourceFile(name, files[name], version, true)
      : read(name, version);
  host.fileExists = (name) => name in files || ts.sys.fileExists(name);
  const program = ts.createProgram(Object.keys(files), options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
    );
}

describe('source printers', () => {
  it('prints React with named content as props', () => {
    expect(reactSource(modal)).toBe(
      `import { Modal, Button } from 'kit/react';

export function ModalExample() {
  return (
    <Modal
      label="bulletin"
      open
      size={2}
      trigger={({ triggerProps }) => <Button {...triggerProps} label="read" />}
      footer={<Button label="close" />}
    >
      the line goes down at 23:00
    </Modal>
  );
}
`
    );
  });

  it('prints Vue with named content as templates', () => {
    expect(vueSource(modal)).toBe(
      `<script setup lang="ts">
import { Modal, Button } from 'kit/react';
</script>

<template>
  <Modal label="bulletin" open :size="2">
    the line goes down at 23:00
    <template #trigger="{ triggerProps }">
      <Button v-bind="triggerProps" label="read" />
    </template>
    <template #footer>
      <Button label="close" />
    </template>
  </Modal>
</template>
`
    );
  });

  it('prints Svelte with named content as snippets', () => {
    expect(svelteSource(modal)).toBe(
      `<script lang="ts">
  import { Modal, Button } from 'kit/react';
</script>

<Modal label="bulletin" open size={2}>
  the line goes down at 23:00
  {#snippet trigger({ triggerProps })}
    <Button {...triggerProps} label="read" />
  {/snippet}
  {#snippet footer()}
    <Button label="close" />
  {/snippet}
</Modal>
`
    );
  });

  it('prints a React render function named children as the child', () => {
    const list: SourceStory = {
      component: 'List',
      props: {},
      named: {
        children: {
          kind: 'scoped',
          slot: { react: 'children', vue: 'default', svelte: 'children' },
          parameters: ['item'],
          react: '<span>{item}</span>',
          vue: '<span>{{ item }}</span>',
          svelte: '<span>{item}</span>',
        },
      },
      imports: new Map([['List', { module: 'kit/react', exported: 'List' }]]),
    };
    expect(reactSource(list)).toContain(
      '    <List>\n      {({ item }) => <span>{item}</span>}\n    </List>'
    );
  });

  it('prints scoped content for the default slot in every target', () => {
    const list: SourceStory = {
      component: 'List',
      props: { items: ['a', 'b'] },
      children: {
        kind: 'scoped',
        slot: { react: 'children', vue: 'default', svelte: 'children' },
        parameters: ['item'],
        react: '<span>{item}</span>',
        vue: '<span>{{ item }}</span>',
        svelte: '<span>{item}</span>',
      },
      named: {},
      imports: new Map([['List', { module: 'kit/react', exported: 'List' }]]),
    };
    expect(reactSource(list)).toContain('{({ item }) => <span>{item}</span>}');
    expect(vueSource(list)).toContain('<template #default="{ item }">');
    expect(vueSource(list)).toContain('<span>{{ item }}</span>');
    expect(svelteSource(list)).toContain('{#snippet children({ item })}');
    expect(svelteSource(list)).toContain('<span>{item}</span>');
  });

  it('quotes strings an attribute cannot hold', () => {
    const story: SourceStory = {
      component: 'Note',
      props: { title: 'say "hi"', items: ['a', "it's"] },
      named: {},
      imports: new Map([['Note', { module: 'kit/vue', exported: 'Note' }]]),
    };
    expect(reactSource(story)).toContain(
      `<Note title={'say "hi"'} items={['a', 'it\\'s']} />`
    );
    expect(vueSource(story)).toContain(
      `<Note :title="'say &quot;hi&quot;'" :items="['a', 'it\\'s']" />`
    );
  });

  it('prints a wrapped element inside a React slot prop as an indented block', () => {
    const story: SourceStory = {
      component: 'AuthTemplate',
      props: {},
      named: {
        header: {
          kind: 'element',
          component: 'AuthTemplateHeader',
          props: {
            brand: 'Acme',
            tagline: 'Sign in to continue to your workspace',
          },
          slots: {
            navigation: {
              kind: 'element',
              component: 'Link',
              props: { href: '/help' },
            },
          },
        },
      },
      imports: new Map([
        ['AuthTemplate', { module: 'kit/react', exported: 'AuthTemplate' }],
        [
          'AuthTemplateHeader',
          { module: 'kit/react', exported: 'AuthTemplateHeader' },
        ],
        ['Link', { module: 'kit/react', exported: 'Link' }],
      ]),
    };
    const react = reactSource(story);
    expect(react).toContain(
      [
        '    <AuthTemplate',
        '      header={',
        '        <AuthTemplateHeader',
        '          brand="Acme"',
        '          tagline="Sign in to continue to your workspace"',
        '          navigation={<Link href="/help" />}',
        '        />',
        '      }',
        '    />',
      ].join('\n')
    );
    const parsed = ts.createSourceFile(
      'Example.tsx',
      react,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    expect(
      (parsed as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics
    ).toEqual([]);
  });

  it('escapes line breaks and other control characters, so a multi-line string stays one valid literal', () => {
    const code =
      "import { CodeBlock } from 'kit/react';\r\n\n\tconst x = 1;\u2028done";
    const story: SourceStory = {
      component: 'CodeBlock',
      props: { code },
      named: {},
      imports: new Map([
        ['CodeBlock', { module: 'kit/react', exported: 'CodeBlock' }],
      ]),
    };
    const literal =
      "'import { CodeBlock } from \\'kit/react\\';\\r\\n\\n\\tconst x = 1;\\u2028done'";

    const react = reactSource(story);
    expect(react).toContain(`code={${literal}}`);
    const parsed = ts.createSourceFile(
      'Example.tsx',
      react,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    expect(
      (parsed as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics
    ).toEqual([]);

    const vue = vueSource(story);
    expect(vue).toContain(`:code="${literal}"`);
    const { descriptor, errors } = parseSfc(vue);
    expect(errors).toEqual([]);
    expect(
      compileTemplate({
        source: descriptor.template!.content,
        filename: 'Example.vue',
        id: 'example',
      }).errors
    ).toEqual([]);

    const svelte = svelteSource(story);
    expect(svelte).toContain(`code={${literal}}`);
    expect(() =>
      compileSvelte(svelte, { filename: 'Example.svelte' })
    ).not.toThrow();

    // The literal evaluates back to the original value.
    expect(new Function(`return ${literal};`)()).toBe(code);
  });
});

describe('a long array or object prop', () => {
  const rows = [
    [
      { value: 'Iceland', numeric: false },
      { value: '372,520', numeric: true },
    ],
    [
      { value: 'Finland', numeric: false },
      { value: '5,563,970', numeric: true },
    ],
  ];
  const story: SourceStory = {
    component: 'Table',
    props: {
      caption: 'Population',
      rows,
      head: ['Country', 'People'],
      sort: { column: 0, direction: 'ascending' },
    },
    named: {},
    imports: new Map([['Table', { module: 'kit/react', exported: 'Table' }]]),
  };
  const kit = `type Cell = { value: string; numeric: boolean };
export function Table(props: { caption: string; rows: Cell[][]; head: string[]; sort: { column: number; direction: 'ascending' | 'descending' } }): null;`;

  it('breaks over lines, one element to a line, while a short one stays on its line', () => {
    const react = reactSource(story);
    expect(react).toContain(
      [
        '    <Table',
        '      caption="Population"',
        '      rows={[',
        '        [',
        "          { value: 'Iceland', numeric: false },",
        "          { value: '372,520', numeric: true },",
        '        ],',
        '        [',
        "          { value: 'Finland', numeric: false },",
        "          { value: '5,563,970', numeric: true },",
        '        ],',
        '      ]}',
        "      head={['Country', 'People']}",
        "      sort={{ column: 0, direction: 'ascending' }}",
        '    />',
      ].join('\n')
    );
    expect(reactErrors(react, kit)).toEqual([]);

    const vue = vueSource(story);
    expect(vue).toContain(
      [
        '    :rows="[',
        '      [',
        "        { value: 'Iceland', numeric: false },",
        "        { value: '372,520', numeric: true },",
        '      ],',
      ].join('\n')
    );
    expect(vue).toContain(`:head="['Country', 'People']"`);
    const { descriptor, errors } = parseSfc(vue);
    expect(errors).toEqual([]);
    expect(
      compileTemplate({
        source: descriptor.template!.content,
        filename: 'Example.vue',
        id: 'example',
      }).errors
    ).toEqual([]);

    const svelte = svelteSource(story);
    expect(svelte).toContain(
      [
        '  rows={[',
        '    [',
        "      { value: 'Iceland', numeric: false },",
      ].join('\n')
    );
    expect(svelte).toContain(`head={['Country', 'People']}`);
    expect(() =>
      compileSvelte(svelte, { filename: 'Example.svelte' })
    ).not.toThrow();
  });

  it('fills lines with an array of numbers, and wraps to the column of a nested tag', () => {
    const steps = Array.from({ length: 30 }, (_, index) => index * 10);
    const nested: SourceStory = {
      component: 'Card',
      props: {},
      children: {
        kind: 'element',
        component: 'Card',
        props: {},
        children: {
          kind: 'element',
          component: 'Chart',
          props: {
            steps,
            labels: [
              'first quarter',
              'second quarter',
              'third quarter',
              'fourth quarter',
            ],
          },
        },
      },
      named: {},
      imports: new Map([
        ['Card', { module: 'kit/react', exported: 'Card' }],
        ['Chart', { module: 'kit/react', exported: 'Chart' }],
      ]),
    };
    const react = reactSource(nested);
    const lines = react.split('\n');
    // Every line stays within the width, however deep the tag.
    for (const line of lines) expect(line.length, line).toBeLessThanOrEqual(80);
    expect(react).toContain(
      ['          steps={[', '            0, 10, 20,'].join('\n')
    );
    expect(react).toContain(
      ['          labels={[', "            'first quarter',"].join('\n')
    );
    expect(
      reactErrors(
        react,
        'export function Card(props: { children?: unknown }): null;\nexport function Chart(props: { steps: number[]; labels: string[] }): null;'
      )
    ).toEqual([]);
    expect(() =>
      compileSvelte(svelteSource(nested), { filename: 'Example.svelte' })
    ).not.toThrow();
  });
});

describe('text beside an inline element', () => {
  const link: SlotFill = {
    kind: 'html',
    tag: 'a',
    props: { href: 'mailto:help@example.org' },
    children: { kind: 'text', value: 'help@example.org' },
  };
  const paragraph = (...children: SlotFill[]): SlotFill => ({
    kind: 'html',
    tag: 'p',
    children: { kind: 'fragment', children },
  });
  const text = (value: string): SlotFill => ({ kind: 'text', value });
  const story: SourceStory = {
    component: 'Note',
    props: {},
    named: {},
    imports: new Map([['Note', { module: 'kit/react', exported: 'Note' }]]),
    children: {
      kind: 'fragment',
      children: [
        // Whitespace beside the link, on either side.
        paragraph(
          text('Contact '),
          link,
          text(' if you think there is a problem.')
        ),
        // None: the link touches the text.
        paragraph(text('('), link, text(')')),
        // Whitespace alone between two elements.
        paragraph(
          { kind: 'html', tag: 'strong', children: text('bold') },
          text(' '),
          { kind: 'html', tag: 'em', children: text('italic') }
        ),
        // Two texts in a row, one touching the next.
        paragraph(text('one'), text('two '), text('three')),
      ],
    },
  };
  /** Markup without whitespace at a paragraph's edges, where it renders as
   *  nothing, or Vue's fragment markers. */
  const atBlockEdges = (markup: string): string =>
    markup
      .replace(/<!--[[\]]-->/g, '')
      .replace(/<p>\s+/g, '<p>')
      .replace(/\s+<\/p>/g, '</p>');
  // What every pane renders for the story's content.
  const rendered = [
    '<p>Contact <a href="mailto:help@example.org">help@example.org</a> if you think there is a problem.</p>',
    '<p>(<a href="mailto:help@example.org">help@example.org</a>)</p>',
    '<p><strong>bold</strong> <em>italic</em></p>',
    '<p>onetwo three</p>',
  ].join('');

  it("prints React so JSX keeps the whitespace the story gives, as {' '} at a line edge", async () => {
    const source = reactSource(story);
    expect(source).toContain("Contact{' '}\n");
    expect(source).toContain("{' '}if you think there is a problem.");
    expect(
      reactErrors(
        source,
        "  import type { ReactNode } from 'react';\n  export function Note(props: { children?: ReactNode }): ReactNode;"
      )
    ).toEqual([]);
    // Compiled and rendered, it reads as the panes do.
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.React,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    });
    const exports: Record<string, unknown> = {};
    const kit = {
      Note: ({ children }: { children?: React.ReactNode }) =>
        React.createElement('div', null, children),
    };
    new Function('require', 'exports', 'React', outputText)(
      (module: string) => (module === 'kit/react' ? kit : React),
      exports,
      React
    );
    const example = exports.NoteExample as () => React.ReactElement;
    expect(renderToStaticMarkup(React.createElement(example))).toBe(
      `<div>${rendered}</div>`
    );
  });

  it('prints Vue so a line break stands for whitespace only where the story gives it', async () => {
    const source = vueSource(story);
    expect(source).toContain(
      '(<a href="mailto:help@example.org">help@example.org</a>)'
    );
    expect(source).toContain('<strong>bold</strong> <em>italic</em>');
    const { descriptor } = parseSfc(source);
    const Note = defineComponent({ template: '<div><slot /></div>' });
    const application = createSSRApp(
      defineComponent({
        components: { Note },
        template: descriptor.template!.content,
      })
    );
    // Whitespace at a paragraph's edges renders as nothing, and the
    // fragment's markers are Vue's own.
    expect(atBlockEdges(await renderToString(application))).toBe(
      `<div>${rendered}</div>`
    );
  });

  it('prints React text and string attributes holding `&` as string expressions, so a reference reads literally', () => {
    const source = reactSource({
      ...story,
      children: paragraph(text('a &copy; b'), {
        kind: 'html',
        tag: 'a',
        props: { title: '&copy; me' },
        children: text('link'),
      }),
    });
    expect(source).toContain("{'a &copy; b'}");
    expect(source).toContain(`title={'&copy; me'}`);
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.React,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    });
    const exports: Record<string, unknown> = {};
    const kit = {
      Note: ({ children }: { children?: React.ReactNode }) =>
        React.createElement('div', null, children),
    };
    new Function('require', 'exports', 'React', outputText)(
      (module: string) => (module === 'kit/react' ? kit : React),
      exports,
      React
    );
    expect(
      renderToStaticMarkup(
        React.createElement(exports.NoteExample as () => React.ReactElement)
      )
    ).toBe('<div><p>a &amp;copy; b<a title="&amp;copy; me">link</a></p></div>');
  });

  it('prints a React named slot of text as a string, and of several siblings in a fragment', () => {
    const titled = (title: SlotFill): string =>
      reactSource({ ...story, children: undefined, named: { title } });
    expect(
      titled({ kind: 'fragment', children: [text('Hello'), text('')] })
    ).toContain('<Note title="Hello" />');
    expect(
      titled({ kind: 'fragment', children: [text('Hello'), text('World')] })
    ).toContain('<Note title={<>HelloWorld</>} />');
    const mixed = titled({
      kind: 'fragment',
      children: [
        text('Hi '),
        { kind: 'html', tag: 'b', children: text('there') },
      ],
    });
    expect(mixed).toContain(
      ['title={', '  <>', "    Hi{' '}", '    <b>there</b>', '  </>', '}']
        .map((line) => `      ${line}`)
        .join('\n')
    );
    expect(
      reactErrors(
        mixed,
        "  import type { ReactNode } from 'react';\n  export function Note(props: { title?: ReactNode }): ReactNode;"
      )
    ).toEqual([]);
  });

  // Raw content and elements that touch, text holding markup characters,
  // and a brace beside an interpolation.
  const touching: SourceStory = {
    ...story,
    children: {
      kind: 'fragment',
      children: [
        paragraph(
          { kind: 'raw', react: '{x}', vue: '{{ x }}', svelte: '{x}' },
          { kind: 'html', tag: 'b', children: text('y') }
        ),
        paragraph(
          { kind: 'html', tag: 'b', children: text('a') },
          { kind: 'html', tag: 'i', children: text('b') }
        ),
        paragraph(text('a<b & c &amp; d &copy x')),
        paragraph(text('{'), {
          kind: 'raw',
          react: '{x}',
          vue: '{{ x }}',
          svelte: '{x}',
        }),
      ],
    },
  };
  const touchingRendered = [
    '<p>1<b>y</b></p>',
    '<p><b>a</b><i>b</i></p>',
    '<p>a&lt;b &amp; c &amp;amp; d &amp;copy x</p>',
    '<p>{1</p>',
  ];

  it('prints Vue so raw content and elements that touch render touching, and text as it reads', async () => {
    const source = vueSource(touching);
    expect(source).toContain('{{ x }}<b>y</b>');
    // Vue drops a line break between elements, so each keeps its own line.
    expect(source).toContain('      <b>a</b>\n      <i>b</i>\n');
    expect(source).toContain('a&lt;b &amp; c &amp;amp; d &amp;copy x');
    expect(source).toContain("{{ '{' }}{{ x }}");
    const { descriptor } = parseSfc(source);
    const Note = defineComponent({ template: '<div><slot /></div>' });
    const application = createSSRApp(
      defineComponent({
        components: { Note },
        setup: () => ({ x: 1 }),
        template: descriptor.template!.content,
      })
    );
    expect(atBlockEdges(await renderToString(application))).toBe(
      `<div>${touchingRendered.join('')}</div>`
    );
  });

  it('prints Svelte so raw content and elements that touch render touching, and text as it reads', () => {
    const source = svelteSource(touching);
    expect(source).toContain('<b>a</b><i>b</i>');
    const compiled = compileSvelte(
      source.replace(
        '<script lang="ts">',
        '<script lang="ts">\n  const x = 1;'
      ),
      {
        filename: 'Example.svelte',
        generate: 'server',
      }
    ).js.code;
    // Svelte folds the constant into its markup.
    expect(atBlockEdges(compiled.replace(/\s+/g, ' '))).toContain(
      touchingRendered.join('')
    );
  });

  it('prints Svelte so a line break stands for whitespace only where the story gives it', () => {
    const source = svelteSource(story);
    expect(source).toContain(
      '(<a href="mailto:help@example.org">help@example.org</a>)'
    );
    const compiled = compileSvelte(source, {
      filename: 'Example.svelte',
      generate: 'server',
    }).js.code;
    // A line break inside one text renders as a space.
    const markup = atBlockEdges(compiled.replace(/\s+/g, ' '));
    for (const paragraph of rendered.split(/(?=<p>)/))
      expect(markup).toContain(paragraph);
  });
});

describe('text with whitespace at its own edge', () => {
  // A row under white-space: pre, padded to line up with the rows beside it.
  const story: SourceStory = {
    component: 'Note',
    props: {},
    named: {},
    children: {
      kind: 'html',
      tag: 'div',
      props: { style: 'white-space: pre' },
      children: { kind: 'text', value: ' 1 ben  throttle' },
    },
    imports: new Map([['Note', { module: 'kit/react', exported: 'Note' }]]),
  };

  it('prints it as one string in every target, as a template would drop it', () => {
    expect(reactSource(story)).toContain("{' 1 ben  throttle'}</div>");
    expect(vueSource(story)).toContain('{{ " 1 ben  throttle" }}</div>');
    expect(svelteSource(story)).toContain('{" 1 ben  throttle"}</div>');
  });
});

describe("a component's attributes", () => {
  const names = { tabindex: 'tabIndex', for: 'htmlFor', readonly: 'readOnly' };
  const menu: SourceStory = {
    component: 'DropdownMenu',
    props: { class: 'menu', tabindex: -1 },
    named: {},
    children: {
      kind: 'fragment',
      children: [
        {
          kind: 'element',
          component: 'FieldLabel',
          props: {
            class: 'px-2',
            for: 'email',
            style: 'padding-inline: 1ch; font-weight: 600',
            disabled: true,
          },
        },
        {
          kind: 'element',
          component: 'Legacy',
          props: { class: 'kept', for: 'kept' },
        },
        { kind: 'html', tag: 'label', props: { class: 'note', for: 'email' } },
      ],
    },
    imports: new Map([
      ['DropdownMenu', { module: 'kit/react', exported: 'DropdownMenu' }],
      ['FieldLabel', { module: 'kit/react', exported: 'FieldLabel' }],
      [
        'Legacy',
        {
          module: 'kit/react',
          exported: 'Legacy',
          declaredAttributes: ['class', 'for'],
        },
      ],
    ]),
    reactAttributeNames: names,
  };

  it('prints as React spells them, and as given where the component declares a prop by that name', () => {
    const react = reactSource(menu);
    expect(react).toContain('<DropdownMenu className="menu" tabIndex={-1}>');
    expect(react).toContain(
      [
        '      <FieldLabel',
        '        className="px-2"',
        '        htmlFor="email"',
        "        style={{ paddingInline: '1ch', fontWeight: '600' }}",
        '        disabled',
        '      />',
      ].join('\n')
    );
    expect(react).toContain('<Legacy class="kept" for="kept" />');
    expect(react).toContain('<label className="note" htmlFor="email" />');
  });

  it('compiles under strict TypeScript against React components that forward their attributes', () => {
    const react = reactSource(menu);
    const declarations = [
      "declare module 'kit/react' {",
      "  import type { ComponentPropsWithoutRef, ReactNode } from 'react';",
      "  export function DropdownMenu(props: ComponentPropsWithoutRef<'div'>): ReactNode;",
      "  export function FieldLabel(props: ComponentPropsWithoutRef<'label'> & { disabled?: boolean }): ReactNode;",
      '  export function Legacy(props: { class?: string; for?: string }): ReactNode;',
      '}',
    ].join('\n');
    const files: Record<string, string> = {
      'Example.tsx': react,
      'kit.d.ts': declarations,
    };
    const options: ts.CompilerOptions = {
      strict: true,
      noEmit: true,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      types: [],
    };
    const host = ts.createCompilerHost(options);
    const read = host.getSourceFile;
    const root = join(here, 'Example.tsx');
    const at = (name: string) => join(here, name);
    const virtual: Record<string, string> = {
      [at('Example.tsx')]: files['Example.tsx'],
      [at('kit.d.ts')]: files['kit.d.ts'],
    };
    host.getSourceFile = (name, version) =>
      name in virtual
        ? ts.createSourceFile(name, virtual[name], version, true)
        : read(name, version);
    host.fileExists = (name) => name in virtual || ts.sys.fileExists(name);
    const program = ts.createProgram([root, at('kit.d.ts')], options, host);
    const errors = ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
      );
    expect(errors).toEqual([]);
    // The same story as HTML spells it fails, which the check above would catch.
    const unspelled = react
      .replace('htmlFor=', 'for=')
      .replace('tabIndex=', 'tabindex=');
    virtual[at('Example.tsx')] = unspelled;
    const failing = ts.getPreEmitDiagnostics(
      ts.createProgram([root, at('kit.d.ts')], options, host)
    );
    expect(failing.length).toBeGreaterThan(0);
  });

  it('prints as given in Vue and Svelte', () => {
    for (const source of [vueSource(menu), svelteSource(menu)]) {
      expect(source).toContain('class="menu"');
      for (const attribute of [
        'class="px-2"',
        'for="email"',
        'style="padding-inline: 1ch; font-weight: 600"',
      ])
        expect(source).toContain(attribute);
      expect(source).not.toMatch(/className|htmlFor|tabIndex/);
    }
  });
});

describe('a part', () => {
  const outline: SourceStory = {
    component: 'Outline',
    props: {},
    children: BRANCH,
    named: {},
    imports: new Map([
      ['Outline', { module: 'kit/react', exported: 'Outline' }],
      ['Badge', { module: 'kit/react', exported: 'Badge' }],
    ]),
  };

  it('prints React as a function component above the example', () => {
    const react = reactSource(outline);
    expect(react).toBe(
      `import { Outline, Badge } from 'kit/react';

function Branch({ items }: { items: any }) {
  return (
    ${BRANCH.react}
  );
}

export function OutlineExample() {
  return (
    <Outline>
      <Branch
        items={[
          { name: 'docs', children: [{ name: 'guides', children: [] }] },
          { name: 'src', children: [] },
        ]}
      />
    </Outline>
  );
}
`
    );
    const parsed = ts.createSourceFile(
      'Example.tsx',
      react,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    expect(
      (parsed as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics
    ).toEqual([]);
  });

  it('prints Vue as a second single-file component, each importing what it uses', () => {
    const vue = vueSource(outline);
    const [story, part] = vue.split('<!-- Branch.vue -->\n');
    expect(story).toBe(
      `<script setup lang="ts">
import { Outline } from 'kit/react';
import Branch from './Branch.vue';
</script>

<template>
  <Outline>
    <Branch
      :items="[
        { name: 'docs', children: [{ name: 'guides', children: [] }] },
        { name: 'src', children: [] },
      ]"
    />
  </Outline>
</template>

`
    );
    expect(part).toBe(
      `<script setup lang="ts">
import { Badge } from 'kit/react';

defineProps(['items']);
</script>

<template>
  ${BRANCH.vue}
</template>
`
    );
    for (const [file, source] of [
      ['Example.vue', story],
      ['Branch.vue', part],
    ]) {
      const { descriptor, errors } = parseSfc(source);
      expect(errors).toEqual([]);
      expect(
        compileTemplate({
          source: descriptor.template!.content,
          filename: file,
          id: file,
        }).errors
      ).toEqual([]);
    }
  });

  it('prints Svelte as a snippet at the top of the markup', () => {
    const svelte = svelteSource(outline);
    expect(svelte).toBe(
      `<script lang="ts">
  import { Outline, Badge } from 'kit/react';
</script>

{#snippet Branch({ items }: { items: any })}
  ${BRANCH.svelte}
{/snippet}

<Outline>
  {@render Branch({ items: [{ name: 'docs', children: [{ name: 'guides', children: [] }] }, { name: 'src', children: [] }] })}
</Outline>
`
    );
    expect(() =>
      compileSvelte(svelte, { filename: 'Example.svelte' })
    ).not.toThrow();
  });
});

describe('a typed part', () => {
  const typed: SourceStory = {
    component: 'Outline',
    props: {},
    children: { ...BRANCH, parameterTypes: { items: 'Item[]' } },
    named: {},
    imports: new Map([
      ['Outline', { module: 'kit/react', exported: 'Outline' }],
      ['Badge', { module: 'kit/react', exported: 'Badge' }],
    ]),
  };

  it('types its props in React, compiling under strict TypeScript', () => {
    const react = reactSource(typed);
    expect(react).toContain('function Branch({ items }: { items: Item[] }) {');
    // The kit's components and the reader's Item type, declared beside it.
    const declarations = [
      "declare module 'kit/react' { export const Outline: any; export const Badge: any; }",
      'type Item = { name: string; children: Item[] };',
      'declare namespace JSX { interface IntrinsicElements { [name: string]: any } interface IntrinsicAttributes { key?: string } }',
    ].join('\n');
    const files: Record<string, string> = {
      'Example.tsx': react,
      'kit.d.ts': declarations,
    };
    const options: ts.CompilerOptions = {
      strict: true,
      noEmit: true,
      jsx: ts.JsxEmit.Preserve,
      target: ts.ScriptTarget.ES2020,
      types: [],
    };
    const host = ts.createCompilerHost(options);
    const read = host.getSourceFile;
    host.getSourceFile = (name, version) =>
      name in files
        ? ts.createSourceFile(name, files[name], version, true)
        : read(name, version);
    host.fileExists = (name) => name in files || ts.sys.fileExists(name);
    const program = ts.createProgram(Object.keys(files), options, host);
    const errors = ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
      );
    expect(errors).toEqual([]);
  });

  it("types Vue's defineProps and Svelte's snippet", () => {
    expect(vueSource(typed)).toContain('defineProps<{ items: Item[] }>();');
    const svelte = svelteSource(typed);
    expect(svelte).toContain('{#snippet Branch({ items }: { items: Item[] })}');
    expect(() =>
      compileSvelte(svelte, { filename: 'Example.svelte' })
    ).not.toThrow();
  });
});

describe('a controlled two-way story', () => {
  /** A story of one component from `kit/<target>`, giving `props`, with the
   *  component's two-way props. */
  const story = (
    component: string,
    props: SourceStory['props'],
    bindings: NonNullable<SourceStory['bindings']>,
    target = 'react'
  ): SourceStory => ({
    component,
    props,
    named: {},
    imports: new Map([
      [component, { module: `kit/${target}`, exported: component }],
    ]),
    bindings,
  });
  const open = {
    prop: 'open',
    changeProp: 'onOpenChange',
    declaredType: 'boolean',
  };

  /** Compile a Vue single-file component's script and template. */
  function compileVue(source: string): void {
    const { descriptor, errors } = parseSfc(source);
    expect(errors).toEqual([]);
    const script = compileScript(descriptor, { id: 'example' });
    expect(
      compileTemplate({
        source: descriptor.template!.content,
        filename: 'Example.vue',
        id: 'example',
        compilerOptions: { bindingMetadata: script.bindings },
      }).errors
    ).toEqual([]);
  }

  const disclosure = [
    'import type { ReactNode } from "react";',
    'export function Disclosure(props: { open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; size?: "small" | "large"; onSizeChange?: (size: "small" | "large") => void }): ReactNode;',
  ].join('\n');

  it('holds a bound prop in React state, passing its value and the setter as the change prop', () => {
    const react = reactSource(story('Disclosure', { open: true }, [open]));
    expect(react).toBe(`import { useState } from 'react';
import { Disclosure } from 'kit/react';

export function DisclosureExample() {
  const [open, setOpen] = useState(true);

  return <Disclosure open={open} onOpenChange={setOpen} />;
}
`);
    expect(reactErrors(react, disclosure)).toEqual([]);
  });

  it('types the state with a declared union, and with the prop’s own type where it names the kit’s types', () => {
    const size = {
      prop: 'size',
      changeProp: 'onSizeChange',
      declaredType: "'small' | 'large'",
    };
    const react = reactSource(story('Disclosure', { size: 'small' }, [size]));
    expect(react).toContain(
      "const [size, setSize] = useState<'small' | 'large'>('small');"
    );
    expect(reactErrors(react, disclosure)).toEqual([]);

    const selected = {
      prop: 'selected',
      changeProp: 'onSelectedChange',
      declaredType: 'RowKey[]',
    };
    const grid = story('Grid', { selected: ['a'] }, [selected]);
    const gridReact = reactSource(grid);
    expect(gridReact).toContain(
      "import { useState, type ComponentProps } from 'react';"
    );
    expect(gridReact).toContain(
      "useState<ComponentProps<typeof Grid>['selected']>(['a']);"
    );
    expect(
      reactErrors(
        gridReact,
        'export function Grid(props: { selected?: string[]; onSelectedChange?: (selected: string[]) => void }): null;'
      )
    ).toEqual([]);
    expect(
      vueSource({
        ...grid,
        imports: new Map([['Grid', { module: 'kit/vue', exported: 'Grid' }]]),
      })
    ).toContain(
      "const selected = ref<InstanceType<typeof Grid>['$props']['selected']>(['a']);"
    );
    const svelte = svelteSource({ ...grid, svelteMode: 'runes' });
    expect(svelte).toContain("import type { ComponentProps } from 'svelte';");
    expect(svelte).toContain(
      "let selected = $state<ComponentProps<typeof Grid>['selected']>(['a']);"
    );
    expect(() =>
      compileSvelte(svelte, { filename: 'Example.svelte' })
    ).not.toThrow();
  });

  it("types an undeclared array or null with the prop's own type, and leaves a generic component's to the value", () => {
    const undeclared = story('Grid', { selected: [] }, [
      { prop: 'selected', changeProp: 'onSelectedChange' },
    ]);
    expect(reactSource(undeclared)).toContain(
      "useState<ComponentProps<typeof Grid>['selected']>([]);"
    );
    expect(vueSource(undeclared)).toContain(
      "ref<InstanceType<typeof Grid>['$props']['selected']>([]);"
    );
    expect(svelteSource(undeclared)).toContain(
      "let selected: ComponentProps<typeof Grid>['selected'] = [];"
    );
    const empty = story('Grid', { selected: null }, [
      { prop: 'selected', changeProp: 'onSelectedChange' },
    ]);
    expect(reactSource(empty)).toContain(
      "useState<ComponentProps<typeof Grid>['selected']>(null);"
    );
    // A primitive with nothing declared infers as it is.
    expect(
      reactSource(
        story('Grid', { open: true }, [
          { prop: 'open', changeProp: 'onOpenChange' },
        ])
      )
    ).toContain('useState(true);');

    const generic = story('List', { selected: ['a'] }, [
      {
        prop: 'selected',
        changeProp: 'onSelectedChange',
        declaredType: 'Key[]',
        generic: true,
      },
    ]);
    expect(reactSource(generic)).toContain(
      "const [selected, setSelected] = useState(['a']);"
    );
    expect(reactSource(generic)).not.toContain('ComponentProps');
    expect(vueSource(generic)).toContain("const selected = ref(['a']);");
    expect(svelteSource({ ...generic, svelteMode: 'runes' })).toContain(
      "let selected = $state(['a']);"
    );
  });

  it('binds a Vue ref with v-model:<prop>, or a bare v-model for the model prop', () => {
    const vue = vueSource(
      story('Disclosure', { open: true, label: 'more' }, [open], 'vue')
    );
    expect(vue).toBe(`<script setup lang="ts">
import { ref } from 'vue';
import { Disclosure } from 'kit/vue';

const open = ref(true);
</script>

<template>
  <Disclosure v-model:open="open" label="more" />
</template>
`);
    compileVue(vue);
    const model = vueSource(
      story('Disclosure', { open: true }, [{ ...open, vueModel: true }], 'vue')
    );
    expect(model).toContain('<Disclosure v-model="open" />');
    compileVue(model);
  });

  it('binds Svelte with bind:<prop>, on $state in runes mode and a plain let in legacy mode', () => {
    const legacy = svelteSource(
      story('Disclosure', { open: true }, [open], 'svelte')
    );
    expect(legacy).toBe(`<script lang="ts">
  import { Disclosure } from 'kit/svelte';

  let open = true;
</script>

<Disclosure bind:open />
`);
    expect(() =>
      compileSvelte(legacy, { filename: 'Example.svelte' })
    ).not.toThrow();
    const runes = svelteSource({
      ...story('Disclosure', { open: true }, [open], 'svelte'),
      svelteMode: 'runes',
    });
    expect(runes).toContain('  let open = $state(true);');
    expect(runes).toContain('<Disclosure bind:open />');
    expect(() =>
      compileSvelte(runes, { filename: 'Example.svelte' })
    ).not.toThrow();
    const typed = svelteSource(
      story(
        'Disclosure',
        { size: 'small' },
        [{ prop: 'size', declaredType: "'small' | 'large'" }],
        'svelte'
      )
    );
    expect(typed).toContain("  let size: 'small' | 'large' = 'small';");
  });

  it('prints a React prop with no change prop as its value, and an uncontrolled story as it is', () => {
    const fixed = story('Disclosure', { open: true }, [
      { prop: 'open', declaredType: 'boolean' },
    ]);
    expect(reactSource(fixed)).toBe(reactSource({ ...fixed, bindings: [] }));
    expect(reactSource(fixed)).toContain('<Disclosure open />');
    // Vue and Svelte bind it all the same: the emit and the binding are their own.
    expect(vueSource(fixed)).toContain('v-model:open="open"');
    expect(svelteSource(fixed)).toContain('bind:open');

    const uncontrolled = story('Disclosure', { defaultOpen: true }, [open]);
    for (const print of [reactSource, vueSource, svelteSource])
      expect(print(uncontrolled)).toBe(
        print({ ...uncontrolled, bindings: [] })
      );
  });

  it("leaves out a bound prop's default prop, and a prop given null", () => {
    const tabs = {
      prop: 'value',
      changeProp: 'onValueChange',
      defaultProp: 'defaultValue',
      declaredType: 'string',
    };
    const controlled = story(
      'Tabs',
      { defaultValue: 'account', value: 'account', label: null },
      [tabs]
    );
    const react = reactSource(controlled);
    expect(react).toContain(
      'return <Tabs value={value} onValueChange={setValue} />;'
    );
    expect(react).not.toContain('defaultValue');
    expect(react).not.toContain('null');
    const vue = vueSource({
      ...controlled,
      imports: new Map([['Tabs', { module: 'kit/vue', exported: 'Tabs' }]]),
    });
    expect(vue).toContain('<Tabs v-model:value="value" />');
    expect(vue).not.toContain('defaultValue');
    expect(vue).not.toContain('null');
    const svelte = svelteSource(controlled);
    expect(svelte).toContain('<Tabs bind:value />');
    expect(svelte).not.toContain('defaultValue');

    // A default prop stays while its two-way prop is left out.
    const uncontrolled = story('Tabs', { defaultValue: 'account' }, [tabs]);
    expect(reactSource(uncontrolled)).toContain(
      '<Tabs defaultValue="account" />'
    );
    // A React prop with no change prop is not bound, its default prop left out all the same.
    const unheard = story(
      'Tabs',
      { defaultValue: 'account', value: 'account' },
      [{ ...tabs, changeProp: undefined }]
    );
    expect(reactSource(unheard)).toContain('<Tabs value="account" />');
  });

  it('starts a bound prop declared with null at null, in code that type-checks', () => {
    const selected = {
      prop: 'selected',
      changeProp: 'onSelectedChange',
      declaredType: 'string | null',
    };
    const react = reactSource(story('Picker', { selected: null }, [selected]));
    expect(react).toContain(
      'const [selected, setSelected] = useState<string | null>(null);'
    );
    expect(
      reactErrors(
        react,
        'export function Picker(props: { selected?: string | null | undefined; onSelectedChange?: ((selected: string | null) => void) | undefined }): null;'
      )
    ).toEqual([]);
    expect(
      vueSource(story('Picker', { selected: null }, [selected], 'vue'))
    ).toContain('const selected = ref<string | null>(null);');
    expect(
      svelteSource(story('Picker', { selected: null }, [selected], 'svelte'))
    ).toContain('let selected: string | null = null;');
  });

  it('keeps null as a bound prop’s starting state', () => {
    const selected = {
      prop: 'selected',
      changeProp: 'onSelectedChange',
      defaultProp: 'defaultSelected',
    };
    const react = reactSource(
      story('Grid', { selected: null, defaultSelected: 'a' }, [selected])
    );
    expect(react).toContain(
      "useState<ComponentProps<typeof Grid>['selected']>(null);"
    );
    expect(react).toContain(
      '<Grid selected={selected} onSelectedChange={setSelected} />'
    );
  });

  it('types the state by an exported type, importing it from the kit, with the prop’s own type as the fallback', () => {
    const date = {
      prop: 'value',
      changeProp: 'onValueChange',
      declaredType: 'DateInputValue',
    };
    const exported = (target: string) =>
      new Map([['DateInputValue', `kit/${target}`]]);
    const given = story('DateInput', { value: { day: '1' } }, [date]);
    const react = reactSource({ ...given, exportedTypes: exported('react') });
    expect(react).toBe(`import { useState } from 'react';
import { DateInput, type DateInputValue } from 'kit/react';

export function DateInputExample() {
  const [value, setValue] = useState<DateInputValue>({ day: '1' });

  return <DateInput value={value} onValueChange={setValue} />;
}
`);
    expect(
      reactErrors(
        react,
        'export interface DateInputValue { day?: string }\nexport function DateInput(props: { value?: DateInputValue; onValueChange?: (value: DateInputValue) => void }): null;'
      )
    ).toEqual([]);
    const vue = vueSource({
      ...given,
      imports: new Map([
        ['DateInput', { module: 'kit/vue', exported: 'DateInput' }],
      ]),
      exportedTypes: exported('vue'),
    });
    expect(vue).toContain(
      "import { DateInput, type DateInputValue } from 'kit/vue';"
    );
    expect(vue).toContain("const value = ref<DateInputValue>({ day: '1' });");
    compileVue(vue);
    const svelte = svelteSource({
      ...story('DateInput', { value: { day: '1' } }, [date], 'svelte'),
      exportedTypes: exported('svelte'),
      svelteMode: 'runes',
    });
    expect(svelte).toContain(
      "  import { DateInput, type DateInputValue } from 'kit/svelte';"
    );
    expect(svelte).toContain(
      "  let value = $state<DateInputValue>({ day: '1' });"
    );
    expect(svelte).not.toContain('ComponentProps');

    // A type from a module of its own gets an import of its own; one in a
    // union with the language's types is named as declared.
    const elsewhere = reactSource({
      ...story('DateInput', { value: null }, [
        { ...date, declaredType: 'DateInputValue | null' },
      ]),
      exportedTypes: new Map([['DateInputValue', 'kit/types']]),
    });
    expect(elsewhere).toContain(
      "import type { DateInputValue } from 'kit/types';"
    );
    expect(elsewhere).toContain('useState<DateInputValue | null>(null);');

    // A name the kit does not export falls back to the prop's own type.
    const unexported = reactSource({
      ...given,
      exportedTypes: new Map([['Other', 'kit/react']]),
    });
    expect(unexported).toContain(
      "useState<ComponentProps<typeof DateInput>['value']>({ day: '1' });"
    );
    expect(unexported).not.toContain('Other');
  });
});

describe('storySource', () => {
  let kitRoot: string;

  beforeAll(() => {
    kitRoot = mkdtempSync(join(tmpdir(), 'preview-source-'));
    writeSourceKit(kitRoot);
  });

  afterAll(() => {
    rmSync(kitRoot, { recursive: true, force: true });
  });

  it("prints the story file's story, leaving out declared defaults and preview-only hints", async () => {
    const { react } = await storySource(kitRoot, 'Badge', {
      targets: ['react'],
    });
    expect(react).toContain("import { Badge } from 'kit/react';");
    expect(react).toContain('return <Badge>new</Badge>;');
  });

  it('applies a scenario over the story', async () => {
    const sources = await storySource(kitRoot, 'Badge', { scenario: 'loud' });
    expect(Object.keys(sources)).toEqual(['react', 'vue', 'svelte', 'html']);
    expect(sources.svelte).toContain('<Badge tone="loud">new</Badge>');
    expect(sources.html).toBe('<span class="Badge">new</span>\n');
  });

  it('prints the markup a story renders to: kit helpers in scope, templates inline, a driver as its content inside a behavior comment', async () => {
    const { html } = await storySource(kitRoot, 'Notice', {
      targets: ['html'],
    });
    expect(html).toBe(
      [
        '<aside class="Notice Notice--urgent" role="alert"',
        '  ><span class="Badge">now</span',
        '  ><!-- component: DismissDriver (behavior not included) -->the line goes down<!-- /component --></aside>',
        '',
      ].join('\n')
    );
  });

  it('prints the html of slot content written per target', async () => {
    const { html } = await storySource(kitRoot, 'Prose', { targets: ['html'] });
    expect(html).toBe(
      '<div class="Prose"\n  ><section style="padding-left: 2ch; --tone: calm"><p>hi &amp; bye</p></section\n></div>\n'
    );
  });

  it('prints a fill given as template nodes: kit components rendered, the slot values read', async () => {
    // The fill spreads `select`, which reads the script's api: left out, and named.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { html, htmlWarnings } = await storySource(kitRoot, 'Picker', {
      targets: ['html'],
    });
    expect(htmlWarnings).toEqual([
      'Picker: could not evaluate api.select (api is not defined)',
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    expect(html).toBe(
      [
        '<ul',
        '  ><li',
        '    ><span class="Badge">tea</span',
        '  ></li',
        '  ><li',
        '    ><span class="Badge">coffee</span',
        '  ></li',
        '></ul>',
        '',
      ].join('\n')
    );
  });

  it('prints no html for a story with a part that has no markup, and says which', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sources = await storySource(kitRoot, 'Panel');
    expect(sources.html).toBeUndefined();
    expect(sources.react).toBeDefined();
    expect(warn).toHaveBeenCalledWith(
      '[preview] Panel has no html source: it holds TimerDriver, a component with no template that handWrittenComponents does not map; a raw slot fill with no html'
    );
    warn.mockRestore();
  });

  it('names what the html cannot work out at rest, returned and printed once per story', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sources = await storySource(kitRoot, 'Disclosure', {
      scenario: 'other',
    });
    // The class and the panel read the script's isOpen, so both are left out.
    expect(sources.html).toBe(
      '<div class="Disclosure"\n  ><button aria-label="more">toggle</button\n></div>\n'
    );
    expect(sources.htmlWarnings).toEqual([
      'Disclosure: could not evaluate !isOpen() (isOpen is not defined)',
      'Disclosure: could not evaluate isOpen() (isOpen is not defined)',
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      [
        "[preview] Disclosure's html leaves out what it cannot evaluate at rest:",
        // Two for one reason print as one line counting them.
        '  could not evaluate 2 expressions (isOpen is not defined)',
      ].join('\n')
    );
    warn.mockRestore();
  });

  it('returns no html warnings for a story whose html leaves nothing out, or without html', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect('htmlWarnings' in (await storySource(kitRoot, 'Badge'))).toBe(false);
    expect(
      'htmlWarnings' in
        (await storySource(kitRoot, 'Disclosure', { targets: ['react'] }))
    ).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('prints a hand-written component as the template the kit maps it to', async () => {
    const { html } = await storySource(kitRoot, 'Sorter', {
      targets: ['html'],
    });
    expect(html).toBe(
      [
        '<!-- component: Sorter (behavior not included) --><ul class="SorterVisual" aria-label="tasks"><li>first</li></ul',
        '><!-- /component -->',
        '',
      ].join('\n')
    );
  });

  it('prints no html for a hand-written component the kit does not map', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { html } = await storySource(kitRoot, 'Shuffler', {
      targets: ['html'],
    });
    expect(html).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      '[preview] Shuffler has no html source: it holds Shuffler, a component with no template that handWrittenComponents does not map; a scoped slot fill (item) with no html'
    );
    warn.mockRestore();
  });

  it("prints a part's html unrolled over the data it is called with", async () => {
    const { html } = await storySource(kitRoot, 'Outline', {
      targets: ['html'],
    });
    expect(html).toBe(
      [
        '<div class="Outline"',
        '  ><ul',
        '    ><li',
        '      ><span class="Badge">docs</span',
        '      ><ul',
        '        ><li',
        '          ><span class="Badge">guides</span',
        '          ><ul></ul',
        '        ></li',
        '      ></ul',
        '    ></li',
        '    ><li',
        '      ><span class="Badge">src</span',
        '      ><ul></ul',
        '    ></li',
        '  ></ul',
        '></div>',
        '',
      ].join('\n')
    );
  });

  it('prints no html for a part with none, and says which', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { html } = await storySource(kitRoot, 'Bare', { targets: ['html'] });
    expect(html).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      '[preview] Bare has no html source: it holds the part Branch, with no html'
    );
    warn.mockRestore();
  });

  it('fails on an unknown component or scenario', async () => {
    await expect(storySource(kitRoot, 'Nope')).rejects.toThrow(
      /no component named Nope/
    );
    await expect(
      storySource(kitRoot, 'Badge', { scenario: 'nope' })
    ).rejects.toThrow(/has no scenario 'nope'; it has 'loud'/);
  });
});

describe('storySource - a Tailwind kit with styles output', () => {
  // A conditional utility, which the extension warns stays unconverted: a
  // notice for the kit's build, not an expression the html leaves out.
  const chip: Template = {
    type: 'component',
    name: 'Chip',
    props: { active: { type: 'boolean' } },
    children: [
      {
        type: 'element',
        tag: 'span',
        attributes: { class: 'px-2' },
        conditionalAttributes: [
          { condition: 'active', attributes: { class: ['bg-red-500'] } },
        ],
        children: [{ type: 'slot' }],
      },
    ],
  };
  let kitRoot: string;

  beforeAll(() => {
    kitRoot = mkdtempSync(join(tmpdir(), 'preview-source-tailwind-'));
    const write = (path: string, content: string): void => {
      mkdirSync(join(kitRoot, path, '..'), { recursive: true });
      writeFileSync(join(kitRoot, path), content);
    };
    write(
      'scaffold-ui-kit.json',
      JSON.stringify({
        name: 'kit',
        targets: ['react', 'vue', 'svelte'],
        styling: ['tailwind'],
        tailwind: { output: 'styles' },
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
        },
      })
    );
    write('preview/shell.ts', 'export {};\n');
    write(
      'src/components/chip.ts',
      `export default ${JSON.stringify(chip)};\n`
    );
    write(
      'preview/stories/Chip.story.ts',
      "export default { defaultProps: { active: true, children: 'new' } };\n"
    );
  });

  afterAll(() => {
    rmSync(kitRoot, { recursive: true, force: true });
  });

  it('names no styling notice among the html warnings', async () => {
    // The render itself does warn, without an evaluation kind.
    const rendered = renderInstance(chip, {
      props: { active: true },
      extensions: [tailwind({ output: 'styles' })],
    });
    expect(rendered.warnings.length).toBeGreaterThan(0);
    expect(
      rendered.warnings.some((warning) => warning.kind === 'unevaluated')
    ).toBe(false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sources = await storySource(kitRoot, 'Chip', { targets: ['html'] });
    expect(sources.html).toBeDefined();
    expect(sources.htmlWarnings).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('a React body of several root nodes', () => {
  // A body of sibling roots is no JSX expression: React takes it in a
  // fragment, while Vue and Svelte slots take the siblings as they are.
  const dialog: SourceStory = {
    component: 'Dialog',
    props: { label: 'empty trash' },
    named: {
      actions: {
        kind: 'scoped',
        slot: { react: 'actions', vue: 'actions', svelte: 'actions' },
        parameters: ['closeProps'],
        react:
          '<Button {...closeProps} label="keep" /><Button {...closeProps} label="empty trash" />',
        vue: '<Button v-bind="closeProps" label="keep" /><Button v-bind="closeProps" label="empty trash" />',
        svelte:
          '<Button {...closeProps} label="keep" /><Button {...closeProps} label="empty trash" />',
      },
    },
    imports: new Map([
      ['Dialog', { module: 'kit/react', exported: 'Dialog' }],
      ['Button', { module: 'kit/react', exported: 'Button' }],
    ]),
  };
  const kit = [
    'import type { ReactNode } from "react";',
    'export function Dialog(props: { label?: string; actions?: (scope: { closeProps: Record<string, unknown> }) => ReactNode; children?: ReactNode }): ReactNode;',
    'export function Button(props: { label?: string; [attribute: string]: unknown }): ReactNode;',
  ].join('\n');

  it('prints a scoped fill of sibling roots in a fragment, compiling under strict TypeScript', () => {
    const react = reactSource(dialog);
    expect(react).toContain(
      'actions={({ closeProps }) => <><Button {...closeProps} label="keep" /><Button {...closeProps} label="empty trash" /></>}'
    );
    expect(reactErrors(react, kit)).toEqual([]);
  });

  it('prints a scoped fill as a render function child in a fragment too', () => {
    const story: SourceStory = {
      ...dialog,
      named: {
        children: {
          ...dialog.named.actions,
          slot: { react: 'children', vue: 'default', svelte: 'children' },
        } as SlotFill,
      },
    };
    const childKit = kit.replace(
      'children?: ReactNode',
      'children?: (scope: { closeProps: Record<string, unknown> }) => ReactNode'
    );
    const react = reactSource(story);
    expect(react).toContain(
      '{({ closeProps }) => <><Button {...closeProps} label="keep" /><Button {...closeProps} label="empty trash" /></>}'
    );
    expect(reactErrors(react, childKit)).toEqual([]);
  });

  it('leaves the siblings bare in Vue and Svelte', () => {
    expect(vueSource(dialog)).toContain(
      '<Button v-bind="closeProps" label="keep" /><Button v-bind="closeProps" label="empty trash" />'
    );
    expect(vueSource(dialog)).not.toContain('<>');
    expect(svelteSource(dialog)).toContain(
      '<Button {...closeProps} label="keep" /><Button {...closeProps} label="empty trash" />'
    );
    expect(svelteSource(dialog)).not.toContain('<>');
  });

  it('prints a scoped fill of text, or text beside an element, in a fragment', () => {
    const withBody = (react: string): SourceStory => ({
      ...dialog,
      named: { actions: { ...dialog.named.actions, react } as SlotFill },
    });
    const text = reactSource(withBody('{closeProps.id}'));
    expect(text).toContain(
      'actions={({ closeProps }) => <>{closeProps.id}</>}'
    );
    expect(reactErrors(text, kit)).toEqual([]);
    const mixed = reactSource(
      withBody('closes {closeProps.id} <Button {...closeProps} label="keep" />')
    );
    expect(mixed).toContain(
      'actions={({ closeProps }) => <>closes {closeProps.id} <Button {...closeProps} label="keep" /></>}'
    );
    expect(reactErrors(mixed, kit)).toEqual([]);
    expect(reactSource(withBody('closeProps.id'))).toContain(
      'actions={({ closeProps }) => closeProps.id}'
    );
  });

  it('returns a part body of sibling roots in a fragment', () => {
    const story: SourceStory = {
      ...dialog,
      named: {},
      children: {
        kind: 'part',
        name: 'Pair',
        parameters: ['first'],
        parameterTypes: { first: 'string' },
        props: { first: 'keep' },
        react: '<Button label={first} /><Button label="empty trash" />',
        vue: '<Button :label="first" /><Button label="empty trash" />',
        svelte: '<Button label={first} /><Button label="empty trash" />',
      },
    };
    const react = reactSource(story);
    expect(react).toContain(
      '<><Button label={first} /><Button label="empty trash" /></>'
    );
    expect(reactErrors(react, kit)).toEqual([]);
  });
});

describe('storySource - an unfilled default slot', () => {
  let kitRoot: string;

  beforeAll(() => {
    kitRoot = mkdtempSync(join(tmpdir(), 'preview-source-unfilled-'));
    const write = (path: string, content: string): void => {
      mkdirSync(join(kitRoot, path, '..'), { recursive: true });
      writeFileSync(join(kitRoot, path), content);
    };
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
              storiesDirectory: 'preview/stories',
            },
          ],
        },
      })
    );
    write('preview/shell.ts', 'export {};\n');
    write(
      'src/components/summary.ts',
      `export default { type: 'component', name: 'Summary', props: { title: { type: 'string' } }, children: [{ type: 'element', tag: 'div', attributes: { class: 'Summary' }, children: [{ type: 'slot' }] }] };\n`
    );
    // Props and a scenario, but nothing for the default slot.
    write(
      'preview/stories/Summary.story.ts',
      "export default { defaultProps: { title: 'Problems' }, scenarios: [{ id: 'given', props: { children: 'Fix these' } }] };\n"
    );
  });

  afterAll(() => {
    rmSync(kitRoot, { recursive: true, force: true });
  });

  it("prints no content where the preview shows the component's name", async () => {
    const sources = await storySource(kitRoot, 'Summary');
    expect(sources.react).toContain('return <Summary title="Problems" />;');
    expect(sources.vue).toContain('<Summary title="Problems" />');
    expect(sources.svelte).toContain('<Summary title="Problems" />');
    expect(sources.html).toBe('<div class="Summary"></div>\n');
  });

  it('prints the text a scenario gives the slot', async () => {
    const { react, html } = await storySource(kitRoot, 'Summary', {
      scenario: 'given',
      targets: ['react', 'html'],
    });
    expect(react).toContain('<Summary title="Problems">Fix these</Summary>');
    expect(html).toBe('<div class="Summary">Fix these</div>\n');
  });
});
