// Browser runs over a kit's preview: every component's default props and
// scenarios, in one target, scanned with axe and walked with the keyboard.

export {
  DEFAULT_AXE_TAGS,
  formatViolation,
  scanAccessibility,
  type AxeViolation,
  type ScanOptions,
} from './axe.js';
export {
  walkKeyboard,
  type KeyboardPage,
  type KeyboardWalk,
  type WalkKeyboardOptions,
} from './keyboard.js';
export {
  BASE_PASS,
  DEFAULT_STATE,
  KEYBOARD_RULE,
  RENDER_RULE,
  staleViolations,
  sweepComponent,
  sweepPreview,
  sweepStates,
  sweepsComponent,
  type ComponentSweep,
  type KnownViolation,
  type OccurredViolation,
  type PreviewSweep,
  type SweepOptions,
  type SweepPass,
  type SweepState,
} from './sweep.js';
export {
  readPreviewManifest,
  type PreviewManifestComponent,
} from '@scaffold-ui-kit/preview/testing';
