import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { TargetName } from '../src/configuration';
import {
  compileLinkedStylesheets,
  withLayerOrderFirst,
} from '../src/stylesheet-links';

let distDirectory: string;

beforeEach(() => {
  distDirectory = mkdtempSync(join(tmpdir(), 'stylesheet-links-'));
});

afterEach(() => {
  rmSync(distDirectory, { recursive: true, force: true });
});

const emit = (
  target: TargetName,
  files: Record<string, string>
): { target: TargetName; targetDirectory: string; stylesheets: string[] } => {
  const targetDirectory = join(distDirectory, target);
  mkdirSync(targetDirectory, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(targetDirectory, name), content);
  }
  return { target, targetDirectory, stylesheets: Object.keys(files) };
};

describe('compileLinkedStylesheets', () => {
  it('writes a sheet identical on every target once and links it from each', () => {
    const result = compileLinkedStylesheets({
      targets: [
        emit('react', { 'Badge.scss': '.badge { .icon { gap: 1px; } }\n' }),
        emit('vue', { 'Badge.scss': '.badge { .icon { gap: 1px; } }\n' }),
      ],
      loadPaths: [],
      sharedDirectory: join(distDirectory, 'stylesheets'),
    });

    expect(result.errors).toEqual([]);
    expect(
      readFileSync(join(distDirectory, 'stylesheets', 'Badge.css'), 'utf8')
    ).toBe('.badge .icon{gap:1px}\n');
    expect(result.links.get('react')!.get('Badge')).toBe(
      '../../stylesheets/Badge.css'
    );
    expect(result.links.get('vue')!.get('Badge')).toBe(
      '../../stylesheets/Badge.css'
    );
    expect(result.writtenPaths).toHaveLength(1);
  });

  it('keeps a per-target copy of a sheet that differs between targets', () => {
    const result = compileLinkedStylesheets({
      targets: [
        emit('react', {
          'Badge.scss': '.badge { gap: 1px; }\n',
          'Chip.scss': '.chip { gap: 2px; }\n',
        }),
        emit('svelte', {
          'Badge.scss': '.badge { gap: 3px; }\n',
          'Chip.scss': '.chip { gap: 2px; }\n',
        }),
      ],
      loadPaths: [],
      sharedDirectory: join(distDirectory, 'stylesheets'),
    });

    expect(existsSync(join(distDirectory, 'stylesheets', 'Badge.css'))).toBe(
      false
    );
    expect(
      readFileSync(join(distDirectory, 'react', 'linked', 'Badge.css'), 'utf8')
    ).toBe('.badge{gap:1px}\n');
    expect(
      readFileSync(join(distDirectory, 'svelte', 'linked', 'Badge.css'), 'utf8')
    ).toBe('.badge{gap:3px}\n');
    expect(result.links.get('svelte')!.get('Badge')).toBe('./Badge.css');
    // The sheet that agrees is still shared.
    expect(result.links.get('svelte')!.get('Chip')).toBe(
      '../../stylesheets/Chip.css'
    );
  });

  it('shares a sheet only some targets emit, and links a css sheet where it is', () => {
    const result = compileLinkedStylesheets({
      targets: [
        emit('react', {
          'Only.scss': '.only { gap: 1px; }\n',
          'Plain.css': '.plain{}\n',
        }),
        emit('vue', {}),
      ],
      loadPaths: [],
      sharedDirectory: join(distDirectory, 'stylesheets'),
    });

    expect(result.links.get('react')!.get('Only')).toBe(
      '../../stylesheets/Only.css'
    );
    expect(result.links.get('react')!.get('Plain')).toBe('../Plain.css');
    expect(result.links.get('vue')!.size).toBe(0);
  });

  it('makes each link relative to the directory that links it', () => {
    const html = emit('html', {
      'Badge.scss': '.badge { gap: 1px; }\n',
      'Plain.css': '.plain{}\n',
    });
    const result = compileLinkedStylesheets({
      targets: [
        emit('react', { 'Badge.scss': '.badge { gap: 1px; }\n' }),
        { ...html, linkDirectory: html.targetDirectory },
      ],
      loadPaths: [],
      sharedDirectory: join(distDirectory, 'stylesheets'),
    });

    expect(result.links.get('react')!.get('Badge')).toBe(
      '../../stylesheets/Badge.css'
    );
    expect(result.links.get('html')!.get('Badge')).toBe(
      '../stylesheets/Badge.css'
    );
    expect(result.links.get('html')!.get('Plain')).toBe('./Plain.css');
  });

  it('reports a sheet that fails to compile', () => {
    const result = compileLinkedStylesheets({
      targets: [emit('react', { 'Broken.scss': '@use "missing";\n' })],
      loadPaths: [],
      sharedDirectory: join(distDirectory, 'stylesheets'),
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/^dist\/react\/Broken\.scss: /);
    expect(result.links.get('react')!.has('Broken')).toBe(false);
  });
});

describe('withLayerOrderFirst', () => {
  const order = ['kit.base', 'kit.components'];

  it('moves the order statement ahead of a layer block a loaded module emitted', () => {
    expect(
      withLayerOrderFirst(
        '@layer kit.components{.a{x:y}}@layer kit.base, kit.components;@layer kit.components{.b{x:y}}',
        order
      )
    ).toBe(
      '@layer kit.base, kit.components;@layer kit.components{.a{x:y}}@layer kit.components{.b{x:y}}'
    );
  });

  it('keeps other layer statements, nested statements, strings and a charset where they are', () => {
    expect(
      withLayerOrderFirst(
        '\uFEFF@charset "UTF-8";@layer other;.a{content:"@layer kit.base, kit.components;}"}@layer kit.components{@layer kit.base, kit.components;}@layer kit.base,kit.components;',
        order
      )
    ).toBe(
      '\uFEFF@charset "UTF-8";@layer kit.base, kit.components;@layer other;.a{content:"@layer kit.base, kit.components;}"}@layer kit.components{@layer kit.base, kit.components;}'
    );
  });

  it('states the order in a sheet that never did, and leaves a sheet with no rules alone', () => {
    expect(withLayerOrderFirst('.a{x:y}', order)).toBe(
      '@layer kit.base, kit.components;.a{x:y}'
    );
    expect(withLayerOrderFirst('', order)).toBe('');
  });

  it('compiles a sheet with the order first', () => {
    const target = emit('react', {
      '_module.scss': '@layer kit.components { .module { margin: 0; } }\n',
      'Button.scss':
        '@use "module";\n\n@layer kit.base, kit.components;\n\n@layer kit.components {\n  .button { color: red; }\n}\n',
    });
    target.stylesheets = ['Button.scss'];
    const sharedDirectory = join(distDirectory, 'stylesheets');
    compileLinkedStylesheets({
      targets: [target],
      loadPaths: [],
      sharedDirectory,
      layerOrder: order,
    });
    expect(readFileSync(join(sharedDirectory, 'Button.css'), 'utf8')).toBe(
      '@layer kit.base, kit.components;@layer kit.components{.module{margin:0}}@layer kit.components{.button{color:red}}\n'
    );
  });
});
