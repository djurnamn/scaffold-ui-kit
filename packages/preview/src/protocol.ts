// The messages the preview host and its iframes exchange over postMessage, the
// flag an iframe sets once it can receive them, and the URLs the iframes load.
// The host, the five iframe entries and the testing helper all speak through
// this module, so the vocabulary lives in one place. Browser-safe - no node
// imports; type-only imports keep it free of runtime dependencies.

import type { OptionValue, PreviewOption } from './options.js';
import type {
  CodeBlockContent,
  ViewContextComponent,
  ViewContextSource,
  ViewFramework,
} from './views.js';

/**
 * What a story pane renders in: a scripted target, which a component preview
 * iframe runs the story's script in, or `html`, the markup the story renders
 * to with no JavaScript of its own.
 */
export const PREVIEW_TARGETS = ['react', 'vue', 'svelte', 'html'] as const;

/** What a story pane renders in: one of {@link PREVIEW_TARGETS}. */
export type PreviewTarget = (typeof PREVIEW_TARGETS)[number];

/** A target a component preview iframe runs a story's script in: every
 *  target but `html`. */
export type PreviewScriptedTarget = Exclude<PreviewTarget, 'html'>;

/** The scripted targets, in the preview's order: {@link PREVIEW_TARGETS}
 *  without `html`. */
export const PREVIEW_SCRIPTED_TARGETS = [
  'react',
  'vue',
  'svelte',
] as const satisfies readonly PreviewScriptedTarget[];

/** The `type` of each message, keyed by a short name. */
export const PREVIEW_MESSAGE = {
  /** Iframe → host: the iframe listens for messages now (sent on each load). */
  ready: 'preview:ready',
  /** Host → iframe: mount a story by id with its root props. */
  setStory: 'preview:set-story',
  /** Host → iframe: replace the mounted story's props in place. */
  props: 'preview:props',
  /** Host → iframe: the merged option values to apply to the document. */
  globals: 'preview:globals',
  /** Host → view iframe: the catalog a custom view builds its context from. */
  catalog: 'preview:catalog',
  /** View iframe → host: open a component story, as a navigation click does. */
  select: 'preview:select',
  /** Iframe → host: the size of what the iframe shows, sent once it renders
   *  and again on each change. */
  contentSize: 'preview:content-size',
  /** Host → html iframe: the markup to show, or why there is none. */
  markup: 'preview:markup',
  /** Iframe → host: the story threw as it rendered, or, with no message,
   *  the story it mounts since renders. */
  renderError: 'preview:render-error',
  /** Host → code iframe: the source the kit's code block shows. */
  code: 'preview:code',
  /** Iframe → host: the story called one of its events. */
  event: 'preview:event',
  /** Iframe → host: its first content has mounted and painted, so the host
   *  can show the iframe. Sent once per document. */
  shown: 'preview:shown',
} as const;

/** The `type` of a preview message. */
export type PreviewMessageType =
  (typeof PREVIEW_MESSAGE)[keyof typeof PREVIEW_MESSAGE];

/** Sent by an iframe once its message listener is attached. */
export interface PreviewReadyMessage {
  type: typeof PREVIEW_MESSAGE.ready;
}

/** Sent by an iframe once its first content has mounted and painted. */
export interface PreviewShownMessage {
  type: typeof PREVIEW_MESSAGE.shown;
}

/** Mounts the story `id` afresh with `props` as its root props. */
export interface PreviewSetStoryMessage {
  type: typeof PREVIEW_MESSAGE.setStory;
  id: string;
  props: Record<string, unknown>;
  /** The story's events: the function props a pane records the calls of,
   *  reporting each as a `preview:event`. */
  events?: string[];
  /** The story's two-way props and the event each reports its new value
   *  through. A pane may take a value a story's given prop reports as that
   *  prop at once, as the host does after it (see {@link withWriteBacks}). */
  bindings?: PreviewWriteBack[];
  /** Which of the host's story mounts this is: a pane tags each event it
   *  records with it, so the host can tell an event of a story it has since
   *  replaced (see {@link withEventRecorders}). */
  mount?: number;
}

/** A two-way prop and the event prop it reports each new value through. */
export interface PreviewWriteBack {
  /** The two-way prop. */
  prop: string;
  /** The event prop called with each new value. */
  changeProp: string;
}

/** Replaces the mounted story's root props, keeping its component instance. */
export interface PreviewPropsMessage {
  type: typeof PREVIEW_MESSAGE.props;
  props: Record<string, unknown>;
  /** The newest of the receiving pane's own write-backs the host had taken
   *  when it sent the props (the `write` of the pane's events, see
   *  {@link PendingWriteBacks}): a pane keeps a later write of its own over
   *  the value these props hold. Absent, the pane takes the props as they
   *  are. */
  answers?: number;
}

