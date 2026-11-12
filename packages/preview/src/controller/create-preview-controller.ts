// The preview controller: the behavior of the preview with no UI of its own.
// It holds what is selected, the scenario, the option values, which target
// panes are shown (html's among them, where the kit builds html), whether each
// has loaded and how large its content is, the
// scenario editor's tree and the regeneration of the scratch story, and it owns the iframes: a shell
// hands it elements to mount them in and never speaks to them itself, the
// selection's panes and detached panes of any story alike. It keeps the
// selection, the scenario, the root props, the visible targets, the story
// panes' width and the option values in the host page's query parameters once
// a person acts, and
// the global option values in local storage when the kit asks.
// A shell's own options ride along, namespaced under `shell.`, and never
// reach the iframes. Every input is passed in, so it runs the same in a
// browser and in a test.

import {
  acceptsOptionValue,
  optionDefaults,
  shellOptionId,
  type OptionValue,
  type PreviewOption,
  type PreviewShellOption,
} from '../options.js';
import {
  catalogMessage,
  codeFrameUrl,
  codeMessage,
  componentFrameUrl,
  globalsMessage,
  isPreviewMessage,
  markupMessage,
  PREVIEW_MESSAGE,
  PREVIEW_TARGETS,
  propsMessage,
  readContentSize,
  setStoryMessage,
  standaloneFrameUrl,
  viewFrameUrl,
  type PreviewCatalogPayload,
  type PreviewContentSize,
  type PreviewScriptedTarget,
  type PreviewTarget,
} from '../protocol.js';
import {
  defaultScenarioId,
  nodeAddSlots,
  nodeSlots,
  storyFrameKey,
  type PreviewCatalog,
  type PreviewComponent,
  type PreviewScenario,
  type PreviewStoryReference,
} from './catalog.js';
import {
  cleanRecord,
  DEFAULT_SLOT,
  ensureIds,
  insertAt,
  isContainer,
  moveNode,
  nodeAt,
  pathKey,
  removeAt,
  resolveSortableMove,
  seedComponentNode,
  seedRoot,
  slotsKey,
  stableStringify,
  toPayload,
  updateAt,
  type DropTarget,
  type EditorNode,
  type EditorState,
  type SortableListAddress,
  type Step,
} from './editor-tree.js';
import type { CodeBlockContent, CodeBlockLanguage } from '../views.js';
import type { RegenerationTransport } from './regeneration.js';
import type {
  HtmlSourceRequest,
  HtmlSourceResponse,
  HtmlSourceTransport,
  ScenarioHtmlSourceLoader,
} from './html-source.js';
import {
  isPlaceholder,
  printSourceStory,
  resolveSourceStory,
  type PreviewTargetCode,
} from './source.js';
import type { PreviewPersistence } from '../lib/types.js';
import {
  changedProps,
  isPaneWidth,
  parseTargets,
  parseOptionValue,
  parsePaneWidth,
  parseProps,
  readStoredOptions,
  readUrlState,
  storageKey,
  writeStoredOptions,
  writeUrlState,
  type PreviewStorage,
} from './persistence.js';

/** The time edits coalesce for before the preview regenerates what they
 *  change, in milliseconds: the scratch story, and a story's html from the
 *  development server. */
export const REGENERATION_DEBOUNCE_MILLISECONDS = 250;

/** The story id the regenerated scratch story is mounted under. */
export const SCRATCH_STORY_ID = 'scratch';

/**
 * The attribute the controller sets on an iframe it mounted once the iframe
 * shows its first content, and takes away while it loads again. Until then
 * the iframe is hidden; a shell's CSS can show a loading note beside one
 * without it.
 */
export const PREVIEW_FRAME_SHOWN_ATTRIBUTE = 'data-preview-shown';

/**
 * An option a shell shows a control for: one of the kit's, or one the shell
 * declared for itself, whose id is namespaced under `shell.` and whose value
 * stays in the host page.
 */
export interface PreviewOptionDescriptor extends Omit<PreviewOption, 'apply'> {
  /** Whether the option is the kit's or the shell's own. */
  origin: 'kit' | 'shell';
}

/** What the preview shows: a component story or a custom view. */
export type PreviewSelection =
  | { kind: 'component'; id: string }
  | { kind: 'view'; id: string };

/** A preview iframe: a scripted target's pane, the html pane or the custom-view pane. */
export type PreviewFrameTarget = PreviewTarget | 'view';

/** Whether a mounted iframe has announced that it listens for messages. */
export type PreviewFrameReadiness = 'loading' | 'ready';

/** One call a story made of one of its events, as a pane recorded it. */
export interface PreviewEvent {
  /** Its number among the events recorded, for a stable key. */
  id: number;
  /** The pane it was recorded in. */
  target: PreviewFrameTarget;
  /** The event: the function prop the story called. */
  name: string;
  /** A readable, one-line summary of what it was called with. */
  payload: string;
  /** When, in milliseconds since the epoch. */
  time: number;
}

/** How many recorded events `state.events` keeps. */
const EVENT_LOG_LENGTH = 100;

/** Where the regeneration of the scratch story stands. */
export interface PreviewRegenerationStatus {
  /** `pending` from an edit until the story is written and the panes reloaded. */
  status: 'idle' | 'pending' | 'error';
  /** Why the last regeneration failed, while `status` is `error`. */
  message?: string;
}

/** The scenario editor's state. */
export interface PreviewEditorState {
  /** Whether a shell shows the editor. */
  open: boolean;
  /** The tree being edited: the story's component, its props and its slot
   *  content. Present while the editor is open or the Empty scenario is shown. */
  tree?: EditorState;
  /**
   * Whether the tree's slot content differs from what it was seeded with:
   * a node inserted, removed, moved or replaced, a nested node's props or a
   * text changed. The root's props are not counted, as they live in `props`
   * and the address. Content is compared by value, so an edit undone by hand
   * counts as no change. A change of the root's text, which `props` shows as
   * `children`, counts too. `false` without a tree, and again once the tree
   * is seeded afresh (another story, or another scenario with the editor
   * open). While it is `true` the address may not reproduce the panes, which
   * show the edited content.
   */
  modified: boolean;
}

/**
 * Where the html source of what the panes show stands: `ready` with the
 * markup, `loading` while it is being printed, or `unavailable` with the
 * reason, such as a story holding a part that has no markup, or a static
 * build asked for props it printed no html for.
 */
export type PreviewHtmlSource =
  | {
      status: 'ready';
      source: string;
      /** The styles the kit's build wrote for the components the markup
       *  renders, which the html pane shows it under. */
      stylesheet?: string;
      /** What the markup could not work out at rest and left out, such as
       *  an expression reading the component's script state, so that part
       *  shows at a default. Absent when there is nothing to name. */
      warnings?: string[];
    }
  | { status: 'loading' }
  | { status: 'unavailable'; reason: string };

/** The code of what the selection's panes show. */
export interface PreviewCode {
  /**
   * The code a consumer writes for the story, per target the story
   * renders in (`targets.supported`), html aside: the component with the props the
   * panes show and its slot content, or the editor's tree while it holds
   * one, importing from the kit's package entry for each target. A prop is
   * left out while it holds the component's declared default. Printed as the
   * state changes, so it is always present.
   */
  targets: PreviewTargetCode;
  /** The markup the story renders to, at rest, for a reader who works
   *  without a framework. */
  html: PreviewHtmlSource;
}

/**
 * The preview's state as a shell reads it. Every field is plain data: a
 * snapshot is immutable, and a new one replaces it on each change, with the
 * unchanged fields kept by reference.
 */
export interface PreviewState {
  selection: PreviewSelection;
  /** The selected scenario's id; `''` is the anonymous default. */
  scenario: string;
  /**
   * The root props the selection's panes show now: the scenario's over the
   * component's defaults, then whatever `setProps` or the editor's root set.
   * While the editor holds a tree, a string `children` the story draws its
   * default slot from is the root's text: `children` is the text while the
   * root's default slot holds one text node and nothing else, and absent
   * otherwise, as other content in that slot takes its place on screen. A
   * story with default-slot content of its own shows that content and not
   * `children`, so its props carry no `children` then. While a view is
   * selected, the last story's.
   */
  props: Record<string, unknown>;
  /** Every option's current value, the story's own defaults applied, keyed by
   *  option id; a shell's own options under their `shell.` ids. */
  options: Record<string, OptionValue>;
  /** The options a shell hides the controls of: those the selected story marks
   *  unavailable, and every story option while a view is selected. */
  unavailableOptions: string[];
  /**
   * The story panes, by what each renders in: the kit's scripted targets, and
   * `html` after them where the kit builds html. The html pane shows the
   * markup in `code.html`, with the kit's stylesheets and options and no
   * behavior; every story supports it.
   */
  targets: {
    /** What the selected story renders in, among the kit's. */
    supported: PreviewTarget[];
    /** What is turned on among the kit's, whether or not the story supports it. */
    visible: PreviewTarget[];
    /** The panes a shell mounts: the supported ones that are turned on, in order. */
    panes: PreviewTarget[];
  };
  /**
   * The width a shell lays each of the selection's story panes out at, in
   * CSS pixels, so a component that responds to its width shows as it does
   * on a screen that wide: one of `catalog.paneWidths`, or any width a link
   * names. Absent while the panes fit the space the shell gives them. A
   * shell decides how a pane wider than its space shows, such as scrolling
   * across it. It outlasts the story, and a view's pane does not follow it.
   */
  paneWidth?: number;
  /** The readiness of the selection's panes, by target (`html` among
   *  them), and of the view pane under `view`. */
  frames: Partial<Record<PreviewFrameTarget, PreviewFrameReadiness>>;
  /** The readiness of the detached story panes `frames.mountStory` mounted,
   *  by the key `storyFrameKey(target, story)` gives. */
  storyFrames: Record<string, PreviewFrameReadiness>;
  /**
   * The size of what each of the selection's panes shows, by target, and
   * of the view pane under `view`, as the pane last reported it: its story
   * or view with the space the kit's canvas puts around it, in whole CSS
   * pixels. A shell that sizes a pane to its content sets the iframe's height
   * to `height`. An entry appears once the pane has rendered, keeps its last
   * size while the pane reloads, and goes when the pane is unmounted. The
   * width is the content's at the pane's current width, as block content
   * fills the pane.
   */
  frameSizes: Partial<Record<PreviewFrameTarget, PreviewContentSize>>;
  /** What each of the selection's panes threw as its story rendered, by
   *  target: the error's message, shown in the story's place. An entry
   *  goes when the pane mounts a story that renders, and when the pane is
   *  unmounted. */
  frameErrors: Partial<Record<PreviewFrameTarget, string>>;
  /** The events the selection's panes recorded, oldest first and the last
   *  hundred at most: each call a story made of one of its events
   *  (`PreviewComponent.events`). Cleared when another story or a view is
   *  selected, and by `actions.clearEvents`. */
  events: PreviewEvent[];
  /** The size of what each detached story pane shows, as `frameSizes` holds
   *  the selection's, by the key `storyFrameKey(target, story)` gives. */
  storyFrameSizes: Record<string, PreviewContentSize>;
  editor: PreviewEditorState;
  regeneration: PreviewRegenerationStatus;
  /** The code of what the selection's panes show, per target and as
   *  html. Absent while a view is selected. */
  code?: PreviewCode;
}

