// The development server's regeneration, without a server: which kit paths
// it watches and what a change to each asks for, that a regeneration loads
// edited kit modules afresh, keeps Vite's cache and the scenario editor's
// story, writes only what changed and keeps the last output when a module
// fails to load, and that the watching plugin regenerates once per burst of
// saves and restarts on a kit configuration change. Runs against temporary
// copies of fixtures/generate-kit.

import { EventEmitter } from 'node:events';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ViteDevServer } from 'vite';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPreviewContext, type PreviewContext } from '../src/context';
import {
  classifyKitChange,
  forgetKitModules,
  kitWatchPaths,
  kitWatchPlugin,
  loadedKitModules,
} from '../src/development-server';
import { generatePreview } from '../src/generate';
import type { Manifest } from '../src/emit/manifest';
import { resolveKitConfiguration } from 'scaffold-ui-kit';

const fixture = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/generate-kit'
);
const temporaryRoots: string[] = [];

/** A fresh copy of the fixture kit, its configuration edited by `edit`. */
function copyFixture(
  edit: (
    preview: Record<string, unknown>,
    kit: Record<string, unknown>
  ) => void = () => {}
): string {
  const kitRoot = mkdtempSync(join(tmpdir(), 'preview-development-'));
  temporaryRoots.push(kitRoot);
  cpSync(fixture, kitRoot, { recursive: true });
  // Rewritten as scaffold-ui-kit.json, which the edit can change as data.
  const configuration = resolveKitConfiguration(kitRoot)
    .configuration as unknown as Record<string, unknown> & {
    preview: Record<string, unknown>;
  };
  edit(configuration.preview, configuration);
  rmSync(join(kitRoot, 'scaffold-ui-kit.ts'));
  writeFileSync(
    join(kitRoot, 'scaffold-ui-kit.json'),
    JSON.stringify(configuration)
  );
  return kitRoot;
}

const manifestOf = (context: PreviewContext): Manifest =>
  JSON.parse(
    readFileSync(join(context.generatedRoot, 'manifest.json'), 'utf8')
  ) as Manifest;

const badgeStory = (scenarioLabel: string): string =>
  `export default { scenarios: [{ id: 'extra', label: '${scenarioLabel}', props: { tone: 'loud' } }] };\n`;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
  for (const root of temporaryRoots)
    rmSync(root, { recursive: true, force: true });
});

describe('kitWatchPaths and classifyKitChange', () => {
  const kitRoot = copyFixture((preview, kit) => {
    preview.viewsModule = 'preview/views.ts';
    (preview.sources as Array<Record<string, unknown>>)[0].manualModule =
      'preview/manual.ts';
    kit.add = {
      shared: [{ source: 'src/shared/format.ts', specifier: 'acme/format' }],
    };
  });
  const context = loadPreviewContext(kitRoot);
  const at = (path: string): string => join(kitRoot, path);

  const inputs = {
    loadedModules: [at('src/tokens.ts')],
    themeSources: [at('themes/light.css'), at('themes/fonts')],
  };

  it('watches the templates, story files, manual and shared modules, the themes, and the kit configuration', () => {
    const paths = kitWatchPaths(context, inputs);
    expect(paths.regeneration.sort()).toEqual(
      [
        at('src/components'),
        at('preview/stories'),
        at('preview/manual.ts'),
        at('src/shared/format.ts'),
        at('src/tokens.ts'),
        at('themes/light.css'),
        at('themes/fonts'),
      ].sort()
    );
    expect(paths.kitConfiguration).toBe(at('scaffold-ui-kit.json'));
    expect(paths.configurationModules).toEqual([]);
  });

  it('leaves the views module and the shell to Vite', () => {
    const { regeneration } = kitWatchPaths(context);
    expect(regeneration).not.toContain(at('preview/views.ts'));
    expect(regeneration).not.toContain(context.shellModuleAbsolute);
    expect(classifyKitChange(at('preview/views.ts'), context)).toBeUndefined();
    expect(
      classifyKitChange(at('src/components/badge.d.ts'), context)
    ).toBeUndefined();
  });

  it('restarts for the kit configuration and regenerates for every input', () => {
    expect(classifyKitChange(at('scaffold-ui-kit.json'), context)).toBe(
      'restart'
    );
    for (const path of [
      'src/components/badge.ts',
      'src/components/new-component.ts',
      'src/components/badge.json',
      'src/components/badge.js',
      'src/components/badge.mjs',
      'src/components/badge.cjs',
      'preview/stories/Badge.story.ts',
      'preview/manual.ts',
      'src/shared/format.ts',
    ]) {
      expect(classifyKitChange(at(path), context), path).toBe('regenerate');
    }
    for (const path of [
      'src/tokens.ts',
      'themes/light.css',
      'themes/fonts/body.woff2',
      'themes/fonts/nested/added.woff2',
    ]) {
      expect(classifyKitChange(at(path), context, inputs), path).toBe(
        'regenerate'
      );
    }
  });

  it('ignores files that are none of the kit inputs', () => {
    for (const path of [
      'src/components/badge.d.ts',
      'src/components/notes.md',
      'preview/stories/helpers.ts',
      'src/tokens.ts',
      'themes/light.css',
      'themes/dark.css',
      'package.json',
      '.preview-generated/manifest.json',
    ]) {
      expect(classifyKitChange(at(path), context), path).toBeUndefined();
    }
    expect(
      classifyKitChange(at('themes/dark.css'), context, inputs)
    ).toBeUndefined();
  });
});

