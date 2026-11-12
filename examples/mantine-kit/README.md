# Mantine-style kit example

A small UI kit in the style of [Mantine](https://mantine.dev), written once as
TypeScript templates and built with scaffold-ui-kit for React, Vue 3.5,
Svelte 5 (runes mode) and a plain HTML reference.

This example is inspired by Mantine and is **not a port** of it. It shows how
a Mantine-style, props-driven kit can be written once and built for several
frameworks, up to a point. It is not affiliated with or endorsed by Mantine.
If you want to build and maintain a full port, you are free to use this code
as a starting point. The theme values come from Mantine's default theme; see
[LICENSE-NOTICES.md](LICENSE-NOTICES.md), which lists the changes. The `filled`,
`dimmed` and error colors differ from Mantine's defaults, darker in the light
scheme and lighter in the dark, so text on them meets WCAG AA contrast.

## What it shows

- **A props-driven API.** `size`, `color`, `radius` and `variant` become CSS
  variables and BEM modifiers, and every value reads a `--mk-*` token from the
  theme. See `src/components/button.ts`, the `modifiersFor` helper in
  `src/template-helpers/kit.ts`, and `themes/default.css` (light and
  `[data-mk-color-scheme='dark']`).
- **A Styles API.** Every form component takes `classNames` and `styles`
  keyed by inner part name (`root`, `label`, `input`, `description`, ...).
  `stylesApiProps` and `part` in `src/template-helpers/kit.ts` write both
  for each part. A `--custom` property given in `styles` wins over the
  component's own.
- **Form fields with label, description and error built in.** `TextInput`
  and `NumberInput` render `InputWrapper` around their control
  (`src/components/text-input.ts`, `src/components/input-wrapper.ts`).
- **Ids per instance.** `ids` declares the input id and the ids a field
  points `aria-describedby` at. React, Vue and Svelte generate them, and the
  HTML reference writes numbered ids in their place
  (`src/components/radio-group.ts`).
- **The input as the target.** The root takes the consumer's `class`,
  `style` and `data-*`; every other attribute, and the `ref`, reach the
  `<input>` through `passthrough: { attributes: ['*'], handle: 'routed' }`.
  A consumer's `aria-describedby` joins the field's own ids
  (`src/components/checkbox.ts`); the Checkbox story's `joined-ids` scenario
  names a hint the story renders beside the checkbox with `around`.
- **Two-way values.** `bindable` gives each field a controlled and an
  uncontrolled form: `value` and `onValueChange` in React, `v-model` in Vue,
  `bind:value` in Svelte. `SegmentedControl` is built on native radios, so
  it has one tab stop and arrow keys move the selection
  (`src/components/segmented-control.ts`).
- **Derived values.** `NumberInput` writes `canIncrement` and
  `canDecrement` once in `derived`, and every target keeps them up to date
  (`src/components/number-input.ts`).
- **A compound component.** `RadioGroup` shares its value with each `Radio`
  through a context. The provider is a `fragment` that only React renders as
  an element, while Vue and Svelte provide the context from the script
  (`src/components/radio-group.ts`, `src/components/radio.ts`).
- **Per-target details.** `Checkbox` binds `indeterminate` once, which every
  target sets as a DOM property (React from a generated ref), and keeps it as
  a two-way value that a click clears. A `data-indeterminate` attribute shows the state in the HTML
  reference too. `Button` renders as a `<button>` or an `<a>`
  (`component="a"`) and has `leftSection` and `rightSection` slots.

## Components

`Alert`, `Badge`, `Button`, `Checkbox`, `InputWrapper`, `NumberInput`,
`Radio`, `RadioGroup`, `SegmentedControl`, `Switch` and `TextInput`.

## Targets

React, Vue 3.5, Svelte 5 in runes mode, and HTML, styled with BEM into a
separate stylesheet per component, inside the `mk.components` cascade layer
(`scaffold-ui-kit.ts`). A stylesheet a consumer copies moves to
`mk.owned`, after it, so their edits win over the kit's own rules.

Each scripted target is published both linked and unlinked
(`stylesheetLink: 'both'`). The components themselves link no stylesheet. The target's barrel
(`mantine-style-kit-example/react`) and each component's own path
(`mantine-style-kit-example/react/TextInput`) are the linked modules: importing
a component brings its stylesheet and those of the components it renders,
`InputWrapper.css` with `TextInput.css`. `/unlinked`
(`mantine-style-kit-example/react/unlinked/TextInput`) is the component
alone, for an app that loads the styles itself, and each stylesheet is
published at its own path (`mantine-style-kit-example/react/TextInput.css`).
The `package.json` `exports` name both forms, and `sideEffects` marks only
the stylesheets, so a bundler keeps just the ones an app imports. The HTML
pages link their stylesheets directly.

## Build and check

```sh
npm install
npm run build        # render every template into dist/<target>/
npm run typecheck    # tsc, vue-tsc and svelte-check over the templates, dist/ and the views
npm run check        # check the preview stories against the components
npm test             # the same props render the same markup in React, Vue and Svelte
npm run typecheck:consumer   # compile dist/ as a strict consumer would
npm run test:browser # build, then axe and the Tab walk over the form components' stories
```

`npm test` renders the Button matrix and the form fields on the server and compares
the targets, through `@scaffold-ui-kit/testing/render` and `/parity`, so a
prop or an attribute one target renders differently fails. `npm run
test:browser` starts the preview and sweeps the form components' stories in
light and dark with `/browser`. `npm run typecheck:consumer` type-checks the
built components under `@scaffold-ui-kit/testing/tsconfig.consumer.json`, the
options of a fresh Vite project.

## Preview

```sh
npm run preview          # serve the preview while you edit
npm run preview:build    # write a static preview into .preview-static/
```

The preview shows each story in React, Vue, Svelte and HTML side by side,
with a color scheme and a font option (the `preview` block in
`scaffold-ui-kit.ts`).
Each component's stories are in `preview/stories/`. The views in
`preview/views.tsx` add a size and color matrix, a controlled form in React,
a `v-model` form in Vue (`preview/FormVue.vue`) and a `bind:` form in Svelte
(`preview/FormControls.svelte`).

## Add components to an app

`add` copies a built component, with the components and stylesheets it
imports and the theme, into an app, which then owns the files. Run the
example's command from the app's folder:

```sh
node path/to/mantine-kit/bin/add.mjs add text-input --target vue
node path/to/mantine-kit/bin/add.mjs add --list
```

The files go into `src/components/ui` unless you give
`--output-directory`, or run `initialize` to choose a layout. Import
`themes/default.css` once at the app's root.

An app can own part of a component too. With `--own stylesheet` it copies
only the stylesheet, beside a module that imports it and re-exports the
component from the unlinked path, so only the app's copy of the rules
loads. With `--own component` it copies the component and imports the
kit's stylesheet for it from the package.
