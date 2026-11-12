# Changelog

All notable changes to scaffold-ui-kit and its companion packages,
`@scaffold-ui-kit/add`, `@scaffold-ui-kit/helpers`,
`@scaffold-ui-kit/preview` and `@scaffold-ui-kit/testing`, are documented in
this file. The five release together at the same version.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.3.0] - 2026-11-12

A minor release on js-template-engine 2.3.0. Every new configuration key has
a default that keeps the previous output; a kit's components change only as
the engine's 2.3.0 output does (the exported props interface and the
passthrough typing among them), and its `bin/add.mjs` becomes a shim over the
new `@scaffold-ui-kit/add` package on the next build. Read these before
upgrading, each under Changed or Fixed:

- A key the kit configuration does not take fails the build in
  `scaffold-ui-kit.ts` or `scaffold-ui-kit.json`. A kit still configured in
  `scaffold-ui-kit.config.json` gets a warning for an unknown top-level key
  and keeps building; an unknown key inside a block such as `add` fails there
  too.
- `add` links a copied component's stylesheet by default, in a kit built
  with `stylesheetLink: 'none'` too; `--stylesheet-link none` keeps the
  previous copy.
- The `html` target's pages contain no script any more, and the
  `scriptingStrategy` and `scriptingLanguage` keys have no effect.
- `scaffold-ui-kit` itself, a kit's `add` command and the preview need
  Node 22.
- `build` removes the files the previous build wrote and this one did not,
  from a record it starts on its first run; remove `dist/` once to clear
  output left from before it. Under `packages`, a directory the build no
  longer writes into is left in place with a warning.
- A hand-written driver named `index.ts` or `_index.scss`, or under
  `stylesheetLink: 'both'` named `unlinked/index.ts` or placed under
  `linked/`, now fails the build instead of being overwritten by the build's
  own file.
- The `svelte` target needs Svelte 5 or later in both modes. Step 4 below
  requires it of a kit's consumers.
- `build` compiles each generated Svelte component with the kit's own
  Svelte, and one the compiler cannot compile fails the build, where 2.2.1
  wrote it unchecked. A kit that built with such a component now exits
  non-zero; the file stays written, so it can be read. The check
  needs Svelte 5 or later installed in the kit; without it the build prints a
  note and leaves the components unchecked.

To move a kit from 2.2.1, in this order:

1. Install `scaffold-ui-kit`, and the `@js-template-engine` and
   `@scaffold-ui-kit` packages your kit lists, at `^2.3.0`.
2. Rename `scaffold-ui-kit.config.json` to `scaffold-ui-kit.json`, or write it
   as `scaffold-ui-kit.ts`, and remove the old name from `package.json`'s
   `files` and from the kit's README.
3. Run `npm run build` and move what it warns about to its new keys:
   `stylesheetPlacement`, and the `bem`, `tailwind` and `svelte` blocks. The
   same build warns about exports and `add.ownership` too, which the kit
   manifest paragraph below explains.
4. Add each target's framework under `peerDependencies`, and under
   `devDependencies` at the same range for the kit's own build:
   `"react": "^19.0.0"` for a React kit, `"vue": "^3.5.0"` for a Vue kit,
   `"svelte": "^5.0.0"` for a Svelte kit (`"^5.20.0"` in runes mode). Mark
   each peer optional under `peerDependenciesMeta` when the kit has several
   scripted targets. The React range drops React 18: npm checks an optional
   peer that is present, so a project on React 18 can no longer install the
   kit. Then run `npm install`, which also brings in the
   `@scaffold-ui-kit/add` that step 3's build added to `dependencies`;
   `bin/add.mjs` fails without it.
5. Read `add.notes` again. `add` now links a copied component's stylesheet by
   default, so a note telling consumers to import each stylesheet themselves
   may no longer be true.
6. Remove `dist/` once and run `npm run build`. Svelte is installed by now,
   so a component the compiler cannot compile fails the build here.

A consumer with copies from before 2.3.0 has no ledger, so `status` and
`update` do not see them. `add <name> --force` brings a copy in by replacing
it with the kit's version, with no backup, so a consumer with edits commits
first and moves them over from the diff. Name every component to bring in:
`--force` replaces the components named, with the helpers they reach and the
parts a named root brings, and a component they import, or a shared file, that
differs from the kit's stays as it is and is named in the output. A component
that stays can still gain a stylesheet: `add` writes the one the kit now has
for it, printed as `added`, and the older copy does not import it. It does
nothing there; name the component too to replace the copy with one that links
it. Pass the
`--output-directory` the copies were made with; elsewhere `add` finds no file
to replace, adds a second copy beside the old one, and says so.

A kit that ran the preview from a build before this release renames these
keys, with no alias: `scopes` is `sources`, `sidecarsDirectory` is
`storiesDirectory`, `*.sidecar.ts` files are `*.story.ts`, the `Sidecar` type
is `Story`, `partial` is `standalone: false`, and what a `configurationModule`
exported (`themes`, `canvas`, `mount`, `options`) are keys of the `preview`
block.

A kit made before 2.3.0 gets none of what `initialize` now writes for a new
one. A kit styled with Tailwind classes sets up its preview's Tailwind build
as the preview README's "A kit styled with Tailwind" section describes, and
adds an `add.notes` line telling consumers to make sure their Tailwind build
scans the directory `add` copies components into. A kit under
`tailwind: { output: 'styles' }` needs neither: its components carry plain
CSS and no Tailwind class.

`build` now writes a kit manifest. A kit that leaves `add.ownership` out is
recorded for full ownership unless its `exports` reach every piece a
consumer could leave in the package, and the build warns of each piece no
export reaches, with an export that would reach it. A shared module whose
source does not exist is now a warning, left out of the manifest, where it
used to fail the build.

### Added

- **Per-extension blocks and `stylesheetPlacement`.** The kit configuration
  takes each extension's options under its own name, as the extension's
  factory takes them: `bem: { elementSeparator, modifierSeparator, mode,
importSource }`, `tailwind: { output, darkSelector, convertStyles }` and
  `svelte: { mode }`. A block for an extension the kit does not apply, and a
  key a block does not take, fail the build. `stylesheetPlacement`
  (`inline`, `in-file` or `separate-file`) says where each component's
  stylesheet goes. The kit manifest records the blocks, defaults filled.
- **A typed kit configuration.** A kit is configured in `scaffold-ui-kit.ts`,
  whose default export is `defineKit({ ... })` from `scaffold-ui-kit`, or in
  `scaffold-ui-kit.json`. `initialize` writes `scaffold-ui-kit.ts`, or the
  file `--configuration <path>` names. `build` and every preview command
  take `--configuration <path>`, and otherwise read the file the kit's
  `package.json` names as `"scaffold-ui-kit": { "configuration": "<path>" }`,
  then `scaffold-ui-kit.ts` or `scaffold-ui-kit.json` in the kit root; both
  in the root is an error; `--configuration` is relative to where the
  command runs. `resolveKitConfiguration` and `findConfigurationFile` find
  and read it the same way from code; a file named there can be a `.ts`,
  `.mts`, `.cts`, `.js`, `.mjs`, `.cjs` or `.json` file, and `initialize
--configuration` writes any of them. The resolved configuration lists the
  modules a `scaffold-ui-kit.ts` imports, outside the kit root too (a
  workspace package linked in, such as design tokens), which it reads
  afresh each time, so a tool can watch them. The preview reads the configuration with
  the kit's own scaffold-ui-kit when that copy has the resolver, and its dev
  server restarts when the configuration or a module it imports changes.
