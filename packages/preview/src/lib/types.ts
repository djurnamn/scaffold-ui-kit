// Shared data shapes for the story generator. Everything here is
// framework-agnostic - the emitters (emit/<target>.ts) translate these into
// each framework's own syntax.

import type { Template, TemplateNode } from '@js-template-engine/types';
import type {
  PreviewCanvasConfiguration,
  PreviewMountNode,
  PreviewOption,
  PreviewViewCanvasConfiguration,
} from '../options.js';
// The preview block's type, which this package gives scaffold-ui-kit's.
import type {} from 'scaffold-ui-kit';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | JsonValue[]
  | { [key: string]: JsonValue };

/** A scripted target the preview can render a component into. A component declares the
 *  subset it supports (`targets`); most support all three, but one bound to a
 *  single-framework library (a React-only toast package, say) supports fewer - the
 *  generator emits only those registries and the host shows only those panes. */
export type Target = 'react' | 'vue' | 'svelte';

/** The default: a component renders in every target unless it narrows the set. */
export const ALL_TARGETS: Target[] = ['react', 'vue', 'svelte'];

/** A control derived from one component prop. */
export interface PropTypeSpecification {
  name: string;
  control: 'text' | 'boolean' | 'number' | 'select' | 'color-select';
  /** For `select`: its values, each a string or a boolean, and `undefined`
   *  for the unset choice. `color-select` draws its options from the shared
   *  token list. */
  options?: (string | boolean | undefined)[];
  /** For `number`. */
  number?: { min?: number; max?: number; step?: number };
  /** false → omit from the controls table (driver-internal / complex props). */
  include: boolean;
  /** The prop's description from its template, in markdown, shown on its control. */
  description?: string;
}

/**
 * What a component declares about one prop, as its template (or, for a
 * component written by hand, its props type) writes it.
 */
export interface PropDeclaration {
  /** The prop's type as written, such as `"'solid' | 'ghost'"` or `'boolean'`. */
  declaredType: string;
  /** Whether the component requires the prop. */
  required: boolean;
  /** The component's own default for the prop, absent when it declares none.
   *  A story's `defaultProps` start from it, then add the kit's hints and the
   *  story file's `defaultProps`, so the two can differ. */
  declaredDefault?: JsonValue;
  /** A default the component applies without declaring it, as the code a
   *  consumer reads (`"'start'"`), for showing beside the control. Absent
   *  when the component documents none. */
  documentedDefault?: string;
}

/**
 * One prop of a component: the control the preview derives for it and what
 * the component declares about it.
 *
 * - `name`, `control`, `options` (a select's values), `number` (a number
 *   input's range), `include` (`false` for a prop shown no control) and
 *   `description` (markdown) describe the control.
 * - `declaredType` is the prop's type as the component writes it, `required`
 *   whether the component requires it, `declaredDefault` the component's
 *   own default, absent when it declares none, and `documentedDefault` a
 *   default it applies without declaring, as the code a consumer reads.
 *
 * `declaredDefault` is the component's default as a consumer gets it. The
 * story's starting value is in its `defaultProps`, which adds the kit's hints
 * and the story file's `defaultProps` over it.
 */
export type PreviewPropType = PropTypeSpecification & PropDeclaration;

/**
 * A two-way prop a component declares (a prop whose `bindable` is an
 * object): the component keeps its own value while the prop is not given,
 * and calls `changeProp` with each new value. A story that gives `prop` is
 * controlled: when a pane reports `changeProp`, the controller takes the
 * value as the story's new `prop`.
 */
export interface PreviewBinding {
  /** The two-way prop. */
  prop: string;
  /** The prop the component's own value starts from, if any. */
  defaultProp?: string;
  /** The event prop called with each new value, if any. A story that gives
   *  `prop` takes the value it reports as its new `prop`. */
  changeProp?: string;
  /** Whether a Vue consumer binds the prop with a bare `v-model` (the
   *  template's `extensions.vue.model`), beside `v-model:<prop>`. */
  vueModel?: boolean;
  /** Whether the component takes type parameters (its template's
   *  `typeParameters`), so a consumer's state for the prop infers its type
   *  from the value rather than naming it. */
  generic?: boolean;
}