/** The option values (global and story-scoped, merged) the iframe applies. */
export interface PreviewGlobalsMessage {
  type: typeof PREVIEW_MESSAGE.globals;
  options: Record<string, OptionValue>;
}

/** The catalog a custom view reads: the kit's name, its sources and its stories. */
export interface PreviewCatalogPayload {
  kitName: string;
  sources: ViewContextSource[];
  components: ViewContextComponent[];
}

/** Delivers the {@link PreviewCatalogPayload} to the view iframe. */
export interface PreviewCatalogMessage extends PreviewCatalogPayload {
  type: typeof PREVIEW_MESSAGE.catalog;
}

/** Asks the host to open a component story, optionally with root props. */
export interface PreviewSelectMessage {
  type: typeof PREVIEW_MESSAGE.select;
  id: string;
  props?: Record<string, unknown>;
}

/** The size of what a preview iframe shows, in whole CSS pixels. */
export interface PreviewContentSize {
  width: number;
  height: number;
}

/**
 * Reports the size of what an iframe shows: its story or view, with the
 * padding, borders and margins of the elements around it, rounded up to
 * whole CSS pixels, so an iframe of that size shows it all.
 */
export interface PreviewContentSizeMessage extends PreviewContentSize {
  type: typeof PREVIEW_MESSAGE.contentSize;
}

/**
 * The html iframe's story: its `markup`, or the `reason` it has none. With
 * neither, the markup is being printed, and the iframe keeps what it shows.
 */
export interface PreviewMarkupMessage {
  type: typeof PREVIEW_MESSAGE.markup;
  markup?: string;
  /** The styles of the components the markup renders, shown with it. */
  stylesheet?: string;
  reason?: string;
}

/**
 * Reports what an iframe's story threw as it rendered (`message`), shown in
 * the story's place; with no `message`, the story mounted since renders.
 */
export interface PreviewRenderErrorMessage {
  type: typeof PREVIEW_MESSAGE.renderError;
  message?: string;
}

/** The source a code iframe's block shows: a target's, in its language, or
 *  why it has none; with neither, it is being printed. */
export interface PreviewCodeMessage extends CodeBlockContent {
  type: typeof PREVIEW_MESSAGE.code;
}

/** Reports a story's call of one of its events: its `name`, a readable
 *  summary of what it was called with, and its first argument as `value`
 *  when that is plain data (what JSON holds), such as the new value a
 *  two-way prop's change callback reports. */
export interface PreviewEventMessage {
  type: typeof PREVIEW_MESSAGE.event;
  name: string;
  payload: string;
  value?: unknown;
  /** The `mount` of the set-story message the pane was showing. */
  mount?: number;
  /** The number of the newest value the pane wrote back itself since its
   *  last report, when it wrote one (see {@link PendingWriteBacks}): the
   *  host answers it on the pane's next props message. */
  write?: number;
}

/** Any message the host and the iframes exchange. */
export type PreviewMessage =
  | PreviewReadyMessage
  | PreviewSetStoryMessage
  | PreviewPropsMessage
  | PreviewGlobalsMessage
  | PreviewCatalogMessage
  | PreviewSelectMessage
  | PreviewContentSizeMessage
  | PreviewMarkupMessage
  | PreviewRenderErrorMessage
  | PreviewCodeMessage
  | PreviewEventMessage
  | PreviewShownMessage;

/** The message whose `type` is `Type`. */
export type PreviewMessageOf<Type extends PreviewMessageType> = Extract<
  PreviewMessage,
  { type: Type }
>;

const MESSAGE_TYPES = new Set<string>(Object.values(PREVIEW_MESSAGE));

/**
 * Read posted data as a preview message: the data itself when it is an object
 * whose `type` is one of the preview's, otherwise `undefined`. Only the `type`
 * is checked; a receiver validates the payload it relies on.
 *
 * @param data - A `MessageEvent`'s `data`.
 * @returns The data as a {@link PreviewMessage}, or `undefined`.
 */
export function readPreviewMessage(data: unknown): PreviewMessage | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const type = (data as { type?: unknown }).type;
  return typeof type === 'string' && MESSAGE_TYPES.has(type)
    ? (data as PreviewMessage)
    : undefined;
}

/**
 * Whether posted data is a preview message of one type.
 *
 * @param data - A `MessageEvent`'s `data`.
 * @param type - The message type to match.
 * @returns `true` when `data` is an object whose `type` is `type`.
 */
export function isPreviewMessage<Type extends PreviewMessageType>(
  data: unknown,
  type: Type
): data is PreviewMessageOf<Type> {
  return readPreviewMessage(data)?.type === type;
}

/** @returns A {@link PreviewReadyMessage}. */
export function readyMessage(): PreviewReadyMessage {
  return { type: PREVIEW_MESSAGE.ready };
}

