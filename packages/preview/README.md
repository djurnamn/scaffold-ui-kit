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
preview ships with (below); a kit using another shell leaves them out. A kit
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
  story's value (see A story's source). The static build is the exception
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
`viewCanvas` (see The kit's vocabulary), reach the browser as JSON, so they
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
  `controlHints` and `labels` - the kit's vocabulary (below).
- `shell` - the shell that renders the preview's interface (below). Required:
  a package specifier, resolved from the kit as its own imports are, or a
  module path relative to the kit root, whose default export is a shell.
  `@scaffold-ui-kit/preview/shells/charcell` is the shell shipped with the
  preview; a kit that names it installs `charcell` and `@zag-js/react`. The
  long form, `{ module, page }`, names the shell's page module beside it:
  what the host page shows before the shell has loaded (below).
- `viewsModule` - the kit's custom views (below).
- `codeBlock` - the kit's own code block for the code view, as
  `{ module, framework }` (below).
- `setupModules` - per target, a module each preview iframe imports once for
  its side effects, such as mounting a toast container a story assumes.
- `htmlStylesheets` - stylesheets the html pane loads beside the theme's and
  its components' own, such as a preflight a framework's setup module would
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
`storiesDirectory`, curates the story the preview shows for it: the
props it starts from, its controls, its slot content and its scenarios. The
file default-exports a `Story` object. Every field is optional, and a
component without a story file still gets a story from its template.

<!-- example: preview-story -->
```ts
import type { Story } from '@scaffold-ui-kit/preview/types';

const story: Story = {
  category: 'Inputs',
  defaultProps: { label: 'Save' },
  controls: { size: { number: { min: 1, max: 4, step: 1 } }, onClick: false },
  slots: { default: { kind: 'text', value: 'Save changes' } },
  scenarios: [{ id: 'destructive', label: 'Destructive', props: { variant: 'danger' } }],
};
export default story;
```

- `defaultProps` - the props the story starts from. Beside the declared
  props, a component that forwards native attributes (a `passthrough`
  element, or a `rest` it spreads) takes HTML attributes such as
  `aria-label` and `class` here and in scenarios. A story spells them as
  HTML does, the form Vue and Svelte take. React takes them as React
  spells them, in the React pane and in the React code: `class` as
  `className` (joined with a `className` the story also gives), a `style`
  string as a style object (without `!important`, which a style object
  cannot hold), and the attributes React
  renames by their React names (`tabindex` as `tabIndex`, `for` as
  `htmlFor`, `readonly` as `readOnly`). A component that declares a prop by
  the exact name takes it as written. The same goes for an `element` fill's
  `props` and an `html` fill's (see Slot content, below).
- `controls` - per prop, tweaks to its control, or `false` to leave the prop
  out of the controls and the generated scenarios.
- `fixed` - props always passed with the given value and never shown as
  controls. Like `defaultProps`, it takes `children` and the native
  attributes a component forwards.
- `generate` - which props get generated scenarios: `false` for none, a list
  of prop names for only those, or `{ exclude: [...] }` for all but those.
- `slots` - the story's slot content: `default` for the default slot and
  `named` for the others, each a fill (see Slot content, below). Without
  `slots` or a `children` text, the panes show the component's name in its
  default slot, so the slot is visible; the story's code leaves it empty.
- `around` - content the story renders beside the component, as its
  siblings: `before` it and `after` it (see Content beside the component,
  below).
- `scenarios` - named prop sets, one of which may be marked `default`. A
  scenario's `slots` give it slot content of its own, in the shape of the
  story's `slots`: a slot it fills shows the scenario's fill in place of the
  story's, and every other slot keeps the story's, as in
  `{ id: 'failed', props: { tone: 'loud' }, slots: { default: { kind: 'text', value: 'Could not save.' } } }`.
  The panes, each target's code, the html, the editor and a static build
  all show that content when the scenario is picked. A
  scenario that takes a generated scenario's id (`variant-solid` for
  `variant: 'solid'`, or `disabled` for a boolean) replaces it, so it should
  set that value. `empty` is the preview's own Empty scenario's id, which no
  curated scenario can take; a boolean named `empty` gets `empty-true`
  instead; one that sets a value alone stands in for its generated
  scenario under its own id. A scenario's `description` says what it shows,
  for a shell to show beside it; markdown is allowed. The component's own
  description is the template's `description`. A scenario's `options` set
  the kit's options when it is picked, so it can show the component in a
  setting: `{ id: 'on-dark', options: { mode: 'dark', surface: '3' } }`.
  They are set as if chosen by hand: a global value stays when another
  scenario is picked, unless that one sets it too, and a story value lasts
  until another story is selected. A scenario unsets a `defaultProps` value
  with `null`, not `undefined`: `undefined` doesn't reach the panes, which
  keep the `defaultProps` value, and `check` warns of a scenario prop set to
  `undefined` that such a value covers (an error under `--strict`). Every
  pane leaves a prop given `null` out, as the story's code does, so the
  component's declared default applies. A two-way prop is the exception:
  given `null`, it is still controlled, at `null`, and the code binds state
  starting at `null`;
  `check` reports one whose declared type does not take `null`, as that
  code would not type-check. A scenario that controls a two-way prop need
  not unset its default prop (a `defaultValue` beside `value`): the code
  leaves it out once the story gives the prop. An empty string is a value
  like any other: a prop given `''`, by a story, a control or a component's
  own change, reaches every pane as `''`.
