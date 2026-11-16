# Story files

Part of the [@scaffold-ui-kit/preview](../README.md) documentation.

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

## Slot content

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

## Content beside the component

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

## Checking story files

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
