// The entry a kit names for the preview to open on (`preview.landing`),
// checked against the kit's stories: the generator and the check both refuse
// a story or scenario the kit has none of. A view's id is the views module's,
// which only the browser loads, so the preview's controller checks that one.

import { sanitize } from './lib/naming.js';
import type {
  PreviewLandingConfiguration,
  ResolvedStory,
} from './lib/types.js';

/** The id of the synthetic scenario that renders a story with no content. */
const EMPTY_SCENARIO_ID = 'empty';

/**
 * What is wrong with the landing entry a kit names, against its stories:
 * a component with no story, or a scenario the story does not have. A
 * view's id is not checked here. Empty when the entry is sound or unset.
 *
 * @param landing - The kit's `preview.landing`.
 * @param stories - The kit's browseable stories: omitted components and those
 *   that are not standalone left out.
 * @returns One message per problem.
 * @example
 * ```ts
 * landingProblems({ component: 'components-button', scenario: 'primary' }, stories);
 * ```
 */
export function landingProblems(
  landing: PreviewLandingConfiguration | undefined,
  stories: readonly ResolvedStory[]
): string[] {
  if (!landing || !('component' in landing)) return [];
  const story = stories.find(
    (candidate) => sanitize(candidate.title) === landing.component
  );
  if (!story)
    return [
      `preview.landing names component '${landing.component}', which has no story; a story's id is the one the preview's address carries as component=`,
    ];
  const scenario = landing.scenario;
  if (scenario === undefined) return [];
  const hasContent =
    story.contentSlots.default || story.contentSlots.named.length > 0;
  const scenarios = [
    ...(hasContent ? [EMPTY_SCENARIO_ID] : []),
    ...story.scenarios.map((candidate) => candidate.id),
  ];
  return scenarios.includes(scenario)
    ? []
    : [
        `preview.landing names scenario '${scenario}' of '${landing.component}', which has ${
          scenarios.length > 0
            ? `the scenarios ${scenarios.join(', ')}`
            : 'no scenarios'
        }`,
      ];
}