- `options` - per-story values for the kit's story-scoped options, or `false`
  to make an option unavailable for this component.
- `omit` - leave the component out (a part only its parent renders); a kit
  can leave out a whole naming pattern with `omitPattern`.
- `standalone` - whether the component has a story of its own. Default
  `true`. `standalone: false` keeps the component out of the navigation but
  offers it in the editor: a compound's subcomponents, a shared building
  block, a component only a fixture needs. A component its compound's root
  lists in `parts` - in the root's template, or in the kit configuration's
  `parts` for a root with no template - is `standalone: false` without the
  flag. `check`
  warns of `standalone: false` on a component no root lists, since its
  compound is not copied whole either, unless the component is no one compound's part: two or
  more templates render it (each template counts, a component's omitted
  counterparts included), a story of its source labeled with its name stands
  in for it, or it lists parts of its own.
- `unlisted` - keep the story out of what a reader browses: the
  navigation, the editor's component picker, the component count and the
  catalog a custom view reads. It is generated and renders in every
  target as any story does, and opens at its address
  (`?component=<id>`) and through the testing helpers, so it suits a story
  that exists for a kit's own browser tests. A component written by hand
  takes `unlisted: true` in its manual spec. An omitted component or one
  that is `standalone: false` has no story to keep out, so `check` reports
  `unlisted` beside `omit` or `standalone: false` as an error.
- `label` - the name shown in the navigation, when it should differ. A story
  labeled with the name of a component in its source that is
  `standalone: false` is that component's story.

### Slot content

A fill is one node of slot content, its `kind` naming what it is. This
story file fills a `DataList`'s default slot with text, its `header` slot with a
kit component that has a named slot of its own, and its scoped `row` slot,
which exposes each `row`:

<!-- example: preview-slot-content -->
```ts
const story: Story = {
  defaultProps: { rows: [{ id: '1', name: 'Ada' }, { id: '2', name: 'Grace' }] },
  slots: {
    default: { kind: 'text', value: 'Two people' },
    named: {
      header: {
        kind: 'element',
        component: 'IconLabel',
        props: { size: 'small' },
        slots: {
          icon: { kind: 'html', tag: 'span', props: { 'aria-hidden': 'true' }, children: { kind: 'text', value: '#' } },
        },
        children: { kind: 'text', value: 'People' },
      },
      row: {
        kind: 'scoped',
        slot: { react: 'row', vue: 'row', svelte: 'row' },
        parameters: ['row'],
        react: '<strong>{row.name}</strong>',
        vue: '<strong>{{ row.name }}</strong>',
        svelte: '<strong>{row.name}</strong>',
        html: [{ type: 'element', tag: 'strong', children: [{ type: 'text', expression: 'row.name' }] }],
      },
    },
  },
};
```

| `kind` | Fields | What it fills |
|---|---|---|
| `text` | `value` | Text. |
| `element` | `component`, `props`, `children`, `slots` | A kit component. `children` is one fill for its default slot, and `slots` maps its named slots to fills; a `default` key there is an error. |
| `html` | `tag`, `props`, `children` | A plain HTML element, with one fill as its content. |
| `fragment` | `children` | A list of fills, side by side. |
| `raw` | `react`, `vue`, `svelte`, `html`, `imports` | Source written per target: a JSX expression for React, markup for Vue and Svelte. `imports` names the kit components the source uses, as tags or as values (`:as="Button"` in Vue), as a module's imports are. |
| `scoped` | `slot`, `parameters`, `react`, `vue`, `svelte`, `reactScope`, `html`, `imports` | A slot that exposes values, as a top-level fill in `default` or `named` only. `slot` names the slot in each target, since a render prop, a Vue slot and a Svelte snippet may be named differently. `parameters` are the exposed values each body reads. `reactScope: 'positional'` passes them to React as separate arguments, for a hand-written component whose render prop takes them that way. A React body that is not one expression, two or more sibling roots or text such as `{item}` or `remove <Button />`, is returned in a fragment, `<>...</>`; a body opening with a word reads as an expression unless two words or a word and a placeholder or tag stand side by side. Vue and Svelte take the body as it is. A slot whose template sets `scopeRequired` takes this fill alone: the check refuses any other there, and the editor neither offers nor takes a drop of plain content for it. |
| `part` | `name`, `parameters`, `parameterTypes`, `props`, `react`, `vue`, `svelte`, `html`, `imports` | A call to content the story declares once by `name` (below). Its React body goes in a fragment as a `scoped` fill's does. |

