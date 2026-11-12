import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep,
} from 'node:path';

import {
  CONFIGURATION_FILE_EXTENSIONS,
  CONFIGURATION_FILE_NAMES,
  LEGACY_CONFIGURATION_FILE_NAME,
  type KitConfiguration,
  type StylingName,
  type TargetName,
} from './configuration';
import { peerDependenciesOf } from './extensions';

/** The choices an `initialize` run scaffolds a kit from. */
export interface ScaffoldOptions {
  /** The kit's package name, also its consumer command. */
  projectName: string;
  /** The directory the kit directory is created inside. */
  parentDirectory: string;
  /** The targets every component is built for. */
  targets: TargetName[];
  /** Styling extensions applied to every build, in application order. */
  styling: StylingName[];
  /** Whether the example components are included. */
  includeExamples: boolean;
  /**
   * Whether the kit is set up for `@scaffold-ui-kit/preview` with its charcell
   * shell: a `preview` block in the kit configuration, the preview's dev
   * dependencies and a `preview` script. Defaults to `true`.
   */
  includePreview?: boolean;
  /**
   * The kit configuration file, relative to the kit root: a module
   * default-exporting `defineKit` (`.ts`, `.mts`, `.cts`, `.js`, `.mjs` or
   * `.cjs`), or a `.json` file. Defaults to
   * `scaffold-ui-kit.ts`. A path other than `scaffold-ui-kit.ts` or
   * `scaffold-ui-kit.json` is recorded in the kit's `package.json`, which is
   * where the build and the preview look for it.
   */
  configurationFile?: string;
}

const packageRoot = join(__dirname, '..');
const assetsDirectory = join(packageRoot, 'assets');

/**
 * Scaffolds a kit project directory.
 *
 * @param options - The scaffold choices.
 * @returns The created file paths, relative to the kit directory.
 */
export function scaffoldKit(options: ScaffoldOptions): string[] {
  const kitDirectory = join(options.parentDirectory, options.projectName);
  if (existsSync(kitDirectory) && readdirSync(kitDirectory).length > 0) {
    throw new Error(
      `Directory '${kitDirectory}' already exists and is not empty`
    );
  }

  const configurationFile =
    options.configurationFile ?? CONFIGURATION_FILE_NAMES[0];
  if (
    !(CONFIGURATION_FILE_EXTENSIONS as readonly string[]).includes(
      extname(configurationFile)
    ) ||
    isAbsolute(configurationFile) ||
    normalize(configurationFile).split(sep).includes('..')
  ) {
    throw new Error(
      `The kit configuration '${configurationFile}' must be a ${CONFIGURATION_FILE_EXTENSIONS.join(', ')} file inside the kit, relative to its root`
    );
  }
  if (basename(configurationFile) === LEGACY_CONFIGURATION_FILE_NAME) {
    throw new Error(
      `The kit configuration can't be named ${LEGACY_CONFIGURATION_FILE_NAME}, the name read with a warning; name it ${CONFIGURATION_FILE_NAMES.join(' or ')}`
    );
  }

  const createdFiles: string[] = [];
  const writeKitFile = (relativePath: string, content: string): void => {
    const filePath = join(kitDirectory, relativePath);
    mkdirSync(join(filePath, '..'), { recursive: true });
    writeFileSync(filePath, content);
    createdFiles.push(relativePath);
  };

  const includePreview = options.includePreview ?? true;
  writeKitFile(
    'package.json',
    kitPackageJson(options, includePreview, configurationFile)
  );
  writeKitFile(
    configurationFile,
    kitConfigurationFile(options, includePreview, configurationFile)
  );
  writeKitFile('tsconfig.json', kitTsconfig(options, configurationFile));
  // Nested in a pnpm workspace, a file of its own would make the kit a separate
  // workspace root, cutting it off from that workspace's `workspace:` links.
  // That workspace's own allow-list applies there.
  if (!isInsidePnpmWorkspace(options.parentDirectory)) {
    writeKitFile('pnpm-workspace.yaml', KIT_PNPM_WORKSPACE);
  }
  const previewTailwind = includePreview && usesTailwindClasses(options);
  writeKitFile(
    '.gitignore',
    includePreview
      ? `node_modules/\ndist/\n.preview-generated/\n.preview-static/\n${
          previewTailwind ? `${PREVIEW_TAILWIND_OUTPUT}\n` : ''
        }`
      : 'node_modules/\ndist/\n'
  );
  writeKitFile(
    'README.md',
    kitReadme(options, includePreview, configurationFile)
  );
  if (includePreview) {
    writeKitFile(join(PREVIEW_STORIES_DIRECTORY, '.gitkeep'), '');
  }
  if (previewTailwind) {
    writeKitFile(PREVIEW_TAILWIND_ENTRY, previewTailwindEntry());
  }

  mkdirSync(join(kitDirectory, 'src', 'components'), { recursive: true });
  writeConsumerCli(kitDirectory);
  createdFiles.push(join('bin', 'add.mjs'));

  if (options.includeExamples) {
    // A kit styled with Tailwind classes keeps its components' styles in
    // utilities, so its examples carry no style block for React to render.
    const examplesDirectory = join(
      assetsDirectory,
      usesTailwindClasses(options) ? 'components-tailwind' : 'components'
    );
    for (const exampleFile of readdirSync(examplesDirectory)) {
      const targetPath = join(kitDirectory, 'src', 'components', exampleFile);
      copyFileSync(join(examplesDirectory, exampleFile), targetPath);
      createdFiles.push(relative(kitDirectory, targetPath));
    }
  }

  return createdFiles;
}

