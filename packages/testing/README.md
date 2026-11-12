# @scaffold-ui-kit/testing

Testing for kits built with
[scaffold-ui-kit](https://github.com/djurnamn/scaffold-ui-kit): render a
component in React, Vue and Svelte on the server and compare the markup,
type-check the built targets as a strict consumer would, and sweep the
preview's scenarios in a browser with axe and the keyboard.

It covers the three scripted targets. The `html` target is reference markup
with no component to mount or render, so a renderer and a sweep throw on it,
and nothing here reads `dist/html`: `storySource` from
`@scaffold-ui-kit/preview` prints a story's html. A page of your own that has
to work without JavaScript is checked with Playwright locators and
`toBeVisible`, in a context with `javaScriptEnabled: false`; axe and the
keyboard walk evaluate scripts in the page, which fails with JavaScript off.

```sh
npm install --save-dev @scaffold-ui-kit/testing
```

The package has four entry points and a tsconfig preset. Import from the one
you need; nothing is exported from the package root. React, Vue, Svelte,
svelte-check, `@axe-core/playwright` and `@scaffold-ui-kit/preview` are
optional peers: install the ones the entry points you use need.

## Setting it up

The package brings no test runner. The render and parity checks run in
Vitest, which compiles the built `.tsx`, `.vue` and `.svelte` files, and the
sweep runs in Playwright against the preview. Both read `dist/`, so build the
kit first.

```sh
# render and parity: the plugin ranges match the Vite the preview runs on
npm install --save-dev vitest@^3.2 vite@^7 @vitejs/plugin-vue@^6 \
  @sveltejs/vite-plugin-svelte@^6 react react-dom vue svelte
# the consumer type-check
npm install --save-dev vue-tsc svelte-check @types/react @types/react-dom
# the browser sweep
npm install --save-dev @playwright/test @axe-core/playwright
npx playwright install chromium
```

Leave out the frameworks your kit does not target, along with their plugins.

`vitest.config.ts` compiles each target, with React's automatic JSX runtime,
which the built `.tsx` files expect:

```ts
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [vue(), svelte()],
  esbuild: { jsx: 'automatic' },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 30_000 },
});
```

`playwright.config.ts` has one project per target, named after it, so a test
reads its target from `testInfo.project.name`, and serves the preview, which
writes the manifest a sweep reads:

```ts
import { defineConfig } from '@playwright/test';

const port = 4173;

export default defineConfig({
  testDir: 'tests/browser',
  timeout: 300_000,
  workers: 1,
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: 'react' }, { name: 'vue' }, { name: 'svelte' }],
  webServer: {
    command: `npm run preview -- --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
  },
});
```

The `timeout` is there because `sweepPreview` runs every component of the kit
in one test, longer than Playwright's default of 30 seconds on any kit past a
handful of components. Set it per test with `test.setTimeout`, or give each
component a test of its own with `sweepComponent`, shown below. One test over
a large kit cannot run with `trace: 'retain-on-failure'`: each scan injects
axe into the page, and Playwright holds a failed test's whole trace in one
string, which a long sweep overflows (`RangeError: Invalid string length`),
so sweep per component or leave tracing off for that project.

`sweepPreview` mounts each component with what its story gives it, so a
component with a required prop needs a story file that sets it: a Button with
a required `label` and no story fails `button-name`, correctly. Add
`preview/stories/Button.story.ts` with `defaultProps: { label: 'Save' }`. The
scaffolded example Button defaults its `label`, so it has text without one.

Render and parity tests go in `tests/`, named `*.test.ts`, and browser specs
in `tests/browser/`, named `*.spec.ts`, so the two runners keep to their own
files. The consumer type-check takes three files at the kit root,
`tsconfig.react.json`, `tsconfig.vue.json` and `tsconfig.svelte.json`, each the
one shown under [`tsconfig.consumer.json`](#tsconfigconsumerjson) with its own
target's directory in `include`, and `tests/check-svelte.mjs` holds the
`checkSvelte` call shown below. Then the kit's `package.json` scripts are:

```json
{
  "scripts": {
    "test": "npm run build && vitest run",
    "test:types": "npm run build && tsc -p tsconfig.react.json && vue-tsc -p tsconfig.vue.json && node tests/check-svelte.mjs",
    "test:browser": "playwright test"
  }
}
```

`npm run test:browser` has no build of its own, as the web server above runs
the kit's `preview` script, which builds first. `vite-plugin-svelte` prints
that it found no Svelte config on each run, from the preview too; a kit needs
none.

## `@scaffold-ui-kit/testing/render`

Server rendering of the scripted targets, with React's
`renderToStaticMarkup`, Vue's `createSSRApp` and `renderToString`, and
Svelte's `svelte/server`. A renderer throws on `html`, which is not one of its
targets: `storySource` from `@scaffold-ui-kit/preview` prints a story's html.

### `createRenderer(loaders)`

A kit hands over one loader per target. Each finds a component by its export
name, so the kit's build layout stays its own, and a part exported beside its
compound's root resolves like any other component. Each component loads once.

```ts
import {
  createRenderer,
  scopedSlot,
  slot,
} from '@scaffold-ui-kit/testing/render';

