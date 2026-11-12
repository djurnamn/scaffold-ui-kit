// The shell's interface: the terminal screen, letterboxed to whole cells, and
// inside its ring the prompt bar (the top bar: the kit, its settings, and the
// view and target toggles), the navigation beside the stage in a split the
// reader can drag (NavigationSplit), and the status bar. The navigation is the
// shell's `navigation` option, toggled from the prompt bar, so the address keeps
// it; hidden, the stage takes the body's width, and shown again, its groups
// are open and collapsed as they were left. The stage keeps a cell from
// the ring at its sides; beside the navigation, the split's handle is the cell at
// its start. The page's title names what the preview shows and the kit, so
// each tab and history entry says which it is.
// Styled in its index.css.
import { Frame } from 'charcell/react/unlinked';
import { useEffect, useState } from 'react';
import { usePreviewController, usePreviewState } from '../../controller-context';
import { ComponentStage } from '../ComponentStage';
import { PromptBar } from '../PromptBar';
import { NAVIGATION_OPTION } from '../../shell-options';
import { Navigation } from '../Navigation';
import { NavigationSplit } from '../NavigationSplit';
import { StatusBar } from '../StatusBar';
import { ViewStage } from '../ViewStage';
import './index.css';

export function Application() {
  const { catalog } = usePreviewController();
  const selection = usePreviewState((state) => state.selection);
  const shown =
    selection.kind === 'view'
      ? catalog.views.find((view) => view.id === selection.id)?.label
      : catalog.components.find((component) => component.id === selection.id)?.shortTitle;
  useEffect(() => {
    document.title = shown ? `${shown} · ${catalog.kitName} preview` : `${catalog.kitName} preview`;
  }, [shown, catalog.kitName]);
  const navigationShown = usePreviewState((state) => state.options[NAVIGATION_OPTION] !== false);
  // The navigation's collapsed groups, kept here while it is hidden.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  return (
    <div className="Application">
      {/* The terminal screen: the outermost ring, faint, so it groups everything
          without outshining the content it groups. */}
      <Frame as="div" quiet flush>
        <div className="Application__layout">
          <PromptBar />
          <NavigationSplit
            shown={navigationShown}
            navigation={<Navigation collapsed={collapsed} onCollapsedChange={setCollapsed} />}
            main={
              <main className={`Application__main${navigationShown ? ' Application__main--beside' : ''}`}>
                {selection.kind === 'view' ? (
                  // A custom view renders through the generic view iframe; the
                  // controller drives only its globals (the ready handshake delivers
                  // the current options, replayed on reload).
                  <ViewStage viewId={selection.id} />
                ) : (
                  <ComponentStage />
                )}
              </main>
            }
          />
          <StatusBar />
        </div>
      </Frame>
    </div>
  );
}