/** The package the consumer CLI ships in; a kit depends on it at runtime. */
export const CONSUMER_CLI_PACKAGE = '@scaffold-ui-kit/add';

/** The package that previews a kit's components in every scripted target. */
export const PREVIEW_PACKAGE = '@scaffold-ui-kit/preview';

/** The shell a new kit's preview renders its interface with. */
const PREVIEW_SHELL = `${PREVIEW_PACKAGE}/shells/charcell`;

/** The version range of `charcell`, which the charcell shell draws with. */
const CHARCELL_RANGE = '^0.1.0';

/** The version range of `@zag-js/react`, which charcell's React components
 *  and the charcell shell's dialogs run on. */
const ZAG_REACT_RANGE = '^1.44.0';

/** The directory of the kit's story files, relative to the kit root. */
const PREVIEW_STORIES_DIRECTORY = 'preview/stories';

/** The Tailwind entry stylesheet the preview's theme is compiled from. */
const PREVIEW_TAILWIND_ENTRY = 'preview/tailwind.css';

/** The compiled Tailwind stylesheet the preview loads as the kit's theme. */
const PREVIEW_TAILWIND_OUTPUT = 'preview/tailwind.generated.css';

/** The version range of `tailwindcss` and its CLI, which compile the
 *  preview's Tailwind stylesheet. */
const TAILWIND_RANGE = '^4.1.0';

/** The note `add` prints for a kit whose components carry Tailwind classes. */
const TAILWIND_ADD_NOTE =
  'These components use Tailwind utility classes: make sure your Tailwind build scans the directory you copied them into. Tailwind v4 finds it on its own unless it is git-ignored; otherwise add an @source pointing at it from your entry stylesheet (in Tailwind v3, add it to content).';

/**
 * Whether a kit's built components carry Tailwind utility classes, which
 * need a Tailwind build to style them: a kit with the `tailwind` styling
 * extension, which a new kit runs in its default `classes` output.
 */
function usesTailwindClasses(options: ScaffoldOptions): boolean {
  return options.styling.includes('tailwind');
}

/**
 * Whether a kit's components have stylesheets to link: every kit but one
 * whose components are styled by Tailwind utility classes. Such a kit is
 * written with separate stylesheet files and each component published linked
 * and unlinked.
 */
function hasComponentStylesheets(options: ScaffoldOptions): boolean {
  return !usesTailwindClasses(options);
}

/** The preview's Tailwind entry: the kit's built output and its story files
 *  as the sources Tailwind generates utilities for. */
function previewTailwindEntry(): string {
  return `/* The preview's Tailwind stylesheet, compiled by \`npm run preview:css\` into
 * ${PREVIEW_TAILWIND_OUTPUT}, which the kit configuration's preview block
 * loads as the kit's theme. Tailwind skips git-ignored files on its own, so the built
 * components are named as a source here. */
@import "tailwindcss";

@source "../dist";
@source "../src/components";
@source "./stories";

/* For a mode option that sets data-mode="dark" on each frame's root, so
 * dark: utilities follow it: */
/* @custom-variant dark (&:where([data-mode="dark"], [data-mode="dark"] *)); */
`;
}