const renderer = createRenderer({
  react: async (name) => (await import(`../dist/react/${name}.tsx`))[name],
  vue: async (name) => (await import(`../dist/vue/${name}.vue`)).default,
  svelte: async (name) =>
    (await import(`../dist/svelte/${name}.svelte`)).default,
});

beforeAll(() => renderer.load('Badge', 'Tabs', 'Tab'), 30_000);

const markup = await renderer.render('vue', 'Badge', {
  tone: 'calm',
  children: slot('New'),
});
const each = await renderer.renderAll('Popover', {
  trigger: scopedSlot('triggerProps', 'Open'),
});
const part = await renderer.render(
  'svelte',
  'Tab',
  { value: 'a' },
  { host: { name: 'Tabs' } }
);
```

`render(target, name, props, options)` renders one target, `renderAll` every
target the kit gave a loader for, and `load(...names)` loads components ahead
of their first render, and compiles the Svelte host described below when the
kit has a Svelte loader, so a test file can pay a cold import in a `beforeAll`
with a time limit of its own. A component built for only some targets fails
`renderAll` and `load` in the others with the bundler's error for the missing
file, so render it per target instead, and leave it out of `load`.

A `host` renders another component around the one under test, for a part
that renders only inside its compound. The part is the host's children:
React's `children`, Vue's default slot, Svelte's `children` snippet. The
host's props take slot fills like the component's, its `children` excepted.

Slot fills aside, props go to the component as you write them. A class is
`className` in React and `class` in Vue and Svelte. Given the other spelling,
React and Vue write a second `class` attribute beside the component's own,
which the comparison reads as a wrong class. `renderAll` gives every target the same
props, so render a case with a class per target:

```ts
const react = await renderer.render('react', 'Badge', { className: 'wide' });
const vue = await renderer.render('vue', 'Badge', { class: 'wide' });
```

### `slot(text)` and `scopedSlot(binding, text)`

Slot content is the one prop each target takes in its own form. A fill, the
content a test puts in a slot, written with `slot` renders in every target as `<em class="SlotFill">text</em>`:
a React node, a Vue slot, a Svelte snippet. The `children` prop is the
default slot, which Vue receives as `default`.

`scopedSlot(binding, text)` fills a scoped slot: it takes the record the
component hands the scope under `binding`, spreads it onto a
`<button class="SlotFill">` and renders `text` in it. React calls the prop as a
function of the scope, Vue passes the scope to the slot, Svelte to the
snippet. A Svelte component in legacy mode receives each fill as the slot of
that name.

The render throws, listing the scope's keys, when the scope has no `binding`
or its value is not a record, so a binding renamed in the component fails
rather than rendering a bare button. A primitive in a scope, such as a row's
`value`, is not a record: bind the record it comes from. The record's `key`
and `ref` are left out in every target, as React and Vue keep them for
themselves.

The record is spread as attributes, so bind one of strings and numbers. A
boolean, a `Date`, a nested object and a `class`, `style` or `children` field
each render differently per target, and the comparison fails on them.

Only what `slot` and `scopedSlot` return counts as a fill: an object with the
same fields is passed to the component as the plain prop it is.

A fill is not checked against what the component declares. A fill under a
slot name the component does not have renders nothing, a scoped fill on an
empty list never runs, so the throw above does not fire, and a host with no
default slot renders without the part. None of those fail, so assert the
fill's text where a test depends on it:

```ts
expect(markup).toContain('New');
```

In Svelte a scoped fill or a host renders through a host component of the
package's own, compiled with your Svelte at first use or by `load`; the
anchors it adds are removed, so the markup reads as a direct render or a
composition written in a `.svelte` file does. The compiled host is written
under `node_modules/.cache/scaffold-ui-kit-testing` beside the package, which
Vitest leaves to Node rather than transforming, or to the system's temporary
directory when the package is read-only.

### `renderReact`, `renderVue`, `renderSvelte`

The same renders for a component already loaded, such as one compiled in the
test: `renderVue(component, props, options)`, with `options.host` as
`{ component, props }`. Vue writes what a component teleports apart from the
markup; `renderVue` appends it after the markup, ordered by teleport target,
as a page would hold it.

## `@scaffold-ui-kit/testing/parity`

### `canonicalMarkup(markup)` and `canonicalNodes(markup)`

The markup of one component in React, Vue and Svelte differs in ways that
render the same document. `canonicalMarkup` smooths those, and only those:

- Comments are dropped: Vue's and Svelte's anchors and template comments.
- React's hoisted `<link rel="preload">` hints are dropped.
- Svelte's event replay attributes (`onload="this.__e=event"`) are dropped.
- Attributes are sorted and their names lowercased, as Vue's server renderer
  writes `viewbox` on an SVG whose attributes it merges.
- A bare attribute is an empty one, and an empty `class` or `style` is
  dropped.
- Class tokens are sorted, and Svelte's scoping classes dropped.
- Inline styles are written tight, custom properties first and sorted.
- Ids from React's and Vue's `useId` and Svelte's `$props.id()` (`s1` from
  the server, `c1` in the browser) become one token, `GENERATED`, in the
  attributes that hold ids, Zag's `data-uid`, `data-ownedby` and
  `data-controls` among them. Numeric parts after an id belong to it, since
  Vue's nested `v-1-0` reads the same as `v-1` with an index after it, so
  `_r_1_-0` and `v-1-0` compare equal.
- Character references are decoded and written back one way.
- A run of whitespace in text is one space.

Tags, nesting, every other attribute value, the text and the whitespace
between elements compare as rendered. `canonicalNodes` returns the same with
one node per entry, so a failed equality points at the node where two
targets part. Three things a kit can meet there:

- The numbers legacy-mode Svelte writes for `ids` compare as written. A
  legacy component takes them from a counter every instance shares
  (`tabs-1`), where React writes `tabs-_R_1_` and Vue `tabs-v-0`, so a
  component that declares `ids` differs in Svelte. Build with
  `svelte.mode: 'runes'`, whose `$props.id()` is smoothed with the others, or
  replace your own prefixes before comparing. The `(?:-\d+)*` takes an index
  a template appends, as in `command-1-0`, which the smoothing folds into the
  id in React's and Vue's markup:

  ```ts
  import { GENERATED_IDENTIFIER } from '@scaffold-ui-kit/testing/parity';

  const stable = (markup: string) =>
    markup.replace(
      /\b(tabs|field|command)-\d+(?:-\d+)*\b/g,
      `$1-${GENERATED_IDENTIFIER}`
    );
  expect(canonicalNodes(stable(svelte!))).toEqual(canonicalNodes(react!));
  ```

- Under `stylesheetPlacement: 'in-file'` a React component renders its
  `<style>` element in the markup and Vue and Svelte do not, so every styled
  component differs. `separate-file`, which `initialize` writes for a kit
  with stylesheets, leaves the styles out of the markup.

- Vue's server render writes a bound `value` on the `<select>` as well as
  marking its option, and React and Svelte do not, so a select bound to a
  value differs on that one attribute, which browsers ignore. It writes
  `indeterminate="false"` on an input with `indeterminate` bound to false,
  where React and Svelte write nothing, and the attribute means nothing in
  HTML. Remove both from Vue's markup before comparing:

  ```ts
  const withoutVueAttributes = (markup: string) =>
    markup
      .replace(/(<select\b[^>]*?)\svalue="[^"]*"/g, '$1')
      .replace(/\sindeterminate="false"/g, '');

  expect(canonicalNodes(withoutVueAttributes(vue!))).toEqual(
    canonicalNodes(react!)
  );
  ```

  A hand-written driver that binds a select through a spread differs by more:
  Vue writes the `value` and leaves the option unmarked, where React and
  Svelte write `selected` on it, and until it hydrates Vue's page shows the
  first option. Bind `:selected` on each option in the Vue driver, which
  gives the same marking as a bound `value`.

```ts
import { canonicalNodes } from '@scaffold-ui-kit/testing/parity';

