// The preview's Vite configuration, built from the preview context. One server
// hosts the host page (the bootstrap and the shell it loads) plus the
// per-target preview iframes and the html one (each its own entry); the framework plugins
// coexist by file extension. Everything kit-specific arrives through the
// context: the generated registries (`@preview-generated`), the data of the
// kit's preview block (`@preview-configuration`, served as JSON), its custom views
// (`@preview-views`), its shell (`@preview-shell`), preview-only aliases,
// SCSS load paths and `pkg:` URLs, the prebundle exclusions for raw-`.svelte` shippers, and
// the packages the kit names to load once.

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  searchForWorkspaceRoot,
  type Alias,
  type InlineConfig,
  type Plugin,
  type Rollup,
} from 'vite';
import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { PreviewContext } from './context.js';
import { PREVIEW_BROWSER_KEYS } from './lib/types.js';
import { loadKit } from './load.js';
import {
  missingShellPeers,
  missingShellPeersProblem,
  resolvesFrom,
} from './shell-peers.js';
import {
  HOST_PAGE,
  loadShellPage,
  type ResolvedShellPage,
} from './shell-page.js';
import { printHtmlSource } from './story-source.js';
import { writeScratch, type ScratchPayload } from './emit/scratch.js';
import { htmlSourceResponse } from './html-stylesheet.js';
import { kitImporters, kitPackageDirectories } from './sass-importers.js';
import {
  HTML_SOURCE_ENDPOINT,
  type HtmlSourceRequest,
} from './controller/html-source.js';

const here = dirname(fileURLToPath(import.meta.url));
/** The application shell shipped with this package (`<package>/application`). */
export const applicationRoot = resolve(here, '../application');

/** This package's root, whose dependencies the application imports. */
const packageRoot = resolve(here, '..');

/** This package's name: its own subpaths are never pre-bundled, so a shell
 *  installed beside it and the bootstrap load one copy of the SDK. */
const PACKAGE_NAME = '@scaffold-ui-kit/preview';

/** The dev server's port when the kit configures none and `dev` is given no `--port`. */
export const DEFAULT_PORT = 6100;

/** The directory holding the package `specifier` resolves to from `from`:
 *  its real location, which for a `link:` dependency sits outside every
 *  workspace the server would otherwise allow. */
function packageDirectory(specifier: string, from: string): string | undefined {
  let resolved: string;
  try {
    resolved = createRequire(from).resolve(specifier);
  } catch {
    return undefined;
  }
  for (
    let directory = dirname(resolved);
    directory !== dirname(directory);
    directory = dirname(directory)
  ) {
    if (existsSync(resolve(directory, 'package.json'))) return directory;
  }
  return undefined;
}

/** The framework runtimes the preview always loads one copy of. */
const FRAMEWORK_RUNTIMES = ['react', 'react-dom', 'vue', 'svelte'];

/**
 * The aliases that load one copy of each package the kit names in `dedupe`:
 * an import of the package, or of one of its subpaths, resolves as the kit
 * root would resolve it, whoever imports it. Vite's own `resolve.dedupe`
 * resolves from the server's root, this package's application directory,
 * which need not see the kit's dependencies at all; an alias also applies
 * while Vite prebundles dependencies, so the prebundled copy is the kit's.
 *
 * @param names - The packages the kit names.
 * @param kitRoot - The kit root they resolve from.
 * @returns One alias per package.
 * @throws When a package does not resolve from the kit root.
 */
function kitDedupeAliases(names: readonly string[], kitRoot: string): Alias[] {
  // Any file at the kit root stands in as the importer; it need not exist.
  const kitImporter = resolve(kitRoot, 'package.json');
  return names.map((name) => {
    if (!resolvesFrom(name, kitRoot)) {
      throw new Error(
        `[preview] preview.dedupe names '${name}', which does not resolve from the kit root (${kitRoot}): add it to the kit's dependencies`
      );
    }
    return {
      find: new RegExp(
        `^${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?=/|$)`
      ),
      replacement: name,
      customResolver(source, _importer, options) {
        return this.resolve(source, kitImporter, {
          ...options,
          skipSelf: true,
        });
      },
    } satisfies Alias;
  });
}

