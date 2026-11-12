// The kit the source tests print from: a template with a declared default
// and a hinted size, a template calling a kit helper and a hand-written
// driver, hand-written components the kit maps and one it does not, a scoped
// fill given as template nodes, a raw fill with html and one without, and a
// part that calls itself for a tree, with html and without, a template
// reading state its script holds, and a two-way prop typed by an exported
// type.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Write the source kit under `kitRoot`.
 *
 * @param kitRoot - An empty directory to write the kit into.
 */
export function writeSourceKit(kitRoot: string): void {
  const write = (path: string, content: string): void => {
    mkdirSync(join(kitRoot, path, '..'), { recursive: true });
    writeFileSync(join(kitRoot, path), content);
  };
  // A TypeScript configuration, so the control hints can hold the function
  // only Node reads.
  const configuration = {
    name: 'kit',
    targets: ['react', 'vue', 'svelte'],
    styling: ['bem'],
    stylesheetPlacement: 'separate-file',
    add: { shared: [{ source: 'src/scripts', specifier: 'kit/scripts' }] },
    preview: {
      shell: 'preview/shell.ts',
      handWrittenComponents: { DismissDriver: 'content', Sorter: { template: 'SorterVisual', slots: { row: 'items' } } },
      sources: [
        { id: 'kit', label: 'kit', order: 0, moduleBase: 'kit', templatesDirectory: 'src/components', manualModule: 'preview/manual.ts', storiesDirectory: 'preview/stories' },
      ],
    },
  };
  write(
    'scaffold-ui-kit.ts',
    `const configuration = ${JSON.stringify(configuration)};
export default { ...configuration, preview: { ...configuration.preview, controlHints: { componentSizeRem: () => 0.75 } } };
`,
  );
  write('preview/shell.ts', 'export {};\n');
  write(
    'src/components/badge.ts',
    `export default {
  type: 'component',
  name: 'Badge',
  props: { tone: { type: "'calm' | 'loud'", default: 'calm' }, size: { type: 'number' } },
  children: [{ type: 'element', tag: 'span', extensions: { bem: { block: 'Badge' } }, children: [{ type: 'slot' }] }],
};
`,
  );
  write('src/scripts/index.ts', "export const noticeRole = (urgent: boolean) => (urgent ? 'alert' : 'status');\n");
  write(
    'src/components/notice.ts',
    `export default {
  type: 'component',
  name: 'Notice',
  imports: ["import { noticeRole } from 'kit/scripts';"],
  props: { urgent: { type: 'boolean' } },
  children: [
    {
      type: 'element',
      tag: 'aside',
      extensions: { bem: { block: 'Notice' } },
      attributes: { role: { $expression: 'noticeRole(urgent)' } },
      conditionalAttributes: [{ condition: 'urgent', attributes: { class: ['Notice--urgent'] } }],
      children: [
        { type: 'element', tag: 'Badge', attributes: { tone: 'loud' }, children: [{ type: 'text', content: 'now' }] },
        { type: 'element', tag: 'DismissDriver', children: [{ type: 'slot' }] },
      ],
    },
  ],
};
`,
  );
  write(
    'preview/stories/Notice.story.ts',
    `export default { defaultProps: { urgent: true, children: 'the line goes down' } };\n`,
  );
  write(
    'preview/manual.ts',
    `export default () => [
  { name: 'Sorter', file: 'drivers/<target>/Sorter', props: { label: { type: 'string' } }, slotNames: ['row'] },
  { name: 'Shuffler', file: 'drivers/<target>/Shuffler', props: {}, slotNames: ['row'] },
];
`,
  );
  write(
    'src/components/sorter-visual.ts',
    `export default {
  type: 'component',
  name: 'SorterVisual',
  props: { label: { type: 'string' } },
  children: [{ type: 'element', tag: 'ul', extensions: { bem: { block: 'SorterVisual' } }, attributes: { 'aria-label': { $expression: 'label' } }, children: [{ type: 'slot', name: 'items' }] }],
};
`,
  );
  write(
    'preview/stories/Sorter.story.ts',
    `export default {
  defaultProps: { label: 'tasks' },
  slots: { named: { row: { kind: 'scoped', slot: { react: 'row', vue: 'row', svelte: 'row' }, parameters: ['item'], react: '<li />', vue: '<li />', svelte: '<li />', html: '<li>first</li>' } } },
};
`,
  );
  write(
    'preview/stories/Shuffler.story.ts',
    `export default {
  slots: { named: { row: { kind: 'scoped', slot: { react: 'row', vue: 'row', svelte: 'row' }, parameters: ['item'], react: '<li />', vue: '<li />', svelte: '<li />' } } },
};
`,
  );
  write(
    'src/components/picker.ts',
    `export default {
  type: 'component',
  name: 'Picker',
  props: { options: { type: 'string[]' } },
  children: [
    {
      type: 'element',
      tag: 'ul',
      children: [
        {
          type: 'iteration',
          items: 'options',
          item: 'option',
          children: [{ type: 'element', tag: 'li', children: [{ type: 'slot', name: 'option', exposes: { value: 'option', select: 'api.select' } }] }],
        },
      ],
    },
  ],
};
`,
  );
  write(
    'preview/stories/Picker.story.ts',
    `export default {
  defaultProps: { options: ['tea', 'coffee'] },
  slots: {
    named: {
      option: {
        kind: 'scoped',
        slot: { react: 'renderOption', vue: 'option', svelte: 'option' },
        parameters: ['value', 'select'],
        react: '<Badge>{value}</Badge>',
        vue: '<Badge>{{ value }}</Badge>',
        svelte: '<Badge>{value}</Badge>',
        html: [{ type: 'element', tag: 'Badge', attributes: { $spread: { $expression: 'select' } }, children: [{ type: 'text', expression: 'value' }] }],
      },
    },
  },
};
`,
  );
  write(
    'src/components/prose.ts',
    `export default {
  type: 'component',
  name: 'Prose',
  children: [{ type: 'element', tag: 'div', extensions: { bem: { block: 'Prose' } }, children: [{ type: 'slot' }] }],
};
`,
  );
  write(
    'preview/stories/Prose.story.ts',
    `export default {
  slots: {
    default: {
      kind: 'html',
      tag: 'section',
      props: { style: 'padding-left: 2ch; --tone: calm' },
      children: { kind: 'raw', react: '<p>hi</p>', vue: '<p>hi</p>', svelte: '<p>hi</p>', html: '<p>hi &amp; bye</p>' },
    },
  },
};
`,
  );
  write(
    'src/components/panel.ts',
    `export default {
  type: 'component',
  name: 'Panel',
  children: [{ type: 'element', tag: 'div', children: [{ type: 'element', tag: 'TimerDriver' }, { type: 'slot' }] }],
};
`,
  );
  write(
    'preview/stories/Panel.story.ts',
    `export default { slots: { default: { kind: 'raw', react: '<b />', vue: '<b />', svelte: '<b />' } } };\n`,
  );
  write(
    'preview/stories/Badge.story.ts',
    `export default { defaultProps: { tone: 'calm', children: 'new' }, scenarios: [{ id: 'loud', props: { tone: 'loud' } }] };\n`,
  );
  write(
    'src/components/outline.ts',
    `export default {
  type: 'component',
  name: 'Outline',
  children: [{ type: 'element', tag: 'div', extensions: { bem: { block: 'Outline' } }, children: [{ type: 'slot' }] }],
};
`,
  );
  write('preview/stories/Outline.story.ts', `export default ${JSON.stringify({ slots: { default: BRANCH } }, null, 2)};\n`);
  write(
    'src/components/bare.ts',
    `export default { type: 'component', name: 'Bare', children: [{ type: 'element', tag: 'div', children: [{ type: 'slot' }] }] };\n`,
  );
  const { html: _html, ...withoutHtml } = BRANCH;
  write('preview/stories/Bare.story.ts', `export default ${JSON.stringify({ slots: { default: withoutHtml } })};\n`);
  // State its script holds, which the html cannot read at rest.
  write(
    'src/components/disclosure.ts',
    `export default {
  type: 'component',
  name: 'Disclosure',
  props: { label: { type: 'string' } },
  script: 'const isOpen = () => false;',
  children: [
    {
      type: 'element',
      tag: 'div',
      extensions: { bem: { block: 'Disclosure' } },
      conditionalAttributes: [{ condition: '!isOpen()', attributes: { class: ['Disclosure--closed'] } }],
      children: [
        { type: 'element', tag: 'button', attributes: { 'aria-label': { $expression: 'label' } }, children: [{ type: 'text', content: 'toggle' }] },
        { type: 'conditional', conditions: [{ statement: 'if', condition: 'isOpen()', children: [{ type: 'slot' }] }] },
      ],
    },
  ],
};
`,
  );
  write(
    'preview/stories/Disclosure.story.ts',
    `export default { defaultProps: { label: 'details', children: 'the fine print' }, scenarios: [{ id: 'other', props: { label: 'more' } }] };\n`,
  );
  // A two-way prop typed by a type its module exports, its default prop set
  // by the story file, and a scenario controlling it that unsets a prop with null.
  write(
    'src/components/date-field.ts',
    `export default {
  type: 'component',
  name: 'DateField',
  imports: ['export interface DateFieldValue { day?: string; month?: string }'],
  props: {
    label: { type: 'string' },
    value: {
      type: 'DateFieldValue',
      bindable: { current: 'date', setter: 'setDate', defaultProp: 'defaultValue', changeProp: 'onValueChange' },
    },
    defaultValue: { type: 'DateFieldValue', default: {} },
    onValueChange: { type: '(value: DateFieldValue) => void' },
  },
  children: [
    {
      type: 'element',
      tag: 'fieldset',
      attributes: { 'aria-label': { $expression: 'label' } },
      children: [{ type: 'text', expression: 'date.day' }],
    },
  ],
};
`,
  );
  write(
    'preview/stories/DateField.story.ts',
    `export default { defaultProps: { label: 'date', defaultValue: { day: '1' } }, scenarios: [{ id: 'controlled', props: { value: { day: '2' }, label: null } }] };\n`,
  );
}

