// The driver the host characterization tests (tests/host.test.ts) run through.
// The tests speak only this interface: actions a shell can take (select a
// component, pick a scenario, set an option, edit the scenario editor's tree)
// and the observable outputs of the host (the messages each preview iframe is
// posted, the regeneration requests, each pane's source URL). This implementation
// drives the host page as shipped: it runs the real bootstrap in happy-dom,
// which loads the charcell shell (`@preview-shell`, aliased in
// vitest.config.ts), and works the shell's controls the way a person would.
// The controller driver implements the same interface against
// `createPreviewController` and keeps the test bodies, so nothing here may
// leak into the assertions: no React, no charcell markup, no class names.
//
// The DOM lookups below go by role, accessible name, the editor's data
// attributes and visible text, never by charcell's class names; they are the
// only part that knows the charcell shell's markup.

import { act } from 'react';
import { vi } from 'vitest';
import manifest from '../fixtures/host/manifest.json';
import { options as previewOptions } from '../fixtures/host/preview-configuration';
import { views } from '../fixtures/host/views';
import type { PreviewController, PreviewRegenerationStatus } from '../../src/controller';
import type { DropTarget, Step } from '../../src/controller/editor-tree';
import type { PreviewStoryReference } from '../../src/controller';
import {
  SCRIPTED_TARGETS,
  installPreviewEnvironment,
  isDetached,
  mountStoryPane,
  postFromFrame,
  targetOf,
  type FrameTarget,
  type Target,
  type PostedMessage,
  type PreviewEnvironment,
  type RegenerationOutcome,
  type RegenerationRequest,
  type StoryPane,
} from './preview-environment';

export type { DropTarget, Step };
export type { FrameTarget, Target, PostedMessage, RegenerationOutcome, RegenerationRequest, StoryPane };

/** How a driver starts the host. */
export interface PreviewHostStart {
  /** The host page's path and query, as a followed link opens it. Default `/`. */
  url?: string;
}

export interface PreviewHostDriver {
  /** Mount the host with the fixture kit. */
  start(options?: PreviewHostStart): Promise<void>;
  /** Unmount the host and restore what `start` stubbed. */
  stop(): Promise<void>;

  // --- what the host shows the outside world --------------------------------
  /** The messages posted to `target` since the last `clearMessages`, in order. */
  messages(target: FrameTarget): unknown[];
  /** Every message posted since the last `clearMessages`, in order. */
  allMessages(): PostedMessage[];
  clearMessages(): void;
  /** The preview iframes currently mounted, in pane order. */
  frames(): FrameTarget[];
  /** The URL a mounted iframe loads; its change is how a pane reloads. */
  frameSource(target: FrameTarget): string | undefined;
  /** Every regeneration request made so far. */
  regenerationRequests(): RegenerationRequest[];
  /** Where the regeneration of the scratch story stands. */
  regenerationStatus(): PreviewRegenerationStatus;
  /** The story-scoped option ids the current story offers. */
  storyOptionsOffered(): Promise<string[]>;
  /** Open the output view's options popout. */
  openOutputOptions(): Promise<void>;
  /** Each target's visibility and whether the current story supports it. */
  targetToggles(): Record<
    Target,
    { visible: boolean; supported: boolean }
  >;
  /** Whether the scenario editor is shown (it can be mounted but hidden). */
  editorVisible(): boolean;
  /** Promise rejections nothing handled, such as a failed regeneration's. */
  unhandledRejections(): unknown[];
  /** The host page's query string, where it keeps what was chosen. */
  search(): string;
  /** The root props the selection's panes show, as the state holds them. */
  props(): Record<string, unknown>;

  // --- what a shell can do --------------------------------------------------
  /** Select a component story, as a navigation click does (no props). */
  selectComponent(id: string): Promise<void>;
  /** Select a custom view. */
  selectView(id: string): Promise<void>;
  /** Pick a scenario of the current story ('' is the anonymous default). */
  pickScenario(scenarioId: string): Promise<void>;
  /** Set a global option. */
  setOption(id: string, value: string | boolean): Promise<void>;
  /** Set a story option of the current story. */
  setStoryOption(id: string, value: string | boolean): Promise<void>;
  setTargetVisible(target: Target, visible: boolean): Promise<void>;
  openEditor(): Promise<void>;
  closeEditor(): Promise<void>;
  /** Set the editor root's props (the open editor's root node). */
  editRootProps(props: Record<string, unknown>): Promise<void>;
  /** Set the props of the element node at `path`. */
  editNestedProps(path: Step[], props: Record<string, unknown>): Promise<void>;
  /** Set the value of the text node at `path`. */
  setText(path: Step[], text: string): Promise<void>;
  /** Move the node at `from` to `to` (the editor's move resolver). */
  moveNode(from: Step[], to: DropTarget): Promise<void>;
  removeNode(path: Step[]): Promise<void>;
  /** Replace the story's root props, as a shell's props form does. */
  setProps(props: Record<string, unknown>): Promise<void>;
  /** Mount a detached pane of a story, apart from the selection's panes, as
   *  a shell's documentation page does. */
  mountStory(target: Target, story: PreviewStoryReference): Promise<StoryPane>;

