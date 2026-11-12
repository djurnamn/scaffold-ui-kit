// React preview entry. Mounts the generated render-registry by id, holds props in
// state, and updates reactively from the host over postMessage - the same App
// instance re-renders, so the Zag driver machine stays alive across prop changes.
import { Component, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { declaredAttributes, reactAttributeNames, registry } from '@preview-generated/react/registry';
// The scenario editor's regenerated scratch story, merged under its reserved id.
// Its module is a placeholder registry until the editor's first edit.
import * as scratch from '@preview-generated/scratch/react';
// The kit's per-target setup module (side effects only): ambient providers a
// story needs mounted once (a toast container), another package's stylesheets, and any
// other integration the kit's react stories assume. Aliased to the kit's
// `preview.setupModules.react` (or an empty module).
import '@preview-setup/react';
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
import { reactProps } from '../../../src/lib/react-spelling';

// What a story threw as a message; it need not have thrown an Error.
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Isolate a throwing component so it can't poison the persistent root (which
// would blank every later story). Reset per story via a `key` on the boundary;
// the host hears of the error, and of each story mounted since.
class ErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { message: errorMessage(error) };
  }
  componentDidCatch(error: unknown) {
    reportRenderError(errorMessage(error));
  }
  render() {
    if (this.state.message !== null) return <pre>render error: {this.state.message}</pre>;
    return this.props.children;
  }
}

// The values this pane has written back itself and the host has not yet
// answered: props the host sent before it took the newest keep that value.
const pending = new PendingWriteBacks();

function Application() {
  const [id, setId] = useState('');
  const [props, setProps] = useState<Record<string, unknown>>({});
  // The story's events, recorded with each set of props it gets.
  const [events, setEvents] = useState<string[]>([]);
  // The story's two-way props, each written back as its event reports a value.
  const [bindings, setBindings] = useState<PreviewWriteBack[]>([]);
  // Each story or scenario the host sets mounts fresh, so uncontrolled state
  // never carries over from the last one; live prop edits update in place.
  const [mount, setMount] = useState(0);
  // The host's mount of the story, which each recorded event carries.
  const [hostMount, setHostMount] = useState<number | undefined>(undefined);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const message = readPreviewMessage(event.data);
      if (!message) return;
      if (message.type === PREVIEW_MESSAGE.setStory) {
        reportRenderError();
        pending.clear();
        setId(message.id);
        setProps(message.props ?? {});
        setEvents(message.events ?? []);
        setBindings(message.bindings ?? []);
        setHostMount(message.mount);
        setMount((count) => count + 1);
      } else if (message.type === PREVIEW_MESSAGE.props) {
        setProps(pending.reconcile(message.props, message.answers));
      } else if (message.type === PREVIEW_MESSAGE.globals) {
        applyGlobals(message.options);
      }
    }
    window.addEventListener('message', onMessage);
    announcePreviewStories(Object.keys({ ...registry, ...scratch.registry }));
    announcePreviewReady();
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // The first story the host sets, once painted, lets the host show the pane.
  // The story's own effects have run by now, so a test can read the mount.
  useEffect(() => {
    if (mount === 0) return;
    announcePreviewShown();
    announceStoryMounted(id);
  }, [mount]);

  const render = { ...registry, ...scratch.registry }[id];
  if (!render) return null;
  // A story spells the attributes it gives the component as HTML does:
  // React takes `class` as `className`, a `style` string as an object and
  // the attributes it renames by their React names, unless the component
  // declares a prop by that name.
  const declared = { ...declaredAttributes, ...scratch.declaredAttributes }[id] ?? [];
  // A controlled story takes a two-way prop's new value here, in the event
  // that reports it, before React restores a controlled input to its prop's
  // value: typing mid-text keeps the caret where it is. The host's
  // write-back follows with the same value. Each write is numbered, the
  // event reporting it carries the number, and props the host sent before
  // it took the newest keep the pane's own value (`pending`).
  const story = withWriteBacks(withEventRecorders(props, events, window, hostMount, pending), bindings, (prop, value) => {
    pending.wrote(prop, value);
    setProps((current) => (current[prop] === undefined ? current : { ...current, [prop]: value }));
  });
  const spelled = reactProps(story, (name) => declared.includes(name), reactAttributeNames ?? {});
  return <ErrorBoundary key={`${id}:${mount}`}>{render(spelled)}</ErrorBoundary>;
}

// Cache the root across HMR: when the editor's scratch registry hot-updates,
// Fast Refresh re-runs this module - reuse the existing root (and re-render Application so
// it picks up the new scratch registry) instead of calling createRoot twice.
const container = document.getElementById(PREVIEW_MOUNT_ELEMENT_ID)!;
const store = window as unknown as {
  __previewRoot?: ReturnType<typeof createRoot>;
};
const root = store.__previewRoot ?? (store.__previewRoot = createRoot(container));
root.render(<Application />);
// The story's size reaches the host on each change, so a shell can size the pane to it.
reportContentSize(container);

// The editor regenerates .preview-generated/scratch/react.tsx on each edit. Self-accept
// that dep (a no-op) so Vite scopes the change to *this* iframe instead of
// broadcasting a full-reload to every client on the shared dev server - which
// would wipe the host's editor state. The actual refresh is host-driven: after a
// regeneration it bumps this iframe's src, reloading it to pick up the new (invalidated)
// scratch module - deterministic, unlike relying on Vite's HMR event delivery.
if (import.meta.hot) {
  import.meta.hot.accept('@preview-generated/scratch/react', () => {});
}
