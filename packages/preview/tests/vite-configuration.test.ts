// The preview's Vite configuration: the scratch regeneration endpoint the editor
// POSTs its node tree to (driven through a stand-in dev server, with the real
// scratch writer), and the dev server's file-system allow list and port.

import { EventEmitter } from 'node:events';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Alias, Connect, Plugin, ViteDevServer } from 'vite';
import {
  CHARCELL_SHELL,
  loadPreviewContext,
  type PreviewContext,
} from '../src/context';
import { writeScratchStubs, type ScratchModules } from '../src/emit/scratch';
import {
  applicationRoot,
  buildViteConfiguration,
  chunkSizePlugin,
  CONFIGURATION_MODULE,
  configurationModulePlugin,
  DEFAULT_PORT,
  entryStylesheetsPlugin,
  hostPagePlugin,
  htmlSourcePlugin,
  scratchRegenerationPlugin,
} from '../src/vite-configuration';
import { writeSourceKit } from './support/source-kit';

const here = dirname(fileURLToPath(import.meta.url));
const temporaryRoots: string[] = [];

function temporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(directory);
  return directory;
}

afterAll(() => {
  for (const root of temporaryRoots)
    rmSync(root, { recursive: true, force: true });
});

/** A dev server stand-in: records the middleware the plugin mounts, any
 *  `ssrLoadModule` call (the plugin makes none: the engine's CommonJS build
 *  fails under Vite's SSR evaluation), and invalidations. */
function fakeServer() {
  const mounted: { path: string; handler: Connect.NextHandleFunction }[] = [];
  const loadedModules: string[] = [];
  const invalidated: string[] = [];
  const errors: string[] = [];
  const server = {
    middlewares: {
      use: (path: string, handler: Connect.NextHandleFunction) =>
        mounted.push({ path, handler }),
    },
    ssrLoadModule: async (path: string) => {
      loadedModules.push(path);
      return {};
    },
    moduleGraph: {
      getModulesByFile: (file: string) => new Set([{ file }]),
      invalidateModule: (module: { file: string }) =>
        invalidated.push(module.file),
    },
    config: { logger: { error: (message: string) => errors.push(message) } },
  };
  return {
    server: server as unknown as ViteDevServer,
    mounted,
    loadedModules,
    invalidated,
    errors,
  };
}

/** Send one request through `handler`; resolves with the response once ended. */
function send(
  handler: Connect.NextHandleFunction,
  method: string,
  body?: string
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolvePromise) => {
    const request = Object.assign(new EventEmitter(), { method });
    const response = {
      statusCode: 0,
      setHeader() {},
      end(text: string) {
        resolvePromise({ statusCode: response.statusCode, body: text });
      },
    };
    handler(request as never, response as never, () => {});
    if (body !== undefined) request.emit('data', body);
    request.emit('end');
  });
}

