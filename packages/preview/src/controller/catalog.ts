// The catalog a preview controller is created with: everything static about
// the kit being previewed, in the shape a shell reads (a navigation tree, short
// titles, the Empty scenario in place). The preview's bootstrap builds it from
// the generated manifest with `catalogFromManifest`; another producer can build
// one by hand. Browser-safe: no node imports, type-only imports.

import type { Manifest } from '../emit/manifest.js';
import type {
  PreviewBinding,
  PreviewPaneWidth,
  PreviewPropType,
  StoryAround,
} from '../lib/types.js';
import { EMPTY_SCENARIO_ID } from '../lib/naming.js';
import type { OptionValue } from '../options.js';
import {
  PREVIEW_SCRIPTED_TARGETS,
  PREVIEW_TARGETS,
  type PreviewScriptedTarget,
  type PreviewTarget,
} from '../protocol.js';
import type { PreviewView, RenderedView, ViewFramework } from '../views.js';
import {
  DEFAULT_SLOT,
  HTML_TAGS,
  isContainer,
  type EditorNode,
  type EditorState,
  type SlotPlan,
} from './editor-tree.js';

export type { PreviewBinding, PreviewPropType } from '../lib/types.js';

/** One scenario of a component: a named set of root props, and the option
 *  values it shows them under. */
export interface PreviewScenario {
  id: string;
  /** The picker label. */
  label: string;
  /** What the scenario shows, from the component's story file; markdown allowed.
   *  Absent when the story file gives none. */
  description?: string;
  /** The props the scenario lays over the component's defaults. */
  props: Record<string, unknown>;
  /** The option values picking the scenario sets, by option id: the setting
   *  it shows the component in, such as a color mode or a surface. Absent
   *  when it sets none. */
  options?: Record<string, OptionValue>;
  /** The component's baseline: selected first and shown as the default. */
  default?: boolean;
  /** The preview's own Empty scenario: the story's props with no slot content.
   *  Only a component that accepts slot content has one. */
  empty?: boolean;
  /** Generated from one enum value or boolean, listed after the curated ones. */
  generated?: boolean;
  /** The slot content the scenario shows, when its story file gives it
   *  content of its own: its fills over the story's, slot by slot. Absent
   *  when it shows the story's content. */
  content?: SlotPlan;
  /** The id the panes mount the scenario by, when it has content of its
   *  own. The preview's to use: a shell names a scenario by its `id`. */
  story?: string;
}

/** A component of the kit, with its stories' data. */
export interface PreviewComponent {
  /** The story's id, unique across the kit: its title in lower case with
   *  every run of other characters a hyphen, `components-layout-card` for
   *  `Components/Layout/Card`. The selection, the address (`?component=`) and
   *  the testing helpers name the story by it. */
  id: string;
  /** The component's export name, as the editor's tree refers to it. */
  name: string;
  /** What the component is and when to reach for it, from its template's
   *  `description`; markdown allowed. Absent when the template gives none. */
  description?: string;
  /** The full title, the source label included: `Components/Layout/Card`. */
  title: string;
  /** The title without its source label: `Layout/Card`. */
  shortTitle: string;
  /** The source the component belongs to (`PreviewSource.id`). */
  source: string;
  /** Whether the component has a story of its own. One that is not (a
   *  compound's part, a shared building block) is offered to the editor,
   *  not browseable as a story. */
  standalone: boolean;
  /** A story left out of what a reader browses - the navigation, an
   *  editor's component picker, the component count - but generated and
   *  reachable as any other: by its id, at its address, and through the
   *  testing helpers. A shell that lists components leaves these out. */
  unlisted: boolean;
  /** Each prop's control and declaration. */
  propTypes: PreviewPropType[];
  /** The component's events: the props it declares as functions that
   *  return nothing, such as `onSelect: (value: string) => void`, which it
   *  calls as things happen. A function prop that returns something, such as
   *  a `highlight` or a `getPageUrl`, is not one, and is left as given.
   *  A story's panes record each call (`state.events`). */
  events: string[];
  /** The component's two-way props, in prop order. A story that gives one
   *  takes each value its change prop reports, so a click in any pane
   *  changes the story's props (`state.props`), as `actions.setProps`
   *  does. A story that leaves it out lets the component keep its own. */
  bindings: PreviewBinding[];
  /** The props the story starts from: the component's declared defaults,
   *  with the kit's hints and the story file's `defaultProps` over them. */
  defaultProps: Record<string, unknown>;
  /** The values in `defaultProps` the preview starts from on its own, from
   *  the kit's control hints, which neither the component declares nor its
   *  story file sets. A consumer's source leaves a prop out while it holds this
   *  value and the scenario does not set it. */
  previewDefaults: Record<string, unknown>;
  scenarios: PreviewScenario[];
  /** The slots the component accepts content into, and those among them
   *  (`default` for the default slot) whose content must take their scope. */
  slots: { default: boolean; named: string[]; scopeRequired?: string[] };
  /** The curated slot content a story renders with; the editor seeds its tree from it. */
  content?: SlotPlan;
  /** The content the story renders beside the component, as its siblings:
   *  `before` and `after` it. The editor holds it unchanged, outside its root. */
  around?: StoryAround;
  /** Story option defaults, keyed by option id; `false` marks the option unavailable. */
  options?: Record<string, OptionValue | false>;
  /** The targets the component renders in, within the catalog's
   *  `targets`. Html is not listed: where the kit builds html, every
   *  story has an html pane, which says so when the story has no markup. */
  targets: PreviewScriptedTarget[];
}

