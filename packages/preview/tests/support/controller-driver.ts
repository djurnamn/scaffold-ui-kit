// The host driver (tests/support/host-driver.ts) implemented against
// `createPreviewController` alone: no React, no charcell. It plays the part of
// a shell - it reads the controller's state, hands it elements to mount the
// panes in, and calls its actions - so the host characterization tests run
// against the controller as they run against the React host. Where the React
// driver reads a control off the page, this one reads the state.

import { vi } from 'vitest';
import manifest from '../fixtures/host/manifest.json';
import { options as previewOptions } from '../fixtures/host/preview-configuration';
import { views } from '../fixtures/host/views';
import {
  catalogFromManifest,
  createFetchRegenerationTransport,
  createPreviewController,
  nodeAt,
  type CatalogManifest,
  type PreviewController,
  type PreviewState,
  type Step,
} from '../../src/controller';
import type { PreviewHostDriver } from './host-driver';
import {
  SCRIPTED_TARGETS,
  installPreviewEnvironment,
  isDetached,
  mountStoryPane,
  postFromFrame,
  targetOf,
  type FrameTarget,
  type PreviewEnvironment,
} from './preview-environment';

/** A shell over the controller alone, mounting the panes it says to show. */
export function createControllerDriver(): PreviewHostDriver {
  let environment: PreviewEnvironment | undefined;
  let controller: PreviewController | undefined;
  let stage: HTMLElement | undefined;
  let unsubscribe: (() => void) | undefined;
  // The mounted panes in order, each with the function that unmounts it.
  let mounted: { target: FrameTarget; unmount: () => void }[] = [];

  function current(): PreviewController {
    if (!controller) throw new Error('the driver is not started');
    return controller;
  }

  function iframes(): HTMLIFrameElement[] {
    return [...(stage?.querySelectorAll('iframe') ?? [])].filter((iframe) => !isDetached(iframe));
  }

  function iframeFor(target: FrameTarget): HTMLIFrameElement | undefined {
    return iframes().find((iframe) => targetOf(iframe) === target);
  }

  // Mount what the state says to show: the view pane, or one pane per target.
  // Like the React host, a change of pane set remounts every pane.
  let reconciling = false;
  function reconcile(state: PreviewState) {
    if (reconciling) return;
    reconciling = true;
    try {
      const desired: FrameTarget[] = state.selection.kind === 'view' ? ['view'] : state.targets.panes;
      const same =
        desired.length === mounted.length && desired.every((target, index) => target === mounted[index].target);
      if (same) return;
      for (const pane of mounted) pane.unmount();
      mounted = [];
      for (const target of desired) {
        const element = document.createElement('div');
        stage!.appendChild(element);
        const unmountPane =
          target === 'view'
            ? current().frames.mountView(element, state.selection.id)
            : current().frames.mount(element, target);
        mounted.push({
          target,
          unmount: () => {
            unmountPane();
            element.remove();
          },
        });
      }
    } finally {
      reconciling = false;
    }
  }

  function tree() {
    const tree = current().getState().editor.tree;
    if (!tree) throw new Error('the editor is not open');
    return tree;
  }

  /** Set props one at a time, as a person works a node's controls; an empty
   *  string unsets, as a select's unset choice does. */
  function editProps(path: Step[], props: Record<string, unknown>) {
    for (const [name, value] of Object.entries(props)) {
      const node = path.length === 0 ? tree() : nodeAt(tree().slots, path);
      if (!node || !('props' in node)) throw new Error(`no props at ${JSON.stringify(path)}`);
      current().editor.setNodeProps(path, { ...node.props, [name]: value === '' ? undefined : value });
    }
  }

  return {
    async start(options = {}) {
      environment = installPreviewEnvironment();
      if (options.url) window.history.replaceState(null, '', options.url);
      document.body.innerHTML = '';
      stage = document.createElement('div');
      document.body.appendChild(stage);
      controller = createPreviewController({
        catalog: catalogFromManifest(manifest as CatalogManifest, views),
        options: previewOptions,
        regeneration: createFetchRegenerationTransport(),
      });
      unsubscribe = controller.subscribe(reconcile);
      reconcile(controller.getState());
    },

    async stop() {
      unsubscribe?.();
      for (const pane of mounted) pane.unmount();
      mounted = [];
      controller?.dispose();
      controller = undefined;
      document.body.innerHTML = '';
      await environment?.restore();
    },

    messages(target) {
      return environment!.log.filter((entry) => entry.target === target).map((entry) => entry.message);
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
      return current().getState().regeneration;
    },
    async storyOptionsOffered() {
      const unavailable = current().getState().unavailableOptions;
      return current()
        .options.filter((option) => option.scope === 'story' && !unavailable.includes(option.id))
        .map((option) => option.id);
    },
    // No shell, so no popout to open.
    async openOutputOptions() {},
    targetToggles() {
      const { supported, panes } = current().getState().targets;
      return Object.fromEntries(
        SCRIPTED_TARGETS.map((target) => [
          target,
          { visible: panes.includes(target), supported: supported.includes(target) },
        ]),
      ) as ReturnType<PreviewHostDriver['targetToggles']>;
    },
    editorVisible() {
      return current().getState().editor.open;
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

    async selectComponent(id) {
      current().actions.selectComponent(id);
    },
    async selectView(id) {
      current().actions.selectView(id);
    },
    async pickScenario(scenarioId) {
      current().actions.pickScenario(scenarioId);
    },
    async setOption(id, value) {
      current().actions.setOption(id, value);
    },
    async setStoryOption(id, value) {
      current().actions.setOption(id, value);
    },
    async setTargetVisible(target, visible) {
      current().actions.setTargetVisible(target, visible);
    },
    async openEditor() {
      current().editor.open();
    },
    async closeEditor() {
      current().editor.close();
    },
    async editRootProps(props) {
      editProps([], props);
    },
    async editNestedProps(path, props) {
      editProps(path, props);
    },
    async setText(path, text) {
      tree();
      current().editor.setText(path, text);
    },
    async moveNode(from, to) {
      tree();
      current().editor.move(from, to);
    },
    async removeNode(path) {
      tree();
      current().editor.remove(path);
    },
    async setProps(props) {
      current().actions.setProps(props);
    },
    async mountStory(target, story) {
      return mountStoryPane(environment!, current(), target, story);
    },

    async frameReady(target) {
      const iframe = iframeFor(target);
      if (!iframe) throw new Error(`no ${target} frame mounted`);
      postFromFrame(environment!, iframe, { type: 'preview:ready' });
    },
    async sendFromView(message) {
      postFromFrame(environment!, iframeFor('view'), message);
    },
    setRegenerationOutcome(next) {
      environment!.setRegenerationOutcome(next);
    },
    async advanceTime(milliseconds) {
      await vi.advanceTimersByTimeAsync(milliseconds);
      // A regeneration awaits its transport, then reloads: let that chain finish, and
      // a rejection nothing handles surface.
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}