// Scenario editor regeneration endpoint: the host POSTs its editable node tree here on
// each structural edit; we run it through the real emitters (imported as
// plain Node modules: Vite's SSR pipeline would evaluate the engine's CommonJS
// build as ESM and fail on `exports`) and overwrite
// `.preview-generated/scratch/*`, which the previews import. The host reloads the preview iframes (by bumping their
// src) once this POST resolves; module invalidation happens before responding
// so the next import re-transforms fresh content.
export function scratchRegenerationPlugin(generatedRoot: string): Plugin {
  return {
    name: 'preview-scratch-regeneration',
    configureServer(server) {
      server.middlewares.use('/__preview_regenerate', (request, response) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          return response.end('POST only');
        }
        let body = '';
        request.on('data', (chunk) => (body += chunk));
        request.on('end', async () => {
          try {
            const payload = JSON.parse(body) as ScratchPayload;
            const written = writeScratch(payload, generatedRoot);
            for (const file of written) {
              for (const mod of server.moduleGraph.getModulesByFile(file) ??
                []) {
                server.moduleGraph.invalidateModule(mod);
              }
            }
            response.statusCode = 200;
            response.end('ok');
          } catch (error) {
            // The stack goes to the server log; the editor gets the message.
            const message =
              error instanceof Error ? error.message : String(error);
            const detail =
              error instanceof Error ? (error.stack ?? error.message) : message;
            server.config.logger.error(`[scratch-regeneration] ${detail}`);
            response.statusCode = 500;
            response.end(message);
          }
        });
      });
    },
  };
}

/** The module the preview's pages import the data of the kit's preview
 *  block from. */
export const CONFIGURATION_MODULE = '@preview-configuration';

/**
 * The module the preview's pages import the kit's preview block from: the
 * keys they read (`options`, `canvas`, `themes`, `mount`, `viewCanvas`),
 * each exported as the JSON the context loader checked it can be. The kit
 * configuration itself, and whatever it imports, stays in Node.
 *
 * @param context - The kit's preview context.
 * @returns The plugin.
 */
export function configurationModulePlugin(context: PreviewContext): Plugin {
  const resolvedId = `\0${CONFIGURATION_MODULE}`;
  return {
    name: 'preview-configuration',
    resolveId(id) {
      return id === CONFIGURATION_MODULE ? resolvedId : undefined;
    },
    load(id) {
      if (id !== resolvedId) return undefined;
      return configurationModuleSource(context);
    },
  };
}

/**
 * The source of the module {@link configurationModulePlugin} serves.
 *
 * @param context - The kit's preview context.
 * @returns One `export const` per key the preview's pages read.
 */
export function configurationModuleSource(context: PreviewContext): string {
  return PREVIEW_BROWSER_KEYS.map(
    (key) =>
      `export const ${key} = ${
        context.configuration[key] === undefined
          ? 'undefined'
          : JSON.stringify(context.configuration[key])
      };`
  ).join('\n');
}

/** The module the html pane imports for the kit's own stylesheets. */
export const HTML_STYLESHEETS_MODULE = '@preview-html-stylesheets';

/**
 * The module the html pane imports for the kit's `htmlStylesheets`: one
 * import of each, so each loads beside the theme's stylesheet as Vite
 * loads CSS, and none for a kit that lists none.
 *
 * @param context - The kit's preview context.
 * @returns The plugin.
 */
export function htmlStylesheetsPlugin(context: PreviewContext): Plugin {
  const resolvedId = `\0${HTML_STYLESHEETS_MODULE}`;
  return {
    name: 'preview-html-stylesheets',
    resolveId(id) {
      return id === HTML_STYLESHEETS_MODULE ? resolvedId : undefined;
    },
    load(id) {
      if (id !== resolvedId) return undefined;
      return (context.configuration.htmlStylesheets ?? [])
        .map(
          (path) => `import ${JSON.stringify(resolve(context.kitRoot, path))};`
        )
        .join('\n');
    },
  };
}

