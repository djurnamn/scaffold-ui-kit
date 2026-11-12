import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { compile } from 'svelte/compiler';

const compiled = join(dirname(fileURLToPath(import.meta.url)), '../.compiled');

/**
 * Compiles a Svelte component for the server beside the tests, so its svelte
 * imports resolve from this package, and imports it.
 */
export async function svelteComponent(
  name: string,
  source: string
): Promise<unknown> {
  mkdirSync(compiled, { recursive: true });
  const { js } = compile(source, {
    filename: `${name}.svelte`,
    generate: 'server',
  });
  const path = join(compiled, `${name}.js`);
  writeFileSync(path, js.code);
  const module = (await import(
    /* @vite-ignore */ `${pathToFileURL(path).href}?t=${Date.now()}`
  )) as { default: unknown };
  return module.default;
}
