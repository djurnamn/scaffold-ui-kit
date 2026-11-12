import { process, validateTemplate } from '@js-template-engine/core';
import { describe, expect, it } from 'vitest';

import type { KitConfiguration } from '../src/configuration';
import { buildExtensions, everyTargetExtension } from '../src/extensions';

const baseConfiguration: KitConfiguration = {
  name: 'kit',
  targets: ['react'],
  styling: ['bem'],
};

const buttonTemplate = {
  type: 'component' as const,
  name: 'Button',
  children: [{ type: 'element' as const, tag: 'button' }],
};

describe('buildExtensions', () => {
  it('builds a literal-mode BEM extension by default', () => {
    const [styling] = buildExtensions('react', baseConfiguration);
    // The runtime hook is only present in runtime mode.
    expect((styling as { runtime?: unknown }).runtime).toBeUndefined();
  });

  it('forwards the bem block to the BEM extension', () => {
    const [styling] = buildExtensions('react', {
      ...baseConfiguration,
      bem: { mode: 'runtime', importSource: '@scope/bem' },
    });
    const runtime = (styling as { runtime?: { importSource: string } }).runtime;
    expect(runtime).toBeDefined();
    expect(runtime?.importSource).toBe('@scope/bem');
  });

  it('builds a legacy-mode Svelte extension by default', () => {
    const extensions = buildExtensions('svelte', {
      ...baseConfiguration,
      targets: ['svelte'],
      styling: [],
    });
    const [file] = process(buttonTemplate, { extensions }).files;
    expect(file.content).not.toContain('$props()');
    expect(file.content).not.toContain('svelte:options');
  });

  it('forwards the svelte block to the Svelte extension', () => {
    const extensions = buildExtensions('svelte', {
      ...baseConfiguration,
      targets: ['svelte'],
      styling: [],
      svelte: { mode: 'runes' },
    });
    const [file] = process(buttonTemplate, { extensions }).files;
    expect(file.content).toMatch(/\$props\(\)|svelte:options/);
  });
});

describe('reserved names across targets', () => {
  const withProp = (name: string) => ({
    ...buttonTemplate,
    props: { [name]: { type: 'string' } },
  });

  it("reserves every target's names in each target's build", () => {
    // `useAttrs` is a name only the Vue output declares, `props` only React's.
    for (const target of ['react', 'vue', 'svelte', 'html'] as const) {
      const extensions = buildExtensions(target, {
        ...baseConfiguration,
        styling: [],
      });
      for (const name of ['useAttrs', 'props', 'restProperties']) {
        expect(() =>
          process(withProp(name), {
            extensions,
            reserveNamesOf: everyTargetExtension(),
          })
        ).toThrowError(`The prop '${name}' takes the name of`);
      }
    }
  });

  it("steers each target's prop aliases clear of every target's names", () => {
    const extensions = buildExtensions('react', {
      ...baseConfiguration,
      styling: [],
    });
    const template = {
      ...buttonTemplate,
      props: { 'use-attrs': { type: 'string' } },
    };
    const [file] = process(template, {
      extensions,
      reserveNamesOf: everyTargetExtension(),
    }).files;
    expect(file.content).toContain("'use-attrs': useAttrsProp");
    // A build reserving only its own target's names aliases it plainly.
    const [plain] = process(template, { extensions }).files;
    expect(plain.content).toContain("'use-attrs': useAttrs ");
  });
});

describe('everyTargetExtension', () => {
  it("leaves buildExtensions with only the build's own extensions", () => {
    expect(
      buildExtensions('react', baseConfiguration).map(({ key }) => key)
    ).toEqual(['bem', 'react']);
  });

  it('validates a template for every target', () => {
    const template = {
      ...buttonTemplate,
      props: {
        'aria-pressed': { type: 'boolean' },
        ariaPressed: { type: 'boolean' },
      },
    };
    expect(() =>
      validateTemplate(template, { extensions: everyTargetExtension() })
    ).toThrowError("in Vue, which camelizes a prop's name");
    expect(() => validateTemplate(template)).not.toThrow();
  });
});
