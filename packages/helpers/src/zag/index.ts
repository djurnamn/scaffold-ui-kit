/**
 * Fixes for components built on Zag machines: naming, dismissal, focus
 * return and form reset. Nothing here imports Zag or a framework; the
 * helpers work on the records and elements a machine produces.
 *
 * @packageDocumentation
 */
export { clearingOnReset } from './form-reset.js';
export { returningFocus, type FocusReturn } from './focus-return.js';
export {
  resolveOverlayLabeling,
  withoutUnrenderedDescription,
} from './labeling.js';
export { closingOnPressOutside } from './press-outside.js';
export {
  labelListbox,
  mergeTriggerProps,
  selectLabelId,
  selectValueId,
  type TriggerNaming,
} from './select.js';