/**
 * @param id - The story's id.
 * @param props - Its root props.
 * @param events - The function props a pane records the calls of.
 * @param bindings - The two-way props and the events they report through.
 * @param mount - Which of the host's story mounts this is.
 * @returns A {@link PreviewSetStoryMessage}.
 */
export function setStoryMessage(
  id: string,
  props: Record<string, unknown>,
  events?: string[],
  bindings?: readonly PreviewWriteBack[],
  mount?: number
): PreviewSetStoryMessage {
  return {
    type: PREVIEW_MESSAGE.setStory,
    id,
    props,
    ...(mount !== undefined ? { mount } : {}),
    ...(events && events.length > 0 ? { events } : {}),
    ...(bindings && bindings.length > 0
      ? {
          bindings: bindings.map(({ prop, changeProp }) => ({
            prop,
            changeProp,
          })),
        }
      : {}),
  };
}

/**
 * The story's props with each two-way prop's change event writing the value
 * it reports back as that prop at once, through `write`, while the story
 * gives the prop: what the host does with the value after it hears of the
 * call, done inside the pane, so a framework that restores a controlled
 * input to its prop's value as the event ends (React) finds the new value
 * there and keeps the caret where it was. The host's own write-back follows
 * with the same value. Only plain data is written, as the host takes only
 * plain data; a prop the story leaves out stays the component's own.
 *
 * @param props - The story's root props, its events' recorders in place.
 * @param bindings - The two-way props and the events they report through.
 * @param write - Takes a two-way prop's new value.
 * @returns The props, each given two-way prop's change event writing back.
 * @example
 * ```ts
 * withWriteBacks(props, [{ prop: 'value', changeProp: 'onValueChange' }], (prop, value) =>
 *   setProps((current) => ({ ...current, [prop]: value }))
 * );
 * ```
 */
export function withWriteBacks(
  props: Record<string, unknown>,
  bindings: readonly PreviewWriteBack[] = [],
  write: (prop: string, value: unknown) => void
): Record<string, unknown> {
  // The given two-way props by the change prop they report through: one
  // change prop may report several, each written back.
  const byChangeProp = new Map<string, string[]>();
  for (const { prop, changeProp } of bindings) {
    if (props[prop] === undefined || changeProp === prop) continue;
    byChangeProp.set(changeProp, [
      ...(byChangeProp.get(changeProp) ?? []),
      prop,
    ]);
  }
  if (byChangeProp.size === 0) return props;
  const next = { ...props };
  for (const [changeProp, written] of byChangeProp) {
    const own = props[changeProp];
    next[changeProp] = (...parameters: unknown[]) => {
      const copy = plainValue(parameters[0]);
      if ('value' in copy) for (const prop of written) write(prop, copy.value);
      return typeof own === 'function' ? own(...parameters) : undefined;
    };
  }
  return next;
}

/**
 * The values a pane has written back itself (see {@link withWriteBacks}) and
 * the host has not yet answered, per two-way prop, oldest first. Each write
 * gets a number, counting up for the life of the pane, which the next event
 * the pane reports carries (`write`); each props message from the host
 * names the newest write it had taken when it sent them (`answers`). Props
 * the host sent before it took a write hold an older value for that prop,
 * whether they answer the write's own echo or a change of another control,
 * so `reconcile` keeps the pane's newest value over them.
 *
 * @example
 * ```ts
 * const pending = new PendingWriteBacks();
 * pending.wrote('value', 'ab'); // 1
 * pending.wrote('value', 'abc'); // 2
 * pending.reconcile({ value: 'ab' }, 1); // { value: 'abc' }, still waiting for 2
 * pending.reconcile({ value: 'abc' }, 2); // { value: 'abc' }, nothing waiting
 * ```
 */
export class PendingWriteBacks {
  private readonly pending = new Map<
    string,
    { write: number; value: unknown }[]
  >();
  private count = 0;
  private unreported: number | undefined;

  /**
   * Note a value the pane has written back for a prop.
   *
   * @param prop - The two-way prop.
   * @param value - The value, plain data.
   * @returns The write's number.
   */
  wrote(prop: string, value: unknown): number {
    this.count += 1;
    const values = this.pending.get(prop) ?? [];
    values.push({ write: this.count, value });
    this.pending.set(prop, values);
    this.unreported = this.count;
    return this.count;
  }

  /**
   * The number of the newest write since the last call, for the event the
   * pane reports next to carry; `undefined` when there has been none.
   *
   * @returns The write's number, or `undefined`.
   */
  takeUnreported(): number | undefined {
    const write = this.unreported;
    this.unreported = undefined;
    return write;
  }

