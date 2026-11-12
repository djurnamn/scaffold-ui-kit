// The preview generator: enumerate every source's component templates → build
// one target-agnostic model per component → emit a per-target
// render-registry + the host manifest into `<kitRoot>/.preview-generated/`. Pure
// function of the preview context - no kit names or paths are baked in; the
// kit supplies everything through its `preview` block (see context.ts).
//
// Every output is rendered before anything is written, so a kit module that
// fails to load leaves the previous output in place. A file is written only
// when its content differs from what is on disk, so a development server
// serving the tree reloads only for what changed.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { kitPaneWidths, loadKit } from './load.js';
import { landingProblems } from './landing.js';
import { scenarioStories, storyOnScenario } from './lib/scenario-story.js';
import { resolveStory } from './model.js';
import { REACT_ATTRIBUTE_NAMES } from '@js-template-engine/extension-react';
import { declaredAttributes } from './lib/react-spelling.js';
import { emitReactRegistry } from './emit/react.js';
import { emitVueRegistry } from './emit/vue.js';
import { emitSvelteRegistry, emitSvelteWrapper } from './emit/svelte.js';
import { buildManifest, type ManifestImport } from './emit/manifest.js';
import { writeScratchStubs, type ScratchModules } from './emit/scratch.js';
import { optionProblems } from './options.js';
import {
  htmlWarningLine,
  printHtmlSource,
  sourceStoryOf,
} from './story-source.js';
import { htmlSourceResponse } from './html-stylesheet.js';
import {
  HTML_SOURCE_DIRECTORY,
  type HtmlSourceResponse,
} from './controller/html-source.js';
import { exportedTypesOf } from './lib/exported-types.js';
import { sanitize } from './lib/naming.js';
import { moduleOfSource } from './lib/module-of-source.js';
import type { PreviewContext } from './context.js';
import type { ResolvedStory, Scenario, Target } from './lib/types.js';

const targets = ['react', 'vue', 'svelte'] as const;

/** How `generatePreview` treats the generated tree already on disk. */
export interface GeneratePreviewOptions {
  /**
   * Whether the generated tree is emptied before writing (the default). With
   * `false`, as a running development server regenerates, the tree is kept:
   * Vite's dependency cache and the scenario editor's story stay, a file is
   * written only when its content changed, and a registry file no component
   * produces any more is removed.
   */
  clean?: boolean;
  /**
   * Whether to print the html source of every story's scenarios into the
   * served tree, one `html-source/<component id>.json` per component, as the
   * static build reads it. Off by default: the development server prints
   * html on request.
   */
  htmlSources?: boolean;
}

/** What `generatePreview` changed on disk. */
export interface GeneratePreviewResult {
  /** The absolute paths written, because they were new or their content changed. */
  written: string[];
  /** The absolute paths of registry files removed because nothing produces them. */
  removed: string[];
  /** The absolute paths of the kit's theme sources the generation copied:
   *  each theme's stylesheet and its assets file or directory. */
  themeSources: string[];
}

/** Every file under `directory`, as absolute paths. */
function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

/** Writes `content` to `path` unless the file already holds exactly that. */
function writeIfChanged(path: string, content: string | Buffer): boolean {
  const bytes = typeof content === 'string' ? Buffer.from(content) : content;
  if (existsSync(path) && readFileSync(path).equals(bytes)) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  return true;
}

/**
 * Generates the preview into `<kitRoot>/.preview-generated/`: a render
 * registry per target, the Svelte wrappers, the module-resolution data the
 * scenario editor reads, the host manifest, and the themes' stylesheets.
 *
 * @param context - The kit's preview context.
 * @param options - Whether the generated tree is emptied first.
 * @returns The files written and removed.
 * @example
 * ```ts
 * await generatePreview(loadPreviewContext(kitRoot));
 * ```
 */
