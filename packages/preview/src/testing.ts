// Browser-test helpers for a kit's components: load one target's preview page
// on its own and drive it over the messages the preview host sends it. The page
// object is typed structurally, so a Playwright `Page` fits without the preview
// depending on Playwright. The functions handed to `evaluate` and
// `waitForFunction` run in the browser, so they read only their argument and
// browser globals, never this module's bindings.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ManifestComponent } from './emit/manifest.js';
import type { OptionValue } from './options.js';
import {
  componentFrameUrl,
  globalsMessage,
  PREVIEW_MOUNT_ELEMENT_ID,
  PREVIEW_MOUNTED_STORY_FLAG,
  PREVIEW_OPTIONS_FLAG,
  PREVIEW_READY_FLAG,
  PREVIEW_RENDER_ERROR_FLAG,
  PREVIEW_SCRIPTED_TARGETS,
  PREVIEW_STORIES_FLAG,
  propsMessage,
  setStoryMessage,
  type PreviewListedOption,
  type PreviewScriptedTarget,
  type PreviewMessage,
} from './protocol.js';

/** The id of the element a preview page mounts its story or view in. */
export { PREVIEW_MOUNT_ELEMENT_ID };

/** A component as the preview manifest lists it: the parts a browser test
 *  reads. */
export type PreviewManifestComponent = Pick<ManifestComponent, 'id' | 'name'> &
  Partial<
    Pick<
      ManifestComponent,
      'defaultProps' | 'previewDefaults' | 'standalone' | 'targets' | 'bindings'
    >
  > & {
    /** The story's scenarios, each with the props it sets over the defaults
     *  and, for one with slot content of its own, that content and the id
     *  its story mounts by. */
    scenarios?: (Pick<ManifestComponent['scenarios'][number], 'id'> &
      Partial<
        Pick<
          ManifestComponent['scenarios'][number],
          'label' | 'props' | 'content' | 'story'
        >
      >)[];
  };

/**
 * Read the components of a kit's preview manifest,
 * `.preview-generated/manifest.json`, which the preview writes when it
 * starts.
 *
 * @param kitRoot - The kit's root directory.
 * @returns The components the manifest lists.
 * @example
 * ```ts
 * for (const component of readPreviewManifest('.')) {
 *   test(component.id, async ({ page }) => {});
 * }
 * ```
 */
export function readPreviewManifest(
  kitRoot: string
): PreviewManifestComponent[] {
  const manifest = JSON.parse(
    readFileSync(join(kitRoot, '.preview-generated', 'manifest.json'), 'utf8')
  ) as { components: PreviewManifestComponent[] };
  return manifest.components;
}

/** The window property a story page sets to what its story threw; see
 *  {@link readRenderError}. */
export { PREVIEW_RENDER_ERROR_FLAG };

/** A target whose preview page the helpers load: `react`, `vue` or `svelte`. */
export type { PreviewScriptedTarget };

/** Preview option values keyed by option id, such as `{ mode: 'dark' }`. */
export type PreviewOptionValues = Record<string, OptionValue>;

/**
 * The part of a browser page the helpers use. A Playwright `Page` satisfies
 * it, as does any object with these three methods.
 */
export interface PreviewPage {
  /** Navigate to `url`, resolving once the page has loaded. */
  goto(url: string, options?: { waitUntil?: 'load' }): Promise<unknown>;
  /** Resolve once `pageFunction`, run in the page with `argument`, returns a truthy value. */
  waitForFunction<Argument>(
    pageFunction: (argument: Argument) => unknown,
    argument: Argument
  ): Promise<unknown>;
  /** Run `pageFunction` in the page with `argument` and resolve with its result. */
  evaluate<Result, Argument>(
    pageFunction: (argument: Argument) => Result | Promise<Result>,
    argument: Argument
  ): Promise<Result>;
}

/** Where the preview is served. */
export interface PreviewLocationOptions {
  /** Prefixed to the preview page's path, such as `http://localhost:6100`.
   *  Omit it to navigate by path alone (resolved against the test runner's
   *  base URL, such as Playwright's `use.baseURL`). */
  baseUrl?: string;
}

/** How long a loaded preview page has to start listening. The page's load
 *  has already waited for its modules, so only a page that failed to run
 *  them comes near this. */
const READY_TIMEOUT_MILLISECONDS = 15_000;

/** How long a story set on a loaded page has to finish mounting. Mounting
 *  needs no network, so only a page that has stopped comes near this. */