  /**
   * The host's props as the pane takes them. The writes up to `answers` are
   * done with: the host had them when it sent the props. A two-way prop the
   * host gives with a later write still waiting keeps the newest value the
   * pane wrote. Without `answers` the props are taken as they are, and
   * every write is done with.
   *
   * @param props - The props the host sends.
   * @param answers - The newest of the pane's writes the host had taken.
   * @returns The props to take.
   */
  reconcile(
    props: Record<string, unknown>,
    answers?: number
  ): Record<string, unknown> {
    if (answers === undefined) {
      this.pending.clear();
      return props;
    }
    let taken = props;
    for (const [prop, values] of this.pending) {
      const waiting = values.filter((written) => written.write > answers);
      if (waiting.length === 0) {
        this.pending.delete(prop);
        continue;
      }
      this.pending.set(prop, waiting);
      // A prop the host leaves out is no longer given: the pane writes it
      // back no more, and the component keeps its own value.
      if (props[prop] === undefined) continue;
      taken = { ...taken, [prop]: waiting[waiting.length - 1].value };
    }
    return taken;
  }

  /** Forget every write, as a new story starts. The count goes on. */
  clear(): void {
    this.pending.clear();
    this.unreported = undefined;
  }
}

/**
 * The story's props with a recorder for each of its events: a function that
 * reports its call to the host as a `preview:event`, the event's name and a
 * readable summary of what it was called with. A function the props hold
 * already for an event is called too.
 *
 * @param props - The story's root props.
 * @param events - The function props to record the calls of.
 * @param target - The pane's window.
 * @param mount - The `mount` of the set-story message the pane shows, which
 *   each report carries.
 * @param writes - The pane's own write-backs: a report carries the number of
 *   the newest write since the last one (`write`), for the host to answer.
 * @returns The props, an event's recorder in its place.
 */
export function withEventRecorders(
  props: Record<string, unknown>,
  events: readonly string[] = [],
  target: Window = window,
  mount?: number,
  writes?: PendingWriteBacks
): Record<string, unknown> {
  if (events.length === 0) return props;
  const recorded = { ...props };
  for (const name of events) {
    const own = props[name];
    recorded[name] = (...parameters: unknown[]) => {
      const write = writes?.takeUnreported();
      const report: PreviewEventMessage = {
        type: PREVIEW_MESSAGE.event,
        name,
        payload: summarizeArguments(parameters),
        ...plainValue(parameters[0]),
        ...(mount !== undefined ? { mount } : {}),
        ...(write !== undefined ? { write } : {}),
      };
      target.parent?.postMessage(report, '*');
      return typeof own === 'function' ? own(...parameters) : undefined;
    };
  }
  return recorded;
}

/** An event's first argument as `{ value }`, a copy, when it is plain data:
 *  `null`, a boolean, a finite number, a string, or an array or plain object
 *  of these. Anything else, such as a browser event or an element, gives
 *  nothing. */
function plainValue(value: unknown): { value?: unknown } {
  return isPlainData(value, 0)
    ? { value: JSON.parse(JSON.stringify(value)) }
    : {};
}

/**
 * Whether a value is plain data, which survives `postMessage` and JSON as it
 * is: `null`, a boolean, a finite number, a string, or an array or plain
 * object of these.
 *
 * @param value - The value.
 * @param depth - How deep the value sits in the one being read.
 * @returns `true` when the value is plain data.
 */
export function isPlainData(value: unknown, depth = 0): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || depth > 32) return false;
  if (Array.isArray(value))
    return value.every((entry) => isPlainData(entry, depth + 1));
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value).every((entry) => isPlainData(entry, depth + 1));
}

/** A readable, one-line summary of what an event was called with. */
export function summarizeArguments(parameters: unknown[]): string {
  return parameters.map(summarizeValue).join(', ');
}

function summarizeValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (typeof value === 'function') return 'function';
  if (typeof Event !== 'undefined' && value instanceof Event)
    return `${value.constructor.name} ${value.type}`;
  // React hands a handler its own wrapper of the browser's event, which
  // holds the event itself: summarized alike, it reads as Vue's and
  // Svelte's do.
  if (
    typeof Event !== 'undefined' &&
    typeof value === 'object' &&
    value !== null &&
    (value as { nativeEvent?: unknown }).nativeEvent instanceof Event
  )
    return summarizeValue((value as { nativeEvent: Event }).nativeEvent);
  if (typeof Element !== 'undefined' && value instanceof Element)
    return `<${value.tagName.toLowerCase()}>`;
  try {
    const text = JSON.stringify(value);
    return text.length > 200 ? `${text.slice(0, 197)}...` : text;
  } catch {
    // An object JSON cannot hold, such as one that refers to itself, by
    // the name of what made it.
    return typeof value === 'object' && value !== null
      ? (value.constructor?.name ?? 'Object')
      : String(value);
  }
}

/**
 * @param props - The mounted story's new root props.
 * @param answers - The newest of the receiving pane's write-backs the host
 *   has taken.
 * @returns A {@link PreviewPropsMessage}.
 */
