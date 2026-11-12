// React bindings for the preview controller: one hook that reads a slice of
// its state and re-renders when that slice changes. A shell written in React
// keeps the controller wherever it likes (a context of its own, a prop) and
// passes it in; the bindings hold nothing of their own.

import { useSyncExternalStore } from 'react';
import type { PreviewController, PreviewState } from './controller/index.js';

/**
 * Read a slice of the controller's state. The component re-renders when the
 * slice changes by identity, so `selector` returns a field of the state (or
 * a primitive derived from it) rather than a fresh object or array; derive
 * those from the slice afterwards.
 *
 * @param controller - The controller to read.
 * @param selector - Picks the slice; the whole state when omitted.
 * @returns The slice.
 * @example
 * ```tsx
 * const scenario = usePreview(controller, (state) => state.scenario);
 * const panes = usePreview(controller, (state) => state.targets.panes);
 * ```
 */
export function usePreview<Selected = PreviewState>(
  controller: PreviewController,
  selector: (state: PreviewState) => Selected = (state) =>
    state as unknown as Selected
): Selected {
  return useSyncExternalStore(
    controller.subscribe,
    () => selector(controller.getState()),
    () => selector(controller.getState())
  );
}