const STORY_TIMEOUT_MILLISECONDS = 15_000;

/** Wait for `wait`, or throw `message` past the deadline. A wait left past
 *  the deadline rejects when the page closes, which is ignored. */
async function withinDeadline(
  wait: Promise<unknown>,
  milliseconds: number,
  message: string
): Promise<void> {
  wait.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds);
  });
  try {
    await Promise.race([wait, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Load a target's preview page and wait until it listens for messages. The
 * page shows nothing until a story is set.
 *
 * @param page - The browser page.
 * @param target - The target whose preview page to load.
 * @param options - Where the preview is served.
 * @throws When the target has no story page, the message naming those that
 *   do, or when the page never starts listening, such as after an import
 *   fails to load.
 * @example
 * ```ts
 * test.beforeEach(async ({ page }) => {
 *   await gotoPreview(page, 'vue');
 * });
 * ```
 */
export async function gotoPreview(
  page: PreviewPage,
  target: PreviewScriptedTarget,
  options: PreviewLocationOptions = {}
): Promise<void> {
  if (!(PREVIEW_SCRIPTED_TARGETS as readonly string[]).includes(target)) {
    throw new Error(
      `'${target}' has no story page; the story pages are ${PREVIEW_SCRIPTED_TARGETS.join(', ')}`
    );
  }
  const baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '');
  const url = `${baseUrl}${componentFrameUrl(target)}`;
  await page.goto(url, { waitUntil: 'load' });
  await withinDeadline(
    page.waitForFunction(
      (flag) => (window as unknown as Record<string, unknown>)[flag] === true,
      PREVIEW_READY_FLAG
    ),
    READY_TIMEOUT_MILLISECONDS,
    `gotoPreview: the preview page at ${url} never announced itself: look for a page error (an import that fails to load) in the browser console or the web server log.`
  );
}

/** Post a preview message to the page's own window, where the preview listens. */
async function post(page: PreviewPage, message: PreviewMessage): Promise<void> {
  await page.evaluate((posted) => window.postMessage(posted, '*'), message);
}

/**
 * What a preview page lists under a window property. A message posted to a
 * page that lists nothing would reach nothing, so that throws, saying whether
 * the page is a preview page at all.
 */
async function listedEntries<Entry>(
  page: PreviewPage,
  flag: string,
  helper: string
): Promise<Entry[]> {
  const read = (name: string) =>
    (window as unknown as Record<string, unknown>)[name];
  const ids = await page.evaluate(read, flag);
  if (!Array.isArray(ids)) {
    throw new Error(
      (await page.evaluate(read, PREVIEW_READY_FLAG)) === true
        ? `${helper}: this is a preview page that mounts no story (its html or view page, or a preview older than these helpers).`
        : `${helper} needs a loaded preview page, and this page is not one: load it with gotoPreview first.`
    );
  }
  return ids as Entry[];
}

/**
 * The ids of the stories a preview page can mount.
 *
 * @param page - A page {@link gotoPreview} loaded.
 * @returns The story ids.
 * @throws When the page is not a preview page that mounts stories.
 */
export function readStoryIds(page: PreviewPage): Promise<string[]> {
  return listedEntries<string>(page, PREVIEW_STORIES_FLAG, 'readStoryIds');
}

/**
 * What the story mounted on a preview page threw as it rendered, as the pane
 * reports it: only a throw that reaches the pane counts, so a story with its
 * own error boundary, or the word "error" in its content, reads as rendering.
 *
 * @param page - A page {@link gotoPreview} loaded.
 * @returns The error's message, which may be empty, or `undefined` when the
 *   story renders.
 * @example
 * ```ts
 * await mountStory(page, 'components-button');
 * await settle(page);
 * expect(await readRenderError(page)).toBeUndefined();
 * ```
 */
export async function readRenderError(
  page: PreviewPage
): Promise<string | undefined> {
  const message = await page.evaluate(
    (flag) => (window as unknown as Record<string, unknown>)[flag],
    PREVIEW_RENDER_ERROR_FLAG
  );
  return typeof message === 'string' ? message : undefined;
}

/** Throw unless the page can mount the story: a page shows nothing for an id
 *  it does not know, and every check on the empty mount would pass. */
async function requireStory(
  page: PreviewPage,
  id: string,
  helper: string
): Promise<void> {
  const known = await listedEntries<string>(page, PREVIEW_STORIES_FLAG, helper);
  if (!known.includes(id)) {
    throw new Error(
      `${helper}: this preview has no story with the id '${id}'. Its stories: ${known.join(', ') || 'none'}.`
    );
  }
}

/**
 * Mount a story by id with the given root props, replacing what the page
 * shows. Setting the story already shown with other props keeps its component
 * instance on some targets; use {@link mountStory} for a guaranteed fresh
 * mount.
 *
 * @param page - A page {@link gotoPreview} loaded.
 * @param id - The story's id.
 * @param props - The story's root props.
 * @throws When the page has no story with the id; the message lists those it
 *   has.
 */
export async function setStory(
  page: PreviewPage,
  id: string,
  props: Record<string, unknown> = {}
): Promise<void> {
  await requireStory(page, id, 'setStory');
  await post(page, setStoryMessage(id, props));
}

/**
 * Mount a story from nothing: blur the focused element, unmount the current
 * story and wait for the mount point to empty, then set the story. The new
 * story inherits neither focus nor component state from the one before, which
 * a sweep over a component's states needs (a state read at mount, such as an
 * initially open panel, only applies to a fresh instance).
 *
 * @param page - A page {@link gotoPreview} loaded.
 * @param id - The story's id.
 * @param props - The story's root props.
 * @throws When the page has no story with the id, the message listing those
 *   it has, or when the mount is not empty within 15 seconds of the unmount.
 */
export async function mountStory(
  page: PreviewPage,
  id: string,
  props: Record<string, unknown> = {}
): Promise<void> {
  await requireStory(page, id, 'mountStory');
  await page.evaluate(
    () => (document.activeElement as HTMLElement | null)?.blur?.(),
    undefined
  );
  // No story is registered under the empty id, so every target unmounts.
  await post(page, setStoryMessage('', {}));
  await withinDeadline(
    page.waitForFunction(
      (mountId) => document.getElementById(mountId)?.childElementCount === 0,
      PREVIEW_MOUNT_ELEMENT_ID
    ),
    STORY_TIMEOUT_MILLISECONDS,
    `mountStory: the page never cleared the mount ahead of the story '${id}': the story before it may have thrown as it unmounted; look for a page error in the browser console.`
  );
  // The page's last report is cleared here, not awaited from the page: the
  // pane reports its own unmount, but after its paint in React, which a mount
  // already empty may be read before, and a story set twice in a row would
  // then pass {@link waitForStory} on its first mount's report.
  await page.evaluate((flag) => {
    (window as unknown as Record<string, unknown>)[flag] = '';
  }, PREVIEW_MOUNTED_STORY_FLAG);
  await post(page, setStoryMessage(id, props));
}

/**
 * Wait until a story set with {@link mountStory} has finished mounting,
 * whatever it rendered: a story can legitimately render nothing, which an
 * element to wait for would never show, and a story that throws counts as
 * mounted. It follows `mountStory`, which clears the page's last report;
 * after {@link setStory} that report can be the same story's from before.
 *
 * @param page - A page {@link gotoPreview} loaded.
 * @param id - The story's id.
 * @throws When the story does not finish mounting within 15 seconds.
 * @example
 * ```ts
 * await mountStory(page, 'components-banner', { visible: false });
 * await waitForStory(page, 'components-banner');
 * await expect(page.locator('#app > *')).toHaveCount(0);
 * ```
 */
export async function waitForStory(
  page: PreviewPage,
  id: string
): Promise<void> {
  await withinDeadline(
    page.waitForFunction(
      (argument) =>
        (window as unknown as Record<string, unknown>)[argument.flag] ===
        argument.id,
      { id, flag: PREVIEW_MOUNTED_STORY_FLAG }
    ),
    STORY_TIMEOUT_MILLISECONDS,
    `waitForStory: the story '${id}' never finished mounting: look for a page error in the browser console, or a page that has stopped responding.`
  );
}

/**
 * Replace the mounted story's root props, keeping its component instance (and
 * any state machine driving it) alive.
 *
 * @param page - A page {@link gotoPreview} loaded.
 * @param props - The story's new root props.
 */
export async function setProps(
  page: PreviewPage,
  props: Record<string, unknown>
): Promise<void> {
  await post(page, propsMessage(props));
}

/**
 * Apply preview option values (a color mode, a surface, a frame around the
 * story) to the page, as the preview's controls do.
 *
 * @param page - A page {@link gotoPreview} loaded.
 * @param options - Option values keyed by option id.
 * @throws When an id is not one of the kit's options, or a value is not one
 *   the option takes, either of which the page would ignore; the message lists
 *   what it defines.
 */
export async function setOptions(
  page: PreviewPage,
  options: PreviewOptionValues
): Promise<void> {
  const listed = await listedEntries<PreviewListedOption>(
    page,
    PREVIEW_OPTIONS_FLAG,
    'setOptions'
  );
  const known = listed.map((option) => option.id);
  const unknown = Object.keys(options).filter((id) => !known.includes(id));
  if (unknown.length > 0) {
    throw new Error(
      `setOptions: this preview defines no option ${unknown.map((id) => `'${id}'`).join(', ')}. Its options: ${known.join(', ') || 'none'}.`
    );
  }
  for (const [id, value] of Object.entries(options)) {
    const { values } = listed.find((option) => option.id === id)!;
    if (
      values ? !values.includes(value as string) : typeof value !== 'boolean'
    ) {
      throw new Error(
        values
          ? `setOptions: option '${id}' has no value ${JSON.stringify(value)}. Its values: ${values.join(', ')}.`
          : `setOptions: option '${id}' takes true or false, not ${JSON.stringify(value)}.`
      );
    }
  }
  await post(page, globalsMessage(options));
}

/**
 * Wait until the frame after the next paint. A component can show its final
 * markup before the effects that attach its event handling have run; call this
 * after asserting a change has rendered and before sending input, such as a
 * key press, that would otherwise be dropped.
 *
 * @param page - The browser page.
 */
export async function settle(page: PreviewPage): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
    undefined
  );
}

