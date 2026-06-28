import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCommand } from '../src/commands/build';
import { scaffoldKit } from '../src/scaffold';

// Kits are scaffolded inside the package directory (not the OS tmpdir) so
// the example templates' `@js-template-engine/types` import resolves
// through the workspace's node_modules when jiti loads them.
const packageDirectory = join(__dirname, '..');

let parentDirectory: string;
let kitDirectory: string;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  parentDirectory = mkdtempSync(join(packageDirectory, '.test-build-'));
  scaffoldKit({
    projectName: 'built-kit',
    parentDirectory,
    targets: ['react', 'vue', 'svelte', 'html'],
    styling: ['bem', 'tailwind'],
    includeExamples: true,
  });
  kitDirectory = join(parentDirectory, 'built-kit');
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(parentDirectory, { recursive: true, force: true });
  process.exitCode = undefined;
});

describe('buildCommand', () => {
  it('renders every template for every configured target', async () => {
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();

    const expectations: Array<[string, string]> = [
      [join('react', 'Button.tsx'), 'export function Button'],
      [join('react', 'Card.tsx'), 'export function Card'],
      [join('vue', 'Button.vue'), '<script setup lang="ts">'],
      [join('vue', 'Card.vue'), '<slot>'],
      [join('svelte', 'Button.svelte'), 'export let label: string;'],
      [join('svelte', 'Card.svelte'), '<slot>'],
      [join('html', 'Button.html'), '<button'],
      [join('html', 'Card.html'), '<article'],
    ];
    for (const [file, marker] of expectations) {
      const filePath = join(kitDirectory, 'dist', file);
      expect(existsSync(filePath), file).toBe(true);
      expect(readFileSync(filePath, 'utf8'), file).toContain(marker);
    }
  });

  it('applies the configured styling extensions in order', async () => {
    await buildCommand(kitDirectory);
    const button = readFileSync(
      join(kitDirectory, 'dist', 'react', 'Button.tsx'),
      'utf8'
    );
    expect(button).toContain('button rounded px-4 py-2');
  });

  it('converts Tailwind utilities to styles under tailwindOutput: styles', async () => {
    writeFileSync(
      join(kitDirectory, 'scaffold-ui-kit.config.json'),
      JSON.stringify({
        name: 'built-kit',
        targets: ['react', 'html'],
        styling: ['bem', 'tailwind'],
        tailwindOutput: 'styles',
      })
    );
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBeUndefined();

    // The utility classes no longer ride along on the element...
    const button = readFileSync(
      join(kitDirectory, 'dist', 'react', 'Button.tsx'),
      'utf8'
    );
    expect(button).not.toContain('rounded px-4 py-2');

    // ...they have become plain CSS instead (px-4 → padding-inline: 1rem).
    const html = readFileSync(
      join(kitDirectory, 'dist', 'html', 'Button.html'),
      'utf8'
    );
    expect(html).toContain('padding-inline: 1rem');
  });

  it('writes a barrel per framework target and none for html', async () => {
    await buildCommand(kitDirectory);
    expect(
      readFileSync(join(kitDirectory, 'dist', 'react', 'index.ts'), 'utf8')
    ).toBe(
      "export { Button } from './Button';\nexport { Card } from './Card';\n"
    );
    expect(
      readFileSync(join(kitDirectory, 'dist', 'vue', 'index.ts'), 'utf8')
    ).toBe(
      "export { default as Button } from './Button.vue';\nexport { default as Card } from './Card.vue';\n"
    );
    expect(existsSync(join(kitDirectory, 'dist', 'html', 'index.ts'))).toBe(
      false
    );
  });

  it('reports a failing template, continues, and exits non-zero', async () => {
    writeFileSync(
      join(kitDirectory, 'src', 'components', 'broken.json'),
      JSON.stringify({ type: 'nonsense' })
    );
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
    expect(
      existsSync(join(kitDirectory, 'dist', 'react', 'Button.tsx'))
    ).toBe(true);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('broken.json: error:')
    );
  });

  it('errors without a configuration file', async () => {
    rmSync(join(kitDirectory, 'scaffold-ui-kit.config.json'));
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
  });

  it('errors when src/components has no templates', async () => {
    rmSync(join(kitDirectory, 'src', 'components'), {
      recursive: true,
      force: true,
    });
    await buildCommand(kitDirectory);
    expect(process.exitCode).toBe(1);
  });
});