/**
 * The host page's start under a shell that brings a page: the page's `head`
 * is written at the end of the host page's `<head>` and its `root` into the
 * root element, where it shows until the shell mounts over it. The page
 * module is loaded once, as the configuration resolves, and the directories
 * of the files it references are added to what the development server may
 * serve. A shell with no page leaves the host page as it is, its root empty
 * until the shell mounts; the iframes' pages are never touched.
 *
 * @param context - The kit's preview context.
 * @returns The plugin.
 */
export function hostPagePlugin(context: PreviewContext): Plugin {
  const hostPage = HOST_PAGE;
  let page: Promise<ResolvedShellPage | undefined> | undefined;
  const pageFor = (serving: boolean) =>
    (page ??= loadShellPage(context, { hostPage, serving }));
  return {
    name: 'preview-host-page',
    async config(_, { command }) {
      const resolved = await pageFor(command === 'serve');
      if (resolved === undefined || resolved.assetDirectories.length === 0)
        return undefined;
      return { server: { fs: { allow: resolved.assetDirectories } } };
    },
    transformIndexHtml: {
      order: 'pre',
      async handler(html, { filename }) {
        if (resolve(filename) !== hostPage) return html;
        const resolved = await pageFor(false);
        if (resolved === undefined) return html;
        const head = resolved.head
          .split('\n')
          .map((line) => `  ${line}\n  `)
          .join('');
        return html
          .replace('</head>', () => `${resolved.head ? head : ''}</head>`)
          .replace(
            '<div id="root"></div>',
            () => `<div id="root">${resolved.root}</div>`
          );
      },
    },
  };
}

/**
 * The stylesheets each page of the static build loads: every stylesheet of
 * the chunks its entry imports statically, at any depth.
 *
 * @param entry - The page's entry chunk.
 * @param bundle - The build's output.
 * @returns The stylesheets' file names, in import order.
 */
function entryStylesheets(
  entry: Rollup.OutputChunk,
  bundle: Rollup.OutputBundle
): string[] {
  const stylesheets: string[] = [];
  const seen = new Set<string>();
  const visit = (chunk: Rollup.OutputChunk): void => {
    if (seen.has(chunk.fileName)) return;
    seen.add(chunk.fileName);
    for (const imported of chunk.imports) {
      const importee = bundle[imported];
      if (importee?.type === 'chunk') visit(importee);
    }
    for (const stylesheet of chunk.viteMetadata?.importedCss ?? [])
      if (!stylesheets.includes(stylesheet)) stylesheets.push(stylesheet);
  };
  visit(entry);
  return stylesheets;
}

/** The size, in kB after minification, past which the static build warns of
 *  a chunk, as Vite warns of one by default. */
export const CHUNK_SIZE_WARNING_LIMIT = 500;

/**
 * Warns of each chunk of the static build larger than
 * {@link CHUNK_SIZE_WARNING_LIMIT} kB, in place of Vite's own warning, which
 * the preview turns off: under the charcell shell the host page's entry
 * chunk, which holds the preview's interface and the shell, is the preview's
 * own and passes over that size whatever the kit holds, so it is left out. Every
 * other chunk, the kit's components and their dependencies among them, and
 * the host's under a shell the kit gives, is warned of by name.
 *
 * @param context - The preview context, for the shell it names.
 * @returns The plugin.
 */
