# Using it from code

Part of the [@scaffold-ui-kit/preview](../README.md) documentation.

The package exports the pieces the commands are built from, for a kit's own
scripts and tests. One is `storySource`, which prints a story as the code a
consumer would write in each target, importing from the kit's package
entries. A docs site can show it next to the component, and the snippets
follow the story files. A default slot the story leaves unfilled is empty in
every target, without the component's name the panes show there. A two-way prop the story gives is bound as the code
view binds it (see [A story's code](writing-a-shell.md#a-storys-code)):

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
written per target renders its `html`. A story holding any other
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