export async function generatePreview(
  context: PreviewContext,
  options: GeneratePreviewOptions = {}
): Promise<GeneratePreviewResult> {
  const { clean = true, htmlSources = false } = options;
  const { generatedRoot, sources } = context;
  const directory: Record<string, string> = {};
  for (const target of targets) {
    directory[target] = resolve(generatedRoot, target);
  }

  const { components } = await loadKit(context);
  const hints = context.configuration.controlHints ?? {};
  const problems = optionProblems(context.configuration.options);
  if (problems.length > 0) {
    throw new Error(
      `[preview] ${context.configurationPath} gives unsound preview.options:\n  ${problems.join('\n  ')}`
    );
  }
  const paneWidths = kitPaneWidths(context);
  if (paneWidths.errors.length > 0)
    throw new Error(`[preview] ${paneWidths.errors.join('\n[preview] ')}`);
  // Each output, in the order it is written: a registry after the wrappers it
  // imports, and the manifest, which names every story, last.
  const outputs: Array<[path: string, content: string | Buffer]> = [];
  const themeSources: string[] = [];

  // `moduleByName` remembers which module each component imports from, so the
  // emitters group imports per source.
  const moduleByName = new Map<string, string>();
  const importOverrideByName = new Map<
    string,
    Partial<Record<Target, string>>
  >();
  const exportByName = new Map<string, string>();
  for (const { component, source } of components) {
    moduleByName.set(component.name, source.moduleBase);
    if (component.importModule)
      importOverrideByName.set(component.name, component.importModule);
    if (component.exportName && component.exportName !== component.name) {
      exportByName.set(component.name, component.exportName);
    }
  }
  const built: ResolvedStory[] = components.map(
    ({ component, story, source }) => ({
      ...resolveStory(
        component,
        story,
        hints,
        context.configuration.labels,
        context.omitPattern,
        context.targets
      ),
      source: source.id,
    })
  );

  // A component's per-target import module: a per-component override (a
  // playground fixture outside its source's published barrel) wins; otherwise
  // the source's module for the target (`moduleOfSource`), defaulting slot children that belong to
  // no registered source to the kit's own (first) source.
  const defaultModule = sources[0].moduleBase;
  const moduleFor = (name: string, target: Target): string =>
    importOverrideByName.get(name)?.[target] ??
    moduleOfSource(moduleByName.get(name) ?? defaultModule, target);
  const exportFor = (name: string): string => exportByName.get(name) ?? name;
  // The names each component declares that React would otherwise respell
  // (`class`, `style`, an attribute React renames): it takes them as they
  // are, and every other attribute a story gives it as React spells it.
  const declaredAttributesByName = new Map(
    components.map(({ component }) => [
      component.name,
      declaredAttributes(Object.keys(component.props), REACT_ATTRIBUTE_NAMES),
    ])
  );
  const declaredAttributesOf = (name: string): string[] =>
    declaredAttributesByName.get(name) ?? [];
  const declaredAttributesRecord = Object.fromEntries(
    [...declaredAttributesByName].filter(([, names]) => names.length > 0)
  );

  // Browseable stories get registries + a nav entry; components that are not
  // standalone (compound parts, shared blocks) are editor-only; omitted parts
  // drop out entirely.
  const stories: ResolvedStory[] = [];
  const editorOnly: ResolvedStory[] = [];
  const omitted: string[] = [];
  for (const model of built) {
    if (model.omit) {
      omitted.push(model.name);
      continue;
    }
    (model.standalone ? stories : editorOnly).push(model);
  }
  const landing = landingProblems(context.configuration.landing, stories);
  if (landing.length > 0)
    throw new Error(`[preview] ${landing.join('\n[preview] ')}`);

  // Per-target registries (id → render unit) across ALL sources. A component
  // renders only into the targets it declares within the kit's, so each
  // target's registry sees only its own stories; a target the kit does not
  // build gets an empty registry, so its iframe entry still builds.
  // A scenario with slot content of its own is a story beside its
  // component's, so its content renders as the component's does.
  const forTarget = (target: Target): ResolvedStory[] =>
    stories
      .filter((model) => model.targets.includes(target))
      .flatMap((model) => [model, ...scenarioStories(model)]);
  for (const model of forTarget('svelte')) {
    const wrapper = emitSvelteWrapper(model, moduleFor, exportFor);
    outputs.push([resolve(directory.svelte, wrapper.fileName), wrapper.source]);
  }
  outputs.push(
    [
      resolve(directory.react, 'registry.tsx'),
      emitReactRegistry(
        forTarget('react'),
        moduleFor,
        exportFor,
        declaredAttributesOf
      ),
    ],
    [
      resolve(directory.vue, 'registry.ts'),
      emitVueRegistry(forTarget('vue'), moduleFor, exportFor),
    ],
    [
      resolve(directory.svelte, 'registry.ts'),
      emitSvelteRegistry(forTarget('svelte')),
    ]
  );

  // The module-resolution data the scratch regeneration endpoint reads (it runs in the
  // Vite dev middleware with no kit imports of its own).
  const scratchModules: ScratchModules = {
    defaultModule,
    moduleByName: Object.fromEntries(moduleByName),
    importOverrideByName: Object.fromEntries(importOverrideByName),
    exportByName: Object.fromEntries(exportByName),
    targets: context.targets,
    ...(Object.keys(declaredAttributesRecord).length > 0
      ? { declaredAttributes: declaredAttributesRecord }
      : {}),
  };
  outputs.push([
    resolve(generatedRoot, 'modules.json'),
    JSON.stringify(scratchModules, null, 2) + '\n',
  ]);

  // Framework-neutral host manifest (nav, controls, color tokens) - stories
  // plus the editor-only components (the editor reads both; the nav leaves
  // those out).
  const sourceMeta = sources.map((source) => ({
    id: source.id,
    label: source.label,
    order: source.order,
    moduleBase: source.moduleBase,
  }));
  // How a consumer imports each component, omitted ones included: a story's
  // source in the browser names what its slot content holds.
  const imports: Record<string, ManifestImport> = {};
  for (const { component } of components) {
    const types = exportedTypesOf(component, context.targets);
    imports[component.name] = {
      exportName: exportFor(component.name),
      ...(declaredAttributesOf(component.name).length > 0
        ? { declaredAttributes: declaredAttributesOf(component.name) }
        : {}),
      modules: Object.fromEntries(
        context.targets.map((target) => [
          target,
          moduleFor(component.name, target),
        ])
      ),
      ...(types ? { types } : {}),
    };
  }
  const manifest: [string, string] = [
    resolve(generatedRoot, 'manifest.json'),
    JSON.stringify(
      buildManifest(
        [...stories, ...editorOnly],
        sourceMeta,
        hints.colorTokens ?? [],
        context.kitName,
        context.configuration.labels,
        context.kitVersion,
        context.configuration.persistence,
        context.buildsHtml ? [...context.targets, 'html'] : context.targets,
        imports,
        context.configuration.codeBlock
          ? { framework: context.configuration.codeBlock.framework ?? 'dom' }
          : undefined,
        paneWidths.paneWidths,
        context.targets.includes('svelte') ? context.svelteMode : undefined,
        context.targets.includes('react') ? REACT_ATTRIBUTE_NAMES : undefined,
        context.configuration.landing
      ),
      null,
      2
    ) + '\n',
  ];

  // Themes: copy each theme's compiled stylesheet (+ optional asset dir) into
  // the served tree - `<generatedRoot>/public` is the Vite publicDir, so the iframes
  // link `themes/<id>/theme.css` (under the URL the preview is served from) by convention in dev and static build alike.
  for (const theme of context.configuration.themes) {
    const themeDirectory = resolve(generatedRoot, 'public/themes', theme.id);
    const cssSource = resolve(context.kitRoot, theme.css);
    if (!existsSync(cssSource)) {
      throw new Error(
        `[preview] theme '${theme.id}' stylesheet not found: ${cssSource}`
      );
    }
    themeSources.push(cssSource);
    outputs.push([
      resolve(themeDirectory, 'theme.css'),
      readFileSync(cssSource),
    ]);
    if (theme.assets) {
      const assetsSource = resolve(context.kitRoot, theme.assets);
      themeSources.push(assetsSource);
      if (existsSync(assetsSource)) {
        const assetsDestination = resolve(
          themeDirectory,
          basename(assetsSource)
        );
        const files = statSync(assetsSource).isDirectory()
          ? filesUnder(assetsSource)
          : [assetsSource];
        for (const file of files) {
          outputs.push([
            resolve(assetsDestination, relative(assetsSource, file)),
            readFileSync(file),
          ]);
        }
      }
    }
  }
  // The html of each story's scenarios, which the static build cannot print
  // on request: one file per component, by scenario id, the anonymous
  // default under ''.
  if (htmlSources) {
    const enumerated = components.map((entry) => entry.component);
    for (const [index, model] of built.entries()) {
      if (model.omit || !model.standalone) continue;
      const { component, story } = components[index];
      const byScenario: Record<string, HtmlSourceResponse> = {};
      // What the html leaves out, once per story however many of its
      // scenarios do.
      const warnings = new Set<string>();
      const anonymous: Scenario = { id: '', props: {} };
      for (const scenario of [anonymous, ...model.scenarios]) {
        const result = await printHtmlSource(context, enumerated, {
          component,
          // The html the panes render, the unfilled default slot's
          // placeholder included, as the scripted panes show it, and the
          // scenario's own slot content where it has any.
          ...sourceStoryOf(
            component,
            story,
            storyOnScenario(model, scenario),
            scenario.props ?? {},
            { placeholder: true }
          ),
        });
        if (result.markup !== undefined)
          for (const warning of result.warnings) warnings.add(warning);
        byScenario[scenario.id] = htmlSourceResponse(
          context,
          enumerated,
          result
        );
      }
      if (warnings.size > 0)
        console.warn(
          `[preview:generate] ${htmlWarningLine(model.name, [...warnings])}`
        );
      outputs.push([
        resolve(
          generatedRoot,
          'public',
          HTML_SOURCE_DIRECTORY,
          `${sanitize(model.title)}.json`
        ),
        JSON.stringify(byScenario) + '\n',
      ]);
    }
  }
  outputs.push(manifest);

  // Everything rendered: only now is the tree touched.
  if (clean) rmSync(generatedRoot, { recursive: true, force: true });
  for (const target of targets) {
    mkdirSync(directory[target], { recursive: true });
  }
  // Empty scratch registries so the previews' static scratch imports resolve;
  // the scenario editor overwrites these on each edit (see emit/scratch.ts),
  // so a kept tree keeps the story it holds.
  if (clean || !existsSync(resolve(generatedRoot, 'scratch'))) {
    writeScratchStubs(generatedRoot);
  }
  const written = outputs
    .filter(([path, content]) => writeIfChanged(path, content))
    .map(([path]) => path);
  const produced = new Set(outputs.map(([path]) => path));
  const removed = targets
    .flatMap((target) => filesUnder(directory[target]))
    .filter((path) => !produced.has(path));
  for (const path of removed) rmSync(path, { force: true });

  const sourceSummary = sources
    .map((source) => `${source.id}=${source.moduleBase}`)
    .join(', ');
  console.log(
    `[preview:generate] ${stories.length} components × ${context.targets.length} targets → .preview-generated/ (sources: ${sourceSummary})`
  );
  if (editorOnly.length > 0)
    console.log(
      `[preview:generate] ${editorOnly.length} not standalone (editor-only): ${editorOnly.map((model) => model.name).join(', ')}`
    );
  const unlisted = stories.filter((model) => model.unlisted);
  if (unlisted.length > 0)
    console.log(
      `[preview:generate] unlisted ${unlisted.length} (reachable at their address): ${unlisted.map((model) => model.name).join(', ')}`
    );
  if (omitted.length > 0)
    console.log(
      `[preview:generate] omitted ${omitted.length} (by omit or omitPattern): ${omitted.join(', ')}`
    );
  return { written, removed, themeSources };
}