- **The preview block's data reaches the browser as JSON.** Of the
  `preview` block, the keys the preview's pages read (`options`, `canvas`,
  `themes`, `mount` and `viewCanvas`) are sent to the browser as JSON, and a
  function or another value JSON can't carry there is an error naming where
  it sits; the kit configuration itself never reaches the browser.
  `controlHints` and `labels` stay in Node, so in `scaffold-ui-kit.ts` their
  hooks can be functions. Without `canvas`, the frames' name prefix is the
  kit's name.
- **A kit's own `pkg:` URLs in the preview.** The preview compiles a kit's
  SCSS, in its scripted panes and its html pane, with the importer the
  build uses for the kit's own `pkg:` URLs.
- **`@scaffold-ui-kit/add`: copies a consumer owns and keeps up to date.**
  A kit's command now runs four commands. `initialize` writes the consumer's
  settings for the kit (`<kit>.json`): the target, a layout placing each
  component, stylesheet, compound part and shared module by pattern (`flat`
  and one-folder-per-component presets, or custom patterns with `{name}`,
  `{kebab-name}`, `{component}`, `{extension}` and
  `{stylesheet-extension}`), an import alias, and what they own:
  `component`, `stylesheet`, `shared` or `shared:<name>`. `add` copies
  components as the settings place them, rewrites every import between the
  copies, and imports what the consumer does not own from the package: a
  stylesheet-only copy gets a module that loads it and re-exports the
  component, a component-only copy links the kit's compiled CSS, and a
  shared module left in the package is loaded by its `pkg:` URL. A copied
  stylesheet moves to the kit's owned layer, `copy: "reached"` copies only
  the shared files the copies reach (fonts a stylesheet references
  included), and a compound's root copies itself while its parts stay
  imports until named. `add` records each file in a ledger,
  `.<kit>/copies.json`, with its content as written under `.<kit>/bases/`;
  `status` reports per copy whether it was edited and whether `add` would
  write it differently now, and `update` replaces untouched copies and
  merges the kit's changes into edited ones with `git merge-file`, leaving
  conflict markers to resolve. Naming a compound's root updates the parts
  `add` copies with it on that target, and a part added by name stays as it
  is, named when the kit has changed it. A shared module a later kit version
  adds goes where `layout.shared` says, or beside the components when no key
  names it. `status` counts conflicts open and resolved apart, and
  `initialize` prints the full path when it writes above the working
  directory. A ledger that is not as the commands write
  it is an error naming the file and each problem, settings paths separate
  directories with `/` on every platform, and neither command writes over a
  symbolic link. Running `add` again with a wider `--own` reaches the copies
  the named component composes too: an untouched one is written again to
  import the shared modules now owned, and the files it reaches come along;
  an edited one is kept with a warning naming the imports still pointing at
  the package, which `update` merges into the edits. A copy written again
  this way links its stylesheet as it was written to, whatever
  `--stylesheet-link` the run passes; owning fewer shared modules removes
  nothing, and copies keep importing the module copies until removed by hand. Without settings `add`
  copies flat into
  `src/components/ui` as before and suggests `initialize`; every earlier
  flag works, and `--output-directory` puts one run's copies flat in a
  directory. `add` reads only the kit manifest and `package.json`: a kit
  built before 2.3.0 is asked to rebuild.
- **`@scaffold-ui-kit/helpers`: what a kit's code calls on every target.**
  `/template` has `oneOf`, which writes an axis of modifiers as rules that
  never overlap and reaches an element of the block as the member's child,
  and `definePreamble`, which gives a kit a typed `stylePreamble(...names)`
  from the lines every stylesheet opens with and the Sass modules a
  component may load. `/runtime` has `mergeRootProps`, which merges a
  consumer's attributes onto a root whose props a behavior supplies (classes
  joined, styles merged, both handlers run unless the consumer's prevents
  the default), with `consumerClass` and `withoutClass` for a root of the
  component's own markup; it imports no framework. `/runtime/svelte` has
  the `portal` action and its attachment form, `portalTo`, with Svelte 5.29
  or later as an optional peer. `/zag` has fixes for components built on Zag
  machines, without importing Zag: `resolveOverlayLabeling` drops a
  reference to an unrendered label part, `mergeTriggerProps`,
  `labelListbox`, `selectValueId` and `selectLabelId` name a Select's
  trigger and listbox, `closingOnPressOutside` closes an overlay at the
  press, `returningFocus` sends a dialog's focus to a fallback when its
  trigger is gone, and `clearingOnReset` clears a combobox when its form
  resets. `/zag/svelte` has `machineApi`, a Svelte store of a machine's
  connected `api`.
- **`@scaffold-ui-kit/testing`: a kit's components tested in every target.**
  `/render` renders a component on the server in React, Vue and Svelte from
  one loader per target, which finds a component by its export name, with
  slot fills written once (`slot`, `scopedSlot`) and a host component
  around a part; Vue's teleported markup is appended. `/parity` has
  `canonicalMarkup` and `canonicalNodes`, which smooth only what the
  frameworks write differently for the same document, and `rootAttributes`.
  `tsconfig.consumer.json` holds the flags of a fresh Vite project with
  `noUncheckedIndexedAccess`, Vue's `strictTemplates` and `data-*`
  attributes allowed, for a kit to type-check its targets as a strict
  consumer would. `/typecheck` has `checkSvelte`, which runs svelte-check
  and fails on a diagnostic the kit has not accepted, on an accepted one
  that no longer occurs, and on a tsconfig that reaches no Svelte file.
  `/browser` sweeps the preview on `@scaffold-ui-kit/preview/testing`:
  every component's default props and scenarios, in each target, scanned
  with axe and walked with the keyboard, with known violations keyed by
  rule, component and state (the default props or a scenario). The walk goes
  around an open modal, and fails a listbox, grid, tree, tablist, menu or
  radiogroup that is not a single tab stop. React, Vue, Svelte, svelte-check,
  `@axe-core/playwright` and the preview are optional peers.
- **The kit manifest.** `build` writes `dist/scaffold-ui-kit-manifest.json`,
  the whole of what a kit's consumer command reads of the kit besides its
  `package.json`: the version of `scaffold-ui-kit` that wrote it, the kit's
  name, version and targets, the stylings its components are built with
  (each styling extension's name and its `classKind`, `semantic` or
  `utility`), the `bem`, `tailwind` and `svelte` blocks of the extensions
  in use with every default filled in, its stylesheet link, styling
  language, stylesheet placement and Sass load paths, and per component its
  kebab-case name, its compound, and its files per target (the component
  module or html page, its stylesheet, that stylesheet compiled to CSS, its
  linked module under `stylesheetLink: 'both'`, and the helper modules a
  hand-written driver imports), each with the imports it makes and the bare
  specifier the kit's `exports` publish it under, the most specific export
  winning. It lists the shared modules with their files, the kit's
  `add.notes`, the name of a consumer's settings file and the cascade
  layers. `scaffold-ui-kit` exports
  its type, `KitManifest`, with `KIT_MANIFEST_FORMAT` and
  `KIT_MANIFEST_PATH`. A stylesheet's imports include its relative
  `url(...)` references to files in the kit. A kit that declares its
  ownership fails the build when its `files` list leaves the manifest out;
  one that does not is warned.
- **Ownership.** `add.ownership: "partial"` lets a consumer own part of a
  component and has a piece no `exports` entry reaches fail the build, with
  an export that would reach it (a shared module's fonts and images need
  none: they travel with the stylesheets that reference them); `"full"` has consumers copy every piece
  and requires no export per piece. Left out, the manifest records
  `"partial"` only when every piece a consumer could leave in the package
  is exported, `"full"` otherwise, and the gaps are warnings. `initialize`
  writes `"partial"`.
