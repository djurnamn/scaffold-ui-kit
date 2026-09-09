import { process } from '@js-template-engine/core';
import { describe, expect, it } from 'vitest';

import type { KitConfiguration } from '../src/configuration';
import { buildExtensions } from '../src/extensions';

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

  it('forwards bemMode: runtime to the BEM extension', () => {
    const [styling] = buildExtensions('react', {
      ...baseConfiguration,
      bemMode: 'runtime',
      bemImportSource: '@scope/bem',
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

  it('forwards svelteMode: runes to the Svelte extension', () => {
    const extensions = buildExtensions('svelte', {
      ...baseConfiguration,
      targets: ['svelte'],
      styling: [],
      svelteMode: 'runes',
    });
    const [file] = process(buttonTemplate, { extensions }).files;
    expect(file.content).toMatch(/\$props\(\)|svelte:options/);
  });
});
