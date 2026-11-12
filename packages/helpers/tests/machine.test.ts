// @vitest-environment happy-dom
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flushSync } from 'svelte';
import { compileModule } from 'svelte/compiler';
import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const compiled = join(here, '.compiled');

/** Compiles a Svelte module to client code beside the tests, so its svelte
 *  imports resolve from this package, and imports it. */
async function importSvelteModule(name: string, source: string) {
  mkdirSync(compiled, { recursive: true });
  const { js } = compileModule(source, { filename: name, generate: 'client' });
  const path = join(compiled, name);
  writeFileSync(path, js.code);
  return import(/* @vite-ignore */ `${path}?t=${Date.now()}`);
}

describe('machineApi', () => {
  it('pushes the api into a store each time the service changes', async () => {
    const machine = await importSvelteModule(
      'machine.svelte.js',
      // the module as it ships, which a consumer's build compiles.
      readFileSync(join(here, '../dist/zag/svelte/machine.svelte.js'), 'utf8')
    );
    // A root to run the effect in, and a signal standing in for a service.
    const harness = await importSvelteModule(
      'harness.svelte.js',
      `export function inRoot(run) {
        let result;
        const destroy = $effect.root(() => { result = run(); });
        return { result, destroy };
      }
      export function counter() {
        let count = $state(0);
        return { get count() { return count; }, increment() { count += 1; } };
      }`
    );

    const { result: api, destroy } = harness.inRoot(() =>
      machine.machineApi(
        harness.counter,
        (service: { count: number; increment(): void }) => ({
          count: service.count,
          increment: () => service.increment(),
        })
      )
    );
    flushSync();
    expect(get(api)).toMatchObject({ count: 0 });

    get<{ increment(): void }>(api).increment();
    flushSync();
    expect(get(api)).toMatchObject({ count: 1 });
    destroy();
  });
});
