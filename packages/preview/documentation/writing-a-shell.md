# Writing a shell

Part of the [@scaffold-ui-kit/preview](../README.md) documentation.

A shell is the whole interface around the panes: the navigation, the option
controls, the scenario picker, the layout and the scenario editor. The
preview provides the behavior as a controller, and the shell renders it. It
decides which options show and as which controls, and where the panes go. The
preview owns the iframes: a shell hands it an element to mount a pane in and
never talks to a pane itself.

A shell module default-exports a shell made with `defineShell` from
`@scaffold-ui-kit/preview/shell`. That entry also exports everything a shell
reads: the controller's types, the catalog's, the editor tree's and the
option helpers.

<!-- example: preview-define-shell -->
```ts
import { defineShell } from '@scaffold-ui-kit/preview/shell';

export default defineShell({
  apiVersion: 1,
  options: [{ id: 'dense', label: 'dense', default: false }],
  mount(root, controller) {
    // render into root, read and drive controller
    return () => root.replaceChildren();
  },
});
```

- `apiVersion` - the contract version the shell was written against, `1`.
  The preview refuses a shell of a version it does not serve, naming both.
- `options` - the shell's own options, such as its density, in the shape of a
  kit option without `apply` or `scope`. The preview keeps their values with
  the kit's, under `shell.<id>` in the state and the address
  (`shellOptionId('dense')` gives `'shell.dense'`), and never sends them to
  the panes. They are global. `options` may also be a function of the
  catalog, called once before the preview starts, for an option that depends
  on the kit, such as a choice among its targets:
  `options: (catalog) => [{ id: 'pane', label: 'pane', values:
  catalog.targets.map((target) => ({ value: target, label: target })),
  default: catalog.targets[0] }]`.
- `mount(root, controller)` - renders the shell into the host page's root
  element, which the preview empties first, and may return a function that
  unmounts it.

The host page provides little: a `<title>`, a viewport `<meta>` for small
screens, the root element and a script that mounts the shell. It has no CSS
of its own, so the body keeps the browser's default margin; from the root
element on, the document is the shell's to style and lay out.

## The page before the shell mounts

The shell's script takes a moment to load, on the development server a few
seconds. What the host page holds until then is the shell's too, given by a
page module: a module evaluated in Node as the preview starts or builds,
whose default export is a page made with `defineShellPage` from
`@scaffold-ui-kit/preview/shell`.

<!-- example: preview-shell-page -->
```ts
import { fileURLToPath } from 'node:url';
import { defineShellPage } from '@scaffold-ui-kit/preview/shell';

const font = fileURLToPath(new URL('./fonts/face.woff2', import.meta.url));

export default defineShellPage({
  head: ({ asset }) =>
    `<link rel="preload" as="font" type="font/woff2" crossorigin href="${asset(font)}" />
