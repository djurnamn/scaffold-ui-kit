// How React takes the attributes a story gives a component
// (src/lib/react-spelling.ts), with the React extension's own table of the
// attributes React renames.

import { REACT_ATTRIBUTE_NAMES } from '@js-template-engine/extension-react';
import { describe, expect, it } from 'vitest';
import { declaredAttributes, reactFill, reactProps, styleProperties } from '../src/lib/react-spelling';

describe('reactProps', () => {
  it('spells class, a style string and every attribute React renames as React takes them, in their order', () => {
    expect(
      reactProps(
        { class: 'wide', tabindex: 0, for: 'email', readonly: true, style: 'font-weight: 600; --gap: 2px', label: 'Name' },
        () => false,
        REACT_ATTRIBUTE_NAMES,
      ),
    ).toEqual({
      className: 'wide',
      tabIndex: 0,
      htmlFor: 'email',
      readOnly: true,
      style: { fontWeight: '600', '--gap': '2px' },
      label: 'Name',
    });
  });

  it('joins a class given under both class and className, in their order', () => {
    expect(reactProps({ className: 'b', class: 'a' }, () => false, REACT_ATTRIBUTE_NAMES)).toEqual({ className: 'b a' });
    expect(reactProps({ class: 'a', className: '' }, () => false, REACT_ATTRIBUTE_NAMES)).toEqual({ className: 'a' });
  });

  it('keeps a name the component declares, a style object, and a name only an object inherits', () => {
    const style = { color: 'red' };
    expect(
      reactProps({ for: 'kept', class: 'kept', style, constructor: 'kept' }, (name) => name === 'for' || name === 'class', REACT_ATTRIBUTE_NAMES),
    ).toEqual({ for: 'kept', class: 'kept', style, constructor: 'kept' });
  });
});

describe('reactFill', () => {
  it("spells each component's attributes through the tree, and renames an html element's attributes, leaving class and style to the emitters", () => {
    const fill = reactFill(
      {
        kind: 'fragment',
        children: [
          { kind: 'element', component: 'Label', props: { for: 'a' }, children: { kind: 'element', component: 'Icon', props: { tabindex: -1 } } },
          { kind: 'html', tag: 'label', props: { for: 'width', class: 'note', tabindex: 0, style: 'color: red' }, children: { kind: 'element', component: 'Icon', props: { for: 'x' } } },
        ],
      },
      (component, name) => component === 'Icon' && name === 'tabindex',
      REACT_ATTRIBUTE_NAMES,
    );
    expect(fill).toEqual({
      kind: 'fragment',
      children: [
        { kind: 'element', component: 'Label', props: { htmlFor: 'a' }, children: { kind: 'element', component: 'Icon', props: { tabindex: -1 } } },
        {
          kind: 'html',
          tag: 'label',
          props: { htmlFor: 'width', class: 'note', tabIndex: 0, style: 'color: red' },
          children: { kind: 'element', component: 'Icon', props: { htmlFor: 'x' } },
        },
      ],
    });
  });
});

describe('styleProperties and declaredAttributes', () => {
  it('keeps a ; inside quotes or parentheses, drops !important, and spells vendor prefixes as React does', () => {
    expect(
      styleProperties(
        `background: url("data:image/png;base64,AAA") no-repeat; content: 'a;b'; color: red !important; -ms-overflow-style: none; -webkit-line-clamp: 2`,
      ),
    ).toEqual({
      background: 'url("data:image/png;base64,AAA") no-repeat',
      content: "'a;b'",
      color: 'red',
      msOverflowStyle: 'none',
      WebkitLineClamp: '2',
    });
  });

  it('reads declarations, skipping empty ones', () => {
    expect(styleProperties(' padding-inline : 1ch ;; --Gap: 2px; nonsense')).toEqual({ paddingInline: '1ch', '--Gap': '2px' });
  });

  it('names the declared props React would otherwise respell', () => {
    expect(declaredAttributes(['label', 'for', 'style', 'class', 'tabindex', 'constructor'], REACT_ATTRIBUTE_NAMES)).toEqual([
      'for',
      'style',
      'class',
      'tabindex',
    ]);
  });
});
