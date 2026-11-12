// The component stage's body: its rows, top to bottom, in a stacked charcell
// Splitter - the scenario row while the scenario view shows, the grid of the
// output and code rows (PreviewGrid) while either shows, and the events row
// while the events view shows - each handle between two rows dragging the
// boundary a whole row at a time. A row after the first is headed on its
// handle's row, its heading at the start and its controls at the end, around
// the grip; a headed row with no row above has the same row to itself,
// without a grip. SplitGrid has no cell spanning its columns, so the scenario
// and events rows sit over and under the grid rather than in it.
//
// The scenario row starts at its content's height - its picker row and, where
// the preview can regenerate, the editor's tree - and keeps at least its ring
// and one row inside it; the events row starts a few rows tall. The grid
// takes the rest. The split measures the scenario row, and measures again as
// its content changes, unless the reader has moved the boundary since.
//
// The grid's panel stays in the split while the grid has no row showing,
// hidden and out of the split's panels, and the whole split is hidden while
// no view shows, so the panes keep their place in the tree, and their frames,
// whichever views open and close.
import { Fragment, useMemo, type ReactNode } from 'react';
import {
  SplitterDriver,
  SplitterHandle,
  SplitterHandleRow,
  SplitterPanel,
  SplitterVisual,
} from 'charcell/react/unlinked';
import './index.css';

/** The fewest rows the scenario and events rows keep: a ring and one row inside. */
const LEAST_ROWS = 3;

/** The rows the events row starts at beside the others. */
const EVENTS_ROWS = 8;

/** One of the stage's rows, as the split holds it. */
export interface StageRow {
  id: 'scenario' | 'grid' | 'events';
  content: ReactNode;
  shown: boolean;
  /** The row's heading and controls, on the row above it; the scenario row
   *  heads itself. */
  heading?: ReactNode;
  controls?: ReactNode;
  /** The handle above it, named for a reader. */
  label?: string;
}

export function StageSplit({ rows }: { rows: StageRow[] }) {
  const shown = rows.filter((row) => row.shown);
  const key = shown.map((row) => row.id).join(',');
  // The panels follow which rows show, and nothing else.
  const panels = useMemo(() => {
    const ids = key === '' ? [] : key.split(',');
    return ids.map((id) =>
      ids.length === 1
        ? { id }
        : id === 'scenario'
          ? { id, minimumCells: LEAST_ROWS, defaultCells: 'content' as const }
          : id === 'events'
            ? { id, minimumCells: LEAST_ROWS, defaultCells: EVENTS_ROWS }
            : { id },
    );
  }, [key]);
  return (
    <div className="StageSplit" hidden={shown.length === 0}>
      <SplitterDriver orientation="vertical" panels={panels}>
        {({ api }) => (
          <SplitterVisual orientation="vertical" fill {...api.getRootProps()}>
            {rows.map((row) => {
              const index = shown.indexOf(row);
              const above = index > 0 ? shown[index - 1] : undefined;
              // The grid stays in the tree while hidden, in the same place,
              // so its panes keep their frames; another row leaves.
              if (!row.shown && row.id !== 'grid') return null;
              return (
                <Fragment key={row.id}>
                  {above && (
                    <SplitterHandle
                      label={row.label ?? `resize ${above.id} and ${row.id}`}
                      {...api.getResizeTriggerProps({ id: `${above.id}:${row.id}` })}
                    />
                  )}
                  {row.shown && row.heading !== undefined && (
                    <SplitterHandleRow start={row.heading} end={row.controls} />
                  )}
                  <SplitterPanel {...(row.shown ? api.getPanelProps({ id: row.id }) : { hidden: true })}>
                    {row.content}
                  </SplitterPanel>
                </Fragment>
              );
            })}
          </SplitterVisual>
        )}
      </SplitterDriver>
    </div>
  );
}