`props`, `children` (of an `element` or `html` fill), `slots`, `html`,
`imports`, `reactScope` and `parameterTypes` are optional. `raw`,
`scoped` and `part` fills take an `html` for the story's `html` source: the
markup the fill renders to at rest, as a string (not for `part`) or as
template nodes, which render as the kit's templates do and may compose the
kit's components. A node composes a component by naming it as its `tag`,
with the component's props as `attributes`:
`{ type: 'element', tag: 'Button', attributes: { variant: 'outline' }, children: [{ type: 'text', content: 'Cancel' }] }`
renders the kit's outline Button. A `scoped` fill's nodes read the slot's
values under its `parameters`. Without an `html`, the story has no `html`
source.

A `part` fill calls content the story declares once by `name`, with the
`props` it passes; its body per target reads them by the names in
`parameters` and may call the part again, so a tree or lists nested in each
other's items render as deep as their data goes. React declares a part as a
function component, Vue as a component (in the story's source, a single-file
component of its own, printed after the story's), and Svelte as a snippet at
the top of the markup. A body calls it as `<Name ... />` in React and Vue and
`{@render Name({ ... })}` in Svelte. Its `html` is template nodes that read
`parameters`, where a `Name` element renders the part again; every call of
one name carries the same declaration. Its `parameterTypes` give each
parameter a TypeScript type for the printed source: React's props and
Svelte's snippet are typed with them (`any` where a parameter has none), and
Vue's `defineProps` once any is given.

A scenario sets `id`, `label`, `description`, `props`, `options` and
`default`, and nothing else: slot content belongs to the story file, shared by
its scenarios.

### Content beside the component

`around` renders content beside the component rather than inside it, such
as a hint whose id the component's `aria-describedby` names. `before` and
`after` each take a fill of any kind but `scoped`, which needs a slot to
give it values:

<!-- example: preview-around -->
```ts
const story: Story = {
  defaultProps: { label: 'Save', 'aria-describedby': 'save-hint' },
  around: {
    after: {
      kind: 'html',
      tag: 'p',
      props: { id: 'save-hint' },
      children: { kind: 'text', value: 'Saves a draft you can return to.' },
    },
  },
};
```

Every pane renders it as the component's siblings, inside the
`mount` node the component mounts in, so the kit's canvas CSS lays
them out. The story's code prints them the same way: React returns them in
a fragment with the component, and Vue's template and Svelte's markup list
them beside it. The html pane and the html source render them beside the
component's markup, from the fill's html as slot content's is. The scenario
editor shows them as locked rows before and after its root, which no edit
changes. Like `slots`, `around` belongs to the story file, so every scenario of
the story shows it. `check` reports a scoped fill there, a key other than
`before` and `after`, and the mistakes it reports in slot content.

### Checking story files

`scaffold-ui-kit-preview check` compares the story files with the components.
A key a story file does not take is an error, named with the keys it does or
with what to use instead. A prop, slot or value a story file names that the
component lacks is an error,
and so is a prop or named slot a fill gives a component it composes, at
every depth of the slot content. A value outside a prop's choices is
reported with the choices, adding "any string" or "a structured value"
where the prop's type takes them beside its literals.
A scenario's option value that no kit option takes, or that its option
cannot hold or the story file makes unavailable, is an error too, as is an
`html` fill giving a void element (`img`, `input`, `br`) children, and a
target the kit builds, or a `specifier` an `add.shared` entry
still names for the kit's own package, that its `package.json` has no
`exports` entry for. A
prop spelled as React spells an attribute (`autoComplete`) is reported
with the HTML spelling a story gives it by (`autocomplete`). A `landing`
entry naming a story the kit has none of, or a scenario its story lacks, is
an error. An enum value or boolean that no scenario sets is a warning, and
an error under `--strict`. Props the preview cannot give a control are
listed, and so are the props `generate` leaves out.

The check also reports what `scaffold-ui-kit build` reports for each
template in the kit's `src/components/`, whichever sources the preview reads,
without writing any output. It asks the scaffolder the kit has installed,
or the preview's own when the kit has none (with a warning when the kit's
copy cannot be loaded or is too old to report), and a kit with no
`src/components/` gets nothing from it. Each line names the template's path,
as the build prints it: a template the build refuses, such as one with a
Tailwind class outside the conversion subset, is an error, and each build
warning, such as two nodes giving one class different styles, is a warning,
which `--strict` leaves a warning. A component the kit cannot build doesn't
pass the check. It covers validating and rendering the templates; a driver
colliding with a generated file and the stylesheets compiled under
`stylesheetLink: 'both'` are reported by `scaffold-ui-kit build` alone.