/**
 * How to fill a slot when rendering a demo. A recursive node tree - a slot fill
 * *is*, in effect, an anonymous template subtree whose leaves are real
 * components. Single-source; the emitters translate it to each target's markup.
 * Field names are a deliberate subset of `@js-template-engine/types`
 * `TemplateNode` (`slots`, `children`, `tag`).
 *
 * - `element` carries a component's `props`, its default-slot `children`, **and**
 *   its **named** `slots` (e.g. an `IconLabel` with its `icon` slot filled).
 * - `html` is a plain DOM tag (`<section>`/`<div>` wrappers) - props + children,
 *   no named slots.
 */
export type SlotFill =
  | { kind: 'text'; value: string }
  | {
      kind: 'element';
      component: string;
      props?: Record<string, JsonValue>;
      slots?: Record<string, SlotFill>;
      children?: SlotFill;
    }
  | {
      kind: 'html';
      tag: string;
      props?: Record<string, JsonValue>;
      children?: SlotFill;
    }
  | { kind: 'fragment'; children: SlotFill[] }
  | {
      kind: 'raw';
      react: string;
      vue: string;
      svelte: string;
      /** What it renders to, for the story's html source: markup, or template
       *  nodes, which render as the kit's templates do - a kit component
       *  among them included. Without it, the story has no html source. */
      html?: string | TemplateNode[];
      /** Kit components the raw strings reference, so the generated registry imports
       *  them (a raw string is opaque - unlike `element`, its imports can't be walked).
       *  e.g. a `renderCell` raw that returns `<TextInput/>` declares `['TextInput']`. */
      imports?: string[];
    }
  | {
      /**
       * A **scoped** slot fill - content the *parent* parameterizes with runtime
       * values (a row, an index, a setter), the cross-framework generalization of a
       * React render-prop. Only valid at a top-level named-slot position (it needs the
       * host component to supply the scope), never nested inside another fill.
       *
       * Its target name differs per framework because the same scoped slot is a render-prop
       * in React but a scoped slot / snippet in Vue/Svelte (e.g. a table's
       * `renderCell` prop is a `#cell` slot in Vue and a `cell` snippet in Svelte). The
       * emitters translate one fill into: React `name={({ parameters }) => (body)}` (prop),
       * Vue `<template #name="{ parameters }">body</template>`, Svelte
       * `{#snippet name({ parameters })} body{/snippet}` - one `parameters` list, spelled the
       * same way in every target unless `reactScope` says the React side is
       * positional.
       */
      kind: 'scoped';
      /** The slot's identifier per target: the React render-prop name, the Vue scoped-slot
       *  name, the Svelte snippet name (they differ - see above). */
      slot: { react: string; vue: string; svelte: string };
      /** The scope parameter names the host passes, destructured in each target
       *  (e.g. `['column', 'row', 'index', 'setField']`). */
      parameters: string[];
      /**
       * How the React side receives the scope. Vue and Svelte always destructure
       * `parameters` off one scope object; React can do either, and the two shapes are
       * indistinguishable in the generated source - both compile, and the wrong one
       * binds the whole scope to the first name.
       *
       * - `'object'` (the default) - React destructures one scope object,
       *   `name={({ a, b }) => body}`. This is what a generated component's scoped
       *   slot supplies: its render prop is always called with a single object, so
       *   one `parameters` list stays correct across all three emitters.
       * - `'positional'` - React takes the names as separate parameters,
       *   `name={(a, b) => body}`. For a hand-written component whose React prop really
       *   is positional (a table's `renderCell(column, row, index, setField)`),
       *   where its Vue and Svelte counterparts are still one destructured object.
       */
      reactScope?: 'object' | 'positional';
      /** Per-target body referencing `parameters`. React is a JSX expression, or
       *  JSX content (sibling roots, text), which it returns in a fragment; Vue
       *  and Svelte are markup fragments. An empty string omits that target's
       *  slot. */
      react: string;
      vue: string;
      svelte: string;
      /** What the body renders to at rest, for the story's html source:
       *  markup, or template nodes, which also read the values the slot
       *  exposes under `parameters` (one the slot cannot give reads every
       *  property as `undefined`). Without it, the story has no html source. */
      html?: string | TemplateNode[];
      /** Components the bodies reference, imported into the generated registry (opaque
       *  strings can't be walked - as `raw`). */
      imports?: string[];
    }
  | {
      /**
       * A call to a **part**: content the story declares once, by name, outside
       * its markup, and calls here with `props`. Its body may call the part
       * again, so content shaped like its data - a tree, lists nested in each
       * other's items - renders to any depth, ending where the data does.
       *
       * Each target declares the part as it would by hand: React a function
       * component, Vue a component (a single-file component of its own in the
       * story's source), Svelte a snippet at the top of the markup. A call is
       * `<Name ... />` in React and Vue and `{@render Name({ ... })}` in Svelte,
       * spelled the same way inside a body, where the props are expressions.
       * The declaration rides on every call; two calls of one name must carry
       * the same one.
       */
      kind: 'part';
      /** The part's name: a component's name in React and Vue, the snippet's in Svelte. */
      name: string;
      /** The props the part takes, read by name in its bodies. */
      parameters: string[];
      /** A TypeScript type per parameter, for the story's printed source: React's
       *  props and Svelte's snippet take them, a parameter without one is `any`,
       *  and Vue's `defineProps` is typed once any is given. A type a kit names
       *  (`Folder[]`) is the reader's to declare or import. */
      parameterTypes?: Record<string, string>;
      /** The props this call passes. */
      props?: Record<string, JsonValue>;
      /** The body per target, reading `parameters`. React is a JSX expression,
       *  or JSX content (sibling roots, text), which it returns in a fragment;
       *  Vue and Svelte are markup fragments. */
      react: string;
      vue: string;
      svelte: string;
      /** What the body renders to, for the story's html source: template
       *  nodes reading `parameters`, a call to the part among them rendering
       *  it again. Without it, the story has no html source. */
      html?: TemplateNode[];
      /** Kit components the bodies reference, imported where the part is declared. */
      imports?: string[];
    };

