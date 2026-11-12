// Emit the framework-neutral host manifest (manifest.json): the nav list, the
// per-component controls (propTypes/defaultProps/scenarios), and the shared color
// token list for color-select controls. Custom views own their data outside
// this manifest, so it privileges no single view.

import { sanitize, scenarioStoryId } from '../lib/naming.js';
import { scenarioSlotPlan } from '../lib/scenario-story.js';
import { ALL_TARGETS } from '../lib/types.js';
import type {
  ContentSlots,
  JsonValue,
  PreviewLabels,
  PreviewLandingConfiguration,
  PreviewPaneWidth,
  PreviewPersistence,
  Scenario,
  SlotPlan,
  StoryAround,
  PreviewBinding,
  ResolvedStory,
  PreviewPropType,
  Target,
} from '../lib/types.js';
import type { PreviewTarget } from '../protocol.js';
import type { ViewFramework } from '../views.js';

export interface ManifestComponent {
  id: string;
  name: string;
  title: string;
  /** What the component is, from its template. Absent when it has none. */
  description?: string;
  category: string;
  /** Each prop's control and its declaration (type as written, whether it is
   *  required, the component's own default). */
  propTypes: PreviewPropType[];
  /** The props that are events: functions returning nothing, which the
   *  component calls as things happen. Absent when there are none. */
  events?: string[];
  /** The component's two-way props. Absent when there are none. */
  bindings?: PreviewBinding[];
  defaultProps: Record<string, JsonValue>;
  /** The values in `defaultProps` the preview starts from on its own (a kit
   *  hint's), which a consumer's source leaves out. Absent when there are none. */
  previewDefaults?: Record<string, JsonValue>;
  scenarios: {
    id: string;
    label: string;
    /** What the scenario shows, from the story file. Absent when it has none. */
    description?: string;
    props: Record<string, JsonValue>;
    /** The option values picking the scenario sets. Absent when it sets none. */
    options?: Record<string, string | boolean>;
    default?: boolean;
    generated?: boolean;
    /** The slot content the scenario shows, when it has content of its own:
     *  its fills over the story's. Absent when it shows the story's. */
    content?: SlotPlan;
    /** The id the panes mount the scenario's story by, when it has content
     *  of its own. Absent when the panes mount the component's story. */
    story?: string;
  }[];
  /** The slots this component accepts - the editor's add-content targets. */
  slots: ContentSlots;
  /** `false` for a component with no story of its own: present for the
   *  editor's picker, hidden from the story navigation (see
   *  Story.standalone). Absent ⇒ a normal browseable story. */
  standalone?: boolean;
  /** A story reachable at its address but left out of the navigation, the
   *  editor's picker and the counts (see Story.unlisted). Absent ⇒ listed. */
  unlisted?: boolean;
  /** The story file's curated slot content, so the per-story editor seeds its tree
   *  from what the browse view already renders. Absent
   *  when the component has no story file slot plan. */
  content?: SlotPlan;
  /** The content the story renders beside the component (see Story.around).
   *  Absent when it has none. */
  around?: StoryAround;
  /** Per-story preview-option defaults / availability (see Story.options). Absent
   *  when the component curates none. */
  options?: Record<string, JsonValue | false>;
  /** The preview source this component belongs to (`ManifestSource.id`). The host groups
   *  the navigation by source; core components are `'core'`. */
  source: string;
  /** The targets this component renders into, within the kit's own. The host shows
   *  a pane + toggle per kit target and disables the rest; a React-only fixture of
   *  another package's components lists just `react`. */
  targets: Target[];
}

/** A navigation source - the kit's own components or another package's. The host renders one
 *  collapsible section per source, in `order`, its `label` the heading. */
export interface ManifestSource {
  id: string;
  label: string;
  order: number;
  /** The package the source's components import from, per target
   *  `<moduleBase>/<target>`, or `<moduleBase>` with `{target}` replaced by
   *  the target when it names one. */
  moduleBase?: string;
}

/** How a consumer imports one of the kit's components. */
export interface ManifestImport {
  /** The name the component is exported under. */
  exportName: string;
  /** The names it declares that React would otherwise respell (`class`,
   *  `style`, an attribute React renames, such as `tabindex`), which React
   *  takes as they are; any other attribute a story gives it is spelled as
   *  React takes it. Absent when it declares none. */
  declaredAttributes?: string[];
  /** The module it is imported from, per target the kit builds. */
  modules: Partial<Record<Target, string>>;
  /** The type names its module exports, per target the kit builds, which
   *  the module a consumer imports it from exports too. Absent where it
   *  exports none. */
  types?: Partial<Record<Target, string[]>>;
}

