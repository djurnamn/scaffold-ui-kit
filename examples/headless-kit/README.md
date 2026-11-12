# Headless kit example

An unstyled, accessibility-first primitives kit, in the spirit of the headless
component libraries: it renders behavior and ARIA wiring, and the app brings
every style. Each component is written once as a
[js-template-engine](https://www.npmjs.com/package/js-template-engine)
template in `src/components/` and built by
[scaffold-ui-kit](https://www.npmjs.com/package/scaffold-ui-kit) to React,
Vue 3.5 and Svelte 5.

The components render no classes and no styles. State reaches the page only
as ARIA and `data-state`, `data-disabled` and `data-orientation`, and every
component works controlled or uncontrolled.

## Components

| Component                                                 | WAI-ARIA Authoring Practices pattern | State the consumer styles                                                                                        |
| --------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `Toggle`                                                  | Button (toggle button)               | `aria-pressed`, `data-state="on" \| "off"`, `data-disabled`                                                      |
| `Switch`                                                  | Switch                               | `role="switch"`, `aria-checked`, `data-state="checked" \| "unchecked"` on the button and its `data-part="thumb"` |
| `Checkbox`                                                | Checkbox (tri-state)                 | `aria-checked="true" \| "false" \| "mixed"`, `data-state="checked" \| "unchecked" \| "indeterminate"`            |
| `RadioGroup`                                              | Radio Group (roving tabindex)        | `role="radiogroup"` with `data-orientation`; each `role="radio"` has `aria-checked` and `data-state`             |
| `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` | Disclosure                           | `aria-expanded` and `aria-controls` on the trigger, `data-state="open" \| "closed"` on all three                 |
| `Tooltip`, `TooltipTrigger`, `TooltipContent`             | Tooltip                              | `role="tooltip"` while open, `aria-describedby` on the trigger while open, `data-state`                          |
| `Modal`                                                   | Dialog (modal)                       | `role="dialog"`, `aria-modal`, `data-state`; focus is trapped and returned, the background is inert              |
| `Select`                                                  | Select-only combobox                 | `role="combobox"` and `aria-expanded` on the trigger, `role="listbox"`, `data-state` and `data-highlighted`      |

Keyboard behavior follows each pattern: Space and Enter toggle a Switch,
Enter does nothing on a Checkbox, the arrow keys move through a RadioGroup
(skipping disabled options and wrapping), and Escape closes an open Tooltip
wherever focus is. A Tooltip opens after `openDelay` on hover and at once on
focus, and the pointer may move onto its content without it closing. A closed
`CollapsibleContent` stays in the DOM, `hidden`, so the trigger's
`aria-controls` always resolves.

## Styling through data attributes

A consumer styles the components with selectors on roles and data attributes:

```css
button[aria-pressed][data-state='on'] {
  background: rebeccapurple;
  color: white;
}

[role='switch'] [data-part='thumb'][data-state='checked'] {
  background: rebeccapurple;
}

[role='checkbox'][data-state='indeterminate'] {
  background: orange;
}

[role='radiogroup'][data-orientation='horizontal'] {
  display: flex;
}
```

`preview/themes/consumer-example.css` is a fuller example of such a
stylesheet. It belongs to the preview, standing in for the app's own styles,
and is not part of the kit. The preview's `theme` option switches between it
and `Unstyled`, which shows the components as they ship.

## Controlled and uncontrolled

Every stateful component takes a value prop, a default prop and a change
callback, generated from one `bindable` declaration in the template:

```tsx
// React
<Switch checked={on} onCheckedChange={setOn} aria-label="Wi-Fi" />
<Switch defaultChecked aria-label="Wi-Fi" />
```

```vue
<!-- Vue -->
<Switch v-model="on" aria-label="Wi-Fi" />
<Collapsible v-model:open="open">...</Collapsible>
```

```svelte
<!-- Svelte -->
<Switch bind:checked={on} aria-label="Wi-Fi" />
<Switch defaultChecked onCheckedChange={(checked) => console.log(checked)} aria-label="Wi-Fi" />
```

Compound parts are written the same way in every framework:

```tsx
<Tooltip openDelay={300}>
  <TooltipTrigger aria-label="Save">Save</TooltipTrigger>
  <TooltipContent>Saves the draft</TooltipContent>
</Tooltip>
```

## What to look at

- **Two-way values.** `src/components/toggle.ts` declares `pressed` with a
  `bindable` protocol and nothing else: React gets `useState` with
  `pressed` / `defaultPressed` / `onPressedChange`, Vue an `update:pressed`
  emit (and a bare `v-model`, from `extensions.vue.model`), Svelte a
  `$bindable()` prop. Toggle, Switch, Checkbox and RadioGroup have no
  per-target code at all.
- **Attributes reach the DOM.** A single-element root is `passthrough: true`,
  so a consumer's `aria-*`, `data-*`, `id`, `class`, ref and handlers land on
  the rendered element. An `aria-describedby` a page passes to
  `TooltipTrigger` joins the tooltip's own id. `src/components/switch.ts` has
  two root nodes (the button and a hidden form input), and the compound roots
  sit inside a context, so those gather the consumer's attributes with `rest`
  and spread them with `$spread`.
- **Ids per instance.** `src/components/collapsible.ts` and
  `src/components/tooltip.ts` declare their ids in `ids`. Each target
  generates them its own way (`useId()` in React and Vue, `$props.id()` in
  Svelte), and the parts wire them into `aria-controls` and
  `aria-describedby`.
- **Compound components.** The Collapsible and Tooltip roots share their state
  with their parts through each framework's context. The context type is one
  shared `imports` line; the root's outer node is a `fragment` whose React
  override renders `<CollapsibleContext value={context}>`, while Vue and
  Svelte provide the context from the script.
- **Scoped slots.** `Checkbox` hands `{ checked, state }` to its default slot
  for an indicator, and `RadioGroup` hands each option to its slot, with the
  option's label as the fallback. `RadioGroupOption` is a module-scope type
  every target exports.
- **Shared behavior.** RadioGroup's arrow-key focus and Tooltip's timers and
  Escape listener are one `script` for every target, and Checkbox cancels
  Enter with the `['prevent', 'enter']` event modifiers. What Tooltip writes
  per target is the lifecycle: a timer holder that lives as long as the
  instance and is cleared on unmount (`useRef`, `onBeforeUnmount`,
  `onDestroy`), and an effect that attaches the document-level Escape
  listener while open (`useEffect`, `watchPostEffect`, `$effect`).
- **State machines.** `Modal` and `Select` run [Zag](https://zagjs.com)
  machines. `src/components/modal-visual.ts` and `select-visual.ts` are the
  markup, one template for every target; `src/drivers/<target>/` holds the
  machine for each framework, and `preview/manual-components.ts` describes
  those components to the preview. `@scaffold-ui-kit/helpers` covers what the
  machines leave to a kit: naming a dialog that has no visible title, returning
  focus when the trigger is gone, and naming a select's trigger and listbox.
- **Documentation from the template.** Each `description` becomes TSDoc in
  React, Vue and Svelte and appears in the preview.
- **Preview stories.** `preview/stories/` gives each component its slot
  content and scenarios: a `Controlled` story where the story owns the value,
  so acting in one framework's pane moves all three, plus `Indeterminate`,
  `In a form`, `Horizontal`, `Open by default` and `No delay`.

## Build and check

```bash
npm install
npm run build          # render every template into dist/react, dist/vue and dist/svelte
npm run typecheck      # tsc on the templates, then tsc, vue-tsc and svelte-check on dist/
```

The build also compiles each Svelte component with the installed Svelte and
reports its warnings.

## Tests

```bash
npm run test                 # server-render each component in all three targets and compare the markup
npm run typecheck:consumer   # type-check dist/ under a strict consumer's compiler options
npm run test:browser         # build the preview, then axe, a keyboard walk and behavior in each target
```

The tests use [@scaffold-ui-kit/testing](https://www.npmjs.com/package/@scaffold-ui-kit/testing).
`tests/parity.test.ts` holds `data-state` and ARIA to the same markup in React,
Vue and Svelte. `tests/browser/accessibility.spec.ts` sweeps every story and
scenario, walking around an open modal, and lists what it accepts as known,
each with its reason. `tests/browser/behavior.spec.ts` covers what the
sweep can't see, such as a modal returning focus and a select's keyboard.

## Preview

```bash
npm run build
npm run preview          # serve the preview with scaffold-ui-kit-preview dev
npm run preview:build    # or write a static preview to .preview-static/
npm run check            # check every story against its component
```

The preview shows each story in React, Vue and Svelte side by side, with the
generated code and the HTML. Its configuration is the `preview` block in
`scaffold-ui-kit.ts`.

## Copying components with add

The build writes a consumer command to `bin/add.mjs`, run by
[@scaffold-ui-kit/add](https://www.npmjs.com/package/@scaffold-ui-kit/add).
It copies built components into another project, together with the parts
and roots they import:

```bash
node bin/add.mjs add --list
node bin/add.mjs add switch --target react --output-directory ../my-app/src/components/ui
node bin/add.mjs add tooltip-trigger tooltip-content --target vue
```

A kit published under its own name runs the same command as
`npx <package-name> add`.

## Targets

`scaffold-ui-kit.ts` builds `react`, `vue` and `svelte`, with
`svelte: { mode: "runes" }` (Svelte 5.29 or later). There is no styling extension:
the kit ships no styles.

A Vue consumer that type-checks with `strictTemplates` allows `data-*` attributes,
which this kit's components are built on, with
`"vueCompilerOptions": { "dataAttributes": ["data-*"] }` in its `tsconfig.json`,
as `tsconfig.vue.json` does here. The `@scaffold-ui-kit/testing` consumer preset
sets it already.

The React `Modal` renders only its trigger on the server; a dialog that starts
open appears once the page has hydrated.
