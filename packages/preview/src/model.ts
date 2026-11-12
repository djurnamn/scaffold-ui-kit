// Build the framework-agnostic ResolvedStory for one component: merge prop-derived
// propTypes with the story file (controls, prop defaults, slots, scenarios, omit).

import {
  isEventType,
  relayedBindingsOf,
  twoWayBindingsOf,
} from '@js-template-engine/core';

import { propTypeForProp, defaultPropForProp } from './prop-types.js';
import { isStructurallyOmitted } from './story.js';
import { collectSlotComponents } from './lib/slot-fill.js';
import { EMPTY_SCENARIO_ID, sanitize, scenarioStoryId } from './lib/naming.js';
import { isVoidElement } from './lib/void-elements.js';
import { ALL_TARGETS } from './lib/types.js';
import type {
  PropTypeSpecification,
  EnumeratedComponent,
  JsonValue,
  Scenario,
  SlotFill,
  SlotPlan,
  Story,
  PreviewBinding,
  ResolvedStory,
  PreviewPropType,
  PreviewControlHints,
  PreviewLabels,
  Target,
} from './lib/types.js';

/** The category a component without a story file `category` sits in. */
export const DEFAULT_CATEGORY = 'Components';

/**
 * The two-way props a component's template declares, in prop order: each
 * `bindable` object's prop, copy form or relayed, the props it names, and
 * whether a Vue consumer binds it with a bare `v-model`. A component written
 * by hand declares none.
 *
 * @param component - The enumerated component.
 * @returns The bindings.
 */
export function bindingsOf(component: EnumeratedComponent): PreviewBinding[] {
  const template = component.template;
  if (!template || Array.isArray(template) || !template.props) return [];
  const vue: unknown = template.extensions?.['vue'];
  const vueModel =
    typeof vue === 'object' && vue !== null
      ? (vue as { model?: unknown }).model
      : undefined;
  const order = Object.keys(template.props);
  return [
    ...twoWayBindingsOf(template.props).map((binding) => ({
      prop: binding.prop,
      ...(binding.defaultProp !== undefined
        ? { defaultProp: binding.defaultProp }
        : {}),
      changeProp: binding.changeProp,
    })),
    ...relayedBindingsOf(template.props).map((binding) => ({
      prop: binding.prop,
      changeProp: binding.changeProp,
    })),
  ]
    .sort(
      (first, second) => order.indexOf(first.prop) - order.indexOf(second.prop)
    )
    .map(({ changeProp, ...binding }) => ({
      ...binding,
      ...(changeProp !== undefined ? { changeProp } : {}),
      ...(vueModel === binding.prop ? { vueModel: true } : {}),
      ...(template.typeParameters?.length ? { generic: true } : {}),
    }));
}

/**
 * The values a prop's scenarios should cover: each select option and each
 * boolean value other than the prop's default (a select's `false` too only
 * when the prop has one), for every included select and
 * boolean control. Shared by scenario generation and the check's coverage.
 */
export function scenarioValues(
  propTypes: readonly PropTypeSpecification[],
  defaultProps: Record<string, JsonValue>
): Array<{ prop: string; value: string | boolean }> {
  const values: Array<{ prop: string; value: string | boolean }> = [];
  for (const propType of propTypes) {
    if (!propType.include) continue;
    const current = defaultProps[propType.name];
    if (propType.control === 'boolean') {
      values.push({ prop: propType.name, value: current !== true });
    } else if (propType.control === 'select') {
      for (const option of propType.options ?? []) {
        // As for a toggle, `false` is no departure from a prop left unset.
        if (
          option !== undefined &&
          option !== current &&
          !(option === false && current === undefined)
        )
          values.push({ prop: propType.name, value: option });
      }
    }
  }
  return values;
}

/** Whether a story file's `generate` lets this prop generate scenarios. */
export function generatesProp(
  generate: Story['generate'],
  prop: string
): boolean {
  if (generate === undefined) return true;
  if (generate === false) return false;
  if (Array.isArray(generate)) return generate.includes(prop);
  return !generate.exclude.includes(prop);
}