export function chunkSizePlugin(
  context: Pick<PreviewContext, 'charcellShellAbsolute'>
): Plugin {
  const hostIsPreviewOwn = context.charcellShellAbsolute !== undefined;
  return {
    name: 'preview-chunk-size',
    apply: 'build',
    generateBundle(_options, bundle) {
      const large = Object.values(bundle)
        .filter(
          (output): output is Rollup.OutputChunk =>
            output.type === 'chunk' &&
            !(hostIsPreviewOwn && output.isEntry && output.name === 'host')
        )
        .map((chunk) => ({
          fileName: chunk.fileName,
          size: Buffer.byteLength(chunk.code) / 1000,
        }))
        .filter(({ size }) => size > CHUNK_SIZE_WARNING_LIMIT);
      if (large.length === 0) return;
      this.warn(
        `some chunks are larger than ${CHUNK_SIZE_WARNING_LIMIT} kB after minification: ${large
          .map(({ fileName, size }) => `${fileName} (${size.toFixed(2)} kB)`)
          .join(', ')}`
      );
    },
  };
}

/**
 * Links every page of the static build to each stylesheet its entry imports.
 *
 * Vite's html plugin caches each chunk's stylesheet list the first time a
 * page reaches the chunk, filtered by what that page has already linked, and
 * reuses the cached list on every later page. When two chunks emit
 * byte-identical CSS, which Rollup writes as one asset (a kit whose React and
 * Vue builds share their stylesheets), and the host page imports both through
 * the kit's views, the second chunk's list is cached empty on the host, and
 * a framework page importing only that chunk gets no link. This plugin adds
 * each missing link after Vite's own, before `</head>`; a page Vite linked
 * fully is unchanged. On a page Vite linked only in part, an added link
 * cascades after the ones Vite wrote rather than in import order, which
 * matters only when the two stylesheets set the same property at the same
 * specificity.
 *
 * @returns The plugin.
 */
export function entryStylesheetsPlugin(): Plugin {
  let root = applicationRoot;
  let base = './';
  return {
    name: 'preview-entry-stylesheets',
    apply: 'build',
    enforce: 'post',
    configResolved(configuration) {
      root = configuration.root;
      base = configuration.base;
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        // The preview builds with a relative base (`./`, buildViteConfiguration's `base`), so
        // a page links an asset by its path from the page; under an absolute
        // base it links the base followed by the asset's file name.
        const relativeBase = base === './' || base === '';
        const entries = Object.values(bundle).filter(
          (output): output is Rollup.OutputChunk =>
            output.type === 'chunk' &&
            output.isEntry &&
            output.facadeModuleId !== null &&
            output.facadeModuleId.endsWith('.html')
        );
        for (const entry of entries) {
          const page = relative(root, entry.facadeModuleId!)
            .split('\\')
            .join('/');
          const asset = bundle[page];
          if (asset?.type !== 'asset' || typeof asset.source !== 'string')
            continue;
          const html = asset.source;
          const directory = posix.dirname(page);
          // What the page links already, as file names in the output.
          const linked = new Set(
            [...html.matchAll(/href="([^"]+)"/g)].map(([, href]) =>
              relativeBase
                ? posix.join(directory, href)
                : href.startsWith(base)
                  ? href.slice(base.length)
                  : href
            )
          );
          const missing = entryStylesheets(entry, bundle)
            .filter((stylesheet) => !linked.has(stylesheet))
            .map((stylesheet) => {
              if (!relativeBase) return `${base}${stylesheet}`;
              const href = posix.relative(directory, stylesheet);
              return href.startsWith('../') ? href : `./${href}`;
            });
          if (missing.length === 0) continue;
          asset.source = html.replace(
            '</head>',
            missing
              .map(
                (href) =>
                  `  <link rel="stylesheet" crossorigin href="${href}">\n`
              )
              .join('') + '  </head>'
          );
        }
      },
    },
  };
}

/**
 * The html source endpoint: the host POSTs a story (its root component, the
 * props it shows and its slot content) and gets back the markup the story
 * renders to, `{ markup }`, or what it holds that has none, `{ missing }`.
 * The kit's components load as generation loads them, so a saved template
 * prints the next time it is asked.
 *
 * @param context - The kit's preview context.
 * @returns The plugin.
 */
