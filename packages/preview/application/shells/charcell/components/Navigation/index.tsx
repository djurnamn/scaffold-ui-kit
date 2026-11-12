// The navigation renders the catalog's navigation tree: per source, custom views (a
// tokens page, an icon gallery) and the component tree interleave by order, the
// root (core) source hoisted to the top level and every other source a collapsible
// wrapper. The tree is the controller's catalog data; this component only draws it.
// It scrolls in a charcell ScrollArea, a whole row at a time, its scrollbar
// drawn in cells; a scroll at either end stops there, moving nothing else.
// Which groups are collapsed is its parent's to keep (`collapsed`), so they
// stay as they were left while the navigation is hidden and shown.
import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { ScrollArea, Tree, TreeGroup, TreeItem } from 'charcell/react/unlinked';
import type { PreviewNavigationNode } from '../../../../../src/shell';
import { usePreviewController, usePreviewState } from '../../controller-context';
import './index.css';

export function Navigation({
  collapsed,
  onCollapsedChange,
}: {
  /** The keys of the collapsed groups. */
  collapsed: ReadonlySet<string>;
  /** Sets the keys as a group opens or collapses, as a state setter does. */
  onCollapsedChange: Dispatch<SetStateAction<ReadonlySet<string>>>;
}) {
  const controller = usePreviewController();
  const selection = usePreviewState((state) => state.selection);
  // A page opened on a selection (a followed link) scrolls the selected entry
  // to the middle of the navigation once, so a long list opens around it,
  // with what comes before and after it in view.
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    // The navigation's scrolling region (its ScrollArea's, by its role)
    // scrolls, a whole row at a time, and nothing around it.
    const selected = navigation.current?.querySelector('[aria-current]');
    const viewport = selected?.closest('[role="region"]');
    if (!(selected instanceof HTMLElement) || !(viewport instanceof HTMLElement)) return;
    const row = parseFloat(getComputedStyle(viewport).lineHeight) || 1;
    const offset =
      selected.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
    viewport.scrollTop = Math.max(0, Math.round((offset - viewport.clientHeight / 2) / row) * row);
  }, []);
  function syncGroup(key: string, open: boolean) {
    onCollapsedChange((previous) => {
      const next = new Set(previous);
      if (open) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  // The nested navigation: groups are charcell TreeGroups (open state on the
  // row's aria-expanded, connectors structural), leaves TreeItems; depth 0 renders the
  // bold root variants. The Tree is one tab stop, its rows reached with the
  // arrow keys.
  function renderNavigation(nodes: PreviewNavigationNode[], depth: number): React.ReactNode {
    return nodes.map((node) => {
      if (node.kind === 'group') {
        return (
          <TreeGroup
            key={node.key}
            root={depth === 0}
            label={node.label}
            open={!collapsed.has(node.key)}
            onOpenChange={(open) => syncGroup(node.key, open)}
          >
            {renderNavigation(node.children, depth + 1)}
          </TreeGroup>
        );
      }
      const selected = node.id === selection.id && (node.kind === 'view') === (selection.kind === 'view');
      return (
        <TreeItem
          key={node.kind === 'view' ? `view:${node.id}` : node.id}
          data-preview-entry={`${node.kind}:${node.id}`}
          root={depth === 0}
          label={node.label}
          current={selected}
          // The selected entry stays focusable, the tree's one tab stop;
          // choosing it again changes nothing.
          onClick={() => {
            if (!selected) controller.actions.select({ kind: node.kind, id: node.id });
          }}
        />
      );
    });
  }

  return (
    <nav ref={navigation} className="Navigation">
      {/* The composed navigation: depth-0 entries are bold roots (a source wrapper, the
          "Components" tree, or a root-level view such as a tokens page); deeper entries
          are the box-drawing category tree. Groups collapse; leaves select. */}
      <ScrollArea label="components" overscroll="none" fill>
        <div className="Navigation__content">
          <Tree aria-label="stories and views">{renderNavigation(controller.catalog.navigation, 0)}</Tree>
        </div>
      </ScrollArea>
    </nav>
  );
}