const { react, vue, svelte } = await renderer.renderAll('Badge', {
  tone: 'calm',
});
expect(canonicalNodes(vue!)).toEqual(canonicalNodes(react!));
expect(canonicalNodes(svelte!)).toEqual(canonicalNodes(react!));
```

Two empty renders compare equal, so a component that renders nothing in every
target passes: assert that the markup holds what it should as well.

`storySource` from `@scaffold-ui-kit/preview` gives a component's html to
compare with. It renders from the template, not `dist/html`, and it is
pretty-printed, so filter the whitespace nodes first:

```ts
const nodes = canonicalNodes(source.html!).filter((node) => node.trim() !== '');
```

### `rootAttributes(markup, { variablePrefix })`

The root element's tag, its classes as a set, and the custom properties of
its inline style, past any anchors or hints a target writes ahead of it.
`variablePrefix` reads only the custom properties under a prefix, such as
`--kit-`. It throws on markup with no element.

## `@scaffold-ui-kit/testing/typecheck`

### `tsconfig.consumer.json`

The compiler options of a fresh Vite project, with `noUncheckedIndexedAccess`
besides: strict, unused locals and parameters, `verbatimModuleSyntax`,
`erasableSyntaxOnly`, `noEmit`. A kit extends it to type-check its built
targets as a strict consumer compiles them, and runs `tsc` and `vue-tsc`
itself. Two of its flags, `noUncheckedSideEffectImports` and
`erasableSyntaxOnly`, need TypeScript 5.8 or later.
`noUncheckedSideEffectImports` also reports every `import './Button.css'` a
built file makes, as a project without Vite's types would. It also sets
`vueCompilerOptions.strictTemplates`, so `vue-tsc` reports a wrong or unknown
prop on a composed component, and `dataAttributes: ["data-*"]`, since Vue
types no `data-*` attribute on an element; `tsc` ignores both. A kit relaxes
one check by setting its own key to `false` in its `vueCompilerOptions`:
`checkUnknownProps`, `checkUnknownEvents`, `checkUnknownComponents`,
`checkUnknownDirectives` or `strictVModel`. A kit on a tsconfig of its own,
rather than this preset, sets `dataAttributes` itself.

`tsconfig.react.json`:

```json
{
  "extends": "@scaffold-ui-kit/testing/tsconfig.consumer.json",
  "compilerOptions": { "types": ["vite/client"] },
  "include": ["dist/react/**/*"]
}
```

`"types": ["vite/client"]` is what a fresh Vite project has, and declares
stylesheet imports. A kit without Vite adds a file to `include` holding
`declare module '*.css';` instead.

### `checkSvelte({ tsconfig, known, directory, threshold })`

Runs svelte-check over the files a tsconfig names, warnings included, and
compares what it reports against a list of known diagnostics. A template
cannot carry a `svelte-ignore` comment for one target, so a warning the
Svelte compiler gives on markup written that way on purpose goes on the list,
with the reason. The check passes when every diagnostic is a known one and
every known one still occurs in each of its files, so the list only shrinks.
A tsconfig that reaches no `.svelte` file throws, naming what it includes, as
there is nothing to pass.

```ts
import { checkSvelte } from '@scaffold-ui-kit/testing/typecheck';

