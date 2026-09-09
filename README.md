# scaffold-ui-kit

Scaffold framework-agnostic UI kits powered by
[js-template-engine](https://www.npmjs.com/package/js-template-engine):
define components once as typed data templates and build them for React,
Vue, Svelte, and vanilla HTML - with BEM and Tailwind styling as
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
npm run build
```

`init` asks for the targets (`react`, `vue`, `svelte`, `html`), the
styling extensions (`bem`, `tailwind`, or none), and whether to include
the example components. Every choice can also be passed as a flag for
non-interactive use:

```bash
npx scaffold-ui-kit init my-ui-kit --targets react,vue --styling bem --no-examples
```

## Define components

Components are data templates in `src/components/` - TypeScript modules
default-exporting a template (with full autocompletion via
`defineTemplate`), or plain JSON:

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
      attributes: { class: ['button'], type: 'button' },
      events: [{ name: 'click', handler: 'handleClick' }],
      children: [{ type: 'text', expression: 'label' }],
    },
  ],
});
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
└── html/
    ├── Button.html
    └── Card.html
```

Configured styling extensions (BEM, Tailwind) contribute their classes to
every target's output. Targets, styling, and output strategies live in
`scaffold-ui-kit.config.json`:

```json
{
  "name": "my-ui-kit",
  "targets": ["react", "vue", "svelte", "html"],
  "styling": ["bem"]
}
```

Optional keys:

- `stylingStrategy` (`inline` | `in-file` | `separate-file`, default
  `in-file`).
- `scriptingStrategy` (`inline` | `in-file` | `separate-file`, default
  `in-file`).
- `stylingLanguage` (`css` | `scss`, default `css`) - `scss` emits nested
  SCSS; the `react` and `html` targets need
  `stylingStrategy: 'separate-file'` under it.
- `loadPaths` (an array of directories relative to the kit root) - sass load
  paths for resolving `@use`/`@include` in component styles: under
  `stylingLanguage: 'css'` the kit can author SCSS helpers (mixins,
  functions, `$variables`) and still emit any styling strategy, the engine
  expanding them to plain CSS at build.
- `stylesheetLink` (`component` | `none`, default `component`) - `none` emits
  each `<Name>.css` and links it from nowhere, so a consumer of the kit
  decides how the styles are loaded: one aggregate stylesheet, per-component
  imports, or a build of its own. Needs `stylingStrategy: 'separate-file'`.
- `stylingLayer` (a layer name, or `{ "name": "...", "order": ["..."] }`) -
  wraps each emitted stylesheet's rules in that cascade layer, so a component
  holds the same cascade position however a consumer takes its styles.
  `order` declares the full layer order ahead of the wrapper, which a kit
  shipping one stylesheet per component has nowhere else to state.
- `scriptingLanguage` (`javascript` | `typescript`, default `javascript`) -
  `typescript` types the generated prop consts; it affects the `html` target
  only and needs `scriptingStrategy: 'separate-file'` there.
- `bemElementSeparator` / `bemModifierSeparator`.
- `bemMode` (`literal` | `runtime`, default `literal`) - `runtime` renders
  BEM classes as [`use-bem`](https://www.npmjs.com/package/use-bem)
  `bem(...)` calls for the framework targets instead of literal strings.
- `bemImportSource` (default `use-bem`) - names the package providing
  `bem(...)`; add `use-bem` to the kit's dependencies when you use
  `bemMode: 'runtime'`.
- `svelteMode` (`legacy` | `runes`, default `legacy`) - `runes` builds the
  `svelte` target as Svelte 5 runes components (`$props()`, snippets and
  `{@render}`, `onevent` attributes) in place of the classic `export let`,
  `<slot>`, and `on:event` shape.
- `tailwindOutput` (`classes` | `styles`, default `classes`) - set it to
  `styles` to convert the Tailwind utilities to plain CSS at build time, so
  the output needs no Tailwind build of its own.
- `tailwindConvertStyles` (`true` | `false`, default `false`) - the inverse:
  convert each component's authored `style` into Tailwind utility classes.
- `add` - what the kit's consumer CLI copies beside the components and says
  afterwards; see [Publish and consume](#publish-and-consume).

## Hand-written drivers

Some components need behavior a template can't express - local state, an effect,
a third-party headless library. Author those by hand, per target, under
`src/drivers/<target>/`:

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
Drivers are framework-only; `src/drivers/html/` is ignored. A driver whose file
name collides with a generated component fails the build rather than overwriting
it.

## Publish and consume

```bash
npm publish
```

The published kit ships its built `dist/` and a consumer CLI. Consumers
copy components into their project without installing anything else:

```bash
npx my-ui-kit add button --target react
npx my-ui-kit add                # interactive
npx my-ui-kit add --list         # what's available
```

`add` copies a component's built files into `./src/components/ui` by default
(`--output-directory` overrides the destination), together with everything
they import by relative path - the Visual a driver composes, a sibling
module, a separate stylesheet - so what lands in the consumer's project
builds on its own. Existing files prompt before being overwritten. Afterwards
it lists the packages the copied files import, with the kit's own version
ranges, leaving out what the consumer's `package.json` already has.

A kit whose built files import something that is not a component - a
scripts module, sass helpers, a theme file - declares those layers under
`add` in `scaffold-ui-kit.config.json`:

```json
{
  "add": {
    "shared": [
      { "source": "src/scripts", "specifier": "my-ui-kit/scripts" },
      { "source": "src/styles" }
    ],
    "notes": [
      "Add the output directory to your sass loadPaths so `@use \"styles/...\"` resolves."
    ]
  }
}
```

Each `shared` entry names a file or directory in the kit (it has to be in the
package's `files`), where it lands relative to the output directory
(`destination`, default: the source's base name), the package path the
built files import it by (`specifier`), and any paths inside it to leave out
of the copy (`exclude`, relative to the source - an aggregate stylesheet or a
barrel that only the installed package needs). `add` copies every shared layer once,
beside the components - an existing copy is kept, never overwritten - and
rewrites imports of a `specifier`, and of any path below it, to the relative
path of the copy. `notes` are printed after a successful `add`: the kit's own
setup guidance. An import of the kit's own package that no shared entry
covers is reported as a warning, since the copy would still depend on the
package.

`--list` shows the names each target's barrel exports; a module a component
is composed of can still be named on the command line.

Kits are also usable as regular packages - each framework target gets an
`index.ts` barrel re-exporting its components, generated and hand-written
alike, along with any `export type` / `export interface` a component
declares.

## Commands

| Command | Purpose |
|---|---|
| `scaffold-ui-kit init [project-name]` | Scaffold a kit project (default command) |
| `scaffold-ui-kit build` | Render every template into `dist/<target>/` and refresh `bin/add.mjs` |

`init` flags: `--targets <names>`, `--styling <names|none>`,
`--examples` / `--no-examples`, `-d, --directory <path>`.

## License

MIT