/** A kit's `pnpm-workspace.yaml`: the install scripts its toolchain needs, which
 *  pnpm otherwise stops the first install over. npm doesn't read this file. */
const KIT_PNPM_WORKSPACE = `packages:
  - '.'

# The install scripts pnpm may run for this kit's toolchain.
allowBuilds:
  '@parcel/watcher': true
  esbuild: true
`;

/** Whether a directory or one of its ancestors holds a `pnpm-workspace.yaml`. */
function isInsidePnpmWorkspace(directory: string): boolean {
  let current = resolve(directory);
  for (;;) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return true;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

/** The targets the preview renders, each imported from the kit's own export. */
const previewTargets: readonly TargetName[] = ['react', 'vue', 'svelte'];

/** A kit's `bin/add.mjs`: hands the kit's own root to the consumer CLI. */
const CONSUMER_CLI_SHIM = `#!/usr/bin/env node
// The kit's consumer command (\`npx <kit-name> add\`), run by ${CONSUMER_CLI_PACKAGE}
// against this kit's root. Written by scaffold-ui-kit initialize and build.
import { fileURLToPath } from 'node:url';
import { runAdd } from '${CONSUMER_CLI_PACKAGE}';

await runAdd(fileURLToPath(new URL('..', import.meta.url)));
`;

/** What {@link writeConsumerCli} reports as it changes a kit. */
export interface ConsumerCliOptions {
  /** Called with a line saying each change made: a file written, or the
   *  dependency set and what it was before. */
  report?: (line: string) => void;
}

/**
 * Writes the consumer CLI shim (`bin/add.mjs`) into a kit and makes the kit
 * depend on {@link CONSUMER_CLI_PACKAGE} at this package's version range.
 * `initialize` creates both; `build` refreshes them, so a kit scaffolded by an
 * earlier release moves to the current CLI on its next build. The dependency
 * is written only when the kit has none, or when its range is one this
 * package's version does not satisfy. A spec that is not a plain version
 * range - an exact version, `file:`, `link:`, `workspace:`, a tag or a URL -
 * is the kit's own choice and is left alone.
 *
 * @param kitDirectory - The kit root directory.
 * @param options - Where to report each change.
 * @returns The written paths, relative to the kit directory.
 */
export function writeConsumerCli(
  kitDirectory: string,
  options: ConsumerCliOptions = {}
): string[] {
  const written: string[] = [];
  const shimPath = join('bin', 'add.mjs');
  const shimFile = join(kitDirectory, shimPath);
  if (
    !existsSync(shimFile) ||
    readFileSync(shimFile, 'utf8') !== CONSUMER_CLI_SHIM
  ) {
    mkdirSync(join(kitDirectory, 'bin'), { recursive: true });
    writeFileSync(shimFile, CONSUMER_CLI_SHIM);
    written.push(shimPath);
    options.report?.(`wrote ${shimPath}`);
  }

  const packageFile = join(kitDirectory, 'package.json');
  const source = readFileSync(packageFile, 'utf8');
  const manifest = JSON.parse(source) as {
    dependencies?: Record<string, string>;
  };
  const version = ownVersion();
  // The consumer CLI package and this one are published together at one
  // version, so a caret range on this package's own version always names a
  // published release of the consumer CLI.
  const range = `^${version}`;
  const current = manifest.dependencies?.[CONSUMER_CLI_PACKAGE];
  if (current === undefined || rangeSatisfies(current, version) === false) {
    // Sorted by name, the order npm and pnpm write dependencies in.
    manifest.dependencies = Object.fromEntries(
      Object.entries({
        ...manifest.dependencies,
        [CONSUMER_CLI_PACKAGE]: range,
      }).sort(([a], [b]) => a.localeCompare(b))
    );
    const indentation = /^([ \t]+)"/m.exec(source)?.[1] ?? 2;
    writeFileSync(
      packageFile,
      `${JSON.stringify(manifest, null, indentation)}\n`
    );
    written.push('package.json');
    options.report?.(
      `set ${CONSUMER_CLI_PACKAGE} to ${range} in package.json` +
        (current === undefined
          ? `; run your package manager's install before the kit's add command`
          : ` (was ${current})`)
    );
  }
  return written;
}

/**
 * Whether a kit has the consumer CLI shim {@link writeConsumerCli} writes,
 * as written.
 *
 * @param kitDirectory - The kit root directory.
 */
export function hasConsumerCli(kitDirectory: string): boolean {
  const shimFile = join(kitDirectory, 'bin', 'add.mjs');
  return (
    existsSync(shimFile) && readFileSync(shimFile, 'utf8') === CONSUMER_CLI_SHIM
  );
}

/** A version's major, minor and patch numbers. */
type VersionNumbers = [number, number, number];

/** Orders two versions by their numbers. */
function compareVersions(left: VersionNumbers, right: VersionNumbers): number {
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

/** The version after the given parts' last one: `2.1` → `2.2.0`. */
function bump(given: readonly number[]): VersionNumbers | undefined {
  if (given.length === 0) return undefined;
  const next = [...given, 0, 0].slice(0, 3) as VersionNumbers;
  next[given.length - 1] += 1;
  for (let i = given.length; i < 3; i += 1) next[i] = 0;
  return next;
}

/**
 * The versions one comparator admits, as a lower bound and an exclusive
 * upper one (none when unbounded above).
 */
function comparatorBounds(
  operator: string,
  given: readonly number[]
): { lower: VersionNumbers; upper?: VersionNumbers } {
  const floor = [...given, 0, 0, 0].slice(0, 3) as VersionNumbers;
  const zero: VersionNumbers = [0, 0, 0];
  switch (operator) {
    case '^': {
      // The first nonzero part given stays fixed.
      const fixed = given.findIndex((part) => part !== 0);
      const upper =
        fixed === -1 ? bump(given) : bump(given.slice(0, fixed + 1));
      return { lower: floor, upper };
    }
    case '~':
      return {
        lower: floor,
        upper: bump(given.slice(0, Math.max(1, Math.min(2, given.length)))),
      };
    case '>=':
      return { lower: floor };
    case '>':
      return { lower: bump(given) ?? floor };
    case '<':
      return { lower: zero, upper: floor };
    case '<=':
      return { lower: zero, upper: bump(given) };
    default:
      return { lower: floor, upper: bump(given) };
  }
}

const COMPARATOR =
  /^(\^|~|>=|<=|>|<|=)?v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?$/;

/**
 * Whether a version satisfies a plain version range: a caret, tilde or
 * comparison range (`^2.1.0`, `~2.3`, `>=2.0.0 <3`), a wildcard (`*`,
 * `2.x`), or several of these joined by `||`.
 *
 * Anything else is left undecided, so a caller keeps it: an exact version, a
 * protocol spec (`file:`, `link:`, `workspace:`), a tag, and a valid range
 * this matcher does not read - a hyphen range (`1.0.0 - 2.0.0`), an operator
 * set apart from its version (`>= 2.0.0`), `~>`, build metadata, a
 * comparator with a prerelease tag, or an empty spec. A plain range is never
 * satisfied by a prerelease `version`, so a prerelease build writes its own
 * range.
 *
 * @param range - The dependency spec.
 * @param version - The version, `major.minor.patch` with an optional
 *   prerelease tag.
 * @returns Whether the version satisfies the range, or `undefined` when the
 *   range is not one this reads, or is an exact version.
 * @example
 * ```ts
 * rangeSatisfies('^2.1.0', '2.3.0'); // true
 * rangeSatisfies('~2.2.0', '2.3.0'); // false
 * rangeSatisfies('2.2.0', '2.3.0'); // undefined
 * ```
 */
export function rangeSatisfies(
  range: string,
  version: string
): boolean | undefined {
  const target = /^(\d+)\.(\d+)\.(\d+)(-[\w.-]+)?$/.exec(version);
  if (!target) return undefined;
  const numbers: VersionNumbers = [
    Number(target[1]),
    Number(target[2]),
    Number(target[3]),
  ];
  const prerelease = target[4] !== undefined;
  const trimmed = range.trim();
  // An exact version is a pin, the kit's own choice.
  if (/^=?v?\d+\.\d+\.\d+(-[\w.-]+)?(\+[\w.-]+)?$/.test(trimmed))
    return undefined;
  let satisfied = false;
  for (const alternative of trimmed.split(/\s*\|\|\s*/)) {
    const comparators = alternative.split(/\s+/).filter(Boolean);
    if (comparators.length === 0) return undefined;
    let holds = true;
    for (const comparator of comparators) {
      const parsed = COMPARATOR.exec(comparator);
      if (!parsed) return undefined;
      const [, operator = '', ...parts] = parsed;
      // The parts given, up to the first wildcard or missing one.
      const given: number[] = [];
      for (const part of parts) {
        if (part === undefined || /^[xX*]$/.test(part)) break;
        given.push(Number(part));
      }
      const { lower, upper } = comparatorBounds(operator, given);
      if (
        compareVersions(numbers, lower) < 0 ||
        (upper !== undefined && compareVersions(numbers, upper) >= 0)
      )
        holds = false;
    }
    if (holds) satisfied = true;
  }
  // A range admits a prerelease only through a comparator with a prerelease
  // tag of its own, which is left undecided above.
  return prerelease ? false : satisfied;
}

/** A record with its entries sorted by name. */
function sortedByName(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => a.localeCompare(b))
  );
}