export function propsMessage(
  props: Record<string, unknown>,
  answers?: number
): PreviewPropsMessage {
  return {
    type: PREVIEW_MESSAGE.props,
    props,
    ...(answers !== undefined ? { answers } : {}),
  };
}

/**
 * @param options - The option values, keyed by option id.
 * @returns A {@link PreviewGlobalsMessage}.
 */
export function globalsMessage(
  options: Record<string, OptionValue>
): PreviewGlobalsMessage {
  return { type: PREVIEW_MESSAGE.globals, options };
}

/**
 * @param catalog - The kit's name, sources and browseable stories.
 * @returns A {@link PreviewCatalogMessage}.
 */
export function catalogMessage(
  catalog: PreviewCatalogPayload
): PreviewCatalogMessage {
  return { type: PREVIEW_MESSAGE.catalog, ...catalog };
}

/**
 * @param id - The component story to open.
 * @param props - Root props to open it with, over the component's defaults.
 * @returns A {@link PreviewSelectMessage}.
 */
export function selectMessage(
  id: string,
  props?: Record<string, unknown>
): PreviewSelectMessage {
  return { type: PREVIEW_MESSAGE.select, id, props };
}

/**
 * @param content - The target's source, its language, or why it has none.
 * @returns A {@link PreviewCodeMessage}.
 */
export function codeMessage(content: CodeBlockContent): PreviewCodeMessage {
  return { type: PREVIEW_MESSAGE.code, ...content };
}

/**
 * Tell the host what the iframe's story threw as it rendered, or, with no
 * message, that the story mounted since renders.
 *
 * @param message - The error's message; omitted when a new story mounts.
 * @param target - The iframe's window.
 */
export function reportRenderError(
  message?: string,
  target: Window = window
): void {
  const report: PreviewRenderErrorMessage = {
    type: PREVIEW_MESSAGE.renderError,
  };
  if (message !== undefined) report.message = message;
  (target as unknown as Record<string, unknown>)[PREVIEW_RENDER_ERROR_FLAG] =
    message ?? null;
  target.parent?.postMessage(report, '*');
}

/**
 * @param size - The content's width and height in CSS pixels.
 * @returns A {@link PreviewContentSizeMessage}.
 */
export function contentSizeMessage(
  size: PreviewContentSize
): PreviewContentSizeMessage {
  return {
    type: PREVIEW_MESSAGE.contentSize,
    width: size.width,
    height: size.height,
  };
}

/**
 * @param story - The markup to show, the reason there is none, or neither
 *   while it is being printed.
 * @returns A {@link PreviewMarkupMessage}.
 */
export function markupMessage(
  story:
    | { markup: string; stylesheet?: string }
    | { reason: string }
    | Record<string, never>
): PreviewMarkupMessage {
  return { type: PREVIEW_MESSAGE.markup, ...story };
}

/**
 * Read posted data as a content size: its width and height when both are
 * finite numbers of zero or more, otherwise `undefined`.
 *
 * @param message - A {@link PreviewContentSizeMessage} as it was received.
 * @returns The size, or `undefined` for a malformed message.
 */
export function readContentSize(
  message: PreviewContentSizeMessage
): PreviewContentSize | undefined {
  const { width, height } = message as { width?: unknown; height?: unknown };
  const valid = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0;
  return valid(width) && valid(height) ? { width, height } : undefined;
}

/** The window property an iframe sets to `true` once it can receive messages,
 *  for a test that loads the iframe's page on its own (where the ready message
 *  has no parent to reach). */
export const PREVIEW_READY_FLAG = '__previewReady';

/** The window property a story iframe sets to the ids of the stories it can
 *  mount, for a test helper to reject an id that would mount nothing. */
export const PREVIEW_STORIES_FLAG = '__previewStories';

/** The window property a preview iframe sets to the kit's options, each with
 *  the values a choice option offers, for a test helper to reject an id or a
 *  value the iframe would ignore. */
export const PREVIEW_OPTIONS_FLAG = '__previewOptions';

/** The window property a story iframe sets to the message of what its story
 *  threw as it rendered, or to `null` while the story mounted since renders,
 *  for a test that loads the iframe's page on its own (where the report has no
 *  parent to reach). The message is a string, and may be empty. */
export const PREVIEW_RENDER_ERROR_FLAG = '__previewRenderError';

/** The window property a story iframe sets to the id of the story it last
 *  finished mounting, or to the empty string once a story has unmounted with
 *  none set after it. Set after the story's first render and its effects, so
 *  a test that loads the iframe's page on its own can tell a story that
 *  rendered nothing from one still mounting. */
export const PREVIEW_MOUNTED_STORY_FLAG = '__previewMountedStory';

/** The id of the element each preview iframe mounts its story or view in. */
export const PREVIEW_MOUNT_ELEMENT_ID = 'app';