/** A part that lists its items, each a Badge, and calls itself for each
 *  item's children, called with a tree two levels deep. */
export const BRANCH = {
  kind: 'part' as const,
  name: 'Branch',
  parameters: ['items'],
  props: {
    items: [
      { name: 'docs', children: [{ name: 'guides', children: [] }] },
      { name: 'src', children: [] },
    ],
  },
  react: '<ul>{items.map((item) => <li key={item.name}><Badge>{item.name}</Badge><Branch items={item.children} /></li>)}</ul>',
  vue: '<ul><li v-for="item in items" :key="item.name"><Badge>{{ item.name }}</Badge><Branch :items="item.children" /></li></ul>',
  svelte: '<ul>{#each items as item (item.name)}<li><Badge>{item.name}</Badge>{@render Branch({ items: item.children })}</li>{/each}</ul>',
  html: [
    {
      type: 'element' as const,
      tag: 'ul',
      children: [
        {
          type: 'iteration' as const,
          items: 'items',
          item: 'item',
          children: [
            {
              type: 'element' as const,
              tag: 'li',
              children: [
                { type: 'element' as const, tag: 'Badge', children: [{ type: 'text' as const, expression: 'item.name' }] },
                { type: 'element' as const, tag: 'Branch', attributes: { items: { $expression: 'item.children' } } },
              ],
            },
          ],
        },
      ],
    },
  ],
  imports: ['Badge'],
};