## The kit's vocabulary

The preview holds no vocabulary of its own: the kit's themes, options and
the frame around each story are keys of the `preview` block, as in the
example above.

- `themes` - the compiled theme stylesheets, and optionally a
  directory of assets (fonts) to serve beside each.
- `canvas` - the prefix for the attributes and classes the preview sets in
  each iframe, an optional page background, and extra CSS. Without it the
  prefix is the kit's `name`, each character other than a letter, a digit,
  `-` or `_` made `-`.
- `options` - the kit's options. An option says what it means, and
  the preview's interface decides how to show it:
  - Its kind follows from its fields: with `values` it is a choice among
    them, its `default` one of them; without, it is a boolean with a boolean
    `default`. The charcell shell shows a select for a choice and a toggle
    for a boolean; another shell picks its own. `optionKind(option)` gives
    the kind, and `generate` and `check`
    fail on an option that is neither.
  - A `global` option has one value for the session; a `story` option is set
    per story, seeded from the story file, and lasts until another story is
    selected.
  - `group` is a placement hint for the shell: `context` (the default) for
    the setting a component is shown in, such as its color mode, a surface
    or the padding around it; `kit` for the kit's own settings, such as its
    theme; or a name of the kit's choosing, such as `canvas`, for a set that
    belongs together. Where each group shows is the shell's decision; the
    charcell shell's placement, and how a kit changes it, is described
    below.

  Each declares in `apply` how its value reaches the iframe:

  | `type` | Fields | Effect |
  |---|---|---|
  | `root-attribute` | `attribute`, `target`, `omitAtDefault` | Sets `attribute` to the value. With `omitAtDefault: true`, the option's default value leaves the attribute off, for a kit whose default mode renders with no attribute. |
  | `class` | `className`, `target` | Toggles `className` by the value's truth; without `className`, sets the value as a `data-<namePrefix>-preview-class` attribute for the kit's CSS to read. |
  | `css-var` | `var`, `target` | Sets the custom property `var`, named in full (`'--surface'`), to the value. |
  | `stylesheet` | none | Switches to the `themes` entry whose `id` is the value. |

  `false` or an empty value removes the attribute or property. `target` is
  optional: `'root'` for the iframe's `<html>` (the default), `'body'`, or
  `{ ref }` for a node of `mount`, as the `outline` option above names
  `'body'`. A `class` apply also takes `on: 'root' | 'body'`, naming the
  same two elements; `target` wins where both are given.

  `check`, `generate`, `build` and `dev` report a key an option, one of its
  `values` or an `apply` of these four types does not take, such as a
  `description` where an option takes `title`, naming the keys it takes.
- `paneWidths` - the widths a shell offers to lay a story's panes
  out at, as a list of `{ label: 'small', width: 375 }`, each width a whole
  number of CSS pixels up to 7680, so the kit can derive them from its own
  breakpoints. Default: `small` 375, `medium` 768 and `large` 1280. No
  label or width appears twice. The list replaces the default, so name
  every width to offer; an empty list offers none. A shell lists them
  narrowest first. `check` and `generate` report a list that breaks these
  rules, naming the key.
- `mount` - an optional tree of elements wrapped around every story,
  such as a frame that pads it or paints a surface, each node addressable by
  a `ref`.
- `viewCanvas` - the page background and extra CSS for custom views, which
  have no `mount` frame. Without it a view gets `canvas.pageBackground` and
  nothing else. An option targeting a `mount` node by `ref` does nothing in
  a view.
- `controlHints` - hints for the controls panel, read in Node alone, both
  optional:
  - `colorTokens` - the kit's color tokens, such as
    `[null, 'primary', 'accent']`, `null` (or, in `scaffold-ui-kit.ts`,
    `undefined`) being the unset choice. When the list holds any token, a
    string-typed prop whose name ends in `color`, in any case (`color`,
    `borderColor`), gets a select of
    these tokens in place of its own control, and `check` holds the values a
    story file sets for it to the list. Such a prop gets no generated
    scenarios. Without tokens, the prop is treated by its declared type like
    any other: a union is a select with a scenario per value.
  - `componentSizeRem(componentName)` - a function, so in
    `scaffold-ui-kit.ts` alone: the starting value, in rem, of a number prop
    named `size` that the component gives no default, or `undefined` for
    none.