describe('regenerating while the server runs', () => {
  it('loads an edited story file afresh once the kit modules are forgotten', async () => {
    const context = loadPreviewContext(copyFixture());
    const story = join(context.kitRoot, 'preview/stories/Badge.story.ts');
    writeFileSync(story, badgeStory('First'));
    await generatePreview(context);
    expect(loadedKitModules(context)).toContain(story);

    writeFileSync(story, badgeStory('Second'));
    expect(forgetKitModules(context)).toContain(story);
    await generatePreview(context, { clean: false });
    const badge = manifestOf(context).components.find(
      (component) => component.name === 'Badge'
    );
    expect(JSON.stringify(badge)).toContain('Second');
    expect(JSON.stringify(badge)).not.toContain('First');
  });

  it("keeps Vite's cache and the scenario editor's story", async () => {
    const context = loadPreviewContext(copyFixture());
    await generatePreview(context);
    const cached = join(context.generatedRoot, '.vite/deps/react.js');
    mkdirSync(dirname(cached), { recursive: true });
    writeFileSync(cached, 'cached\n');
    const scratch = join(context.generatedRoot, 'scratch/react.tsx');
    writeFileSync(scratch, 'the editor story\n');

    forgetKitModules(context);
    await generatePreview(context, { clean: false });
    expect(readFileSync(cached, 'utf8')).toBe('cached\n');
    expect(readFileSync(scratch, 'utf8')).toBe('the editor story\n');

    // A generation that starts from scratch empties both.
    await generatePreview(context);
    expect(existsSync(cached)).toBe(false);
    expect(readFileSync(scratch, 'utf8')).not.toBe('the editor story\n');
  });

  it('writes only the files whose content changed', async () => {
    const context = loadPreviewContext(copyFixture());
    await generatePreview(context);
    const manifestPath = join(context.generatedRoot, 'manifest.json');
    const registryPath = join(context.generatedRoot, 'react/registry.tsx');
    const before = statSync(registryPath).mtimeMs;

    forgetKitModules(context);
    expect(await generatePreview(context, { clean: false })).toMatchObject({
      written: [],
      removed: [],
    });

    writeFileSync(
      join(context.kitRoot, 'preview/stories/Badge.story.ts'),
      badgeStory('Loud')
    );
    forgetKitModules(context);
    const { written } = await generatePreview(context, { clean: false });
    expect(written).toEqual([manifestPath]);
    expect(statSync(registryPath).mtimeMs).toBe(before);
  });

  it('reports the theme sources it copied', async () => {
    const context = loadPreviewContext(copyFixture());
    const { themeSources } = await generatePreview(context);
    expect(themeSources).toEqual([
      join(context.kitRoot, 'themes/light.css'),
      join(context.kitRoot, 'themes/fonts'),
    ]);
  });

  it("rewrites only an edited theme's output", async () => {
    const context = loadPreviewContext(copyFixture());
    await generatePreview(context);
    writeFileSync(
      join(context.kitRoot, 'themes/light.css'),
      ':root { color: navy; }\n'
    );
    forgetKitModules(context);
    const stylesheet = await generatePreview(context, { clean: false });
    const output = join(context.generatedRoot, 'public/themes/light/theme.css');
    expect(stylesheet.written).toEqual([output]);
    expect(readFileSync(output, 'utf8')).toBe(':root { color: navy; }\n');

    writeFileSync(join(context.kitRoot, 'themes/fonts/body.woff2'), 'bolder\n');
    forgetKitModules(context);
    const asset = await generatePreview(context, { clean: false });
    expect(asset.written).toEqual([
      join(context.generatedRoot, 'public/themes/light/fonts/body.woff2'),
    ]);
  });

  it('picks up an added template and removes the files of a deleted one', async () => {
    const context = loadPreviewContext(copyFixture());
    await generatePreview(context);
    writeFileSync(
      join(context.kitRoot, 'src/components/chip.ts'),
      `export default { type: 'component', name: 'Chip', children: [{ type: 'element', tag: 'span' }] };\n`
    );
    forgetKitModules(context);
    const added = await generatePreview(context, { clean: false });
    expect(added.written).toContain(
      join(context.generatedRoot, 'svelte/Chip.render.svelte')
    );
    expect(manifestOf(context).components.map((each) => each.name)).toContain(
      'Chip'
    );

    rmSync(join(context.kitRoot, 'src/components/chip.ts'));
    forgetKitModules(context);
    const deleted = await generatePreview(context, { clean: false });
    expect(deleted.removed).toEqual([
      join(context.generatedRoot, 'svelte/Chip.render.svelte'),
    ]);
    expect(
      manifestOf(context).components.map((each) => each.name)
    ).not.toContain('Chip');
  });

  it('keeps the last output when a kit module fails to load, and recovers', async () => {
    const context = loadPreviewContext(copyFixture());
    const story = join(context.kitRoot, 'preview/stories/Badge.story.ts');
    writeFileSync(story, badgeStory('Good'));
    await generatePreview(context);
    const manifestPath = join(context.generatedRoot, 'manifest.json');
    const good = readFileSync(manifestPath, 'utf8');

    writeFileSync(story, 'export default { scenarios: [ ;\n');
    forgetKitModules(context);
    await expect(generatePreview(context, { clean: false })).rejects.toThrow();
    expect(readFileSync(manifestPath, 'utf8')).toBe(good);

    writeFileSync(story, badgeStory('Better'));
    forgetKitModules(context);
    await generatePreview(context, { clean: false });
    expect(readFileSync(manifestPath, 'utf8')).toContain('Better');
  });
});

