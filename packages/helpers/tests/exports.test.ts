// Every entry resolves through require as well as import: Playwright compiles
// a project's .ts specs to CommonJS and resolves their imports with require,
// so an entry offering only the import condition would not resolve from a
// spec. The framework-free entries load there too.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

const runCommonJs = (script: string): string =>
  execFileSync(process.execPath, ['--input-type=commonjs', '-e', script], {
    cwd: packageRoot,
    encoding: 'utf8',
  });

describe('the package entries', () => {
  it.each(['template', 'runtime', 'zag'])(
    '%s loads through a CommonJS require',
    (entry) => {
      expect(
        runCommonJs(
          `process.stdout.write(String(Object.keys(require('@scaffold-ui-kit/helpers/${entry}')).length > 0));`
        )
      ).toBe('true');
    }
  );

  it.each(['runtime/svelte', 'zag/svelte'])(
    '%s resolves through a CommonJS require',
    (entry) => {
      expect(
        runCommonJs(
          `process.stdout.write(require.resolve('@scaffold-ui-kit/helpers/${entry}'));`
        )
      ).toMatch(/dist\//);
    }
  );
});
