import { writable, type Readable } from 'svelte/store';

/**
 * Bridges a Zag machine into a Svelte store of its connected `api`.
 *
 * `@zag-js/svelte` keeps a service's state in signals, so the `api` that
 * `connect(service)` returns is current only when read inside a reactive
 * context. This recomputes it in an `$effect` and pushes each value into a
 * store, so a component reads one `$api` and re-renders as the machine
 * changes. Call it during component initialization, as `useMachine` is.
 *
 * @param start - Starts the service, typically with `useMachine`.
 * @param derive - Connects the service to its `api`.
 * @returns A store of the current `api`.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import * as dialog from '@zag-js/dialog';
 *   import { normalizeProps, useMachine } from '@zag-js/svelte';
 *   import { machineApi } from '@scaffold-ui-kit/helpers/zag/svelte';
 *
 *   const api = machineApi(
 *     () => useMachine(dialog.machine, { id }),
 *     (service) => dialog.connect(service, normalizeProps),
 *   );
 * </script>
 *
 * <button {...$api.getTriggerProps()}>Open</button>
 * ```
 */
export function machineApi<Service, Api>(
  start: () => Service,
  derive: (service: Service) => Api
): Readable<Api> {
  const service = start();
  const store = writable(derive(service));
  $effect(() => {
    store.set(derive(service));
  });
  return store;
}