- **A kit's own `pkg:` URLs.** A template's style preamble can
  `@use "pkg:my-ui-kit/styles/tokens"`: every Sass compile the build runs
  resolves the kit's own `pkg:` URLs through its `exports`, trying the
  variants Dart Sass tries for a URL without an extension (the extensions,
  the `_` partial, `index` and `_index`), and other `pkg:` URLs through
  Sass's package importer. `kitSassImporters` exports the importers. A kit
  whose consumers may own part of a component, built separate-file with
  each component linking its own stylesheet, is warned that a consumer who
  owns only a stylesheet loads the kit's sheet beside their copy.
- **A compound lists its parts.** A root template's `parts` names the
  components a consumer places inside it, a hand-written driver included,
  and the manifest records `parts` on the root and `partOf` on each part. A
  root with no template, such as a hand-written driver, lists its parts in
  the kit configuration's `parts` (`{ <root>: [<part>, ...] }`). A
  part that is not one of the kit's components, or that two compounds list,
  fails the build. In the preview, a part its root lists is a component
  with no story of its own (`standalone: false`) without a story file
  saying so, and a story file's `standalone: false` must match the `parts`
  its compound's root lists: `preview check` reports `standalone: false` on
  a component no root lists, a warning and an error under `--strict`,
  unless the component is no one compound's part: two or more templates
  render it, a story of its source labeled with its name stands in for it,
  or it lists parts of its own.
- **Each component stylesheet compiled to CSS.** Under a declared partial
  ownership an `scss` kit's build compiles every component's stylesheet, whatever its
  `stylesheetLink`, into
  `dist/stylesheets` (or `compiledStylesheetDirectory`) when it is the same on
  every target, per target otherwise, so a consumer who owns a component and
  not its stylesheet imports the kit's CSS for it. `compiledStylesheetDirectory`
  no longer needs `stylesheetLink: 'both'`.
- **One package per target.** The kit configuration's `packages` builds each
  scripted target into a package of its own (`@acme/react`, `acme-vue`, any
  names) beside a package of stylesheets, so each states the framework it
  needs as a plain peer. The kit root stays the package of the shared
  modules, and `name` is the kit's name. Each target's components, barrels
  and linked modules go into its package's `dist/`; every component
  stylesheet goes into the styles package, once when every target emits it
  the same, and the linked modules import it by the styles package's exports. The build writes each
  target package's `exports`, `files`, `bin`, `dependencies`,
  `peerDependencies`, `type`, `sideEffects` and version, keeping every other
  field: it depends on the kit root's package at the exact version and on
  what its components import at the kit root's ranges (an `import type`, an
  `export type` or a braced list whose every name is marked `type` adds no
  dependency), and takes its framework and the styles package as peers.
  Each target package gets a
  manifest naming the package of every file it points at, and its own
  consumer command, `<kit>-<target>`, which copies its target with none to
  choose. A shared module's source and a load path may lie in any of the
  packages. `packages` needs `stylesheetLink` of `both` or `none`, and a kit
  building the `html` target stays one package.
- **`add` from a package of a kit built into several.** `npx @acme/react add`
  reads the files it copies from the kit's packages where they are
  installed, imports what the consumer leaves in each by that package's
  exports, and lists the kit's packages at the kit's exact version. The
  packages share one settings file and one ledger; each package's `status`
  and `update` answer for the copies made for its target. A package `add`
  needs that is not installed is named with the command that installs it.
- **Framework peers from the extensions.** A target package's framework
  peer comes from its target extension: React `^19.0.0`, Vue `^3.5.0`,
  Svelte `^5.0.0`, or `^5.20.0` in runes mode.
- **Each target from its package in the preview.** A preview source's
  `moduleBase` may hold `{target}` (`@acme/{target}`), which each target
  replaces; without it a target is imported from `<moduleBase>/<target>` as
  before. `check` reports a source whose `moduleBase` imports a target from
  the kit root's package when the kit builds it into a package of its own,
  and a package of the kit that does not resolve from the kit root; the
  preview serves the packages' files and compiles each one's `pkg:` URLs.
- **The layer a copied stylesheet moves to.** `stylingLayer.owned` names the
  cascade layer a stylesheet a consumer copies wraps its rules in, after the
  components layer, so their edits win over the kit's own rules. The
  configuration requires `order` beside it, listing it after `name`. Under
  `stylingLayer` with an `order`, every SCSS stylesheet the build compiles
  to CSS starts with the layer order statement, ahead of anything the
  modules it `@use`s emit, so a module that emits rules inside one of the
  kit's layers keeps the cascade in the declared order. The build writes
  `_layer-order.scss` beside each target's SCSS sheets (in a packages kit,
  into every styles-package directory holding sheets), or under `in-file`
  and `inline` beside the Vue and Svelte components whose style blocks load
  it; the sheets load it first, and the manifest records it under `stylingLayer.orderModules`, so a
  consumer compiling a copied stylesheet gets the order first as well; `add`
  copies the module beside the first copied stylesheet, or the first copied
  Vue or Svelte component, that loads it.
- **Shared modules by name.** An `add.shared` entry takes a `name`, which a
  consumer's settings place and own it by (default: the source's base name
  without its extension, or a name from its whole source path when another
  module's name takes that), and `copy`: `all` (the default) or `reached`,
  only the modules the copied components import. Its specifier comes from
  the kit's `exports`, which may name a directory whole or each of its
  files. `add.consumerConfiguration` names a consumer's settings file.
- **A new kit exports each piece.** `initialize` writes an `exports` entry
  per scripted target's component files and compiled stylesheets beside its
  barrels, with or without the preview, and declares
  `"ownership": "partial"`.

- **Three example kits.** The repository's `examples/` holds `headless-kit`
  (unstyled, accessible primitives), `shadcn-kit` (a shadcn/ui-style kit with
  Tailwind) and `mantine-kit` (a Mantine-style kit with BEM and CSS variables).
  Each is a standalone project on the published packages, with a README on
  what to look at; the two library-style kits are not ports and are free to
  use as the starting point for one.

- **Slots that require their scope in the preview.** A story fills a slot
  whose template sets `scopeRequired` with a `scoped` fill only, so its React
  source passes a render function: `preview check` reports any other fill
  there, and the editor neither adds plain content to the slot nor takes it
  dropped there.

- **Slot content per scenario.** A story file's scenario takes `slots`, in
  the shape of the story's: a slot it fills shows the scenario's content in
  place of the story's, in every pane, each target's code, the html, the
  editor and a static build, so a story can show what a component holds as
  well as how it is set, such as a message's text per severity. `check`
  holds a scenario's fills to what the story's are held to, and the
  testing sweep mounts each such scenario with its content.
- **Content beside a story's component.** A story file's `around` takes a
  fill `before` and `after` the component, any kind but `scoped`, such as a
  hint whose id the component's `aria-describedby` names. Every pane renders
  it as the component's siblings, the story's code prints it beside the
  component (in a fragment in React), the html renders it beside the
  component's markup, and the scenario editor shows it as locked rows
  around its root. `preview check` reports a scoped fill there or a key
  other than `before` and `after`.

- **A kit's converted dark styles show in its preview.** With
  `tailwind: { output: 'styles' }`, the new `darkSelector` option writes
  `dark:` utilities under a selector instead of
  `@media (prefers-color-scheme: dark)`: `'[data-mode="dark"]'` puts them
  under `:where(:root:is([data-mode="dark"]))`, adding no specificity, so a
  preview `mode` option that
  sets `data-mode` on each frame's root switches them, in every pane and in
  the html source.