export interface Manifest {
  /** The kit's name (the kit configuration's `name`) - the host's kit selector. */
  kitName: string;
  /** The kit's version (its package.json `version`) - the host's version label. */
  kitVersion?: string;
  colorOptions: (string | null)[];
  /** What the kit builds that the host offers a pane for, and for these
   *  alone: its targets, and `html` when it builds html. */
  targets: PreviewTarget[];
  /** The sources, for the navigation's per-source sections (ordered by the host). */
  sources: ManifestSource[];
  /** The kit's own code block, when it names one: the framework it mounts
   *  with. A shell mounts it in place of its own code view. */
  codeBlock?: { framework: ViewFramework };
  components: ManifestComponent[];
  /** How a consumer imports each of the kit's components, by name: every
   *  component, those with no story of their own included, so a story's
   *  source can import what its slot content names. */
  imports?: Record<string, ManifestImport>;
  /** The host's own copy (the synthetic empty scenario's label), in the kit's casing. */
  labels: { emptyScenario: string };
  /** Where the host remembers what a person chose (`preview.persistence`).
   *  Absent means `'url'`. */
  persistence?: PreviewPersistence;
  /** The widths a shell offers to lay the story panes out at
   *  (the configuration module's `previewPaneWidths`). Absent means the preview's own. */
  paneWidths?: PreviewPaneWidth[];
  /** The mode the kit builds its Svelte target in (`svelte.mode`), which a
   *  story's Svelte source follows. Absent means `legacy`. */
  svelteMode?: 'legacy' | 'runes';
  /** The entry the host opens on when its address names none
   *  (`preview.landing`). Absent means the first listed story. */
  landing?: PreviewLandingConfiguration;
  /** How React spells the HTML attributes it renames (`tabindex` as
   *  `tabIndex`), by their HTML names, which a story's React source spells
   *  a component's attributes with. */
  reactAttributeNames?: Record<string, string>;
}

function manifestComponent(model: ResolvedStory): ManifestComponent {
  return {
    id: sanitize(model.title),
    name: model.name,
    title: model.title,
    ...(model.description !== undefined
      ? { description: model.description }
      : {}),
    category: model.title.split('/').slice(0, -1).join('/'),
    propTypes: model.propTypes,
    ...(model.events?.length ? { events: model.events } : {}),
    ...(model.bindings?.length ? { bindings: model.bindings } : {}),
    defaultProps: model.defaultProps,
    ...(model.previewDefaults
      ? { previewDefaults: model.previewDefaults }
      : {}),
    scenarios: model.scenarios.map((scenario: Scenario) => ({
      id: scenario.id,
      label: scenario.label ?? scenario.id,
      ...(scenario.description !== undefined
        ? { description: scenario.description }
        : {}),
      props: scenario.props ?? {},
      ...(scenario.options !== undefined &&
      Object.keys(scenario.options).length > 0
        ? { options: scenario.options }
        : {}),
      ...(scenario.default ? { default: true } : {}),
      ...(scenario.generated ? { generated: true } : {}),
      ...(scenario.slots === undefined
        ? {}
        : {
            content: scenarioSlotPlan(model.slots, scenario.slots) ?? {},
            story: scenarioStoryId(sanitize(model.title), scenario.id),
          }),
    })),
    slots: model.contentSlots,
    source: model.source ?? 'core',
    targets: model.targets,
    ...(model.slots ? { content: model.slots } : {}),
    ...(model.around ? { around: model.around } : {}),
    ...(model.standalone ? {} : { standalone: false as const }),
    ...(model.unlisted ? { unlisted: true } : {}),
    ...(model.options ? { options: model.options } : {}),
  };
}

export function buildManifest(
  models: ResolvedStory[],
  sources: ManifestSource[],
  colorTokens: (string | null | undefined)[] = [],
  kitName = 'kit',
  labels: PreviewLabels = {},
  kitVersion?: string,
  persistence: PreviewPersistence = 'url',
  targets: PreviewTarget[] = ALL_TARGETS,
  imports?: Record<string, ManifestImport>,
  codeBlock?: { framework: ViewFramework },
  paneWidths?: PreviewPaneWidth[],
  svelteMode?: 'legacy' | 'runes',
  reactAttributeNames?: Readonly<Record<string, string>>,
  landing?: PreviewLandingConfiguration
): Manifest {
  return {
    kitName,
    ...(kitVersion ? { kitVersion } : {}),
    targets,
    // JSON has no `undefined`; the unset color option serializes to null.
    colorOptions: colorTokens.map((colorToken) => colorToken ?? null),
    sources,
    components: models.map(manifestComponent),
    ...(imports ? { imports } : {}),
    ...(codeBlock ? { codeBlock } : {}),
    labels: { emptyScenario: labels.emptyScenario ?? 'Empty' },
    persistence,
    ...(paneWidths ? { paneWidths } : {}),
    ...(svelteMode ? { svelteMode } : {}),
    ...(reactAttributeNames
      ? { reactAttributeNames: { ...reactAttributeNames } }
      : {}),
    ...(landing ? { landing: { ...landing } } : {}),
  };
}