export function htmlSourcePlugin(context: PreviewContext): Plugin {
  return {
    name: 'preview-html-source',
    configureServer(server) {
      server.middlewares.use(HTML_SOURCE_ENDPOINT, (request, response) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          return response.end('POST only');
        }
        let body = '';
        request.on('data', (chunk) => (body += chunk));
        request.on('end', async () => {
          try {
            const story = JSON.parse(body) as HtmlSourceRequest;
            const { components } = await loadKit(context);
            const enumerated = components.map((entry) => entry.component);
            const component = enumerated.find(
              (candidate) => candidate.name === story.rootComponent
            );
            if (!component) {
              response.statusCode = 404;
              return response.end(
                `The kit has no component named ${story.rootComponent}.`
              );
            }
            const result = await printHtmlSource(context, enumerated, {
              component,
              props: story.props ?? {},
              children: story.slots?.default,
              named: story.slots?.named ?? {},
              ...(story.around ? { around: story.around } : {}),
            });
            response.statusCode = 200;
            response.setHeader('Content-Type', 'application/json');
            response.end(
              JSON.stringify(htmlSourceResponse(context, enumerated, result))
            );
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            const detail =
              error instanceof Error ? (error.stack ?? error.message) : message;
            server.config.logger.error(`[html-source] ${detail}`);
            response.statusCode = 500;
            response.end(message);
          }
        });
      });
    },
  };
}

/** An empty custom-view registry, aliased in when the kit registers none. */
const noViewsModule = resolve(applicationRoot, 'lib/no-views.ts');
const noCodeBlockModule = resolve(applicationRoot, 'lib/no-code-block.ts');
/** An empty setup module, aliased per target when the kit registers none. */
const noSetupModule = resolve(applicationRoot, 'lib/no-setup.ts');

/** What the `dev` command's options set over the kit's configuration. */
export interface DevelopmentServerOverrides {
  /** The port, over the kit's `port`. */
  port?: number;
  /** The addresses to listen on, over the kit's `host`: an address, or
   *  `true` for every address. */
  host?: string | boolean;
}

/**
 * The Vite configuration for one kit's preview.
 *
 * @param context - The kit's preview context.
 * @param overrides - The development server's port and host, over the
 *   kit's configured ones.
 * @returns The configuration, for Vite's `createServer` or `build`.
 */
