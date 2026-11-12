# shadcn-style kit example

A small UI kit in the style of [shadcn/ui](https://ui.shadcn.com): Tailwind
utility classes, variant maps, polymorphic triggers and Radix-style compound
components. Each component is written once as a typed template in
`src/components/`, and [scaffold-ui-kit](https://www.npmjs.com/package/scaffold-ui-kit)
builds it for React 19, Vue 3.5, Svelte 5 and plain HTML.

This example is inspired by shadcn/ui. **It is not a port of shadcn/ui.** It
shows how a shadcn-style kit can be written once and built for several
frameworks, up to a point, with a modest set of components. It is not
affiliated with or endorsed by shadcn/ui. If you want to build and maintain a
full port, you're free to use this code as a starting point. The class
strings, tokens and component designs come from shadcn/ui under its MIT
license; [LICENSE-NOTICES.md](LICENSE-NOTICES.md) holds the notice and lists
which parts derive from it.

## Components

| Component | Parts | What to look at |
|---|---|---|
| Button | | `as` renders a tag or a component; classes from `buttonVariants()` |
| Badge | | classes from `badgeVariants()` |
| Card | | named `action` and `footer` slots, each wrapper rendered only when filled |
| Alert | | an `icon` slot placed as a direct child, so `has-[>svg]:` utilities apply |
| Input | | a native input with a two-way `value` |
| Switch | | a `role="switch"` button with a two-way `checked` |
| Accordion | | native `<details name>` sections with a two-way list of open values |
| Tabs | TabsList, TabsTrigger, TabsContent | a compound sharing the selected tab through a context; arrow keys, Home and End move between tabs through the shared `moveTabsFocus()`; a consumer's class merges with `cn()` through `consumerClass` and `withoutClass` |
| Dialog | DialogTrigger, DialogContent, DialogTitle, DialogClose | a compound on the native `<dialog>`, with an `as={Button}` trigger |

## What it demonstrates

- **Variant maps in a shared module.** `src/lib/index.ts` holds `cn()`
  (clsx and tailwind-merge) and the cva-style `buttonVariants()` and
  `badgeVariants()`. Templates import it by the package's own name
  (`shadcn-style-kit-example/lib`, an `exports` entry), and the `add.shared`
  entry in `scaffold-ui-kit.ts` copies it next to a consumer's
  components and rewrites that import. See `src/components/button.ts`.
- **`as` in place of `asChild`.** Button, DialogTrigger and DialogClose
  declare their tag as `{ $expression: "as ?? 'button'", componentValued: true }`,
  so `<DialogTrigger as={Button} variant="outline">` renders the kit's Button
  with the trigger's behavior, in every framework. React types `as` by the
  tag or component it gets.
- **Two-way state without per-target code.** A prop with `bindable`
  (`src/components/switch.ts`, `input.ts`, `accordion.ts`) becomes
  `useState` with `checked` / `onCheckedChange` in React, `v-model:checked`
  in Vue and `bind:checked` in Svelte, with `defaultChecked` for the
  uncontrolled case. `extensions.vue.model` lets Vue users write a bare
  `v-model`.
- **Compound components.** `src/components/tabs.ts` and `dialog.ts` provide a
  context, and each part reads it in a short script per framework. The root's
  outer node is a `fragment` that becomes `<TabsContext value={...}>` in
  React only. The Svelte scripts have `legacy` and `runes` blocks, so the kit
  builds in either Svelte mode.
- **Ids per instance.** `ids: { baseId: 'tabs' }` gives each Tabs its own
  prefix for `aria-controls` and `aria-labelledby`. Accordion's
  `ids: { groupName: { prefix: 'accordion', prop: 'name' } }` names the
  sections' shared `name` unless the consumer passes one.
- **A consumer's class wins.** A root that writes its own class list merges the
  consumer's `class` or `className` with `consumerClass` and `withoutClass`
  from `@scaffold-ui-kit/helpers/runtime`, so `cn()` applies on every target:
  `h-12` passed to a Button replaces its `h-9`. See `button.ts` and `tabs.ts`.
- **Leaning on the platform.** Accordion uses `<details name>` for
  exclusivity, keyboard support and find-in-page, and animates height through
  `::details-content`. DialogContent opens the native `<dialog>` with
  `showModal()` through the shared `syncModal()` helper, so the top layer,
  focus trapping and the inert page come from the browser.
- **Tailwind as written.** Arbitrary variants such as
  `[&_svg:not([class*='size-'])]:size-4`, `has-data-[slot=card-action]:` and
  `group-open:rotate-180` sit in the templates unchanged. The tokens and the
  `dark` variant live in `src/styles/tokens.css`.
- **Stories.** `preview/stories/` gives each component its stories:
  controlled scenarios (a click in any framework's pane moves every pane), a
  dark scenario through the `mode` option, and slot content that composes kit
  components. The `preview` block in `scaffold-ui-kit.ts` declares the
  themes, the `mode` option and pane widths at Tailwind's breakpoints.

## Build and check

```bash
npm install
npm run build          # render every template into dist/react, dist/vue, dist/svelte, dist/html
npm run typecheck      # tsc on the templates, then tsc, vue-tsc and svelte-check on dist/
npm run check          # scaffold-ui-kit-preview check --strict: stories against components
npm test               # vitest: every target renders the same markup, a consumer class wins
npm run test:browser   # Playwright: axe and the keyboard over every story, in each target
```

The `tests/` suite renders each component on the server in React, Vue and
Svelte with `@scaffold-ui-kit/testing` and compares the markup. `typecheck`
compiles the built targets as a strict consumer would, each `tsconfig.*.json`
extending `@scaffold-ui-kit/testing/tsconfig.consumer.json`, which keeps Vue's
`strictTemplates` on and allows the `data-slot` the components mark their
elements with.

The browser sweep (`tests/browser/sweep.spec.ts`) serves the preview and, for
each story in React, Vue and Svelte, fails on a story that throws, runs axe,
walks Tab and Shift+Tab, and scans color contrast again in dark mode. What it
accepts is listed in `KNOWN` with a reason, and an entry that no longer occurs
fails the sweep too. Run `npx playwright install chromium` once before it.

The kit builds Svelte in legacy mode, the default. Set `svelte: { mode: 'runes' }`
in `scaffold-ui-kit.ts` to build runes components instead.

## Preview

```bash
npm run preview        # build, compile the Tailwind stylesheet, serve the preview
npm run preview:build  # the same as a static site in .preview-static/
```

The preview shows each story in the React, Vue, Svelte and HTML panes side by
side, with the printed source for each framework.

## Use the components in an app

`add` copies built components into a project, with the shared module and the
tokens. Build the kit, then run its `add` command from your app's folder:

```bash
node path/to/shadcn-kit/bin/add.mjs add button input --target react
node path/to/shadcn-kit/bin/add.mjs add tabs --target vue
node path/to/shadcn-kit/bin/add.mjs add --list
```

A kit published to npm runs the same command as `npx <kit-name> add`.

The kit is built for full ownership (`add.ownership: 'full'` in
`scaffold-ui-kit.ts`): a compound comes whole, so `add tabs` copies the root
and its parts together. Components land in `src/components/ui` until
`initialize` sets another layout. `status` lists every copy and whether you
edited it, and `update` brings copies to a newer kit, merging your edits; an
edit on a line the kit also changed leaves conflict markers to resolve. Then
load Tailwind and the tokens in your entry stylesheet:

```css
@import "tailwindcss";
@import "./components/ui/tokens.css";
@source "./components/ui";
```

`add` prints the packages the copied files import: `clsx`, `tailwind-merge`
and `@scaffold-ui-kit/helpers`.

A Vue project type-checking with `strictTemplates` needs
`"dataAttributes": ["data-*"]` in its own `vueCompilerOptions`: the copied
components mark their elements with `data-slot`.

## Targets

- `react` - `.tsx` function components for React 19
- `vue` - single-file components for Vue 3.5
- `svelte` - Svelte 5 components, legacy mode by default
- `html` - plain markup with the Tailwind classes, for copying into a page
