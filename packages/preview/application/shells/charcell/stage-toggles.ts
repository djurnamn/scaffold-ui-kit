// Showing and hiding the stage's views and targets, from the top bar's
// toggles and the shell's keys alike. In a narrow window the stage shows one
// view and one target at a time: the first of each the state turns on, and
// turning one on turns the others off, the one showing staying on. The
// narrow layout starts below a width of the window's (NARROW_WIDTH). It
// narrows what the stage shows, not the state: a window that loads or
// becomes narrow changes no option and leaves the address as it is, and
// widening it shows every view and target the state turns on again. Only a
// toggle a person turns writes the state.
import { useEffect, useMemo, useState } from 'react';
import type { OptionValue, PreviewController, PreviewTarget } from '../../../src/shell';
import { usePreviewState } from './controller-context';
import { CODE_VIEW_OPTION, EVENTS_VIEW_OPTION, OUTPUT_VIEW_OPTION, SCENARIO_VIEW_OPTION } from './shell-options';

/** The window width, in CSS pixels, below which the stage is narrow. */
export const NARROW_WIDTH = 900;

/** The views' options, top to bottom. */
export const VIEW_OPTIONS = [SCENARIO_VIEW_OPTION, OUTPUT_VIEW_OPTION, CODE_VIEW_OPTION, EVENTS_VIEW_OPTION] as const;

/** Whether a view's option turns it on, by its value: output unless turned
 *  off, the others once turned on. */
export function viewShown(option: string, value: unknown): boolean {
  return option === OUTPUT_VIEW_OPTION ? value !== false : value === true;
}

/** The views the stage shows, top to bottom: those the options turn on, or,
 *  narrow, the first of them. */
export function stageViews(options: Record<string, OptionValue | undefined>, narrow: boolean): string[] {
  const views = VIEW_OPTIONS.filter((option) => viewShown(option, options[option]));
  return narrow ? views.slice(0, 1) : views;
}

/** The panes the stage shows: the state's, or, narrow, the first of them. */
export function stagePanes(panes: PreviewTarget[], narrow: boolean): PreviewTarget[] {
  return narrow ? panes.slice(0, 1) : panes;
}

/** Whether the window is narrow, following it as it resizes. */
export function useNarrow(): boolean {
  const query = `(max-width: ${NARROW_WIDTH - 1}px)`;
  const [narrow, setNarrow] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const list = matchMedia(query);
    const follow = () => setNarrow(list.matches);
    follow();
    list.addEventListener('change', follow);
    return () => list.removeEventListener('change', follow);
  }, [query]);
  return narrow;
}

/** What the stage shows now: whether it is narrow, which views show, and the
 *  panes, following the state and the window. */
export function useStage(): { narrow: boolean; views: ReadonlySet<string>; panes: PreviewTarget[] } {
  const narrow = useNarrow();
  const options = usePreviewState((state) => state.options);
  const panes = usePreviewState((state) => state.targets.panes);
  return useMemo(
    () => ({ narrow, views: new Set(stageViews(options, narrow)), panes: stagePanes(panes, narrow) }),
    [narrow, options, panes],
  );
}

/** Show or hide a view; narrow, showing one hides the others, and the one
 *  showing stays. */
export function toggleView(controller: PreviewController, option: string, narrow: boolean): void {
  const { options } = controller.getState();
  if (!narrow) {
    controller.actions.setOption(option, !viewShown(option, options[option]));
    return;
  }
  if (stageViews(options, true)[0] === option) return;
  controller.actions.setOption(option, true);
  for (const other of VIEW_OPTIONS) {
    if (other !== option && viewShown(other, options[other])) controller.actions.setOption(other, false);
  }
}

/** Show or hide a target; narrow, showing one hides the others, and the one
 *  showing stays. */
export function toggleTarget(controller: PreviewController, target: PreviewTarget, narrow: boolean): void {
  const { visible, supported, panes } = controller.getState().targets;
  if (!supported.includes(target)) return;
  if (!narrow) {
    controller.actions.setTargetVisible(target, !visible.includes(target));
    return;
  }
  if (stagePanes(panes, true)[0] === target) return;
  controller.actions.setTargetVisible(target, true);
  for (const other of visible) if (other !== target) controller.actions.setTargetVisible(other, false);
}