const result = checkSvelte({
  tsconfig: 'tsconfig.svelte.json',
  known: [
    {
      type: 'WARNING',
      reason: 'A row takes a click as a shortcut for the link inside it.',
      files: ['dist/svelte/Table.svelte'],
      message: 'Visible, non-interactive element `<div>` with a click event',
    },
  ],
});
console.log(result.report);
if (!result.passed) process.exit(1);
```

A known entry's `message` is a string the message starts with, or a pattern
it matches; `files` are as svelte-check names them, relative to `directory`
(the current directory by default). `parseSvelteCheckOutput` and
`compareDiagnostics` are the two halves, for output a kit captured itself
with `--output machine-verbose`.

## `@scaffold-ui-kit/testing/browser`

Browser runs on `@scaffold-ui-kit/preview/testing`, with Playwright and
`@axe-core/playwright`. The page is typed by the methods it uses, so a
Playwright `Page` fits, and a `Frame` does not, as `@axe-core/playwright`
calls the page's `mainFrame`. To scan what is in an iframe, open the frame's
URL at the top level of a page.

### `sweepPreview(page, components, options)`

For each component the preview manifest lists, in the target of the current
Playwright project: the default props and every scenario, each mounted
fresh, scanned with axe (WCAG 2.1 A and AA) and walked with the keyboard. A
scenario with slot content of its own is mounted with that content.
Tab must reach each tabbable element in the mount in document order, and
Shift+Tab walk them back. The walk follows Chromium's tab order, the browser
the sweep runs in. A contenteditable editing host counts as tabbable, as
browsers stop Tab on it, and what is inside it, such as a link, does not,
except the content of a `contenteditable="false"` island. A region that
scrolls and holds no keyboard-focusable element counts too, as Chromium stops
Tab on it. Tab moving between the segments of a date, time, datetime-local,
month or week input is one stop; on any other element a Tab that leaves focus
where it was fails the walk. Before the first Tab the walk waits for focus to
hold on its starting stop and puts it back at most twice, which covers focus
that a closing overlay hands back within a few frames; a page that moves focus
later than that, after an exit animation for example, is outside it, and a
focus trap that is no modal is left with focus and its walk fails. After each key
press the walk reads focus once it has held for two frames, so a control that
moves or selects a frame after taking focus, as a select-on-focus field does,
walks the same every run. A failure reads `expected A → B; focus went to X`, each element as `tag#id`, or
by its tag and first three classes when it has no id, and the state in its
brackets carries the id a known entry wants when that differs from the label.
A failure names an element focus reached in the mount that the walk did not
expect as `unlisted:`, and one outside the mount as `outside:`.

