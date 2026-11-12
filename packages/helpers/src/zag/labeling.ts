/**
 * Drops a reference to a label part the component does not render, and names
 * the record with `label` when one is given.
 *
 * Several Zag machines point an element at their own label or title part
 * with `aria-labelledby` whether or not that part is rendered: Select on its
 * trigger and its listbox, Popover and Dialog on their content, Combobox on
 * its list. When the kit renders no such part, the reference resolves to
 * nothing. A dangling `aria-labelledby` is the highest-priority source of an
 * accessible name, so it suppresses the name the element would compute from
 * its own content, and the control looks named to anything reading the
 * markup while it is not.
 *
 * Use it only on records whose reference points at a part the kit does not
 * render; a reference to a rendered element should stay.
 *
 * @param props - The element props the machine supplies.
 * @param label - The name the component's consumer gave, if any. A blank
 *   label counts as none.
 * @returns The props without `aria-labelledby`, with `aria-label` set to the
 *   label when one is given. The same record when there is nothing to change.
 *
 * @example
 * ```ts
 * resolveOverlayLabeling(api.getContentProps(), label);
 * ```
 */
export function resolveOverlayLabeling<Props extends object>(
  props: Props,
  label?: string
): Props {
  const named = typeof label === 'string' && label.trim().length > 0;
  if (!named && !('aria-labelledby' in props)) return props;
  const { 'aria-labelledby': _unrendered, ...rest } = props as Record<
    string,
    unknown
  >;
  return (named ? { ...rest, 'aria-label': label } : rest) as Props;
}

/**
 * Drops a reference to a description part the component does not render.
 *
 * Popover points its content at its description part with
 * `aria-describedby` until the machine has looked for that part, a frame
 * after it opens, and the look writes its finding where React and Vue do not
 * see it change, so the reference can stay for as long as the popover is
 * open. A reference that resolves to nothing describes nothing, and it makes
 * the markup differ between targets.
 *
 * Use it only on records whose reference points at a part the kit does not
 * render; a reference to a rendered description should stay.
 *
 * @param props - The element props the machine supplies.
 * @returns The props without `aria-describedby`. The same record when there
 *   is none.
 *
 * @example
 * ```ts
 * withoutUnrenderedDescription(api.getContentProps());
 * ```
 */
export function withoutUnrenderedDescription<Props extends object>(
  props: Props
): Props {
  if (!('aria-describedby' in props)) return props;
  const { 'aria-describedby': _unrendered, ...rest } = props as Record<
    string,
    unknown
  >;
  return rest as Props;
}