- `labels` - the preview's own labels, in the kit's casing, read in Node
  alone: `category`, `emptyScenario`, and, in `scaffold-ui-kit.ts`,
  `generatedScenario`, a function from a prop and the value a generated
  scenario sets to its label (by default `variant: solid`, or `disabled` for
  a boolean).

A `mount` frame that gives every story a gutter, with an option that paints
the frame's surface, as keys of the `preview` block:

<!-- example: preview-mount -->
```ts
mount: {
  classes: ['story-frame'],
  ref: 'frame',
  children: [{ classes: ['story-gutter'], mount: true }],
},
canvas: {
  namePrefix: 'my-ui-kit',
  extraCss: [
    '.story-frame { min-height: 100vh; background: var(--surface); }',
    '.story-gutter { padding: 1.5rem; }',
  ].join('\n'),
},
options: [
  {
    id: 'surface',
    label: 'surface',
    values: [
      { value: 'white', label: 'white' },
      { value: 'whitesmoke', label: 'smoke' },
    ],
    default: 'white',
    scope: 'global',
    apply: { type: 'css-var', var: '--surface', target: { ref: 'frame' } },
  },
],
```

The story mounts inside the node marked `mount: true`, so the gutter's
padding surrounds it; without a marked node it mounts in the outermost one.
`extraCss` is appended to the stylesheet the preview injects into every
story's iframe, where it styles the frame's nodes by their classes, and the
`surface` option sets `--surface` on the node whose `ref` is `frame`, which
`extraCss` paints with.

### A kit styled with Tailwind

A kit built with the `tailwind` styling extension, in its default `classes`
output, ships utility classes that need a Tailwind build. The preview loads
that build as the kit's theme. A kit scaffolded with `--styling tailwind`
gets this setup; another kit adds it in four steps.

1. Install `tailwindcss` and `@tailwindcss/cli` as dev dependencies.
2. Write an entry stylesheet, such as `preview/tailwind.css`, that names the
   built components and the story files as sources. Tailwind skips git-ignored
   files, `dist` among them, unless a `@source` names them:

   ```css
   @import "tailwindcss";

   @source "../dist";
   @source "../src/components";
   @source "./stories";

   /* dark: utilities follow a mode option that sets data-mode="dark" */
   @custom-variant dark (&:where([data-mode="dark"], [data-mode="dark"] *));
   ```

3. Build the kit and compile it before the preview starts or builds:

   ```json
   {
     "scripts": {
       "preview:css": "tailwindcss --input preview/tailwind.css --output preview/tailwind.generated.css",
       "preview": "npm run build && npm run preview:css && scaffold-ui-kit-preview dev",
       "preview:build": "npm run build && npm run preview:css && scaffold-ui-kit-preview build"
     }
   }
   ```

   The other targets' panes show the built components, and Tailwind reads their
   classes from `dist`, so the kit builds first. `generate` and `build` copy
   the theme as it is, so `preview:css` has to run before either, including
   when they run on their own.

4. Load the compiled file as a theme, in the `preview` block:

   <!-- example: preview-tailwind-theme -->
   ```ts
   themes: [
     { id: 'tailwind', label: 'Tailwind', css: 'preview/tailwind.generated.css' },
   ],
   ```

The `@custom-variant` line pairs with a `root-attribute` option, such as the
`mode` option above, so a story's `dark:` utilities follow it. The dev server
reloads the theme when the compiled file changes, so
`npm run preview:css -- --watch` beside it follows class changes once the kit
is built again. Ignore the compiled file in `.gitignore`.

A kit with `tailwind: { output: 'styles' }` has no Tailwind build: it sets
`tailwind.darkSelector: '[data-mode="dark"]'` instead, so its converted
`dark:` styles follow the same option.

### A kit whose stylesheets are not linked

A kit built with `stylesheetLink: 'none'` emits each component's stylesheet
and links it from nowhere, so the other targets' panes show its components
unstyled. The html pane reads the html target's stylesheets itself. Give the
other targets' panes the same styles as a theme: join the kit's reset and one
scripted target's built stylesheets into one file, and load that file as
the theme.

```json
{
  "scripts": {
    "preview:css": "cat src/styles/reset.css dist/react/*.css > preview/components.generated.css",
    "preview": "npm run build && npm run preview:css && scaffold-ui-kit-preview dev",
    "preview:build": "npm run build && npm run preview:css && scaffold-ui-kit-preview build"
  }
}
```