An open modal keeps focus inside it, so the walk goes around the modal
instead of through the mount: a native `<dialog>` opened with `showModal()`,
or a shown element with `aria-modal="true"`, wherever in the document it
sits. From where the modal put focus, Tab must reach each of its tabbable
elements in document order and come around to the first it reached, and
Shift+Tab go around the other way; focus resting on the modal itself or on
the body between the last element and the first is the way around. A modal
that lets focus out to the page behind it fails, with the element named as
`outside:`. Of several open modals the walk takes the one holding focus, or
the last in the document. Test what the walk cannot see, such as focus
returning to the trigger when the modal closes, with Playwright locators.

A `listbox`, `grid`, `tree`, `tablist`, `menu` or `radiogroup` in what is
walked must be a single tab stop. One whose items all take Tab fails, and so
does one the keyboard cannot reach: no item takes Tab, and the widget
neither takes it, holds focus, names an `aria-activedescendant` nor is named
by another element's `aria-controls`, `aria-owns` or
`aria-activedescendant`, as a popup's trigger or a combobox's input names
its list. An item takes Tab when it or an element inside it is tabbable;
disabled and hidden items are left out, and native radio buttons, which the
browser groups, are not checked. The walk does not press the arrow keys, so
test that they move focus inside the widget with your own assertions.

