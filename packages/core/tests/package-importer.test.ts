import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { kitSassImporters } from '../src/package-importer';

let kitDirectory: string;

afterEach(() => {
  rmSync(kitDirectory, { recursive: true, force: true });
});

function kitWith(exportsField: unknown, files: string[]): void {
  kitDirectory = mkdtempSync(join(tmpdir(), 'kit-importer-'));
  writeFileSync(
    join(kitDirectory, 'package.json'),
    JSON.stringify({ name: 'charcell-like', exports: exportsField })
  );
  for (const file of files) {
    mkdirSync(join(kitDirectory, file, '..'), { recursive: true });
    writeFileSync(join(kitDirectory, file), '');
  }
}

const find = (url: string): string | null => {
  const [own] = kitSassImporters(kitDirectory) as Array<{
    findFileUrl(url: string): URL | null;
  }>;
  const found = own.findFileUrl(url);
  return found === null
    ? null
    : fileURLToPath(found).slice(kitDirectory.length + 1);
};

describe("kitSassImporters' own-package importer", () => {
  it('resolves the sass, style and default conditions, never types', () => {
    kitWith(
      {
        './css': {
          types: './src/styles/stylesheet.d.ts',
          default: './src/styles/stylesheet.css',
        },
        './themed': {
          types: './src/themed.d.ts',
          default: './src/themed.css',
          sass: './src/themed.scss',
        },
      },
      ['src/styles/stylesheet.css', 'src/themed.scss', 'src/themed.css']
    );
    expect(find('pkg:charcell-like/css')).toBe('src/styles/stylesheet.css');
    expect(find('pkg:charcell-like/themed')).toBe('src/themed.scss');
  });

  it('tries the extensions, the partial and the index files against the exports, as Dart Sass does', () => {
    kitWith(
      {
        './styles/*': './src/styles/*',
        './themes/*': './src/themes/*.scss',
      },
      [
        'src/styles/_tokens.scss',
        'src/styles/reset.css',
        'src/styles/grid/_index.scss',
        'src/styles/forms/index.sass',
        'src/themes/_dark.scss',
      ]
    );
    // An extensionless target Sass resolves itself, partials and all.
    expect(find('pkg:charcell-like/styles/tokens')).toBe('src/styles/tokens');
    expect(find('pkg:charcell-like/styles/grid')).toBe('src/styles/grid');
    // The export adds the extension; the partial's underscore is a variant.
    expect(find('pkg:charcell-like/themes/dark')).toBe('src/themes/_dark.scss');
    expect(find('pkg:charcell-like/styles/missing')).toBeNull();
  });

  it('leaves a target that is not a stylesheet to the next importer', () => {
    kitWith({ './scripts': './src/scripts/index.ts' }, [
      'src/scripts/index.ts',
    ]);
    expect(find('pkg:charcell-like/scripts')).toBeNull();
  });

  it('takes an extensionless target that names a partial', () => {
    kitWith({ './styles/*': './src/styles/*' }, ['src/styles/_tokens.scss']);
    expect(find('pkg:charcell-like/styles/tokens')).toBe('src/styles/tokens');
    expect(find('pkg:charcell-like/styles/missing')).toBeNull();
  });

  it("ignores another package's URL", () => {
    kitWith({ '.': './index.scss' }, ['index.scss']);
    expect(find('pkg:other/index')).toBeNull();
    expect(find('pkg:charcell-like-two')).toBeNull();
  });
});
