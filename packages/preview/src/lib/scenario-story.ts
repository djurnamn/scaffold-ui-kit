// A scenario with slot content of its own: the plan it shows, and the story
// the generator renders for it beside the component's. The panes render a
// story's slot content as it was generated and take only props at run time,
// so such a scenario is a story of its own in every target's registry.
// Browser-safe: no node imports.

import { sanitize, scenarioStoryId } from './naming.js';
import type { ResolvedStory, Scenario, SlotPlan } from './types.js';

/**
 * The slot plan one scenario of a story shows: the scenario's own fills over
 * the story's, slot by slot. A scenario with no slots of its own shows the
 * story's plan.
 *
 * @param story - The story's plan, if it has one.
 * @param scenario - The scenario's own plan, if it has one.
 * @returns The plan the scenario shows, or `undefined` when neither has one.
 */
export function scenarioSlotPlan(
  story: SlotPlan | undefined,
  scenario: SlotPlan | undefined
): SlotPlan | undefined {
  if (scenario === undefined) return story;
  const named = { ...(story?.named ?? {}), ...(scenario.named ?? {}) };
  const fill = scenario.default ?? story?.default;
  return {
    ...(fill === undefined ? {} : { default: fill }),
    ...(Object.keys(named).length === 0 ? {} : { named }),
  };
}

/**
 * A resolved story as one of its scenarios shows it: with the scenario's
 * slot plan over the story's. A scenario with no slots of its own, or no
 * scenario, shows the story as it is.
 *
 * @param model - The component's resolved story.
 * @param scenario - The scenario, when one is meant.
 * @returns The story to print or render for that scenario.
 */
export function storyOnScenario(
  model: ResolvedStory,
  scenario: Scenario | undefined
): ResolvedStory {
  return scenario?.slots === undefined
    ? model
    : { ...model, slots: scenarioSlotPlan(model.slots, scenario.slots) };
}

/**
 * The stories of a component's scenarios that have slot content of their
 * own: one per such scenario, the component's story with the scenario's
 * plan, under the id the panes mount it by. The panes render a story's slot
 * content as it was generated, so a scenario that changes it is a story
 * beside the component's.
 *
 * @param model - The component's resolved story.
 * @returns The scenario stories, in the scenarios' order; none for a
 *   component whose scenarios set props alone.
 */
export function scenarioStories(model: ResolvedStory): ResolvedStory[] {
  const componentId = sanitize(model.title);
  return model.scenarios.flatMap((scenario, index) => {
    if (scenario.slots === undefined) return [];
    const slots = scenarioSlotPlan(model.slots, scenario.slots);
    // The placeholder text a component with no plan starts from is the
    // preview's own; a scenario that fills the default slot replaces it.
    const withoutPlaceholder = Object.fromEntries(
      Object.entries(model.defaultProps).filter(([name]) => name !== 'children')
    );
    const fillsDefault =
      slots?.default !== undefined &&
      model.previewDefaults?.children !== undefined;
    return [
      {
        ...model,
        ...(fillsDefault ? { defaultProps: withoutPlaceholder } : {}),
        slots,
        scenarioStory: {
          id: scenarioStoryId(componentId, scenario.id),
          renderName: `${model.name}_scenario${index}`,
        },
      },
    ];
  });
}

/**
 * The id a pane mounts a resolved story by: a scenario story's own, or the
 * one derived from the title.
 *
 * @param model - The resolved story.
 * @returns Its id in every target's registry.
 */
export function storyRegistryId(model: ResolvedStory): string {
  return model.scenarioStory?.id ?? sanitize(model.title);
}