/** The keys a story file sets. */
const STORY_KEYS = [
  'omit',
  'standalone',
  'unlisted',
  'category',
  'label',
  'defaultProps',
  'controls',
  'fixed',
  'generate',
  'slots',
  'around',
  'scenarios',
  'options',
] as const satisfies readonly (keyof Story)[];

/** What to write for a key a story file does not take, where one thing is meant. */
const STORY_KEY_REPLACEMENTS: ReadonlyMap<string, string> = new Map([
  ['partial', 'standalone: false'],
  ['description', 'description on the template'],
]);

/** The keys a curated scenario may set. */
const CURATED_SCENARIO_KEYS: ReadonlySet<string> = new Set([
  'id',
  'label',
  'description',
  'props',
  'slots',
  'options',
  'default',
]);

/**
 * The component of the first element fill, at any depth of a fill tree,
 * that fills its default slot through `slots.default` rather than
 * `children`, or `undefined` when none does.
 */
function elementFillSettingDefaultSlot(
  fill: SlotFill | undefined
): string | undefined {
  if (!fill || typeof fill !== 'object' || Array.isArray(fill))
    return undefined;
  if (fill.kind === 'element') {
    if (fill.slots && 'default' in fill.slots) return fill.component;
    for (const nested of [...Object.values(fill.slots ?? {}), fill.children]) {
      const found = elementFillSettingDefaultSlot(nested);
      if (found !== undefined) return found;
    }
  } else if (fill.kind === 'html') {
    return elementFillSettingDefaultSlot(fill.children);
  } else if (fill.kind === 'fragment') {
    for (const child of fill.children ?? []) {
      const found = elementFillSettingDefaultSlot(child);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/**
 * The tag of the first html fill, at any depth of a fill tree, that gives a
 * void element (img, input, br) children, or `undefined` when none does.
 */
function voidElementWithChildren(
  fill: SlotFill | undefined
): string | undefined {
  if (!fill || typeof fill !== 'object' || Array.isArray(fill))
    return undefined;
  if (fill.kind === 'html') {
    if (fill.children !== undefined && isVoidElement(fill.tag)) return fill.tag;
    return voidElementWithChildren(fill.children);
  }
  if (fill.kind === 'element') {
    for (const nested of [...Object.values(fill.slots ?? {}), fill.children]) {
      const found = voidElementWithChildren(nested);
      if (found !== undefined) return found;
    }
  } else if (fill.kind === 'fragment') {
    for (const child of fill.children ?? []) {
      const found = voidElementWithChildren(child);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** The id a generated scenario takes: `<prop>-<value>`, or the prop for a
 *  boolean turned on, unless that is the preview's own Empty scenario's id,
 *  which a boolean named `empty` takes as `empty-true`. A curated scenario
 *  with this id replaces it. */
export function generatedScenarioId(
  prop: string,
  value: string | boolean
): string {
  if (value === true) return prop === EMPTY_SCENARIO_ID ? `${prop}-true` : prop;
  return `${prop}-${String(value)}`;
}

/** The default label of a generated scenario: `prop: value`, or the bare prop
 *  for a boolean turned on. */
function defaultGeneratedLabel(prop: string, value: string | boolean): string {
  return value === true ? prop : `${prop}: ${String(value)}`;
}

/** Whether a scenario sets exactly one prop, to this value. */
function setsOnly(scenario: Scenario, prop: string, value: JsonValue): boolean {
  const entries = Object.entries(scenario.props ?? {});
  return (
    entries.length === 1 && entries[0][0] === prop && entries[0][1] === value
  );
}

/**
 * One scenario per value `scenarioValues` lists, narrowed by the story file's
 * `generate`, skipping a value a curated scenario already sets alone, and any
 * id a curated scenario already uses: that scenario replaces the generated one.
 * Labeled by the kit's `generatedScenario`, or `prop: value` and the bare prop
 * for a boolean turned on.
 */
function generateScenarios(
  propTypes: readonly PropTypeSpecification[],
  defaultProps: Record<string, JsonValue>,
  story: Story | undefined,
  labels: PreviewLabels
): Scenario[] {
  const generate = story?.generate;
  if (generate === false) return [];
  const curated = story?.scenarios ?? [];
  const takenIds = new Set(curated.map((scenario) => scenario.id));
  const label = labels.generatedScenario ?? defaultGeneratedLabel;
  const scenarios: Scenario[] = [];
  for (const { prop, value } of scenarioValues(propTypes, defaultProps)) {
    if (!generatesProp(generate, prop)) continue;
    if (curated.some((scenario) => setsOnly(scenario, prop, value))) continue;
    const id = generatedScenarioId(prop, value);
    if (takenIds.has(id)) continue;
    takenIds.add(id);
    scenarios.push({
      id,
      label: label(prop, value),
      props: { [prop]: value },
      generated: true,
    });
  }
  return scenarios;
}

/**
 * Resolve the story of one component: its controls, default props,
 * scenarios, slot content and the targets it renders in.
 *
 * @param component - The enumerated component.
 * @param story - The component's story file, when it has one.
 * @param hints - The kit's control hints.
 * @param labels - The kit's preview labels.
 * @param omitPattern - Component names matching it get no story.
 * @param kitTargets - The scripted targets the kit builds; the component's own
 *   targets are narrowed to them.
 * @returns The resolved story.
 */
export function resolveStory(
  component: EnumeratedComponent,
  story: Story | undefined,
  hints: PreviewControlHints = {},
  labels: PreviewLabels = {},
  omitPattern?: RegExp,
  kitTargets: readonly Target[] = ALL_TARGETS
): ResolvedStory {
  const omit =
    (story?.omit ?? false) ||
    isStructurallyOmitted(component.name, omitPattern);
  // A component that is not standalone (a compound's part, a shared building
  // block) stays in the manifest for the editor but gets no story - set on the
  // story file (templates) or the manual spec (hand-written components).
  const standalone =
    (story?.standalone ?? true) && (component.standalone ?? true);
  // An unlisted story is generated as any other, only left out of what a
  // reader browses; a component with no story of its own has nothing to hide.
  const unlisted =
    ((story?.unlisted ?? false) || (component.unlisted ?? false)) &&
    !omit &&
    standalone;

  // propTypes from props, then story file control overrides (false disables).
  const propTypes: PreviewPropType[] = [];
  for (const [propName, def] of Object.entries(component.props)) {
    let propType = propTypeForProp(component.name, propName, def, hints);
    if (def.description)
      propType = { ...propType, description: def.description };
    const override = story?.controls?.[propName];
    if (override === false) propType = { ...propType, include: false };
    else if (override) propType = { ...propType, ...override };
    // A fixed prop is always passed and never shown.
    if (story?.fixed && propName in story.fixed)
      propType = { ...propType, include: false };
    propTypes.push({
      ...propType,
      declaredType: def.type,
      required: def.required === true,
      ...(def.default !== undefined ? { declaredDefault: def.default } : {}),
      ...(def.documentedDefault !== undefined
        ? { documentedDefault: def.documentedDefault }
        : {}),
    });
  }

  // default props: template defaults + size config, then story file defaultProps.
  const defaultProps: Record<string, JsonValue> = {};
  // The values the preview starts a prop from that a consumer never writes:
  // a hint's, for a prop the component gives no default and the story file
  // leaves alone.
  const previewDefaults: Record<string, JsonValue> = {};
  for (const [propName, def] of Object.entries(component.props)) {
    const value = defaultPropForProp(component.name, propName, def, hints);
    if (value !== undefined) defaultProps[propName] = value;
    if (
      value !== undefined &&
      def.default === undefined &&
      !(propName in (story?.defaultProps ?? {})) &&
      !(propName in (story?.fixed ?? {}))
    )
      previewDefaults[propName] = value;
  }
  // A component with a default slot gets visible placeholder text - but only
  // when the story file declares no slot plan at all. A story file that curates any
  // slot (a named fill, an explicit default) owns the slot story: injecting
  // children beside a named fill fabricates a mount no consumer writes.
  // `slots: {}` forces a genuinely slotless mount. A default slot that
  // exposes values gets none either: its content is a function of those
  // values (React calls `children(scope)`), so text there is a mount no
  // consumer writes, and the slot's fallback renders instead.
  if (
    component.hasDefaultSlot &&
    !component.defaultSlotScoped &&
    !story?.slots &&
    defaultProps.children === undefined
  ) {
    defaultProps.children = component.name;
    // The preview's own, which a consumer's source leaves out, unless the
    // story file gives the slot text of its own.
    if (
      !('children' in (story?.defaultProps ?? {})) &&
      !('children' in (story?.fixed ?? {}))
    )
      previewDefaults.children = component.name;
  }
  Object.assign(defaultProps, story?.defaultProps ?? {}, story?.fixed ?? {});

  // A named slot spelled flat (`slots: { header: ... }` instead of
  // `slots: { named: { header: ... } }`) would silently never render - the
  // emitters read only `default` and `named`. Fail loudly instead. A
  // scenario's own slots are a plan of the same shape.
  const slotPlans: Array<[string, SlotPlan | undefined]> = [
    ['', story?.slots],
    ...(story?.scenarios ?? [])
      .filter((scenario) => scenario.generated !== true)
      .map((scenario): [string, SlotPlan | undefined] => [
        `scenario '${scenario.id}': `,
        scenario.slots,
      ]),
  ];
  for (const [where, plan] of slotPlans) {
    if (plan === undefined) continue;
    if (typeof plan !== 'object' || plan === null || Array.isArray(plan)) {
      throw new Error(
        `${component.name}: ${where}slots must be a slot plan, { default, named }`
      );
    }
    const unknownSlotKeys = Object.keys(plan).filter(
      (key) => key !== 'default' && key !== 'named'
    );
    if (unknownSlotKeys.length > 0) {
      throw new Error(
        `${component.name}: ${where}unknown slot-plan key(s) ${unknownSlotKeys.join(', ')} - ` +
          `named slots go under "named": { slots: { named: { ... } } }.`
      );
    }
  }
  const planFills = slotPlans.flatMap(([, plan]) => [
    plan?.default,
    ...Object.values(plan?.named ?? {}),
  ]);

  // `around` holds the content before and after the component, and a scoped
  // fill has no slot there to give it values.
  const around: unknown = story?.around;
  if (around !== undefined) {
    if (typeof around !== 'object' || around === null || Array.isArray(around))
      throw new Error(
        `${component.name}: around must be { before, after }, each a fill`
      );
    const unknownAroundKeys = Object.keys(around).filter(
      (key) => key !== 'before' && key !== 'after'
    );
    if (unknownAroundKeys.length > 0)
      throw new Error(
        `${component.name}: unknown around key(s) ${unknownAroundKeys.join(', ')} - around takes before and after`
      );
    for (const [where, fill] of Object.entries(around) as Array<
      [string, SlotFill | undefined]
    >) {
      if (fill?.kind === 'scoped')
        throw new Error(
          `${component.name}: around.${where} is a scoped fill, which takes values from a slot; beside the component there is none`
        );
    }
  }
  const aroundFills = [story?.around?.before, story?.around?.after];

  // The composed component's default slot takes an element fill's
  // `children`; `slots` names its named slots only. A `default` there would
  // otherwise reach the emitters as a slot named `default`, which Svelte
  // refuses as a reserved word.
  for (const fill of [...planFills, ...aroundFills]) {
    const filled = elementFillSettingDefaultSlot(fill);
    if (filled !== undefined) {
      throw new Error(
        `${component.name}: the element fill of '${filled}' sets slots.default - its default slot takes children`
      );
    }
  }

  // A void element renders self-closed, so children on one would be dropped
  // in one framework and refused by another's compiler.
  for (const fill of [...planFills, ...aroundFills]) {
    const tag = voidElementWithChildren(fill);
    if (tag !== undefined) {
      throw new Error(
        `${component.name}: the html fill <${tag}> has children - ${tag} is a void element and takes none`
      );
    }
  }

  // A story file sets only what a story holds; a key the preview does not
  // read would otherwise change nothing without a word.
  const unknownStoryKey = Object.keys(story ?? {}).find(
    (key) => !(STORY_KEYS as readonly string[]).includes(key)
  );
  if (unknownStoryKey !== undefined) {
    const replacement = STORY_KEY_REPLACEMENTS.get(unknownStoryKey);
    throw new Error(
      `${component.name}: story sets unknown key '${unknownStoryKey}' - ${
        replacement === undefined
          ? `a story sets ${STORY_KEYS.join(', ')}`
          : `use ${replacement}`
      }`
    );
  }

  // A curated scenario sets only what a scenario holds. The scenarios the
  // preview generates itself reach the model beside them, marked
  // `generated`, and are not the story file's to check.
  for (const scenario of story?.scenarios ?? []) {
    if (scenario.generated === true) continue;
    if (scenario.id === EMPTY_SCENARIO_ID)
      throw new Error(
        `${component.name}: scenario id '${EMPTY_SCENARIO_ID}' is the preview's own Empty scenario's; give the scenario another id`
      );
    const unknownKey = Object.keys(scenario).find(
      (key) => !CURATED_SCENARIO_KEYS.has(key)
    );
    if (unknownKey !== undefined) {
      throw new Error(
        `${component.name}: scenario '${scenario.id}' sets unknown key '${unknownKey}' - a scenario sets ${[...CURATED_SCENARIO_KEYS].join(', ')}`
      );
    }
  }

  // A scenario's description is text for a shell to show, and its options
  // are option values by id; anything else is a story file mistake that would
  // otherwise reach the catalog unnoticed. Whether each names one of the
  // kit's options is the check's to say, which reads the kit's options.
  for (const scenario of story?.scenarios ?? []) {
    if (
      scenario.description !== undefined &&
      typeof scenario.description !== 'string'
    ) {
      throw new Error(
        `${component.name}: scenario '${scenario.id}' has a description that is not a string.`
      );
    }
    const options: unknown = scenario.options;
    if (
      options !== undefined &&
      (typeof options !== 'object' ||
        options === null ||
        Array.isArray(options) ||
        Object.values(options).some(
          (value) => typeof value !== 'string' && typeof value !== 'boolean'
        ))
    ) {
      throw new Error(
        `${component.name}: scenario '${scenario.id}' has options that are not option values by id, each a string or a boolean.`
      );
    }
  }

  // slot components to import
  const slotComponentSet = new Set<string>();
  try {
    // A scenario's own content is imported with the story's: one module
    // per target holds them all.
    for (const fill of planFills) collectSlotComponents(fill, slotComponentSet);
    for (const fill of aroundFills)
      collectSlotComponents(fill, slotComponentSet);
  } catch (error) {
    // Name the component so a bad story file is findable without a bisect.
    throw new Error(`${component.name}: ${(error as Error).message}`, {
      cause: error,
    });
  }

  return {
    name: component.name,
    ...(component.description !== undefined
      ? { description: component.description }
      : {}),
    title: `${story?.category ?? labels.category ?? DEFAULT_CATEGORY}/${story?.label ?? component.name}`,
    omit,
    standalone,
    unlisted,
    propTypes,
    events: propTypes
      .filter((propType) => isEventType(propType.declaredType))
      .map((propType) => propType.name),
    bindings: bindingsOf(component),
    defaultProps,
    ...(Object.keys(previewDefaults).length > 0 ? { previewDefaults } : {}),
    slots: story?.slots,
    ...(story?.around ? { around: story.around } : {}),
    scenarios: [
      ...(story?.scenarios ?? []),
      ...generateScenarios(propTypes, defaultProps, story, labels),
    ],
    slotComponents: [...slotComponentSet],
    contentSlots: {
      default: component.hasDefaultSlot,
      named: component.slotNames,
      ...(component.scopeRequiredSlots?.length
        ? { scopeRequired: component.scopeRequiredSlots }
        : {}),
    },
    options: story?.options,
    targets: (component.targets ?? ALL_TARGETS).filter((target) =>
      kitTargets.includes(target)
    ),
  };
}