/** A source: the kit's own components or another package's, in `order`. */
export interface PreviewSource {
  id: string;
  label: string;
  order: number;
  /** The package the source's components are imported from, as
   *  `<moduleBase>/<target>`, or `<moduleBase>` with `{target}` replaced by
   *  the target when it names one, when known. */
  moduleBase?: string;
}

/** How a consumer imports one of the kit's components. */
export interface PreviewImport {
  /** The name the component is exported under. */
  exportName: string;
  /** The names it declares that React would otherwise respell (`class`,
   *  `style`, an attribute React renames, such as `tabindex`), which React
   *  takes as they are; any other attribute a story gives it is spelled as
   *  React takes it. Absent when it declares none. */
  declaredAttributes?: string[];
  /** The module it is imported from, per target the kit builds. */
  modules: Partial<Record<PreviewScriptedTarget, string>>;
  /** The type names its module exports, per target, which the module a
   *  consumer imports it from exports too: a story's source names a prop's
   *  type by one of them. Absent where it exports none. */
  types?: Partial<Record<PreviewScriptedTarget, string[]>>;
}

/** A custom view a kit registers, as the catalog lists it. */
export interface PreviewCatalogView {
  /** The selection id. */
  id: string;
  label: string;
  /** The source whose entries list the view. */
  source: string;
  order: number;
  /** The framework the view mounts with. */
  framework: ViewFramework;
}

/** One entry of the navigation tree: a view, a component story, or a group of entries. */
export type PreviewNavigationNode =
  | { kind: 'view'; id: string; label: string }
  | { kind: 'component'; id: string; label: string; title: string }
  | {
      kind: 'group';
      key: string;
      label: string;
      children: PreviewNavigationNode[];
    };

/**
 * Everything static about a kit's preview. A controller is created with one
 * and never changes it; a shell renders its navigation and reads its
 * components, views and option vocabulary.
 */
