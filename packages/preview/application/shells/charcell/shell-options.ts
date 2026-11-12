// The ids of the shell's own options, as the controller's state keys them.
import { shellOptionId } from '../../../src/shell';

/** Whether the navigation shows. */
export const NAVIGATION_OPTION = shellOptionId('navigation');

/** Whether the scenario view shows: the stage's top row, holding the
 *  scenario picker, the story's context and the editor. */
export const SCENARIO_VIEW_OPTION = shellOptionId('scenario');

/** Whether the output view shows: the row of preview panes. */
export const OUTPUT_VIEW_OPTION = shellOptionId('output');

/** Whether the code view shows: the row of code panes, each target's source
 *  under its preview pane. */
export const CODE_VIEW_OPTION = shellOptionId('code');

/** Whether the events view shows: the log of the events the story's panes
 *  recorded. */
export const EVENTS_VIEW_OPTION = shellOptionId('events');

/** Whether the code panes wrap their source's long lines: on by default. */
export const WRAP_OPTION = shellOptionId('wrap');