/** What {@link openStory} loads and mounts. */
export interface OpenStoryOptions extends PreviewLocationOptions {
  /** The target whose preview page to load. */
  target: PreviewScriptedTarget;
  /** The story's id, as the catalog and the address name it, such as
   *  `components-button` (`PreviewComponent.id`). */
  id: string;
  /** The story's root props. */
  props?: Record<string, unknown>;
  /** Preview option values applied before the story mounts. */
  options?: PreviewOptionValues;
}

/** A story open in a page, with the page's controls bound to it. */
export interface PreviewStory<Page extends PreviewPage = PreviewPage> {
  /** The page showing the story; the preview page is loaded at the top level,
   *  so locators and keyboard input go straight to it. */
  page: Page;
  /** The target the story renders in. */
  target: PreviewScriptedTarget;
  /** Replace the story's root props, keeping its component instance. */
  setProps(props: Record<string, unknown>): Promise<void>;
  /** Apply preview option values. */
  setOptions(options: PreviewOptionValues): Promise<void>;
  /** Show another story (see {@link setStory}). */
  setStory(id: string, props?: Record<string, unknown>): Promise<void>;
  /** Show another story from a fresh mount (see {@link mountStory}). */
  mountStory(id: string, props?: Record<string, unknown>): Promise<void>;
  /** Wait until the frame after the next paint (see {@link settle}). */
  settle(): Promise<void>;
}