  // --- what the iframes and the network do ----------------------------------
  /** `target`'s iframe announces it has (re)loaded: `preview:ready`. */
  frameReady(target: FrameTarget): Promise<void>;
  /** A message from the custom-view iframe to the host (`preview:select`). */
  sendFromView(message: unknown): Promise<void>;
  /** How the next regeneration requests are answered (default 'ok'). */
  setRegenerationOutcome(outcome: RegenerationOutcome): void;
  /** Let `milliseconds` pass and settle what they set off. */
  advanceTime(milliseconds: number): Promise<void>;
}

// Held in a variable so the workspace type-check does not follow the import
// into the app, whose build-time aliases only the app's own config maps.
const mainModule = '../../application/host/main';

/** The host page as the bootstrap mounts it: the charcell shell over the controller. */
export function createReactHostDriver(): PreviewHostDriver {
  let environment: PreviewEnvironment | undefined;
  let controller: PreviewController | undefined;
  let unmountShell: (() => void) | undefined;

  function iframes(): HTMLIFrameElement[] {
    return [...document.querySelectorAll('iframe')].filter((iframe) => !isDetached(iframe));
  }

  function current(): PreviewController {
    if (!controller) throw new Error('the host is not started');
    return controller;
  }

  function iframeFor(target: FrameTarget): HTMLIFrameElement | undefined {
    return iframes().find((iframe) => targetOf(iframe) === target);
  }

  async function settle(work: () => void | Promise<void> = () => {}) {
    await act(async () => {
      await work();
    });
  }

  async function click(element: Element) {
    await settle(() => (element as HTMLElement).click());
  }

  /** A labeled field's control: a select trigger, a text input or a toggle's checkbox.
   *  `owner` limits it to fields that belong to that editor node. */
  function fieldControl(
    label: string,
    scope: ParentNode = document,
    owner?: Element | null
  ): HTMLElement | undefined {
    const labelElement = [...scope.querySelectorAll('label, span')].find(
      (candidate) =>
        candidate.textContent === label &&
        candidate.nextElementSibling !== null &&
        (owner === undefined || nodeOwner(candidate) === owner)
    );
    return (
      (labelElement?.parentElement?.querySelector(
        '[role="combobox"], input'
      ) as HTMLElement | null) ?? undefined
    );
  }

  /** One of the top bar's toggle groups, `views` or `targets`, by its label. */
  function toggleGroup(name: string): Element | undefined {
    return [...document.querySelectorAll('[role="group"]')].find(
      (group) =>
        document.getElementById(group.getAttribute('aria-labelledby') ?? '')
          ?.textContent === name
    );
  }

  /** A toggle's checkbox in one of the top bar's toggle groups. */
  function groupToggle(
    group: string,
    label: string
  ): HTMLInputElement | undefined {
    const toggle = [
      ...(toggleGroup(group)?.querySelectorAll('label') ?? []),
    ].find((candidate) => candidate.textContent === label);
    return toggle?.querySelector('input') ?? undefined;
  }

  /** Show or hide the scenario row, the editor opening and closing with it. */
  async function showScenario(shown: boolean) {
    const input = groupToggle('views', 'scenario');
    if (!input) throw new Error('no toggle for the scenario view');
    if (input.checked !== shown) await click(input);
  }

  /** The output view's options popout, opened: it holds the story's options
   *  and the global context's. */
  async function outputOptions(): Promise<Element> {
    const open = () => document.querySelector('[role="dialog"][aria-label="output options"]');
    if (!open()) {
      const trigger = [...document.querySelectorAll('button')].find((button) => button.textContent === 'options…');
      if (!trigger) throw new Error('no output options');
      await click(trigger);
    }
    const dialog = open();
    if (!dialog) throw new Error('the output options did not open');
    return dialog;
  }

  async function setControl(control: HTMLElement, value: unknown) {
    if (control.getAttribute('role') === 'combobox') {
      await click(control);
      const listbox = document.getElementById(
        control.getAttribute('aria-controls') ?? ''
      );
      const option = [
        ...(listbox ?? document).querySelectorAll('[role="option"]'),
      ].find(
        (candidate) =>
          candidate.getAttribute('data-value') === String(value ?? '')
      );
      if (!option) throw new Error(`no option "${String(value)}"`);
      await click(option);
      return;
    }
    const input = control as HTMLInputElement;
    if (input.type === 'checkbox') {
      if (input.checked !== Boolean(value)) await click(input);
      return;
    }
    await settle(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )!.set!.call(input, value === undefined ? '' : String(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  // --- the editor tree, addressed by path -----------------------------------

  function editorRoot(): Element {
    const root = document.querySelector('[data-preview-editor]');
    if (!root) throw new Error('the editor is not open');
    return root;
  }

  /** The editor node an element belongs to: its nearest list item, or the root. */
  function nodeOwner(element: Element): Element | null {
    return (
      element.closest('[role="listitem"]') ??
      element.closest('[data-preview-editor]')
    );
  }

  /** The sortable list holding `slot` of `node`: its only own list, or the one
   *  under the `slot: <name>` heading. */
  function listOf(node: Element, slot: string): Element {
    const own = [...node.querySelectorAll('[role="list"]')].filter(
      (list) => nodeOwner(list.parentElement!) === node
    );
    if (own.length === 1) return own[0];
    // A node holds each slot, the default too, under a `slot: <name>`
    // heading: the nearest heading above a list names its slot.
    const slotHeading = (candidate: Element): string | undefined => {
      for (
        let element = candidate.parentElement;
        element && element !== node;
        element = element.parentElement
      ) {
        const heading = [...element.children].find(
          (child) =>
            !child.contains(candidate) &&
            child.textContent?.startsWith('slot: ')
        );
        if (heading) return heading.textContent ?? undefined;
      }
      return undefined;
    };
    const list = own.find((candidate) =>
      slotHeading(candidate)?.startsWith(`slot: ${slot}`)
    );
    if (!list) throw new Error(`no list for slot "${slot}"`);
    return list;
  }

  function nodeAtPath(path: Step[]): Element {
    let node = editorRoot();
    for (const step of path) {
      const items = [...listOf(node, step.slot).children].filter(
        (child) => child.getAttribute('role') === 'listitem'
      );
      const item = items[step.index];
      if (!item) throw new Error(`no node at ${JSON.stringify(path)}`);
      node = item;
    }
    return node;
  }

  async function editProps(node: Element, props: Record<string, unknown>) {
    const toggle = [...node.querySelectorAll('button[data-editor-window="props"]')].find(
      (button) => nodeOwner(button) === node
    );
    if (!toggle) throw new Error('the node has no props');
    if (toggle.textContent?.trim() === 'expand') await click(toggle);
    for (const [name, value] of Object.entries(props)) {
      const control = fieldControl(name, node, node);
      if (!control) throw new Error(`no control for prop "${name}"`);
      await setControl(control, value);
    }
  }

  return {
    async start(options = {}) {
      environment = installPreviewEnvironment();
      if (options.url) window.history.replaceState(null, '', options.url);
      (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
      ).IS_REACT_ACT_ENVIRONMENT = true;

      vi.resetModules();
      vi.doMock(
        '@preview-configuration',
        () => import('../fixtures/host/preview-configuration')
      );
      document.head.innerHTML = '';
      document.body.innerHTML = '<div id="root"></div>';
      await settle(async () => {
        const entry = (await import(/* @vite-ignore */ mainModule)) as {
          controller: PreviewController;
          unmount: () => void;
        };
        controller = entry.controller;
        unmountShell = entry.unmount;
      });
    },

    async stop() {
      await settle(() => {
        unmountShell?.();
      });
      unmountShell = undefined;
      controller?.dispose();
      controller = undefined;
      document.body.innerHTML = '';
      vi.doUnmock('@preview-configuration');
      await environment?.restore();
    },

    messages(target) {
      return environment!.log
        .filter((entry) => entry.target === target)
        .map((entry) => entry.message);
    },
    allMessages() {
      return [...environment!.log];
    },
    clearMessages() {
      environment!.clearMessages();
    },
    frames() {
      return iframes().map(targetOf);
    },
    frameSource(target) {
      return iframeFor(target)?.getAttribute('src') ?? undefined;
    },
    regenerationRequests() {
      return [...environment!.regeneration];
    },
    regenerationStatus() {
      if (!controller) throw new Error('the host is not started');
      return controller.getState().regeneration;
    },
    // The story options show in the stage bar, beside the scenario picker.
    async openOutputOptions() {
      await outputOptions();
    },
    // The story options show in the output view's options popout.
    async storyOptionsOffered() {
      const row = await outputOptions();
      return previewOptions
        .filter((option) => option.scope === 'story')
        .filter((option) => fieldControl(option.label, row) !== undefined)
        .map((option) => option.id);
    },
    targetToggles() {
      const result = {} as Record<
        Target,
        { visible: boolean; supported: boolean }
      >;
      for (const target of SCRIPTED_TARGETS) {
        const input = groupToggle('targets', target);
        result[target] = {
          visible: Boolean(input?.checked),
          supported: !input?.disabled,
        };
      }
      return result;
    },

    editorVisible() {
      const editor = document.querySelector('[data-preview-editor]');
      return editor !== null && editor.closest('[hidden]') === null;
    },
    unhandledRejections() {
      return [...environment!.rejections];
    },
    search() {
      return window.location.search;
    },
    props() {
      return current().getState().props;
    },

    // The charcell shell has no props form of its own outside the editor:
    // its kit would write one in a slot, over the same action.
    async setProps(props) {
      await settle(() => current().actions.setProps(props));
    },
    async mountStory(target, story) {
      return mountStoryPane(environment!, current(), target, story, settle);
    },

    async selectComponent(id) {
      const item = document.querySelector(
        `nav [data-preview-entry="component:${id}"]`
      );
      if (!item) throw new Error(`no navigation entry for "${id}"`);
      await click(item);
    },
    async selectView(id) {
      const view = views.find((candidate) => candidate.id === id);
      if (!view) throw new Error(`no fixture view "${id}"`);
      const item = document.querySelector(
        `nav [data-preview-entry="view:${view.id}"]`
      );
      if (!item) throw new Error(`no navigation entry for "${id}"`);
      await click(item);
    },
    // The picker is in the scenario row. Showing the row opens the editor,
    // so with the row hidden the pick goes through the action the picker
    // calls, leaving the editor as it is.
    async pickScenario(scenarioId) {
      const row = document.querySelector('[data-preview-scenario]');
      if (!row || row.closest('[hidden]') !== null) {
        await settle(() => current().actions.pickScenario(scenarioId));
        return;
      }
      const trigger = row.querySelector(
        '[data-testid="select-scenario"]'
      ) as HTMLElement | null;
      if (!trigger) throw new Error('the story offers no scenario picker');
      await setControl(trigger, scenarioId);
    },
    // An option shown in no bar is in the output view's options popout.
    async setOption(id, value) {
      const control = fieldControl(id) ?? fieldControl(id, await outputOptions());
      if (!control) throw new Error(`no control for option "${id}"`);
      await setControl(control, value);
    },
    // A story option's control is in the output view's options popout.
    async setStoryOption(id, value) {
      const control = fieldControl(id, await outputOptions());
      if (!control) throw new Error(`no control for story option "${id}"`);
      await setControl(control, value);
    },
    async setTargetVisible(target, visible) {
      if (this.targetToggles()[target].visible === visible) return;
      const input = groupToggle('targets', target);
      if (!input) throw new Error(`no toggle for "${target}"`);
      await click(input);
    },
    // The editor is the scenario row's: it opens and closes with the row.
    async openEditor() {
      await showScenario(true);
    },
    async closeEditor() {
      await showScenario(false);
    },
    async editRootProps(props) {
      await editProps(editorRoot(), props);
    },
    async editNestedProps(path, props) {
      await editProps(nodeAtPath(path), props);
    },
    async setText(path, text) {
      const node = nodeAtPath(path);
      const input = [...node.querySelectorAll('input[aria-label="text"]')].find(
        (candidate) => nodeOwner(candidate) === node
      );
      if (!input) throw new Error(`no text node at ${JSON.stringify(path)}`);
      await setControl(input as HTMLElement, text);
    },
    async moveNode(from, to) {
      const move = (
        window as unknown as {
          __previewEditorMove?: (from: Step[], target: DropTarget) => void;
        }
      ).__previewEditorMove;
      if (!move) throw new Error('the editor is not mounted');
      await settle(() => move(from, to));
    },
    async removeNode(path) {
      const node = nodeAtPath(path);
      const button = [...node.querySelectorAll('button[data-editor-remove]')].find(
        (candidate) => nodeOwner(candidate) === node
      );
      if (!button)
        throw new Error(`no node to remove at ${JSON.stringify(path)}`);
      await click(button);
    },

    async frameReady(target) {
      const iframe = iframeFor(target);
      if (!iframe) throw new Error(`no ${target} frame mounted`);
      await settle(() => postFromFrame(environment!, iframe, { type: 'preview:ready' }));
    },
    async sendFromView(message) {
      await settle(() => postFromFrame(environment!, iframeFor('view'), message));
    },
    setRegenerationOutcome(next) {
      environment!.setRegenerationOutcome(next);
    },
    async advanceTime(milliseconds) {
      await settle(async () => {
        await vi.advanceTimersByTimeAsync(milliseconds);
      });
      // A regeneration awaits its fetch, then reloads: let that chain finish, and a
      // rejection nothing handles surface.
      await settle(async () => {
        await new Promise((resolve) => setImmediate(resolve));
      });
    },
  };
}
