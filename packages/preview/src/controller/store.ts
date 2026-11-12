// A store view of the preview controller: an object with one `subscribe`
// method that calls its listener with the current value at once and again
// whenever the value changes. That is the Svelte store contract, so a Svelte
// shell reads it with `$store` or `fromStore`, and it suits any other
// store-shaped consumer. Framework-neutral and browser-safe.

import type {
  PreviewController,
  PreviewState,
} from './create-preview-controller.js';

/** A readable store: `subscribe` calls `listener` with the current value
 *  immediately, then with each new value, until the returned function is called. */
export interface PreviewStore<Value> {
  subscribe(listener: (value: Value) => void): () => void;
}

/**
 * A store of the controller's state, or of a slice of it. Each subscriber is
 * called with the current slice when it subscribes, and again only when the
 * slice changes by identity, so `selector` returns a field of the state (or a
 * primitive derived from it) rather than a fresh object or array.
 *
 * @param controller - The controller to read.
 * @param selector - Picks the slice; the whole state when omitted.
 * @returns The store.
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { previewStore } from '@scaffold-ui-kit/preview/shell';
 *   const preview = previewStore(controller);
 *   const scenario = previewStore(controller, (state) => state.scenario);
 * </script>
 *
 * <p>{$preview.selection.id}: {$scenario}</p>
 * ```
 */
export function previewStore<Selected = PreviewState>(
  controller: Pick<PreviewController, 'getState' | 'subscribe'>,
  selector: (state: PreviewState) => Selected = (state) =>
    state as unknown as Selected
): PreviewStore<Selected> {
  return {
    subscribe(listener) {
      let current = selector(controller.getState());
      listener(current);
      return controller.subscribe((state) => {
        const next = selector(state);
        if (Object.is(next, current)) return;
        current = next;
        listener(next);
      });
    },
  };
}