/** A call to a part (see the `part` slot fill). */
export type PartFill = Extract<SlotFill, { kind: 'part' }>;

export interface SlotPlan {
  default?: SlotFill;
  named?: Record<string, SlotFill>;
}

/** Content a story renders beside its component: any slot fill but a
 *  `scoped` one, which needs a slot to give it values. */
export type AroundFill = Exclude<SlotFill, { kind: 'scoped' }>;

/** What a story renders beside its component, as its siblings: `before` it
 *  and `after` it, such as a hint element whose id the component's
 *  `aria-describedby` names. */
export interface StoryAround {
  before?: AroundFill;
  after?: AroundFill;
}

export interface Scenario {
  id: string;
  /** Display label in the scenario picker. Defaults to `id` when omitted. */
  label?: string;
  /** What the scenario shows and why it is worth a look, for a shell to show
   *  beside it. Markdown allowed. */
  description?: string;
  props?: Record<string, JsonValue>;
  /** Slot content of the scenario's own, in the shape of the story's
   *  `slots`: a slot it fills takes the scenario's fill in place of the
   *  story's, and every other slot keeps the story's. For a scenario whose
   *  point is what the component holds, such as a message's text per
   *  severity. */
  slots?: SlotPlan;
  /** Values for the kit's preview options, keyed by option id, that picking
   *  the scenario sets: the setting it shows the component in, such as
   *  `{ mode: 'dark', surface: '3' }`. A global option keeps its value after
   *  another scenario is picked, as if it were set by hand; a story option
   *  keeps it until another story is selected. */
  options?: Record<string, string | boolean>;
  /** Mark the baseline configuration: shown as "<label> (default)" and selected
   *  initially, instead of the anonymous "(default)". At most one per component. */
  default?: boolean;
  /** Generated from one enum value or boolean (see Story.generate), not curated.
   *  Set by the generator; listed after the curated scenarios. */
  generated?: boolean;
}

/**
 * A component's story file (`<Name>.story.ts` in its source's stories
 * directory, default-exported): what its story shows - props, controls, slot
 * content, scenarios, options - and whether it has one. Absent, the story is
 * the component's defaults. The single home for per-component curation, never
 * per target.
 */