describe('scratchRegenerationPlugin - the regeneration endpoint', () => {
  let generatedRoot: string;
  let handler: Connect.NextHandleFunction;
  let server: ReturnType<typeof fakeServer>;

  beforeAll(async () => {
    generatedRoot = temporaryDirectory('preview-regeneration-');
    const modules: ScratchModules = {
      defaultModule: 'acme',
      moduleByName: { Badge: 'acme' },
      importOverrideByName: {},
      exportByName: {},
    };
    writeFileSync(join(generatedRoot, 'modules.json'), JSON.stringify(modules));
    writeScratchStubs(generatedRoot);

    server = fakeServer();
    const plugin = scratchRegenerationPlugin(generatedRoot);
    await (plugin.configureServer as (server: ViteDevServer) => unknown)(
      server.server
    );
    expect(server.mounted.map((entry) => entry.path)).toEqual([
      '/__preview_regenerate',
    ]);
    handler = server.mounted[0].handler;
  });

  it('answers 405 to anything but a POST', async () => {
    expect(await send(handler, 'GET')).toEqual({
      statusCode: 405,
      body: 'POST only',
    });
  });

  it('writes the scratch registries and invalidates their modules before answering ok', async () => {
    const payload = {
      rootComponent: 'Badge',
      props: { tone: 'loud' },
      slots: { default: { kind: 'text', value: 'Fresh' } },
    };
    expect(await send(handler, 'POST', JSON.stringify(payload))).toEqual({
      statusCode: 200,
      body: 'ok',
    });

    expect(server.loadedModules).toEqual([]);

    const written = [
      'react.tsx',
      'vue.ts',
      'registry.ts',
      'Badge.render.svelte',
    ].map((file) => join(generatedRoot, 'scratch', file));
    for (const file of written) expect(existsSync(file)).toBe(true);
    expect(readFileSync(written[0], 'utf8')).toContain("from 'acme/react'");
    expect(readFileSync(written[0], 'utf8')).toContain('Fresh');
    expect(readFileSync(written[1], 'utf8')).toContain("from 'acme/vue'");
    expect(server.invalidated.sort()).toEqual([...written].sort());
  });

  it('answers 500 with the error message for a payload it cannot read, logging the stack', async () => {
    const response = await send(handler, 'POST', '{ not json');
    expect(response.statusCode).toBe(500);
    expect(response.body).toMatch(/JSON/);
    expect(response.body).not.toMatch(/\n\s+at /);
    expect(server.errors.at(-1)).toContain('[scratch-regeneration]');
    expect(server.errors.at(-1)).toMatch(/\n\s+at /);
  });
});

describe("hostPagePlugin - the host page's start", () => {
  const page =
    '<html>\n  <head>\n    <title>preview</title>\n  </head>\n  <body><div id="root"></div></body>\n</html>';
  const hostPage = resolve(applicationRoot, 'index.html');
  const charcellPage = resolve(here, '../src/shells/charcell/page.ts');
  const pluginFor = (shellPageAbsolute: string | undefined) =>
    hostPagePlugin({
      ...(shellPageAbsolute === undefined ? {} : { shellPageAbsolute }),
      importModule: (path: string) => import(path),
    } as unknown as PreviewContext);
  const transform = (
    plugin: ReturnType<typeof hostPagePlugin>,
    filename = hostPage
  ): Promise<string> =>
    (
      plugin.transformIndexHtml as {
        handler: (html: string, context: { filename: string }) => Promise<string>;
      }
    ).handler(page, { filename });
  const configure = (
    plugin: ReturnType<typeof hostPagePlugin>,
    command: 'serve' | 'build'
  ) =>
    (
      plugin.config as (
        configuration: object,
        environment: { command: string }
      ) => Promise<{ server: { fs: { allow: string[] } } } | undefined>
    )({}, { command });

  it("writes the charcell shell's page into the host page: the dark ground in the lowest layer, the face preloaded and held for its font, and the loading note in the root", async () => {
    const transformed = await transform(pluginFor(charcellPage));
    expect(transformed).toContain(
      '<html>\n  <head>\n    <title>preview</title>\n    <style>@layer { html { color-scheme: dark; background: #000000; } }</style>\n'
    );
    const href = transformed.match(
      /<link rel="preload" as="font" type="font\/woff2" crossorigin href="([^"]+)" \/>/
    )?.[1];
    expect(href).toMatch(/fonts\/OverpassMono\.woff2$/);
    // The build takes the file relative to the page.
    expect(existsSync(resolve(dirname(hostPage), href!))).toBe(true);
    const face = transformed.match(/@font-face\s*\{[^}]*\}/)?.[0];
    expect(face).toContain(`url("${href}")`);
    expect(face).toContain('font-display:block');
    expect(face).toContain('size-adjust');
    expect(transformed).toContain('</style>\n  </head>\n');
    const root = transformed.match(
      /<div id="root">([\s\S]*)<\/div><\/body>/
    )?.[1];
    expect(root).toContain(
      '<div class="PreviewPageLoading" role="status" aria-label="loading"></div>'
    );
    expect(root).toContain("'Charcell Overpass Mono'");
    expect(root).toContain('round(down, calc((100% - 10ch) / 2), 1ch)');
  });

  it('serves the files a page references from where they are on the development server, and allows their directories', async () => {
    const plugin = pluginFor(charcellPage);
    const configuration = await configure(plugin, 'serve');
    const allowed = configuration!.server.fs.allow;
    expect(allowed).toHaveLength(1);
    expect(existsSync(join(allowed[0]!, 'OverpassMono.woff2'))).toBe(true);
    const transformed = await transform(plugin);
    expect(transformed).toContain(
      `href="/@fs${join(allowed[0]!, 'OverpassMono.woff2')}"`
    );
  });

  it("writes any shell's page, markup or functions, and leaves the root's place in the head alone", async () => {
    const directory = temporaryDirectory('preview-shell-page-');
    const pagePath = join(directory, 'page.mjs');
    writeFileSync(
      pagePath,
      "export default { head: '<meta name=\"shell\" content=\"$&\" />', root: async () => '<p>one moment</p>' };\n"
    );
    const plugin = pluginFor(pagePath);
    expect(await configure(plugin, 'build')).toBeUndefined();
    expect(await transform(plugin)).toBe(
      '<html>\n  <head>\n    <title>preview</title>\n    <meta name="shell" content="$&" />\n  </head>\n  <body><div id="root"><p>one moment</p></div></body>\n</html>'
    );
  });

  it('leaves the page of a shell with no page, and every iframe\'s page, as they are', async () => {
    expect(await transform(pluginFor(undefined))).toBe(page);
    expect(await configure(pluginFor(undefined), 'serve')).toBeUndefined();
    expect(
      await transform(
        pluginFor(charcellPage),
        resolve(applicationRoot, 'preview/code/code.html')
      )
    ).toBe(page);
  });
});

