/**
 * Clears a combobox when its form resets.
 *
 * A form reset empties the text the reader sees in the input, but not the
 * value the machine holds, which the form submits from a hidden input. This
 * calls `clear` on the input's form's `reset`, so the chosen value goes with
 * the text.
 *
 * @param input - Reads the combobox's input element.
 * @param clear - Clears the machine's value.
 * @returns The cleanup, which removes the listener. A no-op when the input is
 *   in no form.
 *
 * @example
 * ```ts
 * const cleanup = clearingOnReset(
 *   () => document.getElementById(inputId),
 *   () => api.clearValue(),
 * );
 * ```
 */
export function clearingOnReset(
  input: () => HTMLElement | null,
  clear: () => void
): () => void {
  const form = (input() as HTMLInputElement | null)?.form;
  if (!form) return () => {};
  form.addEventListener('reset', clear);
  return () => form.removeEventListener('reset', clear);
}
