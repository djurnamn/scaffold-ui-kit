import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { join, relative } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSvelteWarningCheck } from '../src/svelte-warnings';

const packageDirectory = join(__dirname, '..');

let kitDirectory: string;

beforeEach(() => {
  kitDirectory = mkdtempSync(join(packageDirectory, '.test-svelte-warnings-'));
  // The workspace's Svelte, installed in the kit as a kit targeting Svelte
  // installs it.
  mkdirSync(join(kitDirectory, 'node_modules'));
  symlinkSync(
    join(realpathSync(join(packageDirectory, 'node_modules')), 'svelte'),
    join(kitDirectory, 'node_modules', 'svelte'),
    'dir'
  );
});

afterEach(() => {
  rmSync(kitDirectory, { recursive: true, force: true });
});

const codes = (warnings: Array<{ code: string }>): string[] =>
  warnings.map((warning) => warning.code);

describe('createSvelteWarningCheck', () => {
  it('compiles in the kit mode', () => {
    const source = '<script>export let a;</script>\n<p>{a}</p>\n';
    const runes = createSvelteWarningCheck(kitDirectory, 'runes');
    const legacy = createSvelteWarningCheck(kitDirectory, 'legacy');
    expect(codes(runes?.(source, 'A.svelte') ?? [])).toContain(
      'legacy_export_invalid'
    );
    expect(codes(legacy?.(source, 'A.svelte') ?? [])).toEqual([]);
  });

  it('skips a preprocessed style block and keeps the lines after it', () => {
    const source = [
      '<style lang="scss">',
      '  $gap: 1rem;',
      '  .track { .thumb { margin: $gap; } }',
      '</style>',
      '<div on:pointerdown={() => {}}></div>',
      '',
    ].join('\n');
    const warnings =
      createSvelteWarningCheck(kitDirectory)?.(source, 'Track.svelte') ?? [];
    expect(warnings).toEqual([
      expect.objectContaining({
        code: 'a11y_no_static_element_interactions',
        line: 5,
        column: 1,
      }),
    ]);
  });

  it('calls a warning a warning, and a component it cannot compile an error', () => {
    const check = createSvelteWarningCheck(kitDirectory);
    expect(
      check?.('<div on:pointerdown={() => {}}></div>\n', 'Track.svelte')
    ).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'a11y_no_static_element_interactions',
      }),
    ]);
    expect(
      check?.(
        '<script>function a() {}\nfunction a() {}</script>\n',
        'Twice.svelte'
      )
    ).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'js_parse_error',
        message: expect.stringContaining(
          'the Svelte compiler could not compile the component'
        ),
      }),
    ]);
  });

  it('finds the kit Svelte from a relative kit directory', () => {
    const check = createSvelteWarningCheck(
      relative(process.cwd(), kitDirectory)
    );
    expect(check).toBeTypeOf('function');
  });
});