describe('htmlSourcePlugin - the html source endpoint', () => {
  let handler: Connect.NextHandleFunction;
  let server: ReturnType<typeof fakeServer>;

  beforeAll(async () => {
    const kitRoot = temporaryDirectory('preview-html-source-');
    writeSourceKit(kitRoot);
    server = fakeServer();
    const plugin = htmlSourcePlugin(loadPreviewContext(kitRoot));
    await (plugin.configureServer as (server: ViteDevServer) => unknown)(
      server.server
    );
    expect(server.mounted.map((entry) => entry.path)).toEqual([
      '/__preview_html_source',
    ]);
    handler = server.mounted[0].handler;
  });

  it('answers 405 to anything but a POST', async () => {
    expect(await send(handler, 'GET')).toEqual({
      statusCode: 405,
      body: 'POST only',
    });
  });

  it("prints the story it is sent through the kit's templates", async () => {
    const story = {
      rootComponent: 'Badge',
      props: { tone: 'loud' },
      slots: { default: { kind: 'text', value: 'fresh' } },
    };
    expect(await send(handler, 'POST', JSON.stringify(story))).toEqual({
      statusCode: 200,
      body: JSON.stringify({ markup: '<span class="Badge">fresh</span>\n' }),
    });
  });

  it('answers the warnings for what the markup leaves out at rest beside it', async () => {
    const response = await send(
      handler,
      'POST',
      JSON.stringify({
        rootComponent: 'Disclosure',
        props: { label: 'details' },
      })
    );
    expect(JSON.parse(response.body)).toEqual({
      markup:
        '<div class="Disclosure"\n  ><button aria-label="details">toggle</button\n></div>\n',
      warnings: [
        'Disclosure: could not evaluate 2 expressions (isOpen is not defined)',
      ],
    });
  });

  it('answers what a story holds that has no markup', async () => {
    const response = await send(
      handler,
      'POST',
      JSON.stringify({ rootComponent: 'Shuffler', props: {} })
    );
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      missing: [
        'Shuffler, a component with no template that handWrittenComponents does not map',
      ],
    });
  });

  it('answers 404 for a component the kit lacks, and 500 for a body it cannot read', async () => {
    expect(
      await send(
        handler,
        'POST',
        JSON.stringify({ rootComponent: 'Nope', props: {} })
      )
    ).toEqual({
      statusCode: 404,
      body: 'The kit has no component named Nope.',
    });
    const response = await send(handler, 'POST', '{ not json');
    expect(response.statusCode).toBe(500);
    expect(server.errors.at(-1)).toContain('[html-source]');
  });
});