/**
 * Announce that an iframe shows its first content: post a
 * {@link PreviewShownMessage} to the parent window once the content mounted
 * now has painted, two animation frames on. Call it after the iframe mounts
 * the first content the host sends; a later call in the same document sends
 * nothing.
 *
 * @param target - The iframe's window.
 */
export function announcePreviewShown(target: Window = window): void {
  const flags = target as unknown as Record<string, unknown>;
  if (flags[PREVIEW_SHOWN_FLAG]) return;
  flags[PREVIEW_SHOWN_FLAG] = true;
  target.requestAnimationFrame(() =>
    target.requestAnimationFrame(() => {
      if (target.parent !== target)
        target.parent.postMessage({ type: PREVIEW_MESSAGE.shown }, '*');
    })
  );
}

/**
 * Record under {@link PREVIEW_MOUNTED_STORY_FLAG} that the iframe has finished
 * mounting a story. Call it once the framework has committed the mount,
 * whatever the story rendered.
 *
 * @param id - The story's id, or the empty string after an unmount.
 * @param target - The iframe's window.
 */
export function announceStoryMounted(
  id: string,
  target: Window = window
): void {
  (target as unknown as Record<string, unknown>)[PREVIEW_MOUNTED_STORY_FLAG] =
    id;
}

/** Set on an iframe's window once it has announced its first content. */
const PREVIEW_SHOWN_FLAG = '__previewShown';

/**
 * List the stories an iframe can mount under {@link PREVIEW_STORIES_FLAG}.
 * Call it before {@link announcePreviewReady}, so a test that waits for the
 * iframe finds the list.
 *
 * @param ids - The ids of the stories.
 * @param target - The iframe's window.
 */
export function announcePreviewStories(
  ids: readonly string[],
  target: Window = window
): void {
  (target as unknown as Record<string, unknown>)[PREVIEW_STORIES_FLAG] = [
    ...ids,
  ];
}

/** An option as a preview iframe lists it: its id and, for a choice, the
 *  values it offers; a boolean option has no `values`. */
export interface PreviewListedOption {
  /** The option's id. */
  id: string;
  /** The values of a choice option. */
  values?: string[];
}

/**
 * List the kit's options under {@link PREVIEW_OPTIONS_FLAG}.
 *
 * @param options - The options.
 * @param target - The iframe's window.
 */
export function announcePreviewOptions(
  options: readonly Pick<PreviewOption, 'id' | 'values'>[],
  target: Window = window
): void {
  (target as unknown as Record<string, unknown>)[PREVIEW_OPTIONS_FLAG] =
    options.map(
      ({ id, values }): PreviewListedOption =>
        values ? { id, values: values.map((choice) => choice.value) } : { id }
    );
}

/**
 * Announce that an iframe listens for messages: set {@link PREVIEW_READY_FLAG}
 * and post a {@link PreviewReadyMessage} to the parent window. Call it right
 * after attaching the message listener.
 *
 * @param target - The iframe's window.
 */
export function announcePreviewReady(target: Window = window): void {
  (target as unknown as Record<string, unknown>)[PREVIEW_READY_FLAG] = true;
  // A pane opened on its own, with no host, gives itself the story its
  // address names, as a host would.
  const standalone =
    target.parent === target ? standaloneMessages(target.location.search) : [];
  if (standalone.length > 0) {
    for (const message of standalone) target.postMessage(message, '*');
    return;
  }
  target.parent?.postMessage(readyMessage(), '*');
}

