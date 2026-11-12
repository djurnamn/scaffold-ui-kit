// The Svelte target's server render, through svelte/server.

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  SLOT_FILL_CLASS,
  partitionProps,
  scopedFillAttributes,
  slotFillMarkup,
  type RenderProps,
} from './slots.js';
import {
  hostPropsWithoutChildren,
  type HostComponent,
  type RenderOptions,
} from './host.js';

interface SvelteServer {
  render(
    component: unknown,
    options: { props: Record<string, unknown> }
  ): { body: string };
}

interface SvelteRuntime {
  createRawSnippet(
    create: () => { render: () => string }
  ): (...parameters: unknown[]) => unknown;
}

interface SvelteCompiler {
  compile(
    source: string,
    options: { generate: 'server'; filename: string }
  ): { js: { code: string } };
}

let compiledHost: Promise<unknown> | undefined;

/**
 * A new directory for the compiled host, in this package's own
 * `node_modules/.cache`: a test runner that serves this package serves a file
 * beside it too, which it may refuse from the system's temporary directory.
 * The temporary directory is the fallback when the package cannot be written
 * to. Each process gets its own directory, so parallel workers do not meet.
 */
function makeHostDirectory(): string {
  try {
    const cache = fileURLToPath(
      new URL(
        '../../node_modules/.cache/scaffold-ui-kit-testing/',
        import.meta.url
      )
    );
    mkdirSync(cache, { recursive: true });
    return mkdtempSync(join(cache, 'host-'));
  } catch {
    return mkdtempSync(join(tmpdir(), 'scaffold-ui-kit-testing-'));
  }
}

/**
 * The compiled host component (`svelte-host.svelte`), compiled once per
 * process with the project's Svelte. Its imports of Svelte are rewritten to
 * the files this package resolves them to, so the compiled module shares the
 * Svelte instance the components use wherever it is written.
 *
 * @returns The host component.
 */
