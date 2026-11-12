/** What {@link returningFocus} returns. */
export interface FocusReturn {
  /** Notes what has focus. Call it as the dialog opens. */
  remember(): void;
  /**
   * Zag's `finalFocusEl` prop: the consumer's fallback, used only when
   * neither the trigger nor the element that had focus as the dialog opened
   * is on the page any more.
   *
   * @param triggerId - Reads the trigger's id.
   * @param finalFocus - The consumer's fallback, if any.
   */
  finalFocusEl(
    triggerId: () => unknown,
    finalFocus: (() => HTMLElement | null) | undefined
  ): () => HTMLElement | null;
}

/**
 * Decides where a dialog sends focus as it closes.
 *
 * Zag sends focus back to the trigger, or else to what had focus as the
 * dialog opened. When neither is on the page any more (a menu in a row the
 * dialog just deleted), focus would fall to the page itself, so the
 * consumer's `finalFocus` takes it instead.
 *
 * @returns `remember`, to call as the dialog opens, and `finalFocusEl`, to
 *   pass as Zag's prop of that name.
 *
 * @example
 * ```ts
 * const focusReturn = returningFocus();
 * // in the machine's props
 * onOpenChange(details) {
 *   if (details.open) focusReturn.remember();
 * },
 * finalFocusEl: focusReturn.finalFocusEl(
 *   (): unknown => api.getTriggerProps().id,
 *   finalFocus,
 * ),
 * ```
 */
export function returningFocus(): FocusReturn {
  let opener: Element | null = null;
  return {
    remember() {
      if (typeof document !== 'undefined') opener = document.activeElement;
    },
    finalFocusEl(triggerId, finalFocus) {
      return () => {
        if (!finalFocus) return null;
        const id = triggerId();
        const trigger =
          typeof id === 'string' ? document.getElementById(id) : null;
        if (trigger || opener?.isConnected) return null;
        return finalFocus();
      };
    },
  };
}
