// The scenario row, the stage's top row while the scenario view shows: the
// view's heading, with `pick`, the scenario picker, at the heading row's end
// and an info button for the picked scenario's description; then the props
// and content editor (EditorPanel) of the picked scenario in a quiet charcell
// Frame, as the target panes are, scrolling in a charcell ScrollArea, a whole
// row at a time. The picker shows only when there is a real choice beyond
// the default (an injected Empty, where the preview can regenerate, and/or
// named scenarios); its baseline option is "(default)", or
// "<label> (default)" when a story file names it. The story's context sits in
// the stage bar (StageBar). Where the preview cannot regenerate there is no
// editor, and the row says so. The Frame is flush, so the editor's scrollbar
// runs beside its ring; the note and the tree keep their own cell from it.
// Styled in its index.css.
import { Frame, ScrollArea } from 'charcell/react/unlinked';
import { scenarioChoices } from '../../../../../src/shell';
import { usePreviewController, usePreviewState } from '../../controller-context';
import { Description } from '../Description';
import { EditorPanel } from '../EditorPanel';
import { Select } from '../Select';
import { HeadingRow } from '../HeadingRow';
import { ViewControls } from '../ViewControls';
import './index.css';

export function ScenarioRow() {
  const controller = usePreviewController();
  const selection = usePreviewState((state) => state.selection);
  const scenario = usePreviewState((state) => state.scenario);
  const editing = usePreviewState((state) => state.editor.open && state.editor.tree !== undefined);
  const selected = controller.catalog.components.find((component) => component.id === selection.id);
  const choices = scenarioChoices(selected, controller.capabilities);
  const picked = selected?.scenarios.find((candidate) => candidate.id === scenario);
  return (
    <div className="ScenarioRow" data-preview-scenario>
      <HeadingRow
        heading="scenario"
        end={
          <ViewControls view="scenario">
            {selected && choices.length > 0 && (
              <span className="ScenarioRow__pick">
                <Select
                  label="pick"
                  testId="select-scenario"
                  value={scenario}
                  onChange={controller.actions.pickScenario}
                  options={choices}
                />
                <Description text={picked?.description} label={`about ${picked?.label ?? 'the scenario'}`} />
              </span>
            )}
          </ViewControls>
        }
      />
      <div className="ScenarioRow__frame">
        <Frame quiet flush fill>
          {selected && editing ? (
            <ScrollArea label="scenario" overscroll="none" fill>
              <div className="ScenarioRow__tree">
                {/* Reseed the panel's own view state when the story or scenario changes. */}
                <EditorPanel key={`${selected.id}:${scenario}`} />
              </div>
            </ScrollArea>
          ) : (
            !controller.capabilities.regeneration && (
              <p className="ScenarioRow__note">Editing a scenario needs the preview's development server.</p>
            )
          )}
        </Frame>
      </div>
    </div>
  );
}
