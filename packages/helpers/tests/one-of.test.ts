import { describe, expect, it } from 'vitest';

import { oneOf } from '../src/template/index.js';

describe('oneOf - one declaration per condition, each exclusive of the others', () => {
  it('states each member against the ones that beat it, and none against all', () => {
    expect(
      oneOf(['--radius-inherit', '--rounded'], {
        none: { borderRadius: 'a' },
        '--radius-inherit': { borderRadius: 'b' },
        '--rounded': { borderRadius: 'c' },
      })
    ).toEqual({
      '&:where(:not(#{&}--radius-inherit, #{&}--rounded))': {
        borderRadius: 'a',
      },
      '&--radius-inherit:where(:not(#{&}--rounded))': { borderRadius: 'b' },
      '&--rounded': { borderRadius: 'c' },
    });
  });

  it('keeps the order of the axis as the precedence, whatever order the cases come in', () => {
    const keys = Object.keys(
      oneOf(['--compact', '--icon-only'], {
        '--icon-only': { padding: '0' },
        none: { padding: '1' },
        '--compact': { padding: '2' },
      })
    );
    expect(keys).toEqual([
      '&:where(:not(#{&}--compact, #{&}--icon-only))',
      '&--compact:where(:not(#{&}--icon-only))',
      '&--icon-only',
    ]);
  });

  it('takes any selector suffix as a member', () => {
    expect(
      oneOf([':empty', '[open]'], {
        none: { display: 'inline-flex' },
        ':empty': { display: 'none' },
        '[open]': { display: 'block' },
      })
    ).toEqual({
      '&:where(:not(#{&}:empty, #{&}[open]))': { display: 'inline-flex' },
      '&:empty:where(:not(#{&}[open]))': { display: 'none' },
      '&[open]': { display: 'block' },
    });
  });

  it("reaches an element of the block as the member's child, so a nested copy of the block keeps its own", () => {
    expect(
      oneOf(['--floating'], {
        none: { gap: '0.5rem', '&__label': { lineHeight: '1' } },
        '--floating': { '&__label': { margin: '0' } },
      })
    ).toEqual({
      '&:where(:not(#{&}--floating))': { gap: '0.5rem' },
      '&:where(:not(#{&}--floating)) > &__label': { lineHeight: '1' },
      '&--floating > &__label': { margin: '0' },
    });
  });

  it('states a deeper element as a path from the child', () => {
    expect(
      oneOf(['--vertical'], {
        '--vertical': { '&__handle > &__grip': { rotate: '90deg' } },
      })
    ).toEqual({ '&--vertical > &__handle > &__grip': { rotate: '90deg' } });
  });

  it('reaches an element as a descendant through a key that starts with "& "', () => {
    expect(
      oneOf(['--wide'], {
        none: { '& &__search': { display: 'none' } },
        '--wide': {
          '& &__search-toggle > &__search-icon--open': { display: 'block' },
        },
      })
    ).toEqual({
      '&:where(:not(#{&}--wide)) &__search': { display: 'none' },
      '&--wide &__search-toggle > &__search-icon--open': { display: 'block' },
    });
  });

  it("appends a pseudo-element or pseudo-class to the case's selector", () => {
    expect(
      oneOf(['--marked'], {
        none: { '&::before': { content: 'none' } },
        '--marked': { '&:hover::before': { content: '"*"' } },
      })
    ).toEqual({
      '&:where(:not(#{&}--marked))::before': { content: 'none' },
      '&--marked:hover::before': { content: '"*"' },
    });
  });

  it('joins each selector of a list on its own, leaving commas inside parentheses alone', () => {
    expect(
      oneOf(['--quiet'], {
        '--quiet': {
          '&__title, &__subtitle': { opacity: '0.6' },
          '&:is(:hover, :focus-visible)': { opacity: '1' },
        },
      })
    ).toEqual({
      '&--quiet > &__title, &--quiet > &__subtitle': { opacity: '0.6' },
      '&--quiet:is(:hover, :focus-visible)': { opacity: '1' },
    });
  });

  it('emits only the cases given', () => {
    expect(oneOf(['--a', '--b'], { '--a': { x: 1 } })).toEqual({
      '&--a:where(:not(#{&}--b))': { x: 1 },
    });
  });

  it('refuses a case that is not on the axis', () => {
    expect(() => oneOf(['--a'], { '--b': {} })).toThrow(
      '"--b" is not on the axis'
    );
  });
});
