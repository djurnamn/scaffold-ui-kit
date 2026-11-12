import { describe, expect, it } from 'vitest';

import {
  directoryImportOf,
  importOf,
  resolveExport,
} from '../src/package-exports';

describe('resolveExport', () => {
  it('prefers an exact key, then the most specific pattern', () => {
    const exportsField = {
      './react': './dist/react/index.ts',
      './react/*': './dist/react/*.tsx',
      './react/*.css': './dist/react/*.css',
    };
    expect(resolveExport(exportsField, './react')).toEqual([
      'dist/react/index.ts',
    ]);
    expect(resolveExport(exportsField, './react/Button')).toEqual([
      'dist/react/Button.tsx',
    ]);
    expect(resolveExport(exportsField, './react/Button.css')).toEqual([
      'dist/react/Button.css',
    ]);
  });

  it('resolves a null target to nothing', () => {
    expect(
      resolveExport(
        { './*': './dist/*.js', './internal/*': null },
        './internal/secret'
      )
    ).toEqual([]);
  });
});

describe('importOf', () => {
  it('maps a file back through a pattern export', () => {
    expect(
      importOf('my-kit', { './vue/*': './dist/vue/*' }, 'dist/vue/Button.vue')
    ).toBe('my-kit/vue/Button.vue');
  });

  it('lets an exact export win over a pattern reaching the same file', () => {
    expect(
      importOf(
        'my-kit',
        {
          './react/*': './dist/react/*.ts',
          './react': './dist/react/index.ts',
        },
        'dist/react/index.ts'
      )
    ).toBe('my-kit/react');
  });

  it('lets the longer pattern prefix win', () => {
    expect(
      importOf(
        'my-kit',
        {
          './*': './dist/*.tsx',
          './react/unlinked/*': './dist/react/*.tsx',
        },
        'dist/react/Select.tsx'
      )
    ).toBe('my-kit/react/unlinked/Select');
  });

  it('honors a more specific key that sends the subpath elsewhere', () => {
    // './components/Button' would reach the file through the first key, but
    // the more specific second key resolves it to another file.
    expect(
      importOf(
        'my-kit',
        {
          './components/*': './dist/react/*.tsx',
          './components/Button': './dist/react/ButtonFace.ts',
        },
        'dist/react/Button.tsx'
      )
    ).toBeUndefined();
  });

  it('honors a null exclusion', () => {
    expect(
      importOf(
        'my-kit',
        { './*': './*', './dist/private/*': null },
        'dist/private/secret.ts'
      )
    ).toBeUndefined();
  });

  it('reads the targets of conditions and the root export', () => {
    expect(
      importOf(
        '@acme/ui',
        { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
        'dist/index.js'
      )
    ).toBe('@acme/ui');
    expect(importOf('@acme/ui', './dist/index.js', 'dist/index.js')).toBe(
      '@acme/ui'
    );
  });

  it('reaches nothing without exports', () => {
    expect(importOf('my-kit', undefined, 'dist/react/Button.tsx')).toBe(
      undefined
    );
  });
});

describe('directoryImportOf', () => {
  const files = ['src/scripts/index.ts', 'src/scripts/positioning.ts'];

  it('takes the key of a pattern export below the directory', () => {
    expect(
      directoryImportOf(
        'my-kit',
        { './scripts/*': './src/scripts/*.ts' },
        'src/scripts',
        files
      )
    ).toBe('my-kit/scripts');
  });

  it("takes the key of an exact export of the directory's index", () => {
    expect(
      directoryImportOf(
        'my-kit',
        { './lib': './src/scripts/index.ts' },
        'src/scripts',
        files
      )
    ).toBe('my-kit/lib');
  });

  it('reaches nothing when no export leads into the directory', () => {
    expect(
      directoryImportOf(
        'my-kit',
        { './react': './dist/react/index.ts' },
        'src/scripts',
        files
      )
    ).toBeUndefined();
  });
});