describe('configurationModulePlugin - the data the pages read', () => {
  /** A kit whose configuration is a TypeScript module importing a value
   *  from another of the kit's modules, with a hook only Node reads. */
  function kit(): PreviewContext {
    const kitRoot = temporaryDirectory('preview-vite-configuration-module-');
    mkdirSync(join(kitRoot, 'preview'));
    writeFileSync(join(kitRoot, 'preview/shell.ts'), 'export {};\n');
    writeFileSync(
      join(kitRoot, 'preview/prefix.ts'),
      "export const prefix = 'acme';\n"
    );
    writeFileSync(
      join(kitRoot, 'scaffold-ui-kit.ts'),
      `import { prefix } from './preview/prefix';
export default {
  name: 'acme',
  targets: ['react'],
  preview: {
    shell: 'preview/shell.ts',
    sources: [{ id: 'kit', label: 'Acme', order: 0, moduleBase: 'acme' }],
    canvas: { namePrefix: prefix },
    themes: [{ id: 'light', label: 'Light', css: 'light.css' }],
    options: [{ id: 'mode', label: 'mode', default: false, scope: 'global', apply: { type: 'class', className: 'dark' } }],
    labels: { generatedScenario: (prop: string) => prop },
  },
};
`
    );
    return loadPreviewContext(kitRoot);
  }

  it('serves each key the pages read as JSON, the unset ones as undefined, and nothing else', async () => {
    const plugin = configurationModulePlugin(kit()) as Plugin & {
      resolveId: (id: string) => string | undefined;
      load: (id: string) => string | undefined;
    };
    const resolved = plugin.resolveId(CONFIGURATION_MODULE);
    expect(resolved).toBe(`\0${CONFIGURATION_MODULE}`);
    expect(plugin.resolveId('@preview-views')).toBeUndefined();
    const source = plugin.load(resolved!)!;
    expect(source).toBe(
      [
        'export const options = [{"id":"mode","label":"mode","default":false,"scope":"global","apply":{"type":"class","className":"dark"}}];',
        'export const canvas = {"namePrefix":"acme"};',
        'export const themes = [{"id":"light","label":"Light","css":"light.css"}];',
        'export const mount = undefined;',
        'export const viewCanvas = undefined;',
      ].join('\n')
    );
    // Neither the configuration's imports nor its Node-only hooks reach it.
    expect(source).not.toContain('prefix');
    expect(source).not.toContain('generatedScenario');
  });

  it('is in the Vite configuration, where no alias names the kit configuration', () => {
    const configuration = buildViteConfiguration(kit());
    expect(
      (configuration.plugins as Plugin[]).some(
        (plugin) => plugin?.name === 'preview-configuration'
      )
    ).toBe(true);
    const alias = configuration.resolve?.alias as Alias[];
    expect(
      alias.some((entry) => String(entry.find).startsWith('@preview-config'))
    ).toBe(false);
  });

  it("compiles the kit's SCSS with the importer for its own pkg: URLs", () => {
    const context = kit();
    writeFileSync(
      join(context.kitRoot, 'package.json'),
      JSON.stringify({ name: 'acme' })
    );
    const scss = buildViteConfiguration(context).css?.preprocessorOptions
      ?.scss as {
      importers: { findFileUrl(url: string): URL | null }[];
    };
    expect(scss.importers).toHaveLength(1);
    expect(scss.importers[0].findFileUrl('pkg:other/x')).toBeNull();
  });
});

