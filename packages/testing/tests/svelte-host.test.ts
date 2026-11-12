import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { compile } from 'svelte/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { svelteComponent } from './support/svelte.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, mkdtempSync: vi.fn(actual.mkdtempSync) };
});

vi.mock('svelte/compiler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('svelte/compiler')>();
  return { ...actual, compile: vi.fn(actual.compile) };
});

const packageCache = fileURLToPath(
  new URL('../node_modules/.cache/scaffold-ui-kit-testing/', import.meta.url)
);

const makeDirectory = vi.mocked(mkdtempSync);
const compileSpy = vi.mocked(compile);

/** The render entry, fresh so its once-per-process host compiles again. */
function renderEntry() {
  return import('../src/render/index.js');
}

/** How many times the host has been compiled since the last reset. */
function hostCompiles(): number {
  return compileSpy.mock.calls.filter(
    ([, options]) => options.filename === 'svelte-host.svelte'
  ).length;
}

const cardSource = `<script>
  let { children } = $props();
</script>
<section>{@render children?.()}</section>`;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('the compiled Svelte host', () => {
  it('is written beside the package, not in the temporary directory', async () => {
    const { renderSvelte } = await renderEntry();
    const card = await svelteComponent('HostedCard', cardSource);
    await renderSvelte(card, {}, { host: { component: card } });
    expect(makeDirectory.mock.calls.map(([prefix]) => prefix)).toEqual([
      `${packageCache}host-`,
    ]);
  });

  it('falls back to the temporary directory when the package is read-only', async () => {
    makeDirectory.mockImplementationOnce(() => {
      throw new Error('EROFS: read-only file system');
    });
    const { renderSvelte } = await renderEntry();
    const card = await svelteComponent('HostedCard', cardSource);
    await expect(
      renderSvelte(card, {}, { host: { component: card } })
    ).resolves.toContain('<section>');
    expect(makeDirectory.mock.calls[1]?.[0]).toMatch(
      new RegExp(`^${tmpdir()}.*scaffold-ui-kit-testing-`)
    );
  });
});

describe('createRenderer load', () => {
  it('retries the compile after one fails', async () => {
    const { createRenderer } = await renderEntry();
    const card = await svelteComponent('HostedCard', cardSource);
    const renderer = createRenderer({ svelte: async () => card });
    compileSpy.mockImplementationOnce(() => {
      throw new Error('the compile failed');
    });
    await expect(renderer.load('Card')).rejects.toThrow('the compile failed');
    await expect(renderer.load('Card')).resolves.toBeUndefined();
  });

  it('compiles the host once when a Svelte loader exists', async () => {
    const { createRenderer } = await renderEntry();
    const card = await svelteComponent('HostedCard', cardSource);
    const renderer = createRenderer({ svelte: async () => card });
    await renderer.load('Card');
    expect(hostCompiles()).toBe(1);
    await renderer.render('svelte', 'Card', {}, { host: { name: 'Card' } });
    expect(hostCompiles()).toBe(1);
  });

  it('compiles nothing for a kit with no Svelte loader', async () => {
    const { createRenderer } = await renderEntry();
    const renderer = createRenderer({ react: async () => () => null });
    await renderer.load('Card');
    expect(hostCompiles()).toBe(0);
  });
});
