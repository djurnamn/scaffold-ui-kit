// The component stage's grid: a column per pane showing (a target's, and
// the html one where the kit builds html), and a row per view showing of the
// two the grid holds - the output row, a preview pane in each column, and the
// code row, that target's code pane under it (CodePane). charcell's
// SplitGridDriver + SplitGridVisual composed with its SplitGridCell and
// SplitGridHandle parts: a handle between two columns runs down every row, the
// handle between the rows across every column, and a press where they cross
// drags both, each boundary a whole column or row at a time (the driver's own
// snapping). The handle between the rows draws one grip, in its middle, and
// carries the code view's heading at its start and the wrap toggle
// (WrapToggle) at its end. The code row starts at about two fifths of the height and keeps
// at least eight rows - its ring, the copy row and a few rows of source - and
// the output row at least three; the columns share the width equally to
// start. A new set of columns or rows starts over from those sizes. The
// preview cells are keyed by their target and come first, and stay in the
// grid while the output row is hidden, laid out nowhere, so the panes keep
// their place in the tree, and their frames, while either row opens and
// closes and while a target is turned on or off.
//
// While the story panes are laid out at a width (`paneWidth`) wider than a
// column would be, the output stacks instead: a row per target, each at the
// grid's full width, the handles between them dragging a row at a time, and
// the code row under them holding each target's code pane side by side. Each
// row starts at its story's height, or, when the stories don't fit, at an
// equal share (stackedRowCells), once every story has reported its height.
// Each keeps a least: ten rows, its ring and scrollbar rows and about seven
// rows of story, or its whole story and pane when they take fewer. The grid
// is tall enough for every row's least and the code row's, so the stage
// scrolls down only when those don't fit, rather than squeezing a row. The
// rows follow the stories' heights and the stage's until the reader drags a
// handle between them or steps it with a key. A story still wider than its row
// scrolls across, and a taller one down (PreviewPane). The preview cells keep
// their keys, so the panes keep their frames as the grid stacks and unstacks.
//
// A target turned off gives its columns to the others in proportion to their
// widths, and one turned back on comes back at the width it had, the others
// giving way in proportion (the driver's `redistribute: 'proportional'`); the
// stacked rows and the code row share their rows the same way. A double-click
// on a handle, or Enter while it holds the focus (split-reset.ts), puts its
// split back where it started: the columns at equal widths, the output and
// code rows at their starting heights, and stacked rows at their stories'
// heights again, following the stories as before a handle was moved.
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import {
  SplitGridCell,
  SplitGridDriver,
  SplitGridHandle,
  SplitGridHandleRow,
  SplitGridVisual,
  type SplitGridScope,
} from 'charcell/react/unlinked';
import type { PreviewTarget } from '../../../../../src/shell';
import { usePreviewState } from '../../controller-context';
import { withResetGesture } from '../../split-reset';
import { stackedLeastCells, stackedRowCells, type StackedCodeRow } from '../../stacked-rows';
import { CodePane } from '../CodePane';
import { PreviewPane } from '../PreviewPane';
import { ViewControls } from '../ViewControls';
import { ViewHeading } from '../ViewHeading';
import { WrapToggle } from '../WrapToggle';
import './index.css';

/** The fewest rows the code row keeps, so its copy row and some source still show. */
const CODE_ROWS = 8;

/** The fewest rows the output row keeps. */
const OUTPUT_ROWS = 3;

/** The fewest columns a pane keeps, so its title and some of its story still show. */
const PANE_COLUMNS = 12;

/** The output row's and the code row's starting shares, in percent, while both show. */
const BOTH_ROWS_SIZE = [60, 40];

/** The one row's share while only one shows. */
const ONE_ROW_SIZE = [100];

/** The code row's starting share under stacked output rows, in percent. */
const STACKED_CODE_SIZE = 30;

/** The fewest rows a stacked output row keeps, unless its story and pane
 *  take fewer: its ring and scrollbar rows and about seven rows of story. */
const STACKED_ROWS = 10;

/** The keys that step a handle. */
const STEP_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);

/** The one column of a stacked grid. */
const STACK_COLUMN = 'stack';

/** The grid's own size, as it changes. */
function useSize(element: RefObject<HTMLDivElement | null>): {
  width: number;
  height: number;
} {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const current = element.current;
    if (!current) return;
    const { width, height } = current.getBoundingClientRect();
    setSize({ width, height });
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(current);
    return () => observer.disconnect();
  }, [element]);
  return size;
}

