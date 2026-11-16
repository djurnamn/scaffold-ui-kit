# @scaffold-ui-kit/preview

A preview for kits built with [scaffold-ui-kit](https://github.com/djurnamn/scaffold-ui-kit).
It renders every component of a kit side by side in React, Vue and Svelte,
each in its own iframe running that framework natively, and as the markup of
its html target where the kit builds one, with controls for the
component's props, named scenarios, and an editor for composing its slot
content. Everything kit-specific comes from the kit's configuration, so the
same package previews any kit.

```sh
npm install --save-dev @scaffold-ui-kit/preview charcell @zag-js/react
npx scaffold-ui-kit-preview dev
```

`charcell` and `@zag-js/react` are peers of the charcell shell, the shell the
preview ships with ([The charcell shell](https://github.com/djurnamn/scaffold-ui-kit/blob/main/packages/preview/documentation/charcell-shell.md)); a kit using another shell leaves them out. A kit
made with `scaffold-ui-kit initialize` has all of this set up.

## What you get

- **One pane per target.** A component renders in each target it is built
  for, next to the others, so a difference between targets is visible at a
  glance. A toggle per target hides the ones you don't need. The targets
  are the kit's own `targets`: a kit built for React and Vue gets those two
  panes and no Svelte one. A story that throws as it renders shows
  `render error:` and the error's message in its pane, in each target.
- **An html pane.** A kit whose `targets` include `html` gets one more pane
  and toggle, after the other targets': the markup the story renders to, under
  the kit's theme, options and `mount` frame, with no JavaScript.
  The markup shows under the styles the kit's build wrote for the html
  target, for the story's component and each component it composes: the
  `<style>` blocks of each page in `dist/html` where the kit's
  `stylesheetPlacement` is `in-file`, or each component's stylesheet there
  where it is `separate-file`, an SCSS one
  compiled with the kit's own `sass`. The markup follows the templates as
  they are saved, the page reloading, and the styles follow the last
  `npm run build`.
  It follows the scenario and every prop and editor change. It runs none of
  the story's behavior: html writes a declared event as a comment, and the
  pane takes out anything in the markup that would run. What the markup
  cannot evaluate at rest, such as a part shown on a condition the
  component's script holds, is left out, and the pane's legend says how many
  warnings that gives, the count opening them in a popover. The expressions one component cannot evaluate for one reason, such
  as several reading a per-instance id its script generates, count as one
  warning.
- **Pane widths.** The panes fit the space beside each other, or every one
  is laid out at a width you pick, such as `large` 1280 pixels, so a
  component that responds to its width shows as it does on a screen that
  wide; the default shell stacks the panes as rows when the width needs the
  room. A kit can name its own widths.
- **Controls from the template.** Each declared prop gets a control: a select
  for a union of string literals, a toggle for a boolean, a text or number
  input otherwise. A union of booleans and string literals, such as a
  checkbox's `boolean | 'indeterminate'`, gets a select of `true`, `false` and
  the literals, and the link keeps the choice as the value it is. A union that
  also takes any string (`string & {}`) or a structured form, such as a list
  of breakpoint values, still gets a select of its literals, and a type the
  template imports by name reads as its members. Edits reach every pane at
  once without a reload.
- **Two-way props.** A prop whose template declares a `bindable` object,
  such as a toggle's `pressed`, keeps its own value while a story leaves it
  out, in every pane, however the story's other props change. A story that
  gives it is controlled, as a consumer's state would be:
  each value the component reports through its change callback becomes the
  story's prop, so a click in any pane changes every pane, the html, the
  controls and the link alike. A pane takes the value at once, as a
  consumer's state does, so typing mid-text in a controlled text field
  keeps the caret where it is. Its code binds the prop as a consumer does,
  so copied code responds like the story: a controlled `Toggle` prints
  `const [pressed, setPressed] = useState(true);` and `<Toggle
  pressed={pressed} onPressedChange={setPressed}>` in React, `v-model:pressed`
  on a `ref` in Vue and `bind:pressed` in Svelte, each starting at the
  story's value (see [A story's code](https://github.com/djurnamn/scaffold-ui-kit/blob/main/packages/preview/documentation/writing-a-shell.md#a-storys-code)). The static build is the exception
  for the html: it prints the html of each scenario alone, so once a click
  writes back a value other than the scenario's, the html pane says it has
  none until the value is the scenario's again.
- **Scenarios.** Named prop sets a kit curates per component, plus one
  generated per enum value and per flipped boolean, and an `Empty` scenario
  for a component that takes content.
- **A scenario editor.** A component's slot content as an editable tree:
  add components, plain HTML tags and text, reorder them by dragging, edit
  each node's props. Every edit regenerates the story and reloads the panes,
  so what you compose renders as the kit's real components.
- **A story's code.** What a consumer writes to get the story on screen, in
  React, Vue and Svelte, and the markup it renders to as html, following
  every prop edit, scenario pick and editor change.
- **Kit options and themes.** Toggles and selects the kit declares (a color
  mode, a density, a frame around the story), and the kit's compiled theme
  stylesheets.
- **Custom views.** Panels the kit writes itself, such as a tokens page or
  an icon gallery, listed beside the components.
- **A shell of your choosing.** The interface around the panes is a shell
  the kit names. The charcell shell ships with the preview, with slots for a
  kit's own content; a shell can also be written from scratch, in React, Vue,
  Svelte or plain DOM, on the preview's shell contract.

## Setting it up

The preview reads the `preview` block of the kit configuration,
`scaffold-ui-kit.ts` (or `scaffold-ui-kit.json`) in the kit root. The build
leaves the block alone; this package owns and validates it. A key the block
does not take, or one an object inside it does not (a source, `codeBlock`,
`setupModules`, `landing`, a hand-written component's mapping), stops
`check`, `build` and `dev`, named with the keys allowed there, as in `unknown key
'preview.persistance'; the 'preview' block takes shell, sources, ...`, or with
what to use instead where one key is meant.

<!-- example: preview-configuration -->
```ts
/// <reference types="@scaffold-ui-kit/preview" />
import { defineKit } from 'scaffold-ui-kit';

export default defineKit({
  name: 'my-ui-kit',
  targets: ['react', 'vue', 'svelte'],
  styling: [],
  preview: {
    shell: '@scaffold-ui-kit/preview/shells/charcell',
    sources: [
      {
        id: 'core',
        label: 'Components',
        order: 0,
        moduleBase: 'my-ui-kit',
        templatesDirectory: 'src/components',
        storiesDirectory: 'preview/stories',
      },
    ],
    themes: [
      { id: 'default', label: 'Default', css: 'dist/themes/default.css', assets: 'dist/fonts' },
    ],
    canvas: { namePrefix: 'my-ui-kit' },
    options: [
      {
        id: 'theme',
        label: 'theme',
        values: [{ value: 'default', label: 'Default' }],
        default: 'default',
        group: 'kit',
        scope: 'global',
        apply: { type: 'stylesheet' },
      },
      {
        id: 'mode',
        label: 'mode',
        values: [
          { value: 'light', label: 'light' },
          { value: 'dark', label: 'dark' },
        ],
        default: 'light',
        scope: 'global',
        apply: { type: 'root-attribute', attribute: 'data-mode' },
      },
      {
        id: 'outline',
        label: 'outline',
        default: false,
        group: 'canvas',
        scope: 'global',
        apply: { type: 'class', target: 'body', className: 'is-outlined' },
      },
    ],
  },
});
```

The first line loads this package's types for the block, so an editor
checks it as it checks the rest of the configuration.

Every command finds the kit configuration the same way: the file
`--configuration <path>` names, relative to the directory the command runs
in, else the one the kit's `package.json` names
as `"scaffold-ui-kit": { "configuration": "<path>" }`, relative to the kit
root, else `scaffold-ui-kit.ts` or `scaffold-ui-kit.json` in the kit root.
Both in the root is an error.

The keys the preview's pages read, `options`, `canvas`, `themes`, `mount` and
`viewCanvas` (see [The kit's vocabulary](https://github.com/djurnamn/scaffold-ui-kit/blob/main/packages/preview/documentation/kit-vocabulary.md)), reach the browser as JSON, so they
hold plain data: a function, a regular expression or `undefined` in a list
there stops `check`, `build` and `dev`, naming where it sits, as in
`preview.options[0].apply.className is a function, which can't be sent to
the browser as JSON`. The kit configuration itself never reaches the
browser, so `scaffold-ui-kit.ts` can import what it computes these from,
such as the kit's tokens. `controlHints` and `labels` are read in Node
alone, so in `scaffold-ui-kit.ts` their hooks can be functions; a kit
configured in `scaffold-ui-kit.json` leaves those hooks out.

- `sources` - the packages whose components the preview shows, each under its
  own navigation section. A source's components import from
  `<moduleBase>/<target>`, so the preview renders the kit as a consumer gets
  it. The kit is the first source; another package's components can be
  another. For the kit's own source that means importing the kit by its
  package name, so its `package.json` needs an `exports` entry per target (`"./react":
  "./dist/react/index.ts"`, and likewise for `vue` and `svelte`). A
  `moduleBase` containing `{target}` names the module itself, with the
  target in its place: a kit built into one package per target (its
  configuration's `packages`) sets it to the pattern its target packages
  share, such as `'@acme/{target}'` for `@acme/react` and `@acme/vue`. Each
  of those packages, and the styles package, has to resolve from the kit
  root, as a workspace package or a dev dependency of the kit root.
  - `templatesDirectory` - the component templates to read: TypeScript,
    JSON and JavaScript ones (`.ts`, `.json`, `.js`, `.mjs`, `.cjs`) alike,
    as the kit's build reads them.
  - `storiesDirectory` - the story files that curate each component's story
    (below).
  - `manualModule` - a module whose default export returns the components
    that have no template, such as a hand-written driver, which gets its
    story this way, as `() => ManualComponentSpecification[]`. Each gives its
    `name`, the `file` it lives in (informational), and `targets`
    when it renders in only some, and gives its props inline in `props`, or
    names its React props type in
    `propsFrom: '<file>#<TypeName>'`, a file relative to the kit root. The
    preview reads that type's members from source, following imports and
    intersections. A type built on a template component reads too:
    `ComponentProps<typeof ButtonVisual>` takes the template's props, through
    an `Omit<..., 'name'>` and a generic helper such as
    `Props extends unknown ? Omit<Props, 'onChange'> : never`. A member whose
    type is not a control is kept as a hidden prop.
- `options`, `canvas`, `themes`, `mount`, `viewCanvas`, `paneWidths`,
  `controlHints` and `labels` - [the kit's vocabulary](https://github.com/djurnamn/scaffold-ui-kit/blob/main/packages/preview/documentation/kit-vocabulary.md).
- `shell` - the shell that renders the preview's interface
  ([The charcell shell](https://github.com/djurnamn/scaffold-ui-kit/blob/main/packages/preview/documentation/charcell-shell.md),
  [Writing a shell](https://github.com/djurnamn/scaffold-ui-kit/blob/main/packages/preview/documentation/writing-a-shell.md)). Required:
  a package specifier, resolved from the kit as its own imports are, or a
  module path relative to the kit root, whose default export is a shell.
  `@scaffold-ui-kit/preview/shells/charcell` is the shell shipped with the
  preview; a kit that names it installs `charcell` and `@zag-js/react`. The
  long form, `{ module, page }`, names the shell's page module beside it:
  what the host page shows before the shell has loaded
  ([The page before the shell mounts](https://github.com/djurnamn/scaffold-ui-kit/blob/main/packages/preview/documentation/writing-a-shell.md#the-page-before-the-shell-mounts)).
- `viewsModule` - the kit's [custom views](https://github.com/djurnamn/scaffold-ui-kit/blob/main/packages/preview/documentation/custom-views.md#custom-views).
- `codeBlock` - the kit's own code block for the code view, as
  `{ module, framework }`
  ([A code block of the kit's own](https://github.com/djurnamn/scaffold-ui-kit/blob/main/packages/preview/documentation/custom-views.md#a-code-block-of-the-kits-own)).
- `setupModules` - per target, a module each preview iframe imports once for
  its side effects, such as mounting a toast container a story assumes.
- `htmlStylesheets` - stylesheets the html pane loads beside the theme's and
  its components' own, such as a preflight a target's setup module would
  import. The html pane runs no script, so this is its counterpart to a
  setup module.
- `aliases` - import aliases for the preview only.
- `scssLoadPaths` - sass load paths for per-component SCSS.
- `optimizeDepsExclude` - packages Vite should not prebundle, such as a
  dependency that ships raw `.svelte` files.
- `dedupe` - packages the preview loads one copy of, beside React, Vue and
  Svelte, which it always loads once. Name a package the shell and the kit's
  components both import, when the two must share its instances: a library
  with a plugin registry or other module-level state fails when the shell's
  copy meets the kit's. Every import of a listed package, and of its
  subpaths, resolves to the copy the kit root resolves, prebundled once, so
  each must be installed where the kit root finds it; one that is not is an
  error. List the packages whose instances meet, such as a library's core
  and the packages around it that hold state, and keep them out of
  `optimizeDepsExclude`. After changing the list, clear the kit's
  `.preview-generated/.vite` directory, Vite's dependency cache.
- `omitPattern` - a regular expression, as a string, matched against each
  component's name; a match gets no story, as a story file's `omit` does. For a
  kit whose naming marks a compound's parts, such as `"(Driver|Visual)$"`.
  Unset, no component is left out by name.
- `handWrittenComponents` - what each component written by hand renders as
  in a story's `html`: `"content"` for one that renders only the content
  passed into it, such as a driver that adds behavior to markup it is given,
  or the name of the template it renders, which then takes its props and
  content (its own props the template does not declare are dropped). Where
  the component puts content in a different slot of that template, give
  `{ "template": "FieldVisual", "slots": { "default": "inner" } }`. Either
  way one comment around it says its behavior is not included.
- `port` - the dev server's port. Default `6100`; `dev --port` overrides it,
  and a taken port moves to the next free one.
- `host` - the addresses the dev server listens on: an address such as
  `"0.0.0.0"`, or `true` for every address, so another device on the network
  can open the preview. Default: this machine only; `dev --host` overrides
  it.
- `persistence` - where the preview remembers what a person chose: `"url"`
  (the default) or `"url-and-local-storage"` (below).
- `landing` - the entry the preview opens on when its address names no
  story or view: `{ "view": "foundations" }` for a custom view, or
  `{ "component": "components-button", "scenario": "ghost" }` for a story,
  on one of its scenarios or, without `scenario`, on the scenario it starts
  on. The ids are the ones the address carries (below). `check` and
  `generate` fail on a story or scenario the kit has none of; a view the
  views module does not register opens the first story instead, with a
  warning in the browser's console. The `empty` scenario renders through
  the development server alone, so the static build opens that story on
  the scenario it starts on, with a warning in the console. Default: the
  first story the navigation lists.

Paths are relative to the kit root, and the kit's modules are TypeScript the
preview compiles as it loads them.

## Story files

A component's story file, `<Name>.story.ts` in its source's
`storiesDirectory`, curates the story the preview shows for it: the props it
starts from, its controls, its slot content and its scenarios. Every field
is optional, and a component without a story file still gets a story from
its template. [Story files](https://github.com/djurnamn/scaffold-ui-kit/blob/main/packages/preview/documentation/story-files.md)
describes each field, the kinds of slot content and what `check` reports.

## Commands

```sh
scaffold-ui-kit-preview dev        # generate, then serve the preview
scaffold-ui-kit-preview build      # check, then build the static preview
scaffold-ui-kit-preview generate   # write the registries and manifest into .preview-generated/
scaffold-ui-kit-preview check      # check the story files, the manual specs and the build against the components
```

Every command takes `--kit <path>` for a kit root other than the current
directory and `--configuration <path>`, relative to the directory the
command runs in, for a kit configuration other than the one the kit gives
(see Setting it up), `dev` takes `--port <number>` and `--host [address]` (every
address when none is given, so another device on the network can open the
preview), and `check --strict` fails on every warning the check itself
raises too, such as a select value or boolean no scenario sets, a scenario
prop set to `undefined` or a `standalone: false` story no compound lists
(what reading the kit configuration and the kit's own build warn of stay
warnings). `build` runs the check
first, printing its warnings and errors as `check` does, and stops on
an error, exiting non-zero. `build` warns of a bundled file larger than
500 kB after minification, naming it, except the host page's under the
charcell shell, named as it is or configured by a module of the kit's,
which holds the preview's interface and is that large whatever the kit
holds. `.preview-generated/` (which also holds Vite's
cache) and `.preview-static/` are generated and belong in `.gitignore`.

The static build serves from any file server, at a domain's root or under a
subpath, such as a project site at `https://example.github.io/kit/`: its
pages load everything by relative paths. The scenario editor and the Empty
scenario need the dev server: each edit regenerates the story there. So does
the html of a story whose props differ from its scenario's: the build prints
the html of every scenario, one `html-source/<story id>.json` beside its
pages, and the dev server prints any story's html on request. In the static
build the html pane shows a scenario's printed html, and for changed props
says it has none.

The dev server keeps the preview in step with the kit while it runs. Saving
a story file, a template, a manual components module, a shared module, or a
theme's stylesheet or assets regenerates the preview. Adding or deleting a
template adds or removes its component, and a story file added or deleted is
picked up the same way. Saves that arrive
together regenerate once. Only the generated files whose content changed are
written, and the pages that import them reload. If a module fails to load,
for example because of a syntax error halfway through an edit, the server
logs the error and keeps the last good preview until a save loads again. The
views module, the setup modules and the kit's built components are served by
Vite, which reloads them on its own. An edit to the kit configuration
restarts the server with the new configuration. An edit to the shell mounts
the new shell in place (see [Frameworks](https://github.com/djurnamn/scaffold-ui-kit/blob/main/packages/preview/documentation/writing-a-shell.md#frameworks)).

A reload keeps whatever the address holds: the selected story or view, the
scenario, the story's props, the visible targets and the option values.
The scenario editor's tree is not: a reload seeds it afresh from the
scenario and the tree built in it is lost, so a composition worth keeping
belongs in a story file's scenario.

## Links and persistence

The preview keeps what is showing in its address, so a link opens it as it
was. These query parameters are the preview's:

- `component=<id>` or `view=<id>` - the selected story or view, a story by
  the id described under [the testing helpers](https://github.com/djurnamn/scaffold-ui-kit/blob/main/packages/preview/documentation/testing.md), `components-taginput` for
  a `TagInput` in the default category,
- `scenario=<id>` - the story's scenario, when it is not the one the story
  starts on,
- `props=<JSON>` - the props that differ from the scenario's, as one JSON
  object, so a story whose props hold a lot of data keeps a short link. A
  prop the link leaves out takes the scenario's value, the story file's
  `defaultProps` beneath it, so a hand-written link can name just the props
  it changes. A prop of the scenario's removed from the story is written as
  `null`, which a link reads as left out. Picking a scenario or another
  story clears them. The scenario editor's content never goes in the address, apart from
  the root's lone text where it is the story's `children`,
- `targets=<list>` - the visible targets, comma-separated, `html`
  among them where the kit builds it (`targets=react,svelte,html`), while
  not every one of the kit's is on,
- `width=<pixels>` - the width the story panes are laid out at, while they
  do not fit the space the shell gives them (`width=768`). A link can name
  any whole number of pixels up to 7680, whether or not the kit's
  `paneWidths` list it,
- `option.<id>=<value>` - each option set away from its default (`true` or
  `false` for a boolean), a shell's own as `option.shell.<id>`. A story
  option appears only while its story is selected.

An address that names no story or view opens on the kit's `landing` entry,
or on the first story the navigation lists without one.

Opening a link reads them all, and what the kit does not know is ignored: an
unknown story, scenario or target, a value an option cannot hold, and in
`props` a prop the component does not declare or a value its control does
not accept (such a value keeps the scenario's).

The preview writes the address from the first change a person makes on, in
place, adding no browser history. A page that is only opened keeps the
address it was opened with, so a shell's own pages stay as they are linked.
The preview rewrites only its own parameters and keeps every other query
parameter, the path and the hash, so a shell may keep state of its own in
the address, such as a tab or a route. It is all query parameters, so links
work on the static build too.

`persistence` decides what else is remembered. `"url"`, the default, keeps
everything in the address alone. `"url-and-local-storage"` also remembers the
global option values for this kit in the browser across sessions, a value in
the address winning over a remembered one. The selection, the scenario, the
props, the visible targets and the pane width always live in the address
alone.

## Documentation

The reference for each part is in the package's repository:

- [Story files](https://github.com/djurnamn/scaffold-ui-kit/blob/main/packages/preview/documentation/story-files.md) -
  the fields of a story file, slot content, content beside the component and
  what `check` reports.
- [The kit's vocabulary](https://github.com/djurnamn/scaffold-ui-kit/blob/main/packages/preview/documentation/kit-vocabulary.md) -
  themes, options, the canvas, the `mount` frame and pane widths, and the
  setup for a kit styled with Tailwind or built without linked stylesheets.
- [Custom views and a code block of the kit's own](https://github.com/djurnamn/scaffold-ui-kit/blob/main/packages/preview/documentation/custom-views.md) -
  the views module and the `codeBlock` module.
- [The charcell shell](https://github.com/djurnamn/scaffold-ui-kit/blob/main/packages/preview/documentation/charcell-shell.md) -
  the shell the preview ships with: its layout, slots, option groups and
  popovers.
- [Writing a shell](https://github.com/djurnamn/scaffold-ui-kit/blob/main/packages/preview/documentation/writing-a-shell.md) -
  the shell contract: the page before the shell mounts, the controller, a
  story's code, and shells in React, Vue, Svelte and plain DOM.
- [Using it from code](https://github.com/djurnamn/scaffold-ui-kit/blob/main/packages/preview/documentation/using-it-from-code.md) -
  `storySource`, which prints a story as the code a consumer writes and the
  markup it renders to.
- [Testing a kit's components](https://github.com/djurnamn/scaffold-ui-kit/blob/main/packages/preview/documentation/testing.md) -
  `@scaffold-ui-kit/preview/testing`, which drives the preview from a
  browser test.

## Requirements

Node 22 or later.

## License

MIT