A walk failure is accepted like any other, with a known entry under the
`keyboard` rule:

```ts
const KNOWN: KnownViolation[] = [
  {
    rule: 'keyboard',
    component: 'inputs-select',
    states: ['open'],
    reason: 'While open the list holds focus and Tab closes it.',
  },
];
```

```ts
import { test, expect } from '@playwright/test';
import type { PreviewScriptedTarget } from '@scaffold-ui-kit/preview/testing';
import {
  readPreviewManifest,
  sweepPreview,
  type KnownViolation,
} from '@scaffold-ui-kit/testing/browser';

const KNOWN: KnownViolation[] = [
  {
    rule: 'label',
    component: 'components-text-input',
    states: ['default'],
    reason: 'A bare input is labeled by the field that composes it.',
  },
];

test('accessibility', async ({ page }, testInfo) => {
  const target = testInfo.project.name as PreviewScriptedTarget;
  const result = await sweepPreview(page, readPreviewManifest('.'), {
    target,
    known: KNOWN,
    passes: [
      { label: 'dark', options: { mode: 'dark' }, rules: ['color-contrast'] },
    ],
  });
  expect(result.failures).toEqual([]);
  expect(result.stale).toEqual([]);
  expect(result.empty).toEqual([]);
});
```

`result.empty` is where a silent regression shows: a state that stops
rendering is not a failure, so list the states that should be empty, or keep
the list at `[]`.

