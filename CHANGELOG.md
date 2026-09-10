# Changelog

All notable changes to scaffold-ui-kit are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.1] - 2026-09-10

A patch release on js-template-engine 2.2.1, which keeps the capital letters in
a CSS custom property name (`--kit-component--Badge--size` was serialized as
`--kit-component---badge--size`). A kit picks the fix up on its next build.

## [2.2.0] - 2026-09-09

A minor release on js-template-engine 2.2.0. Existing kits build unchanged;
every new configuration key has a default that keeps the previous output.

### Added

- **Svelte runes mode.** `svelteMode: 'runes'` builds the Svelte target as
  Svelte 5 runes components (`$props()`, snippets, event attributes). The
  default, `legacy`, keeps the classic dialect.
- **Stylesheet link and cascade layer.** `stylesheetLink: 'none'` emits each
  component's separate stylesheet without importing or linking it, for a kit
  that aggregates its styles itself. `stylingLayer` (a layer name, or
  `{ "name": "...", "order": ["..."] }`) wraps emitted rules in a cascade
  layer and declares the layer order ahead of them.
- **`add` copies a component's dependency closure.** `add` walks a component's
  relative imports, including side-effect and dynamic imports and a
  stylesheet's `@use`, `@forward`, and `@import`, and copies everything they
  reach with subdirectories preserved, so a component composed from others
  lands with every file it needs. A file already present is kept; only a file
  asked for by name prompts before overwriting.
- **Shared layers and notes.** An optional `add` block in
  `scaffold-ui-kit.config.json` declares `shared` layers (`source`, optional
  `destination`, `specifier`, and `exclude`) copied once beside the components,
  with imports of the specifier rewritten to the relative path of the copy, and
  `notes` printed after a successful add. `add` then lists the packages the
  copied files import, with the kit's own version ranges, minus what the
  consumer already has, and warns about an import of the kit's own package that
  no shared entry covers. `--list` shows what each target's barrel exports.

### Fixed

- **Barrels carry a component's full module surface.** A generated component's
  barrel entry re-exported only its value, so an `export type` a template
  declares was missing from `import { Table, type TableColumn } from
  '<kit>/react'`. Barrels now re-export the whole module, and an SFC driver's
  component is importable from the barrel as well.
- **`build` refreshes the consumer CLI** from the installed scaffold-ui-kit on
  every run, and fails early on a shared source that does not exist. A kit
  that does not build the html target leaves it out of the consumer CLI's
  listing instead of hiding it.

## [2.1.0] - 2026-06-28

scaffold-ui-kit now lives in its own repository, presented as a project built on
[js-template-engine](https://www.npmjs.com/package/js-template-engine). The
package name, the `npx scaffold-ui-kit` command, and the published versions are
unchanged; the version line continues from the 2.x it shipped on.

### Added

- **Hand-written drivers.** Components needing behavior a template cannot express
  (local state, an effect, a headless library) are authored per target under
  `src/drivers/<target>/`. `build` copies each driver into `dist/<target>/` and
  the target barrel re-exports it beside the generated components.
- **Runtime BEM.** `bemMode: 'runtime'` renders BEM classes as `use-bem` calls
  rather than static class strings.
- **SCSS load paths.** Under `scss`, `loadPaths` lets a kit author SCSS helpers
  (mixins, functions, `$variables`) and still emit any styling strategy, the
  engine resolving them to plain CSS at build.

## [2.0.0] - 2026-06-15

### Added

- **Scaffold a kit.** `scaffold-ui-kit init` creates an npm package with a single
  source of truth in `src/components/`, asking for the render targets (`react`,
  `vue`, `svelte`, `html`), the styling extensions (`bem`, `tailwind`, or none),
  and whether to include example components. Every prompt has a matching flag for
  non-interactive use.
- **Build per target.** `scaffold-ui-kit build` renders every template once per
  configured target into `dist/<target>/`, with a per-target barrel that
  re-exports the generated components. Targets, styling, and output strategies
  live in `scaffold-ui-kit.config.json`.
- **Styling configuration.** `stylingStrategy`, `scriptingStrategy`,
  `stylingLanguage` (`css` or `scss`), and `scriptingLanguage` map onto the
  engine's output strategies. Under `scss`, styles are emitted as pass-through
  SCSS.
- **BEM and Tailwind.** Configured BEM and Tailwind extensions contribute classes
  to every target. `tailwindOutput: 'styles'` converts utilities to CSS at build
  time, and `tailwindConvertStyles` converts authored CSS into utility classes.
- **Consume without the engine.** A published kit ships its built `dist/` and a
  consumer CLI: `npx <kit> add <component> --target <target>` copies the built
  files into a project with no engine dependency. Kits also work as regular
  packages through their per-target barrels.