export interface Story {
  omit?: boolean;
  /**
   * Whether the component has a story of its own. Default `true`. A
   * component set `false` (a compound's subcomponent such as `TabList`,
   * `Tab` or `TabPanel`, meaningful only nested inside its parent, or a
   * shared building block) is left out of the story navigation but stays in
   * the manifest for the editor's component picker, so its node, props and
   * slots can be authored in a parent's content tree. Unlike `omit`, which
   * drops it from the manifest entirely. A component its compound's root
   * lists in `parts` (in the root's template, or in the kit configuration's
   * `parts` for a root with no template) is `standalone: false` without the
   * flag; `check` warns of the flag on a component no root lists, unless the
   * component is no one compound's part: two or more templates render it, a
   * story of its source labeled with its name stands in for it, or it lists
   * parts of its own. A manual spec's `standalone` is not checked; its story
   * file's is.
   */
  standalone?: boolean;
  /**
   * An *unlisted* story: generated, rendered in every target and reachable
   * at its address (`?component=<id>`) and through the testing helpers, as
   * any story is, but left out of what a reader browses - the navigation,
   * the editor's component picker, the component count, and the catalog a
   * custom view reads. For a story that exists for a kit's own tests, such as
   * a fixture a browser test drives. The catalog keeps it, flagged
   * `unlisted`. A component that is `omit` or `standalone: false` has no
   * story to leave unlisted, so `check` reports `unlisted` beside either as
   * an error.
   */
  unlisted?: boolean;
  category?: string;
  /** The name shown in the navigation, when it should differ from the component's
   *  (import) name - e.g. a playground fixture of another package whose export must stay unique
   *  in the shared registry (`ToastExample`) but reads better as `Toast`. Display only;
   *  the import identifier and editor root stay the component's real `name`.
   *  A story labeled with the name of a component in its source that is
   *  `standalone: false` is that component's story. */
  label?: string;
  defaultProps?: Record<string, JsonValue>;
  /** Control tweaks per prop (a number range, a select's options). `false` excludes
   *  the prop: no control, no generated scenario, no coverage warning. */
  controls?: Record<string, Partial<PropTypeSpecification> | false>;
  /** Props always passed with this value and never shown as controls. A scenario
   *  may not set one. */
  fixed?: Record<string, JsonValue>;
  /** Scenario generation: by default one scenario per enum value other than the
   *  default and one per boolean flipped from its default, for every select and
   *  boolean control. `false` turns it off; a list of prop names narrows it to
   *  those props; `{ exclude }` generates every prop but those. A curated
   *  scenario setting exactly one such value stands in for its generated one, and
   *  a curated scenario taking a generated id (`<prop>-<value>`, or the prop for
   *  a boolean) replaces it, so it should set that value. */
  generate?: false | string[] | { exclude: string[] };
  slots?: SlotPlan;
  /** Content rendered beside the component, as its siblings, in every pane
   *  and the story's code: `before` it and `after` it. Shared by the
   *  scenarios, as `slots` is. */
  around?: StoryAround;
  scenarios?: Scenario[];
  /** Per-story defaults for story-scoped preview options (the kit's
   *  `options`, such as a box or padding around the component), keyed by option id. A value seeds that option's starting value
   *  for this component; `false` marks the option *unavailable* here (no control
   *  shown, and held at its option default) - e.g. a full-page template is edge-to-edge
   *  so `{ box: false, padded: false }`. Options omitted here use their config default. */
  options?: Record<string, JsonValue | false>;
}

/** What content a component accepts - its default slot and any named slots.
 *  Surfaced to the host so the editor can offer the right add-targets. */
export interface ContentSlots {
  /** Whether the component exposes an unnamed (default) slot. */
  default: boolean;
  /** Named slot names the component exposes (e.g. `icon`, `navigation`). */
  named: string[];
  /** The slots among them whose content must take their scope, the default
   *  slot as `default`: they hold content like any other, but take only a
   *  scoped fill, so the editor offers no plain content for them. */
  scopeRequired?: string[];
}

