// The shell's top bar: the tool sigil, the kit and its
// version, and the options placed in the top bar (the kit's own settings, such
// as its theme) at the start; at the end, two groups of toggles at one level,
// the views (the navigation, then the stage's rows: scenario, output, code,
// events) and the targets (its columns), then the kit's `top-bar-end` slot. One build of one kit is served,
// so the kit and its version are plain labels. A target the kit does not
// build gets no target toggle; html gets one, after the targets', where the
// kit builds it. Each toggle is on while the stage shows its view or target;
// in a narrow window each group shows and toggles one at a time
// (stage-toggles.ts), the navigation apart from that, being no row of the
// stage.
import { Field as CharcellField, Toggle } from 'charcell/react/unlinked';
import { useId } from 'react';
import type { PreviewTarget } from '../../../../../src/shell';
import { Bar } from '../Bar';
import { Hint } from '../Hint';
import { usePreviewController, usePreviewState } from '../../controller-context';
import { OptionControls } from '../OptionControls';
import {
  CODE_VIEW_OPTION,
  EVENTS_VIEW_OPTION,
  NAVIGATION_OPTION,
  OUTPUT_VIEW_OPTION,
  SCENARIO_VIEW_OPTION,
} from '../../shell-options';
import { SlotOutlet } from '../SlotOutlet';
import { toggleTarget, toggleView, useStage } from '../../stage-toggles';

/** The stage's views, top to bottom: each a shell option, so the address keeps it. */
const VIEWS = [
  { option: SCENARIO_VIEW_OPTION, label: 'scenario', title: 'the props and content editor' },
  { option: OUTPUT_VIEW_OPTION, label: 'output', title: 'the story rendered in each target' },
  { option: CODE_VIEW_OPTION, label: 'code', title: 'the story’s source in each target' },
  { option: EVENTS_VIEW_OPTION, label: 'events', title: 'the events the story’s panes fire' },
] as const;

export function PromptBar() {
  const controller = usePreviewController();
  const { kitName, kitVersion, targets: kitTargets } = controller.catalog;
  const targets = usePreviewState((state) => state.targets);
  const viewsLabel = useId();
  const targetsLabel = useId();
  const navigationShown = usePreviewState((state) => state.options[NAVIGATION_OPTION] !== false);
  // Narrow, the stage shows one view and one target at a time.
  const { narrow, views, panes } = useStage();
  return (
    <Bar
      joined
      lead="preview$"
      end={
        <>
          <CharcellField label="views" labelId={viewsLabel} role="group" aria-labelledby={viewsLabel}>
            <Hint text="the components and views" around>
              {(hint) => (
                <Toggle
                  variant="dense"
                  {...hint}
                  label="navigation"
                  pressed={navigationShown}
                  onPressedChange={() => controller.actions.setOption(NAVIGATION_OPTION, !navigationShown)}
                />
              )}
            </Hint>
            {VIEWS.map((view) => {
              const shown = views.has(view.option);
              return (
                <Hint key={view.option} text={view.title} around>
                  {(hint) => (
                    <Toggle
                      variant="dense"
                      {...hint}
                      label={view.label}
                      pressed={shown}
                      onPressedChange={() => toggleView(controller, view.option, narrow)}
                    />
                  )}
                </Hint>
              );
            })}
          </CharcellField>
          <CharcellField label="targets" labelId={targetsLabel} role="group" aria-labelledby={targetsLabel}>
            {kitTargets.map((target) => {
              // The selected component may not render into this target (a React-only
              // fixture of another package's components) - then the toggle is disabled and forced off,
              // its hint saying why. A hint either way keeps the toggle where it is as the selection
              // changes, so a focused toggle keeps the focus.
              const supported = targets.supported.includes(target);
              const on = supported && panes.includes(target);
              return (
                <Hint
                  key={target}
                  text={supported ? targetHint(target) : 'not supported by this component'}
                  around
                  focusable={!supported}
                  label={target}
                >
                  {(hint) => (
                    <Toggle
                      variant="dense"
                      {...hint}
                      label={target}
                      pressed={on}
                      disabled={!supported}
                      onPressedChange={() => toggleTarget(controller, target, narrow)}
                    />
                  )}
                </Hint>
              );
            })}
          </CharcellField>
          <SlotOutlet name="top-bar-end" />
        </>
      }
    >
      {/* Which kit, and which version of it, is being previewed. A kit with
          no package version shows none. */}
      <CharcellField label="kit" data-testid="kit-name">
        <span>{kitName}</span>
      </CharcellField>
      {kitVersion && (
        <CharcellField label="version" data-testid="kit-version">
          <span>{kitVersion}</span>
        </CharcellField>
      )}
      <OptionControls placement="top-bar" />
    </Bar>
  );
}

/** What a target's toggle shows or hides. */
function targetHint(target: PreviewTarget): string {
  return target === 'html' ? 'the story’s markup, with no script' : `the story rendered in ${target}`;
}
