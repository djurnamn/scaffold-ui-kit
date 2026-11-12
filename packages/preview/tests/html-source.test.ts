// The html source's generated markers (D53): a template without a component
// node marks its elements under the name the kit's build gives it, derived
// from its file, so the markup matches the kit's stylesheet - however the
// story reaches the template.

import type { Template } from '@js-template-engine/types';
import { describe, expect, it } from 'vitest';
import { htmlSource } from '../src/emit/html-source';
import type { EnumeratedComponent } from '../src/lib/types';
import { componentNameFromFile } from '../src/lib/naming';

const bareGrid: Template = [
  {
    type: 'element',
    tag: 'div',
    attributes: { style: { display: 'grid' } },
  },
];

function component(
  name: string,
  file: string,
  template?: Template
): EnumeratedComponent {
  return {
    name,
    file,
    ...(template === undefined ? {} : { template }),
    props: {},
    hasDefaultSlot: false,
    slotNames: [],
  };
}

describe('htmlSource markers', () => {
  it("marks a bare template reached through a hand-written mapping under the build's name", () => {
    const grid = component('Grid', 'layouts/2up.grid.ts', bareGrid);
    const card = component('Card', 'card.manual.ts');
    const result = htmlSource({
      component: card,
      props: {},
      named: {},
      components: [grid, card],
      styling: { extensions: [], placement: 'in-file' },
      scope: {},
      handWrittenComponents: { Card: 'Grid' },
    });
    expect(result.markup).toContain('data-jte-node="_2upGrid-0"');
    expect(result.markup).not.toContain('Card-0');
  });

  it("marks the story's own bare template under the build's name", () => {
    const grid = component('Grid', 'stat-grid.ts', bareGrid);
    const result = htmlSource({
      component: grid,
      props: {},
      named: {},
      components: [grid],
      styling: { extensions: [], placement: 'in-file' },
      scope: {},
      handWrittenComponents: {},
    });
    expect(result.markup).toContain('data-jte-node="StatGrid-0"');
  });
});

describe('htmlSource attributes', () => {
  it('keeps a style declaration whose value holds a `;` inside quotes or parentheses', () => {
    const card = component('Card', 'card.ts', [
      { type: 'element', tag: 'div', children: [{ type: 'slot' }] },
    ]);
    const result = htmlSource({
      component: card,
      props: {},
      children: {
        kind: 'html',
        tag: 'p',
        props: {
          style:
            'background: url("data:image/svg+xml;base64,AAA="); color: red',
        },
      },
      named: {},
      components: [card],
      styling: { extensions: [], placement: 'in-file' },
      scope: {},
      handWrittenComponents: {},
    });
    expect(result.markup).toContain(
      'style="background: url(&quot;data:image/svg+xml;base64,AAA=&quot;); color: red"'
    );
  });
});

describe('componentNameFromFile', () => {
  it("follows scaffold-ui-kit's componentNameFromFilePath", () => {
    expect(componentNameFromFile('theme-toggle.ts')).toBe('ThemeToggle');
    expect(componentNameFromFile('nested/stat_grid.ts')).toBe('StatGrid');
    expect(componentNameFromFile('2up.grid.ts')).toBe('_2upGrid');
    expect(componentNameFromFile('---.ts')).toBe('Component');
  });
});
