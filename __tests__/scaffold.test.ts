import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { configurationFileName } from '../src/configuration';
import { scaffoldKit, type ScaffoldOptions } from '../src/scaffold';

let parentDirectory: string;

afterEach(() => {
  rmSync(parentDirectory, { recursive: true, force: true });
});

function scaffold(overrides: Partial<ScaffoldOptions> = {}): string {
  parentDirectory = mkdtempSync(join(tmpdir(), 'scaffold-ui-kit-scaffold-'));
  scaffoldKit({
    projectName: 'test-kit',
    parentDirectory,
    targets: ['react', 'vue'],
    styling: ['bem'],
    includeExamples: true,
    ...overrides,
  });
  return join(parentDirectory, overrides.projectName ?? 'test-kit');
}

describe('scaffoldKit', () => {
  it('creates the kit files', () => {
    const kitDirectory = scaffold();
    for (const file of [
      'package.json',
      configurationFileName,
      'tsconfig.json',
      '.gitignore',
      'README.md',
      join('bin', 'add.mjs'),
      join('src', 'components', 'button.ts'),
      join('src', 'components', 'card.ts'),
    ]) {
      expect(existsSync(join(kitDirectory, file)), file).toBe(true);
    }
  });

  it('writes the chosen targets and styling into the configuration', () => {
    const kitDirectory = scaffold({
      targets: ['svelte', 'html'],
      styling: ['bem', 'tailwind'],
    });
    expect(
      JSON.parse(readFileSync(join(kitDirectory, configurationFileName), 'utf8'))
    ).toEqual({
      name: 'test-kit',
      targets: ['svelte', 'html'],
      styling: ['bem', 'tailwind'],
    });
  });

  it('names the package and its consumer bin after the project', () => {
    const kitDirectory = scaffold({ projectName: 'acme-design' });
    const packageJson = JSON.parse(
      readFileSync(join(kitDirectory, 'package.json'), 'utf8')
    );
    expect(packageJson.name).toBe('acme-design');
    expect(packageJson.bin).toEqual({ 'acme-design': './bin/add.mjs' });
    expect(packageJson.scripts.build).toBe('scaffold-ui-kit build');
    expect(Object.keys(packageJson.devDependencies)).toContain('scaffold-ui-kit');
  });

  it('skips the example components with includeExamples false', () => {
    const kitDirectory = scaffold({ includeExamples: false });
    expect(existsSync(join(kitDirectory, 'src', 'components'))).toBe(true);
    expect(
      existsSync(join(kitDirectory, 'src', 'components', 'button.ts'))
    ).toBe(false);
  });

  it('refuses a non-empty existing directory', () => {
    parentDirectory = mkdtempSync(join(tmpdir(), 'scaffold-ui-kit-scaffold-'));
    mkdirSync(join(parentDirectory, 'test-kit'));
    writeFileSync(join(parentDirectory, 'test-kit', 'occupied.txt'), 'x');
    expect(() =>
      scaffoldKit({
        projectName: 'test-kit',
        parentDirectory,
        targets: ['react'],
        styling: [],
        includeExamples: true,
      })
    ).toThrow('already exists and is not empty');
  });
});
