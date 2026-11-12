// Generic custom-view iframe entry. The host points this iframe at a registered
// view by `?view=<id>` and drives its globals over the same postMessage handshake
// the component previews use. The entry loads the kit's setup module for the
// view's framework (named by `?framework=`, so its stylesheets come first, as
// in the framework iframes), then the theme and canvas, then the kit's views;
// it mounts the view under the live theme and options (so a tokens view paints
// from the kit's real custom properties, with its theme stylesheet in scope).
// The view stays mounted and hears of each new context - the options the host
// applies, and the catalog once the handshake delivers it - through the
// `updates` it mounts with. No view is named here - the kit's views module is
// the only place a view is registered, so a new view needs no change to this
// entry or the host.
import type {
  RenderedView,
  ViewContext,
  ViewFramework,
} from '../../../src/views';
import { options as previewOptions } from '@preview-configuration';
import { optionDefaults } from '../../../src/options';
import {
  announcePreviewReady,
  announcePreviewShown,
  PREVIEW_MESSAGE,
  PREVIEW_MOUNT_ELEMENT_ID,
  readPreviewMessage,
  reportContentSize,
  selectMessage,
  VIEW_FRAMEWORK_PARAMETER,
  VIEW_PARAMETER,
} from '../../../src/protocol';

const parameters = new URLSearchParams(window.location.search);
const viewId = parameters.get(VIEW_PARAMETER) ?? '';

type SetupFramework = Exclude<ViewFramework, 'dom'>;

// Each framework's setup module, loaded only for a view of that framework.
const SETUP_MODULES: Record<SetupFramework, () => Promise<unknown>> = {
  react: () => import('@preview-setup/react'),
  vue: () => import('@preview-setup/vue'),
  svelte: () => import('@preview-setup/svelte'),
};
const loadedSetups = new Set<ViewFramework>(['dom']);

async function loadSetup(framework: ViewFramework): Promise<void> {
  if (loadedSetups.has(framework)) return;
  loadedSetups.add(framework);
  await SETUP_MODULES[framework as SetupFramework]();
}

function isSetupFramework(value: string | null): value is SetupFramework {
  return value !== null && Object.hasOwn(SETUP_MODULES, value);
}

// The view-side half of the select back-channel: ViewContext exposes this as
// `selectComponent`, and this iframe relays it to the host as `preview:select` -
// a view never learns the postMessage vocabulary.
function selectComponent(id: string, props?: Record<string, unknown>) {
  window.parent?.postMessage(selectMessage(id, props), '*');
}

let context: ViewContext = {
  options: optionDefaults(previewOptions),
  kitName: '',
  sources: [],
  components: [],
  selectComponent,
};
const listeners = new Set<(context: ViewContext) => void>();

function update(changes: Partial<ViewContext>): void {
  context = { ...context, ...changes };
  for (const listener of listeners) listener(context);
}

async function start(): Promise<void> {
  const named = parameters.get(VIEW_FRAMEWORK_PARAMETER);
  if (isSetupFramework(named)) await loadSetup(named);
  const { applyGlobals } = await import('../globals');
  const { viewById } = await import('@preview-views');
  const entry = viewById(viewId);
  // A component-tree entry is navigation only (no mount); only a rendered view mounts here.
  const view: RenderedView | undefined =
    entry && !entry.componentTree ? entry : undefined;
  // A page loaded without `?framework=` still gets the view's setup module.
  await loadSetup(view?.framework ?? 'dom');
  const element = document.getElementById(PREVIEW_MOUNT_ELEMENT_ID);
  if (view && element) {
    view.mount(element, context, {
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    });
  }

  window.addEventListener('message', (event: MessageEvent) => {
    const message = readPreviewMessage(event.data);
    if (!message) return;
    if (message.type === PREVIEW_MESSAGE.globals) {
      applyGlobals(message.options);
      update({ options: message.options ?? {} });
    }
    if (message.type === PREVIEW_MESSAGE.catalog) {
      update({
        kitName: message.kitName ?? '',
        sources: message.sources ?? [],
        components: message.components ?? [],
      });
      // The view with its catalog, once painted, lets the host show the pane.
      announcePreviewShown();
    }
  });
  // Signal readiness so the host replays the current globals (an iframe
  // re-handshakes after each reload), and set the ready flag a test that
  // loads this page on its own waits on.
  announcePreviewReady();
  // The view's size reaches the host on each change, so a shell can size the pane to it.
  if (element) reportContentSize(element);
}

void start();
