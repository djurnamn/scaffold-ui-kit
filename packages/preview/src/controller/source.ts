// A story's source printed in the browser from the catalog: the code a
// consumer writes per target, importing from the kit's package entries,
// with the props a person sets and the slot content the story or the editor's
// tree holds. The printers are pure, so the source follows every change
// without a round trip; the html source, which renders the kit's templates,
// is the server's (html-source.ts). Browser-safe.

import {
  inDeclarationOrder,
  SOURCE_PRINTERS,
  type SourceBinding,
  type SourceStory,
} from '../emit/source.js';
import { collectSlotComponents } from '../lib/slot-fill.js';
import { moduleOfSource } from '../lib/module-of-source.js';
import type { JsonValue, SlotFill, StoryAround } from '../lib/types.js';
import type { PreviewScriptedTarget } from '../protocol.js';
import {
  defaultScenarioId,
  type PreviewCatalog,
  type PreviewComponent,
  type PreviewScenario,
  type PreviewStoryReference,
} from './catalog.js';
import { cleanRecord, toPayload, type EditorState } from './editor-tree.js';

/** A story's source, by scripted target: what a consumer writes. */
export type PreviewTargetCode = Partial<Record<PreviewScriptedTarget, string>>;

/** A story resolved for printing: its component, the props to print and its
 *  slot content. */
export interface ResolvedSourceStory {
  /** The root component's name. */
  component: string;
  /** The props a consumer writes: those that differ from what the component
   *  and the preview start from. */
  props: Record<string, JsonValue>;
  /** Default-slot content. */
  children?: SlotFill;
  /** Named-slot content, by slot name. */
  named: Record<string, SlotFill>;
  /** The content beside the component, as its siblings. */
  around?: StoryAround;
  /** The two-way props the story gives, which the printed source binds to
   *  state of its own. Absent when it gives none. */
  bindings?: SourceBinding[];
}

/** The catalog fields the printing reads. */
export type SourceCatalog = Pick<
  PreviewCatalog,
  'imports' | 'sources' | 'kitName'
> &
  Partial<Pick<PreviewCatalog, 'svelteMode' | 'reactAttributeNames'>>;

function withoutUndefined(
  props: Record<string, unknown>
): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  for (const [name, value] of Object.entries(props))
    if (value !== undefined) out[name] = value as JsonValue;
  return out;
}

/**
 * Whether a story's default-slot text is the component's name the preview
 * shows in a default slot the story leaves unfilled, which a consumer never
 * writes: the preview's own starting text, while the scenario does not give
 * `children` itself.
 */
export function isPlaceholder(
  component: PreviewComponent,
  text: string,
  input: { scenario?: PreviewScenario }
): boolean {
  return (
    component.previewDefaults.children === text &&
    !('children' in (input.scenario?.props ?? {}))
  );
}

/**
 * Resolve what a story's source prints. Without a tree, the slot content is
 * the story's own and a string `children` is its default-slot text; with the
 * editor's tree, the root's props and content are the tree's. A prop is left
 * out while it holds the component's declared default, or the preview's own
 * starting value that the scenario does not set, as is the component's name
 * the preview shows in a default slot the story leaves unfilled.
 */
export function resolveSourceStory(
  component: PreviewComponent,
  input: {
    props: Record<string, unknown>;
    scenario?: PreviewScenario;
    tree?: EditorState;
  }
): ResolvedSourceStory {
  let props: Record<string, JsonValue>;
  let children: SlotFill | undefined;
  let named: Record<string, SlotFill>;
  if (input.tree) {
    const payload = toPayload(input.tree);
    const { children: _children, ...rootProps } = input.props;
    props = cleanRecord(rootProps);
    children = payload.slots?.default;
    named = payload.slots?.named ?? {};
  } else {
    const { children: text, ...rest } = input.props;
    props = withoutUndefined(rest);
    // A scenario with content of its own shows that in place of the story's.
    const content = input.scenario?.content ?? component.content;
    children =
      content?.default ??
      (typeof text === 'string' && !isPlaceholder(component, text, input)
        ? { kind: 'text', value: text }
        : undefined);
    named = content?.named ?? {};
  }
  const declared = new Map(
    component.propTypes.map((propType) => [propType.name, propType])
  );
  const scenarioProps = input.scenario?.props ?? {};
  for (const [name, value] of Object.entries(props)) {
    const declaredDefault = declared.get(name)?.declaredDefault;
    const previewDefault = component.previewDefaults[name];
    if (
      (declaredDefault !== undefined &&
        JSON.stringify(declaredDefault) === JSON.stringify(value)) ||
      (previewDefault !== undefined &&
        !(name in scenarioProps) &&
        JSON.stringify(previewDefault) === JSON.stringify(value))
    )
      delete props[name];
  }
  props = inDeclarationOrder(
    props,
    component.propTypes.map((propType) => propType.name)
  );
  // A two-way prop the story gives is controlled: its source binds it.
  const bindings = (component.bindings ?? [])
    .filter((binding) => binding.prop in props)
    .map((binding) => {
      const declaredType = declared.get(binding.prop)?.declaredType;
      return {
        prop: binding.prop,
        ...(binding.changeProp !== undefined
          ? { changeProp: binding.changeProp }
          : {}),
        ...(binding.defaultProp !== undefined
          ? { defaultProp: binding.defaultProp }
          : {}),
        ...(binding.vueModel ? { vueModel: true } : {}),
        ...(binding.generic ? { generic: true } : {}),
        ...(declaredType !== undefined ? { declaredType } : {}),
      };
    });
  // The content beside the component is the story's, with or without the
  // editor's tree: no edit reaches it.
  const around = component.around;
  return {
    component: component.name,
    props,
    ...(children ? { children } : {}),
    named,
    ...(around ? { around } : {}),
    ...(bindings.length > 0 ? { bindings } : {}),
  };
}