/** A stand-in for the parts of Vite's server the plugin uses. */
function fakeServer() {
  const watcher = Object.assign(new EventEmitter(), {
    added: [] as string[],
    unwatched: [] as string[],
    add(paths: string[]) {
      watcher.added.push(...paths);
    },
    unwatch(paths: string[]) {
      watcher.unwatched.push(...paths);
    },
  });
  const logger = { info: vi.fn(), error: vi.fn() };
  const send = vi.fn();
  const server = {
    watcher,
    config: { logger },
    ws: { send },
    httpServer: null,
  } as unknown as ViteDevServer;
  return { server, watcher, logger, send };
}

/** Run the plugin's server hook against a fake server. */
function configure(
  context: PreviewContext,
  onKitConfigurationChange = vi.fn(async () => {}),
  themeSources: string[] = []
) {
  const fake = fakeServer();
  const plugin = kitWatchPlugin(context, {
    onKitConfigurationChange,
    inputs: { themeSources },
    delayMilliseconds: 20,
  });
  (plugin.configureServer as (server: ViteDevServer) => void)(fake.server);
  return { ...fake, onKitConfigurationChange };
}

describe('kitWatchPlugin', () => {
  it('adds the kit inputs and the kit configuration to the watcher', async () => {
    const context = loadPreviewContext(copyFixture());
    await generatePreview(context);
    const { watcher } = configure(context);
    expect(watcher.added).toEqual(
      expect.arrayContaining([
        join(context.kitRoot, 'src/components'),
        join(context.kitRoot, 'preview/stories'),
        join(context.kitRoot, 'scaffold-ui-kit.json'),
      ])
    );
  });

  it('regenerates once for a burst of saves', async () => {
    const context = loadPreviewContext(copyFixture());
    await generatePreview(context);
    const { watcher, logger } = configure(context);
    const story = join(context.kitRoot, 'preview/stories/Badge.story.ts');
    writeFileSync(story, badgeStory('Burst'));
    watcher.emit('all', 'add', story);
    watcher.emit('all', 'change', story);
    watcher.emit(
      'all',
      'change',
      join(context.kitRoot, 'src/components/badge.ts')
    );
    watcher.emit('all', 'change', join(context.kitRoot, 'README.md'));
    await vi.waitFor(() => expect(logger.info).toHaveBeenCalled());
    await new Promise((settle) => setTimeout(settle, 100));
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info.mock.calls[0][0]).toBe(
      '[preview] regenerated: 1 file changed'
    );
    expect(manifestOf(context).components[0]).toMatchObject({ name: 'Badge' });
    expect(
      readFileSync(join(context.generatedRoot, 'manifest.json'), 'utf8')
    ).toContain('Burst');
  });

  it('logs a module that fails to load, and recovers on the next save', async () => {
    const context = loadPreviewContext(copyFixture());
    await generatePreview(context);
    const { watcher, logger } = configure(context);
    const story = join(
      context.kitRoot,
      'preview/stories/BadgeDot.story.ts'
    );
    writeFileSync(story, 'export default { standalone: ;\n');
    watcher.emit('all', 'change', story);
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledTimes(1));
    expect(logger.error.mock.calls[0][0]).toContain(
      '[preview] regeneration failed; the preview keeps its last output until a save loads'
    );

    writeFileSync(story, 'export default { standalone: true };\n');
    watcher.emit('all', 'change', story);
    await vi.waitFor(() => expect(logger.info).toHaveBeenCalledTimes(1));
    expect(
      manifestOf(context).components.find((each) => each.name === 'BadgeDot')
        ?.standalone
    ).toBeUndefined();
  });

  it('hands a kit configuration change to the server, without regenerating', async () => {
    const context = loadPreviewContext(copyFixture());
    await generatePreview(context);
    const { watcher, logger, onKitConfigurationChange } = configure(context);
    const configurationPath = join(context.kitRoot, 'scaffold-ui-kit.json');
    watcher.emit('all', 'change', configurationPath);
    watcher.emit('all', 'change', configurationPath);
    await vi.waitFor(() =>
      expect(onKitConfigurationChange).toHaveBeenCalledTimes(1)
    );
    await new Promise((settle) => setTimeout(settle, 60));
    expect(onKitConfigurationChange).toHaveBeenCalledTimes(1);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("reloads the pages of a kit with an html pane when a template's markup changes", async () => {
    const context = loadPreviewContext(copyFixture());
    context.buildsHtml = true;
    await generatePreview(context);
    const { watcher, logger, send } = configure(context);
    const template = join(context.kitRoot, 'src/components/badge.ts');
    watcher.emit('all', 'change', template);
    await vi.waitFor(() => expect(logger.info).toHaveBeenCalledTimes(1));
    expect(logger.info.mock.calls[0][0]).toBe(
      '[preview] regenerated: no generated files changed'
    );
    expect(send).toHaveBeenCalledWith({ type: 'full-reload', path: '*' });
  });

  it('leaves the pages of a kit with an html pane to Vite when a generated file changed', async () => {
    const context = loadPreviewContext(copyFixture());
    context.buildsHtml = true;
    await generatePreview(context);
    const { watcher, logger, send } = configure(context);
    const story = join(context.kitRoot, 'preview/stories/Badge.story.ts');
    writeFileSync(story, badgeStory('Written'));
    watcher.emit('all', 'change', story);
    await vi.waitFor(() => expect(logger.info).toHaveBeenCalledTimes(1));
    expect(logger.info.mock.calls[0][0]).toBe(
      '[preview] regenerated: 1 file changed'
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('leaves the pages of a kit without an html pane to Vite when nothing generated changed', async () => {
    const context = loadPreviewContext(copyFixture());
    await generatePreview(context);
    const { watcher, logger, send } = configure(context);
    const template = join(context.kitRoot, 'src/components/badge.ts');
    watcher.emit('all', 'change', template);
    await vi.waitFor(() => expect(logger.info).toHaveBeenCalledTimes(1));
    expect(send).not.toHaveBeenCalled();
  });

  it('copies an edited theme and reloads the pages', async () => {
    const context = loadPreviewContext(copyFixture());
    const { themeSources } = await generatePreview(context);
    const { watcher, logger, send } = configure(
      context,
      undefined,
      themeSources
    );
    const stylesheet = join(context.kitRoot, 'themes/light.css');
    expect(watcher.added).toContain(stylesheet);
    writeFileSync(stylesheet, ':root { color: navy; }\n');
    watcher.emit('all', 'change', stylesheet);
    await vi.waitFor(() => expect(logger.info).toHaveBeenCalledTimes(1));
    expect(logger.info.mock.calls[0][0]).toBe(
      '[preview] regenerated: 1 file changed'
    );
    expect(send).toHaveBeenCalledWith({ type: 'full-reload', path: '*' });
  });

  it('restarts for a module outside the kit root a scaffold-ui-kit.ts imports, such as a workspace sibling', async () => {
    const kitRoot = copyFixture();
    const shared = `${kitRoot}-shared`;
    temporaryRoots.push(shared);
    mkdirSync(shared);
    const { configuration } = resolveKitConfiguration(kitRoot);
    const { preview, ...rest } = configuration as typeof configuration & {
      preview: Record<string, unknown>;
    };
    const { themes, ...block } = preview;
    rmSync(join(kitRoot, 'scaffold-ui-kit.json'));
    writeFileSync(
      join(shared, 'themes.ts'),
      `export const themes = ${JSON.stringify(themes)};\n`
    );
    writeFileSync(
      join(kitRoot, 'scaffold-ui-kit.ts'),
      `import { themes } from '../${basename(shared)}/themes';\nconst rest = ${JSON.stringify({ ...rest, preview: block })};\nexport default { ...rest, preview: { ...rest.preview, themes } };\n`
    );
    const context = loadPreviewContext(kitRoot);
    const module = realpathSync(join(shared, 'themes.ts'));
    expect(kitWatchPaths(context).configurationModules).toContain(module);
    expect(classifyKitChange(module, context)).toBe('restart');
    await generatePreview(context);
    const { watcher, onKitConfigurationChange } = configure(context);
    expect(watcher.added).toContain(module);
    watcher.emit('all', 'change', module);
    await vi.waitFor(() =>
      expect(onKitConfigurationChange).toHaveBeenCalledTimes(1)
    );
  });

  it('restarts for a module a scaffold-ui-kit.ts imports, which it watches', async () => {
    const kitRoot = copyFixture();
    const { configuration } = resolveKitConfiguration(kitRoot);
    const { preview, ...rest } = configuration as typeof configuration & {
      preview: Record<string, unknown>;
    };
    const { themes, ...block } = preview;
    rmSync(join(kitRoot, 'scaffold-ui-kit.json'));
    writeFileSync(
      join(kitRoot, 'preview/themes.ts'),
      `export const themes = ${JSON.stringify(themes)};\n`
    );
    writeFileSync(
      join(kitRoot, 'scaffold-ui-kit.ts'),
      `import { themes } from './preview/themes';\nconst rest = ${JSON.stringify({ ...rest, preview: block })};\nexport default { ...rest, preview: { ...rest.preview, themes } };\n`
    );
    const context = loadPreviewContext(kitRoot);
    const module = realpathSync(join(kitRoot, 'preview/themes.ts'));
    expect(kitWatchPaths(context).configurationModules).toContain(module);
    expect(classifyKitChange(module, context)).toBe('restart');
    await generatePreview(context);
    const { watcher, onKitConfigurationChange } = configure(context);
    expect(watcher.added).toContain(module);
    watcher.emit('all', 'change', module);
    await vi.waitFor(() =>
      expect(onKitConfigurationChange).toHaveBeenCalledTimes(1)
    );
  });
});