export interface PreviewCatalog {
  /** The kit's name. */
  kitName: string;
  /** The kit's package version, when known. */
  kitVersion?: string;
  /** What the kit builds, in order: its targets, then `html` when it
   *  builds html. A shell offers a pane and a toggle for these alone. */
  targets: PreviewTarget[];
  /** The sources, in order; the first is the kit's own. */
  sources: PreviewSource[];
  /** Every component, those with no story of their own and unlisted stories included, with its
   *  scenarios (the Empty one in place). */
  components: PreviewComponent[];
  /** The custom views, in order. */
  views: PreviewCatalogView[];
  /** The kit's own code block, when it names one: the framework it mounts
   *  with. A shell mounts it (`frames.mountCode`) in place of its own code
   *  view. */
  codeBlock?: { framework: ViewFramework };
  /** The navigation tree: the kit's own source hoisted, other sources grouped. */
  navigation: PreviewNavigationNode[];
  /** The plain HTML tags an editor may offer for a wrapper node. */
  htmlTags: string[];
  /** The color tokens a color control offers; `null` is the unset choice. */
  colorTokens: (string | null)[];
  /** The widths a shell offers to lay the story panes out at, besides
   *  fitting them to its own space (`state.paneWidth`), narrowest first:
   *  the kit's `paneWidths`, or `DEFAULT_PANE_WIDTHS`. */
  paneWidths: PreviewPaneWidth[];
  /** The entry the preview opens on when its address names none, as the
   *  kit names it (`landing`); absent, the first listed story. */
  landing?: PreviewLanding;
  /** The mode the kit builds its Svelte target in (`svelte.mode` in
   *  the kit configuration): what a story's Svelte source holds a
   *  bound prop's state in, `$state` in runes mode and a plain `let` in
   *  legacy mode. */
  svelteMode: 'legacy' | 'runes';
  /** How a consumer imports each of the kit's components, by component name,
   *  those with no story of their own included: what a story's source
   *  imports. A component missing here is imported by its own name from the
   *  first source's `moduleBase`. */
  imports: Record<string, PreviewImport>;
  /** How React spells the HTML attributes it renames (`tabindex` as
   *  `tabIndex`, `for` as `htmlFor`), by their HTML names: a story's React
   *  source spells the attributes it gives a component with them. */
  reactAttributeNames: Record<string, string>;
}

/** The manifest fields `catalogFromManifest` reads. */
export type CatalogManifest = Pick<Manifest, 'components'> &
  Partial<
    Pick<
      Manifest,
      | 'kitName'
      | 'kitVersion'
      | 'targets'
      | 'sources'
      | 'colorOptions'
      | 'labels'
      | 'imports'
      | 'codeBlock'
      | 'paneWidths'
      | 'landing'
      | 'svelteMode'
      | 'reactAttributeNames'
    >
  >;

/** The entry the preview opens on when its address names none: a custom
 *  view, or a component's story on one of its scenarios (by id) or, without
 *  one, on its baseline. */
export type PreviewLanding =
  | { kind: 'view'; id: string }
  | { kind: 'component'; id: string; scenario?: string };

/** The widths a shell offers to lay the story panes out at when the kit
 *  names none: a small screen's, a medium one's and a large one's. */
export const DEFAULT_PANE_WIDTHS: readonly PreviewPaneWidth[] = [
  { label: 'small', width: 375 },
  { label: 'medium', width: 768 },
  { label: 'large', width: 1280 },
];

const DEFAULT_SOURCES: PreviewSource[] = [
  { id: 'core', label: 'Components', order: 0 },
];

/**
 * Build a catalog from the generated manifest and the kit's registered views.
 *
 * Components that accept slot content get the Empty scenario ahead of their
 * own, labeled as the manifest says. Each component's `shortTitle` drops its
 * source's label prefix. The navigation lists each source's views and its
 * component tree interleaved by `order`; a source whose views set no
 * component tree lists its components under `Components`, first among the
 * entries of order 0. Components that are not standalone and unlisted stories stay in
 * `components` but out of the navigation. The kit's targets are the manifest's,
 * the three targets when it names none, with `html` only where it names
 * it, and each component's targets are narrowed to the targets among them.
 * The pane widths are the manifest's, narrowest first, or
 * `DEFAULT_PANE_WIDTHS` when it names none, the Svelte mode the
 * manifest's, `legacy` when it names none, and the landing entry the
 * manifest's.
 *
 * @param manifest - The generated manifest.
 * @param views - The kit's registered views (rendered views and component-tree markers).
 * @returns The catalog.
 */