/** The framework-agnostic intermediate an emitter consumes. */
export interface ResolvedStory {
  name: string;
  title: string;
  /** What the component is: its template's `description`, or its manual
   *  spec's. Markdown allowed. */
  description?: string;
  omit: boolean;
  /** Whether the component has a story of its own. One that is not stays in
   *  the manifest for the editor, hidden from the story navigation and the
   *  per-target registries (see Story.standalone). */
  standalone: boolean;
  /** A story left out of the navigation, the editor's picker and the counts,
   *  still generated and reachable at its address (see Story.unlisted).
   *  Never set on one that is `omit` or not `standalone`. */
  unlisted: boolean;
  propTypes: PreviewPropType[];
  /** The props that are events: functions returning nothing, which the
   *  component calls as things happen. */
  events?: string[];
  /** The component's two-way props. */
  bindings?: PreviewBinding[];
  defaultProps: Record<string, JsonValue>;
  /** The values in `defaultProps` that neither the component declares nor its
   *  story file sets: the preview's own starting values, from the kit's control
   *  hints. A consumer's source leaves them out. */
  previewDefaults?: Record<string, JsonValue>;
  slots?: SlotPlan;
  /** The content rendered beside the component (see Story.around). */
  around?: StoryAround;
  scenarios: Scenario[];
  /** Extra component names referenced by slot fills and the content beside
   *  the component, to import in the story. */
  slotComponents: string[];
  /** The slots the component accepts (for the editor's add-content targets). */
  contentSlots: ContentSlots;
  /** Per-story preview-option defaults / availability (see Story.options). */
  options?: Record<string, JsonValue | false>;
  /** The id of the preview source this story belongs to - groups it under its
   *  navigation section. Assigned by the generator; defaults to 'core'. */
  source?: string;
  /** The targets this story renders into (default all three). A React-only
   *  fixture narrows this to `['react']`, so the generator emits only the
   *  React registry and the host shows only the React pane. */
  targets: Target[];
  /** Set on the story of one scenario with slot content of its own, which
   *  the generator renders beside the component's story: the id the panes
   *  mount it by and the name its render unit takes, in place of the ones
   *  derived from the title and the component's name. */
  scenarioStory?: { id: string; renderName: string };
}

/** One enumerated component: a globbed template, or a resolved manual spec. */
export interface EnumeratedComponent {
  name: string;
  file: string;
  /** The template a globbed component was read from; a manual spec has none. */
  template?: Template;
  /** What the component is: the template's `description`, or, for a manual
   *  spec, written beside it. Markdown allowed. */
  description?: string;
  props: Record<
    string,
    {
      type: string;
      /** `type` with the named types it uses expanded through the template's
       *  imports, when that differs: what the prop's control is read from,
       *  while `type` stays as written. */
      resolvedType?: string;
      default?: JsonValue;
      documentedDefault?: string;
      required?: boolean;
      description?: string;
    }
  >;
  hasDefaultSlot: boolean;
  /** Whether the default slot exposes values to its content (a scoped slot):
   *  the preview then seeds no placeholder text into it, so its fallback
   *  renders. */
  defaultSlotScoped?: boolean;
  /** Named slots the component declares (`{ type: 'slot', name }`). */
  slotNames: string[];
  /** The slots whose content must take their scope (a template slot's
   *  `scopeRequired`), by name, the default slot as `default`: a story fills
   *  them only with a `scoped` fill, React's render function, and the editor
   *  offers them no plain content. */
  scopeRequiredSlots?: string[];
  /** Whether the component's root forwards native attributes (a template's
   *  `passthrough` element): the check then accepts HTML attribute names too. */
  passthrough?: boolean;
  /** Where the component gathers a consumer's leftover attributes (a
   *  template's `rest`), and the tag they are typed as: the check then
   *  accepts HTML attribute names too, as for `passthrough`. */
  rest?: { tag: string };
  /** Whether the component has a story of its own (a manual spec's). Default
   *  `true`; `false` makes it editor-only. See Story.standalone. */
  standalone?: boolean;
  /** A story reachable at its address but left out of the navigation, the
   *  editor's picker and the counts (a manual spec's). See Story.unlisted. */
  unlisted?: boolean;
  /** The targets this component renders into (default all three - `ALL_TARGETS`).
   *  A manual spec bound to a React-only library sets `['react']`. */
  targets?: Target[];
  /** Override the module each target imports this component from, when it is NOT the
   *  source's module for the target - e.g. a preview-internal playground fixture that
   *  lives beside another package's code rather than in its published barrel. Keyed by
   *  target; a target absent from the map falls back to the source default. */
  importModule?: Partial<Record<Target, string>>;
  /** The identifier the module actually **exports**, when it differs from `name` (the
   *  unique preview identity used for addressing + as the local binding). Another
   *  package's components export clean, unprefixed names that collide with the kit's - a toast package exporting
   *  `Toast`, a forms package its own `TextInput` - so the preview names the
   *  component uniquely (`NoticeToast`) and the generator imports `{ Toast as NoticeToast }`.
   *  Defaults to `name` (no alias). */
  exportName?: string;
  /** Members read from a manual spec's `propsFrom` interface whose type is not a
   *  control (a function, an object, a type from another file): the check lists
   *  them, so the hiding is visible. */
  hiddenProps?: string[];
  /** Every member name read from `propsFrom` - in React a named or scoped slot is
   *  a prop, so the check accepts these as named-slot keys. */
  memberNames?: string[];
}

