// Server rendering of a kit's components in React, Vue and Svelte, with slot
// fills written once for every target.

export {
  SLOT_FILL_CLASS,
  scopedSlot,
  slot,
  type RenderProps,
  type ScopedSlotFill,
  type SlotFill,
} from './slots.js';
export type { Host, HostComponent, RenderOptions } from './host.js';
export { renderReact } from './react.js';
export { renderVue } from './vue.js';
export { renderSvelte } from './svelte.js';
export {
  TARGETS,
  createRenderer,
  type ComponentLoader,
  type ComponentLoaders,
  type Renderer,
  type Target,
} from './renderer.js';