describe('buildViteConfiguration - the dev server', () => {
  let context: PreviewContext;

  beforeAll(() => {
    const kitRoot = temporaryDirectory('preview-vite-configuration-');
    writeFileSync(
      join(kitRoot, 'scaffold-ui-kit.json'),
      JSON.stringify({
        name: 'acme',
        targets: ['react', 'vue', 'svelte'],
        preview: {
          shell: 'preview/shell.ts',
          sources: [{ id: 'kit', label: 'Acme', order: 0, moduleBase: 'acme' }],
        },
      })
    );
    mkdirSync(join(kitRoot, 'preview'));
    writeFileSync(join(kitRoot, 'preview/shell.ts'), 'export {};\n');
    context = loadPreviewContext(kitRoot);
  });

  it("allows both the kit's and this package's workspace roots", () => {
    const repositoryRoot = resolve(here, '../../..');
    expect(existsSync(join(repositoryRoot, 'pnpm-workspace.yaml'))).toBe(true);
    const allow = buildViteConfiguration(context).server?.fs?.allow ?? [];
    // A kit outside any workspace is its own workspace root.
    expect(allow).toContain(context.kitRoot);
    expect(allow).toContain(repositoryRoot);
  });

  it("aliases the kit's shell, serves its directory, and keeps this package out of the pre-bundle", () => {
    const configuration = buildViteConfiguration(context);
    const alias = configuration.resolve?.alias as Alias[];
    expect(
      alias.find((entry) => entry.find === '@preview-shell')?.replacement
    ).toBe(join(context.kitRoot, 'preview/shell.ts'));
    expect(configuration.server?.fs?.allow).toContain(
      join(context.kitRoot, 'preview')
    );
    expect(configuration.optimizeDeps?.exclude).toContain(
      '@scaffold-ui-kit/preview'
    );
  });

  it('loads the framework runtimes once, and no package of the kit unless it names one', () => {
    const configuration = buildViteConfiguration(context);
    expect(configuration.resolve?.dedupe).toEqual([
      'react',
      'react-dom',
      'vue',
      'svelte',
    ]);
    const alias = configuration.resolve?.alias as Alias[];
    expect(alias.every((entry) => typeof entry.find === 'string')).toBe(true);
  });

  it("loads each package the kit names in dedupe from the kit's own copy, wherever it is imported", async () => {
    const kitRoot = temporaryDirectory('preview-vite-dedupe-');
    writeFileSync(
      join(kitRoot, 'scaffold-ui-kit.json'),
      JSON.stringify({
        name: 'acme',
        targets: ['react', 'vue', 'svelte'],
        preview: {
          shell: 'preview/shell.ts',
          sources: [{ id: 'kit', label: 'Acme', order: 0, moduleBase: 'acme' }],
          dedupe: ['@acme/registry'],
        },
      })
    );
    mkdirSync(join(kitRoot, 'preview'));
    writeFileSync(join(kitRoot, 'preview/shell.ts'), 'export {};\n');
    const packageDirectory = join(kitRoot, 'node_modules/@acme/registry');
    mkdirSync(packageDirectory, { recursive: true });
    writeFileSync(
      join(packageDirectory, 'package.json'),
      '{"name":"@acme/registry"}'
    );
    const configuration = buildViteConfiguration(loadPreviewContext(kitRoot));
    // Vite's own dedupe resolves from the server's root, so the kit's
    // packages are not among the framework runtimes it names.
    expect(configuration.resolve?.dedupe).toEqual([
      'react',
      'react-dom',
      'vue',
      'svelte',
    ]);
    const entry = (configuration.resolve?.alias as Alias[]).find(
      (candidate) => candidate.find instanceof RegExp
    )!;
    const find = entry.find as RegExp;
    expect(find.test('@acme/registry')).toBe(true);
    expect(find.test('@acme/registry/plugins')).toBe(true);
    expect(find.test('@acme/registry-extra')).toBe(false);
    expect(find.test('x@acme/registry')).toBe(false);
    // Whoever imports it, it resolves as the kit root would.
    const requests: unknown[][] = [];
    const resolver = entry.customResolver as (
      this: { resolve: (...parameters: unknown[]) => unknown },
      source: string,
      importer: string | undefined,
      options: Record<string, unknown>
    ) => unknown;
    resolver.call(
      { resolve: (...parameters: unknown[]) => requests.push(parameters) },
      '@acme/registry/plugins',
      '/elsewhere/shell.ts',
      { isEntry: false }
    );
    expect(requests).toEqual([
      [
        '@acme/registry/plugins',
        join(kitRoot, 'package.json'),
        { isEntry: false, skipSelf: true },
      ],
    ]);
  });

  it('fails on a package to dedupe that does not resolve from the kit root', () => {
    const kitRoot = temporaryDirectory('preview-vite-dedupe-missing-');
    writeFileSync(
      join(kitRoot, 'scaffold-ui-kit.json'),
      JSON.stringify({
        name: 'acme',
        targets: ['react', 'vue', 'svelte'],
        preview: {
          shell: 'preview/shell.ts',
          sources: [{ id: 'kit', label: 'Acme', order: 0, moduleBase: 'acme' }],
          dedupe: ['@acme/absent'],
        },
      })
    );
    mkdirSync(join(kitRoot, 'preview'));
    writeFileSync(join(kitRoot, 'preview/shell.ts'), 'export {};\n');
    expect(() => buildViteConfiguration(loadPreviewContext(kitRoot))).toThrow(
      /dedupe names '@acme\/absent', which does not resolve from the kit root/
    );
  });

  it("keeps Vite's dependency cache in the kit's generated tree, not the installed package", () => {
    expect(buildViteConfiguration(context).cacheDir).toBe(
      join(context.generatedRoot, '.vite')
    );
  });

  it('takes the given port over the configured one, and the configured one over the default', () => {
    expect(DEFAULT_PORT).toBe(6100);
    expect(buildViteConfiguration(context).server?.port).toBe(6100);
    const configured = {
      ...context,
      configuration: { ...context.configuration, port: 6200 },
    };
    expect(buildViteConfiguration(configured).server?.port).toBe(6200);
    expect(
      buildViteConfiguration(configured, { port: 7000 }).server?.port
    ).toBe(7000);
    expect(buildViteConfiguration(context, { port: 7000 }).server?.port).toBe(
      7000
    );
  });

  it('listens on the given host over the configured one, and on this machine alone by default', () => {
    expect(buildViteConfiguration(context).server?.host).toBeUndefined();
    const configured = {
      ...context,
      configuration: { ...context.configuration, host: '0.0.0.0' },
    };
    expect(buildViteConfiguration(configured).server?.host).toBe('0.0.0.0');
    expect(
      buildViteConfiguration(configured, { host: true }).server?.host
    ).toBe(true);
    expect(
      buildViteConfiguration(context, { host: '192.168.1.20' }).server?.host
    ).toBe('192.168.1.20');
  });

  it('builds with relative paths, so the static preview works from a subpath', () => {
    const configuration = buildViteConfiguration(context);
    expect(configuration.base).toBe('./');
    expect(configuration.build?.assetsDir).toBe('assets');
  });
});