- **A kit declares the framework it needs.** `initialize` writes each
  scripted target's framework under `peerDependencies`: `"react": "^19.0.0"`,
  `"vue": "^3.5.0"` and `"svelte": "^5.0.0"`, the releases the generated
  components need, each optional when the kit has several scripted targets,
  and the same ranges under `devDependencies` for its own build. `add`
  names the target's framework among the packages to install, with the kit's
  range, when the consumer's `package.json` doesn't list it: a Vue or Svelte
  component needs its framework without importing it.

- **Scrolling a row at a time.** The default shell's navigation, scenario editor
  and code panes scroll in whole rows, with scrollbars drawn in character
  cells, and long code scrolls across when it isn't wrapped.

- **A component tree for every source.** A preview source's components are
  listed under "Components", ahead of its other views of the same order,
  unless one of its views places the tree itself.

- **Unlisted stories.** A story file's `unlisted: true` keeps a story out of the
  navigation, the editor's pickers and the count while it stays reachable at
  its address, for a fixture that only tests use. `omit: true` drops the
  component from the catalog altogether, the editor's picker included;
  `check` reports `unlisted` beside `omit` or `standalone: false`, since
  neither leaves a story to unlist.
- **Packages loaded once.** A kit lists packages in its preview's `dedupe`,
  and every import of them, the kit's and the shell's, loads the kit's copy.
  A story's render error shows in its pane in every framework.

- **Views, targets and context in the default shell.** Its top bar toggles
  three views - scenario, output and code - beside the targets, and every view
  and target returns at its last size when shown again. Each view is headed by
  its name. The stage bar finds the component as you type its name, in a
  field as wide as the longest name, with an info button for its
  description. The output view starts at the height of
  its stories and keeps the context options in an options popover: the
  story's own, such as padding, and the global ones, such as a mode. The scenario view picks the
  scenario on its heading row and holds the editor, where a component's props
  and each of its slots are a window to expand or collapse, an unset prop
  showing its default. A kit option names no group to be context, and
  `group: 'kit'` places it beside the kit in the top bar. A story file's scenario
  can set option values with `options`, so a scenario can show the component
  in a setting, such as dark. Code panes wrap long lines, with one toggle to
  turn it off.

- **Hints as tooltips.** The default shell's hints - a prop's description,
  what a control does, why a pane failed - open in a tooltip as the reader
  hovers or focuses the control.

- **A preview without flashes.** The default shell's page is dark from its
  first frame; each preview pane stays hidden until it has painted its
  content, the default shell saying `loading` in it after a moment, so no
  pane flashes white or shows a half-drawn page; and a scroll that reaches a
  pane's edge stays in the pane rather than moving the shell around it.

- **Content that calls itself.** A story's slot content can call a part it
  declares once by name, whose body may call it again, so a tree or lists
  nested in each other's items render as deep as their data goes. React
  declares the part as a function component, Vue as a component (a
  single-file component of its own in the printed source) and Svelte as a
  snippet, typed by the part's `parameterTypes`; the html source unrolls it
  over the data.

- **Descriptions in markdown.** A component's, a scenario's and a prop's
  description, and an option's title, are markdown: the default shell renders
  their inline code, emphasis, lists, links and code blocks, and shows raw
  html in them as text.

- **An events view.** The default shell logs the events a story's panes
  fire: each call of an event the component declares, a function prop that
  returns nothing, such as `onSelect`, with the pane and what it was called
  with. Shell authors read
  the log from the controller's state, and a story's events from the
  catalog.

- **Pane widths.** The default shell's `width` select, the last of the output
  view's options, lays every story pane out at a width - `small` 375, `medium`
  768 or `large` 1280 pixels - so a component that responds to its width shows
  as it does on a screen that wide, or fits the panes beside each other again.
  While the width is wider than a column, the panes stack as rows at the
  stage's full width, each starting at its story's height, or at an equal
  share of the stage when the stories are too tall to fit together. Each row
  keeps its frame and about seven rows of story, or its whole story when
  shorter; when the rows and the code row can't all keep that, the stage
  scrolls down rather than squeezing a row. A story still wider than its row
  scrolls across, its scrollbar on a row of its own. A kit names its own
  widths, up to 7680 pixels, in its preview block's `paneWidths`, so it can
  derive them from its own breakpoints; the
  address keeps the width (`width=768`). Shell authors read the widths from the catalog and the
  current one from the controller's state, and set it with
  `actions.setPaneWidth`.

- **Two-way props click through in the preview.** A component whose
  template declares a `bindable` object lists the binding in the catalog
  (`bindings`: the prop, its default and change props, and whether Vue binds
  it with a bare `v-model`), and its events in `events`. A story that gives
  the prop is controlled: each value a pane reports through the change prop
  becomes the story's prop, as `actions.setProps` would set it, so a click in
  the React, Vue or Svelte pane changes every pane, the html pane, the
  controls and the address. A pane takes the value at once, as a consumer's
  state does, so typing mid-text in a controlled text field keeps the caret
  where it is. Each props message the host sends a pane names the newest
  of that pane's own values it had taken, so a pane keeps what it typed over
  props sent before the host took it, such as another control's change. A
  story that leaves the prop out lets each pane's component keep its own
  value, however the story's other props change. A recorded
  event carries its first argument as `value` when that is plain data. The
  code view, and
  `storySource`, print a controlled story with its binding, so copied code
  responds like the story: React holds the value in `useState` and passes the
  setter as the change prop, Vue binds a `ref` with `v-model:<prop>`, or a
  bare `v-model` for the prop `extensions.vue.model` names, and Svelte binds
  with `bind:<prop>` on `$state` in runes mode or a plain `let` in legacy
  mode, as the kit's `svelte.mode` builds it. The catalog carries that mode as
  `svelteMode`. The state takes the prop's declared type where it names types
  the kit's package entry exports, imported beside the component
  (`useState<DateInputValue>`), and the component's own prop type where it
  names others. The code leaves out the prop the component's own value starts
  from (`defaultValue` beside `value`), which does nothing once the prop is
  given, and a prop a scenario unsets with `null`, unless it is the bound prop
  itself; every pane leaves that prop out too, so the component's own default
  applies, while a two-way prop given `null` stays controlled at `null`.
  An empty string is a value like any other: a prop given `''`, by a story,
  a control or a component's own change, reaches every pane as `''`.
  `check` reports a two-way prop given `null` whose declared type does not
  take it, and warns of a scenario prop set to `undefined` that a
  `defaultProps` value covers, since `undefined` leaves that value in place
  and `null` unsets it; `--strict` makes that warning an error. The catalog's `imports` list the type names each component's
  module exports, per framework, as `types`.

- **A code block of the kit's own.** A kit's `codeBlock` names a module that
  mounts its own code block, in any of its frameworks; the code view shows
  each target's source in it, following the story as it changes, and tells
  it whether the shell wraps long lines. The block fills its pane, outside
  the kit's mount wrapper, under the global options only, on a page the kit
  may style (`html[data-preview-frame='code']`).

- **Stylesheets for the html pane.** A kit's `htmlStylesheets` lists
  stylesheets the html pane loads beside its theme's, such as a preflight its
  scripted panes load from a setup module.

- **Component styles in the html pane.** The html pane shows its markup
  under the styles the kit's build wrote for the html target, for the
  story's component and each component it composes: each page's `<style>`
  blocks under `in-file`, each component's stylesheet under `separate-file`,
  an SCSS one compiled with the kit's own `sass`. `state.code.html` carries
  them as `stylesheet`.

