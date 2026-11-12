// The custom-view contract: what a kit's `viewsModule` exports. A view is a
// consumer-authored panel the preview lists beside the component stories and
// mounts in the dedicated view iframe (`?view=<id>`) under the live options
// context - tokens pages, galleries, composed demos. A view mounts itself into
// an element in any of the preview's frameworks, or in plain DOM; `reactView`
// adapts a React render function. Browser-safe.

import type { OptionValue } from './options.js';

export { reactView, type ReactViewRender } from './react-view.js';

/** One entry of the component index a view receives: a browseable story the
 *  view can cross-reference or select. */
export interface ViewContextComponent {
  /** The component's selection id - pass to `selectComponent` to open its story. */
  id: string;
  /** The full title (source label prefix included). */
  title: string;
  /** The preview source (navigation section) the component belongs to. */
  source: string;
}

/** A source as a view sees it - the kit's own source plus any other package whose components it shows. */
export interface ViewContextSource {
  id: string;
  label: string;
  order: number;
}

/** What the preview passes a view. `options` is live (a new context arrives
 *  on every change, see `ViewContextUpdates`); the catalog fields are a
 *  read-only snapshot of the kit's catalog, so a view can cross-link into a
 *  component story. A view reads
 *  what it needs (a foundations view reads `options.theme` to pick its palette;
 *  a gallery resolves a component from `components` and deep-links via
 *  `selectComponent`). */
export interface ViewContext {
  options: Record<string, OptionValue>;
  /** The kit being previewed. Empty until the host handshake delivers the catalog. */
  kitName: string;
  /** The sources, ordered. Empty until the handshake delivers the catalog. */
  sources: ViewContextSource[];
  /** The browseable component stories (components that are not standalone and unlisted
   *  stories excluded; an unlisted story's id still selects it). Empty until
   *  the handshake delivers the catalog. */
  components: ViewContextComponent[];
  /**
   * Ask the preview to select a component story, as choosing it in the
   * preview's navigation does. With `props`, the story opens with those root props merged
   * over the component's defaults (a gallery opens the clicked entry's variant);
   * without, it opens on its baseline scenario. Unknown ids are ignored.
   */
  selectComponent: (id: string, props?: Record<string, unknown>) => void;
}

/** Fields common to every navigation entry a kit registers. */
interface PreviewEntryBase {
  /** Reserved selection id - also the view iframe's `?view=` parameter. */
  id: string;
  /** The entry's name in the navigation. */
  label: string;
  /** The source whose entries list this one (a source id from
   *  `preview.sources`); defaults to the kit's own (first) source. */
  source?: string;
  /** Position among the source's entries - lower first. Views and the
   *  auto-generated component tree interleave by this. */
  order?: number;
}

/** The framework a view mounts with. The view iframe loads the kit's setup
 *  module for that framework (`preview.setupModules`) before it
 *  mounts the view; `'dom'` loads none. */
export type ViewFramework = 'react' | 'vue' | 'svelte' | 'dom';

/** How a mounted view hears of a changed context: the options as the
 *  preview applies them, and the catalog once the handshake delivers it. */
export interface ViewContextUpdates {
  /**
   * Call `listener` with each new context.
   *
   * @returns A function that stops the calls.
   */
  subscribe(listener: (context: ViewContext) => void): () => void;
}

/**
 * Mount a view into `element` with the context as it stands. The view stays
 * mounted for the life of the view iframe and follows later changes through
 * `updates`; a view that ignores them shows the context it mounted with.
 *
 * @param element - The element the view renders into.
 * @param context - The context as it stands when the view mounts.
 * @param updates - Delivers each new context.
 * @returns A function that unmounts the view, or nothing.
 */
export type ViewMount = (
  element: HTMLElement,
  context: ViewContext,
  updates: ViewContextUpdates
) => (() => void) | void;

/** A consumer-authored panel: the preview lists it beside the component stories
 *  and mounts it in the generic view iframe (`?view=<id>`) under the live
 *  options. */
export interface RenderedView extends PreviewEntryBase {
  /** Discriminant - omit (or `false`) for a rendered view. */
  componentTree?: false;
  /** The framework `mount` renders with. Default `'dom'`. */
  framework?: ViewFramework;
  /** Mount the view inside the view iframe. */
  mount: ViewMount;
}

/** The "magic" entry standing in for the source's auto-generated component tree (its
 *  stories) at a chosen position. It mounts no iframe, so it carries no `mount`. */
export interface ComponentTreeEntry extends PreviewEntryBase {
  componentTree: true;
  mount?: never;
}

/** A navigation entry a kit's `viewsModule` registers: either a rendered view or the
 *  component-tree marker. The two interleave by `order`. */
export type PreviewView = RenderedView | ComponentTreeEntry;

/** What the kit's `viewsModule` must export. */
export interface PreviewViewsModule {
  views: PreviewView[];
  viewById: (id: string) => PreviewView | undefined;
}

/** The language of a code block's source, as a highlighter names it: a
 *  scripted target's file (`tsx`, `vue`, `svelte`) or the html target's
 *  markup. */
export type CodeBlockLanguage = 'tsx' | 'vue' | 'svelte' | 'html';

/** What a code block shows: one target's source of the story, or, while it
 *  has none, nothing (it is being printed) or why there is none. */
export interface CodeBlockContent {
  /** The target the source is for: a scripted target, or `html`. */
  target: 'react' | 'vue' | 'svelte' | 'html';
  language: CodeBlockLanguage;
  /** The source, as a consumer writes it. */
  source?: string;
  /** Why the target has no source, when it has none to be had. */
  reason?: string;
  /** Whether the shell wraps its code panes' long lines: the block wraps
   *  them when true and scrolls sideways when false. A shell with no such
   *  choice sends false. */
  wrap: boolean;
}

/** How a mounted code block hears of a new source: each time the story, its
 *  props or its content change, or the shell's wrapping does. */
export interface CodeBlockUpdates {
  /**
   * Call `listener` with each new content.
   *
   * @returns A function that stops the calls.
   */
  subscribe(listener: (content: CodeBlockContent) => void): () => void;
}

/**
 * Mount a kit's code block into `element`, showing `content`, the default
 * export of the module the kit names as its `codeBlock`. The block stays
 * mounted for the life of its iframe, one per code pane, and follows later
 * sources through `updates`. It wraps long lines while `content.wrap` is
 * true and scrolls sideways while it is false, as the shell's own panes do.
 * The iframe's page is the block's alone: its root carries
 * `data-preview-frame="code"`, so the kit's stylesheet may style the frame's
 * `html` and `body` by it, say in the block's background so an overscroll
 * shows no other color.
 *
 * @param element - The element the block renders into.
 * @param content - The source as it stands when the block mounts.
 * @param updates - Delivers each new source.
 * @returns A function that unmounts the block, or nothing.
 */
export type CodeBlockMount = (
  element: HTMLElement,
  content: CodeBlockContent,
  updates: CodeBlockUpdates
) => (() => void) | void;
