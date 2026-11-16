# Custom views and a code block of the kit's own

Part of the [@scaffold-ui-kit/preview](../README.md) documentation.

## Custom views

A `viewsModule` exports views: panels the preview lists beside the component
stories and mounts in an iframe of their own, under the live theme and
options, such as a tokens page or an icon gallery. A view is
`{ id, label, source?, order?, framework?, mount }`. The iframe loads the
kit's setup module for the view's `framework` (`react`, `vue`, `svelte`, or
`dom`, the default, which loads none), then calls
`mount(element, context, updates)`, which renders into `element` and may
return a function that unmounts it. `context` holds the current option
values, the kit's sources and component index (the stories a reader
browses, unlisted ones left out), and `selectComponent(id, props?)`, which
opens a component's story, an unlisted one included; `updates.subscribe(listener)`
delivers a new context each time the options change or the catalog arrives,
and the view stays mounted throughout. `reactView(render)` makes a React view
from a render function, re-rendering it in place with each context. An entry
`{ id, label, componentTree: true }` places the source's component tree among
its views. To open the preview on a view, such as a foundations page, name
it as the block's `landing` entry: `"landing": { "view": "foundations" }`.

<!-- example: preview-views -->
```tsx
import { reactView, type PreviewView } from '@scaffold-ui-kit/preview/views';

export const views: PreviewView[] = [
  {
    id: 'foundations',
    label: 'Foundations',
    order: 10,
    ...reactView((context) => <Foundations theme={String(context.options.theme)} />),
  },
  {
    id: 'swatches',
    label: 'Swatches',
    order: 20,
    mount(element, context, updates) {
      const paint = (current: typeof context) => {
        element.textContent = `theme: ${String(current.options.theme)}`;
      };
      paint(context);
      return updates.subscribe(paint);
    },
  },
  { id: 'components', label: 'Components', order: 30, componentTree: true },
];

export const viewById = (id: string) => views.find((view) => view.id === id);
```

## A code block of the kit's own

The code view shows each target's source of the story in the shell's own
code block. A kit with a code block of its own, such as a highlighted one in
the kit's look, names it as `codeBlock`: a module whose default export mounts
the block, and the framework it mounts with (`dom`, the default, loads no
framework's setup module). The preview mounts it in an iframe in each code
pane, as it mounts a custom view, and sends it the target's source, its
language (`tsx`, `vue`, `svelte` or `html`), or why the target has none,
each time the story, its props or its content change. Each content also
carries `wrap`, whether the shell wraps its code panes' long lines (the
stock shell's `w`), sent again each time it is toggled: the block wraps long
lines while it is true and scrolls sideways while it is false. A shell with
no such choice sends `false`. The block shows source, not a story: it mounts
into an element that fills its iframe, with no `mount` wrapper around
it, and only the global options apply there, so it follows the page's mode
and theme while the story options (a box, padding) leave it alone. The
iframe's page is the block's: its root carries `data-preview-frame="code"`,
and the kit may style the frame's `html` and `body` by it, for example in
the block's background so an overscroll bounces over the same color.

```css
html[data-preview-frame='code'] { background: var(--code-background); }
```

<!-- example: preview-code-block-configuration -->
```ts
codeBlock: { module: 'preview/code-block.ts' },
```

<!-- example: preview-code-block -->
```ts
import type { CodeBlockMount } from '@scaffold-ui-kit/preview/views';

const mount: CodeBlockMount = (element, content, updates) => {
  const show = (next: typeof content) => {
    const pre = document.createElement('pre');
    pre.style.whiteSpace = next.wrap ? 'pre-wrap' : 'pre';
    pre.textContent = next.source ?? next.reason ?? '';
    element.replaceChildren(pre);
  };
  show(content);
  return updates.subscribe(show);
};

export default mount;
```