function ownVersion(): string {
  const { version } = JSON.parse(
    readFileSync(join(packageRoot, 'package.json'), 'utf8')
  ) as { version: string };
  return version;
}

function kitPackageJson(
  options: ScaffoldOptions,
  includePreview: boolean,
  configurationFile: string
): string {
  const version = ownVersion();
  // The preview and the kit's package consumers import the components by the
  // kit's own name, one barrel per scripted target. A consumer who copies
  // only part of a component imports the rest one module or stylesheet at a
  // time, so each component file and stylesheet is exported too. A kit with
  // stylesheets publishes each component linked and unlinked: the barrel and
  // `./<target>/<Name>` bring the stylesheet, `./<target>/unlinked` leaves it
  // to the consumer.
  const scriptedTargets = options.targets.filter((target) =>
    previewTargets.includes(target)
  );
  const linksBoth = hasComponentStylesheets(options);
  // The framework each scripted target's output needs, as its extension
  // declares it; `add` prints these ranges to a consumer. A consumer of a kit
  // with several scripted targets uses one of them, so each peer is optional
  // there and the others are not installed for them.
  const peerDependencies = sortedByName(
    Object.assign(
      {},
      ...scriptedTargets.map((target) =>
        peerDependenciesOf(target, {
          name: options.projectName,
          targets: options.targets,
          styling: options.styling,
        })
      )
    ) as Record<string, string>
  );
  const peerDependenciesMeta =
    scriptedTargets.length > 1
      ? Object.fromEntries(
          Object.keys(peerDependencies).map((name) => [
            name,
            { optional: true },
          ])
        )
      : undefined;
  const kitExports: Record<string, string> = Object.fromEntries(
    scriptedTargets.flatMap((target) => {
      // A React module is imported without its extension; an SFC with it.
      const modules =
        target === 'react' ? './dist/react/*.tsx' : `./dist/${target}/*`;
      return [
        [`./${target}`, `./dist/${target}/index.ts`],
        ...(linksBoth
          ? [
              [`./${target}/unlinked`, `./dist/${target}/unlinked/index.ts`],
              [`./${target}/unlinked/*`, modules],
              [`./${target}/*`, `./dist/${target}/linked/*.ts`],
              [`./${target}/*.css`, `./dist/${target}/*.css`],
            ]
          : [[`./${target}/*`, modules]]),
      ];
    })
  );
  return `${JSON.stringify(
    {
      name: options.projectName,
      version: '0.1.0',
      description: `${options.projectName} - a UI kit built with scaffold-ui-kit`,
      type: 'module',
      ...(Object.keys(kitExports).length > 0 ? { exports: kitExports } : {}),
      // Lets a bundler drop the linked modules a consumer never imports,
      // along with their stylesheets.
      ...(linksBoth ? { sideEffects: ['**/*.css', '**/*.scss'] } : {}),
      bin: { [options.projectName]: './bin/add.mjs' },
      files: ['bin', 'dist', 'src/components', 'README.md'],
      scripts: {
        build: 'scaffold-ui-kit build',
        // The target panes import the built components, so each preview
        // script builds the kit first.
        ...(includePreview && usesTailwindClasses(options)
          ? {
              'preview:css': `tailwindcss --input ${PREVIEW_TAILWIND_ENTRY} --output ${PREVIEW_TAILWIND_OUTPUT}`,
              preview:
                'npm run build && npm run preview:css && scaffold-ui-kit-preview dev',
              'preview:build':
                'npm run build && npm run preview:css && scaffold-ui-kit-preview build',
            }
          : includePreview
            ? {
                preview: 'npm run build && scaffold-ui-kit-preview dev',
                'preview:build':
                  'npm run build && scaffold-ui-kit-preview build',
              }
            : {}),
        prepublishOnly: 'npm run build',
      },
      keywords: ['ui-kit', 'component-library', ...options.targets],
      // Published together with this package at one version, so the caret
      // range on this package's version names a release of it.
      dependencies: {
        [CONSUMER_CLI_PACKAGE]: `^${version}`,
      },
      // Sorted by name, the order npm and pnpm write dependencies in.
      devDependencies: sortedByName({
        // The kit's own build and Svelte compiler check need its frameworks,
        // whether or not the package manager installs peers.
        ...peerDependencies,
        '@js-template-engine/types': `^${version}`,
        ...(includePreview
          ? {
              [PREVIEW_PACKAGE]: `^${version}`,
              '@zag-js/react': ZAG_REACT_RANGE,
              charcell: CHARCELL_RANGE,
            }
          : {}),
        ...(includePreview && usesTailwindClasses(options)
          ? {
              '@tailwindcss/cli': TAILWIND_RANGE,
              tailwindcss: TAILWIND_RANGE,
            }
          : {}),
        'scaffold-ui-kit': `^${version}`,
        typescript: '^5.8.0',
      }),
      ...(Object.keys(peerDependencies).length > 0 ? { peerDependencies } : {}),
      ...(peerDependenciesMeta === undefined ? {} : { peerDependenciesMeta }),
      // The build and the preview find a configuration elsewhere by this.
      ...((CONFIGURATION_FILE_NAMES as readonly string[]).includes(
        configurationFile
      )
        ? {}
        : {
            'scaffold-ui-kit': {
              configuration: configurationFile.split(sep).join('/'),
            },
          }),
    },
    null,
    2
  )}\n`;
}

