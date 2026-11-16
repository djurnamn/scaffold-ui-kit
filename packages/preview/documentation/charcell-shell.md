# The charcell shell

Part of the [@scaffold-ui-kit/preview](../README.md) documentation.

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
  `controller` ([The controller](writing-a-shell.md#the-controller)), and may return a function that unmounts it.
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