describe('entryStylesheetsPlugin - the static build links each page to its stylesheets', () => {
  /** A chunk of the fake bundle: its imports and the stylesheets it emits. */
  const chunk = (
    fileName: string,
    imports: string[],
    css: string[],
    page?: string
  ) => ({
    type: 'chunk' as const,
    fileName,
    imports,
    isEntry: page !== undefined,
    facadeModuleId: page === undefined ? null : resolve(applicationRoot, page),
    viteMetadata: {
      importedCss: new Set(css),
      importedAssets: new Set<string>(),
    },
  });
  const page = (fileName: string, links: string[]) => ({
    type: 'asset' as const,
    fileName,
    source: `<html><head>\n${links.map((href) => `<link rel="stylesheet" href="${href}">\n`).join('')}</head></html>`,
  });

  it("adds a stylesheet Vite left off a page that shares it with another page's chunk", () => {
    // The kit's React and Vue chunks emit one stylesheet between them; the
    // host imports both through the views, and Vite links it on the Vue page
    // only through whichever chunk it met first.
    const bundle = {
      'assets/kit-react.js': chunk(
        'assets/kit-react.js',
        [],
        ['assets/kit.css']
      ),
      'assets/kit-vue.js': chunk('assets/kit-vue.js', [], ['assets/kit.css']),
      'assets/views.js': chunk(
        'assets/views.js',
        ['assets/kit-react.js', 'assets/kit-vue.js'],
        []
      ),
      'assets/host.js': chunk(
        'assets/host.js',
        ['assets/views.js'],
        ['assets/host.css'],
        'index.html'
      ),
      'assets/vue.js': chunk(
        'assets/vue.js',
        ['assets/kit-vue.js'],
        [],
        'preview/vue/preview.html'
      ),
      'index.html': page('index.html', [
        './assets/kit.css',
        './assets/host.css',
      ]),
      'preview/vue/preview.html': page('preview/vue/preview.html', []),
    };
    const plugin = entryStylesheetsPlugin();
    const generateBundle = plugin.generateBundle as {
      handler: (...parameters: unknown[]) => void;
    };
    generateBundle.handler.call({}, {}, bundle, false);
    expect(bundle['preview/vue/preview.html'].source).toContain(
      '<link rel="stylesheet" crossorigin href="../../assets/kit.css">\n  </head>'
    );
    // A page Vite linked fully is left as it was.
    expect(bundle['index.html'].source).toBe(
      page('index.html', ['./assets/kit.css', './assets/host.css']).source
    );
  });
});

