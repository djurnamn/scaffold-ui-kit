import { describe, expect, it } from 'vitest';

import type { KitConfiguration } from '../src/configuration';
import { buildExtensions } from '../src/extensions';

const baseConfiguration: KitConfiguration = {
  name: 'kit',
  targets: ['react'],
  styling: ['bem'],
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
});