<style>html { background: #101010; }</style>`,
  root: '<p role="status">loading</p>',
});
```

- `head` - markup written at the end of the page's `<head>`: styles, a font
  face, links that preload what the shell will need. It stays for the life
  of the page.
- `root` - markup written into the root element, shown until the shell
  mounts: a loading note, with the styles only it needs. Mounting empties
  the root, so nothing of it is left under the shell.

Each is markup, or a function that returns it, which may be asynchronous.
A function is given `asset(file)`: the address of a file the markup
references, by its absolute path. The development server serves the file
from where it is, and the static build copies it into its output, so write
the address `asset` gives into an `href`, a `src` or a CSS `url()` rather
than a path of your own. The module runs in Node, so it reads files and
resolves packages freely, and holds nothing that needs a browser. It is
loaded once, when the preview starts: restart `dev` after editing it.

The preview finds the page two ways. A shell named as a package specifier
brings its own: for `shell: '@acme/shells/compact'` the preview uses the
module at `@acme/shells/compact/page` when the package exports one, under
the `default` condition as the shell itself is. And a
kit names one in the long form of `shell`, as a package specifier or a
module path relative to the kit root, which is how a shell in the kit gets
a page:

<!-- example: preview-shell-page-configuration -->
```ts
shell: { module: 'preview/shell.ts', page: 'preview/page.ts' },
```

A shell with no page starts from an empty root. `check` loads the page as
`dev` and `build` do, and reports one that cannot be loaded or is no page.

A shell takes its own settings through a factory of its own, as
`charcellShell({ slots, groups })` does. The `preview` block reaches the
panes as JSON data, so it is no place for them.

## The controller

`controller.catalog` is what stays put for the session:

- `kitName`, `kitVersion`, and `targets`, the kit's `targets`, in order:
  one pane and one toggle each. `html` comes last where the kit builds it.
  The shell entry types them as `PreviewTarget` (`PREVIEW_TARGETS`), and the
  targets other than `html` as `PreviewScriptedTarget`
  (`PREVIEW_SCRIPTED_TARGETS`).
- `navigation` - the tree of stories and views to list, as `view`,
  `component` and `group` entries, the components that are not standalone
  and unlisted stories left out.
- `components` - every component, `standalone` (`false` for a compound's
  parts and the others with no story of their own) and
  stories kept out of what a reader browses marked `unlisted`, with
  its `title`, `shortTitle`, scenarios, props, slots and `targets`, and its
  `description` from the template when it has one, as each scenario has its
  story file's. A scenario's `options` are the option
  values picking it sets, by option id. Each
  entry of `propTypes` is one prop: its control (`control`, `options`,
  `number`, and `include`, `false` for a prop shown no control), its
  `description`, and what the component declares: `declaredType`, the
  type as written (`"'solid' | 'ghost'"`), `required`, and
  `declaredDefault`, the component's own default, absent when it has none,
  and `documentedDefault`, a default the component applies without declaring
  it, as the code a consumer reads (`"'start'"`). The component's, each
  scenario's and each prop's `description`, and an option's `title`, are
  markdown, handed out as written for a shell to render; the stock shell
  renders them, showing raw html in them as text.
  `defaultProps` is where the story starts, which can differ: it adds the
  story file's `defaultProps` and the kit's hints over the declared defaults.
  `events` names the props that are events, functions that return nothing
  such as `onSelect`, which the panes record. `bindings` lists the
  component's two-way props, those whose template declares a `bindable`
  object, in prop order: each as `{ prop, defaultProp, changeProp }`, the
  latter two absent when the template names none, with `vueModel: true` on
  the one a Vue consumer binds with a bare `v-model`. When the story gives
  `prop` and a pane reports `changeProp`, the controller sets the reported
  value as the story's `prop`, as `setProps` would: every pane, the html and
  the address follow, and the event is logged as any other. A story that
  leaves `prop` out lets each pane's component keep its own value.
- `views`, `sources`, `htmlTags` (the tags an editor offers for a wrapper) and
  `colorTokens` (the values a color control offers).
- `paneWidths` - the widths to offer for laying the story panes out at, as
  `{ label, width }` in CSS pixels, narrowest first: the `preview` block's
  `paneWidths`, else `DEFAULT_PANE_WIDTHS` (`small` 375,
  `medium` 768, `large` 1280) from the shell entry.
- `landing` - the kit's `landing` entry, as `{ kind: 'view', id }` or
  `{ kind: 'component', id, scenario? }`, absent without one. The controller
  starts on it when the address names no story or view.

`controller.options` lists the options to show controls for, the kit's and
then the shell's, each with an `origin` of `kit` or `shell`.
`optionKind(option)` gives `choice` or `boolean`, and `optionGroup(option)`
the group, `context` (`CONTEXT_OPTION_GROUP`) when none is set; the kit's own
settings are `kit` (`KIT_OPTION_GROUP`).

`controller.getState()` is the current state, and
`controller.subscribe(listener)` calls the listener with each new one and
returns a function that stops it. A state is plain data, replaced on each
change with its unchanged fields kept by reference:

- `selection` - `{ kind: 'component' | 'view', id }`.
- `scenario` - the selected scenario's id, `''` for the default.
- `props` - the story's root props the panes show: the scenario's over the
  component's defaults, then whatever `setProps` or the editor's root set.
  The editor holds a string `children` the story draws its default slot from
  as the root's text, a text node in that slot, so it can be edited, wrapped
  or replaced like any node; while the editor holds a tree, `children` is
  that text when the default slot holds one text node and nothing else, and
  absent otherwise, as other content there is what the panes show in its
  place. A story with default-slot content of its own (from its story file)
  shows that content and not `children`, so its props carry no `children`
  while the editor holds a tree.
- `options` - every option's value, by id.
- `unavailableOptions` - the options whose controls to hide: those the
  selected story marks unavailable, and every story option while a view is
  selected.
- `targets` - `supported` (the selected story's), `visible` (turned on)
  and `panes`, the ones to mount, in order. Where the kit builds html, every
  story supports `html`; a story with no markup has its html pane say why.
- `paneWidth` - the width in CSS pixels to lay each of the selection's story
  panes out at, html's among them, so a component that responds to its
  width shows as it does on a screen that wide: usually one of
  `catalog.paneWidths`, though a link can name any. Absent while the panes
  fit the shell's space. The shell sizes the iframe to it and decides how a
  pane narrower than that shows, scrolling across it or scaling it down. It
  outlasts the story; a view's pane does not follow it.
- `frames` - the readiness of the selection's panes, `loading` or `ready`,
  by target (`html` among them), and of a view's pane under `view`.
- `storyFrames` - the readiness of each detached story pane (below), by the
  key `storyFrameKey(target, story)` gives.
- `frameSizes` and `storyFrameSizes` - the size of what each pane shows,
  `{ width, height }` in whole CSS pixels, beside `frames` and `storyFrames`
  and under the same keys: the story or view with the room the kit's canvas
  puts around it, as the pane last reported it. An entry appears once the
  pane renders, changes whenever its content does, keeps its last size while
  the pane reloads, and goes when the pane is unmounted. The width is the
  content's at the pane's current width, since block content fills the pane.
- `frameErrors` - what each of the selection's panes threw as its story
  rendered, the error's message by target, which the pane also shows in the
  story's place. An entry goes when the pane mounts a story that renders,
  and when the pane is unmounted. The stock shell's status bar names the
  targets (`render error · react`), their messages in a hint over them.
- `events` - the events the selection's panes recorded, oldest first and the
  last hundred at most: each call a story made of one of its events (a
  component's `events` in the catalog), as `{ id, target, name, payload,
  time }`. `id` counts the events recorded, for a stable key; `target` is
  the pane it was recorded in; `name` is the function prop called;
  `payload` is a one-line summary of what it was called with; `time` is in
  milliseconds since the epoch. The log empties when another story or a
  view is selected, and on `actions.clearEvents()`.
- `editor` - whether the editor is `open`, its `tree`, and `modified`: whether
  the tree's content differs from what it was seeded with, a node added,
  removed, moved or replaced, or a nested node's props or a text changed.
  The root's props do not count, as they are `props`; a change of the root's
  text counts, though `props` shows it as `children`. Content is compared by
  value, so an edit undone by hand is no change, and a new seed (another
  story, or another scenario with the editor open) starts unmodified. While
  it is `true`, the address may not reproduce the panes.
- `regeneration` - the editor's regeneration, `idle`, `pending` or `error` with a
  `message`.
- `code` - the code of what the selection's panes show (below), absent
  while a view is selected.

`controller.actions` change it:

- `select(selection)` shows what a navigation entry names, a story or a
  view; `selectComponent(id, props?)` and `selectView(id)` do the same for
  one kind.
- `clearEvents()` empties `events`.
- `setPaneWidth(width)` lays the story panes out at `width` pixels, and
  `setPaneWidth(undefined)` fits them again. A width that is not a whole
  number from 1 to 7680 (`MAXIMUM_PANE_WIDTH`) is ignored.
- `pickScenario(id)`, `setOption(id, value)` and
  `setTargetVisible(target, visible)`. Picking a scenario, or selecting
  a story on its baseline scenario, sets the option values the scenario
  carries (`scenario.options`) as `setOption` would, so the panes, the
  controls and the address follow. Values it does not set stay as they are,
  and picking another scenario leaves them, apart from those the next one
  sets. A shell option's value never reaches the panes, so setting one posts
  nothing to them.
- `setProps(props)` replaces the story's root props, live, with no
  regeneration, whether or not the editor is open; the editor's root takes
  them too. It does not merge: pass `{ ...state.props, tone: 'accent' }` to
  change one. A prop set to `undefined` is dropped, and it does nothing while
  a view is selected. `selectComponent(id, props)` lands its props the same
  way, over the story's defaults. While the editor holds a tree, `children`
  is the root's text, as `props` shows it: a new string replaces the root's
  default-slot content with that text, and leaving `children` out removes a
  lone text. Either is an edit of the tree's content, which regenerates the
  story, so a shell passes `{ ...state.props, ... }` to keep the text. A
  story with default-slot content of its own takes no `children` then.
- `scenarioChoices(component,
  controller.capabilities)`, from the shell entry, lists a scenario picker's
  choices, the default first, and none when there is no choice to make. It
  leaves out the Empty scenario where the preview cannot regenerate, as in
  the static build, and `pickScenario` ignores Empty there.

`controller.frames` places the panes:

- `mount(element, target)` puts a target's pane in `element` and
  `mountView(element, viewId)` a view's. Each returns a function that removes
  it. The controller loads the iframe, reloads it after each regeneration and
  answers its messages.
- `mount(element, 'html')` puts the html pane in `element`. It shows the
  markup of `code.html` (below) as the story, its props or the editor's
  tree change, keeps what it shows while the next is printed, and shows the
  reason when there is none. It loads the kit's theme, canvas and
  `mount` frame and follows the options as the other panes do,
  but loads no framework and no setup module, and runs none of the story's
  behavior. A regeneration does not reload it.
- A pane is a bare `<iframe>` appended to `element`, with no size or styling
  of its own beyond the browser's defaults. The shell sizes it, for example
  `element > iframe { width: 100%; height: 100%; border: 0 }` inside an
  element that has a size.
- To size a pane to its story instead, as a documentation page or a grid of
  variants does, set the iframe's height to the `height` in `frameSizes` (or
  `storyFrameSizes`), with a fallback until the first report. The size does
  not depend on the iframe's own height, so a pane sized to it stays put: a
  canvas that fills the viewport (`min-height: 100vh`) adds only its padding.
  The pane measures itself and posts the size to the host, so a shell never
  reaches into the iframe.
- The pane's readiness in `frames` changes after `mount` returns, never
  during the call, so a subscriber does not run inside the shell's own
  mounting code.
- `reload(target)` loads the selection's pane for `target` (or a view's
  pane, as `'view'`) again: its readiness goes back to `loading` until it
  answers, and it shows the selection as it is now.
- `standaloneUrl(target)` gives the address of the selection's pane for a
  scripted target opened on its own, outside the preview, for a shell's
  "open in a window" action: the story it shows now (the editor's content
  while it holds a tree), with its props and the kit's option values. The
  page follows nothing after it opens.
- Every iframe the controller mounts (a pane, a view, a detached story, a
  code block) stays hidden until it has painted its first content, and again
  while it reloads, so the shell's own ground shows rather than the
  browser's blank page and what the pane paints on the way. Once shown, the
  iframe carries `data-preview-shown` (`PREVIEW_FRAME_SHOWN_ATTRIBUTE`), so a
  shell's CSS can draw a loading note in the pane until then:
  `.pane:has(> iframe:not([data-preview-shown]))::after { content: 'loading' }`.
  The stock shell does, after 300ms.
- `mountStory(element, target, { component, scenario?, props? })` puts a
  read-only pane of any story in `element`, apart from the selection, for a
  grid of variants or a documentation page that lists every scenario live.
  Its props are the scenario's over the component's defaults, with `props`
  over those; `scenario` omitted is the one the story starts on, and `''`
  the anonymous default. It follows the global options, and its story
  options are the component's own, as selecting the story would seed them;
  the option values its scenario sets stay over both.
  It never shows the editor's content and is not reloaded by a
  regeneration. Its readiness is reported in `storyFrames` under
  `storyFrameKey(target, story)`, after the call returns, never in
  `frames`, which stays the selection's. It throws for a component that is
  unknown or not standalone, a target the component does not render in
  (`html` among them: a detached pane renders in a scripted target), and an
  unknown
  scenario or the Empty one, which renders through the selection alone; list
  `component.scenarios.filter((scenario) => !scenario.empty)`.
- `mountCode(element, target)` puts the kit's own code block (see
  [A code block of the kit's own](custom-views.md#a-code-block-of-the-kits-own))
  in `element`, showing `target`'s source of the
  selection. `wrapCode(wrap)` tells every code block whether the shell wraps
  its code panes' long lines; a shell with that choice calls it as the
  choice changes, and the blocks see `false` until it does.

`controller.editor` owns the scenario editor's tree and its operations; drag
and drop, if any, is the shell's:

- `open()` seeds the tree from the selected story, and `close()` hides it.
  The content beside the root is not the tree's: a shell reads it from the
  catalog's component (`around`) and shows it as locked, no operation
  changes it, and every regeneration renders it as the story gives it.
- `createNode(request)` makes a node to insert. The request is
  `{ kind: 'text', value }`, `{ kind: 'html', tag }`, or
  `{ kind: 'component', name, importAs? }`, `name` being the component's
  export name and `importAs` what it comes in with: nothing (`'empty'`, the
  default), its defaults and content (`'default'`), or a scenario's props
  (`{ scenario }`). The node it returns is the tree's own: a text node
  `{ kind: 'text', value }`, an HTML node `{ kind: 'html', tag, props, slots }`,
  or a component's `{ kind: 'element', component, props, slots }`, its
  `component` the export name.
- `insert({ parent, slot, index? }, node)`, `replace(path, node)`,
  `remove(path)`, `setNodeProps(path, props)` and `setText(path, text)`. A
  path is a list of steps from the root, each `{ slot, index }`: the slot a
  node is in and its index there. The empty path `[]` addresses the root, and
  a parent of `[]` inserts into the root's own slots.
- `setNodeProps(path, props)` replaces the node's props with `props`; it
  does not merge, so pass the props to keep along with the one that changed.
  For the root, `[]`, it does what `actions.setProps(props)` does, except
  that it leaves the root's content, and so `children`, as it is: the tree's
  root props never hold `children`, so a root prop control passes the root's
  `props` from the tree.
- `move(from, to)` moves a node to a drop target, its index counted before
  the node is taken out, as a drop reports it. `moveBy(path, offset)` moves
  it within its slot, `-1` up and `1` down, stopping at either end, for up
  and down buttons. `resolveDrop(drop)` turns what a sortable list reports
  into the `from` and `to` of a move.
- `nodeSlots(catalog, node)`, from the shell entry, lists the slots a node
  holds content in, the default first: a component's as the catalog lists
  them, an HTML tag's default slot, none for text. The tree itself stands for
  its root. `childPath(parent, slot, index)` gives a child's path,
  `childPath([], 'default', 0)` the root's first child, and `nodeAt(slots,
  path)` the node at a path, or `null` where there is none (the root is the
  tree itself, so `nodeAt` of `[]` is `null` too).

`controller.capabilities.regeneration` is `false` in the static build, which cannot
regenerate a story; a shell hides its editor then.

## A story's code

`state.code` holds the code of what the selection's panes show, for a shell
to put beside them. It follows the story, its scenario, `props` and, while the
editor holds a tree, the tree:

- `targets` - the code a consumer writes, by target, for each target other
  than html the story renders in (`targets.supported`): a React component, a
  Vue single-file component, a Svelte component. It imports each component
  from the kit's package entry for the target, writes the props the panes show,
  leaving out a prop that holds the component's declared default or a value
  the preview starts from on its own, and the slot content, leaving out the
  component's name the panes show in an unfilled default slot. A two-way prop
  the story gives is bound to state of the code's own, starting at the
  story's value, as a consumer controls it:

  | Target | The code holds the value in | and binds it with |
  |---|---|---|
  | React | `const [open, setOpen] = useState(true);` | `open={open} onOpenChange={setOpen}` |
  | Vue | `const open = ref(true);` | `v-model:open="open"`, or `v-model="open"` for the prop the component names its model |
  | Svelte | `let open = $state(true);` in runes mode, `let open = true;` in legacy mode, as the kit builds Svelte | `bind:open` |

  The state takes the prop's declared type where the value alone would
  read narrower, such as a union of strings. Where the declared type names
  types the kit's package entry exports, such as an interface a template
  declares with `export` in its `imports`, the state takes it as declared and
  the code imports them from the entry (`useState<DateInputValue>` beside
  `import { DateInput, type DateInputValue }`). Where it names other types, or
  where nothing is declared and the value is an array, an object or `null`,
  the state takes the component's own prop type, `ComponentProps<typeof
  Disclosure>['open']`; for a component with type parameters the value infers
  it. React binds a prop only when the component has a change prop to report
  it through; without one it prints the value. A story that leaves the prop
  out prints none of this, and neither does one whose value equals the prop's
  declared default, which the code leaves out as it does any default. A story
  that gives the prop leaves out the prop the component's own value starts
  from (`defaultOpen` beside `open`), which does nothing once the prop is
  given. A prop the story gives `null` is left out, unless it is a two-way
  prop the code binds; its state then starts at `null`, which type-checks
  where the template declares the prop with `null` (`type: 'string | null'`).
  Props print in the order the component declares them. The html is the markup
  at the story's value either way. It is printed in the page as the state
  changes, so it is always there for a story.
- `html` - the markup the story renders to, at rest, as `storySource` prints
  it (see [Using it from code](using-it-from-code.md)): `{ status: 'ready', source, stylesheet?,
  warnings? }`, where `stylesheet` holds the styles the kit's build wrote for
  the components the markup renders, which the html pane shows it under, and
  `warnings` holds the evaluation warnings for the expressions the markup
  left out because they cannot be evaluated at rest, those one component
  gives for one reason as a single warning counting them, which the html
  pane counts in its legend and the html code pane beside its note, each
  count a button opening the warnings in a popover,
  `{ status: 'loading' }` while it is being printed, or
  `{ status: 'unavailable', reason }`, such as for a story holding a part
  that has no markup. The markup needs the kit's templates, so the page cannot
  print it: the development server prints it on request, once a change
  pauses, and drops a request the next change replaces. The static build
  prints the html of each scenario when it builds; for changed props or
  edited content it has none, and `html` says so.

`printStorySource(catalog, story)`, from the shell entry, prints any story's
source from the catalog, for the story reference
`frames.mountStory` takes, `{ component, scenario?, props? }`, so a shell can
show the code beside a detached pane. It returns the source by target, for
the targets other than html the component renders in, and throws for an unknown component
or scenario. The html of a detached pane's story is not printed.

<!-- example: preview-print-story-source -->
```ts
import { printStorySource } from '@scaffold-ui-kit/preview/shell';

