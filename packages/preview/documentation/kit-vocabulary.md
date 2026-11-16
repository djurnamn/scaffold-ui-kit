# The kit's vocabulary

Part of the [@scaffold-ui-kit/preview](../README.md) documentation.

The preview holds no vocabulary of its own: the kit's themes, options and
the frame around each story are keys of the `preview` block, as in the
example under [Setting it up](../README.md#setting-it-up).

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
    charcell shell's placement, and how a kit changes it, is described in
    [The charcell shell](charcell-shell.md).

  Each declares in `apply` how its value reaches the iframe:

  | `type` | Fields | Effect |
  |---|---|---|
  | `root-attribute` | `attribute`, `target`, `omitAtDefault` | Sets `attribute` to the value. With `omitAtDefault: true`, the option's default value leaves the attribute off, for a kit whose default mode renders with no attribute. |
  | `class` | `className`, `target` | Toggles `className` by the value's truth; without `className`, sets the value as a `data-<namePrefix>-preview-class` attribute for the kit's CSS to read. |
  | `css-var` | `var`, `target` | Sets the custom property `var`, named in full (`'--surface'`), to the value. |
  | `stylesheet` | none | Switches to the `themes` entry whose `id` is the value. |

  `false` or an empty value removes the attribute or property. `target` is
  optional: `'root'` for the iframe's `<html>` (the default), `'body'`, or
  `{ ref }` for a node of `mount`, as the `outline` option in that example names
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

## A kit styled with Tailwind

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
`mode` option under [Setting it up](../README.md#setting-it-up), so a story's `dark:` utilities follow it. The dev server
reloads the theme when the compiled file changes, so
`npm run preview:css -- --watch` beside it follows class changes once the kit
is built again. Ignore the compiled file in `.gitignore`.

A kit with `tailwind: { output: 'styles' }` has no Tailwind build: it sets
`tailwind.darkSelector: '[data-mode="dark"]'` instead, so its converted
`dark:` styles follow the same option.

## A kit whose stylesheets are not linked

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