export function svelteHost(): Promise<unknown> {
  if (compiledHost) return compiledHost;
  compiledHost = (async () => {
    const compiler = (await import(
      'svelte/compiler'
    )) as unknown as SvelteCompiler;
    const source = readFileSync(
      new URL('./svelte-host.svelte', import.meta.url),
      'utf8'
    );
    const { js } = compiler.compile(source, {
      generate: 'server',
      filename: 'svelte-host.svelte',
    });
    const require = createRequire(import.meta.url);
    const code = js.code.replace(
      /(from\s*|import\s*\(?\s*)(['"])(svelte(?:\/[^'"]*)?)\2/g,
      (_, keyword: string, quote: string, specifier: string) =>
        `${keyword}${quote}${pathToFileURL(require.resolve(specifier)).href}${quote}`
    );
    // `.mjs`, so Node reads it as a module with no package.json beside it.
    const directory = makeHostDirectory();
    try {
      const path = join(directory, 'svelte-host.mjs');
      writeFileSync(path, code);
      const module = (await import(
        /* @vite-ignore */ pathToFileURL(path).href
      )) as { default: unknown };
      return module.default;
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  })();
  // A failed compile is retried on the next call rather than cached.
  compiledHost.catch(() => {
    compiledHost = undefined;
  });
  return compiledHost;
}

/** The markers the host writes around its own blocks, each in an `{@html}`. */
const MARKERS = {
  outerStart: '<!--scaffold-ui-kit-testing:outer-start-->',
  outerEnd: '<!--scaffold-ui-kit-testing:outer-end-->',
  hostStart: '<!--scaffold-ui-kit-testing:host-start-->',
  hostEnd: '<!--scaffold-ui-kit-testing:host-end-->',
  partStart: '<!--scaffold-ui-kit-testing:part-start-->',
  partEnd: '<!--scaffold-ui-kit-testing:part-end-->',
};

/** An `{@html}` block's markup on the server: its opening anchor (a hash of
 *  the content in development builds), the content and a closing anchor. */
function htmlBlock(content: string): string {
  return `<!--[0-9a-z]*-->${content.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<!---->`;
}

/**
 * Remove what the host adds around the component: each marker's `{@html}`
 * block and the anchor of the block beside it (the `{#if}` branch, the
 * host's and the part's dynamic component), so the markup is what a static
 * composition renders. A marker whose neighbor is not the anchor expected is
 * removed alone.
 */
function withoutHostAnchors(body: string): string {
  const exact: [RegExp, string][] = [
    [new RegExp(`${htmlBlock(MARKERS.outerStart)}<!--\\[-?\\d+-->`), ''],
    [new RegExp(`<!--\\]-->${htmlBlock(MARKERS.outerEnd)}`), ''],
    [new RegExp(`${htmlBlock(MARKERS.hostStart)}<!--\\[-->`), ''],
    [new RegExp(`<!--\\]-->${htmlBlock(MARKERS.hostEnd)}`), ''],
    [new RegExp(`${htmlBlock(MARKERS.partStart)}<!--\\[-->`), ''],
    [new RegExp(`<!--\\]-->${htmlBlock(MARKERS.partEnd)}`), ''],
  ];
  let result = body;
  for (const [pattern, replacement] of exact) {
    result = result.replace(pattern, replacement);
  }
  for (const marker of Object.values(MARKERS)) {
    result = result.replace(new RegExp(htmlBlock(marker)), '');
  }
  return result;
}

/** Fills and props resolved for a Svelte component. */
interface SvelteProps {
  resolved: RenderProps;
  scopedFills: Record<
    string,
    {
      attributes: (scope: unknown) => RenderProps;
      text: string;
      className: string;
    }
  >;
}

function svelteProps(props: RenderProps, runtime: SvelteRuntime): SvelteProps {
  const { plain, slots, scopedSlots } = partitionProps(props);
  const resolved: RenderProps = { ...plain };
  // A legacy component reads a snippet in place of a slot of the same name
  // when its `$$slots` marks the slot filled.
  const filled: Record<string, true> = {};
  for (const [name, fill] of Object.entries(slots)) {
    resolved[name] = runtime.createRawSnippet(() => ({
      render: () => slotFillMarkup(fill.slotFillText),
    }));
    filled[name === 'children' ? 'default' : name] = true;
  }
  for (const name of Object.keys(scopedSlots)) {
    filled[name === 'children' ? 'default' : name] = true;
  }
  if (Object.keys(filled).length > 0) resolved.$$slots = filled;
  const scopedFills = Object.fromEntries(
    Object.entries(scopedSlots).map(([name, fill]) => [
      name,
      {
        attributes: (scope: unknown) => scopedFillAttributes(fill, scope),
        text: fill.scopedSlotText,
        className: SLOT_FILL_CLASS,
      },
    ])
  );
  return { resolved, scopedFills };
}

/**
 * Render a Svelte component on the server to its markup, with
 * `svelte/server`. A {@link slot} fill becomes a raw snippet and a
 * {@link scopedSlot} fill a compiled one; a component in legacy mode
 * receives each fill as its slot of that name too. A scoped fill or a host
 * renders through a compiled host component, whose own anchors are removed,
 * so the markup reads as a direct render or a static composition does.
 *
 * @param component - The component, as its module's default export.
 * @param props - Its props, slot fills included.
 * @param options - `host`, a component to render around it, with the part
 *   as its children; its props take slot fills too, its `children` excepted.
 * @returns The rendered markup.
 * @example
 * ```ts
 * const { default: Badge } = await import('../dist/svelte/Badge.svelte');
 * const markup = await renderSvelte(Badge, { tone: 'calm', children: slot('New') });
 * ```
 */
export async function renderSvelte(
  component: unknown,
  props: RenderProps = {},
  { host }: RenderOptions<HostComponent> = {}
): Promise<string> {
  const { render } = (await import('svelte/server')) as unknown as SvelteServer;
  const runtime = (await import('svelte')) as unknown as SvelteRuntime;
  const part = svelteProps(props, runtime);
  if (Object.keys(part.scopedFills).length === 0 && !host) {
    return render(component, { props: part.resolved }).body;
  }
  const hosted = svelteProps(hostPropsWithoutChildren(host), runtime);
  const body = render(await svelteHost(), {
    props: {
      component,
      props: part.resolved,
      scopedFills: part.scopedFills,
      host: host?.component,
      hostProps: hosted.resolved,
      hostScopedFills: hosted.scopedFills,
      markers: MARKERS,
    },
  }).body;
  return withoutHostAnchors(body);
}
