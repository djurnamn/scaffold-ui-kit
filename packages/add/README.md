# @scaffold-ui-kit/add

The consumer CLI behind every kit built by
[scaffold-ui-kit](https://github.com/djurnamn/scaffold-ui-kit). You rarely
install it yourself: a kit depends on it, and the kit's own command runs it.

```sh
npx <kit-name> add button --target react
```

That copies the kit's built `Button` for React into `src/components/ui`,
together with everything it needs: the components it composes, its
stylesheet, and the shared files the kit declares. The copies are yours to
edit. `add` remembers what it wrote, so `status` can later tell your edits
from the kit's changes and `update` can merge them.

Four commands do the work:

- `initialize` writes your settings for the kit: the target, where copies
  go, an import alias, and what you own.
- `add [component...]` copies components as your settings place and own
  them. It is the default command, so `npx <kit-name> button` works too; a
  component whose name is also a command's (`status`, say) is added with
  `add status`.
- `status` lists every copy, whether you edited it, and whether the
  installed kit would write it differently.
- `update [component...]` brings copies to the installed kit.

Run them from anywhere in your project: they work from its package root,
the nearest directory up with a `package.json`. Every command takes
`--help`.

## Settings

`initialize` asks for each setting and writes them to `<kit>.json` at your
package root: the kit's package name with any scope joined by a hyphen, so
`@acme/ui` gives `acme-ui.json`, unless the kit names the file itself. Run
it again to change your answers; it offers your current settings as the
defaults. The target's default, with no settings yet, is the one framework
your `package.json` lists among the kit's targets, or the kit's first target
when none or several match. `--yes` takes the defaults without asking, and a
flag sets each answer for a script: `--target`, `--layout`, `--component-pattern`,
`--stylesheet-pattern`, `--part-pattern`, `--shared <name=path>`,
`--alias <prefix=alias>` and `--own`. When your package root is above the
directory you ran it from, `initialize` prints the file's full path and says
why it went there.

```json
{
  "target": "react",
  "layout": {
    "component": "src/components/{name}/index.{extension}",
    "stylesheet": "src/components/{name}/index.{stylesheet-extension}",
    "part": "src/components/{component}/{name}.{extension}",
    "shared": { "scripts": "src/lib/scripts", "styles": "src/styles/kit" }
  },
  "alias": { "src/": "@/" },
  "own": ["component", "stylesheet"]
}
```

- `target` - `react`, `vue`, `svelte` or `html`, among those the kit is
  built for. `--target` overrides it for one run.
- `layout` - where each piece goes, as a path from your package root.
  `component` places a component, `stylesheet` its stylesheet, `part` a
  compound's part (a dialog's trigger, say), and `shared` each of the kit's
  shared modules by name. A pattern takes `{name}` (`TextInput`),
  `{kebab-name}` (`text-input`), `{component}` (the compound a part belongs
  to, or the component's own name), `{extension}` (`tsx`, `vue`, `svelte`,
  `html`) and `{stylesheet-extension}` (`css`, `scss`). `initialize` offers
  two presets: `flat`, every copy in `src/components/ui`, and `folder`, a
  folder per component under `src/components` with its parts beside it
  (`index.tsx` for React, so the folder is the import; the component's name
  for the other targets). Left out, the layout is flat.
- `alias` - path prefixes and the aliases your bundler resolves them by. An
  import between copies that climbs out of its own directory uses the alias
  (`@/components/Button`); one in the same directory or below stays
  relative. Stylesheets always load each other by relative path.
- `own` - what you own by default: `component`, `stylesheet`, `shared`
  (every shared module) or `shared:<name>` (one). Left out, you own
  everything. `--own` overrides it for one run.

