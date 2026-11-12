// What a kit configures the charcell shell with: content for its named slots
// and where each option group goes. The types alone; `index.tsx` takes them.
import type { PreviewController } from '../../../src/shell';

/** One of the stage's views, each headed by a row whose end holds its
 *  options, its slot and its own control. */
export type CharcellView = 'scenario' | 'output' | 'code' | 'events';

/** A region of the charcell shell an option group can be placed in: the top
 *  bar, the end of the stage bar (the bar with the component select), the
 *  end of a view's heading row, and the status bar. */
export type CharcellRegion = 'top-bar' | 'stage-bar' | CharcellView | 'status-bar';

/** A named slot of the charcell shell: the end of the top bar, the end of the
 *  stage bar, the end of a view's heading row, and the status bar. */
export type CharcellSlotName =
  | 'top-bar-end'
  | 'stage-bar-end'
  | 'scenario-end'
  | 'output-end'
  | 'code-end'
  | 'events-end'
  | 'status-bar';

/**
 * Content for a slot: mounts into `element` when the shell renders the slot
 * and may return a function that unmounts it. Written in any framework or in
 * plain DOM; `reactFill` wraps a React render function.
 */
export type CharcellSlotFill = (element: HTMLElement, controller: PreviewController) => (() => void) | void;

/** What `charcellShell` takes. */
export interface CharcellShellConfiguration {
  /** Content for the shell's named slots. */
  slots?: Partial<Record<CharcellSlotName, CharcellSlotFill>>;
  /** Where each option group goes, by group name, over the shell's own
   *  placement: a story option, and a global option of the `context` group
   *  (or of none), in the output view's region; a global option of the `kit`
   *  group in the top bar, and of any other group in the status bar. */
  groups?: Record<string, CharcellRegion>;
  /** Which views hold their options in a popover at the end of
   *  their heading row, rather than in the row itself: the output's by
   *  default. */
  popovers?: Partial<Record<CharcellView, boolean>>;
}
