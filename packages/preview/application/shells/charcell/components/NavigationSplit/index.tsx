// The body under the prompt bar: the navigation beside the stage, in a charcell
// Splitter. The navigation ends in its line, a faint vertical Separator joined to
// the prompt bar's and the status bar's rules above and below as ┬ and ┴; the
// handle is the empty column between that line and the stage's, its grip in
// the middle, and drags the boundary a whole column at a time. The navigation
// starts wide enough for its longest entry, as the tree indents it, from 27
// columns up to 40, its line one more, measured by the split in the face's
// own columns once the fonts have loaded; keeps at least 16, so
// the tree's labels still read; and keeps its columns when the window
// resizes, the stage taking the difference. While the navigation is hidden the
// split holds the stage alone, in the same place, so the stage keeps its
// frames.
import { useMemo, type ReactNode } from 'react';
import type { PreviewNavigationNode } from '../../../../../src/shell';
import { usePreviewController } from '../../controller-context';
import { Separator, SplitterDriver, SplitterHandle, SplitterPanel, SplitterVisual } from 'charcell/react/unlinked';
import './index.css';

/** The fewest and the most columns the navigation starts at, its line one more. */
const NAVIGATION_START_COLUMNS = { least: 27, most: 40 };

/** The columns the navigation's entries take as the tree lays them out: a
 *  cell's margin, three columns of tree lines per level, the label, on a
 *  group a cell and its `[+]` after it; then a cell's margin and the
 *  scrollbar's column. */
function navigationColumns(nodes: PreviewNavigationNode[], depth = 0): number {
  return nodes.reduce((widest, node) => {
    const disclosure = node.kind === 'group' ? 4 : 0;
    const own = 1 + depth * 3 + disclosure + node.label.length + 2;
    const children = node.kind === 'group' ? navigationColumns(node.children, depth + 1) : 0;
    return Math.max(widest, own, children);
  }, 0);
}

/** The fewest columns the navigation keeps, its line one more. */
const NAVIGATION_LEAST_COLUMNS = 16;

export function NavigationSplit({ navigation, main, shown }: { navigation: ReactNode; main: ReactNode; shown: boolean }) {
  const { navigation: entries } = usePreviewController().catalog;
  const startColumns = useMemo(
    () =>
      Math.min(NAVIGATION_START_COLUMNS.most, Math.max(NAVIGATION_START_COLUMNS.least, navigationColumns(entries))),
    [entries],
  );
  const panels = useMemo(
    () =>
      shown
        ? [
            {
              id: 'navigation',
              minimumCells: NAVIGATION_LEAST_COLUMNS + 1,
              keepCells: true,
              defaultCells: startColumns + 1,
            },
            { id: 'main' },
          ]
        : [{ id: 'main' }],
    [shown, startColumns],
  );
  return (
    <div className="NavigationSplit">
      <SplitterDriver panels={panels}>
        {({ api }) => (
          <SplitterVisual fill {...api.getRootProps()}>
            {/* The navigation and its handle come first and leave holes while
                hidden, so the stage keeps its place in the tree. */}
            {shown && (
              <SplitterPanel {...api.getPanelProps({ id: 'navigation' })}>
                <div className="NavigationSplit__navigation">
                  {navigation}
                  <Separator orientation="vertical" decorative join="both" />
                </div>
              </SplitterPanel>
            )}
            {shown && <SplitterHandle label="resize navigation" {...api.getResizeTriggerProps({ id: 'navigation:main' })} />}
            <SplitterPanel {...api.getPanelProps({ id: 'main' })}>{main}</SplitterPanel>
          </SplitterVisual>
        )}
      </SplitterDriver>
    </div>
  );
}