An unknown key or token is an error naming it, as is a `component` or
`part` pattern without `{extension}` (a stylesheet-only copy's module takes
`.ts` there) and an alias prefix that does not end in `/`. Paths separate directories
with `/`, never `\`, so the settings read the same on every platform; a
backslash is an error. A shared module
the kit does not have is a warning, since another version of the kit may
have it. A path one target's copy holds is not written for another target:
the same content is kept as it is, still recorded for the first target, and
other content is skipped. Give each target its own layout.

Without settings, `add` copies everything flat into `src/components/ui`
and suggests `initialize`. `--output-directory <path>` (`-o`) puts one run's
new copies flat in another directory, whatever the settings say; a file
already recorded stays where it is, and `add` says so.

## What you own

A piece you own is copied into your project; a piece you do not own stays
in the kit's package, and the copies import it from there. A kit decides
how far you can split a component: one built for full ownership has you
copy every piece of a component whatever `own` says, and says so in one
line. The html target always copies everything: there is no module to
import from.

**The component and its stylesheet** (`own: ["component", "stylesheet"]`).
Both are copied, and the component links the copied stylesheet:

```sh
npx acme-ui add text-input
```

```
added src/components/TextInput/index.tsx
added src/components/TextInput/index.css
added src/components/InputWrapper/index.tsx
added src/components/InputWrapper/index.css
```

The components a copy composes come along (`TextInput` renders
`InputWrapper`), and every import between the copies is rewritten to the
copies' places. When the kit declares an owned cascade layer, a copied
stylesheet's rules move into it, and so do a copied Vue or Svelte
component's own style block's. A composed component already in your project stays as it
is, a stylesheet-only copy included: the new copy imports what is there,
and only naming the component changes its form (owning a shared module it
was copied without changes its imports; see below). A helper module a
hand-written component imports is copied once, beside the first copy that
needs it, and every copy that imports it points there; it stays as long as
any of them does. The `_layer-order.scss` an SCSS kit with a layer order
writes beside its stylesheets, which each sheet loads first so the order
compiles ahead of what its other modules emit, is copied the same way,
beside the first copied stylesheet, or beside the first copied Vue or Svelte
component whose own style block loads it, so your copies compile with your
own sass as the kit's do.

**Only the stylesheet** (`own: ["stylesheet"]`). The stylesheet is copied,
and beside it a module that loads it and re-exports the component from the
package, so you import the component from your project as if you owned it:

```ts
import './index.css';
export * from 'acme-ui/react/TextInput';
```

For Vue and Svelte the module re-exports the default export by name too
(`export { default as TextInput } from 'acme-ui/vue/TextInput.vue'`). A
compound's module also re-exports the parts you do not own. If the kit
links each component to its own stylesheet, the package's component loads
the kit's stylesheet as well, and `add` says so; a kit that declares an
owned cascade layer moves a copied stylesheet's rules into it, after the
components' layer, so your copy wins. A kit that publishes its components
unlinked (`stylesheetLink: "both"`) loads only your copy.

**Only the component** (`own: ["component"]`). The component is copied and
links the kit's compiled CSS for it from the package
(`import 'acme-ui/react/Badge.css';`), so the kit's styling still applies
and the markup is yours.

**Shared modules** (`own: [..., "shared"]` or `"shared:styles"`). A kit's
shared modules are what its components import that is not a component: a
scripts module, Sass helpers, a theme. An owned module is copied, every file
of it or, when the kit says so, only the files the copies import, followed
through the module. The files a copied stylesheet references through
`url(...)`, such as fonts, come with it. A module you do not own stays in
the package: a copied stylesheet loads it by a `pkg:` URL
(`@use "pkg:acme-ui/styles/tokens"`), which Sass resolves with its
`NodePackageImporter`. A shared file already in your project is used
wherever it came from; one copied from an older kit version is replaced if
you did not touch it, and kept with a warning if you did.

**Changing your mind.** Running `add` again with other ownership changes
the copy: owning the component of a stylesheet-only copy replaces the
re-export module with the component (`removed
src/components/TextInput/index.ts (replaced by the copy)`), and owning less
does the reverse. A file you edited is not removed without `--force`, and
a file another copy still imports is not removed at all; either way `add`
leaves the component as it was and says why, so a re-export module and a
copy never sit side by side. On Vue and Svelte the copy's file name differs
from the module's (`Chip.vue` and `Chip.ts` in the folder layout), so an
import of the component in your own code changes with its form.

Owning a shared module you did not own before reaches the copies the named
component composes as well: one copied without the module keeps its form,
but is written again so its imports point at the module's copies, and the
files it reaches come along, as if it had been added with this run's
ownership. It links its stylesheet as it did, whatever `--stylesheet-link`
this run passes. One you edited is not written over: it is kept with a
warning naming the imports still pointing at the package, and since the
files it reaches are copied all the same, `update` merges the change into
your edits.

Owning fewer shared modules removes nothing. The module's copies stay in
your project, and every copy that imported them, the ones this run writes
included, keeps importing them rather than the package. To go back to the
package's module, point those imports at the package and delete the
copies yourself, with their entries in the ledger (`.<kit>/copies.json`).

**Compounds.** Adding a compound's root copies the root alone. Its parts
stay imports from the package unless you own them already or name them:

```sh
npx acme-ui add dialog dialog-trigger dialog-content
```

A part copied without its root imports the root from the package. When the
parts left in the package read the package's root rather than your copy,
`add` names them, for you to add them too. A root added after its parts
says that their copies still import the package's root; `update` points
them at the new copy. A kit built for full ownership
copies a root's parts with it.

After each run `add` prints the packages the copies need that your
`package.json` does not list - the target's framework, what the code
imports, the kit itself for what stays in it, and the packages a stylesheet
loads through `pkg:` URLs - each with the kit's version range, then the
kit's own notes.

## Copies, edits and updates

`add` records every file it writes in a ledger, `.<kit>/copies.json`, and
keeps each file's content as written beside it in `.<kit>/bases/`, named by
its hash. Your project's root holds only your settings, `<kit>.json`; the
`.<kit>/` folder is the tool's own state, like `.changeset/`. Commit it, and
leave it to the commands to edit: it is how `status` and `update` know what
you changed. A ledger that is not as the commands write it, such as an entry
naming settings the table lacks after a hand-merged conflict, is an error
naming the file and each problem. Later commands find copies through the
ledger, so a copy stays where it is when you change `layout`; the layout
only places new files.

```json
{
  "format": 1,
  "settings": {
    "3f9c2a1b": { "target": "react", "layout": { "...": "..." }, "own": ["component", "stylesheet", "shared"], "stylesheetLink": "component" }
  },
  "files": {
    "src/components/TextInput/index.tsx": {
      "component": "TextInput",
      "piece": "component",
      "source": "dist/react/TextInput.tsx",
      "sourceHash": "sha256-...",
      "kit": "1.2.0",
      "add": "2.3.0",
      "hash": "sha256-...",
      "settings": "3f9c2a1b"
    }
  }
}
```

Each entry under `files`, keyed by the path in your project, records the
component it belongs to (`components` for a helper several share,
`layer` for a shared module's file), which `piece` it is (`component`,
`stylesheet`, `re-export`, `helper` or `shared`), the kit file it came from,
the hash of that kit file (`sourceHash`), the kit and `add` versions that
wrote it, the hash of its content with LF line endings, and the id of the
settings it was written with in the `settings` table. While a conflict `update` left in the file is open, the
entry also holds `merging`: the hash of the kit's version being merged in,
whose content is kept in the bases too. Line endings never count as an
edit: a checkout that turns them to CRLF keeps its copies untouched, and
`update` writes a file back in the line endings it had.

```sh
npx acme-ui status
```

```
acme-ui 1.3.0 installed
  src/components/TextInput/index.tsx  TextInput component   1.2.0  untouched  would be written differently now (acme-ui 1.2.0 → 1.3.0)
  src/components/TextInput/index.css  TextInput stylesheet  1.2.0  edited     would be written differently now (acme-ui 1.2.0 → 1.3.0)