/** The import of each component a story names, for one target: its root,
 *  then what its slot content holds, in order. */
function importsFor(
  catalog: SourceCatalog,
  story: ResolvedSourceStory,
  target: PreviewScriptedTarget
): SourceStory['imports'] {
  const names = new Set<string>();
  collectSlotComponents(story.children, names);
  for (const fill of [
    ...Object.values(story.named),
    story.around?.before,
    story.around?.after,
  ])
    collectSlotComponents(fill, names);
  const base = catalog.sources[0]?.moduleBase ?? catalog.kitName;
  const imports: SourceStory['imports'] = new Map();
  for (const name of [story.component, ...names]) {
    if (imports.has(name)) continue;
    const known = catalog.imports[name];
    imports.set(name, {
      module: known?.modules[target] ?? moduleOfSource(base, target),
      exported: known?.exportName ?? name,
      ...(known?.declaredAttributes
        ? { declaredAttributes: known.declaredAttributes }
        : {}),
    });
  }
  return imports;
}

/** The type names the kit's components' modules export, for one target,
 *  each with the module a consumer imports it from: the story's own
 *  component's, then the first other component's to export it. A name a
 *  component is imported under is a value, never a type here. */
function exportedTypesFor(
  catalog: SourceCatalog,
  target: PreviewScriptedTarget,
  component: string
): Map<string, string> {
  const base = catalog.sources[0]?.moduleBase ?? catalog.kitName;
  // A component's own name, or the name it is exported under, is a value.
  const values = new Set(
    Object.entries(catalog.imports).flatMap(([name, known]) => [
      name,
      known.exportName,
    ])
  );
  const types = new Map<string, string>();
  // The story's own component first, so its type wins a name another
  // component's module exports too.
  const own = catalog.imports[component];
  const entries = [
    ...(own ? [own] : []),
    ...Object.entries(catalog.imports)
      .filter(([name]) => name !== component)
      .map(([, known]) => known),
  ];
  for (const known of entries)
    for (const type of known.types?.[target] ?? [])
      if (!types.has(type) && !values.has(type))
        types.set(type, known.modules[target] ?? moduleOfSource(base, target));
  return types;
}

/**
 * Print a resolved story in each of `targets`: a two-way prop it gives
 * bound to state of the source's own, in the catalog's Svelte mode.
 *
 * @param catalog - The catalog the components' imports are read from.
 * @param story - The story, resolved.
 * @param targets - The targets to print.
 * @returns The source per target.
 */
export function printSourceStory(
  catalog: SourceCatalog,
  story: ResolvedSourceStory,
  targets: readonly PreviewScriptedTarget[]
): PreviewTargetCode {
  const sources: PreviewTargetCode = {};
  for (const target of targets) {
    sources[target] = SOURCE_PRINTERS[target]({
      component: story.component,
      props: story.props,
      ...(story.children ? { children: story.children } : {}),
      named: story.named,
      ...(story.around ? { around: story.around } : {}),
      imports: importsFor(catalog, story, target),
      ...(story.bindings ? { bindings: story.bindings } : {}),
      ...(catalog.svelteMode ? { svelteMode: catalog.svelteMode } : {}),
      ...(catalog.reactAttributeNames
        ? { reactAttributeNames: catalog.reactAttributeNames }
        : {}),
      exportedTypes: exportedTypesFor(catalog, target, story.component),
    });
  }
  return sources;
}

/**
 * Print any story of the catalog as the source a consumer writes, per
 * target the component renders in: the component with the props of the
 * scenario over its defaults and `props` over those, its slot content, and
 * imports from the kit's package entry for each target. A prop is left
 * out while it holds the component's declared default. It takes the story
 * reference `frames.mountStory` takes, so a shell can show the code beside a
 * detached pane. The html source is the preview's own (`state.code.html`)
 * and is not printed here.
 *
 * @param catalog - The controller's catalog.
 * @param story - The story: a component's id, a scenario (omitted, the one
 *   the story starts on; `''`, the anonymous default) and props over its own.
 * @returns The source per target, in the component's targets.
 * @throws When the component or the scenario is unknown.
 * @example
 * ```ts
 * const { react } = printStorySource(controller.catalog, { component: 'components-button', scenario: 'ghost' });
 * ```
 */
export function printStorySource(
  catalog: PreviewCatalog,
  story: PreviewStoryReference
): PreviewTargetCode {
  const component = catalog.components.find(
    (candidate) => candidate.id === story.component
  );
  if (!component)
    throw new Error(
      `The catalog has no component "${story.component}" to print.`
    );
  const scenarioId = story.scenario ?? defaultScenarioId(component);
  const scenario = component.scenarios.find(
    (candidate) => candidate.id === scenarioId
  );
  if (scenarioId !== '' && !scenario)
    throw new Error(
      `The story "${component.id}" has no scenario "${scenarioId}".`
    );
  const seeded = { ...component.defaultProps, ...(scenario?.props ?? {}) };
  // The Empty scenario is the story's props with no slot content.
  const props = {
    ...(scenario?.empty ? withoutChildren(seeded) : seeded),
    ...withoutUndefined(story.props ?? {}),
  };
  const resolved = scenario?.empty
    ? resolveSourceStory(component, {
        props,
        scenario,
        tree: {
          root: component.name,
          props: withoutChildren(props),
          slots: {},
        },
      })
    : resolveSourceStory(component, { props, scenario });
  return printSourceStory(catalog, resolved, component.targets);
}

function withoutChildren(
  props: Record<string, unknown>
): Record<string, unknown> {
  const { children: _children, ...rest } = props;
  return rest;
}