export function buildViteConfiguration(
  context: PreviewContext,
  overrides: DevelopmentServerOverrides = {}
): InlineConfig {
  const { kitRoot, generatedRoot, configuration } = context;
  // A kit built into one package per target: its other packages, imported
  // by name as a consumer imports them.
  const kitPackages = context.kitPackages ?? [];
  // A shell package the kit has not installed fails here, by name, rather
  // than as an import the bundler cannot resolve from inside the shell.
  const shellProblem = missingShellPeersProblem(missingShellPeers(context));
  if (shellProblem !== undefined) throw new Error(`[preview] ${shellProblem}`);
  const setupAlias = (target: 'react' | 'vue' | 'svelte'): string => {
    const configured = configuration.setupModules?.[target];
    return configured ? resolve(kitRoot, configured) : noSetupModule;
  };
  const kitAliases = Object.fromEntries(
    Object.entries(configuration.aliases ?? {}).map(([from, to]) => [
      from,
      resolve(kitRoot, to),
    ])
  );
  return {
    configFile: false,
    root: applicationRoot,
    // Relative: the static build's pages load their scripts and styles by
    // paths relative to themselves, so it works from any directory a file
    // server serves it under. The development server serves from `/`.
    base: './',
    // Vite's dependency cache sits with the kit's generated tree, not inside the
    // installed package: it is the kit's, and a stale one is cleared with it.
    cacheDir: resolve(generatedRoot, '.vite'),
    // The generator copies theme stylesheets (+ fonts) here; served at
    // themes/<id>/theme.css in dev and copied verbatim into the static build.
    publicDir: resolve(generatedRoot, 'public'),
    plugins: [
      react(),
      vue(),
      svelte(),
      configurationModulePlugin(context),
      scratchRegenerationPlugin(generatedRoot),
      htmlSourcePlugin(context),
      htmlStylesheetsPlugin(context),
      hostPagePlugin(context),
      entryStylesheetsPlugin(),
      chunkSizePlugin(context),
    ],
    resolve: {
      alias: [
        ...Object.entries({
          '@preview-generated': generatedRoot,
          '@preview-views': context.viewsModuleAbsolute ?? noViewsModule,
          '@preview-code-block':
            context.codeBlockModuleAbsolute ?? noCodeBlockModule,
          '@preview-shell': context.shellModuleAbsolute,
          '@preview-setup/react': setupAlias('react'),
          '@preview-setup/vue': setupAlias('vue'),
          '@preview-setup/svelte': setupAlias('svelte'),
          ...kitAliases,
          // Runtime template compilation (the Vue registry mounts string templates).
          vue: 'vue/dist/vue.esm-bundler.js',
        }).map(([find, replacement]) => ({ find, replacement })),
        // The packages the kit names, each loaded from the kit's own copy.
        ...kitDedupeAliases(configuration.dedupe ?? [], kitRoot),
      ],
      // One instance of each framework runtime across the boundary: the
      // bootstrap lives in this package, the shell may live in the kit, and
      // the kit's components resolve their own deps - without dedupe
      // React/Vue/Svelte would each load twice (hook/context breakage).
      dedupe: FRAMEWORK_RUNTIMES,
    },
    define: {
      __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
    css: {
      preprocessorOptions: {
        scss: {
          loadPaths: (configuration.scssLoadPaths ?? []).map((loadPath) =>
            resolve(kitRoot, loadPath)
          ),
          // The kit's own `pkg:` URLs resolve through its package.json
          // exports, as its build resolves them.
          importers: kitImporters(kitRoot, kitPackageDirectories(context)),
        },
      },
    },
    optimizeDeps: {
      // This package's subpaths stay out of the pre-bundle: a shell installed
      // from npm imports the SDK by package name, and pre-bundling it would
      // give the shell a second copy beside the bootstrap's.
      // The kit's own packages are source the preview watches, as the kit
      // root is, never a dependency to pre-bundle.
      exclude: [
        PACKAGE_NAME,
        ...kitPackages.map(({ name }) => name),
        ...(configuration.optimizeDepsExclude ?? []),
      ],
    },
    server: {
      port: overrides.port ?? configuration.port ?? DEFAULT_PORT,
      // Vite's own default, the local machine only, unless asked.
      host: overrides.host ?? configuration.host,
      fs: {
        // The bootstrap imports this package's dependencies and the kit's
        // components, so both workspaces are served, along with the shell's
        // directory and, when the shell draws with charcell, charcell
        // wherever it resolves from the shell (a link: checkout lives
        // outside both workspaces).
        allow: [
          searchForWorkspaceRoot(packageRoot),
          searchForWorkspaceRoot(kitRoot),
          ...kitPackages.map(({ directoryAbsolute }) => directoryAbsolute),
          dirname(context.shellModuleAbsolute),
          ...[
            packageDirectory(
              'charcell/react/unlinked',
              context.shellModuleAbsolute
            ),
          ].filter((directory) => directory !== undefined),
        ],
      },
    },
    build: {
      outDir: context.staticRoot,
      emptyOutDir: true,
      // Every script lands one directory below the output root, which is how
      // the application finds the URL it is served under (lib/base-url.ts).
      assetsDir: 'assets',
      // The preview warns of a large chunk itself, leaving out the host page
      // the kit cannot change (chunkSizePlugin).
      chunkSizeWarningLimit: Number.POSITIVE_INFINITY,
      rollupOptions: {
        input: {
          host: resolve(applicationRoot, 'index.html'),
          react: resolve(applicationRoot, 'preview/react/preview.html'),
          vue: resolve(applicationRoot, 'preview/vue/preview.html'),
          svelte: resolve(applicationRoot, 'preview/svelte/preview.html'),
          html: resolve(applicationRoot, 'preview/html/preview.html'),
          view: resolve(applicationRoot, 'preview/view/view.html'),
          code: resolve(applicationRoot, 'preview/code/code.html'),
        },
      },
    },
  };
}
