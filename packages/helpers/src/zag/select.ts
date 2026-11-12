import { resolveOverlayLabeling } from './labeling.js';

/**
 * The id of the element showing a Select's chosen value or placeholder,
 * derived from the trigger's id, so a server render and a client render
 * agree without a second id generator.
 *
 * @param triggerId - The trigger's id, as the machine's record types it.
 * @returns `<triggerId>-value`.
 */
export function selectValueId(triggerId: unknown): string {
  return `${String(triggerId)}-value`;
}

/**
 * The id of a Select's visible label, derived from the trigger's id like
 * {@link selectValueId}.
 *
 * @param triggerId - The trigger's id.
 * @returns `<triggerId>-label`.
 */
export function selectLabelId(triggerId: unknown): string {
  return `${String(triggerId)}-label`;
}

/** The elements that name a Select's trigger, by id. */
export interface TriggerNaming {
  /** The Select's visible label, when it renders one. */
  labelId?: string;
  /** The element showing the chosen value, {@link selectValueId}. */
  valueId?: string;
}

/**
 * Merges a consumer's props over the machine's Select trigger props and names
 * the trigger.
 *
 * A trigger with `role="combobox"` takes no name from its content, so the
 * value it shows names nothing on its own. The trigger is named by reference
 * instead: the consumer's own `aria-labelledby` (a field wrapper's label),
 * then the visible label, then the value, so the control announces what a
 * sighted reader sees ("Framework Vue"). The machine's reference to its
 * unrendered label part is dropped first ({@link resolveOverlayLabeling}).
 *
 * A consumer's `aria-label` wins outright, with no reference added beside
 * it, since `aria-labelledby` would outrank it.
 *
 * @param machineProps - The machine's trigger props.
 * @param consumerProps - The props the consumer gave the trigger, which win
 *   over the machine's.
 * @param naming - The ids of the label and value elements, each when
 *   rendered.
 * @returns The props to spread onto the trigger.
 *
 * @example
 * ```ts
 * mergeTriggerProps(api.getTriggerProps(), triggerProps, {
 *   labelId: label ? selectLabelId(id) : undefined,
 *   valueId: selectValueId(api.getTriggerProps().id),
 * });
 * ```
 */
export function mergeTriggerProps(
  machineProps: object,
  consumerProps: object | undefined,
  naming: TriggerNaming = {}
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...resolveOverlayLabeling(machineProps),
    ...consumerProps,
  };
  if (naming.labelId === undefined && naming.valueId === undefined) {
    return merged;
  }
  if (
    typeof merged['aria-label'] === 'string' &&
    merged['aria-labelledby'] === undefined
  ) {
    return merged;
  }
  const consumerLabeledBy =
    typeof merged['aria-labelledby'] === 'string'
      ? merged['aria-labelledby'].trim()
      : '';
  merged['aria-labelledby'] = [
    consumerLabeledBy,
    naming.labelId,
    naming.valueId,
  ]
    .filter(Boolean)
    .join(' ');
  return merged;
}

/**
 * Names a Select's listbox the way its trigger is named, without the value:
 * by the visible label, else by the trigger's `aria-label`, else by the
 * trigger itself. The machine's reference to its unrendered label part is
 * dropped.
 *
 * @param contentProps - The machine's listbox props.
 * @param triggerProps - The trigger's props as rendered, the consumer's
 *   merged in, for its `aria-label` and `id`.
 * @param labelId - The visible label's id, when the Select renders one.
 * @returns The props to spread onto the listbox.
 */
export function labelListbox(
  contentProps: object,
  triggerProps: object,
  labelId: string | undefined
): Record<string, unknown> {
  const trigger = triggerProps as Record<string, unknown>;
  const unlabeled = resolveOverlayLabeling(contentProps) as Record<
    string,
    unknown
  >;
  if (labelId !== undefined) {
    return { ...unlabeled, 'aria-labelledby': labelId };
  }
  if (typeof trigger['aria-label'] === 'string') {
    return { ...unlabeled, 'aria-label': trigger['aria-label'] };
  }
  return { ...unlabeled, 'aria-labelledby': trigger.id };
}
