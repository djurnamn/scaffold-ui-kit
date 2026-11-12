import { describe, expect, it } from 'vitest';

import { definePreamble } from '../src/template/index.js';

describe('definePreamble', () => {
  const stylePreamble = definePreamble({
    always: ['@use "styles/layer-order";'],
    modules: {
      mixins: '@use "styles/mixins" as *;',
      color: '@use "styles/color" as color;',
    },
  });

  it('opens with the lines every stylesheet carries, then the modules asked for, in order', () => {
    expect(stylePreamble('color', 'mixins')).toBe(
      [
        '@use "styles/layer-order";',
        '@use "styles/color" as color;',
        '@use "styles/mixins" as *;',
      ].join('\n')
    );
  });

  it('is the shared lines alone when no module is asked for', () => {
    expect(stylePreamble()).toBe('@use "styles/layer-order";');
  });

  it('loads a module once however often it is named', () => {
    expect(stylePreamble('color', 'color')).toBe(
      ['@use "styles/layer-order";', '@use "styles/color" as color;'].join('\n')
    );
  });

  it('takes a preamble of shared lines only', () => {
    const constant = definePreamble({
      always: [
        '@use "pkg:kit/styles/slots";',
        '@use "pkg:kit/styles/mixins" as *;',
      ],
    });
    expect(constant()).toBe(
      '@use "pkg:kit/styles/slots";\n@use "pkg:kit/styles/mixins" as *;'
    );
  });

  it('refuses a module it does not know, naming the ones it does', () => {
    expect(() =>
      (stylePreamble as (...names: string[]) => string)('typography')
    ).toThrow(
      'no module named "typography"; the preamble knows "mixins", "color"'
    );
  });
});