const { react } = printStorySource(controller.catalog, { component: 'components-button', scenario: 'ghost' });
```

The catalog carries what the printing reads: `imports`, how a consumer
imports each of the kit's components (`{ exportName, modules }`, the module by
target), `svelteMode`, the mode the kit builds its Svelte target in
(`legacy` or `runes`, the kit's `svelte.mode`), which the Svelte code holds a
bound prop's state in, and on each component `previewDefaults`, the values
the preview starts a prop from that the component does not declare, which
the code leaves out, and `bindings`, its two-way props.

## Frameworks

A shell may be written in React, Vue, Svelte or plain DOM. The preview's dev
server compiles all of them, and a shell renders with the preview's own copy
of each framework. While the dev server runs, an edit to the shell mounts the
new shell over the same controller, keeping the selection and the editor's
tree.

- **React.** `usePreview(controller, selector)` from
  `@scaffold-ui-kit/preview/react` reads a slice of the state and re-renders
  when it changes. Return a field of the state (or a primitive derived from
  one) from `selector`, not a new object. The preview compiles the shell
  without type-checking it; to type-check a React shell with `tsc`, the kit
  installs `@types/react` and `@types/react-dom`, and declares a module for
  stylesheets if the shell imports one:

  ```ts
  // css.d.ts
  declare module '*.css';
  ```

- **Svelte.** `previewStore(controller, selector?)` from the shell entry is
  the state, or a slice of it, as a Svelte store, so a component reads it as
  `$preview`. Pass the controller through the `context` option of Svelte's
  `mount` and read it with `getContext`: it lives as long as the shell, and
  Svelte warns about a prop read once at the top of a component.

  <!-- example: preview-svelte-shell -->
  ```ts
  import { mount, unmount } from 'svelte';
  import { defineShell } from '@scaffold-ui-kit/preview/shell';
  import Shell from './shell.svelte';

  export default defineShell({
    apiVersion: 1,
    mount(root, controller) {
      const shell = mount(Shell, { target: root, context: new Map([['controller', controller]]) });
      return () => void unmount(shell);
    },
  });
  ```

  Mount a pane in an attachment, or in an effect that reads nothing but the
  element and the target. An effect that also reads the state re-runs on
  every change, unmounting the pane and mounting it afresh each time.

  ```svelte
  <script lang="ts">
    import { getContext } from 'svelte';
    import { previewStore, type PreviewController } from '@scaffold-ui-kit/preview/shell';

    const controller = getContext<PreviewController>('controller');
    const panes = previewStore(controller, (state) => state.targets.panes);
  </script>

  {#each $panes as target (target)}
    <div class="pane" {@attach (element) => controller.frames.mount(element, target)}></div>
  {/each}

  <style>
    .pane :global(iframe) { width: 100%; height: 20rem; border: 0; }
  </style>
  ```

  A documentation page lists every scenario of the story in a detached pane
  of its own, with a field that sets one of its props:

  ```svelte
  <script lang="ts">
    import { getContext } from 'svelte';
    import { previewStore, type PreviewController } from '@scaffold-ui-kit/preview/shell';

    const controller = getContext<PreviewController>('controller');
    const preview = previewStore(controller);
    const component = $derived(controller.catalog.components.find((entry) => entry.id === $preview.selection.id));
  </script>

  {#if component}
    <input
      value={String($preview.props.label ?? '')}
      oninput={(event) => controller.actions.setProps({ ...$preview.props, label: event.currentTarget.value })}
    />
    {#each component.scenarios.filter((scenario) => !scenario.empty) as scenario (`${component.id}:${scenario.id}`)}
      <figure>
        <figcaption>{scenario.label}</figcaption>
        <div
          class="pane"
          {@attach (element) => controller.frames.mountStory(element, component.targets[0], { component: component.id, scenario: scenario.id })}
        ></div>
      </figure>
    {/each}
  {/if}
  ```

- **Vue and plain DOM** subscribe to the controller directly, Vue into a
  `shallowRef` of the state.

## A complete shell

A shell in plain DOM, with a select of stories, a checkbox per boolean option
and the panes side by side:

<!-- example: preview-plain-shell -->
```ts
import { defineShell, optionKind } from '@scaffold-ui-kit/preview/shell';

export default defineShell({
  apiVersion: 1,
  mount(root, controller) {
    const navigation = document.createElement('select');
    for (const component of controller.catalog.components.filter((component) => component.standalone && !component.unlisted)) {
      navigation.add(new Option(component.shortTitle, component.id));
    }
    navigation.onchange = () => controller.actions.selectComponent(navigation.value);

    const toggles = controller.options.filter((option) => optionKind(option) === 'boolean').map((option) => {
      const box = Object.assign(document.createElement('input'), { type: 'checkbox', title: option.label });
      box.onchange = () => controller.actions.setOption(option.id, box.checked);
      return { option, box };
    });

    const stage = document.createElement('div');
    stage.style.cssText = 'display: flex; height: 80vh';
    root.append(navigation, ...toggles.map(({ box }) => box), stage);

    let panes = '';
    let unmountPanes: (() => void)[] = [];
    const render = (state = controller.getState()) => {
      navigation.value = state.selection.id;
      for (const { option, box } of toggles) box.checked = state.options[option.id] === true;
      if (state.targets.panes.join() === panes) return;
      panes = state.targets.panes.join();
      unmountPanes.forEach((unmount) => unmount());
      stage.replaceChildren();
      unmountPanes = state.targets.panes.map((target) => {
        const pane = stage.appendChild(document.createElement('div'));
        pane.style.flex = '1';
        const unmount = controller.frames.mount(pane, target);
        // The pane is a bare iframe: the shell sizes it.
        pane.querySelector('iframe')!.style.cssText = 'width: 100%; height: 100%; border: 0';
        return unmount;
      });
    };
    render();
    const stop = controller.subscribe(render);
    return () => {
      stop();
      unmountPanes.forEach((unmount) => unmount());
    };
  },
});
```

`preview.shell` then names its module, such as `'preview/plain-shell.ts'`.

To set a story's props from such a shell, read them from `state.props` and
hand back the whole set, here a checkbox per boolean prop:

<!-- example: preview-shell-props -->
```ts
const component = controller.catalog.components.find((entry) => entry.id === state.selection.id);
for (const propType of component?.propTypes.filter((entry) => entry.control === 'boolean' && entry.include) ?? []) {
  const box = Object.assign(document.createElement('input'), { type: 'checkbox', title: propType.declaredType });
  box.checked = state.props[propType.name] === true;
  box.onchange = () => controller.actions.setProps({ ...controller.getState().props, [propType.name]: box.checked });
  form.append(box);
}
```
