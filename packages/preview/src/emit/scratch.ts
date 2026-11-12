// The scenario editor's regeneration target. The host's editable node tree is, in effect,
// a one-entry story: a root component with `props` and a slot plan. We build a
// synthetic `ResolvedStory` from the editor payload and run it through the *existing*
// emitters verbatim - no new per-framework codegen - writing a `scratch/` sibling
// of the generated registries. The preview's normal .preview-generated → Vite-HMR path
// then reloads the previews.
//
// Loaded by the Vite dev middleware via `ssrLoadModule` (so it runs in Node with
// fs + the TS emitters compiled on the fly). `writeScratchStubs` is also called at
// `preview:generate` time so the previews' static scratch imports always resolve.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { emitReactRegistry } from './react.js';
import { emitVueRegistry } from './vue.js';
import { emitSvelteRegistry, emitSvelteWrapper } from './svelte.js';
import { collectSlotComponents } from '../lib/slot-fill.js';
import { moduleOfSource } from '../lib/module-of-source.js';
import { ALL_TARGETS } from '../lib/types.js';
import type {
  JsonValue,
  SlotPlan,
  StoryAround,
  ResolvedStory,
  Target,
} from '../lib/types.js';

/** The module-resolution data the generator serializes beside the registries
 *  (`<generatedRoot>/modules.json`), so this dev-middleware module needs no kit
 *  imports: the default module for unregistered slot children, each manual
 *  component's source module, per-target overrides, and export aliases. */
export interface ScratchModules {
  defaultModule: string;
  moduleByName: Record<string, string>;
  importOverrideByName: Record<string, Partial<Record<Target, string>>>;
  exportByName: Record<string, string>;
  /** The scripted targets the kit builds; a scratch registry for any other stays
   *  empty. All three when absent. */
  targets?: Target[];
  /** The names each component declares that React would otherwise respell
   *  (`class`, `style`, an attribute React renames), which it takes as they
   *  are. A component missing here declares none. */
  declaredAttributes?: Record<string, string[]>;
}

// A component's per-target import module for the scratch registry, mirroring
// generate.ts: a per-component `importModule` override (a playground fixture
// outside its source's barrel) wins; otherwise the component's source module,
// defaulting to the kit's own source. Read from the generator's modules.json.
function loadResolvers(generatedRoot: string): {
  moduleFor: (name: string, target: Target) => string;
  exportFor: (name: string) => string;
  targets: Target[];
  declaredAttributes: (name: string) => string[];
} {
  const data = JSON.parse(
    readFileSync(resolve(generatedRoot, 'modules.json'), 'utf8')
  ) as ScratchModules;
  return {
    targets: data.targets ?? ALL_TARGETS,
    moduleFor: (name, target) =>
      data.importOverrideByName[name]?.[target] ??
      moduleOfSource(data.moduleByName[name] ?? data.defaultModule, target),
    exportFor: (name) => data.exportByName[name] ?? name,
    declaredAttributes: (name) => data.declaredAttributes?.[name] ?? [],
  };
}

/** Reserved story id the editor renders under, in every target registry. */
export const SCRATCH_ID = 'scratch';

/** The host posts this shape on every structural edit. */
export interface ScratchPayload {
  /** The root component name (e.g. `Button`), imported per the modules.json mapping. */
  rootComponent: string;
  /** The root component's own scalar props (also delivered live via the props channel). */
  props: Record<string, JsonValue>;
  /** The editable tree: the root's default-slot fill (and any named slots). */
  slots?: SlotPlan;
  /** The content beside the root, carried unchanged from the story. */
  around?: StoryAround;
}

function buildScratchModel(payload: ScratchPayload): ResolvedStory {
  const slotComponents = new Set<string>();
  collectSlotComponents(payload.slots?.default, slotComponents);
  for (const fill of Object.values(payload.slots?.named ?? {})) {
    collectSlotComponents(fill, slotComponents);
  }
  collectSlotComponents(payload.around?.before, slotComponents);
  collectSlotComponents(payload.around?.after, slotComponents);
  slotComponents.delete(payload.rootComponent);
  return {
    name: payload.rootComponent,
    title: SCRATCH_ID,
    omit: false,
    standalone: true,
    unlisted: false,
    propTypes: [],
    defaultProps: payload.props ?? {},
    slots: payload.slots,
    ...(payload.around ? { around: payload.around } : {}),
    scenarios: [],
    slotComponents: [...slotComponents],
    // The scratch story is rendered, never introspected for add-targets.
    contentSlots: { default: false, named: [] },
    // Unused by the scratch emitters (they emit the single model unconditionally), but
    // the model shape requires it; the editor composes across all targets.
    targets: ALL_TARGETS,
  };
}

const EMPTY_REGISTRY = 'export const registry: Record<string, any> = {};\n';
// The React page reads the names each story's root declares beside its
// registry, so React's placeholder exports them too, none.
const EMPTY_REACT_REGISTRY =
  EMPTY_REGISTRY +
  'export const declaredAttributes: Record<string, string[]> = {};\n';

function scratchDirectory(generatedRoot: string): string {
  const directory = resolve(generatedRoot, 'scratch');
  mkdirSync(directory, { recursive: true });
  return directory;
}

/** Placeholder registries so the previews' static scratch imports resolve before
 *  the first edit. Written at `preview:generate` time. */
export function writeScratchStubs(generatedRoot: string): void {
  const directory = scratchDirectory(generatedRoot);
  writeFileSync(resolve(directory, 'react.tsx'), EMPTY_REACT_REGISTRY);
  writeFileSync(resolve(directory, 'vue.ts'), EMPTY_REGISTRY);
  writeFileSync(resolve(directory, 'registry.ts'), EMPTY_REGISTRY);
}

/** Regenerate the scratch registries from an editor payload (one synthetic story
 *  through the real emitters). Returns the absolute paths written, so the caller
 *  can invalidate them in Vite's module graph before the previews reload (a plain
 *  reload can otherwise serve Vite's stale transform if the file-change event
 *  hasn't been processed yet). */
export function writeScratch(
  payload: ScratchPayload,
  generatedRoot: string
): string[] {
  const model = buildScratchModel(payload);
  const directory = scratchDirectory(generatedRoot);
  const { moduleFor, exportFor, targets, declaredAttributes } =
    loadResolvers(generatedRoot);
  // A target the kit does not build keeps its empty registry: its
  // components have no module to import.
  const files: [string, string][] = [
    [
      resolve(directory, 'react.tsx'),
      targets.includes('react')
        ? emitReactRegistry([model], moduleFor, exportFor, declaredAttributes)
        : EMPTY_REACT_REGISTRY,
    ],
    [
      resolve(directory, 'vue.ts'),
      targets.includes('vue')
        ? emitVueRegistry([model], moduleFor, exportFor)
        : EMPTY_REGISTRY,
    ],
  ];
  if (targets.includes('svelte')) {
    const wrapper = emitSvelteWrapper(model, moduleFor, exportFor);
    files.push(
      [resolve(directory, 'registry.ts'), emitSvelteRegistry([model])],
      [resolve(directory, wrapper.fileName), wrapper.source]
    );
  } else {
    files.push([resolve(directory, 'registry.ts'), EMPTY_REGISTRY]);
  }
  for (const [path, source] of files) writeFileSync(path, source);
  return files.map(([path]) => path);
}
