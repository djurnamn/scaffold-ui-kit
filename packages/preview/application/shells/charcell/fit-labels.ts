// A row of short labels cut to a number of cells, a whole cell at a time, for
// controls that must never show a fraction of a character.

/** What stands for the letters a cut label has lost: the one ellipsis glyph,
 *  a single cell where three dots would take three. */
const ELLIPSIS = '\u2026';

/** The fewest cells a cut label's text takes: one letter and the ellipsis. */
const LEAST_CUT_CELLS = 2;

/** The cells a label takes beside its text: one of padding at each side. */
const PADDING_CELLS = 2;

/**
 * Fit padded labels, side by side, into a number of cells. The last label
 * gives way first: it loses a letter at a time behind an ellipsis, and once
 * only a letter and the ellipsis would be left it goes, and the one before it
 * starts giving way.
 *
 * @param labels - The labels, in their reading order.
 * @param cells - The cells there are, or `undefined` before they are known.
 * @returns The labels that fit, as they should read; empty if none does.
 * @example
 * ```ts
 * fitLabels(['reload', 'open'], 14); // ['reload', 'open']
 * fitLabels(['reload', 'open'], 11); // ['reload']
 * fitLabels(['reload', 'open'], 8); // ['reload']
 * fitLabels(['reload', 'open'], 3); // []
 * ```
 */
export function fitLabels(labels: readonly string[], cells: number | undefined): string[] {
  if (cells === undefined) return [...labels];
  for (let last = labels.length - 1; last >= 0; last -= 1) {
    const before = labels.slice(0, last);
    const taken = before.reduce((sum, label) => sum + [...label].length + PADDING_CELLS, 0);
    const room = cells - taken - PADDING_CELLS;
    const letters = [...labels[last]!];
    if (room >= letters.length) return [...before, labels[last]!];
    if (room >= LEAST_CUT_CELLS) return [...before, `${letters.slice(0, room - 1).join('')}${ELLIPSIS}`];
  }
  return [];
}
