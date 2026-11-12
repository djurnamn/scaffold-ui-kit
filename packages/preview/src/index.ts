// Programmatic surface: everything a consumer's own scripts (or tests) need -
// the context loader, the generator, the Vite configuration factory, and the model /
// emit layer the registries are built from.

export {
  jsonProblems,
  loadPreviewContext,
  type PreviewContext,
  type ResolvedSource,
} from './context.js';
export { generatePreview } from './generate.js';
export {
  checkPreview,
  type PreviewCheckOptions,
  type PreviewCheckReport,
} from './check.js';
export {
  storySource,
  type SourceTarget,
  type StorySource,
  type StorySourceOptions,
} from './story-source.js';
export {
  loadKit,
  kitPaneWidths,
  type KitPaneWidths,
  type LoadedComponent,
  type LoadedKit,
} from './load.js';
export {
  readPropsFrom,
  resolveManualComponent,
  type PropsFromResult,
} from './props-from.js';
export {
  applicationRoot,
  buildViteConfiguration,
  type DevelopmentServerOverrides,
} from './vite-configuration.js';
export { enumerateComponents } from './enumerate.js';
export { resolveStory } from './model.js';
export { propTypeForProp, defaultPropForProp } from './prop-types.js';
export { loadStory, isStructurallyOmitted } from './story.js';
export { emitReactRegistry } from './emit/react.js';
export { emitVueRegistry } from './emit/vue.js';
export { emitSvelteRegistry, emitSvelteWrapper } from './emit/svelte.js';
export {
  buildManifest,
  type Manifest,
  type ManifestComponent,
  type ManifestSource,
} from './emit/manifest.js';
export {
  writeScratch,
  writeScratchStubs,
  SCRATCH_ID,
  type ScratchPayload,
} from './emit/scratch.js';
export * from './lib/types.js';
export * from './options.js';
