import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixtures/consumer');
const vueFixture = join(here, 'fixtures/consumer-vue');
const require = createRequire(import.meta.url);
const tsc = require.resolve('typescript/bin/tsc');
const vueTsc = require.resolve('vue-tsc/bin/vue-tsc.js');

/** Run tsc over one of the fixture's tsconfigs. */
function typeCheck(tsconfig: string) {
  return spawnSync(process.execPath, [tsc, '-p', join(fixture, tsconfig)], {
    encoding: 'utf8',
  });
}

/** Run vue-tsc over one of the Vue fixture's tsconfigs. */
function vueTypeCheck(tsconfig: string) {
  return spawnSync(
    process.execPath,
    [vueTsc, '--noEmit', '-p', join(vueFixture, tsconfig)],
    { encoding: 'utf8' }
  );
}

describe('tsconfig.consumer.json', () => {
  it('type-checks a file that holds to its flags', () => {
    const run = typeCheck('tsconfig.json');
    expect(run.stdout + run.stderr).toBe('');
    expect(run.status).toBe(0);
  }, 60_000);

  it("turns on vue-tsc's strict template checks", () => {
    const preset = JSON.parse(
      readFileSync(join(here, '../tsconfig.consumer.json'), 'utf8')
    ) as { vueCompilerOptions?: { strictTemplates?: boolean } };
    expect(preset.vueCompilerOptions?.strictTemplates).toBe(true);
  });

  it('accepts data attributes in a Vue template, bound and on an SVG element', () => {
    const run = vueTypeCheck('tsconfig.json');
    expect(run.stdout + run.stderr).not.toContain('error TS');
    expect(run.status).toBe(0);
  }, 120_000);

  it('still reports a wrong prop on a composed Vue component', () => {
    const run = vueTypeCheck('tsconfig.wrong-prop.json');
    expect(run.status).not.toBe(0);
    expect(run.stdout).toContain("'wrongProp' does not exist in type");
  }, 120_000);

  it('reads an indexed element as possibly undefined', () => {
    const run = typeCheck('tsconfig.unchecked.json');
    expect(run.status).not.toBe(0);
    expect(run.stdout).toContain(
      "error TS2322: Type 'string | undefined' is not assignable to type 'string'."
    );
  }, 60_000);
});