describe('chunkSizePlugin - the static build warns of a large chunk the kit can act on', () => {
  const chunk = (
    fileName: string,
    kilobytes: number,
    name = fileName,
    isEntry = false
  ) => ({
    type: 'chunk',
    fileName,
    name,
    isEntry,
    code: 'x'.repeat(kilobytes * 1000),
  });
  const bundle = {
    'assets/host.js': chunk('assets/host.js', 580, 'host', true),
    'assets/react.js': chunk('assets/react.js', 620, 'react', true),
    'assets/client.js': chunk('assets/client.js', 190),
  };
  const warnings = (shell: string): string[] => {
    const warned: string[] = [];
    const plugin = chunkSizePlugin({
      charcellShellAbsolute:
        shell === CHARCELL_SHELL
          ? resolve(applicationRoot, 'shells/charcell/index.tsx')
          : undefined,
    });
    (plugin.generateBundle as (...parameters: unknown[]) => void).call(
      { warn: (message: string) => warned.push(message) },
      {},
      bundle,
      false
    );
    return warned;
  };

  it("leaves the charcell shell's host page out, and names every other chunk past the limit", () => {
    expect(warnings(CHARCELL_SHELL)).toEqual([
      'some chunks are larger than 500 kB after minification: assets/react.js (620.00 kB)',
    ]);
  });

  it('names the host page under a shell the kit gives', () => {
    expect(warnings('./preview/shell.ts')).toEqual([
      'some chunks are larger than 500 kB after minification: assets/host.js (580.00 kB), assets/react.js (620.00 kB)',
    ]);
  });

  it("turns Vite's own warning off", () => {
    const kitRoot = temporaryDirectory('preview-chunk-size-');
    writeSourceKit(kitRoot);
    const configuration = buildViteConfiguration(loadPreviewContext(kitRoot));
    expect(configuration.build?.chunkSizeWarningLimit).toBe(
      Number.POSITIVE_INFINITY
    );
    expect(
      configuration.plugins?.some(
        (plugin) => (plugin as Plugin).name === 'preview-chunk-size'
      )
    ).toBe(true);
  });
});
