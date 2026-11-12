# @scaffold-ui-kit/helpers

Helpers for kits built with
[scaffold-ui-kit](https://github.com/djurnamn/scaffold-ui-kit): style helpers
for writing templates, and the runtime a kit's hand-written components call
on every target.

```sh
npm install @scaffold-ui-kit/helpers
```

The package has five entry points. Import from the one you need; nothing is
exported from the package root.

## `@scaffold-ui-kit/helpers/template`

For template files, which run when the kit builds.

### `oneOf(axis, cases)`

An element's modifiers that set the same properties form an axis, weakest
first. `oneOf` writes one rule per member, each guarded against the members
that beat it, so no two rules overlap and neither specificity nor source
order decides which applies.

```ts
import { oneOf } from '@scaffold-ui-kit/helpers/template';

styles: {
  ...oneOf(['--boxed', '--dense'], {
    none: { padding: '0' },
    '--boxed': { padding: '1rem 2rem' },
    '--dense': { padding: '0 1rem', '&__title': { fontSize: '0.875rem' } },
  }),
}
// '&:where(:not(#{&}--boxed, #{&}--dense))': { padding: '0' }
// '&--boxed:where(:not(#{&}--dense))':        { padding: '1rem 2rem' }
// '&--dense':                                  { padding: '0 1rem' }
// '&--dense > &__title':                       { fontSize: '0.875rem' }
```

A member is any selector suffix: a modifier, a pseudo-class, an attribute.
The keys are Sass, so they suit a kit that compiles its styles with Sass. An
element of the block nested in a case is reached as the member's child, so a
copy of the block nested inside keeps its own members. A key that starts
with `& ` (`'& &__search'`) reaches the element as a descendant instead. It is
for an element of this block that the block passes into a slot of a
component it composes, where a child path would spell out that component's
markup. It never reaches an element of another block. A pseudo-element is
appended to the case's selector, and a selector list is joined one selector
at a time.

### `definePreamble({ always, modules })`

Gives a kit its `stylePreamble`: the `@use` lines a component's stylesheet
opens with. The kit names its modules once, and each component asks for the
ones it uses.

```ts
import { definePreamble } from '@scaffold-ui-kit/helpers/template';

export const stylePreamble = definePreamble({
  always: ['@use "styles/layer-order";'],
  modules: {
    mixins: '@use "styles/mixins" as *;',
    color: '@use "styles/color" as color;',
  },
});

// in a template
style: stylePreamble('mixins', 'color'),
```

The module names are typed, and an unknown name throws. Sass loads a module
once per compilation, so a module that emits CSS, such as a layer order
statement, comes out once in a bundle and once in each per-component
stylesheet.

## `@scaffold-ui-kit/helpers/runtime`

For a kit's components in React, Vue and Svelte. It imports no framework.

### `mergeRootProps(behaviorProps, consumerProps)`

Merges the attributes a consumer puts on a component onto a root element
whose props a behavior also supplies, such as a state machine's prop getter.
The behavior keeps every key it supplies (an `id`, its ARIA, its data
attributes), and the consumer's attributes go beside them:

- `class` and `className` join.
- `style` merges, the behavior's declarations winning where both set one. A
  style given as text merges as text.
- A handler both give runs both, the consumer's first. If the consumer's
  calls `preventDefault()`, the behavior's is skipped.
- Vue's several listeners for one event, an array on the key, run in order as
  Vue runs them, and the behavior's runs after the last unless any of them
  prevented the default. A listener that throws stops the ones after it and
  the behavior's, where Vue's own array runs on, and
  `stopImmediatePropagation()` skips the rest of the array but not the
  behavior's.
- The default-prevented check reads the event as it arrives, so a child's
  `preventDefault()` that bubbled to the root skips the behavior's too.
- A behavior's array is not composed: an array on the behavior's side replaces
  the consumer's handler.
- Every key the behavior leaves undefined is the consumer's.

```tsx
// React
<div {...mergeRootProps(api.getRootProps(), rest)} />
```

```vue
<!-- Vue -->
<div v-bind="mergeRootProps(api.getRootProps(), attrs)" />
```

```svelte
<!-- Svelte -->
<div {...mergeRootProps(api.getRootProps(), rest)}></div>
```

Each target's own spelling is read as it comes: React's `onClick` and
`className`, Vue's `onClick` and `class`, Svelte's `onclick` and `class`.

### `consumerClass(consumerProps)` and `withoutClass(consumerProps)`

For a root that is an element of the component's own markup, whose class
list is written beside the attributes it spreads: put the consumer's class
into that list and spread the rest.

```svelte
<div class="menu {consumerClass(rest) ?? ''}" {...withoutClass(rest)}></div>
```

### `scriptFailureBootstrapScript({ prefix })`

An inline script that stamps `data-<prefix>-scripts="failed"` on `<html>`
when the page's scripts fail to load. A browser that runs no scripts matches
`@media (scripting: none)`, but one whose scripts are blocked or never
arrive matches nothing, so content that only a script reveals, such as a
Tabs' other panels, would stay hidden. The script loads nothing itself and
stamps the attribute on the first failure: a `<script>` or a script preload
whose request failed, or a dynamic `import()` that could not fetch its
module. While nothing fails it stamps nothing.

Place it in `<head>`, before the page's own scripts:

```tsx
<head>
  <script
    dangerouslySetInnerHTML={{
      __html: scriptFailureBootstrapScript({ prefix: 'djui' }),
    }}
  />
</head>
```

The kit keeps the other half. Each driver marks its root once it mounts,
and the fallback CSS applies to a root without that mark, under
`scripting: none` or on a failed page:

```css
@media (scripting: none) {
  .DjuiTabs:not(.DjuiTabs--scripted) .DjuiTabs__panel {
    display: block;
  }
}
[data-djui-scripts='failed']
  .DjuiTabs:not(.DjuiTabs--scripted)
  .DjuiTabs__panel {
  display: block;
}
```

`scriptFailureAttribute(prefix)` returns the attribute name, here
`data-djui-scripts`. A Content Security Policy that blocks inline scripts
needs a nonce or a hash for this one.

## `@scaffold-ui-kit/helpers/runtime/svelte`

For Svelte components. Requires `svelte` 5.29 or later, an optional peer
dependency of the package.

### `portal`

A Svelte action that moves its node into another container, `document.body`
by default: Svelte's counterpart of React's `createPortal` and Vue's
`<Teleport>`.

```svelte
<script>
  import { portal } from '@scaffold-ui-kit/helpers/runtime/svelte';
</script>

<div use:portal={'body'}>...</div>
```

A template reaches it through a Svelte-only attribute, `use:portal`, and
imports it by this package's specifier.

### `portalTo(target)`

The attachment form of `portal`, for a component that spreads its props onto
its root:

```svelte
<Panel {...rest} {...portalTo('body')} />
```

## `@scaffold-ui-kit/helpers/zag`

For components built on [Zag](https://zagjs.com) machines. It imports neither
Zag nor a framework: the helpers work on the prop records and elements a
machine produces.

### Naming

- `resolveOverlayLabeling(props, label?)` drops the `aria-labelledby` a
  machine points at a label or title part the kit does not render, and sets
  `aria-label` from `label` when one is given. A dangling reference is the
  highest-priority name source, so left in place it would leave the control
  nameless.
- `withoutUnrenderedDescription(props)` drops the `aria-describedby` a
  machine points at a description part the kit does not render. Popover's
  can outlive its first frame in React and Vue, pointing at nothing.

  Both are for a part the kit leaves out, such as a dialog with no title:

  ```ts
  let contentProps = api.getContentProps();
  if (!title) contentProps = resolveOverlayLabeling(contentProps, label);
  ```

- `mergeTriggerProps(machineProps, consumerProps, { labelId, valueId })`
  merges a consumer's props over a Select trigger's (the consumer's win) and
  names the trigger by the consumer's own `aria-labelledby`, then the
  visible label, then the shown value. A consumer's `aria-label` wins
  outright. A kit with a label element of its own passes that element's id as
  `labelId`: left out, the trigger's `aria-labelledby` names only the value,
  which overrides a wrapper's `<label for>`.
- `labelListbox(contentProps, triggerProps, labelId)` names the listbox by
  the visible label, else the trigger's `aria-label`, else the trigger.
- `selectValueId(triggerId)` and `selectLabelId(triggerId)` derive the ids
  of the value and label elements from the trigger's id, so a server and a
  client render agree. Give the element the same call's result.

```ts
const triggerId = api.getTriggerProps().id;
mergeTriggerProps(api.getTriggerProps(), triggerProps, {
  labelId: label ? selectLabelId(triggerId) : undefined,
  valueId: selectValueId(triggerId),
});
```

### Dismissal, focus and forms

- `closingOnPressOutside(inside, close)` closes a non-modal overlay at the
  press itself, before the press reaches what it lands on, so a press on
  another overlay's trigger opens that overlay in one press. It returns the
  detach.
- `returningFocus()` gives `remember()`, to call as a dialog opens, and
  `finalFocusEl(getTriggerId, finalFocus)`, which returns the function for
  Zag's prop of that name. `getTriggerId` is a getter, so the id is read as
  the dialog closes: when neither the trigger nor the element that had focus
  is on the page any more, focus goes to the consumer's `finalFocus` instead
  of the page.

  ```ts
  const focusReturn = returningFocus();
  // in the machine's props
  onOpenChange(details) {
    if (details.open) focusReturn.remember();
  },
  finalFocusEl: focusReturn.finalFocusEl(
    (): unknown => api.getTriggerProps().id,
    finalFocus,
  ),
  ```

  The getter's `(): unknown` is what a `strict` type-check needs: `api` comes
  from the machine these props go to, so without a return type the compiler
  reports `api` and the machine as referencing themselves (TS7022). In Vue the
  getter reads `api.value.getTriggerProps().id`, and in Svelte through
  `machineApi` it reads `$api.getTriggerProps().id`.

  Zag calls `onOpenChange` as the machine opens, before focus moves in. It
  does not call it for a controlled `open` the consumer sets from outside the
  dialog, so nothing is remembered there: with no trigger on the page, focus
  goes to `finalFocus` even where the element that had focus is still on the
  page.

- `clearingOnReset(input, clear)` clears a combobox's value when its form
  resets, which otherwise empties the text and keeps the value. It returns
  the cleanup.

## `@scaffold-ui-kit/helpers/zag/svelte`

### `machineApi(start, derive)`

Bridges a Zag machine into a Svelte store of its connected `api`, so a
component reads one `$api` that stays current as the machine changes. Call
it during component initialization.

```svelte
<script lang="ts">
  import * as dialog from '@zag-js/dialog';
  import { normalizeProps, useMachine } from '@zag-js/svelte';
  import { machineApi } from '@scaffold-ui-kit/helpers/zag/svelte';

  const api = machineApi(
    () => useMachine(dialog.machine, { id }),
    (service) => dialog.connect(service, normalizeProps),
  );
</script>

<button {...$api.getTriggerProps()}>Open</button>
```

Static props are enough here. A machine with controlled state takes Zag's
getter form instead, `useMachine(dialog.machine, () => ({ id, open }))`, so
the machine reads each change.

It is a Svelte module (`machine.svelte.js`), so the build must compile Svelte
modules in dependencies, as `@sveltejs/vite-plugin-svelte` does. Requires
`svelte` 5.29 or later.

## License

MIT