- **A Tailwind build for a Tailwind kit's preview.** `initialize --styling
tailwind` adds `tailwindcss` and `@tailwindcss/cli`, a
  `preview/tailwind.css` entry naming the built components and the story files as
  sources, and a `preview:css` script that compiles it into the stylesheet
  the preview block's `themes` loads, run by the `preview` and `preview:build` scripts
  after they build the kit. The kit's `add.notes` tells a consumer to make
  sure their Tailwind build scans the copied components. The preview's README
  gives the same setup for any kit, with a `dark` variant that follows a mode
  option.

- **A status bar, keys and pane actions.** The default shell's status bar
  says whether the panes are ready, loading or regenerating, and which
  targets' stories threw; it copies the address of what the preview shows,
  and lists the shell's keys: `/` finds a component, `s`, `o`, `c` and `e`
  toggle the scenario, output, code and events views, `1` to `n` the kit's
  targets in the top bar's order, `n` the navigation, `w` code wrapping, and
  `?` lists the keys. A key acts while no field, list or the navigation's tree takes
  the typing. A narrow window shows one view and one target at a time
  without changing the address. Each pane reloads, and a scripted target's
  opens its story in a window of its own; the two sit at the end of the pane's
  top row and give way a whole cell at a time when it is narrow. The page says
  it is loading until the shell mounts.

- **Options and slots for each view.** A kit can place an option group at
  the end of the scenario, output, code or events view's heading row
  (`scenario-end`, `output-end`, `code-end` and `events-end`), or at the end
  of the stage bar, and fill a slot in each. `popovers` chooses whether a
  view's options open in a popover or sit in its row.

- **Named toggles and reachable hints.** Every toggle of the shell is named
  for what it toggles: a boolean option or prop is read by its label. A
  toggle's hint opens on hover as well as focus, and a disabled target
  toggle takes the focus so its hint is reachable from the keyboard. The
  page title names the story or view shown and the kit.

- **A keyboard-friendly navigation.** It is a single tab stop moved
  through with the arrow keys, its groups opening and closing from a mark at
  the end of their rows, and it opens wide enough for its entries with the
  selected one in view.

- **A navigation to hide or resize.** A `navigation` toggle among the default
  shell's views hides it, and the address keeps it hidden. Dragging the divider, or its
  arrow keys, resizes it a column at a time; it keeps its width when the
  window resizes.

- **An html pane in the preview.** A kit that builds html sees it rendered
  beside the scripted panes, toggled with them, in the kit's theme and
  frame. It shows the markup a story's props and content produce, following
  scenario picks and edits during development; the static build shows the
  scenarios printed at build time. The pane runs no behavior, as html output
  ships none.

- **Descriptions in the preview.** A story file's scenario can carry a
  `description`, and the catalog carries it beside the component's own
  description from its template, so a shell can show both. The default shell
  shows them under the stage's bar.

- **`@scaffold-ui-kit/preview`, a preview for a kit.** It renders every
  component of a kit side by side in each framework the kit targets, each in
  its own iframe, with controls from the template's props, curated and
  generated scenarios, and an editor for composing a component's slot content.
  A component with a default slot shows its name there until its story file fills
  it, unless the slot exposes values, whose fallback shows; the story's
  printed code leaves such a slot empty. A kit configures
  it in the `preview` block of its configuration (themes, options, the frame
  around each story, custom views), and curates each story
  in a story file. `scaffold-ui-kit-preview dev`, `build`, `generate` and `check`
  (which compares the story files with the components, accepts a native attribute
  such as `aria-label` or `class` beside the props of a component that
  forwards them through `passthrough` or `rest`, and refuses an element fill
  that sets `slots.default` rather than `children`, a scenario key it does not
  know, an `html` fill giving a void element such as `img` children, and a
  scripted target or an `add.shared` `specifier` of the kit's own package
  that its `package.json` does not export). `check` also reports what
  `scaffold-ui-kit build` reports for each template in the kit's
  `src/components/`, by the kit's own installed scaffolder and without
  writing any output, each line naming the template's path: a template the
  build refuses is an error, and a build warning stays a warning under
  `--strict`. It covers validating and rendering the templates; a driver
  colliding with a generated file and the stylesheets compiled under
  `stylesheetLink: 'both'` are reported by the build alone. A story spells
  such an attribute as HTML does; React takes it as React spells it, in the pane and the printed
  code (`class` as `className`, a `style` string as a style object, `tabindex`
  as `tabIndex`, `for` as `htmlFor`), unless the component declares a prop by
  that name; an `html` fill's attributes are spelled the same way. `check`
  names the HTML spelling of an unknown prop that is React's spelling of an
  attribute the component takes: `autocomplete` for `autoComplete`. A `raw`
  fill's Vue markup reads the kit components its `imports` names as values as
  well as tags (`:as="Button"`), as a single-file component's imports are.
  `build` clears `.preview-static` first, so a build that fails leaves no
  earlier output behind, and runs the check before building: an error it finds
  stops the build, printed, with a non-zero exit. A union of booleans and
  string literals, such as `boolean | 'indeterminate'`, gets a select of
  `true`, `false` and the literals, which the address keeps as the values they
  are. A prop whose name ends in `color`, in any case, gets a select of the
  kit's `controlHints.colorTokens` when it gives any, and otherwise a
  control from its declared type like any other prop; `propTypeForProp` takes
  those hints as its fourth argument and gives the color select only when they
  hold a token. `storySource` prints a story for a kit's docs as consumer
  code per framework, breaking an array or object prop too long for its line
  over several lines, and as `html`: the markup the story renders to at rest,
  components it references rendered inline and the kit's shared helpers in
  scope. A component written by hand renders as the kit maps it in
  `handWrittenComponents`, inside a comment saying its behavior is not
  included, and per-framework slot content renders its `html`, given as markup
  or as template nodes that compose the kit's components; a story with
  anything else that has no markup gets no `html`. An expression the markup
  cannot evaluate at rest, such as one reading the component's script state,
  is left out, and its evaluation warning is returned in `htmlWarnings`;
  `build` prints them once per story, and the html pane counts them in its
  legend, as the html code pane does beside its note, each count a button
  opening the warnings in a popover, where they can be selected and copied. In the build's output and the panes, the
  expressions one component cannot evaluate for one reason, such as several
  reading a per-instance id its script generates, are one warning counting
  them. A scoped slot's or a part's React body of two or more sibling roots,
  or of text such as `{item}`, is printed in a fragment, as the React pane
  renders it; Vue and Svelte take the body as it is. Printed content keeps
  the whitespace the story gives it: React prints it as `{' '}` at a line's
  edge, which JSX would otherwise drop, and Vue and Svelte keep siblings that
  touch on one line, where a line break would read as a space. Text is
  escaped as each template reads it. See its README.
- **Shells for the preview's interface.** The interface around the panes is
  a shell, named by the required `preview.shell`: a package
  specifier or a module in the kit. A shell is
  `defineShell({ apiVersion, options, mount })` from
  `@scaffold-ui-kit/preview/shell`, written in React, Vue, Svelte or plain
  DOM, and it reads and drives the preview through a controller: the
  catalog, the state with `subscribe`, actions such as `select` and
  `setOption`, the scenario editor's tree and operations (`createNode`,
  `move`, `moveBy`, `resolveDrop`, and `nodeSlots` for a node's slots), the
  story's props (`state.props`, `setProps`), and `frames.mount`, `mountView`
  and `mountStory`, which place the iframes the preview owns; `mountStory`
  shows any story apart from the selection, so a shell can lay out every
  scenario at once. Each prop in the catalog carries its declared type,
  whether it is required and its template default. Each pane reports its
  content size, so a shell can size a pane to its story. `state.code`
  holds the code of the selected story per target, as a consumer writes it
  in React, Vue and Svelte, and its html, following the scenario, the props
  and the editor's tree; `printStorySource(catalog, story)` prints any
  story's. A shell's own options are kept as `shell.<id>`, may be built from
  the catalog, and never reach the panes.
  `@scaffold-ui-kit/preview/react` adds `usePreview(controller, selector)`,
  and `previewStore(controller, selector?)` gives the state as a Svelte
  store. During `dev`, an edited shell remounts over the same selection and
  editor tree, and an edited template, story file, theme or configuration
  module regenerates the preview.
- **A shell's page.** What the host page holds before the shell has loaded
  is the shell's as well: a page module, evaluated in Node, default-exports
  `defineShellPage({ head, root })`, markup for the page's head and for its
  root element, which mounting empties. A function is given `asset(file)`
  for the files its markup references, served from where they are in `dev`
  and copied into the static build. A shell named as a package specifier
  brings the page its package exports at the specifier followed by `/page`,
  and `preview.shell` takes `{ module, page }` to name one. The charcell
  shell's page paints its dark ground, preloads its face and says `loading`
  in it on a whole cell; a kit module that configures the charcell shell
  names that page, `@scaffold-ui-kit/preview/shells/charcell/page`, and the
  preview warns of one that names none. `check` loads the page as `dev` and
  `build` do.
- **The charcell shell**, `@scaffold-ui-kit/preview/shells/charcell`, draws
  the preview in charcell's terminal look. `charcellShell({ slots, groups })`
  fills its `top-bar-end`, `stage-bar-end`, `status-bar`, `scenario-end`,
  `output-end`, `code-end` and `events-end` slots with
  framework-neutral `(element, controller) => unmount` fills (`reactFill`
  wraps a React render function) and places option groups in its bars. Its
  panes sit in a grid that resizes both ways: turning a target off gives its
  width to the remaining targets in proportion to theirs, turning it back on
  returns it at the width it had, and a double-click on a split handle, or
  Enter while it has the focus, puts the split back where it started. Its
  `code` toggle adds the
  story's source under each pane, or its html under the html pane. `charcell` and `@zag-js/react` are optional peers of the
  preview, needed only by this shell: `check`, `build` and `dev` name either
  one a kit naming the shell has not installed, before anything is bundled.
  The static build leaves the shell's host page out of its warning of a
  bundled file over 500 kB, since a kit cannot make it smaller, and names any
  other file over that size.
- **Preview options say what they mean.** An option's kind follows from its
  fields: with `values` it is a choice, without a boolean. `group` is a
  placement hint a shell reads, `kit` for the kit's own settings or a name of
  the kit's choosing, and `scope` makes an option global or per story. A key
  an option, one of its values or its `apply` does not take, such as a
  `description` where an option takes `title`, is an error in `check`,
  `generate`, `build` and `dev`.
- **A story file's keys are checked.** A key a story file does not take is an
  error in `check`, `generate`, `build` and `dev`, named with the keys it
  takes, as a scenario's is. An unknown key in a story file, the `preview`
  block or a source says what to use instead where one key is meant.
- **Custom views in any framework.** A view is
  `mount(element, context, updates)` with a `framework` (`react`, `vue`,
  `svelte`, or `dom` by default), whose setup module the view's iframe loads;
  `updates.subscribe` delivers each new context to a mounted view, and
  `reactView(render)` makes a React view from a render function.
- **A landing entry.** `preview.landing` names the entry the
  preview opens on when its address names none: a view
  (`{ "view": "foundations" }`) or a story on one of its scenarios
  (`{ "component": "components-button", "scenario": "ghost" }`). Without it,
  the preview opens on the first story the navigation lists. `check` and
  `generate` fail on a story or scenario the kit has none of, and the
  catalog carries the entry as `landing`. A view the kit does not register,
  or the `empty` scenario in the static build, opens the first story or the
  story's starting scenario instead, with a warning in the console.
- **Links into the preview.** The selection, the scenario, props and
  targets changed from the story's own, and every option set away from
  its default live in the address as query parameters, so a link opens the
  preview as it was, on the dev server and the static build. Parameters, the
  path and the hash the preview does not own are kept. The static build
  works from any directory of a file server, and `dev --host` opens the dev
  server to other devices on the network.
  `preview.persistence: 'url-and-local-storage'` also remembers
  the global option values in the browser. A `props=` link holds the props
  that differ from the scenario's, so a story whose props hold a lot of
  data keeps a short link: a prop it leaves out takes the scenario's value,
  the story file's `defaultProps` beneath it. A prop of the scenario's removed
  from the story is written as `null`, which a link reads as left out.
- **`@scaffold-ui-kit/preview/testing`** drives a story from a browser test:
  `openStory(page, { target, id, props })` loads one framework's preview page
  and mounts the story, and `setProps`, `setOptions`, `setStory`,
  `mountStory` and `settle` act on it. It takes a Playwright `Page`, or any
  object of the same shape, without depending on Playwright.
- **`initialize` sets up the preview.** It adds a `preview` block naming
  the charcell shell, the kit's themes, options and name prefix, a stories directory,
  the preview with its shell's peers as dev dependencies, `preview` and
  `preview:build` scripts that build the kit first, since the scripted panes
  show the built components, and an `exports` entry per scripted target. It
  asks whether to, and `--preview` or `--no-preview` answers without a prompt;
  a non-interactive run sets it up unless `--no-preview` is passed.
- **`scaffold-ui-kit initialize`**, the spelled-out name of the command that
  scaffolds a kit. It is still the default command, so
  `npx scaffold-ui-kit my-ui-kit` is unchanged. The programmatic exports are
  `initializeCommand` and `InitializeCommandOptions`.
- **One build, linked and unlinked components.** `stylesheetLink: 'both'`
  publishes each scripted target's components linked and unlinked, and a
  consumer picks between them at import time. The components render once,
  linking nothing. `dist/<target>/index.ts` exports a linked module per
  component, which imports the compiled stylesheet of the component and of
  every component it renders, the composed ones first.
  `dist/<target>/unlinked/index.ts` exports the components as they are, for a
  consumer that loads the kit's styles as one bundle. Each linked module
  declares the component's runtime exports itself rather than passing them
  through, so a bundler honoring the kit's `sideEffects` keeps the linked
  module, and its stylesheets, exactly when the component is used. An `scss`
  kit's sheets are compiled with sass against `loadPaths`, so neither export
  needs sass on the consumer's side. The `html` target's pages link their
  compiled stylesheet. Requires `stylesheetPlacement: 'separate-file'`.
- **`compiledStylesheetDirectory`.** A sheet that compiles to the same CSS on
  every target is written once, to `dist/stylesheets` by default or to the
  directory this key names, and every target links that copy; a sheet that
  differs between targets keeps a copy beside each target's linked modules.
  Naming the directory lets the linked modules link per-component sheets the
  kit already publishes. The key applies to an `scss` kit, whose sheets are
  compiled: a `css` kit's linked modules link each sheet beside its
  component, and the build refuses the key there rather than ignore it.
- **The consumer CLI is its own package, `@scaffold-ui-kit/add`.** A kit's
  `bin/add.mjs` is now a short shim that runs it with the kit's root, and the
  kit depends on `@scaffold-ui-kit/add` at the scaffolder's range.
  `initialize` writes both, and `build` keeps them current, so a kit carrying the previous
  full copy of the CLI moves to the shim on its next build. `build` sets the
  dependency only when the kit has none or its range leaves out the current
  version, keeps an exact version and a `file:`, `link:` or `workspace:` spec
  as the kit wrote it, and prints what it changed; when it adds the
  dependency, it tells you to run your package manager's install before the
  kit's add command.
- **`add` names the packages a copied stylesheet loads.** The install line now
  covers each `pkg:` URL a copied stylesheet, shared module or Vue/Svelte style
  block loads (`@use "pkg:hard-reset"` names `hard-reset`), at the kit's
  range, and notes that sass resolves them through `NodePackageImporter`.
- **An index of each target's SCSS sheets.** A build that emits SCSS sheets
  (`separate-file`) also writes `dist/<target>/_index.scss`, a sorted `@use`
  of every component sheet of that target, so a kit stylesheet that takes
  them all writes `@use "<path to dist>/react";` and the list follows the
  components. `add` never copies it.
- **`diagnoseKit`.** The scaffolder exports `diagnoseKit(kitDirectory)`,
  which reports the errors and warnings `build` would print for a kit's
  components, each a line naming the template's path, and writes no
  output.
- **`build` reports the Svelte compiler's warnings.** For a kit with the
  `svelte` target and Svelte 5 or later installed, `build` (and so
  `diagnoseKit` and `preview check`) compiles each generated Svelte
  component with the kit's own Svelte, in the kit's `svelte.mode`, and
  prints each compiler warning, such as an `a11y_` one, with its code and
  its line and column in the emitted file, named in the target's package
  under `packages`. A `svelte-ignore` comment the
  template emits through `extensions.svelte.ignore` silences it. The
  warnings never fail the build; a component the compiler cannot compile is
  an error, which exits non-zero and leaves the file written so it can be
  read. A kit without Svelte installed gets no check.
- **A Tailwind kit's examples are styled with utilities.** `initialize`
  writes the example components of a kit styled with Tailwind with utility
  classes and no style block, so they render the same in every target and
  pass the README's parity example as scaffolded.
- **The license ships with each package.** `scaffold-ui-kit`,
  `@scaffold-ui-kit/add`, `@scaffold-ui-kit/preview`,
  `@scaffold-ui-kit/helpers` and `@scaffold-ui-kit/testing` include their
  MIT `LICENSE` file.
- **`add --stylesheet-link component|none`.** `add` links each copied
  component to the stylesheet copied beside it, in the form and at the place
  the build puts the link, or copies it unlinked under `none`, whichever way
  the kit was built. A component's stylesheet is copied with it even when no
  import leads to it.

### Changed

- A scaffolded kit's `typescript` range is `^5.8.0`, the release the
  `@scaffold-ui-kit/testing` consumer preset's compiler options need.
- **The `svelte` target needs Svelte 5 in both modes.** A legacy component
  whose root tag may vary and that handles an event with a key guard writes a
  typed arrow in its markup, which Svelte 4 does not compile.
- **A new kit is written the way the README recommends.** `initialize` sets
  `stylesheetPlacement: 'separate-file'` and `stylesheetLink: 'both'`, and
  exports each target's unlinked components, with the stylesheets in
  `sideEffects`, so a first build has one stylesheet per component and no
  warning. A kit styled with Tailwind classes
  has no stylesheets to link and gets neither. `initialize` no longer writes
  `./stylesheets/*.css`, or for a Tailwind kit `./react/*.css`, exports that
  led to no files.
- **The example Button is a real button.** It forwards a consumer's
  attributes and listeners through `passthrough`, and no longer logs to the
  console.
- **The kit configuration is `scaffold-ui-kit.ts` or `scaffold-ui-kit.json`.**
  `scaffold-ui-kit.config.json` is still read, with a warning naming the
  file to move to. Rename it to `scaffold-ui-kit.json` as it is, or write it
  as `scaffold-ui-kit.ts`. A new kit's `package.json` no longer lists the
  configuration in `files`: `add` reads the kit manifest.
- **An unknown configuration key fails the build.** A key
  the kit configuration does not take, at the top level or inside
  `add`, an `add.shared` entry or the object form of `stylingLayer`, is
  reported with its path and the keys allowed there, as in `unknown key
'svelteModes'; the configuration takes name, targets, ...`. A misspelled key
  used to be ignored without a word. In a kit still configured in
  `scaffold-ui-kit.config.json`, an unknown top-level key is a warning and
  ignored, as before, so a 2.2.1 kit with an extra key keeps building;
  `$schema` is taken in any configuration. The preview checks its own block: its
  `check`, `build` and `dev` stop on a key `preview` or an object inside it,
  such as a source or `codeBlock`, does not take, in the same words
  (`unknown key 'preview.sources[0].storyDirectory'; a source takes id,
label, ...`).
- **`build` reports each problem once.** A template is validated once,
  before any target renders it: one that breaks the format's rules is
  reported once, every violation on its own line with its path, and rendered
  for no target. Warnings and errors from rendering are printed once all
  targets have run, each once: one every target reports with the template's
  path alone, and one only some targets report labeled with them, as in
  `src/components/Panel.ts (vue): warning: ...`.
- **Props types in the barrel.** A React or Vue component exports its props
  interface, so a kit's barrel carries it:
  `import type { ButtonProps } from 'my-ui-kit/react'`.
- **`add` links a copied component's stylesheet by default.** A copy from a kit
  built with `stylesheetLink: 'none'` now arrives linked; pass
  `--stylesheet-link none` for the previous copy.
- **The `html` target is an annotated reference with no script.** Each
  `dist/html` page writes everything plain HTML cannot express - slots,
  child components, events, conditional classes - as a comment where it
  sits, instead of dropping it or emitting a script.
- **The example components describe themselves with `description`.** The
  scaffolded `Button` and `Card` describe the component and its props in the
  template's `description` fields, which reach a consumer's editor as doc
  comments in every scripted target. A kit's README points to the
  js-template-engine getting-started guide for the template format. The
  example `Button`'s click handler types its event, so the generated
  components type-check under `strict` in React, Vue and Svelte.
- **The preview takes a shared module's specifier from `exports`.** It
  evaluates the `add.shared` code modules the kit's `package.json` exports,
  by the specifier the export gives, and still reads a `specifier` an older
  configuration names.
- **A kit's `add` needs Node 22.** `@scaffold-ui-kit/add`, which a kit's
  `bin/add.mjs` now runs, `@scaffold-ui-kit/preview` and `scaffold-ui-kit`
  itself declare `"node": ">=22"`.

### Deprecated

- **`scaffold-ui-kit.config.json`.** It is read, with a warning, until 3.0.0.
  The `configurationFileName` export, the old name, goes with it.
- **The `init` command**, now an alias of `initialize`, and the
  `initCommand` and `InitCommandOptions` exports. They keep working, the
  command printing a warning when run, and will be removed in 3.0.0.
- **The `scriptingStrategy` and `scriptingLanguage` keys.** They have no
  effect, since no target's output contains a script, and a build that sets
  either prints a warning. They will be removed in 3.0.0.
- **The flat extension keys and `stylingStrategy`.** `bemElementSeparator`,
  `bemModifierSeparator`, `bemMode`, `bemImportSource`, `tailwindOutput`,
  `tailwindDarkSelector`, `tailwindConvertStyles` and `svelteMode` are read
  into the `bem`, `tailwind` and `svelte` blocks, and `stylingStrategy` as
  `stylesheetPlacement`, each with a build warning naming the key to move
  to. Setting an option under both spellings is an error. They will be
  removed in 3.0.0.
- **An `add.shared` entry's `destination` and `specifier`.** A consumer's
  settings place a shared module, and its specifier comes from the kit's
  `exports`.
  A build that sets either prints a warning; they will be removed in
  3.0.0.

### Fixed

- **A new kit's first `pnpm install` failed under pnpm 11 and later.** The
  scaffold writes a `pnpm-workspace.yaml` that allows the `esbuild` and
  `@parcel/watcher` install scripts, so the install finishes without
  `ERR_PNPM_IGNORED_BUILDS`. npm doesn't read the file, and the kit doesn't
  publish it. A kit created inside an existing pnpm workspace gets no such
  file, and that workspace's own allow-list applies.
- **Two templates with one component name built as one.** The second
  overwrote the first's files without a word, and each index named the
  component twice. `build` now fails on a component name another template
  has, or one that differs from another's only by case, since the two write
  the same files where file names ignore case.
- **A kit's first screen was empty.** The example Button and Card now default
  their `label` and `title`, so a fresh kit's components show text without a
  story file.
- **The build did not say when it skipped the Svelte compile check.** A kit
  with a Svelte target and no Svelte 5 or later installed now gets a note
  saying the components were not compile-checked.
- **`add <name> --force` replaced the files of components it was not named
  for.** It replaces the named components' own files, with the helpers they
  reach and the parts a named root brings; a dependency or shared file that
  differs from what the kit writes is kept and named in the output, and the
  copies import that file. When a named component had no file where the run
  writes, `add` says that `--force` replaced nothing there.
- **`add initialize --yes` chose the kit's first target over the project's
  framework.** The default is now the one target your `package.json` lists
  (`react`, `vue` or `svelte`), or the first target when none or several match.
- **Under `packages`, a relative import leading to no file in its package
  built without complaint** and failed in the consumer's bundler. It now
  fails the build, naming the file and the import, and for a stylesheet
  the build moved into the styles package, what to do instead.
- **A kit with the `react` target had no `jsx` in its `tsconfig.json`.**
  `initialize` sets `react-jsx`.
- **A kit configuration without `styling` failed the build.** It builds with
  no styling extension applied.
- **`build` left the output of a deleted template behind**, and `add` went on
  offering it. Each build now removes the files the previous build wrote and
  this one did not, in every target: a deleted template or driver, a target
  dropped from the configuration. It knows its own files from a record it
  keeps in `node_modules/.cache/scaffold-ui-kit/build-record.json`, outside
  the published package, so a file the kit put in `dist/` itself stays, as
  does a built file changed since, with a warning. A build that fails removes
  nothing: a component that failed keeps its last good files, and the
  `index.ts` barrels and `_index.scss` keep naming them beside the
  components the build made, with a warning. The first build after updating
  writes the record; remove `dist/` once to clear output left from before
  it. Under `packages`, a directory the build no longer writes into, such as
  a dropped target's package, is left in place with a warning naming it and
  how many files the last build wrote there.
- **A driver at a path the build writes was overwritten.** A hand-written
  driver named `index.ts` or `_index.scss`, or under `stylesheetLink:
  'both'` named `unlinked/index.ts` or placed under `linked/`, was copied
  into `dist/<target>` and then replaced by the file the build writes there,
  without a word. Such a driver now fails the build with an error naming
  what it collides with; rename it.
- **`add` rejected a component's kebab-case name.** `npx <kit> add
text-input` now copies `TextInput`, as `add TextInput` does: a request
  matches the kebab-case name of the template file too.
- **`add` warned about a React client component's stylesheet link.** A
  component that starts with `'use client';` was reported as linking its
  stylesheet somewhere the build does not put the link, and
  `--stylesheet-link` left it as it was. The link is now found after the
  directive, and added or removed there.

## [2.2.1] - 2026-09-10

A patch release on js-template-engine 2.2.1, which keeps the capital letters in
a CSS custom property name (`--kit-component--Badge--size` was serialized as
`--kit-component---badge--size`). A kit picks the fix up on its next build.

## [2.2.0] - 2026-09-09

A minor release on js-template-engine 2.2.0. Existing kits build unchanged;
every new configuration key has a default that keeps the previous output.

### Added

- **Svelte runes mode.** `svelteMode: 'runes'` builds the Svelte target as
  Svelte 5 runes components (`$props()`, snippets, event attributes). The
  default, `legacy`, keeps the classic dialect.
- **Stylesheet link and cascade layer.** `stylesheetLink: 'none'` emits each
  component's separate stylesheet without importing or linking it, for a kit
  that aggregates its styles itself. `stylingLayer` (a layer name, or
  `{ "name": "...", "order": ["..."] }`) wraps emitted rules in a cascade
  layer and declares the layer order ahead of them.
- **`add` copies a component's dependency closure.** `add` walks a component's
  relative imports, including side-effect and dynamic imports and a
  stylesheet's `@use`, `@forward`, and `@import`, and copies everything they
  reach with subdirectories preserved, so a component composed from others
  lands with every file it needs. A file already present is kept; only a file
  asked for by name prompts before overwriting.
- **Shared layers and notes.** An optional `add` block in
  `scaffold-ui-kit.config.json` declares `shared` layers (`source`, optional
  `destination`, `specifier`, and `exclude`) copied once beside the components,
  with imports of the specifier rewritten to the relative path of the copy, and
  `notes` printed after a successful add. `add` then lists the packages the
  copied files import, with the kit's own version ranges, minus what the
  consumer already has, and warns about an import of the kit's own package that
  no shared entry covers. `--list` shows what each target's barrel exports.

### Fixed

- **Barrels carry a component's full module surface.** A generated component's
  barrel entry re-exported only its value, so an `export type` a template
  declares was missing from `import { Table, type TableColumn } from
  '<kit>/react'`. Barrels now re-export the whole module, and an SFC driver's
  component is importable from the barrel as well.
- **`build` refreshes the consumer CLI** from the installed scaffold-ui-kit on
  every run, and fails early on a shared source that does not exist. A kit
  that does not build the html target leaves it out of the consumer CLI's
  listing instead of hiding it.

## [2.1.0] - 2026-06-28

scaffold-ui-kit now lives in its own repository, presented as a project built on
[js-template-engine](https://www.npmjs.com/package/js-template-engine). The
package name, the `npx scaffold-ui-kit` command, and the published versions are
unchanged; the version line continues from the 2.x it shipped on.

### Added

- **Hand-written drivers.** Components needing behavior a template cannot express
  (local state, an effect, a headless library) are authored per target under
  `src/drivers/<target>/`. `build` copies each driver into `dist/<target>/` and
  the target barrel re-exports it beside the generated components.
- **Runtime BEM.** `bemMode: 'runtime'` renders BEM classes as `use-bem` calls
  rather than static class strings.
- **SCSS load paths.** Under `scss`, `loadPaths` lets a kit author SCSS helpers
  (mixins, functions, `$variables`) and still emit any styling strategy, the
  engine resolving them to plain CSS at build.

## [2.0.0] - 2026-06-15

### Added

- **Scaffold a kit.** `scaffold-ui-kit init` creates an npm package with a single
  source of truth in `src/components/`, asking for the render targets (`react`,
  `vue`, `svelte`, `html`), the styling extensions (`bem`, `tailwind`, or none),
  and whether to include example components. Every prompt has a matching flag for
  non-interactive use.
- **Build per target.** `scaffold-ui-kit build` renders every template once per
  configured target into `dist/<target>/`, with a per-target barrel that
  re-exports the generated components. Targets, styling, and output strategies
  live in `scaffold-ui-kit.config.json`.
- **Styling configuration.** `stylingStrategy`, `scriptingStrategy`,
  `stylingLanguage` (`css` or `scss`), and `scriptingLanguage` map onto the
  engine's output strategies. Under `scss`, styles are emitted as pass-through
  SCSS.
- **BEM and Tailwind.** Configured BEM and Tailwind extensions contribute classes
  to every target. `tailwindOutput: 'styles'` converts utilities to CSS at build
  time, and `tailwindConvertStyles` converts authored CSS into utility classes.
- **Consume without the engine.** A published kit ships its built `dist/` and a
  consumer CLI: `npx <kit> add <component> --target <target>` copies the built
  files into a project with no engine dependency. Kits also work as regular
  packages through their per-target barrels.
