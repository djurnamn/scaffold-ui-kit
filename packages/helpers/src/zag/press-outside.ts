/** What takes focus from a press. */
const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"]), [contenteditable=""], [contenteditable="true"]';

/**
 * Closes a non-modal overlay on a press outside it, at the press itself.
 *
 * Zag closes a dismissable layer a frame after an outside `pointerdown`, and
 * dismissing a layer dismisses every layer opened after it, as nested in it.
 * So a press on another overlay's trigger (a Select beside an open Popover)
 * opens that overlay and then closes it with the first, and the reader has
 * to press twice. Closing here, in the capture phase, closes the first
 * overlay before the press reaches what it lands on.
 *
 * A press inside the elements `inside` returns is ignored, and so is a press
 * inside another overlay's content (an element with `data-part="content"` or
 * `data-part="positioner"`, as Zag marks them), which Zag already knows as
 * nested.
 *
 * @param inside - The overlay's own elements, such as its trigger and its
 *   content, read on every press.
 * @param close - Closes the overlay. It hears whether focus should go back
 *   to the trigger: not when the press lands on something that takes focus
 *   itself, as Zag's own dismissal decides.
 * @returns The detach, which removes the listener.
 *
 * @example
 * ```ts
 * const detach = closingOnPressOutside(
 *   () => [triggerElement, contentElement],
 *   (restoreFocus) => api.setOpen(false, { restoreFocus }),
 * );
 * ```
 */
export function closingOnPressOutside(
  inside: () => (Element | null)[],
  close: (restoreFocus: boolean) => void
): () => void {
  const press = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (inside().some((element) => element?.contains(target))) return;
    if (target.closest('[data-part="content"], [data-part="positioner"]')) {
      return;
    }
    close(!target.closest(FOCUSABLE));
  };
  document.addEventListener('pointerdown', press, true);
  return () => document.removeEventListener('pointerdown', press, true);
}
