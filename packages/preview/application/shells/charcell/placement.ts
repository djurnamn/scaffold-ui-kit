// Where this shell shows an option's control: a story option and a global
// option of the context group (the group of an option that names none) in
// the output view's region, the context the panes show the story in; a
// global option of the kit's group in the top bar, and of any other group in
// the status bar - unless the kit's `groups` mapping places the option's
// group elsewhere.
import { CONTEXT_OPTION_GROUP, KIT_OPTION_GROUP, optionGroup, type PreviewOptionDescriptor } from '../../../src/shell';
import type { CharcellRegion } from './configuration';

/**
 * The region an option's control renders in. A group named in `groups` goes
 * where the mapping says, whatever the option's scope.
 */
export function optionPlacement(
  option: Pick<PreviewOptionDescriptor, 'scope' | 'group'>,
  groups: Record<string, CharcellRegion> = {},
): CharcellRegion {
  const group = optionGroup(option);
  const mapped = groups[group];
  if (mapped) return mapped;
  if (option.scope === 'story') return 'output';
  if (group === KIT_OPTION_GROUP) return 'top-bar';
  return group === CONTEXT_OPTION_GROUP ? 'output' : 'status-bar';
}
