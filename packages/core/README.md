# scaffold-ui-kit

Scaffold framework-agnostic UI kits powered by
[js-template-engine](https://www.npmjs.com/package/js-template-engine):
define components once as typed data templates and build them for React,
Vue, Svelte, and annotated reference HTML - with BEM and Tailwind styling as
configurable extensions.

A kit created by scaffold-ui-kit is an npm package with a single source of
truth in `src/components/`, built output per target in `dist/<target>/`,
and a consumer CLI that copies built components into consuming projects -
no engine dependency ever reaches a consumer.

## Create a kit

```bash
npx scaffold-ui-kit my-ui-kit
cd my-ui-kit
npm install
npm run preview   # builds the kit and serves it; npm run build without the preview
```

The first command runs `initialize`, the default command. It asks for the
targets (`react`, `vue`, `svelte`, `html`), the styling extensions (`bem`, `tailwind`, or none), whether to include the
example components, and whether to set up the preview. Every choice can also
be passed as a flag for non-interactive use:

```bash
npx scaffold-ui-kit initialize my-ui-kit --targets react,vue --styling bem --no-examples
```

The `html` target builds annotated reference markup, not pages to paste:
`dist/html/Button.html` keeps its expressions (`{{ label }}`) and writes loops
and events as comments. For HTML to copy, open the preview's `code` view on a
story, which prints that story's markup with its values filled in.

A non-interactive run sets up the preview unless `--no-preview` is passed.

The preview is [@scaffold-ui-kit/preview](https://www.npmjs.com/package/@scaffold-ui-kit/preview),
which shows every component in each target, inside a shell (the interface
around them, charcell's here). Setting it up adds to the kit:

- a `preview` block in `scaffold-ui-kit.ts`, naming the charcell shell
  (`@scaffold-ui-kit/preview/shells/charcell`) and the kit's components as
  the preview's first source, with the kit's themes, its options and the
  prefix for the names the preview sets in each frame, and
  `preview/stories/` for story files, each of which curates what one
  component shows: its default props and its scenarios, the named states the
  preview lists under it;
- `@scaffold-ui-kit/preview`, `charcell` and `@zag-js/react` as dev
  dependencies, and a `preview` script (`scaffold-ui-kit-preview dev`) and
  a `preview:build` script (`scaffold-ui-kit-preview build`), each of which
  builds the kit first;
- with `--styling tailwind`, a Tailwind build the preview loads as the kit's
  theme: `tailwindcss` and `@tailwindcss/cli` as dev dependencies,
  `preview/tailwind.css` naming the built components and the story files as
  sources, a `preview:css` script that compiles it into
  `preview/tailwind.generated.css`, which the `preview` and `preview:build`
  scripts run after building the kit, and that file as the first entry of
  the preview block's `themes`.
  Run `npm run preview:css` before running `scaffold-ui-kit-preview generate`
  or `build` directly, so the theme they copy exists.

With or without the preview, `initialize` writes the kit's `exports`: per
scripted target (`react`, `vue` and `svelte`, the targets that build
components, where `html` builds reference markup) its barrel (`./vue`), through which the preview and package
consumers import the built components, and each of its component files, so a
consumer who copies only part of a component imports the rest from the kit.
Unless the kit is styled with Tailwind classes, `initialize` also sets
`stylesheetPlacement: 'separate-file'` and `stylesheetLink: 'both'`,
exports each target's unlinked components and its stylesheets, and lists the
stylesheets in `sideEffects` so a bundler keeps only those of the components
a consumer imports. A linked component imports its own stylesheet and an
unlinked one leaves loading it to the consumer (see
[Linked and unlinked components](#linked-and-unlinked-components)).

`npm run preview` builds the kit and serves it. The target panes show
the built components, so after changing a template while it runs, run
`npm run build` again.

A kit with the `svelte` target builds in Svelte's legacy mode (`export let`,
`<slot>`), which `initialize` leaves as the default. Set `svelte: { mode:
'runes' }` in the kit configuration for runes output. Both modes need Svelte 5.

A kit styled with Tailwind also gets an `add.notes` line, which tells a
consumer to make sure their Tailwind build scans the directory `add` copies
components into, and example components styled with utilities alone, with no
style block.

Each scripted target's framework goes under `peerDependencies`, at the range
its generated components need: `"react": "^19.0.0"`, `"vue": "^3.5.0"`,
`"svelte": "^5.0.0"`. Each is optional when the kit has several scripted
targets, through `peerDependenciesMeta`, since a consumer uses one of them.
The same ranges go under `devDependencies`, for the kit's own build. `add`
prints the range to a consumer whose `package.json` doesn't list the
framework yet.

### Next steps

1. Add a component: a template in `src/components/`, as
   [Define components](#define-components) shows, then `npm run build`. A kit
   has no need of the `js-template-engine` commands the getting-started guide
   opens with; `npm run build` does their work.
2. Give it a story, `preview/stories/<Name>.story.ts`, for its default props
   and named states. A required prop needs a value there, or the component
   renders without it. The
   [preview README](https://www.npmjs.com/package/@scaffold-ui-kit/preview)
   has the format, under "Story files".
3. Add tests, if you want them: [Testing and helpers](#testing-and-helpers).
4. Try `add` in a project of yours, from a tarball, before publishing:
   [Publish and consume](#publish-and-consume).
5. Run `npm publish`.

### Adding a target later

1. Add the target to `targets` in the kit configuration.
2. Add its `exports` entries to `package.json`; `initialize` writes these
   only for the targets chosen then. For a scripted target that is the barrel
   and its component files:

   ```json
   "./vue": "./dist/vue/index.ts",
   "./vue/unlinked": "./dist/vue/unlinked/index.ts",
   "./vue/unlinked/*": "./dist/vue/*",
   "./vue/*": "./dist/vue/linked/*.ts",
   "./vue/*.css": "./dist/vue/*.css",
   ```

   For `react` the unlinked component files are
   `"./react/unlinked/*": "./dist/react/*.tsx"`. A kit styled with Tailwind
   classes has no stylesheets to link, and writes only the barrel and
   `"./vue/*": "./dist/vue/*"`, or `"./react/*": "./dist/react/*.tsx"`.
   Under the `partial`
   ownership `initialize` writes, where a consumer can leave a piece such as
   a stylesheet in the package and import it from there, a built piece no export reaches fails the
   build, naming the export to add; `scaffold-ui-kit-preview check` reports
   a scripted target without its barrel.
3. Add its framework under `peerDependencies` and `devDependencies`:
   `"react": "^19.0.0"`, `"vue": "^3.5.0"` or `"svelte": "^5.0.0"`
   (`"^5.20.0"` in runes mode). Mark each peer optional under
   `peerDependenciesMeta` when the kit has several scripted targets.
4. Run `npm run build`, which writes `dist/<target>/`.

Dropping a target is step 1 alone: the next build removes its output. In a
kit built into [one package per target](#one-package-per-target), drop the
target from `packages` too; the build then leaves that package's files in
place, with a warning, since the package may be published on its own.

## Define components

Components are data templates in `src/components/` - TypeScript modules
default-exporting a template (with full autocompletion via
`defineTemplate`), or plain JSON:

<!-- example: scaffold-button -->
```ts
import { defineTemplate } from '@js-template-engine/types';

export default defineTemplate({
  type: 'component',
  name: 'Button',
  props: {
    label: { type: 'string', required: true },
    variant: { type: "'primary' | 'secondary'", default: 'primary' },
  },
  children: [
    {
      type: 'element',
      tag: 'button',
      passthrough: true,
      attributes: { class: ['button'], type: 'button' },
      conditionalAttributes: [
        {
          condition: "variant === 'secondary'",
          attributes: { class: ['button--secondary'] },
        },
      ],
      children: [{ type: 'text', expression: 'label' }],
    },
  ],
});
```

`passthrough` makes the button the component's root surface, so a consumer's
`disabled`, class and click handler land on it. The
[getting-started guide](https://github.com/djurnamn/js-template-engine/blob/main/documentation/getting-started.md)
covers the template format, and its "Coming from React" table maps what you
would reach for there to the format's names.

A type the kit's consumers use is declared on an `imports` line, which each
scripted target's file emits as written; the target's barrel re-exports it. A value
every instance shares, such as an id counter or a context, goes in a module of
the kit that an `imports` line imports, since Vue and Svelte run a component's
script once per instance. List that module under `add.shared` (see
[Publish and consume](#publish-and-consume)) so `add` copies it too:

<!-- example: scaffold-imports -->
```ts
imports: [
  "export type ButtonVariant = 'primary' | 'secondary';",
  "import { nextId } from 'my-ui-kit/scripts';",
],
```

## Build

```bash
npm run build   # runs scaffold-ui-kit build
```

`build` renders every template once per configured target:

```
dist/
├── react/
│   ├── Button.tsx
│   ├── Card.tsx
│   └── index.ts
├── vue/
│   ├── Button.vue
│   ├── Card.vue
│   └── index.ts
├── svelte/
│   ├── Button.svelte
│   ├── Card.svelte
│   └── index.ts
├── html/
│   ├── Button.html
│   └── Card.html
└── scaffold-ui-kit-manifest.json
```

The manifest describes the build for the kit's consumer command (see
[The kit manifest](#the-kit-manifest)).

Each template is validated once, before any target renders it: a template
that breaks the format's rules is reported once, every violation on its own
line with its path, and rendered for no target. It is validated for every
scripted target, whichever the kit builds: a name the React, Vue or Svelte
output declares itself (Vue's `useAttrs`, React's `props`) cannot name a
prop, slot or binding, so a component stays buildable for every target, and
each target's own override checks run. Warnings and errors from
rendering are printed once the targets have run, each once: a message every
target reports carries the template's path alone, and one only some targets
report names them, as in `src/components/Panel.ts (vue): warning: ...`.

A kit with the `svelte` target that has Svelte 5 or later installed also
gets the Svelte compiler's warnings for each generated Svelte component,
compiled with the kit's own Svelte in its `svelte.mode`: each names the
warning's code and its place in the emitted file, as in
`src/components/Slider.ts (svelte): warning: a11y_no_static_element_interactions: ... (at dist/svelte/Slider.svelte:12:3)`.
A template silences one it cannot avoid with the Svelte extension's
`ignore`, which emits a `svelte-ignore` comment. The compiler's warnings
never fail the build. A component it cannot compile is an error, as in
`src/components/Slider.ts (svelte): error: js_parse_error: ... (at dist/svelte/Slider.svelte:4:10)`:
the build exits non-zero and leaves the file written, so you can read what
failed. A kit without Svelte 5 or later installed is not checked, and the
build prints a note saying so.

Each build also removes what the previous build wrote and this one did not -
the output of a deleted template or driver, or of a target dropped from the
configuration. In a kit built into packages, a directory the build no longer
writes into, such as a dropped target's package, is left as it is, with a
warning. It tells its own files by a record it keeps in
`node_modules/.cache/scaffold-ui-kit/build-record.json`, so files a kit puts in `dist/` itself are
left alone, and so is a built file edited since. A build that fails removes
nothing, so a component that failed keeps its last good files, and the
`index.ts` barrels and `_index.scss` keep naming them beside every component
this build made, with a warning, as long as those files are there.

Configured styling extensions (BEM, Tailwind) contribute their classes to
every target's output. Targets, styling and the stylesheet placement live in
the kit configuration, `scaffold-ui-kit.ts`, which `initialize` writes:

<!-- example: scaffold-configuration -->
```ts
import { defineKit } from 'scaffold-ui-kit';

export default defineKit({
  name: 'my-ui-kit',
  targets: ['react', 'vue', 'svelte', 'html'],
  styling: ['bem'],
});
```

`defineKit` gives the configuration its type and returns it as it is. The
same keys can be written as JSON in `scaffold-ui-kit.json` instead. The build
and the preview find the configuration the same way: the file
`--configuration <path>` names, relative to the directory the command runs
in, else the one the kit's `package.json` names
as `"scaffold-ui-kit": { "configuration": "<path>" }`, relative to the kit
root, else `scaffold-ui-kit.ts` or `scaffold-ui-kit.json` in the kit root.
Both in the root is an error. A file the pointer or `--configuration` names
can be any module type the build loads, `.ts`, `.mts`, `.cts`, `.js`, `.mjs`
or `.cjs`, or `.json`. A kit configured in `scaffold-ui-kit.config.json` is
still read, with a warning naming the file to move to, until 3.0.0.

Optional keys are listed below. A key the configuration does not take, at
the top level or inside `add`, `stylingLayer` or an extension's block, fails
the build with its path and the keys allowed there, so a misspelled key
cannot be ignored silently. In `scaffold-ui-kit.config.json` a top-level key it does not
take is a warning instead, and ignored. `$schema`, for an editor that
checks a JSON configuration against a schema, is taken anywhere. `preview` holds the settings of
[@scaffold-ui-kit/preview](https://www.npmjs.com/package/@scaffold-ui-kit/preview),
which checks them.

- `stylesheetPlacement` (`inline` | `in-file` | `separate-file`, default
  `in-file`) - where each component's stylesheet goes: `style` attributes,
  the component's own file (a `<style>` element or an SFC style block), or
  a stylesheet beside the component. `separate-file` suits a kit best:
  under `in-file`, a React component renders its `<style>` element with
  every instance.
- `stylingLanguage` (`css` | `scss`, default `css`) - `scss` emits nested
  SCSS; the `react` and `html` targets need
  `stylesheetPlacement: 'separate-file'` under it.
  A build that emits SCSS sheets (`separate-file`) also writes
  `dist/<target>/_index.scss`, a sorted `@use` of every component sheet of
  that target, so a kit stylesheet that takes them all (an aggregate, a
  per-theme bundle) writes `@use "<path to dist>/react";` and the list
  follows the components. Under a `stylingLayer` with an `order` it writes
  `dist/<target>/_layer-order.scss` beside them too, the module every sheet
  loads first (see `stylingLayer`).
- `loadPaths` (an array of directories relative to the kit root) - sass load
  paths for resolving `@use`/`@include` in component styles: under
  `stylingLanguage: 'css'` the kit can author SCSS helpers (mixins,
  functions, `$variables`) and still emit any stylesheet placement, the
  engine expanding them to plain CSS at build.
- `stylesheetLink` (`component` | `none` | `both`, default `component`) -
  `none` emits each `<Name>.css` and links it from nowhere, so a consumer of
  the kit decides how the styles are loaded: one aggregate stylesheet,
  per-component imports, or a build of its own. `both` publishes each
  component linked and unlinked from one build (see
  [Linked and unlinked components](#linked-and-unlinked-components)).
  `none` and `both` need `stylesheetPlacement: 'separate-file'`.
- `compiledStylesheetDirectory` (a directory relative to the kit root,
  default `dist/stylesheets`) - where the build writes each component's
  stylesheet compiled to CSS when it is the same on every target: the sheet
  a linked module imports, and the one a consumer who owns a component but
  not its stylesheet imports from the package. The build compiles the
  sheets under `stylesheetLink: 'both'` or a declared partial ownership (see
  [The kit manifest](#the-kit-manifest)). A sheet that differs between
  targets is written per target instead: into `linked/` under
  `stylesheetLink: 'both'`, beside its source otherwise. Needs
  `stylesheetPlacement: 'separate-file'` and `stylingLanguage: 'scss'`: only
  SCSS sheets are compiled, and a `css` kit's sheets are already CSS, so the
  build refuses the key there rather than ignore it. In a kit built into
  packages it is relative to the styles package.
- `packages` - builds each scripted target into a package of its own,
  beside a package of stylesheets (see
  [One package per target](#one-package-per-target)).
- `stylingLayer` (a layer name, or `{ "name": "...", "order": ["..."],
"owned": "..." }`) - wraps each emitted stylesheet's rules in that cascade
  layer, so a component holds the same cascade position however a consumer
  takes its styles. `order` declares the full layer order ahead of the
  wrapper, which a kit shipping one stylesheet per component has nowhere
  else to state. In an `scss` kit the order is a generated module,
  `_layer-order.scss`, holding only the `@layer` order statement, written
  into every directory the build writes component sheets into, or under
  `in-file` and `inline` beside the Vue and Svelte components whose style
  blocks load it; each loads it ahead of its other loads
  (`@use './layer-order' as *;`), so the
  statement compiles first whatever those modules emit - a mixins module
  that emits rules inside one of the layers would otherwise declare that
  layer first and reverse the order. A consumer who copies a sheet gets the
  module beside it (see the `add` package), and a stylesheet of the kit's
  own that `@use`s a target's `_index.scss` gets the statement first through
  the sheets. Every stylesheet the build compiles to CSS states the order
  first as well, once. `owned` names the layer a stylesheet a consumer copies
  moves its rules to, so their edited copy wins over the kit's own rules; it
  needs `order`, which has to list it after `name`.
- `bem` - the BEM extension's options, taken when `styling` lists `bem`:
  `elementSeparator` (default `__`) and `modifierSeparator` (default `--`);
  `mode` (`literal` | `runtime`, default `literal`), where `runtime` renders
  BEM classes as [`use-bem`](https://www.npmjs.com/package/use-bem)
  `bem(...)` calls for the scripted targets instead of literal strings; and
  `importSource` (default `use-bem`), the package providing `bem(...)` -
  add `use-bem` to the kit's dependencies when you use `mode: 'runtime'`.
- `tailwind` - the Tailwind extension's options, taken when `styling` lists
  `tailwind`: `output` (`classes` | `styles`, default `classes`), set to
  `styles` to convert the Tailwind utilities to plain CSS at build time, so
  the output needs no Tailwind build of its own; `darkSelector` (a
  selector), which with `output: 'styles'` writes `dark:` utilities under
  this selector instead of `@media (prefers-color-scheme: dark)` - a
  selector without `&` names a state of the page's root element,
  `'[data-mode="dark"]'` becoming `:where(:root:is([data-mode="dark"])) &`,
  which adds no specificity and which a preview option with
  `apply: { type: 'root-attribute', attribute: 'data-mode' }` turns on, so
  the preview shows the kit's dark styles, while a selector with `&` is
  used as written, with the specificity it spells, and a list has `&` in
  every member or in none (the Tailwind extension's README has the
  details); and `convertStyles` (`true` | `false`, default `false`), the
  inverse of `output: 'styles'`, converting each component's authored
  `style` into Tailwind utility classes.
- `svelte` - the Svelte extension's options, taken when `targets` lists
  `svelte`: `mode` (`legacy` | `runes`, default `legacy`), where `runes`
  builds the `svelte` target as Svelte 5 runes components (`$props()`,
  snippets and `{@render}`, `onevent` attributes) in place of the classic
  `export let`, `<slot>`, and `on:event` shape. Svelte 5 is the floor for
  both modes: legacy output can hold TypeScript in markup, which Svelte 4
  does not compile.
- `add` - the shared modules the components import, what the kit's consumer
  command says after a copy, the name of a consumer's settings file, and how
  consumers may own the components; see
  [Publish and consume](#publish-and-consume).
- `parts` (an object of component names to lists of part names) - the
  parts of each compound whose root has no template, such as a
  [hand-written driver](#hand-written-drivers), by root name:
  `"parts": { "DashboardShell": ["DashboardShellHeader"] }`. A root with a
  template lists its parts in the template instead, and naming one here
  fails the build, as does naming a root that is not a component of the kit.

A block for an extension the kit does not apply is an error, as is an
option set under both a block and its deprecated flat key.

Deprecated keys, still read with a build warning and removed in 3.0.0:
`stylingStrategy` is read as `stylesheetPlacement`; `bemElementSeparator`,
`bemModifierSeparator`, `bemMode` and `bemImportSource` as the `bem` block's
options; `tailwindOutput`, `tailwindDarkSelector` and `tailwindConvertStyles`
as the `tailwind` block's; and `svelteMode` as `svelte.mode`.
`scriptingStrategy` and `scriptingLanguage` have no effect: no target's
output contains a script.

## Hand-written drivers

Some components need behavior a template can't express - local state, an effect,
a third-party headless library. Author those by hand, per target, under
`src/drivers/<target>/`. A driver is a component you write in each framework,
and a template named `<Name>Visual` holds the generated markup it composes:

```
src/
├── components/
│   └── ToastVisual.ts      # generated markup, every target
└── drivers/
    ├── react/Toast.tsx     # hand-written behavior, composing ToastVisual
    ├── vue/Toast.vue
    └── svelte/Toast.svelte
```

`build` copies each driver verbatim into `dist/<target>/`, subdirectories and
all, and the target's barrel re-exports it beside the generated components - so a
consumer imports both `Toast` and `ToastVisual` from the one target entry.
Drivers belong to the scripted targets; `src/drivers/html/` is ignored. A driver whose file
name collides with a generated component, or with a file the build writes
itself - `index.ts`, `_index.scss` for a target with SCSS sheets (except
under `packages`, where the index goes to the styles package), and under
`stylesheetLink: 'both'` `unlinked/index.ts` and anything in `linked/` -
fails the build rather than overwriting it.

A driver that is a compound's root, with parts of its own, has no template to
list them in; the kit configuration's `parts` lists them instead (see
[The kit manifest](#the-kit-manifest)).

The kit's `tsconfig.json` checks everything under `src/`, so a kit that
adds a `.tsx` driver adds `@types/react` to its `devDependencies` for its
own `tsc`.

## Publish and consume

To try the kit in a project first, build and pack it and install the tarball:

```bash
npm run build && npm pack   # in the kit; writes my-ui-kit-0.1.0.tgz
cd ../my-app
npm install ../my-ui-kit/my-ui-kit-0.1.0.tgz
npx my-ui-kit add button --target react
```

When that works, publish:

```bash
npm publish
```

The published kit ships its built `dist/` and a consumer command, run by
[`@scaffold-ui-kit/add`](https://www.npmjs.com/package/@scaffold-ui-kit/add),
the kit's one runtime dependency, which uses Node built-ins only. Consumers
copy components into their project without installing anything else:

```bash
npx my-ui-kit initialize         # where copies go, what the consumer owns
npx my-ui-kit add button --target react
npx my-ui-kit add                # interactive
npx my-ui-kit add --list         # what's available
npx my-ui-kit status             # what was copied, edited, changed in the kit
npx my-ui-kit update             # bring the copies to the installed kit
```

`initialize` writes the consumer's settings for the kit (`my-ui-kit.json`,
or the name `add.consumerConfiguration` gives): the target, a layout that
places each component, stylesheet, part and shared module, an import alias,
and what they own. `add` copies a component as those settings place it -
flat into `./src/components/ui` without settings - together with what it
needs: the Visual a driver composes, a separate stylesheet, the shared
files it reaches. Every import between the copies is rewritten, and a piece
the consumer does not own is imported from the package by the specifier the
manifest records: a stylesheet-only copy gets a module that loads it and
re-exports the component, a component-only copy links the kit's compiled
CSS. Each copied component links its own stylesheet, however the kit was
built; `--stylesheet-link none` copies them unlinked instead. `add` records
every file in a ledger (`.my-ui-kit/copies.json`, with each file's content as
written under `.my-ui-kit/bases/`), so `status` can tell the consumer's edits
from the kit's changes and `update` can merge the kit's changes into edited
copies with `git merge-file`. Afterwards `add` lists the packages the copies
need - the target's framework, what they import, and the kit for what stays
in it - with the kit's own version ranges, leaving out what the consumer's
`package.json` already has. The
[`@scaffold-ui-kit/add` README](https://www.npmjs.com/package/@scaffold-ui-kit/add)
describes the whole workflow.

A kit whose built files import something that is not a component - a
scripts module, sass helpers, a theme file - declares those shared modules
under `add` in the kit configuration:

<!-- example: scaffold-add-configuration -->
```ts
add: {
  shared: [
    { name: 'scripts', source: 'src/scripts', copy: 'reached' },
    { name: 'styles', source: 'src/styles', exclude: ['index.scss'] },
  ],
  notes: [
    'Add the output directory to your sass loadPaths so `@use "styles/..."` resolves.',
  ],
},
```

Each `shared` entry names a file or directory in the kit (`source`, which
has to be in the package's `files`; one that does not exist is a warning,
and the build leaves it out), the name a consumer's settings place and own
it by (`name`, default: the source's base name without its extension; a
default another module's name already takes is derived from the whole source
path instead, `vendor/lib` giving `vendor-lib`, with a warning), what a consumer who owns it copies (`copy`: `all`, the default,
or `reached`, only the modules the copied components import and the
modules those import inside the shared module), and any paths inside it to leave
out of the copy (`exclude`, relative to the source - an aggregate
stylesheet or a barrel that only the installed package needs). The
specifier the built files import a shared module by is the one the kit's
`package.json` `exports` give it: for a directory, the key of a pattern
export below it (`"./scripts/*": "./src/scripts/*.ts"` gives
`my-ui-kit/scripts`) or of an exact export of its index module (`index.ts`,
or `index.scss` or `_index.scss` for styles); a directory may instead
export each of its files on its own (`"./styles"`, `"./styles/base"`). Export
types beside it for TypeScript consumers, since the preview and the kit's
own consumers resolve it as a package import. `notes` are printed after a
successful `add`: the kit's own setup guidance. `consumerConfiguration`
names a consumer's settings file for the kit (default: the package name
with its scope joined by a hyphen, `@acme/ui` giving `acme-ui.json`).

A shared entry's `destination` and `specifier` are deprecated: a consumer's
settings place the module, and its specifier comes from `exports`. A build
that sets either prints a warning; they are removed in 3.0.0.

`--list` shows the names each target's barrel exports; a module a component
is composed of can still be named on the command line.

Kits are also usable as regular packages - each scripted target gets an
`index.ts` barrel re-exporting its components, generated and hand-written
alike, along with any `export type` / `export interface` a component
declares.

### The kit manifest

`build` writes `dist/scaffold-ui-kit-manifest.json`, which is all the kit's
consumer command reads of the kit besides its `package.json`. It names the
version of `scaffold-ui-kit` that wrote it, the kit and its targets, the
stylings the components are built with (each styling extension's name and
its `classKind`, `semantic` for BEM and `utility` for Tailwind), the `bem`,
`tailwind` and `svelte` blocks of the extensions in use with every default
filled in, the kit's `stylesheetLink`, `stylingLanguage`,
`stylesheetPlacement` and `loadPaths`, and per component its kebab-case
name, its compound membership, and its built files per target: the
component module (or the html page), the stylesheet the build emitted, that
stylesheet compiled to CSS, under `stylesheetLink: 'both'` its linked
module, and the helper modules it reaches through relative imports (a
hand-written driver's), each with the imports it makes and the specifier
the kit's `exports` publish it under. It also lists the shared modules with
their files, the excluded ones left out. A
specifier is bare, such as `my-ui-kit/styles`: a consumer tool writing a
stylesheet's `@use` of it adds `pkg:`, and a copied stylesheet that keeps
a `pkg:` URL compiles only in a project whose Sass build has a package
importer, such as Dart Sass's `NodePackageImporter`. `scaffold-ui-kit`
exports the manifest's type, `KitManifest`, beside `KIT_MANIFEST_FORMAT`
(the format this release writes, `1`) and `KIT_MANIFEST_PATH`. The manifest
has to be in the package's `files`; a `files` list that leaves it out fails
the build of a kit that declares its ownership, and is a warning otherwise.

A consumer can own part of a component: the component without its
stylesheet, importing the kit's compiled CSS for it, or the stylesheet
without the component, importing the component from the package. So every
piece a consumer can leave in the package has to be reachable through
`exports`: each scripted target's component modules and compiled
stylesheets, and each shared module's modules and stylesheets. A shared
module's other files, such as fonts and images, need no export: nobody
imports them on their own, so they travel with the stylesheets that
reference them through `url(...)`, copied with a copied stylesheet and left
in the package with one that stays there. Where several exports reach a
file, the most specific wins: an exact path, then the pattern with the
longer part before its `*`. The manifest records `"partial"` only when
every such piece has a specifier, and a piece without one is always copied
with its owner.

`add.ownership` says how a kit's consumers may own its components:

- `"partial"` - a consumer may own part of a component, and a piece no
  export reaches fails the build, with an export that would reach it:

  ```
  package.json: error: no export reaches dist/react/Button.tsx, dist/react/Card.tsx; for example, add "./react/*": "./dist/react/*.tsx" to "exports"
  ```

  Under `stylesheetLink: 'both'` the example puts the unlinked component
  under `/unlinked/` (`"./react/unlinked/*": "./dist/react/*.tsx"`), beside
  the linked module the target's barrel exports; the names are the kit's to
  choose. A separate-file kit that links each component to its own
  stylesheet (`stylesheetLink: "component"`) is warned: a consumer who owns
  only a stylesheet imports the package's component, which loads the kit's
  sheet beside their copy. `"both"` lets them import the component
  unlinked.

- `"full"` - its consumers copy every piece of a component, and the build
  requires no export per piece, as for a kit that exports only its barrels.
- Left out, the build records `"partial"` when every piece has a
  specifier, and `"full"` otherwise, warning of each piece no export
  reaches and going on; declaring `"partial"` turns those warnings into
  errors. An `scss` kit's sheets are compiled for consumers only under
  `stylesheetLink: 'both'` or a declared `"partial"`, so a kit that
  declares neither is recorded as `"full"`, with a warning saying so.

A kit scaffolded by `initialize` declares `"ownership": "partial"` and
exports its components and stylesheets this way:

```json
{
  "exports": {
    "./react": "./dist/react/index.ts",
    "./react/unlinked": "./dist/react/unlinked/index.ts",
    "./react/unlinked/*": "./dist/react/*.tsx",
    "./react/*": "./dist/react/linked/*.ts",
    "./react/*.css": "./dist/react/*.css",
    "./vue": "./dist/vue/index.ts",
    "./vue/unlinked": "./dist/vue/unlinked/index.ts",
    "./vue/unlinked/*": "./dist/vue/*",
    "./vue/*": "./dist/vue/linked/*.ts",
    "./vue/*.css": "./dist/vue/*.css"
  }
}
```

`./<target>/<Name>` brings the component's stylesheet with it and
`./<target>/unlinked/<Name>` leaves it to the consumer. A kit that later
moves to `stylingLanguage: 'scss'` also exports what the build compiles, as
the build's error names.

The html target always copies whole, as a page has no module to import.

A template's style preamble can load a stylesheet the kit itself publishes
by its `pkg:` URL, the URL a consumer's copy of the stylesheet loads it by
while the styles stay in the package:

```ts
style: '@use "pkg:my-ui-kit/styles/tokens" as *;',
```

Every Sass compile the build runs - the engine's under
`stylingLanguage: 'css'` and the build's own compiled stylesheets - resolves
the kit's own `pkg:my-ui-kit/...` URLs through its `package.json`
`exports` (`"./styles/*": "./src/styles/*.scss"` here), under the `sass`,
`style` and `default` conditions as Sass reads them and only to a
stylesheet, trying the variants Dart Sass tries for a URL without an
extension (the stylesheet extensions, the `_` partial, and `index` and
`_index`), and every other `pkg:` URL with Sass's package importer, from
the kit's `node_modules`. A consumer who copies such a stylesheet and leaves
the styles in the package needs that package importer in their own Sass
build.
Under `stylingLanguage: 'scss'` the emitted sheet keeps the URL as written.
`scaffold-ui-kit` exports the importers as `kitSassImporters(kitDirectory)`
for a tool that compiles the kit's Sass itself.

A compound's root lists its parts in its template's `parts`, such as
`parts: ['DialogTrigger', 'DialogContent']`; a root with no template, such
as a hand-written driver, lists them in the kit configuration's `parts`
instead. The manifest records `parts` on the root and `partOf` on each
part, a hand-written driver included. A part has to be one of the kit's
components and belongs to one compound, and the build fails otherwise.

### Linked and unlinked components

Some consumers load a kit's styles once, as one bundle; others want each
component to bring its own stylesheet and nothing else. Taking both at once
loads every rule twice, so under `stylesheetLink: 'both'` each scripted
target publishes its components twice, linked and unlinked, and the
consumer picks between them at import time:

```
dist/react/
  Button.tsx          the component, rendered once, linking nothing
  Button.scss
  index.ts            the linked components: re-exports linked/Button
  linked/
    Button.ts         import '../../stylesheets/IconLabel.css';
                      import '../../stylesheets/Button.css';
                      import { Button as ButtonExport } from '../Button';
                      export * from '../Button';
                      export const Button = ButtonExport;
  unlinked/
    index.ts          the unlinked components: re-exports ../Button
dist/stylesheets/
  Button.css          Button.scss compiled, shared by every target
```

A linked module links the stylesheet of every component it renders, the
ones it composes first, so a `Button` that renders an `IconLabel` brings
both. Under `stylingLanguage: 'scss'` the build compiles each sheet with
sass against `loadPaths`, so neither export needs sass on the consumer's
side. A sheet that compiles to the same CSS on every scripted target is
written once, minified, to `dist/stylesheets` or the directory
`compiledStylesheetDirectory` names, and every target's linked modules link
that copy; a sheet that differs between targets is written into each
target's `linked/` directory instead. Naming the directory lets the linked
modules link the per-component sheets a kit already publishes on their own.
Only an `scss` kit's sheets are compiled and shared this way. A kit with
`stylingLanguage: 'css'` (the default, whatever its styling extensions)
emits plain CSS beside each component, and its linked modules and pages
link those sheets where they are, so every target keeps its own copy and
`compiledStylesheetDirectory` does not apply. The kit names the two exports
in its `package.json`:

```json
{
  "exports": {
    "./react": "./dist/react/index.ts",
    "./react/unlinked": "./dist/react/unlinked/index.ts"
  },
  "sideEffects": ["**/*.css", "**/*.scss"]
}
```

`sideEffects` lets a bundler drop the linked modules a consumer never
imports, along with their stylesheets. A linked module declares each
runtime export itself rather than passing it through, because a bundler
resolves a pass-through straight to the component and would drop the
linked module's stylesheets too: importing `Button` brings `Button.css` and
`IconLabel.css` and nothing else. A module that re-exports a package
through `export *` has exports the linked module cannot list, and the build
warns about it.

The `html` target has no modules to import: each page links its compiled
stylesheet, the shared copy when the sheet is the same as the scripted
targets', so a browser can open it. `add` copies from the components either
way and links each copy to the stylesheet copied beside it, unless asked not
to.

### One package per target

A kit is one package by default, with every target under a subpath
(`my-ui-kit/react`, `my-ui-kit/vue`). Its `package.json` cannot say what a
consumer of one framework needs, so it can list each framework only as an
optional peer. `packages` builds each scripted target into a package of
its own instead, beside a package that holds the stylesheets:

<!-- example: scaffold-packages-configuration -->
```ts
import { defineKit } from 'scaffold-ui-kit';

export default defineKit({
  name: 'acme',
  targets: ['react', 'vue', 'svelte'],
  styling: ['bem'],
  stylesheetPlacement: 'separate-file',
  stylingLanguage: 'scss',
  stylesheetLink: 'both',
  loadPaths: ['../styles/src'],
  packages: {
    react: { name: '@acme/react', directory: '../react' },
    vue: { name: '@acme/vue', directory: '../vue' },
    svelte: { name: '@acme/svelte', directory: '../svelte' },
    styles: { name: '@acme/styles', directory: '../styles' },
  },
  add: {
    shared: [
      { name: 'scripts', source: 'src/scripts' },
      { name: 'styles', source: '../styles/src/styles' },
    ],
  },
});
```

The package names are any names: `@acme/react`, `acme-react` and
`acme-ui-react` all work. Each directory is relative to the kit root, and no
two may overlap. The kit root, where the configuration and the templates
live, stays a package of its own (`@acme/core`, say): the framework-free
modules the components import, such as scripts and configuration. `name` is
the kit's name, which its consumers' settings file and commands take.

The build then:

- writes each target's components, barrels and linked modules into its
  package's `dist/`, and nothing into the kit root's `dist/`;
- writes every component stylesheet into the styles package: once, into
  `compiledStylesheetDirectory` beside its compiled CSS, when every target
  emits it the same, else into `dist/<target>/` there, where each target's
  `_index.scss` goes too, with a `_layer-order.scss` in each directory that
  gets a sheet under a `stylingLayer` with an `order`;
- links each linked module to its compiled stylesheet by the specifier the
  styles package's `exports` publish it under
  (`import '@acme/styles/stylesheets/Button.css'`), and fails, suggesting
  the export, when none reaches it;
- writes the fields of each target package's `package.json` it owns:
  `exports` (the barrel and each component under `./<Name>`; under
  `stylesheetLink: 'both'`, `./<Name>` is the linked module and the unlinked
  barrel and components sit under `./unlinked`), `files`, `type`,
  `sideEffects`, `bin`,
  `dependencies`, `peerDependencies`, and the version, which is the kit
  root's. Every other field is the kit author's and kept, and a missing
  `package.json` is created;
- writes a manifest and the consumer command into each target package, so a
  consumer runs `npx @acme/react add button` with no target to choose. The
  command is named `<kit>-<target>` (`acme-react`), so two installed
  targets never take each other's.

A target package depends on the kit root's package at its exact version and
on every other package its components import, at the range the kit root's
`package.json` lists for it (in `dependencies`, `devDependencies` or
`peerDependencies`); an import it does not list fails the build. Its peers
are its framework, at the range the generated components need (React 19,
Vue 3.5, Svelte 5, or Svelte 5.20 in runes mode), and the styles package at
the exact version, so one copy of the stylesheets is installed beside every
target. A target's own `dependencies` and `peerDependencies` take
precedence:

<!-- example: scaffold-packages-target -->
```ts
react: {
  name: '@acme/react',
  directory: '../react',
  dependencies: { '@zag-js/react': '1.44.0' },
},
```

A `workspace:` range already written for another package of the kit is
kept, for a workspace whose package manager links them that way. The styles
package's own `sideEffects` has to keep its stylesheets, or a bundler drops
the linked modules' stylesheet imports; the build fails on one that leaves
them out.

The kit root's and the styles package's `package.json` are written by hand:
their `exports` publish the shared modules and stylesheets, and the build
checks that every piece a consumer can leave in a package is reached, as it
does for a single package, and that each package's `files` publishes what
the target packages point at. A shared module's `source` and a load path
may lie in any of the packages. `packages` covers the scripted targets: it
needs `stylesheetLink` of `both` or `none`, and a kit with the `html` target
stays one package.

## Testing and helpers

[`@scaffold-ui-kit/testing`](https://www.npmjs.com/package/@scaffold-ui-kit/testing)
tests a kit: it renders a component in each scripted target on the server and
compares the markup, type-checks the built targets as a strict consumer would,
and sweeps the preview's stories in a browser with axe and the keyboard. Its
README starts with the Vitest and Playwright setup.
[`@scaffold-ui-kit/helpers`](https://www.npmjs.com/package/@scaffold-ui-kit/helpers)
is for a kit that writes Sass modifiers or hand-written drivers: style helpers
for templates, and the runtime a driver calls on every target, Zag machines
included. A kit that does neither does not need it.

## Commands

| Command                                     | Purpose                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `scaffold-ui-kit initialize [project-name]` | Scaffold a kit project (default command; `init` is a deprecated alias)                                                 |
| `scaffold-ui-kit build`                     | Render every template into `dist/<target>/`, and keep `bin/add.mjs` and the kit's `@scaffold-ui-kit/add` range current |

`initialize` flags: `--targets <names>`, `--styling <names|none>`,
`--examples` / `--no-examples`, `--preview` / `--no-preview`,
`--configuration <path>`, `-d, --directory <path>`. `--configuration` writes
the kit configuration to that path in the kit, a `.ts`, `.mts`, `.cts`,
`.js`, `.mjs` or `.cjs` module, or a `.json` file (default
`scaffold-ui-kit.ts`), and a path other than
`scaffold-ui-kit.ts` or `scaffold-ui-kit.json` is recorded in the kit's
`package.json`, where the build and the preview look for it.

`build` flags: `--configuration <path>`, the kit configuration to build with
in place of the one the kit gives, relative to the directory the command
runs in. `initialize --configuration` takes a path relative to the new kit's
root instead, and refuses the name `scaffold-ui-kit.config.json`.

## License

MIT