/**
 * A manual (non-template) component spec, as a source's `manualModule` returns it:
 * an EnumeratedComponent whose props are either written by hand (a preview-only
 * fixture) or read from code. `propsFrom` names the React driver's props
 * interface as `'<file relative to the kit root>#<InterfaceName>'`; its own
 * members (not what it extends) become the props, and a `children` member marks
 * the default slot. Give `props` or `propsFrom`, not both.
 */
export interface ManualComponentSpecification
  extends Omit<EnumeratedComponent, 'props' | 'hasDefaultSlot' | 'slotNames'> {
  props?: EnumeratedComponent['props'];
  propsFrom?: string;
  /** Defaults to whether `propsFrom` declares a non-function `children`, else false. */
  hasDefaultSlot?: boolean;
  /** Whether the default slot exposes values to its content (a scoped slot).
   *  Defaults to whether `propsFrom` takes it from a template component
   *  whose default slot does, else false. */
  defaultSlotScoped?: boolean;
  /** Defaults to none. */
  slotNames?: string[];
}

// ─── The preview block ───

/** Imports a kit-authored TypeScript module by absolute path (jiti under the
 *  built CLI - kit files are TS source the CLI must compile on the fly). */
export type ModuleImporter = (absolutePath: string) => Promise<unknown>;

/**
 * What a hand-written component renders as in a story's html source:
 * `'content'`, a template's name, or `{ template, slots }`, where `slots`
 * names the template slot each of the component's slots fills when they
 * differ (`{ default: 'inner' }`; `default` is the default slot).
 */
export type HandWrittenMapping =
  | string
  | { template: string; slots?: Record<string, string> };

/** One preview source: a package whose components + story files the generator
 *  renders under its own navigation section. Fundamentally a source is *where its
 *  components import from* (`moduleBase` → `${moduleBase}/${target}`, or the
 *  base with `{target}` replaced when it names one) plus a
 *  navigation identity. The kit's own components are a source like any other -
 *  the first source (lowest `order`) is the default module for slot children
 *  that belong to no registered source. */
export interface PreviewSourceConfiguration {
  /** Stable id - groups this source's stories in the manifest + navigation. */
  id: string;
  /** Navigation heading. */
  label: string;
  /** Navigation order - the kit's own source first, other packages after. */
  order: number;
  /** Where the emitters import this source's components from: `${moduleBase}/${target}`,
   *  or, when it contains `{target}`, the base with the target in its place
   *  (`'@acme/{target}'` imports `'@acme/react'`). */
  moduleBase: string;
  /** The directory of component templates to read, relative to the kit
   *  root (omit for a source of manual specs alone). */
  templatesDirectory?: string;
  /** Module (relative to the kit root) whose default/named export supplies the
   *  source's manual (non-template) component specs: `() => EnumeratedComponent[]`. */
  manualModule?: string;
  /** This source's stories directory, relative to the kit root. */
  storiesDirectory?: string;
}

/** A shipped theme: the compiled stylesheet (and optional asset dir - e.g.
 *  self-hosted fonts referenced by relative `url()`) are file paths relative to
 *  the kit root; the generator copies them into the served tree, so the map is
 *  pure config (no bundler import constraints). */
export interface PreviewThemeConfiguration {
  id: string;
  label: string;
  /** The compiled stylesheet path (relative to the kit root). */
  css: string;
  /** Optional asset directory copied beside the stylesheet (fonts). */
  assets?: string;
}

/** The kit's control hints - the token-config hook feeding prop controls,
 *  the preview block's `controlHints`, read in Node only, so its hook may be
 *  a function in `scaffold-ui-kit.ts`. Everything is optional (a kit without
 *  color tokens gets no color-select controls, and its color props are treated
 *  by their declared types). */
export interface PreviewControlHints {
  /** The kit's color tokens. When it holds any, a string-typed prop whose
   *  name ends in `color`, in any case (`color`, `borderColor`), gets a
   *  select of these tokens (the
   *  color-select control) in place of the control its type gives. `null`
   *  (or `undefined`) is the select's unset choice. */
  colorTokens?: (string | null | undefined)[];
  /** Component-scoped size default in rem (e.g. Badge → 0.75), or undefined. */
  componentSizeRem?: (componentName: string) => number | undefined;
}

