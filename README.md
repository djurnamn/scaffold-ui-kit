# scaffold-ui-kit

Scaffold framework-agnostic UI kits powered by
[js-template-engine](https://www.npmjs.com/package/js-template-engine):
define components once as typed data templates and build them for React,
Vue, Svelte, and vanilla HTML - with BEM and Tailwind styling as
configurable extensions.

```bash
npx scaffold-ui-kit my-ui-kit
cd my-ui-kit
npm install
npm run build
```

## Packages

| Package | Folder | What it does |
| --- | --- | --- |
| [`scaffold-ui-kit`](packages/core) | `packages/core` | Creates a kit and builds its components for each target. |
| [`@scaffold-ui-kit/add`](packages/add) | `packages/add` | The consumer CLI a kit ships with: copies its built components into a project. |
| [`@scaffold-ui-kit/helpers`](packages/helpers) | `packages/helpers` | Style helpers for a kit's templates, and the runtime its hand-written components call. |
| [`@scaffold-ui-kit/preview`](packages/preview) | `packages/preview` | Renders a kit's components side by side in React, Vue, Svelte and html. |
| [`@scaffold-ui-kit/testing`](packages/testing) | `packages/testing` | Renders a kit's components in each target and compares the markup, type-checks the targets as a consumer would, and sweeps the preview with axe and the keyboard. |

The five release together at the same version, recorded in one
[CHANGELOG](CHANGELOG.md). Each package's README covers its usage.

## Examples

Three example kits show the approach end to end. Each is a standalone project
that depends on the published packages, so you can copy one out and build it
as it is.

| Example | Styling | Targets | What it shows |
| --- | --- | --- | --- |
| [`headless-kit`](examples/headless-kit) | None | React, Vue, Svelte | Unstyled, accessible primitives: two-way values, ids, compound parts. |
| [`shadcn-kit`](examples/shadcn-kit) | Tailwind | React, Vue, Svelte, HTML | A shadcn/ui-style kit: variant maps, polymorphic triggers, compounds. |
| [`mantine-kit`](examples/mantine-kit) | BEM and CSS variables | React, Vue, Svelte, HTML | A Mantine-style kit: props as variables, form fields, inner parts by name. |

The shadcn/ui-style and Mantine-style examples are not ports of those
libraries and aren't affiliated with them. They show how such a kit can be
written once, up to a point, and are free to use as the starting point for a
full port. Each example's README covers what to look at and how to run it.

## Development

The repository is a pnpm workspace:

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

## License

MIT