export function catalogFromManifest(
  manifest: CatalogManifest,
  views: PreviewView[] = []
): PreviewCatalog {
  const sources = (
    manifest.sources?.length ? manifest.sources : DEFAULT_SOURCES
  )
    .slice()
    .sort((a, b) => a.order - b.order);
  const rootSourceId = sources[0].id;
  const targets = PREVIEW_TARGETS.filter(
    (target) => manifest.targets?.includes(target) ?? target !== 'html'
  );
  const emptyScenario: PreviewScenario = {
    id: EMPTY_SCENARIO_ID,
    label: manifest.labels?.emptyScenario ?? 'Empty',
    props: {},
    empty: true,
  };
  const components: PreviewComponent[] = manifest.components.map(
    (component) => {
      const source = component.source ?? rootSourceId;
      const hasContent =
        component.slots.default || component.slots.named.length > 0;
      return {
        id: component.id,
        name: component.name,
        ...(component.description !== undefined
          ? { description: component.description }
          : {}),
        title: component.title,
        shortTitle: stripSourcePrefix(
          component.title,
          sources.find((candidate) => candidate.id === source)
        ),
        source,
        standalone: component.standalone !== false,
        unlisted: component.unlisted === true,
        propTypes: component.propTypes,
        events: component.events ?? [],
        bindings: component.bindings ?? [],
        defaultProps: component.defaultProps,
        previewDefaults: component.previewDefaults ?? {},
        scenarios: hasContent
          ? [emptyScenario, ...component.scenarios]
          : [...component.scenarios],
        slots: component.slots,
        ...(component.content ? { content: component.content } : {}),
        ...(component.around ? { around: component.around } : {}),
        ...(component.options
          ? {
              options: component.options as Record<string, OptionValue | false>,
            }
          : {}),
        targets: (component.targets ?? PREVIEW_SCRIPTED_TARGETS).filter(
          (target) => targets.includes(target)
        ),
      };
    }
  );
  const catalogViews: PreviewCatalogView[] = views
    .filter((view): view is RenderedView => !view.componentTree)
    .map((view) => ({
      id: view.id,
      label: view.label,
      source: view.source ?? rootSourceId,
      order: view.order ?? 0,
      framework: view.framework ?? 'dom',
    }))
    .sort((a, b) => a.order - b.order);
  return {
    kitName: manifest.kitName ?? 'kit',
    ...(manifest.kitVersion ? { kitVersion: manifest.kitVersion } : {}),
    targets,
    sources,
    components,
    views: catalogViews,
    ...(manifest.codeBlock ? { codeBlock: manifest.codeBlock } : {}),
    navigation: buildNavigation(sources, components, views),
    htmlTags: [...HTML_TAGS],
    colorTokens: (manifest.colorOptions ?? []).map((token) => token ?? null),
    paneWidths: (manifest.paneWidths ?? DEFAULT_PANE_WIDTHS)
      .map((paneWidth) => ({ ...paneWidth }))
      .sort((a, b) => a.width - b.width),
    ...(manifest.landing
      ? {
          landing:
            'view' in manifest.landing
              ? { kind: 'view' as const, id: manifest.landing.view }
              : {
                  kind: 'component' as const,
                  id: manifest.landing.component,
                  ...(manifest.landing.scenario !== undefined
                    ? { scenario: manifest.landing.scenario }
                    : {}),
                },
        }
      : {}),
    imports: manifest.imports ?? {},
    svelteMode: manifest.svelteMode ?? 'legacy',
    reactAttributeNames: manifest.reactAttributeNames ?? {},
  };
}

function stripSourcePrefix(
  title: string,
  source: PreviewSource | undefined
): string {
  const prefix = source ? `${source.label}/` : '';
  return prefix && title.startsWith(prefix)
    ? title.slice(prefix.length)
    : title;
}

// --- navigation ---------------------------------------------------------------

interface TitleTreeNode {
  label: string;
  children: TitleTreeNode[];
  component?: PreviewComponent;
}

/** A source's stories as a category tree: titles (minus the source's label)
 *  split on `/` into folders and leaves, folders first, each level alphabetical. */
