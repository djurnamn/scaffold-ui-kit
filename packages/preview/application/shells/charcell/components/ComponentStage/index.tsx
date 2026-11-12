// A component story: the stage bar (StageBar), which picks the component
// and its scenario and sets the context the story is shown in. Then the
// stage's views, each a row the top bar toggles and the address keeps, each
// under its heading (ViewHeading): the scenario row (ScenarioRow) over the
// grid (PreviewGrid) of the output row, a preview pane per target, and the
// code row, each target's source under its pane (CodePane), over the events
// row (EventsRow), the rows sharing the height in a split the reader can drag
// (StageSplit). A row after the scenario row is headed on its handle's row,
// or on a row of its own with none above, with that view's controls at the
// row's end (ViewControls): output's options, its width (PaneWidth) among
// them, code's options and wrap toggle
// (WrapToggle), or the events' options and clear (EventsClear). With no view
// showing, a note says how to show one.
//
// The editor is the scenario row's: it is open while the row shows, where the
// preview can regenerate, and closed while it is hidden. Closing it keeps its
// tree, so showing the row again brings the same tree back, until another
// story or scenario is picked; selecting another story closes the editor, and
// the row opens it again on the new story. Where there is an editor, the row
// first shows once it is open, before the page paints, so the row starts at
// the height of its content with the editor's tree in it; it then stays
// through another story's selection, at the height the reader left it.
import { useLayoutEffect, useRef } from 'react';
import { usePreviewController, usePreviewState } from '../../controller-context';
import { PaneWidth, usePaneWidthShown } from '../PaneWidth';
import { PreviewGrid } from '../PreviewGrid';
import { ScenarioRow } from '../ScenarioRow';
import { StageSplit } from '../StageSplit';
import { EventsClear, EventsRow } from '../EventsRow';
import { CODE_VIEW_OPTION, EVENTS_VIEW_OPTION, OUTPUT_VIEW_OPTION, SCENARIO_VIEW_OPTION } from '../../shell-options';
import { useStage } from '../../stage-toggles';
import { StageBar } from '../StageBar';
import { ViewControls } from '../ViewControls';
import { ViewHeading } from '../ViewHeading';
import { WrapToggle } from '../WrapToggle';
import './index.css';

export function ComponentStage() {
  const controller = usePreviewController();
  const selection = usePreviewState((state) => state.selection);
  const editorOpen = usePreviewState((state) => state.editor.open);
  // The views and panes the stage shows: in a narrow window the first of each.
  const { views, panes } = useStage();
  const scenarioShown = views.has(SCENARIO_VIEW_OPTION);
  const outputShown = views.has(OUTPUT_VIEW_OPTION);
  const codeShown = views.has(CODE_VIEW_OPTION);
  const eventsShown = views.has(EVENTS_VIEW_OPTION);
  const sourced = usePreviewState((state) => state.code !== undefined);
  const paneWidthShown = usePaneWidthShown();
  const selected = controller.catalog.components.find((component) => component.id === selection.id);
  const editable = controller.capabilities.regeneration && selected !== undefined;
  const code = Boolean(selected && codeShown && sourced);

  // Whether the scenario row shows: once the editor is open, where there is
  // one, and from then on until the view is hidden.
  const rowShown = useRef(false);
  rowShown.current = Boolean(selected && scenarioShown && (editorOpen || !editable || rowShown.current));

  // The editor follows the scenario row.
  useLayoutEffect(() => {
    if (!editable) return;
    if (scenarioShown && !editorOpen) controller.editor.open();
    else if (!scenarioShown && editorOpen) controller.editor.close();
  }, [controller, editable, scenarioShown, editorOpen, selection]);

  return (
    <div className="ComponentStage">
      <StageBar />
      <div className="ComponentStage__body">
        {!scenarioShown && !outputShown && !code && !eventsShown && (
          <p className="ComponentStage__note" data-testid="stage-note">
            No view is showing: turn on scenario, output, code or events in the top bar.
          </p>
        )}
        <StageSplit
          rows={[
            { id: 'scenario', shown: rowShown.current, content: <ScenarioRow /> },
            {
              id: 'grid',
              shown: outputShown || code,
              label: 'resize scenario and panes',
              content: <PreviewGrid targets={panes} output={outputShown} code={code} />,
              heading: <ViewHeading>{outputShown || !code ? 'output' : 'code'}</ViewHeading>,
              controls:
                outputShown || !code ? (
                  <ViewControls view="output" options={paneWidthShown ? <PaneWidth /> : undefined} />
                ) : (
                  <ViewControls view="code">
                    <WrapToggle />
                  </ViewControls>
                ),
            },
            {
              id: 'events',
              shown: Boolean(selected && eventsShown),
              label: outputShown || code ? 'resize panes and events' : 'resize scenario and events',
              content: <EventsRow />,
              heading: <ViewHeading>events</ViewHeading>,
              controls: (
                <ViewControls view="events">
                  <EventsClear />
                </ViewControls>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