export function PreviewGrid({ targets, output, code }: { targets: PreviewTarget[]; output: boolean; code: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  const { width, height } = useSize(element);
  const paneWidth = usePreviewState((state) => state.paneWidth);
  // The stories' heights, as one value that changes when any of them does.
  const storyHeights = usePreviewState((state) =>
    targets.map((target) => state.frameSizes[target]?.height ?? '').join(','),
  );
  // Stacked while the output shows and a picked width is wider than a column would be.
  const stacked =
    output && targets.length > 1 && paneWidth !== undefined && width > 0 && paneWidth > width / targets.length;
  const columns = useMemo(
    () =>
      stacked
        ? [{ id: STACK_COLUMN, minimumCells: PANE_COLUMNS }]
        : targets.map((target) => ({ id: target, minimumCells: PANE_COLUMNS })),
    [targets, stacked],
  );
  // With neither row showing the grid is hidden whole (StageSplit),
  // and keeps the output row for its panes.
  const rows = useMemo(
    () =>
      stacked
        ? [
            // Each target's row starts at its story's height (below).
            ...targets.map((target) => ({
              id: `output:${target}`,
              minimumCells: OUTPUT_ROWS,
            })),
            ...(code ? [{ id: 'code', minimumCells: CODE_ROWS }] : []),
          ]
        : [
            // Beside the code row, the output row starts at its panes' content.
            ...(output || !code
              ? [
                  {
                    id: 'output',
                    minimumCells: OUTPUT_ROWS,
                    ...(code && output ? { defaultCells: 'content' as const } : {}),
                  },
                ]
              : []),
            ...(code ? [{ id: 'code', minimumCells: CODE_ROWS }] : []),
          ],
    [targets, output, code, stacked],
  );
  const defaultColumnSize = useMemo(() => columns.map(() => 100 / columns.length), [columns]);
  const defaultRowSize = useMemo(() => {
    if (!stacked) return rows.length === 2 ? BOTH_ROWS_SIZE : ONE_ROW_SIZE;
    const outputShare = (100 - (code ? STACKED_CODE_SIZE : 0)) / targets.length;
    return [...targets.map(() => outputShare), ...(code ? [STACKED_CODE_SIZE] : [])];
  }, [stacked, rows, code, targets]);
  // The code row is the last; the handle above it carries its heading.
  const codeRow = rows.length - 1;
  const codeRowLimits: StackedCodeRow | undefined = code ? { least: CODE_ROWS, share: STACKED_CODE_SIZE } : undefined;

  // The grid's parts as the driver last handed them, for the stacked rows' start.
  const scope = useRef<SplitGridScope | null>(null);
  // Whether the reader has moved a handle between the rows since they last
  // stacked: dragged it, or stepped it with a key.
  const moved = useRef(false);
  // A press on a handle, until it ends: a drag while it lasts is the reader's.
  const pressed = useRef(false);
  const layout = `${stacked}:${code}:${targets.join(',')}`;
  useLayoutEffect(() => {
    moved.current = false;
  }, [layout]);
  // The cells the stacked grid needs at least, once the stories report.
  const [leastCells, setLeastCells] = useState(0);
  // A count of the resets of the rows, so a reset of stacked rows lays them
  // out at their stories again.
  const [rowResets, setRowResets] = useState(0);
  // A charcell whose split has no `resetSizes` leaves the split where it is,
  // and shares a leaving track's cells by its own default, whatever
  // `redistribute` says: a reset there does nothing but re-lay stacked rows
  // at their stories.
  const resetColumns = () => scope.current?.columnsApi.resetSizes?.();
  const resetRows = () => {
    scope.current?.rowsApi.resetSizes?.();
    if (!stacked) return;
    moved.current = false;
    setRowResets((count) => count + 1);
  };
  // Stacked, each row starts at its story's height, or an equal share where
  // the stories don't fit, once every story has reported its height, and
  // follows the stories and the stage until the reader moves a handle.
  useLayoutEffect(() => {
    const grid = scope.current;
    if (!stacked || moved.current || !grid) return;
    const gridElement = document.getElementById(String(grid.gridProps.id));
    if (!gridElement) return;
    const cell = parseFloat(getComputedStyle(gridElement).lineHeight);
    if (!(cell > 0)) return;
    const heights = storyHeights.split(',').map(Number);
    if (heights.some((story) => !(story > 0))) return;
    const wanted = targets.map((_, index) => {
      const cellElement = document.getElementById(String(grid.cellProps(0, index).id));
      const viewport = cellElement?.querySelector('[role="region"]');
      if (!cellElement || !viewport) return undefined;
      // The pane around the story: its ring and any scrollbar row.
      const chrome = cellElement.getBoundingClientRect().height - viewport.clientHeight;
      return (heights[index] + chrome) / cell;
    });
    const least = stackedLeastCells(wanted, STACKED_ROWS, codeRowLimits);
    if (least !== leastCells) {
      // The grid grows to it first; this runs again at its new height.
      setLeastCells(least);
      return;
    }
    const total = (gridElement.getBoundingClientRect().height - (grid.rows.length - 1) * cell) / cell;
    if (!(total > 0)) return;
    const cells = stackedRowCells({ wanted, total, least: STACKED_ROWS, code: codeRowLimits });
    // A frame later, once the split has taken in a new set of rows.
    const frame = requestAnimationFrame(() =>
      scope.current?.rowsApi.setSizes(cells.map((length) => (length / total) * 100)),
    );
    return () => cancelAnimationFrame(frame);
    // The layout and stories it follows, the grid's least, the stage's size
    // and a reset of the rows.
  }, [stacked, layout, storyHeights, leastCells, height, width, rowResets]);
  const onHandle = (target: EventTarget) => (target as Element).closest('[data-part="resize-trigger"]') !== null;
  return (
    <div
      ref={element}
      className="PreviewGrid"
      data-stacked={stacked || undefined}
      style={{ '--preview-grid-least-rows': stacked ? leastCells : 0 } as CSSProperties}
      // A drag or a step key on a handle between the rows is the reader's:
      // the rows stay where they leave them. A plain click or a tab to it is not.
      onPointerDownCapture={(event) => {
        pressed.current = onHandle(event.target);
      }}
      onPointerMoveCapture={(event) => {
        if (pressed.current && event.buttons !== 0) moved.current = true;
      }}
      onPointerUpCapture={() => {
        pressed.current = false;
      }}
      onKeyDownCapture={(event) => {
        if (STEP_KEYS.has(event.key) && onHandle(event.target)) moved.current = true;
      }}
    >
      <div className="PreviewGrid__rows">
        <SplitGridDriver
          columns={columns}
          rows={rows}
          defaultColumnSize={defaultColumnSize}
          defaultRowSize={defaultRowSize}
          redistribute="proportional"
        >
          {({ grid }) => {
            scope.current = grid;
            return (
              <SplitGridVisual fill rowGrips="one" {...grid.rootProps} gridProps={grid.gridProps}>
                {targets.map((target, index) => (
                  <SplitGridCell
                    key={`output:${target}`}
                    {...(!output ? { hidden: true } : stacked ? grid.cellProps(0, index) : grid.cellProps(index, 0))}
                  >
                    <PreviewPane title={target} target={target} />
                  </SplitGridCell>
                ))}
                {code &&
                  !stacked &&
                  targets.map((target, columnIndex) => (
                    <SplitGridCell key={`code:${target}`} {...grid.cellProps(columnIndex, codeRow)}>
                      <CodePane target={target} />
                    </SplitGridCell>
                  ))}
                {code && stacked && (
                  <SplitGridCell key="code:stack" {...grid.cellProps(0, codeRow)}>
                    <div className="PreviewGrid__codes">
                      {targets.map((target) => (
                        <CodePane key={target} target={target} />
                      ))}
                    </div>
                  </SplitGridCell>
                )}
                {!stacked &&
                  targets
                    .slice(1)
                    .map((target, index) => (
                      <SplitGridHandle
                        key={`handle:${target}`}
                        {...withResetGesture(grid.columnHandleProps(index), resetColumns)}
                        axis="column"
                        crosses={grid.rows}
                        label={`resize ${targets[index]} and ${target}`}
                      />
                    ))}
                {stacked &&
                  targets
                    .slice(1)
                    .map((target, index) => (
                      <SplitGridHandle
                        key={`row-handle:${target}`}
                        {...withResetGesture(grid.rowHandleProps(index), resetRows)}
                        axis="row"
                        crosses={grid.columns}
                        label={`resize ${targets[index]} and ${target}`}
                      />
                    ))}
                {code && rows.length > 1 && (
                  <SplitGridHandle
                    key="handle:code"
                    {...withResetGesture(grid.rowHandleProps(codeRow - 1), resetRows)}
                    axis="row"
                    crosses={grid.columns}
                    label="resize panes and code"
                  />
                )}
                {code && rows.length > 1 && (
                  <SplitGridHandleRow
                    key="handle-row:code"
                    {...grid.rowHandleRowProps(codeRow - 1)}
                    start={<ViewHeading>code</ViewHeading>}
                    end={
                      <ViewControls view="code">
                        <WrapToggle />
                      </ViewControls>
                    }
                  />
                )}
              </SplitGridVisual>
            );
          }}
        </SplitGridDriver>
      </div>
    </div>
  );
}