/** What `createNode` makes: a text leaf, a plain HTML tag, or a component. */
export type PreviewNodeRequest =
  | { kind: 'text'; value: string }
  | { kind: 'html'; tag: string }
  | {
      kind: 'component';
      /** The component's export name. */
      name: string;
      /** What the component comes in with: nothing (`empty`, the default), its
       *  curated defaults and slot content (`default`), or a scenario's props
       *  over its defaults. A component with no slot content and no scenarios
       *  always comes in with its defaults. */
      importAs?: 'empty' | 'default' | { scenario: string };
    };

/** Where a node is inserted: into `slot` of the node at `parent` (the root's
 *  slots when empty), before `index`, or at the end when `index` is omitted. */
export interface PreviewInsertTarget {
  parent: Step[];
  slot: string;
  index?: number;
}

/** What a shell's sortable lists report when a node is dropped. */
export interface PreviewSortableDrop {
  /** The list the node was dragged from. */
  source: SortableListAddress;
  /** The list it was dropped in. */
  target: SortableListAddress;
  /** Whether the two are the same list. */
  sameList: boolean;
  /** The node's index in the source list. */
  fromIndex: number;
  /** The index it was dropped at in the target list. */
  toIndex: number;
}

/** The timers the controller debounces with; the global ones by default. */
export interface PreviewTimers {
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** What `createPreviewController` takes. */
export interface PreviewControllerOptions {
  /** The kit's catalog. */
  catalog: PreviewCatalog;
  /** The kit's preview options. */
  options: PreviewOption[];
  /** The shell's own options, as it declares them; the controller namespaces
   *  their ids under `shell.`. */
  shellOptions?: PreviewShellOption[];
  /** Carries the scratch story to whatever writes it. Without one, the
   *  preview cannot regenerate and `capabilities.regeneration` is `false`. */
  regeneration?: RegenerationTransport;
  /** Prints the html of any story, as the development server does. Asked
   *  once a story's changes pause, and aborted when the story changes again. */
  htmlSource?: HtmlSourceTransport;
  /** Reads the html printed ahead of time for each scenario, as the static
   *  build serves it. Used without `htmlSource`; the html of props that differ
   *  from a scenario's, or of the editor's tree, is then unavailable. */
  scenarioHtmlSources?: ScenarioHtmlSourceLoader;
  /** The window the iframes post their messages to, and whose location holds
   *  the preview's query parameters; the global one by default. */
  window?: Window;
  /** Where the controller remembers what a person chose: the query parameters
   *  alone (`'url'`, the default), or also the global option values in local
   *  storage, per kit name (`'url-and-local-storage'`). */
  persistence?: PreviewPersistence;
  /** The storage `'url-and-local-storage'` uses; the window's local storage by default. */
  storage?: PreviewStorage;
  /** The timers to debounce with; the global ones by default. */
  timers?: PreviewTimers;
  /** The URL the preview's pages are served under, ending in `/`, such as
   *  `https://example.com/kit/`: the iframes load their pages from it. It
   *  is fixed when the controller is created, so a shell that changes the
   *  host page's path or hash for its own routing does not move the iframes.
   *  `/`, the root of the host page's origin, by default. */
  baseUrl?: string;
}

/** The preview's behavior, for a shell to render. */
export interface PreviewController {
  /** The version of this contract. */
  readonly apiVersion: 1;
  /** The kit's catalog, static for the controller's lifetime. */
  readonly catalog: PreviewCatalog;
  /** The options a shell shows controls for: the kit's, then the shell's own. */
  readonly options: PreviewOptionDescriptor[];
  readonly capabilities: {
    /** Whether the scratch story can be regenerated, which the editor and the
     *  Empty scenario need. False in a static build. */
    regeneration: boolean;
  };
  /** The current state. */
  getState(): PreviewState;
  /**
   * Call `listener` with each new state.
   *
   * @returns A function that stops the calls.
   */
  subscribe(listener: (state: PreviewState) => void): () => void;
  actions: {
    /**
     * Show a component's story, on its baseline scenario, or with `props`
     * over its defaults when given. The option values the baseline scenario
     * sets are set as `pickScenario` sets them. A component that is not
     * standalone and an unknown id are ignored.
     */
    selectComponent(id: string, props?: Record<string, unknown>): void;
    /** Show a custom view. Unknown ids are ignored. */
    selectView(id: string): void;
    /**
     * Show what `selection` names: a component's story on its baseline
     * scenario, or a custom view. One navigation control can hand over the
     * selection it lists without telling the two apart.
     *
     * @example
     * ```ts
     * controller.actions.select({ kind: 'view', id: 'swatches' });
     * ```
     */
    select(selection: PreviewSelection): void;
    /**
     * Pick a scenario of the selected story; `''` is the anonymous default.
     * The option values the scenario sets (`PreviewScenario.options`) are set
     * as `setOption` sets them, so the panes, the controls and the address
     * follow; the values it does not set stay as they are, and picking
     * another scenario keeps them, apart from those the next one sets. The
     * Empty scenario is ignored where the preview cannot regenerate.
     */
    pickScenario(id: string): void;
    /** Set an option's value. A story option's value lasts until another story is selected. */
    setOption(id: string, value: OptionValue): void;
    /**
     * Replace the selected story's root props with `props`, which are not
     * merged into the current ones. They reach the panes live, with no
     * regeneration, whether or not the editor is open; the editor's root
     * takes them too. While the editor holds a tree, `children` is the
     * root's text, as `state.props` shows it: a new string replaces the
     * content of the root's default slot with that one text, and leaving
     * `children` out removes a lone text, each an edit of the tree's content
     * that regenerates the story; content other than a lone text stays while
     * `children` is left out. A story with default-slot content of its own
     * takes no `children` then. Props that are `undefined` are dropped. Ignored
     * while a view is selected; picking a scenario or a story seeds them
     * afresh.
     *
     * @example
     * ```ts
     * const { props } = controller.getState();
     * controller.actions.setProps({ ...props, variant: 'ghost' });
     * ```
     */
    setProps(props: Record<string, unknown>): void;
    /** Turn a scripted target's pane, or the html pane, on or off. The choice
     *  outlasts the story. */
    setTargetVisible(target: PreviewTarget, visible: boolean): void;
    /**
     * Lay the story panes out at `width` CSS pixels, or, with `undefined`,
     * fit them to the shell's space again (`state.paneWidth`). A width that
     * is not a whole number from 1 to `MAXIMUM_PANE_WIDTH` (7680) is
     * ignored. The choice outlasts the story.
     *
     * @example
     * ```ts
     * const medium = controller.catalog.paneWidths.find((paneWidth) => paneWidth.label === 'medium');
     * controller.actions.setPaneWidth(medium?.width);
     * ```
     */
    setPaneWidth(width: number | undefined): void;
    /** Empty the log of recorded events. */
    clearEvents(): void;
  };
  editor: {
    /** Open the editor on the selected story, seeding its tree from the story's content. */
    open(): void;
    /** Close the editor. Its tree stays as it is until another story or scenario is selected. */
    close(): void;
    /**
     * Make a node to insert, by the catalog's component data.
     *
     * @param request - What to make: a text leaf, an HTML tag, or a
     *   component by its export name.
     * @returns The tree's node: `{ kind: 'text', value }`,
     *   `{ kind: 'html', tag, props, slots }`, or, for a component,
     *   `{ kind: 'element', component, props, slots }`.
     */
    createNode(request: PreviewNodeRequest): EditorNode;
    insert(target: PreviewInsertTarget, node: EditorNode): void;
    /** Move the node at `from` to `to`, whose index is counted before the node
     *  is taken out, as a drop reports it; a move into the node's own subtree
     *  is ignored. */
    move(from: Step[], to: DropTarget): void;
    /**
     * Move the node at `path` within its slot by `offset` places: `-1` one
     * up, `1` one down. The move stops at either end of the slot, and a node
     * already there stays put.
     *
     * @example
     * ```ts
     * controller.editor.moveBy(path, -1); // one place up
     * ```
     */
    moveBy(path: Step[], offset: number): void;
    /** Put `node` in place of the node at `path`. */
    replace(path: Step[], node: EditorNode): void;
    remove(path: Step[]): void;
    /** Replace the props of the node at `path` with `props`, which are not
     *  merged into the node's current ones. The empty path is the root: it
     *  does what `actions.setProps(props)` does, live, without a regeneration,
     *  except that the root's content, and so its `children`, stays as it
     *  is, as the tree's root props never hold `children`. */
    setNodeProps(path: Step[], props: Record<string, unknown>): void;
    /** Set the value of the text node at `path`. */
    setText(path: Step[], text: string): void;
    /** The move a sortable drop amounts to. */
    resolveDrop(drop: PreviewSortableDrop): { from: Step[]; to: DropTarget };
  };
  frames: {
    /**
     * Mount a scripted target's pane, or the html pane, inside `element`: an
     * iframe with no size of its own, which the shell sizes. The controller
     * owns the iframe: it loads it, reloads a scripted target's after each
     * regeneration and answers it. The html pane shows the markup of
     * `code.html` as it changes, keeping what it shows while the next is
     * printed and saying why when there is none; it runs none of the story's
     * behavior. The pane's readiness reaches subscribers after this call
     * returns, never during it, and the size of what it shows reaches
     * `frameSizes` once it renders.
     *
     * @returns A function that unmounts the pane.
     */
    mount(element: HTMLElement, target: PreviewTarget): () => void;
    /**
     * Mount a custom view's pane inside `element`, as `mount` mounts a
     * target's: a bare iframe the shell sizes, its readiness reported after
     * this call returns.
     *
     * @returns A function that unmounts the pane.
     */
    mountView(element: HTMLElement, viewId: string): () => void;
    /**
     * Mount a read-only pane of any story inside `element`, apart from the
     * selection: a bare iframe the shell sizes, as `mount` makes. Its props
     * are the scenario's over the component's defaults, then `story.props`
     * over those. `scenario` omitted is the story's starting scenario, as
     * selecting the story picks it, and `''` the anonymous default. The pane
     * follows the global options; its story options are the component's own,
     * as selecting it would seed them, and the option values its scenario
     * sets stay over both. It never shows the editor's content and is not
     * reloaded by a regeneration. Its readiness is reported in
     * `storyFrames` under `storyFrameKey(target, story)`, after this call
     * returns, and the size of what it shows in `storyFrameSizes` under the
     * same key.
     *
     * @param element - The element to append the iframe to.
     * @param target - The target to render the story in.
     * @param story - The story: a browseable component's id, a scenario and props.
     * @returns A function that unmounts the pane.
     * @throws When the component is unknown or not standalone, the target is
     *   not among its targets, or the scenario is unknown or the Empty one,
     *   which renders through the selection's regenerated story.
     * @example
     * ```ts
     * for (const scenario of component.scenarios.filter((scenario) => !scenario.empty)) {
     *   const cell = grid.appendChild(document.createElement('div'));
     *   controller.frames.mountStory(cell, 'react', { component: component.id, scenario: scenario.id });
     * }
     * ```
     */
    mountStory(
      element: HTMLElement,
      target: PreviewScriptedTarget,
      story: PreviewStoryReference
    ): () => void;
    /**
     * Mount the kit's code block inside `element`, showing `target`'s source
     * of the selection: an iframe the shell sizes, which the block fills and
     * scrolls as it likes. It follows the source as the story, its props and
     * its content change, and the global option values: a story option sets
     * nothing in a code block. For a kit that names a code block
     * (`catalog.codeBlock`); its readiness and size are the block's own and
     * reach no state.
     *
     * @returns A function that unmounts the block.
     */
    mountCode(element: HTMLElement, target: PreviewTarget): () => void;
    /**
     * Tell the kit's code blocks whether the shell wraps its code panes'
     * long lines, as `wrap` in their content; false until a shell says. A
     * shell with a wrap choice calls it as the choice changes.
     */
    wrapCode(wrap: boolean): void;
    /**
     * Load the selection's pane for `target` again: its readiness goes back
     * to loading until it answers, and it shows the selection as it is now.
     */
    reload(target: PreviewFrameTarget): void;
    /**
     * The address of the selection's pane for a target opened on its own,
     * outside the preview: the story it shows now - the scratch story while
     * the editor's content renders - with its props and the option values.
     * It follows nothing after it opens.
     */
    standaloneUrl(target: PreviewScriptedTarget): string;
  };
  /** Unmount every pane, drop a pending regeneration and stop listening. */
  dispose(): void;
}

/** Each target's source language, as a code block's highlighter names it. */
const CODE_LANGUAGES: Record<PreviewTarget, CodeBlockLanguage> = {
  react: 'tsx',
  vue: 'vue',
  svelte: 'svelte',
  html: 'html',
};

interface MountedFrame {
  target: PreviewFrameTarget;
  iframe: HTMLIFrameElement;
  /** A detached story pane's story; absent for the selection's panes. */
  story?: {
    /** Its readiness key in `storyFrames`. */
    key: string;
    component: PreviewComponent;
    /** The id the pane mounts the story by: the component's, or its
     *  scenario's own story when that has content of its own. */
    id: string;
    props: Record<string, unknown>;
    /** The option values its scenario sets, over the global ones. */
    options: Record<string, OptionValue>;
  };
  /** The newest of the pane's own write-backs the host has taken (the
   *  `write` its events carry), which each props message to it answers;
   *  0 before the first, and again once the pane announces ready. */
  answered?: number;
}

/** A story's props without its slot content, which the Empty scenario strips. */
function withoutContent(
  props: Record<string, unknown>
): Record<string, unknown> {
  const { children: _children, ...rest } = props;
  return rest;
}

/** The text of a tree's root when its default slot holds one text node and
 *  nothing else. */
function rootText(tree: EditorState): string | undefined {
  const nodes = tree.slots[DEFAULT_SLOT];
  return nodes?.length === 1 && nodes[0].kind === 'text'
    ? nodes[0].value
    : undefined;
}

function withoutUndefined(
  props: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(props))
    if (value !== undefined) out[name] = value;
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameTargets(a: PreviewTarget[], b: PreviewTarget[]): boolean {
  return (
    a.length === b.length && a.every((target, index) => target === b[index])
  );
}

const DEFAULT_TIMERS: PreviewTimers = {
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * The props a scripted pane mounts its story with: the story's, less each
 * prop it unsets with `null`, which the pane leaves out as the story's code
 * does, so the component's own default applies. A two-way prop given `null`
 * stays: the story controls it at `null`, as its code binds it.
 *
 * @param props - The story's root props.
 * @param component - The story's root component, for its two-way props.
 * @returns The props without those unset with `null`.
 */
function paneProps(
  props: Record<string, unknown>,
  component: Pick<PreviewComponent, 'bindings'> | undefined
): Record<string, unknown> {
  const twoWay = new Set(
    (component?.bindings ?? []).map((binding) => binding.prop)
  );
  return Object.fromEntries(
    Object.entries(props).filter(
      ([name, value]) => value !== null || twoWay.has(name)
    )
  );
}

/**
 * Create a preview controller.
 *
 * @param controllerOptions - The catalog, the options and the environment.
 * @returns The controller.
 * @example
 * ```ts
 * const controller = createPreviewController({
 *   catalog: catalogFromManifest(manifest, views),
 *   options: previewOptions,
 *   regeneration: createFetchRegenerationTransport(),
 * });
 * const stop = controller.subscribe((state) => render(state));
 * controller.actions.selectComponent('components-button');
 * ```
 */
export function createPreviewController(
  controllerOptions: PreviewControllerOptions
): PreviewController {
  const { catalog, regeneration } = controllerOptions;
  const options: PreviewOptionDescriptor[] = [
    ...controllerOptions.options.map(({ apply: _apply, ...option }) => ({
      ...option,
      origin: 'kit' as const,
    })),
    ...(controllerOptions.shellOptions ?? []).map((option) => ({
      ...option,
      id: shellOptionId(option.id),
      scope: 'global' as const,
      origin: 'shell' as const,
    })),
  ];
  const shellOptionIds = new Set(
    options
      .filter((option) => option.origin === 'shell')
      .map((option) => option.id)
  );
  const hostWindow =
    controllerOptions.window ?? (globalThis as { window?: Window }).window;
  const timers = controllerOptions.timers ?? DEFAULT_TIMERS;
  const baseUrl = controllerOptions.baseUrl ?? '/';
  const storage =
    controllerOptions.persistence === 'url-and-local-storage'
      ? resolveStorage()
      : undefined;
  const storedOptionsKey = storageKey(catalog.kitName);

  function resolveStorage(): PreviewStorage | undefined {
    if (controllerOptions.storage) return controllerOptions.storage;
    try {
      // Reading `localStorage` itself throws where storage is blocked.
      return hostWindow?.localStorage ?? undefined;
    } catch {
      return undefined;
    }
  }

  const listeners = new Set<(state: PreviewState) => void>();
  const frames: MountedFrame[] = [];

  const stories = catalog.components.filter(
    (component) => component.standalone
  );
  // The stories a reader browses: an unlisted one is reachable at its address
  // and selectable by id, but never listed or selected first.
  const listedStories = stories.filter((component) => !component.unlisted);
  const componentById = (id: string): PreviewComponent | undefined =>
    catalog.components.find((component) => component.id === id);
  const componentByName = (name: string): PreviewComponent | undefined =>
    catalog.components.find((component) => component.name === name);

  // The catalog a custom view builds its context from: the browseable stories.
  const catalogPayload: PreviewCatalogPayload = {
    kitName: catalog.kitName,
    sources: catalog.sources,
    components: listedStories.map((component) => ({
      id: component.id,
      title: component.title,
      source: component.source,
    })),
  };

  // --- what the state derives from --------------------------------------------
  let globalValues = optionDefaults(options, 'global');
  let storyOverrides: Record<string, OptionValue> = {};
  const kitTargets = PREVIEW_TARGETS.filter((target) =>
    catalog.targets.includes(target)
  );
  const visibleTargets = new Set<PreviewTarget>(PREVIEW_TARGETS);
  const storyOptionIds = options
    .filter((option) => option.scope === 'story')
    .map((option) => option.id);
  // The root props the selected scenario seeded: the address carries the
  // props only while they differ from these.
  let seededProps: Record<string, unknown> = {};
  // The editor tree's slot content as it was seeded, for `editor.modified`.
  let seededSlots = '';
  // Whether the panes render the regenerated scratch story or the real one.
  let scratchActive = false;
  // The panes' story mounts so far: each set-story the host broadcasts is one.
  let storyMount = 0;
  let reloadCount = 0;
  let regenerationTimer: unknown = null;
  let regenerationSequence = 0;

  function storyDefaultsFor(
    component: PreviewComponent | undefined
  ): Record<string, OptionValue> {
    const base = optionDefaults(options, 'story');
    for (const [id, value] of Object.entries(component?.options ?? {})) {
      if (value !== false) base[id] = value;
    }
    return base;
  }

  function unavailableOptionsFor(
    component: PreviewComponent | undefined
  ): string[] {
    return Object.entries(component?.options ?? {})
      .filter(([, value]) => value === false)
      .map(([id]) => id);
  }

  function mergedOptions(
    component: PreviewComponent | undefined
  ): Record<string, OptionValue> {
    return {
      ...globalValues,
      ...storyDefaultsFor(component),
      ...storyOverrides,
    };
  }

  /** The values the iframes apply: the kit's options alone. */
  function kitValues(
    values: Record<string, OptionValue>
  ): Record<string, OptionValue> {
    if (shellOptionIds.size === 0) return values;
    const kit: Record<string, OptionValue> = {};
    for (const [id, value] of Object.entries(values))
      if (!shellOptionIds.has(id)) kit[id] = value;
    return kit;
  }

  /** The kit's global option values, for a code block: it shows source, not
   *  a story, so a story option has nothing there to set. */
  function codeValues(
    values: Record<string, OptionValue>
  ): Record<string, OptionValue> {
    const global = { ...kitValues(values) };
    for (const id of storyOptionIds) delete global[id];
    return global;
  }

  /** The values a detached pane of `component` applies: the global values,
   *  the story options as selecting the component would seed them, and the
   *  values its scenario sets over those. */
  function detachedOptions(
    component: PreviewComponent,
    scenarioValues: Record<string, OptionValue> = {}
  ): Record<string, OptionValue> {
    return kitValues({
      ...globalValues,
      ...storyDefaultsFor(component),
      ...scenarioValues,
    });
  }

  /** The option values a scenario of `component` sets that apply to it: the
   *  kit's options it names, with a value each accepts, less those the
   *  component makes unavailable. */
  function scenarioOptionValues(
    component: PreviewComponent,
    scenarioId: string
  ): Record<string, OptionValue> {
    const carried = component.scenarios.find(
      (candidate) => candidate.id === scenarioId
    )?.options;
    const values: Record<string, OptionValue> = {};
    if (!carried) return values;
    const unavailable = unavailableOptionsFor(component);
    for (const [id, value] of Object.entries(carried)) {
      const option = options.find(
        (candidate) => candidate.id === id && candidate.origin === 'kit'
      );
      if (
        option &&
        !unavailable.includes(id) &&
        acceptsOptionValue(option, value)
      )
        values[id] = value;
    }
    return values;
  }

  /**
   * Set the option values a scenario of `component` carries, the way
   * `setOption` sets a value: a global one for the session, a story one over
   * the story's own until another story is selected. Picking a scenario
   * that carries none leaves every value as it is.
   *
   * @returns Which kinds of value changed: whether any did, and whether a
   *   global one did, which detached panes follow.
   */
  function applyScenarioOptions(
    component: PreviewComponent,
    scenarioId: string
  ): { changed: boolean; globalChanged: boolean } {
    const values = scenarioOptionValues(component, scenarioId);
    let globalChanged = false;
    for (const [id, value] of Object.entries(values)) {
      const option = options.find((candidate) => candidate.id === id)!;
      if (option.scope === 'story') {
        storyOverrides = { ...storyOverrides, [id]: value };
      } else {
        globalChanged ||= globalValues[id] !== value;
        globalValues = { ...globalValues, [id]: value };
      }
    }
    return { changed: Object.keys(values).length > 0, globalChanged };
  }

  function targetsFor(
    component: PreviewComponent | undefined
  ): PreviewState['targets'] {
    // Every story has an html pane where the kit builds html: one with no
    // markup says why.
    const supported = kitTargets.filter(
      (target) =>
        target === 'html' || (component?.targets.includes(target) ?? true)
    );
    const visible = kitTargets.filter((target) => visibleTargets.has(target));
    return {
      supported,
      visible,
      panes: visible.filter((target) => supported.includes(target)),
    };
  }

  /** The props an address may set: those the component declares, and the
   *  text of its default slot as `children` when it has one. */
  function addressableProps(
    component: PreviewComponent
  ): Pick<
    PreviewComponent['propTypes'][number],
    'name' | 'control' | 'options'
  >[] {
    const declaresChildren = component.propTypes.some(
      (propType) => propType.name === 'children'
    );
    return component.slots.default && !declaresChildren
      ? [...component.propTypes, { name: 'children', control: 'text' }]
      : component.propTypes;
  }

  /** The props as the address holds them: those that differ from the
   *  scenario's, and each prop of the scenario's the story leaves out as
   *  `null`, so that a link opens on what renders and stays short however
   *  much data the story's props hold. While the story renders from a tree
   *  (the editor, or Empty), `children` is the tree's content, which the
   *  address does not hold, so a missing `children` is not marked. */
  function addressedProps(
    component: PreviewComponent,
    props: Record<string, unknown>
  ): Record<string, unknown> {
    const addressable = new Set(
      addressableProps(component).map(({ name }) => name)
    );
    return changedProps(
      props,
      seededProps,
      (name) =>
        addressable.has(name) && !(name === 'children' && state.editor.tree)
    );
  }

  /**
   * Whether the story of the tree's root draws its default slot from the
   * string `children` prop, having no default-slot content of its own. The
   * editor holds that `children` as the root's text, so it can be edited,
   * wrapped or replaced like any node, and `state.props` shows the root's
   * lone text as `children`. A story with content of its own renders that
   * content and not `children`, so its tree's text is never `children`.
   */
  function drawsChildren(tree: EditorState): boolean {
    const root = componentByName(tree.root);
    const selected = selectedComponent();
    // The selection's own story is read as its scenario shows it.
    const shown =
      root !== undefined && selected?.name === root.name
        ? onScenario(root, state.scenario)
        : root;
    return !shown?.content?.default;
  }

  /** The root props a tree shows: its own, and, where the story draws its
   *  default slot from `children`, its root's lone text as `children`. */
  function treeProps(tree: EditorState): Record<string, unknown> {
    const text = drawsChildren(tree) ? rootText(tree) : undefined;
    return text === undefined ? tree.props : { ...tree.props, children: text };
  }

  function seedProps(
    component: PreviewComponent,
    scenarioId: string
  ): Record<string, unknown> {
    const scenario = component.scenarios.find(
      (candidate) => candidate.id === scenarioId
    );
    const props = { ...component.defaultProps, ...(scenario?.props ?? {}) };
    // The placeholder text a component with no content starts from is the
    // preview's own; a scenario that fills the default slot replaces it.
    if (
      scenario?.content?.default !== undefined &&
      component.previewDefaults?.children !== undefined &&
      !('children' in (scenario.props ?? {}))
    ) {
      delete props.children;
    }
    return props;
  }

  /** The scenario of `component` with slot content of its own, by id. */
  function contentScenario(
    component: PreviewComponent,
    scenarioId: string
  ): PreviewScenario | undefined {
    const scenario = component.scenarios.find(
      (candidate) => candidate.id === scenarioId
    );
    return scenario?.content === undefined ? undefined : scenario;
  }

  /** The id the panes mount `component`'s story by on a scenario: the
   *  scenario's own story when it has content of its own, else the
   *  component's. */
  function paneStoryId(
    component: PreviewComponent,
    scenarioId: string
  ): string {
    return contentScenario(component, scenarioId)?.story ?? component.id;
  }

  /** `component` as a scenario shows it: with the scenario's content in
   *  place of the story's, for a scenario that has its own. */
  function onScenario(
    component: PreviewComponent,
    scenarioId: string
  ): PreviewComponent {
    const scenario = contentScenario(component, scenarioId);
    return scenario ? { ...component, content: scenario.content } : component;
  }

  /** The component each scenario story renders, by the story's id. */
  const scenarioStoryComponents = new Map<string, PreviewComponent>(
    stories.flatMap((component) =>
      component.scenarios.flatMap((scenario) =>
        scenario.story === undefined
          ? []
          : [[scenario.story, component] as [string, PreviewComponent]]
      )
    )
  );

  const first = listedStories[0] ?? stories[0];
  seededProps = first ? seedProps(first, defaultScenarioId(first)) : {};
  let state: PreviewState = {
    selection: { kind: 'component', id: first?.id ?? '' },
    scenario: defaultScenarioId(first),
    props: seededProps,
    options: mergedOptions(first),
    unavailableOptions: unavailableOptionsFor(first),
    targets: targetsFor(first),
    frames: {},
    storyFrames: {},
    frameSizes: {},
    frameErrors: {},
    events: [],
    storyFrameSizes: {},
    editor: { open: false, modified: false },
    regeneration: { status: 'idle' },
  };

  function selectedComponent(): PreviewComponent | undefined {
    return state.selection.kind === 'component'
      ? componentById(state.selection.id)
      : undefined;
  }

  function commit(changes: Partial<PreviewState>): void {
    state = withCode({ ...state, ...changes });
    persist();
    postHtml();
    postCode();
    for (const listener of listeners) listener(state);
  }

  // --- the source ------------------------------------------------------------
  // The scripted targets' source is printed whenever what the panes show changes; the
  // html is asked of the server, or read from what the static build printed,
  // once per story, and a request for a story since replaced is dropped.
  let sourcedFrom:
    | (Pick<PreviewState, 'selection' | 'scenario' | 'props'> & {
        tree?: EditorState;
      })
    | undefined;
  let htmlKey: string | undefined;
  let htmlTimer: unknown = null;
  let htmlAbort: AbortController | undefined;
  let htmlSequence = 0;

  const STATIC_EDITED_REASON =
    'The static build prints html for the scenarios alone: there is none for changed props or edited content.';

  function cancelHtml(): void {
    if (htmlTimer !== null) {
      timers.clearTimeout(htmlTimer);
      htmlTimer = null;
    }
    htmlAbort?.abort();
    htmlAbort = undefined;
    htmlSequence += 1;
  }

  function htmlFrom(
    response: HtmlSourceResponse | undefined
  ): PreviewHtmlSource {
    if (response && 'markup' in response)
      return {
        status: 'ready',
        source: response.markup,
        ...(response.stylesheet === undefined
          ? {}
          : { stylesheet: response.stylesheet }),
        ...(response.warnings === undefined || response.warnings.length === 0
          ? {}
          : { warnings: response.warnings }),
      };
    if (response && 'missing' in response)
      return {
        status: 'unavailable',
        reason: `This story has no html: it holds ${response.missing.join('; ')}.`,
      };
    return {
      status: 'unavailable',
      reason: 'No html was printed for this scenario.',
    };
  }

  /** Land an html answer, unless the story changed since it was asked. */
  function settleHtml(sequence: number, html: PreviewHtmlSource): void {
    if (sequence !== htmlSequence || !state.code) return;
    commit({ code: { ...state.code, html } });
  }

  /** Start getting the html of a story, returning what the state shows meanwhile. */
  function requestHtml(
    component: PreviewComponent,
    request: HtmlSourceRequest,
    scenarioId: string,
    edited: boolean
  ): PreviewHtmlSource {
    cancelHtml();
    const sequence = htmlSequence;
    const htmlSource = controllerOptions.htmlSource;
    const scenarioHtmlSources = controllerOptions.scenarioHtmlSources;
    if (htmlSource) {
      htmlTimer = timers.setTimeout(() => {
        htmlTimer = null;
        const abort = new AbortController();
        htmlAbort = abort;
        htmlSource(request, abort.signal).then(
          (response) => settleHtml(sequence, htmlFrom(response)),
          (reason: unknown) => {
            if (abort.signal.aborted) return;
            settleHtml(sequence, {
              status: 'unavailable',
              reason: reason instanceof Error ? reason.message : String(reason),
            });
          }
        );
      }, REGENERATION_DEBOUNCE_MILLISECONDS);
      return { status: 'loading' };
    }
    if (scenarioHtmlSources) {
      if (edited)
        return { status: 'unavailable', reason: STATIC_EDITED_REASON };
      scenarioHtmlSources(component.id).then(
        (byScenario) => settleHtml(sequence, htmlFrom(byScenario[scenarioId])),
        (reason: unknown) =>
          settleHtml(sequence, {
            status: 'unavailable',
            reason: `No html was printed for this story: ${reason instanceof Error ? reason.message : String(reason)}`,
          })
      );
      return { status: 'loading' };
    }
    return {
      status: 'unavailable',
      reason: 'This preview has no way to print html.',
    };
  }

  /** `next` with the code of what its panes show, printed afresh when that changed. */
  function withCode(next: PreviewState): PreviewState {
    const tree = next.editor.tree;
    if (
      sourcedFrom &&
      sourcedFrom.selection === next.selection &&
      sourcedFrom.scenario === next.scenario &&
      sourcedFrom.props === next.props &&
      sourcedFrom.tree === tree
    )
      return next;
    sourcedFrom = {
      selection: next.selection,
      scenario: next.scenario,
      props: next.props,
      tree,
    };
    const component =
      next.selection.kind === 'component'
        ? componentById(next.selection.id)
        : undefined;
    if (!component) {
      cancelHtml();
      htmlKey = undefined;
      return next.code === undefined ? next : { ...next, code: undefined };
    }
    const scenario = component.scenarios.find(
      (candidate) => candidate.id === next.scenario
    );
    const story = resolveSourceStory(component, {
      props: next.props,
      scenario,
      tree,
    });
    const printed = printSourceStory(catalog, story, component.targets);
    const previous = next.code;
    const targets =
      previous &&
      Object.keys(printed).length === Object.keys(previous.targets).length &&
      component.targets.every(
        (target) => printed[target] === previous.targets[target]
      )
        ? previous.targets
        : printed;
    // The html pane shows an unfilled default slot's placeholder, as the
    // scripted panes do, though the printed code leaves it out.
    const placeholder =
      !tree &&
      !story.children &&
      typeof next.props.children === 'string' &&
      isPlaceholder(component, next.props.children, { scenario })
        ? ({ kind: 'text', value: next.props.children } as const)
        : undefined;
    const shownChildren = story.children ?? placeholder;
    const request: HtmlSourceRequest = {
      rootComponent: story.component,
      props: story.props,
      ...(shownChildren || Object.keys(story.named).length > 0
        ? {
            slots: {
              ...(shownChildren ? { default: shownChildren } : {}),
              ...(Object.keys(story.named).length > 0
                ? { named: story.named }
                : {}),
            },
          }
        : {}),
      ...(story.around ? { around: story.around } : {}),
    };
    // The static build printed the scenarios as they are seeded.
    const edited =
      tree !== undefined ||
      stableStringify(next.props) !== stableStringify(seededProps);
    const key = stableStringify([component.id, next.scenario, edited, request]);
    let html = previous?.html;
    if (key !== htmlKey || !html) {
      htmlKey = key;
      html = requestHtml(component, request, next.scenario, edited);
    }
    if (previous && previous.targets === targets && previous.html === html)
      return next;
    return { ...next, code: { targets, html } };
  }

  // --- persistence -----------------------------------------------------------
  // Off while the starting state is read back.
  let persisting = false;
  // Above zero while a shell's action runs. The address is the controller's to
  // write only from the first action on, so a page that is only opened, or a
  // shell's own page the controller has not been asked to change, keeps the
  // address it was opened with.
  let acting = 0;
  let ownsAddress = false;
  let lastStored: string | undefined;

  /** Run `work` as a shell's action: a change it commits claims the address. */
  function action<Parameters extends unknown[], Result>(
    work: (...parameters: Parameters) => Result
  ): (...parameters: Parameters) => Result {
    return (...parameters) => {
      acting += 1;
      try {
        return work(...parameters);
      } finally {
        acting -= 1;
      }
    };
  }

  /** The global values that differ from their defaults: what is remembered. */
  function changedGlobalValues(): Record<string, OptionValue> {
    const changed: Record<string, OptionValue> = {};
    for (const option of options) {
      const value = globalValues[option.id];
      if (
        option.scope === 'global' &&
        value !== undefined &&
        value !== option.default
      )
        changed[option.id] = value;
    }
    return changed;
  }

  /** The option values the URL keeps: the changed globals, and the selected
   *  story's own overrides that differ from its defaults. */
  function urlOptionValues(): Record<string, OptionValue> {
    const values = changedGlobalValues();
    const component = selectedComponent();
    if (!component) return values;
    const defaults = storyDefaultsFor(component);
    const unavailable = unavailableOptionsFor(component);
    for (const [id, value] of Object.entries(storyOverrides)) {
      if (!unavailable.includes(id) && value !== defaults[id])
        values[id] = value;
    }
    // A value the scenario sets that was changed back to its default since
    // goes in too, or opening the address would set the scenario's again.
    const merged = mergedOptions(component);
    for (const [id, value] of Object.entries(
      scenarioOptionValues(component, state.scenario)
    )) {
      if (merged[id] !== value) values[id] = merged[id];
    }
    return values;
  }

  function persist(): void {
    if (!persisting) return;
    if (acting > 0) ownsAddress = true;
    if (ownsAddress) writeUrl();
    storeOptions();
  }

  function storeOptions(): void {
    if (!storage) return;
    const changed = changedGlobalValues();
    const serialized = JSON.stringify(changed);
    if (serialized === lastStored) return;
    lastStored = serialized;
    writeStoredOptions(storage, storedOptionsKey, changed);
  }

  function writeUrl(): void {
    const location = hostWindow?.location;
    const history = hostWindow?.history;
    if (!location || typeof history?.replaceState !== 'function') return;
    const component = selectedComponent();
    const scenario =
      component && state.scenario !== defaultScenarioId(component)
        ? state.scenario
        : undefined;
    const changed = component
      ? addressedProps(component, state.props)
      : undefined;
    const props =
      changed && Object.keys(changed).length > 0 ? changed : undefined;
    const targets = kitTargets.every((target) => visibleTargets.has(target))
      ? undefined
      : kitTargets.filter((target) => visibleTargets.has(target));
    const search = writeUrlState(location.search, {
      selection: state.selection,
      scenario,
      props,
      targets,
      width: state.paneWidth,
      options: urlOptionValues(),
    });
    if (search === location.search.replace(/^\?/, '')) return;
    try {
      // Replace, not push: a change of option is no step to go back to.
      history.replaceState(
        history.state,
        '',
        `${location.pathname}${search ? `?${search}` : ''}${location.hash}`
      );
    } catch {
      // A page that cannot rewrite its URL keeps the state in memory alone.
    }
  }

  /** Whether the kit's landing entry is a view the catalog has. One it
   *  lacks is told of once, in the console, and the first story shows. */
  function landsOnView(): boolean {
    const landing = catalog.landing;
    if (landing?.kind !== 'view') return false;
    if (catalog.views.some((view) => view.id === landing.id)) return true;
    console.warn(
      `[preview] preview.landing names view '${landing.id}', which the views module does not register; the preview opens on the first story. The views: ${
        catalog.views.map((view) => view.id).join(', ') || 'none'
      }.`
    );
    return false;
  }

  /** Whether the kit's landing entry is a story the catalog has. */
  function landsOnComponent(): boolean {
    const landing = catalog.landing;
    return (
      landing?.kind === 'component' &&
      stories.some((component) => component.id === landing.id)
    );
  }

  /** Start from what the URL and storage say: stored globals, then the URL's
   *  values over them, the visible targets, its selection and scenario,
   *  its story options and its props. Where the address names no view or
   *  story, the kit's landing entry shows, else the first listed story. The
   *  address itself is left as it is. */
  function restore(): void {
    const fromUrl = readUrlState(hostWindow?.location?.search ?? '');
    const globalOptions = options.filter((option) => option.scope === 'global');
    const stored = storage
      ? readStoredOptions(storage, storedOptionsKey, globalOptions)
      : {};
    lastStored = storage ? JSON.stringify(stored) : undefined;
    const fromUrlGlobals: Record<string, OptionValue> = {};
    for (const option of globalOptions) {
      const raw = fromUrl.options[option.id];
      const value =
        raw === undefined ? undefined : parseOptionValue(option, raw);
      if (value !== undefined) fromUrlGlobals[option.id] = value;
    }
    globalValues = { ...globalValues, ...stored, ...fromUrlGlobals };

    const visible =
      fromUrl.targets === undefined
        ? undefined
        : parseTargets(fromUrl.targets, kitTargets);
    if (visible) {
      for (const target of kitTargets) {
        if (visible.includes(target)) visibleTargets.add(target);
        else visibleTargets.delete(target);
      }
    }
    const paneWidth =
      fromUrl.width === undefined ? undefined : parsePaneWidth(fromUrl.width);
    if (paneWidth !== undefined) state = { ...state, paneWidth };

    if (
      fromUrl.view !== undefined &&
      catalog.views.some((view) => view.id === fromUrl.view)
    ) {
      selectView(fromUrl.view);
    } else if (
      fromUrl.component !== undefined &&
      stories.some((component) => component.id === fromUrl.component)
    ) {
      selectComponent(fromUrl.component);
      const component = selectedComponent()!;
      const scenario = fromUrl.scenario;
      const known = component.scenarios.find(
        (candidate) => candidate.id === scenario
      );
      // Empty renders through a regeneration, which a static build cannot do.
      if (
        scenario === '' ||
        (scenario !== undefined && known && (!known.empty || regeneration))
      )
        pickScenario(scenario);
      // The address's values win over those the scenario sets.
      globalValues = { ...globalValues, ...fromUrlGlobals };
      const unavailable = unavailableOptionsFor(component);
      for (const option of options) {
        const raw = fromUrl.options[option.id];
        if (
          option.scope !== 'story' ||
          raw === undefined ||
          unavailable.includes(option.id)
        )
          continue;
        const value = parseOptionValue(option, raw);
        if (value !== undefined)
          storyOverrides = { ...storyOverrides, [option.id]: value };
      }
      const props =
        fromUrl.props === undefined
          ? undefined
          : parseProps(
              fromUrl.props,
              addressableProps(component),
              // The address holds the props that differ from the
              // scenario's, which a story rendering from a tree (Empty)
              // seeds without its content.
              seededProps,
              seededProps,
              catalog.colorTokens
            );
      if (props) setProps(props);
    } else if (landsOnView()) {
      selectView(catalog.landing!.id);
      globalValues = { ...globalValues, ...fromUrlGlobals };
    } else if (landsOnComponent()) {
      // The kit's landing story, on its scenario or its baseline, with the
      // values that scenario sets, the address's winning.
      const landing = catalog.landing!;
      selectComponent(landing.id);
      const scenario =
        landing.kind === 'component' ? landing.scenario : undefined;
      const known = selectedComponent()!.scenarios.find(
        (candidate) => candidate.id === scenario
      );
      // Empty renders through a regeneration, which a static build cannot
      // do: the story opens on its baseline, and the console says why.
      if (known && (!known.empty || regeneration)) pickScenario(known.id);
      else if (known?.empty)
        console.warn(
          `[preview] preview.landing names the scenario '${known.id}' of '${landing.id}', which renders through the development server alone; the static build opens the story on its baseline.`
        );
      globalValues = { ...globalValues, ...fromUrlGlobals };
    } else if (first) {
      // The first story shows on its baseline scenario, with the values that
      // scenario sets, the address's winning.
      applyScenarioOptions(first, defaultScenarioId(first));
      globalValues = { ...globalValues, ...fromUrlGlobals };
    }
    state = withCode({
      ...state,
      options: mergedOptions(selectedComponent()),
      targets: targetsFor(selectedComponent() ?? first),
    });
    persisting = true;
    storeOptions();
  }

  // --- the iframes -----------------------------------------------------------
  function postTo(frame: MountedFrame, message: unknown): void {
    frame.iframe.contentWindow?.postMessage(message, '*');
  }

  /** The selection's set-story message: the story, its props, its events
   *  and the two-way props a pane writes back itself, the scratch story's
   *  those of the editor's root component. Each message but a pane's answer
   *  to its ready (`fresh` false) is a new mount of the story, which the
   *  panes tag their events with: an event of a story since replaced writes
   *  nothing back. */
  function storyMessage(
    id: string,
    props: Record<string, unknown>,
    fresh = true
  ): ReturnType<typeof setStoryMessage> {
    if (fresh) storyMount += 1;
    const component = storyComponent(id);
    return setStoryMessage(
      id,
      paneProps(props, component),
      component?.events,
      // Only a binding whose change prop is a recorded event: a pane writes
      // back only what it then reports, so the host can answer each write.
      component?.bindings.flatMap((binding) =>
        binding.changeProp === undefined ||
        !component.events.includes(binding.changeProp)
          ? []
          : [{ prop: binding.prop, changeProp: binding.changeProp }]
      ),
      storyMount
    );
  }

  /** The id the panes mount the selected story by: its scenario's own
   *  story when that has content of its own, else the selection's. */
  function selectionStoryId(): string {
    const component = selectedComponent();
    return component
      ? paneStoryId(component, state.scenario)
      : state.selection.id;
  }

  /** The component the story `id` renders at its root: the story's own, or,
   *  for the scratch story, the editor's root component. */
  function storyComponent(id: string): PreviewComponent | undefined {
    return id === SCRATCH_STORY_ID
      ? state.editor.tree
        ? componentByName(state.editor.tree.root)
        : undefined
      : (componentById(id) ?? scenarioStoryComponents.get(id));
  }

  /** The panes' story's root component: the selection's, or the editor's
   *  root while the scratch story shows. */
  function shownComponent(): PreviewComponent | undefined {
    if (state.selection.kind !== 'component') return undefined;
    return storyComponent(
      scratchActive ? SCRATCH_STORY_ID : state.selection.id
    );
  }

  /**
   * Take the value a pane reports through a two-way prop's change callback
   * as the story's new prop, when the story gives the prop: a controlled
   * story then follows a click in any pane, every pane and the html with
   * it, as `setProps` does. A story that leaves the prop out lets the
   * component keep its own value, and an unchanged value changes nothing.
   */
  function writeBack(
    name: string,
    data: { value?: unknown; mount?: unknown }
  ): void {
    if (!('value' in data)) return;
    // An event the pane recorded under a story it has since been told to
    // replace.
    if (typeof data.mount === 'number' && data.mount !== storyMount) return;
    // Every two-way prop the story gives that reports through this change
    // prop and holds another value.
    const changed = (shownComponent()?.bindings ?? []).filter(
      (binding) =>
        binding.changeProp === name &&
        state.props[binding.prop] !== undefined &&
        stableStringify(state.props[binding.prop]) !==
          stableStringify(data.value)
    );
    if (changed.length === 0) return;
    // A change the story's reader made: it claims the address, as a shell's
    // action does.
    action(setProps)({
      ...state.props,
      ...Object.fromEntries(
        changed.map((binding) => [binding.prop, data.value])
      ),
    });
  }

  /** Post to the selection's scripted panes; a detached pane keeps its own
   *  story, and the html pane shows the markup `postHtml` sends it. */
  function broadcast(message: unknown): void {
    for (const frame of frames)
      if (!frame.story && frame.target !== 'html') postTo(frame, message);
  }

  /** Post the story's new root props to the selection's scripted panes,
   *  each message naming the newest of that pane's own write-backs the
   *  host has taken, so a pane keeps a later write of its own over them. */
  function broadcastProps(props: Record<string, unknown>): void {
    const shown = paneProps(props, shownComponent());
    for (const frame of frames)
      if (!frame.story && frame.target !== 'html')
        postTo(frame, propsMessage(shown, frame.answered ?? 0));
  }

  /** Post option values to the selection's panes, the html pane's included. */
  function broadcastGlobals(values: Record<string, OptionValue>): void {
    for (const frame of frames)
      if (!frame.story) postTo(frame, globalsMessage(kitValues(values)));
    for (const frame of codeFrames)
      if (frame.ready)
        frame.iframe.contentWindow?.postMessage(
          globalsMessage(codeValues(values)),
          '*'
        );
  }

  /** The html pane's message for the html the state holds. */
  function htmlPaneMessage(): ReturnType<typeof markupMessage> {
    const html = state.code?.html;
    if (html?.status === 'ready')
      return markupMessage(
        html.stylesheet === undefined
          ? { markup: html.source }
          : { markup: html.source, stylesheet: html.stylesheet }
      );
    if (html?.status === 'unavailable')
      return markupMessage({ reason: html.reason });
    return markupMessage({});
  }

  // The html the html panes were last sent, so each change is sent once.
  let postedHtml: PreviewHtmlSource | undefined;

  /** Send the html panes the state's html when it changed since last sent. */
  function postHtml(): void {
    const html = state.code?.html;
    if (html === postedHtml) return;
    postedHtml = html;
    if (!html) return;
    // A pane still loading gets the html when it answers the handshake.
    const message = htmlPaneMessage();
    for (const frame of frames)
      if (frame.target === 'html' && readinessOf(frame) === 'ready')
        postTo(frame, message);
  }

  // The events recorded so far, numbering each.
  let eventCount = 0;

  // --- the code blocks ----------------------------------------------------------
  // The kit's code block, one iframe per code pane, kept apart from the story
  // panes: it reaches no readiness or size in the state.
  interface CodeFrame {
    target: PreviewTarget;
    iframe: HTMLIFrameElement;
    ready: boolean;
  }
  const codeFrames: CodeFrame[] = [];

  /** Hide an iframe until it shows its first content: a frame's page would
   *  otherwise show the browser's blank canvas, then whatever it paints on the
   *  way. Hidden, it leaves the shell's ground (and any loading note the shell
   *  draws beneath it) in view. */
  function conceal(iframe: HTMLIFrameElement): void {
    iframe.style.visibility = 'hidden';
    iframe.removeAttribute(PREVIEW_FRAME_SHOWN_ATTRIBUTE);
  }

  /** Show an iframe whose first content has painted, marked for a shell's CSS. */
  function reveal(iframe: HTMLIFrameElement): void {
    iframe.style.removeProperty('visibility');
    iframe.setAttribute(PREVIEW_FRAME_SHOWN_ATTRIBUTE, '');
  }
  // Whether the shell wraps its code panes, which the code blocks follow.
  let codeWrap = false;

  /** What a code block shows for `target`: its source, or why it has none;
   *  with neither, the source is being printed. */
  function codeContent(target: PreviewTarget): CodeBlockContent {
    const language = CODE_LANGUAGES[target];
    const wrap = codeWrap;
    const code = state.code;
    if (target === 'html') {
      const html = code?.html;
      if (html?.status === 'ready')
        return { target, language, wrap, source: html.source };
      if (html?.status === 'unavailable')
        return { target, language, wrap, reason: html.reason };
      return { target, language, wrap };
    }
    const printed = code?.targets[target];
    return printed === undefined
      ? {
          target,
          language,
          wrap,
          reason: `The story does not render in ${target}.`,
        }
      : { target, language, wrap, source: printed };
  }

  // The source the code blocks were last sent, so each change is sent once.
  let postedCode: PreviewCode | undefined;

  /** Send each code block its target's source when it changed since last
   *  sent, or every block its content when `force`d. */
  function postCode(force = false): void {
    if (!force && state.code === postedCode) return;
    postedCode = state.code;
    for (const frame of codeFrames)
      if (frame.ready)
        frame.iframe.contentWindow?.postMessage(
          codeMessage(codeContent(frame.target)),
          '*'
        );
  }

  function mountCode(element: HTMLElement, target: PreviewTarget): () => void {
    const iframe = element.ownerDocument.createElement('iframe');
    iframe.setAttribute('title', `${target} code`);
    iframe.setAttribute(
      'src',
      codeFrameUrl(target, catalog.codeBlock?.framework, baseUrl)
    );
    conceal(iframe);
    element.appendChild(iframe);
    const frame: CodeFrame = { target, iframe, ready: false };
    codeFrames.push(frame);
    return () => {
      const index = codeFrames.indexOf(frame);
      if (index === -1) return;
      codeFrames.splice(index, 1);
      iframe.remove();
    };
  }

  /** Bring each detached pane up to the current global values. */
  function postDetachedGlobals(): void {
    for (const frame of frames) {
      if (frame.story)
        postTo(
          frame,
          globalsMessage(
            detachedOptions(frame.story.component, frame.story.options)
          )
        );
    }
  }

  function readinessOf(frame: MountedFrame): PreviewFrameReadiness | undefined {
    return frame.story
      ? state.storyFrames[frame.story.key]
      : state.frames[frame.target];
  }

  /** The state change that sets a frame's readiness, or clears it. */
  function withReadiness(
    frame: MountedFrame,
    readiness: PreviewFrameReadiness | undefined
  ): Partial<PreviewState> {
    if (frame.story) {
      const storyFrames = { ...state.storyFrames };
      if (readiness) storyFrames[frame.story.key] = readiness;
      else delete storyFrames[frame.story.key];
      return { storyFrames };
    }
    const next = { ...state.frames };
    if (readiness) next[frame.target] = readiness;
    else delete next[frame.target];
    return { frames: next };
  }

  function sizeOf(frame: MountedFrame): PreviewContentSize | undefined {
    return frame.story
      ? state.storyFrameSizes[frame.story.key]
      : state.frameSizes[frame.target];
  }

  /** The state change that sets the size of what a frame shows, or clears it. */
  function withSize(
    frame: MountedFrame,
    size: PreviewContentSize | undefined
  ): Partial<PreviewState> {
    if (frame.story) {
      const storyFrameSizes = { ...state.storyFrameSizes };
      if (size) storyFrameSizes[frame.story.key] = size;
      else delete storyFrameSizes[frame.story.key];
      return { storyFrameSizes };
    }
    const frameSizes = { ...state.frameSizes };
    if (size) frameSizes[frame.target] = size;
    else delete frameSizes[frame.target];
    return { frameSizes };
  }

  /** The state change that sets what a selection's pane threw, or clears it. */
  function withError(
    target: PreviewFrameTarget,
    message: string | undefined
  ): Partial<PreviewState> {
    const frameErrors = { ...state.frameErrors };
    if (message === undefined) delete frameErrors[target];
    else frameErrors[target] = message;
    return { frameErrors };
  }

  /** Whether two frames report their readiness under the same key. */
  function sameReadinessKey(a: MountedFrame, b: MountedFrame): boolean {
    return a.story
      ? b.story?.key === a.story.key
      : !b.story && b.target === a.target;
  }

  function mountFrame(
    element: HTMLElement,
    description: Omit<MountedFrame, 'iframe'>,
    title: string,
    source: string
  ): () => void {
    const iframe = element.ownerDocument.createElement('iframe');
    iframe.setAttribute('title', title);
    iframe.setAttribute('src', source);
    conceal(iframe);
    element.appendChild(iframe);
    const frame: MountedFrame = { ...description, iframe };
    frames.push(frame);
    // The new readiness is reported after the shell's mount call returns, so
    // no subscriber runs inside it: a shell that mounts in an effect reading
    // the state would otherwise see that state change within its own effect.
    // A pane unmounted before then is never reported.
    queueMicrotask(() => {
      if (!frames.includes(frame) || readinessOf(frame) === 'loading') return;
      commit(withReadiness(frame, 'loading'));
    });
    return () => {
      const index = frames.indexOf(frame);
      if (index === -1) return;
      frames.splice(index, 1);
      iframe.remove();
      if (
        frames.some((candidate) => sameReadinessKey(frame, candidate)) ||
        (readinessOf(frame) === undefined &&
          sizeOf(frame) === undefined &&
          (frame.story || state.frameErrors[frame.target] === undefined))
      )
        return;
      commit({
        ...withReadiness(frame, undefined),
        ...withSize(frame, undefined),
        ...(frame.story ? {} : withError(frame.target, undefined)),
      });
    };
  }

  function mountStory(
    element: HTMLElement,
    target: PreviewScriptedTarget,
    story: PreviewStoryReference
  ): () => void {
    const component = stories.find(
      (candidate) => candidate.id === story.component
    );
    if (!component)
      throw new Error(
        `The catalog has no story "${story.component}" to mount: a detached pane takes the id of a standalone component.`
      );
    if (!component.targets.includes(target))
      throw new Error(
        `The story "${component.id}" does not render in ${target}: its targets are ${component.targets.join(', ')}.`
      );
    const scenarioId = story.scenario ?? defaultScenarioId(component);
    const scenario = component.scenarios.find(
      (candidate) => candidate.id === scenarioId
    );
    if (scenarioId !== '' && !scenario)
      throw new Error(
        `The story "${component.id}" has no scenario "${scenarioId}".`
      );
    if (scenario?.empty)
      throw new Error(
        `The Empty scenario of "${component.id}" renders through the selection's regenerated story and cannot be mounted apart from it: leave out the scenarios marked empty.`
      );
    const props = {
      ...seedProps(component, scenarioId),
      ...withoutUndefined(story.props ?? {}),
    };
    return mountFrame(
      element,
      {
        target: target,
        story: {
          key: storyFrameKey(target, story),
          component,
          id: paneStoryId(component, scenarioId),
          props,
          options: scenarioOptionValues(component, scenarioId),
        },
      },
      `${component.shortTitle}${scenario ? `: ${scenario.label}` : ''} (${target})`,
      componentFrameUrl(target, reloadCount, baseUrl)
    );
  }

  function reloadPanes(): void {
    reloadCount += 1;
    const next = { ...state.frames };
    for (const frame of frames) {
      // A view, the html pane and a detached pane show no scratch story.
      if (frame.target === 'view' || frame.target === 'html' || frame.story)
        continue;
      conceal(frame.iframe);
      frame.iframe.setAttribute(
        'src',
        componentFrameUrl(frame.target, reloadCount, baseUrl)
      );
      next[frame.target] = 'loading';
    }
    commit({ frames: next });
  }

  function answerReady(frame: MountedFrame): void {
    // A pane that announces ready again was reloaded, and counts its
    // writes from zero.
    frame.answered = 0;
    if (frame.story) {
      postTo(
        frame,
        setStoryMessage(
          frame.story.id,
          paneProps(frame.story.props, frame.story.component)
        )
      );
      postTo(
        frame,
        globalsMessage(
          detachedOptions(frame.story.component, frame.story.options)
        )
      );
      postTo(frame, catalogMessage(catalogPayload));
      return;
    }
    if (frame.target === 'html') {
      postTo(frame, globalsMessage(kitValues(state.options)));
      postTo(frame, htmlPaneMessage());
      return;
    }
    // The scratch story holds the root's text as content, not as a prop.
    const tree = state.editor.tree;
    if (scratchActive && tree)
      postTo(frame, storyMessage(SCRATCH_STORY_ID, tree.props, false));
    else postTo(frame, storyMessage(selectionStoryId(), state.props, false));
    postTo(frame, globalsMessage(kitValues(state.options)));
    postTo(frame, catalogMessage(catalogPayload));
  }

  function onMessage(event: MessageEvent): void {
    const data = event.data;
    if (isPreviewMessage(data, PREVIEW_MESSAGE.shown)) {
      const shown = [...frames, ...codeFrames].find(
        (candidate) => candidate.iframe.contentWindow === event.source
      );
      if (shown) reveal(shown.iframe);
      return;
    }
    if (isPreviewMessage(data, PREVIEW_MESSAGE.ready)) {
      const code = codeFrames.find(
        (candidate) => candidate.iframe.contentWindow === event.source
      );
      if (code) {
        code.ready = true;
        const codeWindow = code.iframe.contentWindow;
        codeWindow?.postMessage(globalsMessage(codeValues(state.options)), '*');
        codeWindow?.postMessage(codeMessage(codeContent(code.target)), '*');
        return;
      }
      const frame = frames.find(
        (candidate) => candidate.iframe.contentWindow === event.source
      );
      if (!frame) return;
      answerReady(frame);
      commit(withReadiness(frame, 'ready'));
      return;
    }
    if (isPreviewMessage(data, PREVIEW_MESSAGE.select)) {
      // Only the view pane the controller mounted may select a story: a
      // component pane, the selection's or a detached one, never asks.
      const frame = frames.find(
        (candidate) =>
          candidate.target === 'view' &&
          candidate.iframe.contentWindow === event.source
      );
      if (!frame || typeof data.id !== 'string') return;
      if (!stories.some((component) => component.id === data.id)) return;
      action(selectComponent)(
        data.id,
        isRecord(data.props) ? data.props : undefined
      );
      return;
    }
    if (isPreviewMessage(data, PREVIEW_MESSAGE.event)) {
      // The selection's scripted panes record their story's events; a
      // detached pane's stay its own.
      const frame = frames.find(
        (candidate) =>
          !candidate.story && candidate.iframe.contentWindow === event.source
      );
      if (!frame || typeof data.name !== 'string') return;
      eventCount += 1;
      const recorded: PreviewEvent = {
        id: eventCount,
        target: frame.target,
        name: data.name,
        payload: typeof data.payload === 'string' ? data.payload : '',
        time: Date.now(),
      };
      commit({ events: [...state.events, recorded].slice(-EVENT_LOG_LENGTH) });
      // The write the event reports is the host's from here on, whether or
      // not it changes the story: the next props to the pane answer it.
      if (typeof data.write === 'number' && data.write > (frame.answered ?? 0))
        frame.answered = data.write;
      writeBack(data.name, data);
      return;
    }
    if (isPreviewMessage(data, PREVIEW_MESSAGE.renderError)) {
      // A detached story pane's error stays its own; the selection's panes
      // report theirs.
      const frame = frames.find(
        (candidate) =>
          !candidate.story && candidate.iframe.contentWindow === event.source
      );
      if (!frame) return;
      const message =
        typeof data.message === 'string' ? data.message : undefined;
      if (state.frameErrors[frame.target] === message) return;
      commit(withError(frame.target, message));
      return;
    }
    if (isPreviewMessage(data, PREVIEW_MESSAGE.contentSize)) {
      const frame = frames.find(
        (candidate) => candidate.iframe.contentWindow === event.source
      );
      const size = readContentSize(data);
      if (!frame || !size) return;
      const current = sizeOf(frame);
      if (current?.width === size.width && current.height === size.height)
        return;
      commit(withSize(frame, size));
    }
  }
  hostWindow?.addEventListener('message', onMessage);

  // --- regeneration ----------------------------------------------------------
  function dropPendingRegeneration(): PreviewRegenerationStatus {
    if (regenerationTimer !== null) {
      timers.clearTimeout(regenerationTimer);
      regenerationTimer = null;
    }
    regenerationSequence += 1;
    return state.regeneration.status === 'pending'
      ? { status: 'idle' }
      : state.regeneration;
  }

  /** Regenerate `tree` once edits pause. The returned status is the one to commit. */
  function scheduleRegeneration(tree: EditorState): PreviewRegenerationStatus {
    dropPendingRegeneration();
    if (!regeneration) {
      return {
        status: 'error',
        message:
          'This preview cannot regenerate a story: it has no regeneration endpoint.',
      };
    }
    const generation = regenerationSequence;
    regenerationTimer = timers.setTimeout(() => {
      regenerationTimer = null;
      // The tree as it stands when the edits pause: the root's props may have
      // changed live since the last structural edit.
      const current = state.editor.tree ?? tree;
      // The content beside the root is the story's as the catalog has it now,
      // which no edit reaches.
      const around = componentById(state.selection.id)?.around;
      regeneration({
        ...toPayload(current),
        ...(around ? { around } : {}),
      }).then(
        () => {
          if (generation !== regenerationSequence) return;
          reloadPanes();
          commit({ regeneration: { status: 'idle' } });
        },
        (reason: unknown) => {
          if (generation !== regenerationSequence) return;
          const message =
            reason instanceof Error ? reason.message : String(reason);
          commit({ regeneration: { status: 'error', message } });
        }
      );
    }, REGENERATION_DEBOUNCE_MILLISECONDS);
    return { status: 'pending' };
  }

  // --- selection -------------------------------------------------------------
  function selectComponent(id: string, props?: Record<string, unknown>): void {
    const component = stories.find((candidate) => candidate.id === id);
    if (!component) return;
    const regenerationStatus = dropPendingRegeneration();
    scratchActive = false;
    const baseline = props
      ? undefined
      : component.scenarios.find((scenario) => scenario.default);
    seededProps = seedProps(component, baseline?.id ?? '');
    const nextProps = { ...seededProps, ...(props ?? {}) };
    broadcast(
      storyMessage(paneStoryId(component, baseline?.id ?? ''), nextProps)
    );
    storyOverrides = {};
    const { globalChanged } = baseline
      ? applyScenarioOptions(component, baseline.id)
      : { globalChanged: false };
    const merged = mergedOptions(component);
    broadcastGlobals(merged);
    if (globalChanged) postDetachedGlobals();
    const targets = targetsFor(component);
    commit({
      selection: { kind: 'component', id },
      events: [],
      scenario: baseline?.id ?? '',
      props: nextProps,
      options: merged,
      unavailableOptions: unavailableOptionsFor(component),
      targets: sameTargets(targets.supported, state.targets.supported)
        ? state.targets
        : targets,
      editor: { open: false, modified: false },
      regeneration: regenerationStatus,
    });
  }

  function selectView(id: string): void {
    if (!catalog.views.some((view) => view.id === id)) return;
    const regenerationStatus = dropPendingRegeneration();
    scratchActive = false;
    commit({
      selection: { kind: 'view', id },
      events: [],
      options: mergedOptions(undefined),
      // A view has no story to apply a story option to.
      unavailableOptions: storyOptionIds,
      editor: { open: false, modified: false },
      regeneration: regenerationStatus,
    });
  }

  function pickScenario(id: string): void {
    const component = selectedComponent();
    if (!component) return;
    const scenario = id
      ? component.scenarios.find((candidate) => candidate.id === id)
      : undefined;
    // Empty renders through a regeneration, which a static build cannot do.
    if (scenario?.empty && !regeneration) return;
    if (scenario?.empty) {
      // Empty is content the real story cannot show, so it renders through the
      // regenerated scratch story: the story's props, no slot content.
      const tree: EditorState = {
        root: component.name,
        props: withoutContent(seedProps(component, id)),
        slots: {},
      };
      scratchActive = true;
      seededProps = tree.props;
      seededSlots = slotsKey(tree.slots);
      broadcast(storyMessage(SCRATCH_STORY_ID, cleanRecord(tree.props)));
      const regenerationStatus = scheduleRegeneration(tree);
      commit({
        scenario: id,
        props: tree.props,
        editor: { open: state.editor.open, tree, modified: false },
        regeneration: regenerationStatus,
      });
      return;
    }
    const regenerationStatus = dropPendingRegeneration();
    scratchActive = false;
    const props = seedProps(component, id);
    seededProps = props;
    broadcast(storyMessage(paneStoryId(component, id), props));
    const carried = applyScenarioOptions(component, id);
    const merged = carried.changed ? mergedOptions(component) : state.options;
    if (carried.changed) broadcastGlobals(merged);
    if (carried.globalChanged) postDetachedGlobals();
    let tree: EditorState | undefined;
    if (state.editor.open) {
      // The props read from the tree, as `open` seeds it.
      tree = seedRoot(onScenario(component, id), props);
      ensureIds(tree.slots);
      seededProps = treeProps(tree);
      seededSlots = slotsKey(tree.slots);
    }
    commit({
      scenario: id,
      props: seededProps,
      options: merged,
      editor: {
        open: state.editor.open,
        ...(tree ? { tree } : {}),
        modified: false,
      },
      regeneration: regenerationStatus,
    });
  }

  function setOption(id: string, value: OptionValue): void {
    const descriptor = options.find((candidate) => candidate.id === id);
    if (descriptor?.scope === 'story')
      storyOverrides = { ...storyOverrides, [id]: value };
    else globalValues = { ...globalValues, [id]: value };
    const merged = mergedOptions(selectedComponent());
    // A shell option's value never reaches the iframes, so they are told
    // nothing of it.
    if (descriptor?.origin !== 'shell') broadcastGlobals(merged);
    if (descriptor?.scope === 'global' && descriptor.origin === 'kit')
      postDetachedGlobals();
    commit({ options: merged });
  }

  function setTargetVisible(target: PreviewTarget, visible: boolean): void {
    if (visible) visibleTargets.add(target);
    else visibleTargets.delete(target);
    commit({ targets: targetsFor(selectedComponent()) });
  }

  function setPaneWidth(width: number | undefined): void {
    if (width !== undefined && !isPaneWidth(width)) return;
    if (width === state.paneWidth) return;
    const { paneWidth: _paneWidth, ...rest } = state;
    state = rest;
    commit(width === undefined ? {} : { paneWidth: width });
  }

  function setProps(props: Record<string, unknown>): void {
    if (state.selection.kind !== 'component') return;
    const next = withoutUndefined(props);
    const tree = state.editor.tree;
    if (!tree) {
      // The root renders with its props as they are: they reach the panes live.
      broadcastProps(cleanRecord(next));
      commit({ props: next });
      return;
    }
    // With a tree, where the story draws its default slot from `children`,
    // `children` is the root's text: a new one replaces the root's default
    // slot with that text, and one left out removes a lone text. Content
    // other than a lone text carries no `children` and stays. A story with
    // default-slot content of its own takes no `children`.
    const { children, ...rootProps } = next;
    const text = typeof children === 'string' ? children : undefined;
    if (drawsChildren(tree) && text !== rootText(tree)) {
      const slots = { ...tree.slots };
      if (text === undefined) delete slots[DEFAULT_SLOT];
      else slots[DEFAULT_SLOT] = [{ kind: 'text', value: text }];
      editTree({ ...tree, props: rootProps, slots });
      return;
    }
    const nextTree = { ...tree, props: rootProps };
    const shown = treeProps(nextTree);
    // The root's props reach the panes live; the scratch story holds the
    // root's text as content, not as a prop.
    broadcastProps(cleanRecord(scratchActive ? rootProps : shown));
    commit({
      props: sameProps(shown),
      editor: { ...state.editor, tree: nextTree },
    });
  }

  /** `props`, or the state's own when they are equal, so an unchanged field
   *  keeps its reference. */
  function sameProps(props: Record<string, unknown>): Record<string, unknown> {
    return stableStringify(props) === stableStringify(state.props)
      ? state.props
      : props;
  }

  // --- the editor ------------------------------------------------------------
  function open(): void {
    if (state.editor.open) return;
    const component = selectedComponent();
    if (!component) return;
    let tree = state.editor.tree;
    if (!tree) {
      // The root starts from the props the panes show, so a prop set before
      // the editor opened stays set; the address still measures them against
      // the scenario's.
      const shown = onScenario(component, state.scenario);
      tree = seedRoot(shown, state.props);
      ensureIds(tree.slots);
      seededProps = treeProps(
        seedRoot(shown, seedProps(component, state.scenario))
      );
      seededSlots = slotsKey(tree.slots);
      // The props now read from the tree, which shows what the panes show:
      // a string `children` stays as the root's text. Where the story's own
      // content stands in its default slot, the panes render that content
      // and not the `children` prop, so `props` leaves it out and nothing on
      // screen changes, with nothing to post.
      commit({
        props: sameProps(treeProps(tree)),
        editor: { open: true, tree, modified: false },
      });
      return;
    }
    commit({ editor: { ...state.editor, open: true, tree } });
  }

  function close(): void {
    if (!state.editor.open) return;
    commit({ editor: { ...state.editor, open: false } });
  }

  function createNode(request: PreviewNodeRequest): EditorNode {
    if (request.kind === 'text') return { kind: 'text', value: request.value };
    if (request.kind === 'html')
      return { kind: 'html', tag: request.tag, props: {}, slots: {} };
    const component = componentByName(request.name);
    if (!component)
      throw new Error(`The catalog has no component named "${request.name}".`);
    const baseline = component.scenarios.find((scenario) => scenario.default);
    const named = component.scenarios.filter(
      (scenario) => !scenario.empty && !scenario.default
    );
    // A component with nothing to strip and no scenario to pick has no choice to
    // make: it comes in with its defaults.
    const hasChoice =
      component.slots.default ||
      component.slots.named.length > 0 ||
      named.length > 0;
    const importAs = hasChoice ? (request.importAs ?? 'empty') : 'default';
    const withDefaults = (over?: Record<string, unknown>) => ({
      ...component.defaultProps,
      ...(over ?? {}),
    });
    if (importAs === 'empty') return seedComponentNode(component);
    // A scenario with content of its own comes in with that content.
    if (importAs === 'default')
      return seedComponentNode(
        onScenario(component, baseline?.id ?? ''),
        withDefaults(baseline?.props)
      );
    const scenario = named.find(
      (candidate) => candidate.id === importAs.scenario
    );
    return seedComponentNode(
      onScenario(component, scenario?.id ?? ''),
      withDefaults(scenario?.props)
    );
  }

  /** Apply a change to the tree's slot content: the panes switch to the scratch
   *  story, which regenerates once edits pause. An unchanged tree does nothing. */
  /**
   * Whether the slot `slot` of the node at `parent` takes `node`, moved from
   * `from` or newly inserted. A scoped fill fills the one slot it names, so
   * it moves only within its own list; a slot whose content must take its
   * scope takes nothing else.
   */
  function slotTakes(
    tree: EditorState,
    parent: Step[],
    slot: string,
    node: EditorNode,
    from?: Step[]
  ): boolean {
    if (node.kind === 'opaque' && node.fill.kind === 'scoped')
      return (
        from !== undefined &&
        pathKey(from.slice(0, -1)) === pathKey(parent) &&
        from[from.length - 1].slot === slot
      );
    const holder = parent.length === 0 ? tree : nodeAt(tree.slots, parent);
    if (!holder) return true;
    return (
      !nodeSlots(catalog, holder).includes(slot) ||
      nodeAddSlots(catalog, holder).includes(slot)
    );
  }

  function editContent(
    transform: (slots: EditorState['slots']) => EditorState['slots']
  ): void {
    const tree = state.editor.tree;
    if (!tree) return;
    const slots = transform(tree.slots);
    if (slots === tree.slots) return;
    editTree({ ...tree, slots });
  }

  /** Show `next`, whose content differs from the current tree's, through the
   *  scratch story; the root's text, if it changed, reaches `props`. */
  function editTree(next: EditorState): void {
    ensureIds(next.slots);
    scratchActive = true;
    broadcast(storyMessage(SCRATCH_STORY_ID, cleanRecord(next.props)));
    const regenerationStatus = scheduleRegeneration(next);
    commit({
      props: sameProps(treeProps(next)),
      editor: {
        ...state.editor,
        tree: next,
        modified: slotsKey(next.slots) !== seededSlots,
      },
      regeneration: regenerationStatus,
    });
  }

  function setNodeProps(path: Step[], props: Record<string, unknown>): void {
    if (path.length === 0) {
      // The root's text is content: its props leave it, and `children`, as it is.
      const tree = state.editor.tree;
      if (!tree) {
        setProps(props);
        return;
      }
      const { children: _children, ...rootProps } = props;
      const text = treeProps(tree).children;
      setProps(
        text === undefined ? rootProps : { ...rootProps, children: text }
      );
      return;
    }
    const nextProps = withoutUndefined(props);
    editContent((slots) =>
      updateAt(slots, path, (node) =>
        isContainer(node) ? { ...node, props: nextProps } : node
      )
    );
  }

  function dispose(): void {
    hostWindow?.removeEventListener('message', onMessage);
    dropPendingRegeneration();
    cancelHtml();
    for (const frame of [...frames]) frame.iframe.remove();
    frames.length = 0;
    for (const frame of [...codeFrames]) frame.iframe.remove();
    codeFrames.length = 0;
    listeners.clear();
  }

  restore();

  return {
    apiVersion: 1,
    catalog,
    options,
    capabilities: { regeneration: regeneration !== undefined },
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    actions: {
      selectComponent: action(selectComponent),
      selectView: action(selectView),
      select: action((selection: PreviewSelection) => {
        if (selection.kind === 'view') selectView(selection.id);
        else selectComponent(selection.id);
      }),
      pickScenario: action(pickScenario),
      setOption: action(setOption),
      setTargetVisible: action(setTargetVisible),
      setPaneWidth: action(setPaneWidth),
      setProps: action(setProps),
      clearEvents: action(() => {
        if (state.events.length > 0) commit({ events: [] });
      }),
    },
    editor: {
      open: action(open),
      close: action(close),
      createNode,
      insert: action((target: PreviewInsertTarget, node: EditorNode) => {
        const tree = state.editor.tree;
        if (tree && !slotTakes(tree, target.parent, target.slot, node)) return;
        editContent((slots) =>
          insertAt(slots, target.parent, target.slot, node, target.index)
        );
      }),
      move: action((from: Step[], to: DropTarget) => {
        const tree = state.editor.tree;
        const node =
          tree && from.length > 0 ? nodeAt(tree.slots, from) : undefined;
        if (tree && node && !slotTakes(tree, to.parent, to.slot, node, from))
          return;
        editContent((slots) => moveNode(slots, from, to));
      }),
      moveBy: action((path: Step[], offset: number) => {
        if (path.length === 0) return;
        editContent((slots) => {
          const parent = path.slice(0, -1);
          const { slot, index } = path[path.length - 1];
          const holder =
            parent.length === 0 ? undefined : nodeAt(slots, parent);
          const list =
            holder === undefined
              ? slots[slot]
              : holder && isContainer(holder)
                ? holder.slots[slot]
                : undefined;
          if (!list || index >= list.length) return slots;
          const destination = Math.min(
            Math.max(index + Math.trunc(offset), 0),
            list.length - 1
          );
          if (destination === index) return slots;
          // `moveNode` counts the target index before the node is taken out.
          const before = destination > index ? destination + 1 : destination;
          return moveNode(slots, path, { parent, slot, index: before });
        });
      }),
      replace: action((path: Step[], node: EditorNode) => {
        if (path.length === 0) return;
        editContent((slots) => updateAt(slots, path, () => node));
      }),
      remove: action((path: Step[]) => {
        if (path.length === 0) return;
        editContent((slots) => removeAt(slots, path));
      }),
      setNodeProps: action(setNodeProps),
      setText: action((path: Step[], text: string) => {
        editContent((slots) =>
          updateAt(slots, path, (node) =>
            node.kind === 'text' ? { ...node, value: text } : node
          )
        );
      }),
      resolveDrop(drop) {
        const move = resolveSortableMove(
          drop.source,
          drop.target,
          drop.sameList,
          drop.fromIndex,
          drop.toIndex
        );
        return { from: move.from, to: move.target };
      },
    },
    frames: {
      mount: (element, target) =>
        mountFrame(
          element,
          { target },
          target,
          componentFrameUrl(target, reloadCount, baseUrl)
        ),
      mountView: (element, viewId) =>
        mountFrame(
          element,
          { target: 'view' },
          viewId,
          viewFrameUrl(
            viewId,
            catalog.views.find((view) => view.id === viewId)?.framework,
            baseUrl
          )
        ),
      mountStory,
      mountCode,
      wrapCode(wrap: boolean) {
        if (wrap === codeWrap) return;
        codeWrap = wrap;
        postCode(true);
      },
      reload: action((target: PreviewFrameTarget) => {
        const next = { ...state.frames };
        for (const frame of frames) {
          if (frame.story || frame.target !== target) continue;
          conceal(frame.iframe);
          frame.iframe.contentWindow?.location.reload();
          next[target] = 'loading';
        }
        commit({ frames: next });
      }),
      standaloneUrl: (target: PreviewScriptedTarget) => {
        // The scratch story holds the root's text as content, not as a prop.
        const tree = state.editor.tree;
        const scratch = scratchActive && tree !== undefined;
        return standaloneFrameUrl(
          target,
          {
            id: scratch ? SCRATCH_STORY_ID : selectionStoryId(),
            props: paneProps(
              scratch ? tree.props : state.props,
              scratch ? componentByName(tree.root) : selectedComponent()
            ),
            options: kitValues(state.options),
          },
          baseUrl
        );
      },
    },
    dispose,
  };
}
