// The `dev` command's server: generate, serve, and keep the preview in step
// with the kit while it runs. The kit's templates, story files and manual
// component modules load in Node for generation, not through Vite, so Vite
// does not watch them; this module adds them to Vite's watcher and
// regenerates when one changes. The generated registries and manifest are in
// Vite's module graph, so writing a changed one reloads the pages that import
// it. An edit to the kit configuration starts a new server from the new
// configuration, since it can change the port, the sources, the shell, the
// aliases and the data the pages are served.

import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve, sep } from 'node:path';
import type { ConfigurationLookupOptions } from 'scaffold-ui-kit';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import { loadPreviewContext, type PreviewContext } from './context.js';
import { generatePreview, type GeneratePreviewResult } from './generate.js';
import {
  buildViteConfiguration,
  type DevelopmentServerOverrides,
} from './vite-configuration.js';
import { isTemplateFile } from './lib/template-files.js';

/** How long a burst of saves settles before the preview regenerates. */
export const REGENERATION_DELAY_MILLISECONDS = 100;

/** The module cache the kit's modules load into (Node's, shared by every importer). */
const moduleCache = createRequire(import.meta.url).cache;

/** The kit root as written and as resolved, since a loaded module is cached
 *  under the path it resolved to. */
function kitRoots(context: PreviewContext): string[] {
  const roots = new Set([context.kitRoot]);
  try {
    roots.add(realpathSync(context.kitRoot));
  } catch {
    // A kit root that does not resolve is only known as written.
  }
  return [...roots].map((root) => root + sep);
}

/** Whether `path` is one of the kit's own modules: under its root, and
 *  neither an installed package nor generated output. */
function isKitModule(
  path: string,
  context: PreviewContext,
  roots: readonly string[]
): boolean {
  return (
    roots.some((root) => path.startsWith(root)) &&
    !path.includes(`${sep}node_modules${sep}`) &&
    !path.startsWith(context.generatedRoot + sep)
  );
}

/**
 * The kit's own modules generation has loaded: the templates and story files,
 * and every module of the kit they import.
 *
 * @param context - The kit's preview context.
 * @returns Their absolute paths.
 */
export function loadedKitModules(context: PreviewContext): string[] {
  const roots = kitRoots(context);
  return Object.keys(moduleCache).filter((path) =>
    isKitModule(path, context, roots)
  );
}

/**
 * Forgets the kit's loaded modules, so the next generation imports each one
 * afresh from disk. Installed packages stay loaded.
 *
 * @param context - The kit's preview context.
 * @returns The absolute paths forgotten.
 */
export function forgetKitModules(context: PreviewContext): string[] {
  const forgotten = loadedKitModules(context);
  for (const path of forgotten) delete moduleCache[path];
  return forgotten;
}

/** What the last successful generation read from a kit, beyond the paths
 *  its preview context names. */
export interface GenerationInputs {
  /** The kit modules it loaded (`loadedKitModules`). */
  loadedModules?: readonly string[];
  /** The theme stylesheets and assets it copied (`generatePreview`'s
   *  `themeSources`). */
  themeSources?: readonly string[];
}

/** What the development server watches in a kit. */
export interface KitWatchPaths {
  /** The files and directories whose changes regenerate the preview. */
  regeneration: string[];
  /** The kit configuration file, whose changes restart the server. */
  kitConfiguration: string;
  /** The kit's modules a `.ts` configuration imports. A change to one
   *  restarts the server too. */
  configurationModules: string[];
}

/**
 * The paths the development server watches in a kit: each source's templates
 * and stories directories (so an added or deleted component is noticed),
 * its manual components module, the shared
 * modules templates import, every other kit module generation loaded, and
 * the themes' stylesheets and assets. The custom views module, the shell and
 * the setup modules are left to Vite, which serves them and reloads them
 * itself; generation reads none of them.
 *
 * @param context - The kit's preview context.
 * @param inputs - What the last successful generation read.
 * @returns The paths, absolute.
 */
export function kitWatchPaths(
  context: PreviewContext,
  inputs: GenerationInputs = {}
): KitWatchPaths {
  const regeneration = new Set<string>();
  for (const source of context.sources) {
    for (const path of [
      source.templatesDirectoryAbsolute,
      source.storiesDirectoryAbsolute,
      source.manualModuleAbsolute,
    ]) {
      if (path) regeneration.add(path);
    }
  }
  for (const path of context.sharedModulesAbsolute) regeneration.add(path);
  for (const path of inputs.loadedModules ?? []) regeneration.add(path);
  for (const path of inputs.themeSources ?? []) regeneration.add(path);
  return {
    regeneration: [...regeneration],
    kitConfiguration: context.configurationPath,
    configurationModules: context.configurationModules,
  };
}