function kitConfigurationFile(
  options: ScaffoldOptions,
  includePreview: boolean,
  configurationFile: string
): string {
  // A DOM-safe prefix for the names the preview sets in each frame.
  const namePrefix = options.projectName.replace(/[^a-z0-9_-]/g, '-');
  const configuration: KitConfiguration & { preview?: object } = {
    name: options.projectName,
    targets: options.targets,
    styling: options.styling,
    ...(hasComponentStylesheets(options)
      ? {
          stylesheetPlacement: 'separate-file' as const,
          stylesheetLink: 'both' as const,
        }
      : {}),
    // The kit exports each piece (see its package.json), so a consumer can
    // own part of a component, and a piece left unexported fails the build.
    add: {
      ...(usesTailwindClasses(options) ? { notes: [TAILWIND_ADD_NOTE] } : {}),
      ownership: 'partial',
    },
    ...(includePreview
      ? {
          preview: {
            shell: PREVIEW_SHELL,
            sources: [
              {
                id: 'kit',
                label: 'Components',
                order: 0,
                moduleBase: options.projectName,
                templatesDirectory: 'src/components',
                storiesDirectory: PREVIEW_STORIES_DIRECTORY,
              },
            ],
            // The kit's compiled theme stylesheets; the first is the default.
            themes: usesTailwindClasses(options)
              ? [
                  {
                    id: 'tailwind',
                    label: 'Tailwind',
                    css: PREVIEW_TAILWIND_OUTPUT,
                  },
                ]
              : [],
            canvas: { namePrefix },
            options: [],
          },
        }
      : {}),
  };
  if (extname(configurationFile) === '.json') {
    return `${JSON.stringify(configuration, null, 2)}\n`;
  }
  const header = includePreview
    ? `/// <reference types="${PREVIEW_PACKAGE}" />
// The kit's configuration, read by \`scaffold-ui-kit build\` and the preview.
// The scaffold-ui-kit README describes each key, and the
// ${PREVIEW_PACKAGE} README the preview block's.`
    : `// The kit's configuration, read by \`scaffold-ui-kit build\`. The
// scaffold-ui-kit README describes each key.`;
  return `${header}
import { defineKit } from 'scaffold-ui-kit';

export default defineKit(${typeScriptLiteral(configuration)});
`;
}