A known violation is keyed by rule (an axe rule id, `keyboard` for the walk,
or `render` for a story that throws), the component's story id and `states`,
the ids of the states it occurs in (`default` or a scenario id), optionally
narrowed to targets and to passes by label (`base` for the first, under the
preview's defaults), and carries its reason. An entry with a `scenarios` key
throws, naming `states`, before anything runs.

`sweep.occurred` lists the known violations that occurred, each once, as a
`{ rule, component, state, target, pass }` record. It is plain data, so a
sweep written to JSON and read back can still be given to `staleViolations`.
`stale` lists every entry and state that no longer occurs, judged for the
components the sweep covered: an entry that names passes must occur in each
of them, one that names none in at least one. A pass named that no sweep ran
is listed, and so is an entry whose component has no story in the preview
(a misspelled id or a part); an entry for a story the sweep was not given is
left alone, so a sweep over part of a kit judges that part. The story list
is the swept target's, so an entry for a component that renders in some
targets only needs `targets` under a sweep that was not given it, or it is
listed in the targets without the story. `passes` scan every state
again under preview option values; each pass loads the page afresh, so its
values never add to another pass's. Each state mounts what the preview's
panes mount: a prop given `null` is left out, so the component's own default
applies, and a two-way prop stays, controlled at `null`.

A story that throws as it renders fails the state: a line under the `render`
rule, with the message it threw, and the state's axe scan and walk skipped, as
there is nothing of it to check. The sweep carries on to the next state, and
a known entry with `rule: 'render'` can name it. This reads the preview pane's
own report, so a kit's error boundary that catches a throw inside a story, or
the word "error" in a story's content, does not fail a state.

A state that renders nothing, a dismissed banner or a pagination hidden at
one page, is a state like any other: the sweep passes it and lists it in
`empty`, on `sweepComponent`'s result and on `sweepPreview`'s, as a line such
as `[dismissed] rendered nothing, so nothing was scanned or walked`. Empty
means nothing in the mount or on the page's body beside it two frames after
the pane finished mounting the story; a kit's preview `mount` wrapper is the
frame around the story and never counts, however much markup it has. A story
that fills itself in later than that reads as empty rather than being waited
for: content behind a dynamic import, a network request, a timer over about
32 ms, or Suspense without a fallback. A state the pane never finishes
mounting, such as on a page that has stopped, still fails: the sweep throws
after 15 seconds, naming the component and the state.

A sweep that would check nothing throws rather than passing, and the message
names what exists: `sweepPreview` when no component given has a story of its
own in the target, `sweepComponent` for a part, which has no story of its own
and renders inside its root, or a target the component does not list, and a
pass or `mountStory` for an option or story id the preview does not define,
or an option value the option does not list. A `tags` value no axe rule
carries throws too, naming it, even beside a tag a rule does carry, and an
empty `tags` or `rules` list throws.

`tags` replaces the axe rule tags, WCAG 2.1 A and AA by default, for the first
pass and any pass that names no `rules`; a pass with `rules` runs those alone.
The default tags leave out `best-practice` rules, among them
`aria-dialog-name`, so a nameless dialog stays green. A kit with dialogs adds
a pass for that rule:

```ts
passes: [{ label: 'dialogs', options: {}, rules: ['aria-dialog-name'] }],
```

The rule checks an element with `role="dialog"` or `role="alertdialog"` while
it is shown, so a story has to open the dialog, and a native `<dialog>`
without the role passes with no name at all. Check that one's name with
Playwright, in a test that opens it:

```ts
await expect(page.getByRole('dialog')).toHaveAccessibleName('Delete project?');
```

Giving the `<dialog>` an explicit `role: 'dialog'` brings it under the rule
too, and the Svelte compiler warns of the redundant role (the build prints
`a11y_no_redundant_roles`), which the Svelte extension's `ignore` silences.

Adding `best-practice` to `tags` instead also reports `landmark-one-main`,
`page-has-heading-one` and `region` on every state, as the page a story mounts
in is not a document of its own.

The sweep reports axe's violations and leaves out its `incomplete` results,
the checks axe could not decide: white text on a white background reads 1:1
and stays green.

`sweepComponent(page, component, options)` sweeps one component and returns
its failures, for a test per component; the manifest is ready when the test
file loads, as Playwright starts the preview first. It throws for a component
with no story of its own, so the loop filters with `sweepsComponent`, which
also leaves out a component a target does not render:

```ts
for (const component of readPreviewManifest('.')) {
  test(component.id, async ({ page }, testInfo) => {
    const target = testInfo.project.name as PreviewScriptedTarget;
    test.skip(!sweepsComponent(component, target));
    const sweep = await sweepComponent(page, component, { target });
    expect(sweep.failures).toEqual([]);
  });
}
```

`staleViolations(known, sweeps, target)` judges the known entries over the
sweeps a run collected. It only sees the components you swept, so an entry
whose component id is misspelled is not listed, as nothing tells it that
story from one the target does not render. `sweepPreview`, given the whole
manifest, does list it; use it where the known list needs that check.
`scanAccessibility(page, { rules, tags })` and `walkKeyboard(page)` are the
two checks on their own, for a story a test has mounted itself. A scan
checks a page as it stands, so it needs that story mounted first. A walk
throws over an empty mount or a story that threw, as it would check nothing.
`walkKeyboard(page, { mountId })` walks the element with that id on a page of
your own. A walk returns `expected`, the tabbable elements in document order,
`forward` and `backward`, the elements Tab and Shift+Tab reached, and
`failures`, one line each, empty when the walk held.
`readPreviewManifest(kitRoot)`, from `@scaffold-ui-kit/preview/testing` and
re-exported here, reads `.preview-generated/manifest.json`, which the preview
writes when it starts.

## License

MIT
