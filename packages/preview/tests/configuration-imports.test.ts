// The app reads the kit's preview block through the `@preview-configuration`
// module the preview serves, which exports one constant per key the pages
// read, set or not. A named import of anything else fails the dev server's
// dependency scan and the static build, so the app imports only those.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PREVIEW_BROWSER_KEYS } from '../src/lib/types';

const applicationRoot = fileURLToPath(new URL('../application', import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|svelte|vue)$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
  });
}

describe('imports from the preview configuration module', () => {
  it('names only the keys the module exports', () => {
    const named: string[] = [];
    for (const file of sourceFiles(applicationRoot)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'@preview-configuration'/g)) {
        named.push(...match[1].split(',').map((name) => name.trim().split(/\s+as\s+/)[0]).filter(Boolean));
      }
    }
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((name) => !(PREVIEW_BROWSER_KEYS as readonly string[]).includes(name))).toEqual([]);
  });
});
