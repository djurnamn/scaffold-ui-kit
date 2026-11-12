// The cells the stacked output rows start at (PreviewGrid): while the story
// panes are laid out at a width wider than a column, the grid stacks a row
// per target over the code row. Every row starts at its story's height when
// the stories fit; when they don't, the rows share the space equally, a
// shorter story keeping its own height. Each row has a least: a readable
// height, or its story's when that is shorter. The grid is made tall enough
// for every row's least and the code row's, and the stage scrolls past it
// only when those don't fit.

/** The code row under the stacked rows: the least it keeps and its share. */
export interface StackedCodeRow {
  /** The fewest cells the code row keeps. */
  least: number;
  /** The share of the rows' space it starts at, in percent, as far as the
   *  output rows keep their least. */
  share: number;
}

/**
 * Each stacked output row's least, in cells: `least`, or the cells its
 * story and the pane around it take when that is fewer. A story that has
 * not reported its height (`undefined`) counts as `least`.
 *
 * @param wanted - The cells each output row's content takes.
 * @param least - The readable least of an output row.
 * @returns The least per row.
 * @example
 * stackedRowMinimums([4.2, undefined, 30], 10); // [5, 10, 10]
 */
export function stackedRowMinimums(wanted: readonly (number | undefined)[], least: number): number[] {
  return wanted.map((cells) => (cells === undefined ? least : Math.max(1, Math.min(least, Math.ceil(cells)))));
}

/**
 * The cells each stacked output row starts at, then the code row's when
 * there is one. A row's `wanted` is the cells its story and the pane around
 * it take (undefined while the story has not reported its height, which asks
 * for as much as it can get); `total` is the cells the rows share. Rows that
 * fit start at what they want, the space left over going to the code row, or
 * to the last row without one, so no row above the last is taller than its
 * story. Rows that don't fit share the space equally, a row that wants less
 * than its share keeping what it wants. The code row starts at its share as
 * far as the output rows keep their least (`stackedRowMinimums`). The rows
 * share at least their leasts and the code row's, even when that is more
 * than `total` holds.
 *
 * @param options.wanted - The cells each output row's content takes.
 * @param options.total - The whole cells the rows share.
 * @param options.least - The readable least of an output row.
 * @param options.code - The code row under the output rows, if it shows.
 * @returns The cells per row, the output rows first and then the code row.
 * @example
 * stackedRowCells({ wanted: [5, 40, 40], total: 60, least: 4 }); // [5, 27, 28]
 */
export function stackedRowCells({
  wanted,
  total,
  least,
  code,
}: {
  wanted: (number | undefined)[];
  total: number;
  least: number;
  code?: StackedCodeRow;
}): number[] {
  const count = wanted.length;
  const outputLeast = stackedRowMinimums(wanted, least).reduce((all, cells) => all + cells, 0);
  const space = Math.max(Math.floor(total), outputLeast + (code ? code.least : 0));
  const codeCells = code
    ? Math.max(code.least, Math.min(Math.round((code.share / 100) * space), space - outputLeast))
    : 0;
  const output = space - codeCells;
  const wants = wanted.map((cells) => Math.max(1, Math.ceil(cells ?? Number.POSITIVE_INFINITY)));
  const sum = wants.reduce((all, cells) => all + cells, 0);
  let cells: number[];
  if (sum <= output) {
    cells = [...wants];
    // What is left over goes under the last story: to the code row, or the
    // last output row.
    if (code) return [...cells, codeCells + output - sum];
    cells[count - 1] += output - sum;
    return cells;
  }
  // The rows that want least first, each taking its want or an equal share
  // of what is left, whichever is less; the one that wants most, the rest.
  // Since the space holds every row's least, a row wanting more than
  // `least` is left at least `least` this way.
  cells = new Array<number>(count).fill(0);
  const order = wants.map((_, index) => index).sort((first, second) => wants[first] - wants[second]);
  let left = output;
  order.forEach((index, position) => {
    const share = position === count - 1 ? left : Math.min(wants[index], Math.floor(left / (count - position)));
    cells[index] = share;
    left -= share;
  });
  return code ? [...cells, codeCells] : cells;
}

/**
 * The cells a stacked grid needs at least: each output row's least
 * (`stackedRowMinimums`), the code row's, and a cell for each handle
 * between two rows.
 *
 * @param wanted - The cells each output row's content takes.
 * @param least - The readable least of an output row.
 * @param code - The code row under the output rows, if it shows.
 * @returns The grid's least height, in cells.
 */
export function stackedLeastCells(
  wanted: readonly (number | undefined)[],
  least: number,
  code?: StackedCodeRow,
): number {
  const rows = wanted.length + (code ? 1 : 0);
  const output = stackedRowMinimums(wanted, least).reduce((all, cells) => all + cells, 0);
  return output + (code ? code.least : 0) + (rows - 1);
}