/** The host's own copy, so it can follow the kit's casing: the preview
 *  block's `labels`, read in Node only, so `generatedScenario` may be a
 *  function in `scaffold-ui-kit.ts`. Each label falls back to its default. */
export interface PreviewLabels {
  /** The category a component without a story file `category` sits in. Default `Components`. */
  category?: string;
  /** The synthetic scenario that renders a component with no content. Default `Empty`. */
  emptyScenario?: string;
  /** The label of a generated scenario, from the prop and the value it sets.
   *  Default `prop: value`, or the bare prop for a boolean turned on. */
  generatedScenario?: (prop: string, value: string | boolean) => string;
}

/** Where the preview remembers what a person chose. `'url'` keeps the
 *  selection, the scenario and the option values in the page's query
 *  parameters, so a link opens the preview as it was; `'url-and-local-storage'`
 *  also remembers the global option values in the browser, per kit name,
 *  across sessions - a value in the URL winning over a remembered one. */
export type PreviewPersistence = 'url' | 'url-and-local-storage';

/** A width the preview offers to lay a story's panes out at, so a component
 *  that responds to its width can be seen on a small screen or a large one. */
export interface PreviewPaneWidth {
  /** What a reader picks it by, such as `small`. */
  label: string;
  /** The width in CSS pixels: a whole number greater than zero. */
  width: number;
}

/** The entry the preview opens on when its address names none: a custom
 *  view by its id, or a component's story by its id, on one of its
 *  scenarios or its baseline. The ids are the ones the preview's address
 *  carries (`view=`, `component=`, `scenario=`). */
export type PreviewLandingConfiguration =
  | { view: string }
  | { component: string; scenario?: string };

/**
 * The keys of the preview block the preview's pages read: data, which the
 * preview checks can be sent as JSON and serves to the browser.
 */
export interface PreviewBrowserConfiguration {
  /** The kit's options, such as a color mode, and how each reaches a story. */
  options: PreviewOption[];
  /** The name prefix, page background and extra CSS each frame paints with. */
  canvas: PreviewCanvasConfiguration;
  /** The kit's theme stylesheets; the first is the default. */
  themes: PreviewThemeConfiguration[];
  /** The wrapper tree rendered around each story's mount; omitted, the mount
   *  is a direct child of `<body>`. */
  mount?: PreviewMountNode;
  /** The canvas of a custom view's frame. */
  viewCanvas?: PreviewViewCanvasConfiguration;
}

/** The keys of the preview block its pages read, which must be JSON. */
export const PREVIEW_BROWSER_KEYS = [
  'options',
  'canvas',
  'themes',
  'mount',
  'viewCanvas',
] as const satisfies readonly (keyof PreviewBrowserConfiguration)[];

/** The kit's shell with its page named: the long form of `preview.shell`. */
export interface PreviewShellSetting {
  /** The shell module: a package specifier, or a module path relative to
   *  the kit root, whose default export is a shell. */
  module: string;
  /** The shell's page module, which supplies the host page's static start:
   *  a package specifier, or a module path relative to the kit root, whose
   *  default export is a shell page. Left out, a shell named as a package
   *  specifier uses the module at that specifier followed by `/page`, when
   *  the package has one. */
  page?: string;
}

/** The `preview` block of the kit configuration (`scaffold-ui-kit.ts` or
 *  `scaffold-ui-kit.json`): plain data, plus module paths for the parts that
 *  are code. The keys the preview's pages read are served to the browser as
 *  JSON; `controlHints` and `labels` stay in Node, so in `scaffold-ui-kit.ts`
 *  their hooks may be functions. The build never reads this block; the
 *  preview owns and validates it. */