/** What a change to a file means for the development server. */
export type KitChange = 'regenerate' | 'restart';

/**
 * What a change to `path` asks of the development server: a restart for the
 * kit configuration file and the kit modules it loads; a regeneration for a template (a TypeScript module
 * directly in a templates directory), a story file, a theme's stylesheet or a
 * file in its assets, or a module named in `kitWatchPaths`; nothing for any
 * other file.
 *
 * @param path - The absolute path that changed, was added or was deleted.
 * @param context - The kit's preview context.
 * @param inputs - What the last successful generation read.
 * @returns The change, or `undefined` when the file is none of the kit's inputs.
 */
export function classifyKitChange(
  path: string,
  context: PreviewContext,
  inputs: GenerationInputs = {}
): KitChange | undefined {
  const paths = kitWatchPaths(context, inputs);
  if (
    path === paths.kitConfiguration ||
    paths.configurationModules.includes(path)
  )
    return 'restart';
  const directory = dirname(path);
  for (const source of context.sources) {
    if (
      directory === source.templatesDirectoryAbsolute &&
      isTemplateFile(path)
    ) {
      return 'regenerate';
    }
    if (
      directory === source.storiesDirectoryAbsolute &&
      path.endsWith('.story.ts')
    ) {
      return 'regenerate';
    }
  }
  if (
    (inputs.themeSources ?? []).some(
      (source) => path === source || path.startsWith(source + sep)
    )
  ) {
    return 'regenerate';
  }
  const files = new Set(
    paths.regeneration.filter(
      (each) =>
        !context.sources.some(
          (source) =>
            each === source.templatesDirectoryAbsolute ||
            each === source.storiesDirectoryAbsolute
        )
    )
  );
  return files.has(path) ? 'regenerate' : undefined;
}

/** What the kit-watching plugin is told to do beyond regenerating. */
export interface KitWatchOptions {
  /** Called when the kit configuration file changes; settles once the
   *  server is replaced, or kept because the new configuration did not load. */
  onKitConfigurationChange: () => Promise<void>;
  /** What the generation before the server started read; later ones
   *  replace it. */
  inputs?: GenerationInputs;
  /** How long a burst of saves settles first. */
  delayMilliseconds?: number;
}

/**
 * A Vite plugin that watches a kit's preview inputs while the development
 * server runs and regenerates the preview when one changes. Saves arriving
 * within the delay of each other regenerate once. A regeneration imports the
 * kit's modules afresh, keeps Vite's cache and the scenario editor's story,
 * and writes only the files whose content changed; Vite then reloads the
 * pages importing them. A kit with an html pane also reloads its pages when
 * a regeneration writes nothing, since the pane prints the templates' markup
 * itself and a change to it writes no generated file. A kit module that fails to load is
 * logged and the last good output stays until a later save loads.
 *
 * @param context - The kit's preview context.
 * @param options - What a change to the kit configuration file does, and the delay.
 * @returns The plugin.
 */
