// The shell contract: what a module named by `preview.shell` exports, what a
// shell's page module exports, and everything a shell author reads from the
// preview - the controller's state and actions, a store view of that state,
// the catalog, the editor's tree, the option helpers, the scenario helpers
// and a story's source. A shell renders the whole host interface around the
// preview's iframes, in React, Vue, Svelte or plain DOM; the preview provides
// the behavior. Browser-safe: no node imports, and nothing here holds state
// of its own.

import type { PreviewCatalog, PreviewController } from './controller/index.js';
import type { PreviewShellOption } from './options.js';

export {
  childPath,
  DEFAULT_PANE_WIDTHS,
  DEFAULT_SLOT,
  defaultScenarioId,
  isContainer,
  MAXIMUM_PANE_WIDTH,
  PREVIEW_FRAME_SHOWN_ATTRIBUTE,
  nodeAt,
  nodeAddSlots,
  nodeSlots,
  previewStore,
  printStorySource,
  scenarioChoices,
  storyFrameKey,
  type AroundFill,
  type ContainerNode,
  type DropTarget,
  type EditorNode,
  type EditorState,
  type NodePath,
  type OpaqueFill,
  type PreviewBinding,
  type PreviewCatalog,
  type PreviewCatalogView,
  type PreviewComponent,
  type PreviewController,
  type PreviewEditorState,
  type PreviewEvent,
  type PreviewFrameReadiness,
  type PreviewFrameTarget,
  type PreviewTargetCode,
  type PreviewHtmlSource,
  type PreviewImport,
  type PreviewInsertTarget,
  type PreviewLanding,
  type PreviewNavigationNode,
  type PreviewNodeRequest,
  type PreviewOptionDescriptor,
  type PreviewPaneWidth,
  type PreviewPropType,
  type PreviewRegenerationStatus,
  type PreviewScenario,
  type PreviewSource,
  type PreviewSelection,
  type PreviewSortableDrop,
  type PreviewCode,
  type PreviewState,
  type PreviewStore,
  type PreviewStoryReference,
  type ScenarioChoice,
  type SortableListAddress,
  type Step,
  type StoryAround,
} from './controller/index.js';
export {
  CONTEXT_OPTION_GROUP,
  KIT_OPTION_GROUP,
  optionGroup,
  optionKind,
  shellOptionId,
  type OptionChoice,
  type OptionKind,
  type OptionValue,
  type PreviewShellOption,
} from './options.js';
export {
  PREVIEW_SCRIPTED_TARGETS,
  PREVIEW_TARGETS,
  type PreviewContentSize,
  type PreviewScriptedTarget,
  type PreviewTarget,
} from './protocol.js';
export type { ViewFramework } from './views.js';

/** The version of the shell contract this preview serves. */
export const PREVIEW_SHELL_API_VERSION = 1;

/**
 * What a shell module default-exports: the contract version it was written
 * against, its own options, and how it mounts.
 */
export interface PreviewShell {
  /** The shell contract version the shell was written against. The preview
   *  refuses a shell whose version it does not serve. */
  apiVersion: number;
  /** The shell's own options, such as its color mode or density. The preview
   *  keeps their values beside the kit's, under `shell.<id>`. A function is
   *  called once with the kit's catalog before the preview starts, for options
   *  that depend on the kit, such as a choice among its targets. */
  options?:
    | PreviewShellOption[]
    | ((catalog: PreviewCatalog) => PreviewShellOption[]);
  /**
   * Render the shell into `root`, reading and driving `controller`.
   *
   * @param root - The host page's root element, empty.
   * @param controller - The preview's behavior.
   * @returns A function that unmounts the shell, or nothing when there is
   *   nothing to undo. The preview calls it before mounting a changed shell
   *   over the same controller during development.
   */
  mount(root: HTMLElement, controller: PreviewController): (() => void) | void;
}

/**
 * Declare a shell. The function only types its argument and returns it, so a
 * shell module reads as one declaration.
 *
 * @param shell - The shell.
 * @returns The shell, unchanged.
 * @example
 * ```ts
 * export default defineShell({
 *   apiVersion: 1,
 *   options: [{ id: 'density', label: 'density', default: false }],
 *   mount(root, controller) {
 *     const stop = controller.subscribe((state) => render(root, state));
 *     render(root, controller.getState());
 *     return stop;
 *   },
 * });
 * ```
 */
export function defineShell(shell: PreviewShell): PreviewShell {
  return shell;
}

/** What a shell page's `head` and `root` functions are given. */
export interface ShellPageContext {
  /**
   * The address of a file the page's markup references, such as a font to
   * preload: the development server serves the file from where it is, and the
   * static build copies it into its output.
   *
   * @param file - The file's absolute path.
   * @returns The address to write into the markup, in an `href`, a `src` or
   *   a CSS `url()`.
   */
  asset(file: string): string;
}

/** A part of the host page a shell supplies: markup, or a function that
 *  gives it. */
export type ShellPageMarkup =
  | string
  | ((context: ShellPageContext) => string | Promise<string>);

/**
 * What a shell's page module default-exports: the static start of the host
 * page, which shows before the shell's script has loaded. The module is
 * evaluated in Node as the preview starts or builds, so it reads files and
 * resolves packages freely and holds nothing that needs a browser.
 */
export interface ShellPage {
  /** Markup for the end of the page's `<head>`: styles, a font face, links
   *  that preload what the shell will need. It stays for the life of the
   *  page. */
  head?: ShellPageMarkup;
  /** Markup for the page's root element, shown until the shell mounts: a
   *  loading note, with the styles only it needs. The preview empties the
   *  root before it mounts the shell. */
  root?: ShellPageMarkup;
}

/**
 * Declare a shell's page. The function only types its argument and returns
 * it, so a page module reads as one declaration.
 *
 * @param page - The page.
 * @returns The page, unchanged.
 * @example
 * ```ts
 * export default defineShellPage({
 *   head: '<style>html { background: #101010; }</style>',
 *   root: '<p role="status">loading</p>',
 * });
 * ```
 */
export function defineShellPage(page: ShellPage): ShellPage {
  return page;
}