<!-- example: preview-unlinked-theme -->
```ts
themes: [
  { id: 'default', label: 'Default', css: 'preview/components.generated.css' },
],
```

The preview copies a theme as it is, so an `@import` in it would not resolve:
join the files instead. A kit built with `stylingLanguage: 'scss'` compiles
its sheets with sass into that file instead. A kit using Tailwind's `output: 'styles'` needs a reset
that works without a Tailwind build (see the Tailwind extension's README):
Tailwind's own `preflight.css` reads its theme through `--theme()`, which
only a Tailwind build resolves.

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

## Links and persistence

The preview keeps what is showing in its address, so a link opens it as it
was. These query parameters are the preview's:

- `component=<id>` or `view=<id>` - the selected story or view, a story by
  the id described under the testing helpers below, `components-taginput` for
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

## The charcell shell

`@scaffold-ui-kit/preview/shells/charcell` draws the preview in
[charcell](https://www.npmjs.com/package/charcell)'s terminal look:

- a top bar with the kit and its version, the kit's own settings (the `kit`
  group), and two groups of toggles: the views, `navigation`, then `scenario`,
  `output`, `code` and `events`, the stage's four rows, and the targets, its
  columns;
- the navigation, the kit's components and views, one tab stop moved through
  with the arrow keys;
- a stage bar with a select of everything the navigation lists, with an info button for the component's description,
  its markdown rendered;
- the stage's views, each under a heading row whose end holds the view's
  options and controls: the scenario row, with the scenario picker and the
  props and content editor; the output row, a preview pane per target, with
  the context the story is shown in (the story's options and the global
  options of the `context` group, or of none) and a `width` select in an
  options popover; and
  the code row, each target's source under its pane, with a `wrap` toggle;
  and the events row, a log of the events the story's panes fire: each call
  of an event the component declares, a function prop that returns nothing,
  such as `onSelect`, with the pane and what it was called with, and a
  `clear`. A function prop that returns something, such as a formatter, is
  left as the story gives it;
- and a status bar with the panes' state, a link to what the preview shows,
  the shell's keys and any other group of the kit's.

A kit that names it installs its two peers beside the preview:

```sh
npm install --save-dev charcell @zag-js/react
```

`check`, `build` and `dev` name either peer the kit has not installed,
before anything is bundled, whether the kit names the shell as it is or
through a module of its own that configures it (below).

Named as it is, it comes with no content of the kit's. To fill its slots or
move an option group, the kit names a module of its own as its `shell`, which
configures it, and the charcell shell's page beside it:

<!-- example: preview-shell-configuration -->
```ts
shell: {
  module: 'preview/shell.tsx',
  page: '@scaffold-ui-kit/preview/shells/charcell/page',
},
```

The page is what the host page shows before the shell has loaded: charcell's
dark ground from the first frame, its face preloaded, and a `loading` note
set in that face on a whole cell, after a moment. Named as it is, the shell
brings the page itself; a module of the kit's names it, as above, or starts
from an empty page, which `check`, `build` and `dev` warn of.

<!-- example: preview-charcell-shell -->
```tsx
import { charcellShell, reactFill } from '@scaffold-ui-kit/preview/shells/charcell';
import { usePreview } from '@scaffold-ui-kit/preview/react';

export default charcellShell({
  slots: {
    'top-bar-end': reactFill((controller) => {
      const selection = usePreview(controller, (state) => state.selection);
      return <span>{selection.id}</span>;
    }),
    'status-bar': (element, controller) => {
      element.textContent = `${controller.catalog.kitName} ${controller.catalog.kitVersion ?? ''}`;
    },
  },
  groups: { canvas: 'status-bar' },
});
```

- `slots` - content for the shell's named slots: `top-bar-end`, at the end
  of the top bar after the target toggles; `stage-bar-end`, at the end of the
  stage bar; `scenario-end`, `output-end`, `code-end` and `events-end`, at
  the end of each view's heading row, before the view's own control; and
  `status-bar`, at the end of the status bar.
  A fill is `(element, controller) => unmount`. It mounts into `element` in
  any framework or in plain DOM, reads and drives the preview through
  `controller` (below), and may return a function that unmounts it.
  `reactFill(render)` makes a fill from a React render function, rendered as
  a component of its own, so it can use hooks such as `usePreview`.
- `groups` - where each option group goes, by group name: `top-bar`,
  `stage-bar`, `scenario`, `output`, `code`, `events` or `status-bar`, for
  options of any scope. Without an entry, a story option and a global option
  of the `context` group (or of none) sit with the output, a global option of
  the `kit` group in the top bar, and any other group in the status bar.
- `popovers` - which views hold their options in an options popover at the
  end of their heading row rather than in the row itself, such as
  `{ output: false, code: true }`. The output's are in a popover unless it
  says otherwise.

Each view can be hidden and shown, and each target, so a reader keeps the
rows and columns they want. The panes stay loaded while views come and go,
and the other panes while a target does; a row or column comes back at the
size it had. The views are the shell's own
options, so the address keeps them (`option.shell.scenario=true`,
`option.shell.output=false`, `option.shell.code=true`) and a link opens the
story as it was laid out. The output row shows to start with; with no view
showing, the stage says how to show one.

The scenario row starts at its content's height, at most half the stage. Its editor
is open while the row shows, where the preview can regenerate: hiding the row
closes it and keeps its tree until another story or scenario is picked. In
the static build the row holds the picker, with a note that editing a
scenario needs the preview's development server.

The output and code rows sit in a grid that resizes both ways, its columns
the visible targets. The columns start at equal widths. A target turned off
gives its width to the others in proportion to theirs, so three equal
columns become two halves, and 40/20/40 without the last becomes 67/33; a
target turned back on returns at the width it had, the others giving way in
proportion. The output row starts at the height of its stories,
until it is resized. A double-click on a handle, or Enter while it has the
focus, puts its split back where it started: the columns at equal widths,
the output and code rows at their starting heights. The code row shows, under each pane, the story's code
for that target, or its html under the html pane, with a copy button; the
`wrap` toggle wraps every code pane's long lines, on to start with and kept
in the address while off (`option.shell.wrap=false`).

The `width` select, the last of the output's options, fits each pane to
its column (`fit`, to start with), or lays every story pane out at one of
the kit's pane widths, such as `medium 768`, each pane as tall as its
story. While that width is wider
than a column would be, the output stacks: a row per target, each the
stage's full width, with the code panes side by side in the code row under
them. Each row starts at its story's height, and the space left under the
stories goes to the code row, or to the last row without one. When the
stories are too tall to fit together, the rows share the stage equally,
and a story shorter than its share keeps its own height. A row keeps at
least ten rows of text, its frame and about seven rows of story, or its
whole story when that takes fewer; the code row keeps eight. When those
don't fit on the stage together, as with several tall stories and the code
row on a short window, the stage scrolls down instead of squeezing a row.
The rows follow the stories and the stage until you drag a handle between
them or step it with a key, and again after a double-click or Enter on one
of those handles. A story
taller than its row scrolls down, and one wider than its row scrolls
across, with a scrollbar on a row of its own, so it never covers the
story; one narrower than its column is centered in it.

The shell's CSS custom properties are its styling surface; its class names
and markup are its own.

## Writing a shell

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

### The page before the shell mounts

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

### The controller

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
- `mountCode(element, target)` puts the kit's own code block (see "A code
  block of the kit's own") in `element`, showing `target`'s source of the
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

### A story's code

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
  it (see Using it from code): `{ status: 'ready', source, stylesheet?,
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

### Frameworks

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
  element and the framework. An effect that also reads the state re-runs on
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

### A complete shell

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
the new shell in place (see Frameworks).

A reload keeps whatever the address holds: the selected story or view, the
scenario, the story's props, the visible targets and the option values.
The scenario editor's tree is not: a reload seeds it afresh from the
scenario and the tree built in it is lost, so a composition worth keeping
belongs in a story file's scenario.

## Using it from code

The package exports the pieces the commands are built from, for a kit's own
scripts and tests. One is `storySource`, which prints a story as the code a
consumer would write in each target, importing from the kit's package
entries. A docs site can show it next to the component, and the snippets
follow the story files. A default slot the story leaves unfilled is empty in
every target, without the component's name the panes show there. A two-way prop the story gives is bound as the code
view binds it (see A story's source):

<!-- example: preview-story-source -->
```ts
import { storySource } from '@scaffold-ui-kit/preview';

const { react, vue, svelte, html } = await storySource(kitRoot, 'Button', { scenario: 'destructive' });
```

`html` is the markup the story renders to, for a reader who works without a
framework: the template rendered once for the story's props and slot content,
with the components it references rendered inline, and the exports of the
kit's shared modules (the `add.shared` code modules its `package.json`
exports), of `@scaffold-ui-kit/helpers/runtime` and `/zag` when the kit or
one of its packages has that package installed, and the declarations on
each template's own `imports` lines in scope for its expressions. A kit's
own module wins a name it shares with the helpers. It is the markup at rest, with no behavior, and it assumes
the kit's stylesheet. A component written by hand renders as
`handWrittenComponents` maps it - its content, closed, its placeholder
showing, or the template it renders - inside one
`<!-- component: Name (behavior not included) -->` comment, and slot content
written per framework renders its `html`. A story holding any other
component without a template, or such slot content without `html`, gets no
`html`, and a warning names what has no markup. An expression that cannot be
evaluated without running the component is left out, so the part it decides
shows at a default: a class it would add is missing, and a panel it would
reveal stays out. These evaluation warnings, one per expression, are
returned in `htmlWarnings` and printed once per story here and by
`preview build`, where the expressions one component cannot evaluate for one
reason print as one line counting them, such as
`TabsTrigger: could not evaluate 3 expressions (isActive is not defined)`;
a styling extension's notices are not among them. A call into a value a
hand-written component exposes to its content, such as a driver's
`api.getTriggerProps()`, has no result at rest by design and is left out
without a warning. A name the component's
script defines, such as its state, is one the markup cannot read; the
helpers the template imports from a shared module (an `add.shared` code
module the kit's `package.json` exports) or from `@scaffold-ui-kit/helpers`,
or declares on its `imports` lines, are in scope, so an
expression that should evaluate at rest calls one of those instead. Pass
`targets` to print only some of them.

Each call prints one story on its own, so two examples on one page carry the
same ids and radio `name`s: a label then points at the other example's
field, and the radios of both form one group. Show each example in an iframe
of its own.

## Testing a kit's components

`@scaffold-ui-kit/preview/testing` drives the preview from a browser test;
[`@scaffold-ui-kit/testing`](https://www.npmjs.com/package/@scaffold-ui-kit/testing)
is built on it and sweeps every story with axe and the keyboard. It
loads one target's preview page on its own, at the top level of the page,
and mounts a story in it with the props and options you give, so locators and
keyboard input reach the component directly:

<!-- example: preview-open-story -->
```ts
import { openStory } from '@scaffold-ui-kit/preview/testing';

const story = await openStory(page, { target: 'vue', id: 'components-button', props: { variant: 'solid' } });
await story.setProps({ variant: 'ghost' });
await story.setOptions({ mode: 'dark' });
await expect(story.page.getByRole('button')).toBeVisible();
```

A story's id is the one the catalog and the address use
(`PreviewComponent.id`, `?component=` in a link): its title in lower case,
each run of other characters a hyphen. A `Button` under the default
`Components` category is `components-button`, and one a story file places in
`Inputs` is `inputs-button`. An `unlisted` story opens this way too, so a
story that exists for the tests can stay out of the navigation.

The same steps are available as functions of the page, for a suite that loads
the page once per test and sets stories as it goes:

- `gotoPreview(page, target)` loads the target's preview page and waits
  until it listens. A page that never does, such as after an import fails to
  load, throws within seconds, naming the page and where to look.
- `setStory(page, id, props)` shows a story, and `mountStory(page, id, props)`
  shows it from a fresh mount, with no focus or component state carried over
  from the story before. An id the page has no story for throws, listing
  those it has, as `openStory` does.
- `waitForStory(page, id)` follows `mountStory` and waits until the story has
  finished mounting, whatever it rendered, including nothing, and throws after
  15 seconds, naming the story. After `setStory` it can return on the page's
  earlier report of the same story.
- `setProps(page, props)` replaces the story's props in place, keeping its
  component instance.
- `setOptions(page, options)` applies option values, such as a color mode.
  An id the kit does not define throws, listing those it does, as does a
  value the option does not list.
- `settle(page)` waits until the frame after the next paint, for a component
  whose event handling attaches just after it renders.
- `readStoryIds(page)` lists the ids of the stories the page can mount.
- `readRenderError(page)` is the message of what the mounted story threw as it
  rendered, as the pane reports it, or `undefined` while it renders.
- `PREVIEW_MOUNT_ELEMENT_ID` is the id of the element the story mounts in,
  for a test that scopes its queries to the story.
- `readPreviewManifest(kitRoot)` reads the components of
  `.preview-generated/manifest.json`, which the preview writes when it
  starts, typed `PreviewManifestComponent`.

`props` are the story's whole prop set: the story file's `defaultProps` and
scenarios are not applied, so pass every prop the story needs, such as a
required label.

`page` is a Playwright `Page`, or any object with `goto`, `waitForFunction`
and `evaluate` of the same shape; the package does not depend on Playwright.
Paths are relative, resolved against the test runner's base URL, or pass
`baseUrl` to name the server. Serve the preview with `dev` or the static
build.

## Requirements

Node 22 or later.

## License

MIT
