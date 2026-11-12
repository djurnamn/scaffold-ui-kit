// Regression tests for the Svelte story wrapper's default-region emission.
// The wrapper used to always emit an open/close pair with a
// whitespace-only body (`<Comp {...rest}>\n  \n</Comp>`); Svelte 5 can turn a
// whitespace-only component body into a real (empty) `children` snippet, so a
// slotless story mounted with a defined-but-empty default slot - suppressing
// the component's default-slot fallback content. React trims whitespace-only
// JSX children and Vue drops the whitespace-only slot, so only the Svelte story
// diverged. The wrapper must self-close when the story has nothing to fill,
// and emit only non-empty region lines otherwise.
//
// Beyond string pins on the emitted source, the mount suite compiles the
// emitted wrapper plus a fallback-carrying fixture with the real Svelte 5
// compiler and renders them through `svelte/server`. The compile passes
// `preserveWhitespace: true` - the strictest whitespace semantics, under which
// the old open/close emission provably created the empty `children` snippet -
// so a regression to the open/close shape fails the slotless-shows-fallback
// assertion.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { afterAll, describe, expect, it } from 'vitest';

import { emitSvelteWrapper } from '../src/emit/svelte';
import type { ResolvedStory } from '../src/lib/types';

// The fixture barrel stands in for the kit module (`<kit>/svelte`); it lives
// beside the compiled wrapper in the temporary directory.
const barrel = () => './barrel.js';

function model(over: Partial<ResolvedStory>): ResolvedStory {
  return {
    name: 'FallbackFace',
    title: 'Components/Form/FallbackFace',
    omit: false,
    standalone: true,
    unlisted: false,
    propTypes: [],
    defaultProps: {},
    scenarios: [],
    slotComponents: [],
    contentSlots: { default: true, named: [] },
    targets: ['react', 'vue', 'svelte'],
    ...over,
  };
}

describe('emitSvelteWrapper - slotless stories self-close', () => {
  it('self-closes when the story has neither a default fill nor named fills', () => {
    const wrapper = emitSvelteWrapper(model({}), barrel);
    expect(wrapper.source).toContain('<FallbackFace {...rest} />');
    expect(wrapper.source).not.toContain('</FallbackFace>');
  });

  it('emits a body when a default fill exists', () => {
    const wrapper = emitSvelteWrapper(
      model({ slots: { default: { kind: 'text', value: 'Filled body' } } }),
      barrel,
    );
    expect(wrapper.source).toContain('<FallbackFace {...rest}>\n  Filled body\n</FallbackFace>');
  });

  it('renders the children text prop as the body and strips it from the spread', () => {
    const wrapper = emitSvelteWrapper(model({ defaultProps: { children: 'Hi' } }), barrel);
    expect(wrapper.source).toContain('<FallbackFace {...rest}>\n  {props["children"]}\n</FallbackFace>');
    expect(wrapper.source).toContain(
      'ownKeys: (target) => Reflect.ownKeys(target).filter((key) => key !== "children"),',
    );
  });

  it('emits named fills without a whitespace-only default line', () => {
    const wrapper = emitSvelteWrapper(
      model({ slots: { named: { header: { kind: 'text', value: 'Heading' } } } }),
      barrel,
    );
    expect(wrapper.source).toContain(
      '<FallbackFace {...rest}>\n  {#snippet header()}Heading{/snippet}\n</FallbackFace>',
    );
  });
});

describe('emitSvelteWrapper - mounted through the real Svelte 5 compiler', () => {
  const temporaryDirectory = mkdtempSync(
    join(dirname(fileURLToPath(import.meta.url)), '.svelte-wrapper-'),
  );
  afterAll(() => rmSync(temporaryDirectory, { recursive: true, force: true }));

  // A runes component whose default slot carries fallback content - the shape
  // the runes emission produces (`{#if children}...{:else}<fallback/>{/if}`).
  const fixture =
    `<script>\n` +
    `  let { children } = $props();\n` +
    `</script>\n\n` +
    `{#if children}{@render children()}{:else}<span class="fallback">FALLBACK</span>{/if}\n`;

  function compileToModule(
    source: string,
    fileName: string,
    moduleName: string,
    preserveWhitespace = true,
  ): string {
    const compiled = compile(source, {
      generate: 'server',
      runes: true,
      preserveWhitespace,
      filename: fileName,
    });
    const modulePath = join(temporaryDirectory, `${moduleName}.js`);
    writeFileSync(modulePath, compiled.js.code);
    return modulePath;
  }

  // Each mount gets its own wrapper module name - dynamic `import()` caches by
  // URL, so reusing one path would return the first compiled wrapper.
  async function mountWrapper(
    storyModel: ResolvedStory,
    moduleName: string,
    preserveWhitespace = true,
  ): Promise<string> {
    compileToModule(fixture, 'FallbackFace.svelte', 'fallback-face');
    writeFileSync(
      join(temporaryDirectory, 'barrel.js'),
      `export { default as FallbackFace } from './fallback-face.js';\n`,
    );
    const wrapper = emitSvelteWrapper(storyModel, barrel);
    const wrapperPath = compileToModule(wrapper.source, wrapper.fileName, moduleName, preserveWhitespace);
    const wrapperModule = await import(pathToFileURL(wrapperPath).href);
    return render(wrapperModule.default, { props: { props: {} } }).body;
  }

  it('a slotless story mounts with the fallback visible', async () => {
    const body = await mountWrapper(model({}), 'wrapper-slotless');
    expect(body).toContain('FALLBACK');
  });

  it('a text fill holding a tag, a character reference or braces renders as the text it is', async () => {
    const text = {
      kind: 'fragment' as const,
      children: [
        { kind: 'text' as const, value: 'Use <Tab> to move; ' },
        { kind: 'text' as const, value: 'Tom &amp; Jerry; ' },
        { kind: 'text' as const, value: 'Price: {amount} {{ name }}' },
      ],
    };
    const wrapper = emitSvelteWrapper(model({ slots: { default: text } }), barrel);
    expect(wrapper.source).toContain(
      "{\"Use <Tab> to move; \"}{\"Tom &amp; Jerry; \"}Price: {'{'}amount{'}'} {'{'}{'{'} name {'}'}{'}'}",
    );
    const body = await mountWrapper(model({ slots: { default: text } }), 'wrapper-text');
    expect(body).toContain('Use &lt;Tab> to move; Tom &amp;amp; Jerry; Price: {amount} {{ name }}');
  });

  it('a text fill keeps the whitespace at its edges and in a run, as React and Vue do', async () => {
    const text = { kind: 'text' as const, value: ' 1  ripburger ' };
    const wrapper = emitSvelteWrapper(model({ slots: { default: text } }), barrel);
    expect(wrapper.source).toContain('{" 1  ripburger "}');
    // Svelte's default compile, which trims and collapses markup whitespace.
    const body = await mountWrapper(model({ slots: { default: text } }), 'wrapper-whitespace', false);
    expect(body).toContain(' 1  ripburger ');
  });

  it('a story with a default fill mounts with the fill, not the fallback', async () => {
    const body = await mountWrapper(
      model({ slots: { default: { kind: 'text', value: 'Filled body' } } }),
      'wrapper-filled',
    );
    expect(body).toContain('Filled body');
    expect(body).not.toContain('FALLBACK');
  });
});