/**
 * Load a target's preview page and mount one story in it.
 *
 * @param page - The browser page.
 * @param options - The target, the story and its props, and option values.
 * @returns The open story.
 * @throws When the page has no story with the id, or an option id is not one
 *   of the kit's; the message lists those it has.
 * @example
 * ```ts
 * const story = await openStory(page, { target: 'vue', id: 'components-button', props: { variant: 'solid' } });
 * await story.setProps({ variant: 'ghost' });
 * await story.setOptions({ mode: 'dark' });
 * await expect(story.page.getByRole('button')).toHaveClass(/ghost/);
 * ```
 */
export async function openStory<Page extends PreviewPage>(
  page: Page,
  options: OpenStoryOptions
): Promise<PreviewStory<Page>> {
  const { target, id, props = {}, options: optionValues, baseUrl } = options;
  await gotoPreview(page, target, { baseUrl });
  if (optionValues) await setOptions(page, optionValues);
  await requireStory(page, id, 'openStory');
  await post(page, setStoryMessage(id, props));
  return {
    page,
    target,
    setProps: (next) => setProps(page, next),
    setOptions: (next) => setOptions(page, next),
    setStory: (nextId, nextProps) => setStory(page, nextId, nextProps),
    mountStory: (nextId, nextProps) => mountStory(page, nextId, nextProps),
    settle: () => settle(page),
  };
}
