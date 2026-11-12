// Every entry loads through require as well as import: Playwright compiles a
// kit's .ts specs to CommonJS and resolves their imports with require, so an
// entry offering only the import condition would not resolve from a spec.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

describe('the package entries', () => {
  it.each(['render', 'parity', 'typecheck', 'browser'])(
    '%s loads through a CommonJS require',
    (entry) => {
      const script = `const entry = require('@scaffold-ui-kit/testing/${entry}'); process.stdout.write(String(Object.keys(entry).length > 0));`;
      const output = execFileSync(
        process.execPath,
        ['--input-type=commonjs', '-e', script],
        {
          cwd: packageRoot,
          encoding: 'utf8',
        }
      );
      expect(output).toBe('true');
    }
  );

  it('keeps the internals off the public entries', async () => {
    const render = await import('../src/render/index.js');
    const parity = await import('../src/parity/index.js');
    const browser = await import('../src/browser/index.js');
    expect(Object.keys(render)).not.toContain('renderComponent');
    expect(Object.keys(parity)).not.toContain('decodeCharacterReferences');
    expect(Object.keys(browser)).not.toContain('violationKey');
  });
});
