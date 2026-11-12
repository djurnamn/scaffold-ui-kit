// Vue preview entry. Mounts a generated render unit (components + template) with
// a single reactive `props` object that is mutated in place on each update, so
// v-bind="props" re-renders the same component instance - the Zag driver machine
// stays alive across prop changes. Remounts each time the host sets a story or scenario.
import { createApp, h, reactive, shallowRef, type App } from 'vue';
import { registry } from '@preview-generated/vue/registry';
// The scenario editor's regenerated scratch story, merged under its reserved id.
import { registry as scratchRegistry } from '@preview-generated/scratch/vue';
// The kit's per-target setup module (side effects only) - see react/main.tsx.
import '@preview-setup/vue';
import { applyGlobals } from '../globals';
import {
  announcePreviewReady,
  announcePreviewShown,
  announcePreviewStories,
  announceStoryMounted,
  PREVIEW_MESSAGE,
  PREVIEW_MOUNT_ELEMENT_ID,
  readPreviewMessage,
  reportContentSize,
  reportRenderError,
  withEventRecorders,
  withWriteBacks,
  PendingWriteBacks,
  type PreviewWriteBack,
} from '../../../src/protocol';

let props = reactive<Record<string, unknown>>({});
let application: App | null = null;
// The story's events, recorded with each set of props it gets.
let events: string[] = [];
// The story's two-way props, each written back as its event reports a value.
let bindings: PreviewWriteBack[] = [];
// The host's mount of the story, which each recorded event carries.
let mount: number | undefined;
// The values this pane has written back itself and the host has not yet
// answered: props the host sent before it took the newest keep that value.
const pending = new PendingWriteBacks();

// A controlled story takes a two-way prop's new value here, in the event
// that reports it, before the component puts a controlled input back to its
// prop's value at Vue's next tick: the prop holds the new value by then, so
// typing mid-text keeps the caret where it is. The host's write-back follows
// with the same value. Each write is numbered, the event reporting it
// carries the number, and props the host sent before it took the newest
// keep the pane's own value (`pending`).
function setProps(given: Record<string, unknown>) {
  const next = withWriteBacks(withEventRecorders(given, events, window, mount, pending), bindings, (prop, value) => {
    pending.wrote(prop, value);
    if (props[prop] !== undefined) props[prop] = value;
  });
  for (const key of Object.keys(props)) if (!(key in next)) delete props[key];
  Object.assign(props, next);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Each story or scenario the host sets mounts fresh, so uncontrolled state
// never carries over from the last one; live prop edits update in place.
function setStory(id: string, nextProps?: Record<string, unknown>) {
  // Each mount reads props of its own: an application that failed to mount
  // cannot be unmounted, and would re-render on what it subscribed to.
  props = reactive({});
  setProps(nextProps ?? {});
  reportRenderError();
  // No longer current before it unmounts, so nothing it throws from here on
  // counts against the story mounted next.
  const previous = application;
  application = null;
  if (previous) previous.unmount();
  // An application that could not mount left only its error message behind.
  else document.getElementById(PREVIEW_MOUNT_ELEMENT_ID)!.replaceChildren();
  const unit = { ...registry, ...scratchRegistry }[id];
  if (!unit) return;
  // The story's components are values its template's expressions read
  // (`:as="Button"`), as a script-setup import is in an SFC, as well as tags.
  const story = {
    components: unit.components,
    setup: () => ({ ...unit.components, props }),
    template: unit.template,
  };
  // The root stands apart from the story, so it can still show the error the
  // story throws as it sets up or renders.
  // The message of an error the story throws, shown in its place - the way
  // the React page's error boundary shows one - rather than an empty pane,
  // and told to the host, as each story mounted since is.
  const renderError = shallowRef<string | null>(null);
  const current = createApp({
    render: () => (renderError.value === null ? h(story) : h('pre', `render error: ${renderError.value}`)),
  });
  current.config.errorHandler = (error) => {
    // A late error from a story since replaced says nothing of this one.
    if (application !== current) return;
    console.error(error);
    renderError.value = errorMessage(error);
    reportRenderError(renderError.value);
  };
  application = current;
  const container = document.getElementById(PREVIEW_MOUNT_ELEMENT_ID)!;
  try {
    current.mount(container);
  } catch (error) {
    // A failure the application could not handle itself leaves it unusable.
    console.error(error);
    application = null;
    reportRenderError(errorMessage(error));
    const message = document.createElement('pre');
    message.textContent = `render error: ${errorMessage(error)}`;
    container.replaceChildren(message);
  }
}

window.addEventListener('message', (event: MessageEvent) => {
  const message = readPreviewMessage(event.data);
  if (!message) return;
  if (message.type === PREVIEW_MESSAGE.setStory) {
    events = message.events ?? [];
    bindings = message.bindings ?? [];
    mount = message.mount;
    pending.clear();
    setStory(message.id, message.props);
    // The first story, once painted, lets the host show the pane.
    announcePreviewShown();
    announceStoryMounted(message.id);
  }
  else if (message.type === PREVIEW_MESSAGE.props) setProps(pending.reconcile(message.props, message.answers));
  else if (message.type === PREVIEW_MESSAGE.globals) applyGlobals(message.options);
});

announcePreviewStories(Object.keys({ ...registry, ...scratchRegistry }));
announcePreviewReady();
// The story's size reaches the host on each change, so a shell can size the pane to it.
reportContentSize(document.getElementById(PREVIEW_MOUNT_ELEMENT_ID)!);

// The editor regenerates .preview-generated/scratch/vue.ts on each edit. Self-accept
// that dep (a no-op) so Vite scopes the change to *this* iframe instead of
// broadcasting a full-reload to every client on the shared dev server - which
// would wipe the host's editor state. The actual refresh is host-driven: after a
// regeneration it bumps this iframe's src, reloading it to pick up the new (invalidated)
// scratch module - deterministic, unlike relying on Vite's HMR event delivery.
if (import.meta.hot) {
  import.meta.hot.accept('@preview-generated/scratch/vue', () => {});
}