/** The pixel value of a computed length such as `12px`; `0` for anything else. */
function pixels(value: string): number {
  const number = parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

/** Whether the mount's height may follow the layout around it rather than its
 *  content: it holds a minimum height of its own, or it is a flex or grid
 *  item, which the container may stretch. */
function heightFollowsLayout(mount: HTMLElement, view: Window): boolean {
  if (pixels(view.getComputedStyle(mount).minHeight) > 0) return true;
  const parent = mount.parentElement;
  if (!parent) return false;
  const display = view.getComputedStyle(parent).display;
  return /flex|grid/.test(display);
}

/** The height the mount's children span, each with its vertical margins:
 *  fixed-position children overlay the page and are left out. */
function childrenHeight(mount: HTMLElement, view: Window): number {
  let top = Infinity;
  let bottom = -Infinity;
  const range = mount.ownerDocument.createRange();
  for (const node of mount.childNodes) {
    if (node.nodeType === 1) {
      const element = node as Element;
      const style = view.getComputedStyle(element);
      if (style.display === 'none' || style.position === 'fixed') continue;
      const rectangle = element.getBoundingClientRect();
      top = Math.min(top, rectangle.top - pixels(style.marginTop));
      bottom = Math.max(bottom, rectangle.bottom + pixels(style.marginBottom));
    } else if (node.nodeType === 3 && node.textContent?.trim()) {
      range.selectNodeContents(node);
      const rectangle = range.getBoundingClientRect();
      top = Math.min(top, rectangle.top);
      bottom = Math.max(bottom, rectangle.bottom);
    }
  }
  return bottom > top ? bottom - top : 0;
}

/**
 * Measure what an iframe shows: the mount element's own box, with the
 * padding, borders and margins of the mount and every element around it up
 * to the body, rounded up to whole CSS pixels. Nothing in it depends on the
 * height of the iframe, so a host that sizes the iframe to it does not make
 * it grow: a wrapper's `min-height: 100vh` adds nothing but its padding.
 * Where the mount's own height may follow the layout around it (a minimum
 * height of its own, or a flex or grid item), its children's extent stands
 * in for it.
 *
 * @param mount - The element the story or view is mounted in.
 * @returns The content's width and height.
 */
export function measureContentSize(mount: HTMLElement): PreviewContentSize {
  const view = mount.ownerDocument.defaultView;
  if (!view) return { width: 0, height: 0 };
  const box = mount.getBoundingClientRect();
  const mountStyle = view.getComputedStyle(mount);
  let width = box.width;
  let height = heightFollowsLayout(mount, view)
    ? childrenHeight(mount, view) +
      pixels(mountStyle.paddingTop) +
      pixels(mountStyle.paddingBottom) +
      pixels(mountStyle.borderTopWidth) +
      pixels(mountStyle.borderBottomWidth)
    : box.height;
  const root = mount.ownerDocument.documentElement;
  for (
    let element: HTMLElement | null = mount;
    element && element !== root;
    element = element.parentElement
  ) {
    const style = view.getComputedStyle(element);
    height += pixels(style.marginTop) + pixels(style.marginBottom);
    width += pixels(style.marginLeft) + pixels(style.marginRight);
    if (element === mount) continue;
    height +=
      pixels(style.paddingTop) +
      pixels(style.paddingBottom) +
      pixels(style.borderTopWidth) +
      pixels(style.borderBottomWidth);
    width +=
      pixels(style.paddingLeft) +
      pixels(style.paddingRight) +
      pixels(style.borderLeftWidth) +
      pixels(style.borderRightWidth);
  }
  return { width: Math.ceil(width), height: Math.ceil(height) };
}

const reporting = new WeakMap<HTMLElement, () => void>();

/**
 * Report the size of what an iframe shows to the parent window as a
 * {@link PreviewContentSizeMessage}: once now, and again whenever it
 * changes, at most once per animation frame and only when the size differs
 * from the last one reported. It watches the mount, its children and the
 * elements around it for a change of size, the mount's content for a change
 * of nodes or text, the elements around it for a change of class or style,
 * and the window for a resize. Call it once the message listener is
 * attached; a second call for the same mount returns the first one's stop.
 *
 * @param mount - The element the story or view is mounted in.
 * @param target - The iframe's window.
 * @returns A function that stops the reports.
 */
export function reportContentSize(
  mount: HTMLElement,
  target: Window = window
): () => void {
  const running = reporting.get(mount);
  if (running) return running;
  const root = mount.ownerDocument.documentElement;
  let pending: number | undefined;
  let last = '';

  function report(): void {
    pending = undefined;
    const size = measureContentSize(mount);
    const key = `${size.width}x${size.height}`;
    if (key === last) return;
    last = key;
    target.parent?.postMessage(contentSizeMessage(size), '*');
  }

  function schedule(): void {
    if (pending === undefined) pending = target.requestAnimationFrame(report);
  }

  const observed = new Set<Element>();
  const resizeObserver =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(schedule)
      : undefined;
  const surroundings = new MutationObserver(schedule);

  function observeElements(): void {
    const elements: Element[] = [...mount.children];
    for (
      let element: HTMLElement | null = mount;
      element && element !== root;
      element = element.parentElement
    ) {
      elements.push(element);
    }
    for (const element of elements) {
      if (observed.has(element)) continue;
      observed.add(element);
      resizeObserver?.observe(element, { box: 'border-box' });
    }
    for (const element of [...observed]) {
      if (elements.includes(element)) continue;
      observed.delete(element);
      resizeObserver?.unobserve(element);
    }
  }

  const content = new MutationObserver(() => {
    observeElements();
    schedule();
  });
  content.observe(mount, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  for (
    let element: HTMLElement | null = mount;
    element;
    element = element.parentElement
  ) {
    surroundings.observe(element, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
  }
  observeElements();
  target.addEventListener('resize', schedule);
  schedule();

  const stop = (): void => {
    if (pending !== undefined) target.cancelAnimationFrame(pending);
    pending = undefined;
    resizeObserver?.disconnect();
    content.disconnect();
    surroundings.disconnect();
    target.removeEventListener('resize', schedule);
    reporting.delete(mount);
  };
  reporting.set(mount, stop);
  return stop;
}

/** The query parameter that names the view the view iframe renders. */
export const VIEW_PARAMETER = 'view';

/** The query parameter that names the framework of the view the view iframe
 *  renders, so the iframe loads that framework's setup module before the view. */
export const VIEW_FRAMEWORK_PARAMETER = 'framework';

/** The query parameter that names the target whose source a code iframe
 *  shows. */
export const CODE_TARGET_PARAMETER = 'target';

/** The query parameter a component iframe's URL carries so that changing it
 *  reloads the iframe. */
export const RELOAD_PARAMETER = 'r';

/**
 * The URL of a story pane's iframe: a target's, or the html one's.
 *
 * @param target - What the iframe renders in.
 * @param reload - A counter whose change reloads the iframe; omitted, the URL
 *   carries no reload parameter.
 * @param baseUrl - The URL the preview is served under, ending in `/`; the
 *   root of the origin, `/`, by default.
 * @returns The page's URL, such as `/preview/vue/preview.html?r=0`.
 */
export function componentFrameUrl(
  target: PreviewTarget,
  reload?: number,
  baseUrl = '/'
): string {
  const path = `${baseUrl}preview/${target}/preview.html`;
  return reload === undefined ? path : `${path}?${RELOAD_PARAMETER}=${reload}`;
}

/** The query parameters a target's pane, opened on its own, reads its
 *  story from: the story's id, its root props and the option values, the
 *  latter two as JSON. */
export const STANDALONE_PARAMETERS = {
  story: 'story',
  props: 'props',
  options: 'options',
} as const;

/**
 * The URL of a target's pane opened on its own, outside the preview: it
 * shows `story` with its props under its option values, as the preview's pane
 * does, with no host to follow.
 *
 * @param target - The target to render the story in.
 * @param story - The story's id, root props and option values.
 * @param baseUrl - The URL the preview is served under, ending in `/`.
 * @returns The pane's URL.
 */
export function standaloneFrameUrl(
  target: PreviewScriptedTarget,
  story: {
    id: string;
    props: Record<string, unknown>;
    options: Record<string, OptionValue>;
  },
  baseUrl = '/'
): string {
  const query = new URLSearchParams({
    [STANDALONE_PARAMETERS.story]: story.id,
    [STANDALONE_PARAMETERS.props]: JSON.stringify(story.props),
    [STANDALONE_PARAMETERS.options]: JSON.stringify(story.options),
  });
  return `${componentFrameUrl(target, undefined, baseUrl)}?${query}`;
}

/**
 * The messages a pane opened on its own gives itself, from its address: the
 * story to mount and the option values. None when the address names no story.
 *
 * @param search - The pane's `location.search`.
 * @returns A set-story and a globals message, or none.
 */
export function standaloneMessages(search: string): PreviewMessage[] {
  const query = new URLSearchParams(search);
  const id = query.get(STANDALONE_PARAMETERS.story);
  if (!id) return [];
  const parsed = (name: string): Record<string, unknown> => {
    try {
      const value: unknown = JSON.parse(query.get(name) ?? '{}');
      return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  };
  return [
    setStoryMessage(id, parsed(STANDALONE_PARAMETERS.props)),
    globalsMessage(
      parsed(STANDALONE_PARAMETERS.options) as Record<string, OptionValue>
    ),
  ];
}

/**
 * The URL of a code iframe: the kit's code block, showing one target's
 * source.
 *
 * @param target - The target whose source the block shows.
 * @param framework - The block's framework; a framework other than `'dom'`
 *   is named in the URL, so the iframe loads its setup module first.
 * @param baseUrl - The URL the preview is served under, ending in `/`.
 * @returns The page's URL, such as `/preview/code/code.html?target=vue`.
 */
export function codeFrameUrl(
  target: PreviewTarget,
  framework: ViewFramework = 'dom',
  baseUrl = '/'
): string {
  const path = `${baseUrl}preview/code/code.html?${CODE_TARGET_PARAMETER}=${target}`;
  return framework === 'dom'
    ? path
    : `${path}&${VIEW_FRAMEWORK_PARAMETER}=${framework}`;
}

/**
 * The URL of the view iframe rendering one custom view.
 *
 * @param viewId - The view's id.
 * @param framework - The view's framework; a framework other than `'dom'` is
 *   named in the URL, so the iframe loads its setup module ahead of the views.
 * @param baseUrl - The URL the preview is served under, ending in `/`; the
 *   root of the origin, `/`, by default.
 * @returns The page's URL, such as `/preview/view/view.html?view=tokens`.
 */
export function viewFrameUrl(
  viewId: string,
  framework: ViewFramework = 'dom',
  baseUrl = '/'
): string {
  const path = `${baseUrl}preview/view/view.html?${VIEW_PARAMETER}=${viewId}`;
  return framework === 'dom'
    ? path
    : `${path}&${VIEW_FRAMEWORK_PARAMETER}=${framework}`;
}