function buildTitleTree(
  components: PreviewComponent[],
  rootLabel: string
): TitleTreeNode {
  const root: TitleTreeNode = { label: rootLabel, children: [] };
  const prefix = `${rootLabel}/`;
  for (const component of components) {
    const rest = component.title.startsWith(prefix)
      ? component.title.slice(prefix.length)
      : component.title;
    const segments = rest.split('/');
    let node = root;
    segments.forEach((segment, index) => {
      let child = node.children.find(
        (candidate) => candidate.label === segment
      );
      if (!child) {
        child = { label: segment, children: [] };
        node.children.push(child);
      }
      if (index === segments.length - 1) child.component = component;
      node = child;
    });
  }
  const sort = (treeNode: TitleTreeNode) => {
    treeNode.children.sort((a, b) => {
      const aFolder = a.children.length > 0;
      const bFolder = b.children.length > 0;
      if (aFolder !== bFolder) return aFolder ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
    treeNode.children.forEach(sort);
  };
  sort(root);
  return root;
}

function titleTreeToNavigation(
  node: TitleTreeNode,
  parentKey: string
): PreviewNavigationNode {
  const key = `${parentKey}/${node.label}`;
  if (node.children.length > 0) {
    return {
      kind: 'group',
      key,
      label: node.label,
      children: node.children.map((child) => titleTreeToNavigation(child, key)),
    };
  }
  const component = node.component!;
  return {
    kind: 'component',
    id: component.id,
    label: node.label,
    title: component.title,
  };
}

/** A source's component tree as one group, or `null` when it has no stories. */
function componentsEntry(
  source: PreviewSource,
  components: PreviewComponent[],
  entryLabel: string
): PreviewNavigationNode | null {
  const stories = components.filter(
    (component) =>
      component.standalone &&
      !component.unlisted &&
      component.source === source.id
  );
  if (stories.length === 0) return null;
  const root = buildTitleTree(stories, source.label);
  const key = `components:${source.id}`;
  return {
    kind: 'group',
    key,
    label: entryLabel,
    children: root.children.map((child) => titleTreeToNavigation(child, key)),
  };
}

/** The label of a source's component tree where no view sets one. */
const COMPONENT_TREE_LABEL = 'Components';

/** A source's entries: its views and its component tree, by `order`. A source
 *  with stories whose views set no component tree gets one, labeled
 *  `Components`, first among the entries of its order. */
function sourceEntries(
  source: PreviewSource,
  rootSourceId: string,
  components: PreviewComponent[],
  views: PreviewView[]
): PreviewNavigationNode[] {
  const scoped = views.filter(
    (view) => (view.source ?? rootSourceId) === source.id
  );
  const entries: { order: number; entry: PreviewNavigationNode | null }[] =
    scoped.map((view) => ({
      order: view.order ?? 0,
      entry: view.componentTree
        ? componentsEntry(source, components, view.label)
        : ({
            kind: 'view',
            id: view.id,
            label: view.label,
          } satisfies PreviewNavigationNode),
    }));
  if (!scoped.some((view) => view.componentTree))
    entries.unshift({
      order: 0,
      entry: componentsEntry(source, components, COMPONENT_TREE_LABEL),
    });
  // A stable sort: the default tree stays ahead of the views of its order.
  return entries
    .sort((a, b) => a.order - b.order)
    .map(({ entry }) => entry)
    .filter((entry): entry is PreviewNavigationNode => entry !== null);
}

function buildNavigation(
  sources: PreviewSource[],
  components: PreviewComponent[],
  views: PreviewView[]
): PreviewNavigationNode[] {
  const rootSourceId = sources[0].id;
  const nodes: PreviewNavigationNode[] = [];
  for (const source of sources) {
    const entries = sourceEntries(source, rootSourceId, components, views);
    if (source.id === rootSourceId) nodes.push(...entries);
    else if (entries.length > 0)
      nodes.push({
        kind: 'group',
        key: `source:${source.id}`,
        label: source.label,
        children: entries,
      });
  }
  return nodes;
}

// --- helpers over a catalog ---------------------------------------------------

/** One choice of a scenario picker. */
export interface ScenarioChoice {
  /** The scenario id; `''` is the anonymous default. */
  value: string;
  label: string;
}

/**
 * The scenario picker's choices for a component: its baseline first, labeled
 * as the default, then the rest. The Empty scenario renders through a
 * regeneration, so it is left out where the preview cannot regenerate, as in
 * a static build. Empty when the component offers no choice beyond its
 * default, so a shell can leave the picker out.
 *
 * @param component - The component.
 * @param capabilities - What the preview can do: the controller's
 *   `capabilities`.
 * @returns The choices, or an empty list.
 * @example
 * ```ts
 * const choices = scenarioChoices(component, controller.capabilities);
 * ```
 */
export function scenarioChoices(
  component: PreviewComponent | undefined,
  capabilities: { regeneration: boolean }
): ScenarioChoice[] {
  if (!component) return [];
  const baseline = component.scenarios.find((scenario) => scenario.default);
  const others = component.scenarios.filter(
    (scenario) =>
      !scenario.default && (capabilities.regeneration || !scenario.empty)
  );
  if (others.length === 0) return [];
  return [
    baseline
      ? { value: baseline.id, label: `${baseline.label} (default)` }
      : { value: '', label: '(default)' },
    ...others.map((scenario) => ({
      value: scenario.id,
      label: scenario.label,
    })),
  ];
}

/** A story to mount in a detached pane: a component, a scenario and props. */
export interface PreviewStoryReference {
  /** The component's story id (`PreviewComponent.id`). */
  component: string;
  /** The scenario's id; `''` is the anonymous default. Omitted, the story's
   *  starting scenario, as selecting the story picks it. */
  scenario?: string;
  /** Props laid over the scenario's. */
  props?: Record<string, unknown>;
}

/**
 * The key a detached story pane's readiness is reported under in the
 * state's `storyFrames`: the target, the component, then the scenario and
 * the props as given. Two panes of the same story, scenario and props share
 * a key, and it reads `ready` once either has loaded.
 *
 * @param target - The target the pane renders in.
 * @param story - The story, as passed to `frames.mountStory`.
 * @returns The key, such as `react:components-button:ghost`.
 * @example
 * ```ts
 * const ready = state.storyFrames[storyFrameKey('vue', { component: id, scenario: 'ghost' })] === 'ready';
 * ```
 */
export function storyFrameKey(
  target: PreviewScriptedTarget,
  story: PreviewStoryReference
): string {
  return [
    target,
    story.component,
    ...(story.scenario !== undefined ? [story.scenario] : []),
    ...(story.props !== undefined ? [JSON.stringify(story.props)] : []),
  ].join(':');
}

/**
 * The scenario a component starts on: its default-flagged one, else `''`,
 * the anonymous default.
 *
 * @param component - The component.
 * @returns The scenario id.
 */
export function defaultScenarioId(
  component: PreviewComponent | undefined
): string {
  return component?.scenarios.find((scenario) => scenario.default)?.id ?? '';
}

/**
 * The slots a node of the editor's tree holds content in: a component's
 * default slot (when it has one) and then its named slots, as the catalog
 * records them; an HTML tag's default slot; nothing for text or an opaque
 * fill. The tree itself counts as its root component's node.
 *
 * @param catalog - The catalog the node's component is looked up in.
 * @param node - A node of the tree, or the tree itself for its root.
 * @returns The slot names, the default slot first.
 * @example
 * ```ts
 * const tree = controller.getState().editor.tree!;
 * for (const slot of nodeSlots(controller.catalog, tree)) render(slot, tree.slots[slot] ?? []);
 * ```
 */
export function nodeSlots(
  catalog: Pick<PreviewCatalog, 'components'>,
  node: EditorNode | EditorState
): string[] {
  let name: string;
  if ('root' in node) name = node.root;
  else if (!isContainer(node)) return [];
  else if (node.kind === 'html') return [DEFAULT_SLOT];
  else name = node.component;
  const slots = catalog.components.find(
    (component) => component.name === name
  )?.slots;
  if (!slots) return [];
  return [...(slots.default ? [DEFAULT_SLOT] : []), ...slots.named];
}

/**
 * The slots the editor can add plain content to in a node of its tree: the
 * node's slots ({@link nodeSlots}) without those whose content must take
 * their scope, which take only a scoped fill the editor cannot author. Such a
 * slot still holds and shows the fill a story gives it.
 *
 * @param catalog - The catalog the node's component is looked up in.
 * @param node - A node of the tree, or the tree itself for its root.
 * @returns The slot names, the default slot first.
 * @example
 * ```ts
 * const targets = nodeAddSlots(controller.catalog, controller.getState().editor.tree!);
 * ```
 */
export function nodeAddSlots(
  catalog: Pick<PreviewCatalog, 'components'>,
  node: EditorNode | EditorState
): string[] {
  const name =
    'root' in node
      ? node.root
      : isContainer(node) && node.kind !== 'html'
        ? node.component
        : undefined;
  const scopeRequired =
    name === undefined
      ? []
      : (catalog.components.find((component) => component.name === name)?.slots
          .scopeRequired ?? []);
  return nodeSlots(catalog, node).filter(
    (slot) => !scopeRequired.includes(slot)
  );
}
