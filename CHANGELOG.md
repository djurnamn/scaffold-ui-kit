# Changelog

All notable changes to scaffold-ui-kit are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
