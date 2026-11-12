// The boundary around the charcell shell: charcell and @zag-js are the
// shell's dependencies alone (optional peers of the package), so nothing
// outside application/shells/ imports them; and the shell is built on the
// public SDK alone, so outside its own directory (its components' folders
// included) it imports only the package's shell and React entry modules, by
// their source paths, which resolve both here and from an installed copy of
// the package. Its markdown parser, markdown-to-jsx, is a plain dependency of
// the package: nothing about it has to match the kit's.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const shellRoot = join(packageRoot, 'application/shells/charcell');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' || name === 'dist' ? [] : sourceFiles(path);
    return /\.(ts|tsx|svelte|vue)$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
  });
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(/(?:^|\n)\s*(?:import|export)[^'"]*?from\s*'([^']+)'|(?:^|\n)\s*import\s*'([^']+)'|import\(\s*'([^']+)'\s*\)/g)]
    .map((match) => match[1] ?? match[2] ?? match[3])
    .filter((specifier): specifier is string => specifier !== undefined);
}

describe('the charcell shell boundary', () => {
  it('keeps charcell and @zag-js out of everything but application/shells/', () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles(join(packageRoot, 'src')), ...sourceFiles(join(packageRoot, 'application'))]) {
      if (file.startsWith(join(packageRoot, 'application/shells/'))) continue;
      for (const specifier of importsOf(file)) {
        if (specifier === 'charcell' || specifier.startsWith('charcell/') || specifier.startsWith('@zag-js/')) {
          offenders.push(`${relative(packageRoot, file)}: ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('builds the charcell shell on the public SDK alone', () => {
    const allowed = new Set([join(packageRoot, 'src/shell'), join(packageRoot, 'src/react')]);
    const offenders: string[] = [];
    const files = sourceFiles(shellRoot);
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      for (const specifier of importsOf(file)) {
        if (specifier.startsWith('.')) {
          const target = resolve(dirname(file), specifier);
          if (target.startsWith(shellRoot + sep) || allowed.has(target)) continue;
          offenders.push(`${relative(packageRoot, file)}: ${specifier}`);
          continue;
        }
        if (specifier === 'react' || specifier.startsWith('react/') || specifier.startsWith('react-dom/')) continue;
        if (specifier.startsWith('charcell/') || specifier.startsWith('@zag-js/')) continue;
        if (specifier === 'markdown-to-jsx' || specifier.startsWith('markdown-to-jsx/')) continue;
        offenders.push(`${relative(packageRoot, file)}: ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('exports the shell entry modules the charcell shell imports', () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      exports: Record<string, Record<string, string>>;
      peerDependencies: Record<string, string>;
      peerDependenciesMeta: Record<string, { optional?: boolean }>;
      dependencies: Record<string, string>;
    };
    expect(manifest.exports['./shell'].default).toBe('./dist/shell.js');
    expect(manifest.exports['./react'].default).toBe('./dist/react.js');
    expect(manifest.exports['./shells/charcell'].default).toBe('./application/shells/charcell/index.tsx');
    for (const peer of ['charcell', '@zag-js/react']) {
      expect(manifest.peerDependencies[peer]).toBeDefined();
      expect(manifest.peerDependenciesMeta[peer]).toEqual({ optional: true });
      expect(manifest.dependencies[peer]).toBeUndefined();
    }
    expect(manifest.dependencies['markdown-to-jsx']).toBeDefined();
  });
});