export interface PreviewConfiguration {
  sources: PreviewSourceConfiguration[];
  /** The kit's options (see {@link PreviewBrowserConfiguration}). */
  options?: PreviewOption[];
  /** How each frame paints: a name prefix for the names the preview sets,
   *  and optionally a page background and extra CSS. Omitted, the name
   *  prefix is the kit's name, its characters other than letters, digits,
   *  `-` and `_` made `-`, and the frames paint nothing of their own. */
  canvas?: PreviewCanvasConfiguration;
  /** The kit's compiled theme stylesheets; the first is the default. */
  themes?: PreviewThemeConfiguration[];
  /** The wrapper tree rendered around each story's mount. */
  mount?: PreviewMountNode;
  /** The canvas of a custom view's frame; without it a view gets
   *  `canvas.pageBackground` and nothing else. */
  viewCanvas?: PreviewViewCanvasConfiguration;
  /** The widths a shell offers to lay a story's panes out at, in place of
   *  the preview's own (`small` 375, `medium` 768 and `large` 1280), so a
   *  kit can derive them from its own breakpoints. An empty list offers
   *  none. */
  paneWidths?: PreviewPaneWidth[];
  /** The hints feeding prop controls, read in Node only. */
  controlHints?: PreviewControlHints;
  /** The host's own copy, read in Node only. */
  labels?: PreviewLabels;
  /** The shell that renders the preview's interface around the iframes: a
   *  package specifier, or a module path relative to the kit root, whose
   *  default export is a shell; or the shell's module with its page module
   *  named beside it. Required; `@scaffold-ui-kit/preview/shells/charcell`
   *  is the one shipped with the preview. */
  shell: string | PreviewShellSetting;
  /** Kit-authored module exporting the custom-view registry. */
  viewsModule?: string;
  /** Preview-only import aliases (playground fixtures outside published barrels). */
  aliases?: Record<string, string>;
  /** Per-target setup modules (side effects only): ambient providers a story
   *  assumes mounted (a toast container), another package's stylesheets. Each is
   *  imported once by that target's preview iframe. */
  setupModules?: Partial<Record<Target, string>>;
  /** Stylesheets (relative to the kit root) the html pane loads beside the
   *  theme's: what a framework's setup module brings in as CSS, such as a
   *  preflight or another package's sheet, since the html pane runs no script. */
  htmlStylesheets?: string[];
  /** The kit's own code block for the code view: a module (relative to the
   *  kit root) whose default export is a `CodeBlockMount`, and the framework
   *  it mounts with, whose setup module loads first (`dom`, the default,
   *  loads none). The preview mounts it in an iframe per code pane, in place
   *  of the shell's own. */
  codeBlock?: {
    module: string;
    framework?: 'react' | 'vue' | 'svelte' | 'dom';
  };
  /** Extra SCSS load paths (relative to the kit root) for per-component SCSS. */
  scssLoadPaths?: string[];
  /** Package names Vite must not esbuild-prebundle (raw `.svelte` shippers etc.). */
  optimizeDepsExclude?: string[];
  /** Packages the preview loads one copy of, resolved from the kit root
   *  wherever they are imported, beside the framework runtimes it always
   *  loads once: a package the shell and the kit's components both import,
   *  whose instances must be shared (a library with a plugin registry or
   *  module-level state). Each must resolve from the kit root. */
  dedupe?: string[];
  /** A regular expression (as a string) matched against each component's name:
   *  a match gets no story, the way a story file's `omit` does - for a kit whose
   *  naming marks a compound's parts, such as `"(Driver|Visual)$"`. Unset, no
   *  component is left out by name. */
  omitPattern?: string;
  /** What each component written by hand renders as in a story's html
   *  source: `'content'` for one that renders only the content passed into it
   *  (a driver adding behavior to markup it is given), or the template it
   *  renders, which then takes its props and content. Either way one comment
   *  around it says its behavior is not included. A component with no
   *  template that is not listed leaves the story with no html source. */
  handWrittenComponents?: Record<string, HandWrittenMapping>;
  /** Dev-server port (default 6100; `dev --port` overrides it). If it is taken, the server takes the next free one. */
  port?: number;
  /** The addresses the dev server listens on: an address such as
   *  `'0.0.0.0'`, or `true` for every address, so another device on the
   *  network can open the preview. Default: this machine only;
   *  `dev --host` overrides it. */
  host?: string | boolean;
  /** Where the preview remembers what a person chose. Default `'url'`. */
  persistence?: PreviewPersistence;
  /** The entry the preview opens on when its address names no view or
   *  story, such as a foundations view: `{ view }` or
   *  `{ component, scenario? }`. Unset, it opens on the first listed story. */
  landing?: PreviewLandingConfiguration;
}

declare module 'scaffold-ui-kit' {
  /** The preview's settings in the kit configuration, typed by this package. */
  interface KitPreviewConfiguration extends PreviewConfiguration {}
}