/**
 * A value written as a TypeScript literal in Prettier's style: identifier
 * keys bare, strings single-quoted, two-space indentation, and a trailing
 * comma after each entry of a multiline object or list.
 *
 * @param value - A JSON value.
 * @param indent - The indentation the literal starts at.
 * @returns The literal.
 */
export function typeScriptLiteral(value: unknown, indent = ''): string {
  const inner = `${indent}  `;
  if (typeof value === 'string') {
    return `'${JSON.stringify(value).slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'")}'`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const entries = value.map((entry) => typeScriptLiteral(entry, inner));
    const flat = `[${entries.join(', ')}]`;
    return !flat.includes('\n') && indent.length + flat.length <= 72
      ? flat
      : `[\n${entries.map((entry) => `${inner}${entry},\n`).join('')}${indent}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).filter(
      ([, entry]) => entry !== undefined
    );
    if (entries.length === 0) return '{}';
    const written = entries.map(
      ([key, entry]) =>
        `${/^[A-Za-z_$][\w$]*$/.test(key) ? key : typeScriptLiteral(key)}: ${typeScriptLiteral(entry, inner)}`
    );
    const flat = `{ ${written.join(', ')} }`;
    return !flat.includes('\n') && indent.length + flat.length <= 72
      ? flat
      : `{\n${written.map((entry) => `${inner}${entry},\n`).join('')}${indent}}`;
  }
  return JSON.stringify(value);
}

function kitTsconfig(
  options: ScaffoldOptions,
  configurationFile: string
): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2020',
        module: 'esnext',
        moduleResolution: 'bundler',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        ...(options.targets.includes('react') ? { jsx: 'react-jsx' } : {}),
      },
      // A TypeScript configuration is checked with the kit's sources.
      include: [
        'src/**/*',
        ...(['.ts', '.mts', '.cts'].includes(extname(configurationFile))
          ? [configurationFile.split(sep).join('/')]
          : []),
      ],
    },
    null,
    2
  )}\n`;
}

function kitReadme(
  options: ScaffoldOptions,
  includePreview: boolean,
  configurationFile: string
): string {
  const targetList = options.targets.map((target) => `- ${target}`).join('\n');
  const previewSection = includePreview
    ? `
## Preview

\`\`\`bash
npm run preview         # build the kit, then serve the preview with scaffold-ui-kit-preview dev
npm run preview:build   # build the kit, then a static preview into .preview-static/
\`\`\`

[@scaffold-ui-kit/preview](https://www.npmjs.com/package/@scaffold-ui-kit/preview)
shows every component in each target. It is configured by the
\`preview\` block of the kit configuration, where the kit's themes and
options go too; story files go in \`${PREVIEW_STORIES_DIRECTORY}/\`. The target panes
show the built components, so after changing a template while the preview
runs, run \`npm run build\` again.
${
  usesTailwindClasses(options)
    ? `
The components carry Tailwind utility classes, so the preview loads a
Tailwind build as the kit's theme: \`npm run preview\` compiles
\`${PREVIEW_TAILWIND_ENTRY}\` into \`${PREVIEW_TAILWIND_OUTPUT}\`, from the
built components and the story files, after building the kit, and
\`npm run preview:build\` does the same before building a static preview. Run \`npm run preview:css\` before
\`scaffold-ui-kit-preview generate\` or \`build\` run directly, so the theme
they copy exists. To follow class changes while the preview runs, rebuild and
run \`npm run preview:css -- --watch\` beside it.
`
    : ''
}`
    : '';
  return `# ${options.projectName}

A UI kit built with [scaffold-ui-kit](https://www.npmjs.com/package/scaffold-ui-kit):
components are defined once as data templates in \`src/components/\` and
built for every configured target.

## Targets

${targetList}

## Development

\`\`\`bash
npm install        # install scaffold-ui-kit and the template types
npm run build      # render every template into dist/<target>/
\`\`\`

Add components by creating template files in \`src/components/\`. The
[getting-started guide](https://github.com/djurnamn/js-template-engine/blob/main/documentation/getting-started.md)
covers the template format${
    options.includeExamples ? ', and the example templates show it in use' : ''
  }. Targets and styling are configured in \`${configurationFile}\`.
${previewSection}
## Publishing

\`\`\`bash
npm publish
\`\`\`

The published package ships the built \`dist/\` output and a consumer CLI.

## Consumer usage

\`\`\`bash
npx ${options.projectName} add                              # interactive
npx ${options.projectName} add button --target ${options.targets[0]}
npx ${options.projectName} add --list
\`\`\`

\`add\` copies the built component files into the consumer's project
(\`./src/components/ui\` by default; override with \`--output-directory\`).
`;
}