export function kitWatchPlugin(
  context: PreviewContext,
  options: KitWatchOptions
): Plugin {
  const delay = options.delayMilliseconds ?? REGENERATION_DELAY_MILLISECONDS;
  return {
    name: 'preview-kit-watch',
    configureServer(server) {
      const logger = server.config.logger;
      let inputs: GenerationInputs = {
        loadedModules: loadedKitModules(context),
        ...options.inputs,
      };
      let watched = new Set<string>();
      // Watch what the latest generation read, and stop watching what it no
      // longer reads, unless Vite serves that file itself.
      const watch = (): void => {
        const paths = kitWatchPaths(context, inputs);
        const next = new Set([
          ...paths.regeneration,
          paths.kitConfiguration,
          ...paths.configurationModules,
        ]);
        const dropped = [...watched].filter(
          (path) =>
            !next.has(path) && !server.moduleGraph?.getModulesByFile(path)?.size
        );
        if (dropped.length > 0) server.watcher.unwatch(dropped);
        server.watcher.add([...next].filter((path) => !watched.has(path)));
        watched = next;
      };
      watch();

      let closed = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let running: Promise<void> | undefined;
      let pendingRegeneration = false;
      let pendingRestart = false;

      const regenerate = async (): Promise<void> => {
        forgetKitModules(context);
        try {
          const { written, removed, themeSources } = await generatePreview(
            context,
            { clean: false }
          );
          inputs = { loadedModules: loadedKitModules(context), themeSources };
          watch();
          const changed = written.length + removed.length;
          logger.info(
            changed === 0
              ? '[preview] regenerated: no generated files changed'
              : `[preview] regenerated: ${changed} ${changed === 1 ? 'file' : 'files'} changed`,
            { timestamp: true }
          );
          // The theme stylesheets are served as files, outside the module
          // graph: a changed one reloads the pages here. The html pane's
          // markup is printed on request from the templates just loaded, and
          // a change to a template's markup writes no generated file, so
          // that kit reloads here when nothing was written for Vite to act on.
          const publicRoot = resolve(context.generatedRoot, 'public') + sep;
          if (
            (context.buildsHtml && changed === 0) ||
            written.some((path) => path.startsWith(publicRoot))
          ) {
            server.ws.send({ type: 'full-reload', path: '*' });
          }
        } catch (error) {
          const detail =
            error instanceof Error ? (error.stack ?? error.message) : error;
          logger.error(
            `[preview] regeneration failed; the preview keeps its last output until a save loads:\n${String(detail)}`,
            { timestamp: true }
          );
        }
      };

      const work = async (): Promise<void> => {
        if (pendingRestart) {
          pendingRestart = false;
          await options.onKitConfigurationChange();
        }
        if (pendingRegeneration && !closed) {
          pendingRegeneration = false;
          await regenerate();
        }
      };

      const settle = (): void => {
        timer = undefined;
        if (closed) return;
        if (running) return;
        running = work().finally(() => {
          running = undefined;
          if ((pendingRestart || pendingRegeneration) && !closed && !timer) {
            settle();
          }
        });
      };

      server.watcher.on('all', (event, path) => {
        if (closed) return;
        if (event !== 'add' && event !== 'change' && event !== 'unlink') return;
        const change = classifyKitChange(path, context, inputs);
        if (!change) return;
        if (change === 'restart') pendingRestart = true;
        else pendingRegeneration = true;
        if (timer) clearTimeout(timer);
        timer = setTimeout(settle, delay);
      });
      server.httpServer?.once('close', () => {
        closed = true;
        if (timer) clearTimeout(timer);
      });
    },
  };
}

/** A running development server. */
export interface DevelopmentServer {
  /** The Vite server currently serving; replaced when the kit configuration changes. */
  readonly server: ViteDevServer;
  /** Stops serving. */
  close(): Promise<void>;
}

/**
 * Generates a kit's preview and serves it, regenerating as the kit's
 * preview inputs change and starting a new server, from the new
 * configuration, when the kit configuration changes. A configuration that
 * fails to load is logged and the running server kept.
 *
 * @param kitRoot - The kit root (where its package.json lives).
 * @param overrides - The port and host, over the kit's configured ones.
 * @param options - The kit configuration file, when it is not the one the
 *   kit root gives.
 * @returns The running server.
 * @example
 * ```ts
 * const development = await startDevelopmentServer(kitRoot, { port: 6100 });
 * ```
 */
export async function startDevelopmentServer(
  kitRoot: string,
  overrides: DevelopmentServerOverrides = {},
  options: ConfigurationLookupOptions = {}
): Promise<DevelopmentServer> {
  let server: ViteDevServer;
  let restarting: Promise<void> | undefined;

  const listen = async (
    context: PreviewContext,
    generated: GeneratePreviewResult
  ): Promise<ViteDevServer> => {
    const configuration = buildViteConfiguration(context, overrides);
    configuration.plugins = [
      ...(configuration.plugins ?? []),
      kitWatchPlugin(context, {
        onKitConfigurationChange: () => (restarting = restart()),
        inputs: {
          loadedModules: loadedKitModules(context),
          themeSources: generated.themeSources,
        },
      }),
    ];
    const started = await createServer(configuration);
    await started.listen();
    started.printUrls();
    return started;
  };

  const restart = async (): Promise<void> => {
    const logger = server.config.logger;
    let context: PreviewContext;
    let generated: GeneratePreviewResult;
    try {
      context = loadPreviewContext(kitRoot, options);
      forgetKitModules(context);
      generated = await generatePreview(context, { clean: false });
    } catch (error) {
      logger.error(
        `[preview] the kit configuration changed but did not load; the server keeps its previous configuration until a save loads:\n${error instanceof Error ? error.message : String(error)}`,
        { timestamp: true }
      );
      return;
    }
    logger.info('[preview] the kit configuration changed: restarting', {
      timestamp: true,
    });
    await server.close();
    try {
      server = await listen(context, generated);
    } catch (error) {
      logger.error(
        `[preview] the server did not restart:\n${error instanceof Error ? error.message : String(error)}`,
        { timestamp: true }
      );
      process.exitCode = 1;
    }
  };

  const context = loadPreviewContext(kitRoot, options);
  for (const warning of context.warnings) console.warn(`[preview] ${warning}`);
  server = await listen(context, await generatePreview(context));
  return {
    get server() {
      return server;
    },
    async close() {
      await restarting;
      await server.close();
    },
  };
}