2 files, 1 edited, 2 that add would write differently now: `npx acme-ui update` brings them in.
```

`status --json` prints the same for a script. A file is `untouched` or
`edited` by its hash, `conflicted` while it holds conflict markers,
`resolved` once a conflict's markers are gone and `update` has yet to record
it, and `missing` when the file is gone from your project. `update` warns
about a missing copy on every run; `add <component>` copies it again, and
removing the file's entry from `files` in the ledger stops tracking a copy you
deleted on purpose, as no command does. The summary line counts conflicts still open and resolved ones apart. A file
would be written differently when what `add` writes today, from the
installed kit and the settings the file was written with, differs from
what it wrote then; `status` says why: the kit versions, the kit file when
it changed within a version, the `add` versions when only `add` changed,
or `(other copies changed)` when the copy's imports now point elsewhere,
such as at a root you have since copied.

```sh
npx acme-ui update            # every copy
npx acme-ui update text-input # one component's copies
```

An untouched file is replaced, and what the updated copies now import and your
project lacks - another of the kit's components, a helper or a shared file - is
added. A shared module the kit added since your copies goes where
`layout.shared` in your settings says, or, when no key names it, in the
directory your component pattern starts with, as `add` places it. An edited one
gets the kit's changes merged in three ways with `git merge-file`: the content
as `add` wrote it, your file, and what `add` writes today. Where you and the kit
changed the same lines, the file gets conflict markers like git's and keeps its
old ledger entry. A kit styled with Tailwind writes an element's classes on one
line, so a kit change and an edit of yours to the same element's classes
conflict even when they touch different classes; resolve the markers and run `update` again, or take the kit's
version with `add <component> --force`, naming the component the file belongs
to. A shared file belongs to no component: remove it and run `add <component>`
again to take the kit's. `update` exits non-zero when a file conflicted. A file
holding conflict markers `update` did not write is left alone; resolve them, or
take the kit's version the same way. Every merge
runs before the first file is written, and the ledger is saved even when a write
fails, so a failed `update` never loses track of what it wrote. `update` with
names leaves shared files alone, and says so; run it without names to update
them too. It needs `git` on your path only to merge.

Naming a compound's root also updates the parts `add` copies with it, for
the targets the root is copied for: every part in a kit built for full
ownership or on the html target, and any part the package publishes no
import for. These go through the same merge, so your edits stay and a
conflict stays a conflict. A part you added by name, or copied only for
another target, is left as it is; when the kit would write it differently,
`update` names it, for you to update it by name.

A copy `add` wrote and nobody touched is kept when you add its component
again and it already matches the installed kit, and replaced when it does
not. One you edited is not overwritten: `add` asks when it can,
and otherwise skips it and exits non-zero; `--force` replaces it. `--force`
reaches only the components you name, with the helpers they reach (a helper
may be another copy's too, and the line that replaces it names that copy) and
the parts a named root brings: a component they import, or a shared file, that
differs from what the kit writes stays as it is and is named in the output,
and the copies import that file. Naming an imported component replaces it; a
shared file belongs to no component, so remove it and run `add` again. When a
component's own file is skipped, `add` writes none of its other pieces
either, so the component stays as it was; the shared files it needs are
still copied.

Neither command writes over a symbolic link: a write replaces the file, so
the link would become a file and its target keep the old content. A copy
that is a link is skipped with a line saying so, and the command exits
non-zero; replace the link with the file it points to and run it again.
A copy `add` removes when its form changes is removed even as a link: the
link goes, and the file it points to stays.

## Options

- `add [component...]` - by name in any case or by kebab-case name
  (`text-input` for `TextInput`); asked for when left out.
- `--target <target>`, `-o, --output-directory <path>`, `--own <list>` - as
  above. An output directory or a layout pattern that leads outside your
  project is refused.
- `--stylesheet-link component|none` - whether each copied component links
  its stylesheet. Default `component`; `none` leaves loading the
  stylesheets to you.
- `--force` - replace the named components' files, edited or not. Anything
  else that differs stays and is named in the output. A copy that is not where
  this run writes, one made with another `--output-directory` and not in the
  ledger, stays too: pass that directory to replace it.
- `--list` - the components per target, each compound with its parts.

## In a kit

A kit's `bin/add.mjs` hands its own root to `runAdd`:

<!-- example: add-bin -->
```js
#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { runAdd } from '@scaffold-ui-kit/add';

await runAdd(fileURLToPath(new URL('..', import.meta.url)));
```

`scaffold-ui-kit initialize` and `scaffold-ui-kit build` write that file and the
dependency for you. `add` reads two files of the kit: its `package.json`
and the manifest `scaffold-ui-kit build` writes,
`dist/scaffold-ui-kit-manifest.json`. A kit built without a manifest is
asked to rebuild with scaffold-ui-kit 2.3.0 or later. The manifest is
trusted input, like the code of the package it ships in: `add` writes what
it describes into your project, refusing only paths that lead outside it.
The package uses Node built-ins only, and runs `git` only to merge.
