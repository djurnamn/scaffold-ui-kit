import { existsSync, readFileSync, realpathSync } from 'node:fs';
import {
  basename,
  extname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep,
} from 'node:path';

import type { BemOptions } from '@js-template-engine/extension-bem';
import type { SvelteOptions } from '@js-template-engine/extension-svelte';
import {
  isDarkSelector,
  type TailwindOptions,
} from '@js-template-engine/extension-tailwind';
import type {
  StyleLayer,
  StylesheetPlacement,
} from '@js-template-engine/types';
import { createJiti } from 'jiti';

/**
 * The file names a kit's configuration is found under in the kit root, in
 * the order they are looked for: a TypeScript module default-exporting
 * {@link defineKit}, or plain JSON.
 */
export const CONFIGURATION_FILE_NAMES = [
  'scaffold-ui-kit.ts',
  'scaffold-ui-kit.json',
] as const;

/**
 * The name a kit's configuration was read from before
 * {@link CONFIGURATION_FILE_NAMES}: still read, with a warning naming the new
 * file, and removed in 3.0.0.
 */
export const LEGACY_CONFIGURATION_FILE_NAME = 'scaffold-ui-kit.config.json';

/**
 * @deprecated A kit's configuration is found by
 * {@link findConfigurationFile}, under one of {@link CONFIGURATION_FILE_NAMES};
 * this is the name it was read from before them. Removed in 3.0.0.
 */
export const configurationFileName = LEGACY_CONFIGURATION_FILE_NAME;

/** The render targets a kit can be built for. */
export const targetNames = ['html', 'react', 'vue', 'svelte'] as const;

/** The styling extensions a kit can apply. */
export const stylingNames = ['bem', 'tailwind'] as const;

/** How the Tailwind extension emits: utility classes or converted styles. */
export const tailwindOutputs = ['classes', 'styles'] as const;

/** How the BEM extension renders classes: literal strings or runtime calls. */
export const bemModes = ['literal', 'runtime'] as const;

/** The Svelte dialect the Svelte target emits: legacy or Svelte 5 runes. */
export const svelteModes = ['legacy', 'runes'] as const;

export type TargetName = (typeof targetNames)[number];
export type StylingName = (typeof stylingNames)[number];
export type TailwindOutput = (typeof tailwindOutputs)[number];
export type BemMode = (typeof bemModes)[number];
export type SvelteMode = (typeof svelteModes)[number];

/**
 * How a kit's components link the stylesheets `separate-file` emits:
 * `'component'` links each from its component, `'none'` links none, and
 * `'both'` publishes each component linked and unlinked side by side.
 */
export const kitStylesheetLinks = ['component', 'none', 'both'] as const;

export type KitStylesheetLink = (typeof kitStylesheetLinks)[number];

/** Where a component's stylesheet is placed, as `stylesheetPlacement` takes it. */
const stylesheetPlacements = ['inline', 'in-file', 'separate-file'];

/** How much of a shared module the consumer CLI copies when it is owned. */
export const sharedModuleCopies = ['all', 'reached'] as const;

export type SharedModuleCopy = (typeof sharedModuleCopies)[number];

/**
 * A file or directory the built components import that is not itself a
 * component - a scripts module, a sass helper directory, a theme entry
 * point. A consumer either imports it from the package, by the specifier
 * the kit's `package.json` `exports` publish it under, or owns a copy.
 */
export interface SharedModule {
  /**
   * The module's name, which a consumer's settings place and own it by;
   * defaults to the source's base name without its extension, or, when
   * another module's name takes that, a name derived from the whole source
   * path.
   */
  name?: string;
  /** The file or directory, relative to the kit root. */
  source: string;
  /**
   * What a consumer who owns the module copies: `'all'` (the default) copies
   * every file, `'reached'` only the modules the copied components import,
   * and the modules those import inside the shared module.
   */
  copy?: SharedModuleCopy;
  /**
   * Paths inside the module, relative to `source`, left out of the copy -
   * the parts that only the installed package needs, such as an aggregate
   * stylesheet or a barrel.
   */
  exclude?: string[];
  /**
   * @deprecated Has no effect: a consumer's settings place the module.
   * Accepted with a build warning; removed in 3.0.0.
   */
  destination?: string;
  /**
   * @deprecated Has no effect: the specifier comes from the kit's
   * `package.json` `exports`. Accepted with a build warning; removed in
   * 3.0.0.
   */
  specifier?: string;
}

/**
 * How a kit's consumers may own its components: `'partial'` lets a consumer
 * own a component and import its stylesheet from the package, or the
 * reverse; `'full'` has them copy every piece of a component.
 */
export const addOwnerships = ['partial', 'full'] as const;

export type AddOwnership = (typeof addOwnerships)[number];

/** What the consumer CLI's `add` command copies and says beyond components. */
export interface AddConfiguration {
  /** The modules the built components import that are not components. */
  shared?: SharedModule[];
  /** Lines printed after a successful `add` - the kit's setup guidance. */
  notes?: string[];
  /**
   * The file name of a consumer's settings for the kit; defaults to the
   * package name with its scope joined by a hyphen and `.json` added
   * (`@acme/ui` gives `acme-ui.json`).
   */
  consumerConfiguration?: string;
  /**
   * How consumers may own the components. Under `'partial'` every piece a
   * consumer can leave in the package - a component, a part, a compiled
   * stylesheet, a shared module - has to be reachable through the kit's
   * `package.json` `exports`, or the build fails. `'full'` is for a kit that
   * exports only its barrels: its consumers copy every piece. Left out, the
   * manifest records `'partial'` only when every such piece is reachable,
   * `'full'` otherwise, and the build warns of each piece no export
   * reaches. An `scss` kit's sheets are compiled for consumers only under
   * `stylesheetLink: 'both'` or a declared `'partial'`.
   */
  ownership?: AddOwnership;
}

/**
 * The object form of `stylingLayer`: the layer the components' rules are
 * wrapped in, the full layer order, and the layer a consumer's copied
 * stylesheet moves its rules to.
 */
export interface KitStylingLayer extends StyleLayer {
  /**
   * The layer a stylesheet a consumer copies wraps its rules in instead of
   * `name`, so the consumer's edited copy sits above the kit's own rules.
   * Requires `order`, in which it comes after `name`.
   */
  owned?: string;
}

/** A package of a kit built into several: its name and where it lives. */
export interface KitPackageEntry {
  /** The package name, such as `'@acme/ui-styles'`. */
  name: string;
  /** The package's directory, relative to the kit root. */
  directory: string;
}

/**
 * A scripted target's package. The build writes the target's components
 * into its `dist/` and owns its `package.json`'s `exports`, `files`, `bin`,
 * `dependencies` and `peerDependencies`.
 */
export interface KitTargetPackage extends KitPackageEntry {
  /**
   * Version ranges for packages the target's components import, taking
   * precedence over the ranges the kit root's `package.json` lists.
   */
  dependencies?: Record<string, string>;
  /**
   * Peer dependency ranges taking precedence over the ones the target's
   * extension declares.
   */
  peerDependencies?: Record<string, string>;
}

/**
 * A kit built into one package per scripted target, beside a package of
 * stylesheets. The kit root's own package holds the rest: the shared
 * modules the components import, such as scripts and configuration.
 */
export type KitPackages = {
  [Target in Exclude<TargetName, 'html'>]?: KitTargetPackage;
} & {
  /** The package the component stylesheets are written into, once. */
  styles: KitPackageEntry;
};

/**
 * The kit's `preview` block: the settings of `@scaffold-ui-kit/preview`,
 * which reads and validates it. The preview package fills in its keys, so
 * the block is typed wherever its types are loaded.
 */
export interface KitPreviewConfiguration {}

/**
 * A kit's configuration, read from `scaffold-ui-kit.ts` or
 * `scaffold-ui-kit.json` by the `build` command and the preview.
 */
export interface KitConfiguration {
  /**
   * The kit's name: its package name, or, for a kit built into several
   * packages, the name its consumers' settings file and commands take
   * (`'acme-ui'` gives `acme-ui.json` and `acme-ui-react`).
   */
  name: string;
  /** The targets every component is built for, e.g. `['react', 'vue']`. */
  targets: TargetName[];
  /**
   * Builds each scripted target into a package of its own, beside a
   * package holding every component stylesheet once; left out, the kit is
   * one package with every target under `dist/<target>/`. Every target
   * needs an entry; the targets are the scripted targets (`react`, `vue`,
   * `svelte`). Requires `stylesheetLink` of `'both'` or `'none'`. A shared
   * module's `source` and a load path may lie in any of the packages.
   *
   * @example
   * packages: {
   *   react: { name: '@acme/react', directory: '../react' },
   *   vue: { name: '@acme/vue', directory: '../vue' },
   *   styles: { name: '@acme/styles', directory: '../styles' },
   * }
   */
  packages?: KitPackages;
  /** Styling extensions applied to every build, in application order. */
  styling: StylingName[];
  /**
   * The BEM extension's options, taken when `'bem'` is in `styling` and an
   * error otherwise: `elementSeparator` (default `'__'`),
   * `modifierSeparator` (default `'--'`), `mode` (`'literal'`, the default,
   * renders class name strings; `'runtime'` emits `use-bem` `bem(...)` calls
   * for the scripted targets, html keeping the literal classes; add the
   * package they import to the kit's dependencies) and `importSource` (the
   * package `bem(...)` is imported from under `'runtime'`, default
   * `'use-bem'`).
   *
   * @example
   * bem: { mode: 'runtime', importSource: '@acme/bem' }
   */
  bem?: BemOptions;
  /**
   * The Tailwind extension's options, taken when `'tailwind'` is in
   * `styling` and an error otherwise: `output` (`'classes'`, the default,
   * appends the utility classes verbatim; `'styles'` converts them to plain
   * CSS, so the output needs no Tailwind build), `darkSelector` (under
   * `output: 'styles'`, the selector `dark:` utilities follow instead of
   * `@media (prefers-color-scheme: dark)`: a selector without `&` names a
   * state of the page's root element, `'[data-mode="dark"]'` becoming
   * `:where(:root:is([data-mode="dark"])) &`, adding no specificity; one
   * with `&` is used as written, with the specificity it spells; a list has
   * `&` in every member or in none) and `convertStyles` (`true` converts each
   * component's authored `style` into utility classes, the inverse of
   * `output: 'styles'`; default `false`).
   *
   * @example
   * tailwind: { output: 'styles', darkSelector: '[data-mode="dark"]' }
   */
  tailwind?: TailwindOptions;
  /**
   * The Svelte extension's options, taken when `'svelte'` is in `targets`
   * and an error otherwise: `mode` (`'legacy'`, the default, emits the
   * classic `export let`, `<slot>` and `on:event` component shape;
   * `'runes'` emits Svelte 5 runes components - a typed `Props` interface
   * destructured from `$props()`, snippet props rendered through
   * `{@render}`, and `onevent` attribute bindings).
   *
   * @example
   * svelte: { mode: 'runes' }
   */
  svelte?: SvelteOptions;
  /**
   * Where each component's stylesheet is placed: `'inline'` in `style`
   * attributes, `'in-file'` (the default) in the component's own file, as a
   * `<style>` element or an SFC style block, or `'separate-file'` in a
   * stylesheet beside the component.
   */
  stylesheetPlacement?: StylesheetPlacement;
  /**
   * Whether each component links the stylesheet `stylesheetPlacement:
   * 'separate-file'` emits; defaults to `'component'`. `'none'` emits
   * `<Name>.css` exactly as before and links it from nowhere, so a kit can
   * ship per-component stylesheets its consumer loads however it likes - as
   * one bundle, one at a time, or through its own build. `'both'` publishes
   * each scripted target's components linked and unlinked from one build:
   * the components render unlinked, `dist/<target>/index.ts` exports a
   * linked module per component that links the compiled stylesheets of
   * everything it renders, and `dist/<target>/unlinked/index.ts` exports the
   * components as they are. The `html` target has no modules to import:
   * each page links its compiled stylesheet. `'none'` and `'both'` require
   * the `separate-file` placement.
   */
  stylesheetLink?: KitStylesheetLink;
  /**
   * Where the build writes a component's compiled stylesheet that is the
   * same on every target, once, for every target's linked modules, and a
   * consumer who owns the component but not its stylesheet, to import;
   * relative to the kit root, defaulting to `'dist/stylesheets'`. A sheet
   * that differs between targets is written per target instead. Only an
   * `scss` kit's sheets are compiled, so only they are shared: a `css` kit
   * links each sheet beside its component, and naming the directory there
   * is an error. Requires `stylesheetPlacement: 'separate-file'` and
   * `stylingLanguage: 'scss'`.
   */
  compiledStylesheetDirectory?: string;
  /**
   * The cascade layer emitted stylesheet rules are wrapped in; omitted emits
   * them unlayered. A bare string names the layer; the object form also
   * declares the full layer order (`@layer a, b, c;`) ahead of the wrapper,
   * which a kit shipping one stylesheet per component has nowhere else to
   * state. Applies under every stylesheet placement.
   */
  stylingLayer?: string | KitStylingLayer;
  /**
   * Stylesheet output language; defaults to `'css'`. `'scss'` emits nested
   * SCSS. The react and html targets require the `separate-file` placement
   * under `'scss'`; Vue and Svelte tag their SFC style blocks `lang="scss"`.
   */
  stylingLanguage?: 'css' | 'scss';
  /**
   * Sass load-path directories, relative to the kit root, for resolving
   * `@use`/`@include` in component styles. Under `stylingLanguage: 'css'`
   * (or the `inline` placement) the engine resolves the Sass itself against
   * them - expanding mixins, functions, and `$variables` to flat CSS - so a
   * kit can author SCSS helpers and still emit any stylesheet placement.
   * Under `'scss'` they pass through for the consumer's own sass build.
   */
  loadPaths?: string[];
  /**
   * What the consumer CLI's `add` command copies beside the components
   * (`shared`: the non-component modules the built files import) and prints
   * afterwards (`notes`), the name of a consumer's settings file, and how
   * consumers may own the components. The build writes it into the kit
   * manifest.
   */
  add?: AddConfiguration;
  /**
   * The parts of each compound whose root has no template, such as a
   * hand-written component, by root name. A template root lists its own
   * parts in its template. The manifest records them as it records a
   * template's, so a consumer's `add` treats them as that compound's parts,
   * and the preview gives the parts no story of their own.
   *
   * @example
   * parts: { DashboardShell: ['DashboardShellHeader'] }
   */
  parts?: Record<string, string[]>;
  /**
   * @deprecated Use `stylesheetPlacement` instead. `stylingStrategy` is kept
   * as an alias until the next major version; a build reads it as
   * `stylesheetPlacement`, with a warning.
   */
  stylingStrategy?: StylesheetPlacement;
  /**
   * @deprecated Has no effect: no target's output contains a script the
   * strategy could place. Accepted with a build warning; removed in 3.0.0.
   */
  scriptingStrategy?: StylesheetPlacement;
  /**
   * @deprecated Has no effect, like `scriptingStrategy`. Accepted with a
   * build warning; removed in 3.0.0.
   */
  scriptingLanguage?: 'javascript' | 'typescript';
  /**
   * @deprecated Use `tailwind.output` instead. `tailwindOutput` is kept as
   * an alias until the next major version; a build reads it into the
   * `tailwind` block, with a warning.
   */
  tailwindOutput?: TailwindOutput;
  /**
   * @deprecated Use `tailwind.darkSelector` instead. `tailwindDarkSelector`
   * is kept as an alias until the next major version; a build reads it into
   * the `tailwind` block, with a warning.
   */
  tailwindDarkSelector?: string;
  /**
   * @deprecated Use `tailwind.convertStyles` instead.
   * `tailwindConvertStyles` is kept as an alias until the next major
   * version; a build reads it into the `tailwind` block, with a warning.
   */
  tailwindConvertStyles?: boolean;
  /**
   * @deprecated Use `bem.elementSeparator` instead. `bemElementSeparator`
   * is kept as an alias until the next major version; a build reads it into
   * the `bem` block, with a warning.
   */
  bemElementSeparator?: string;
  /**
   * @deprecated Use `bem.modifierSeparator` instead. `bemModifierSeparator`
   * is kept as an alias until the next major version; a build reads it into
   * the `bem` block, with a warning.
   */
  bemModifierSeparator?: string;
  /**
   * @deprecated Use `bem.mode` instead. `bemMode` is kept as an alias until
   * the next major version; a build reads it into the `bem` block, with a
   * warning.
   */
  bemMode?: BemMode;
  /**
   * @deprecated Use `bem.importSource` instead. `bemImportSource` is kept as
   * an alias until the next major version; a build reads it into the `bem`
   * block, with a warning.
   */
  bemImportSource?: string;
  /**
   * @deprecated Use `svelte.mode` instead. `svelteMode` is kept as an alias
   * until the next major version; a build reads it into the `svelte` block,
   * with a warning.
   */
  svelteMode?: SvelteMode;
  /**
   * The preview's settings, which `@scaffold-ui-kit/preview` reads and
   * validates; the build leaves them alone.
   */
  preview?: KitPreviewConfiguration & object;
}

/**
 * The keys a kit configuration takes, in the order they are listed; the
 * deprecated aliases come last and are left out of the list a message
 * gives.
 */
const configurationKeys = [
  'name',
  'targets',
  'packages',
  'styling',
  'bem',
  'tailwind',
  'svelte',
  'stylesheetPlacement',
  'stylesheetLink',
  'compiledStylesheetDirectory',
  'stylingLayer',
  'stylingLanguage',
  'loadPaths',
  'add',
  'parts',
  'preview',
  'stylingStrategy',
  'scriptingStrategy',
  'scriptingLanguage',
  'tailwindOutput',
  'tailwindDarkSelector',
  'tailwindConvertStyles',
  'bemElementSeparator',
  'bemModifierSeparator',
  'bemMode',
  'bemImportSource',
  'svelteMode',
] as const satisfies readonly (keyof KitConfiguration)[];

/** The keys the `add` block takes. */
const addKeys = [
  'shared',
  'notes',
  'consumerConfiguration',
  'ownership',
] as const satisfies readonly (keyof AddConfiguration)[];

/** The keys an `add.shared` entry takes. */
const sharedModuleKeys = [
  'name',
  'source',
  'copy',
  'exclude',
  'destination',
  'specifier',
] as const satisfies readonly (keyof SharedModule)[];

/** The per-extension blocks, keyed by the extension's name. */
const extensionBlocks = ['bem', 'tailwind', 'svelte'] as const;

type ExtensionBlock = (typeof extensionBlocks)[number];

/** The keys each per-extension block takes: the extension's own options. */
const extensionBlockKeys = {
  bem: [
    'elementSeparator',
    'modifierSeparator',
    'mode',
    'importSource',
  ] as const satisfies readonly (keyof BemOptions)[],
  tailwind: [
    'output',
    'darkSelector',
    'convertStyles',
  ] as const satisfies readonly (keyof TailwindOptions)[],
  svelte: ['mode'] as const satisfies readonly (keyof SvelteOptions)[],
};

/**
 * Each option of a per-extension block beside the flat key that spelled it
 * before the blocks, and the check its value passes under either spelling.
 */
interface ExtensionOption {
  block: ExtensionBlock;
  option: string;
  /** The deprecated flat key. */
  flat: keyof KitConfiguration & string;
  /** The problem with a value, named by the key it was given under. */
  check: (label: string, value: unknown) => string | undefined;
}

/** A check that a value is one of the allowed names. */
function oneOf(
  allowed: readonly string[]
): (label: string, value: unknown) => string | undefined {
  return (label, value) =>
    allowed.includes(value as string)
      ? undefined
      : `'${label}' must be one of ${allowed.join(', ')}`;
}

/** A check that a value is a string. */
function aString(label: string, value: unknown): string | undefined {
  return typeof value === 'string' ? undefined : `'${label}' must be a string`;
}

/** A check that a value is a boolean. */
function aBoolean(label: string, value: unknown): string | undefined {
  return typeof value === 'boolean'
    ? undefined
    : `'${label}' must be a boolean`;
}

const extensionOptions: ExtensionOption[] = [
  {
    block: 'bem',
    option: 'elementSeparator',
    flat: 'bemElementSeparator',
    check: aString,
  },
  {
    block: 'bem',
    option: 'modifierSeparator',
    flat: 'bemModifierSeparator',
    check: aString,
  },
  { block: 'bem', option: 'mode', flat: 'bemMode', check: oneOf(bemModes) },
  {
    block: 'bem',
    option: 'importSource',
    flat: 'bemImportSource',
    check: aString,
  },
  {
    block: 'tailwind',
    option: 'output',
    flat: 'tailwindOutput',
    check: oneOf(tailwindOutputs),
  },
  {
    block: 'tailwind',
    option: 'darkSelector',
    flat: 'tailwindDarkSelector',
    check: (label, value) =>
      isDarkSelector(value)
        ? undefined
        : `'${label}' must be a selector, such as '[data-mode="dark"]', with & in every member of a list or in none`,
  },
  {
    block: 'tailwind',
    option: 'convertStyles',
    flat: 'tailwindConvertStyles',
    check: aBoolean,
  },
  {
    block: 'svelte',
    option: 'mode',
    flat: 'svelteMode',
    check: oneOf(svelteModes),
  },
];

/** The keys the object form of `stylingLayer` takes. */
const stylingLayerKeys = [
  'name',
  'order',
  'owned',
] as const satisfies readonly (keyof KitStylingLayer)[];

/**
 * Reports each key of an object that is not among the allowed keys, with
 * its path and the keys the object takes.
 *
 * @param value - The object whose keys are checked.
 * @param allowed - The keys the object takes.
 * @param path - The object's path in the configuration, `''` for the root.
 * @param description - What the object is, as in `'a shared module'`.
 * @returns One problem per unknown key.
 */
function unknownKeyProblems(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  description: string
): string[] {
  const listed = allowed.filter((key) => !DEPRECATED_KEYS.has(key));
  return Object.keys(value)
    .filter((key) => !allowed.includes(key))
    .map(
      (key) =>
        `unknown key '${path === '' ? key : `${path}.${key}`}'; ${description} takes ${listed.join(', ')}`
    );
}

/** Keys still accepted, with a warning, but left out of the keys a message lists. */
const DEPRECATED_KEYS: ReadonlySet<string> = new Set([
  'stylingStrategy',
  'scriptingStrategy',
  'scriptingLanguage',
  'destination',
  'specifier',
  ...extensionOptions.map((entry) => entry.flat),
]);

/**
 * The keys a configuration takes that are not settings: `$schema`, which an
 * editor reads to check a JSON configuration.
 */
const IGNORED_KEYS: ReadonlySet<string> = new Set(['$schema']);

/**
 * Each top-level key of a configuration it does not take, `$schema` aside,
 * with the keys it takes.
 */
function topLevelKeyProblems(configuration: Record<string, unknown>): string[] {
  const { extensions, ...rest } = configuration;
  const problems = unknownKeyProblems(
    Object.fromEntries(
      Object.entries(rest).filter(([key]) => !IGNORED_KEYS.has(key))
    ),
    configurationKeys,
    '',
    'the configuration'
  );
  if (extensions !== undefined) {
    // A name for the preview's settings a reader may reach for.
    problems.unshift(
      "unknown key 'extensions'; the preview's settings go in a top-level 'preview' block"
    );
  }
  return problems;
}

/**
 * Validates a parsed configuration value.
 *
 * @param value - The parsed JSON value.
 * @param options - `unknownTopLevelKeys: 'warning'` leaves a top-level key
 *   the configuration does not take out of the problems, for a reader that
 *   warns of it instead; an unknown key inside a block is a problem either
 *   way. `$schema` is always taken.
 * @returns The problems found; an empty array means the value is valid.
 */
export function validateConfiguration(
  value: unknown,
  {
    unknownTopLevelKeys = 'error',
  }: { unknownTopLevelKeys?: 'error' | 'warning' } = {}
): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return ['configuration must be an object'];
  }
  const configuration = value as Record<string, unknown>;
  const problems: string[] =
    unknownTopLevelKeys === 'error' ? topLevelKeyProblems(configuration) : [];

  if (typeof configuration.name !== 'string' || configuration.name === '') {
    problems.push("'name' must be a non-empty string");
  }

  problems.push(
    ...validateNameList(configuration.targets, 'targets', targetNames, {
      required: true,
    }),
    ...validateNameList(configuration.styling, 'styling', stylingNames, {
      required: false,
    })
  );

  problems.push(...validateExtensionBlocks(configuration));

  for (const key of [
    'stylesheetPlacement',
    'stylingStrategy',
    'scriptingStrategy',
  ] as const) {
    const placement = configuration[key];
    if (
      placement !== undefined &&
      !stylesheetPlacements.includes(placement as string)
    ) {
      problems.push(
        `'${key}' must be one of ${stylesheetPlacements.join(', ')}`
      );
    }
  }
  if (
    configuration.stylesheetPlacement !== undefined &&
    configuration.stylingStrategy !== undefined
  ) {
    problems.push(
      "'stylingStrategy' and 'stylesheetPlacement' are both set; keep stylesheetPlacement"
    );
  }
  const stylesheetPlacement =
    configuration.stylesheetPlacement ??
    configuration.stylingStrategy ??
    'in-file';

  const stylesheetLink = configuration.stylesheetLink;
  if (
    stylesheetLink !== undefined &&
    !(kitStylesheetLinks as readonly unknown[]).includes(stylesheetLink)
  ) {
    problems.push(
      `'stylesheetLink' must be one of ${kitStylesheetLinks.join(', ')}`
    );
  } else if (
    stylesheetLink !== undefined &&
    stylesheetLink !== 'component' &&
    stylesheetPlacement !== 'separate-file'
  ) {
    problems.push(
      `'stylesheetLink' of '${stylesheetLink}' requires 'stylesheetPlacement' of 'separate-file'`
    );
  }

  const compiledStylesheetDirectory = configuration.compiledStylesheetDirectory;
  if (compiledStylesheetDirectory !== undefined) {
    if (
      typeof compiledStylesheetDirectory !== 'string' ||
      compiledStylesheetDirectory.trim() === '' ||
      isAbsolute(compiledStylesheetDirectory) ||
      normalize(compiledStylesheetDirectory).split(sep).includes('..')
    ) {
      problems.push(
        "'compiledStylesheetDirectory' must be a directory inside the kit, relative to its root"
      );
    } else if (stylesheetPlacement !== 'separate-file') {
      problems.push(
        "'compiledStylesheetDirectory' requires 'stylesheetPlacement' of 'separate-file'"
      );
    } else if ((configuration.stylingLanguage ?? 'css') !== 'scss') {
      // Only a compiled sheet is shared; a css kit links each sheet beside
      // the component that emitted it.
      problems.push(
        "'compiledStylesheetDirectory' has no effect unless 'stylingLanguage' is 'scss': a css kit links each sheet where the build writes it, beside its component"
      );
    }
  }

  problems.push(...validateStylingLayer(configuration.stylingLayer));

  const stylingLanguage = configuration.stylingLanguage;
  if (
    stylingLanguage !== undefined &&
    stylingLanguage !== 'css' &&
    stylingLanguage !== 'scss'
  ) {
    problems.push("'stylingLanguage' must be one of css, scss");
  }

  const scriptingLanguage = configuration.scriptingLanguage;
  if (
    scriptingLanguage !== undefined &&
    scriptingLanguage !== 'javascript' &&
    scriptingLanguage !== 'typescript'
  ) {
    problems.push("'scriptingLanguage' must be one of javascript, typescript");
  }

  const loadPaths = configuration.loadPaths;
  if (
    loadPaths !== undefined &&
    (!Array.isArray(loadPaths) ||
      !loadPaths.every((path) => typeof path === 'string'))
  ) {
    problems.push("'loadPaths' must be an array of strings");
  }

  problems.push(
    ...validateAddConfiguration(
      configuration.add,
      configuration.packages !== undefined
    ),
    ...validatePackages(configuration)
  );

  const parts = configuration.parts;
  if (
    parts !== undefined &&
    (typeof parts !== 'object' ||
      parts === null ||
      Array.isArray(parts) ||
      Object.values(parts).some(
        (rootParts) =>
          !Array.isArray(rootParts) ||
          rootParts.some(
            (part) => typeof part !== 'string' || part.trim() === ''
          )
      ))
  ) {
    problems.push(
      "'parts' must be an object of component names to lists of part names"
    );
  } else if (parts !== undefined) {
    for (const [root, rootParts] of Object.entries(
      parts as Record<string, string[]>
    )) {
      const seen = new Set<string>();
      for (const part of rootParts) {
        if (part === root)
          problems.push(`'parts.${root}' lists '${root}' as its own part`);
        else if (seen.has(part))
          problems.push(`'parts.${root}' lists '${part}' twice`);
        seen.add(part);
      }
    }
  }

  const preview = configuration.preview;
  if (
    preview !== undefined &&
    (typeof preview !== 'object' || preview === null || Array.isArray(preview))
  ) {
    problems.push("'preview' must be an object of the preview's settings");
  }

  return problems;
}

/**
 * Validates the per-extension blocks, `bem`, `tailwind` and `svelte`, and
 * the deprecated flat keys that spell the same options: each block is an
 * object of the keys its extension takes, for an extension the kit applies
 * (`bem` and `tailwind` in `styling`, `svelte` in `targets`); an option set
 * under both spellings is an error; and a value passes the same check under
 * either spelling.
 *
 * @param configuration - The raw configuration.
 * @returns The problems found; an empty array means the blocks are valid.
 */
function validateExtensionBlocks(
  configuration: Record<string, unknown>
): string[] {
  const problems: string[] = [];
  const listed = (key: 'styling' | 'targets'): unknown[] | undefined =>
    Array.isArray(configuration[key])
      ? (configuration[key] as unknown[])
      : key === 'styling' && configuration[key] === undefined
        ? []
        : undefined;
  const blocks: Partial<Record<ExtensionBlock, Record<string, unknown>>> = {};
  for (const block of extensionBlocks) {
    const value = configuration[block];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      problems.push(
        `'${block}' must be an object of the ${block} extension's options: ${extensionBlockKeys[block].join(', ')}`
      );
      continue;
    }
    blocks[block] = value as Record<string, unknown>;
    problems.push(
      ...unknownKeyProblems(
        blocks[block],
        extensionBlockKeys[block],
        block,
        `the '${block}' block`
      )
    );
    // A block for an extension the kit does not apply would be ignored,
    // which is what a reader is told instead. An invalid list is reported
    // on its own.
    const applied = block === 'svelte' ? listed('targets') : listed('styling');
    if (applied !== undefined && !applied.includes(block)) {
      problems.push(
        block === 'svelte'
          ? "'svelte' is set, but 'targets' does not list svelte; add the target or remove the block"
          : `'${block}' is set, but 'styling' does not list ${block}; add the extension or remove the block`
      );
    }
  }
  for (const { block, option, flat, check } of extensionOptions) {
    const inBlock = blocks[block]?.[option];
    const inFlat = configuration[flat];
    if (inBlock !== undefined && inFlat !== undefined) {
      problems.push(
        `'${flat}' and '${block}.${option}' are both set; keep ${block}.${option}`
      );
    }
    const blockProblem =
      inBlock === undefined ? undefined : check(`${block}.${option}`, inBlock);
    if (blockProblem !== undefined) {
      problems.push(blockProblem);
    }
    const flatProblem = inFlat === undefined ? undefined : check(flat, inFlat);
    if (flatProblem !== undefined) {
      problems.push(flatProblem);
    }
  }
  return problems;
}

/**
 * Validates the `add` block: shared modules with kit-relative sources and
 * output-relative destinations, and the notes printed after an add.
 *
 * @param value - The raw configuration value.
 * @returns The problems found; an empty array means the value is valid.
 */
function validateAddConfiguration(
  value: unknown,
  inPackages: boolean
): string[] {
  if (value === undefined) {
    return [];
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [
      "'add' must be an object with optional 'shared', 'notes', 'consumerConfiguration' and 'ownership'",
    ];
  }
  const add = value as Record<string, unknown>;
  const problems: string[] = unknownKeyProblems(
    add,
    addKeys,
    'add',
    "the 'add' block"
  );

  if (add.shared !== undefined) {
    if (!Array.isArray(add.shared)) {
      problems.push("'add.shared' must be an array");
    } else {
      const names = new Map<string, number>();
      add.shared.forEach((entry, index) => {
        const moduleProblems = validateSharedModule(
          entry,
          `add.shared[${index}]`,
          inPackages
        );
        problems.push(...moduleProblems);
        if (moduleProblems.length > 0) {
          return;
        }
        // Only names a kit writes can collide: a default name that meets
        // another is derived from the module's whole source path instead
        // (see sharedModuleNames).
        const name = (entry as SharedModule).name;
        if (name === undefined) {
          return;
        }
        const first = names.get(name);
        if (first === undefined) {
          names.set(name, index);
        } else {
          problems.push(
            `'add.shared[${index}]' is named '${name}', as 'add.shared[${first}]' is; give each shared module its own 'name'`
          );
        }
      });
    }
  }

  const consumerConfiguration = add.consumerConfiguration;
  if (
    consumerConfiguration !== undefined &&
    (typeof consumerConfiguration !== 'string' ||
      !/^[^\\/]+\.json$/.test(consumerConfiguration))
  ) {
    problems.push(
      "'add.consumerConfiguration' must be a file name ending in .json, such as 'my-ui-kit.json'"
    );
  }

  if (
    add.ownership !== undefined &&
    !(addOwnerships as readonly unknown[]).includes(add.ownership)
  ) {
    problems.push(`'add.ownership' must be one of ${addOwnerships.join(', ')}`);
  }

  if (
    add.notes !== undefined &&
    (!Array.isArray(add.notes) ||
      !add.notes.every((note) => typeof note === 'string'))
  ) {
    problems.push("'add.notes' must be an array of strings");
  }

  return problems;
}

/**
 * Validates a shared module. A kit built into several packages may name a
 * source in another package's directory, which the build checks lies in
 * one of them.
 */
function validateSharedModule(
  value: unknown,
  path: string,
  inPackages: boolean
): string[] {
  const label = `'${path}'`;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [`${label} must be an object with a 'source'`];
  }
  const sharedModule = value as Record<string, unknown>;
  const problems: string[] = unknownKeyProblems(
    sharedModule,
    sharedModuleKeys,
    path,
    'a shared module'
  );

  for (const key of ['source', 'destination'] as const) {
    const path = sharedModule[key];
    if (path === undefined) {
      if (key === 'source') {
        problems.push(`${label}.source is required`);
      }
      continue;
    }
    if (typeof path !== 'string' || path === '') {
      problems.push(`${label}.${key} must be a non-empty string`);
    } else if (key === 'source' && inPackages) {
      if (isAbsolutePath(path)) {
        problems.push(
          `${label}.source must be a path relative to the kit root, inside the kit root or one of its packages`
        );
      }
    } else if (!isContainedRelativePath(path)) {
      problems.push(
        `${label}.${key} must be a relative path that stays inside its directory`
      );
    }
  }

  if (
    sharedModule.specifier !== undefined &&
    (typeof sharedModule.specifier !== 'string' ||
      sharedModule.specifier === '')
  ) {
    problems.push(`${label}.specifier must be a non-empty string`);
  }

  if (
    sharedModule.name !== undefined &&
    (typeof sharedModule.name !== 'string' ||
      !SHARED_MODULE_NAME.test(sharedModule.name))
  ) {
    problems.push(
      `${label}.name must be letters, digits, '-' and '_', starting with a letter or digit, such as 'scripts'`
    );
  }

  if (
    sharedModule.copy !== undefined &&
    !(sharedModuleCopies as readonly unknown[]).includes(sharedModule.copy)
  ) {
    problems.push(
      `${label}.copy must be one of ${sharedModuleCopies.join(', ')}`
    );
  }

  if (
    sharedModule.exclude !== undefined &&
    (!Array.isArray(sharedModule.exclude) ||
      !sharedModule.exclude.every(
        (path) =>
          typeof path === 'string' &&
          path !== '' &&
          isContainedRelativePath(path)
      ))
  ) {
    problems.push(
      `${label}.exclude must be an array of relative paths inside the source`
    );
  }

  return problems;
}

/** What a shared module's name may be: a consumer's settings key it. */
const SHARED_MODULE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * A shared module's name: its `name`, else the base name of its source
 * without the extension (`src/styles/tokens.css` gives `tokens`).
 *
 * @param sharedModule - The shared module.
 * @returns The name a consumer's settings place and own the module by.
 */
export function sharedModuleName(sharedModule: SharedModule): string {
  if (sharedModule.name !== undefined) {
    return sharedModule.name;
  }
  const base = basename(sharedModule.source.replace(/[\\/]+$/, ''));
  return base.slice(0, base.length - extname(base).length) || base;
}

/** One shared module's name, and whether a collision derived it. */
export interface SharedModuleNaming {
  name: string;
  /**
   * The default name it would have had, when that collided with another
   * module's name and the name was derived from the whole source path.
   */
  collided?: string;
}

/**
 * Every shared module's name, in order: its `name`, else its default name
 * (see {@link sharedModuleName}). A default name another module's name
 * already takes, written or default, is derived from the module's whole
 * source path instead (`src/other/lib` gives `src-other-lib`), so two
 * modules with the same base name never share one.
 *
 * @param sharedModules - The kit configuration's `add.shared`.
 * @returns Each module's name, with the default it replaces when it does.
 */
export function sharedModuleNames(
  sharedModules: SharedModule[]
): SharedModuleNaming[] {
  const written = new Set(
    sharedModules.flatMap((entry) =>
      entry.name === undefined ? [] : [entry.name]
    )
  );
  const taken = new Set(written);
  return sharedModules.map((entry) => {
    if (entry.name !== undefined) {
      return { name: entry.name };
    }
    const name = sharedModuleName(entry);
    if (!taken.has(name)) {
      taken.add(name);
      return { name };
    }
    const source = entry.source.replace(/\\/g, '/').replace(/\/+$/, '');
    const extension = extname(source);
    let derived = source
      .slice(0, source.length - extension.length)
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^[-_]+|-+$/g, '');
    while (taken.has(derived)) {
      derived = `${derived}-${taken.size}`;
    }
    taken.add(derived);
    return { name: derived, collided: name };
  });
}

/** Whether a path is relative and never climbs above its starting directory. */
function isContainedRelativePath(path: string): boolean {
  if (isAbsolutePath(path)) {
    return false;
  }
  return !path.split(/[\\/]/).includes('..');
}

/** Whether a path is absolute, in POSIX or Windows form. */
function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path);
}

/** The keys a scripted target's package entry takes. */
const targetPackageKeys = [
  'name',
  'directory',
  'dependencies',
  'peerDependencies',
] as const satisfies readonly (keyof KitTargetPackage)[];

/** The keys the styles package entry takes. */
const stylesPackageKeys = [
  'name',
  'directory',
] as const satisfies readonly (keyof KitPackageEntry)[];

/** A package name as npm takes one: an optional scope, lowercase, URL-safe. */
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;

/**
 * Validates the `packages` block: an entry per built target and one for the
 * styles package, each a valid name and a directory of its own, and the
 * settings the layout needs.
 *
 * @param configuration - The raw configuration.
 * @returns The problems found; an empty array means the value is valid.
 */
function validatePackages(configuration: Record<string, unknown>): string[] {
  const value = configuration.packages;
  if (value === undefined) {
    return [];
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [
      "'packages' must be an object with an entry per target and a 'styles' entry",
    ];
  }
  const packages = value as Record<string, unknown>;
  const scriptedTargets = targetNames.filter((target) => target !== 'html');
  const problems: string[] = unknownKeyProblems(
    packages,
    [...scriptedTargets, 'styles'],
    'packages',
    "the 'packages' block"
  );
  const targets = Array.isArray(configuration.targets)
    ? (configuration.targets as unknown[])
    : [];
  if (targets.includes('html')) {
    problems.push(
      "'packages' builds the scripted targets into packages of their own; the html target is built only into a single-package kit, so remove 'html' from 'targets' or 'packages'"
    );
  }
  for (const target of scriptedTargets) {
    if (targets.includes(target) && packages[target] === undefined) {
      problems.push(
        `'packages' has no entry for the ${target} target; add '${target}': { name, directory }`
      );
    } else if (!targets.includes(target) && packages[target] !== undefined) {
      problems.push(
        `'packages.${target}' names a package for a target the kit does not build; add '${target}' to 'targets' or remove the entry`
      );
    }
  }
  if (packages.styles === undefined) {
    problems.push(
      "'packages' needs a 'styles' entry: the package the component stylesheets are written into"
    );
  }

  const names = new Map<string, string>();
  const directories = new Map<string, string>();
  for (const key of [...scriptedTargets, 'styles'] as const) {
    const entry = packages[key];
    if (entry === undefined) {
      continue;
    }
    const path = `packages.${key}`;
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      problems.push(`'${path}' must be an object with a name and a directory`);
      continue;
    }
    const fields = entry as Record<string, unknown>;
    problems.push(
      ...unknownKeyProblems(
        fields,
        key === 'styles' ? stylesPackageKeys : targetPackageKeys,
        path,
        key === 'styles' ? 'the styles package' : 'a target package'
      )
    );
    if (typeof fields.name !== 'string' || !PACKAGE_NAME.test(fields.name)) {
      problems.push(
        `'${path}.name' must be a package name, such as '@acme/${key}' or 'acme-${key}'`
      );
    } else {
      const other = names.get(fields.name);
      if (other !== undefined) {
        problems.push(
          `'${path}.name' is '${fields.name}', as 'packages.${other}.name' is; each package needs a name of its own`
        );
      }
      names.set(fields.name, key);
    }
    const directory = fields.directory;
    if (
      typeof directory !== 'string' ||
      directory.trim() === '' ||
      isAbsolutePath(directory)
    ) {
      problems.push(
        `'${path}.directory' must be a directory relative to the kit root, such as '../${key}'`
      );
    } else {
      const normalized = normalize(directory.replace(/\\/g, '/')).replace(
        /[\\/]+$/,
        ''
      );
      if (normalized === '.' || normalized === '') {
        problems.push(
          `'${path}.directory' is the kit root, which keeps its own package; give the ${key} package a directory of its own`
        );
      }
      for (const [otherDirectory, otherKey] of directories) {
        if (
          contains(otherDirectory, normalized) ||
          contains(normalized, otherDirectory)
        ) {
          problems.push(
            `'${path}.directory' and 'packages.${otherKey}.directory' overlap; each package needs a directory of its own, neither inside the other`
          );
        }
      }
      directories.set(normalized, key);
    }
    if (key !== 'styles') {
      for (const field of ['dependencies', 'peerDependencies'] as const) {
        const ranges = fields[field];
        if (
          ranges !== undefined &&
          (typeof ranges !== 'object' ||
            ranges === null ||
            Array.isArray(ranges) ||
            !Object.values(ranges).every(
              (range) => typeof range === 'string' && range !== ''
            ))
        ) {
          problems.push(
            `'${path}.${field}' must map package names to version ranges, such as { "@zag-js/react": "^1.0.0" }`
          );
        }
      }
    }
  }

  const stylesheetLink = configuration.stylesheetLink ?? 'component';
  if (stylesheetLink !== 'both' && stylesheetLink !== 'none') {
    problems.push(
      "'packages' requires 'stylesheetLink' of 'both' or 'none': the stylesheets are written into the styles package, so a component cannot link its own beside it"
    );
  }
  return problems;
}

/** Whether one normalized relative directory is, or lies inside, another. */
function contains(directory: string, candidate: string): boolean {
  // Resolved from a base deeper than any `..` climbs, so '../react' and
  // '../../react' stay apart.
  const base = resolve('/', ...Array.from({ length: 64 }, () => 'level'));
  const fromDirectory = relative(
    resolve(base, directory),
    resolve(base, candidate)
  );
  return (
    fromDirectory === '' ||
    (!fromDirectory.startsWith('..') && !isAbsolute(fromDirectory))
  );
}

/**
 * Validates the `stylingLayer` value: a non-empty layer name, or an object
 * naming the layer and optionally the full layer order.
 *
 * @param value - The raw configuration value.
 * @returns The problems found; an empty array means the value is valid.
 */
function validateStylingLayer(value: unknown): string[] {
  if (value === undefined || (typeof value === 'string' && value !== '')) {
    return [];
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [
      "'stylingLayer' must be a non-empty layer name, or an object with 'name' and optional 'order' and 'owned'",
    ];
  }
  const layer = value as Record<string, unknown>;
  const problems: string[] = unknownKeyProblems(
    layer,
    stylingLayerKeys,
    'stylingLayer',
    "the object form of 'stylingLayer'"
  );
  if (typeof layer.name !== 'string' || layer.name === '') {
    problems.push("'stylingLayer.name' must be a non-empty string");
  }
  if (
    layer.order !== undefined &&
    (!Array.isArray(layer.order) ||
      !layer.order.every((name) => typeof name === 'string' && name !== ''))
  ) {
    problems.push("'stylingLayer.order' must be an array of layer names");
  }
  if (layer.owned !== undefined) {
    problems.push(...validateOwnedLayer(layer));
  }
  return problems;
}

/**
 * Validates `stylingLayer.owned`: a layer name other than `name`, which the
 * layer order lists after `name`, so a consumer's copied stylesheet sits
 * above the kit's component rules.
 */
function validateOwnedLayer(layer: Record<string, unknown>): string[] {
  const { name, order, owned } = layer;
  if (typeof owned !== 'string' || owned === '') {
    return ["'stylingLayer.owned' must be a non-empty layer name"];
  }
  if (owned === name) {
    return [
      "'stylingLayer.owned' must name a layer of its own, after 'stylingLayer.name' in 'stylingLayer.order'",
    ];
  }
  if (!Array.isArray(order)) {
    return [
      `'stylingLayer.owned' requires 'stylingLayer.order', listing '${owned}' after '${String(name)}'`,
    ];
  }
  const ownedIndex = order.indexOf(owned);
  const nameIndex = order.indexOf(name);
  if (ownedIndex === -1 || nameIndex === -1 || ownedIndex < nameIndex) {
    return [
      `'stylingLayer.order' must list '${owned}' after '${String(name)}', so a consumer's copied stylesheet sits above the kit's component rules`,
    ];
  }
  return [];
}

function validateNameList(
  value: unknown,
  key: string,
  allowed: readonly string[],
  { required }: { required: boolean }
): string[] {
  if (value === undefined) {
    return required ? [`'${key}' is required`] : [];
  }
  if (!Array.isArray(value)) {
    return [`'${key}' must be an array`];
  }
  if (required && value.length === 0) {
    return [`'${key}' must name at least one of ${allowed.join(', ')}`];
  }
  const unknown = value.filter((entry) => !allowed.includes(entry as string));
  if (unknown.length > 0) {
    return [
      `'${key}' contains unknown ${unknown.map((entry) => `'${String(entry)}'`).join(', ')}; allowed are ${allowed.join(', ')}`,
    ];
  }
  return [];
}

/**
 * Gives a kit configuration its type, for `scaffold-ui-kit.ts`: the object
 * is returned as it is.
 *
 * @param configuration - The kit's configuration.
 * @returns The same configuration.
 * @example
 * ```ts
 * // scaffold-ui-kit.ts
 * import { defineKit } from 'scaffold-ui-kit';
 *
 * export default defineKit({
 *   name: 'my-ui-kit',
 *   targets: ['react', 'vue'],
 *   styling: ['bem'],
 * });
 * ```
 */
export function defineKit(configuration: KitConfiguration): KitConfiguration {
  return configuration;
}

/** Where to look for a kit's configuration besides its root. */
export interface ConfigurationLookupOptions {
  /**
   * The configuration file, as given to a command's `--configuration`:
   * relative to `workingDirectory`, or absolute. It wins over the kit's
   * `package.json` pointer and the root.
   */
  configuration?: string;
  /** What a relative `configuration` resolves against; the process's. */
  workingDirectory?: string;
}

/** The file a kit's configuration is read from. */
export interface ConfigurationFile {
  /** The file, absolute. */
  path: string;
  /** The file relative to the kit root, as messages name it. */
  name: string;
  /** Whether it is `scaffold-ui-kit.config.json`, read with a warning until
   *  3.0.0. */
  legacy: boolean;
}

/**
 * The file extensions a kit configuration can have: a TypeScript or
 * JavaScript module, loaded for its default export, or JSON.
 */
export const CONFIGURATION_FILE_EXTENSIONS = [
  '.ts',
  '.mts',
  '.cts',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
] as const;

/**
 * Finds a kit's configuration file: the one `--configuration` names, else
 * the one the kit's `package.json` points to under
 * `"scaffold-ui-kit": { "configuration": "<path>" }` (relative to the kit
 * root), else `scaffold-ui-kit.ts` or `scaffold-ui-kit.json` in the kit
 * root, else `scaffold-ui-kit.config.json` there, read with a warning until
 * 3.0.0.
 *
 * @param kitDirectory - The kit root.
 * @param options - The file a command was given, if any.
 * @returns The file.
 * @throws When the named file does not exist, two root files compete, or
 *   there is none.
 */
export function findConfigurationFile(
  kitDirectory: string,
  options: ConfigurationLookupOptions = {}
): ConfigurationFile {
  const root = resolve(kitDirectory);
  const named = (path: string, source: string): ConfigurationFile => {
    if (!existsSync(path)) {
      throw new Error(`${source} names ${path}, which does not exist.`);
    }
    const extension = extname(path);
    if (
      !(CONFIGURATION_FILE_EXTENSIONS as readonly string[]).includes(extension)
    ) {
      throw new Error(
        `${source} names ${path}; a kit configuration is a ${CONFIGURATION_FILE_EXTENSIONS.join(', ')} file.`
      );
    }
    return {
      path,
      name: relative(root, path).split(sep).join('/') || basename(path),
      legacy: basename(path) === LEGACY_CONFIGURATION_FILE_NAME,
    };
  };

  if (options.configuration !== undefined) {
    return named(
      resolve(options.workingDirectory ?? process.cwd(), options.configuration),
      '--configuration'
    );
  }

  const pointer = packagePointer(root);
  if (pointer !== undefined) {
    return named(
      resolve(root, pointer),
      'package.json "scaffold-ui-kit.configuration"'
    );
  }

  const present = [
    ...CONFIGURATION_FILE_NAMES,
    LEGACY_CONFIGURATION_FILE_NAME,
  ].filter((name) => existsSync(join(root, name)));
  if (present.length > 1) {
    throw new Error(
      `'${root}' has ${present.join(' and ')}; keep one kit configuration.`
    );
  }
  if (present.length === 0) {
    throw new Error(
      `No ${CONFIGURATION_FILE_NAMES.join(' or ')} found in '${root}'. Run this command in a kit created by scaffold-ui-kit, or name the file with --configuration.`
    );
  }
  return {
    path: join(root, present[0]),
    name: present[0],
    legacy: present[0] === LEGACY_CONFIGURATION_FILE_NAME,
  };
}

/** The `"scaffold-ui-kit": { "configuration" }` of a kit's package.json. */
function packagePointer(root: string): string | undefined {
  const packagePath = join(root, 'package.json');
  if (!existsSync(packagePath)) {
    return undefined;
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(packagePath, 'utf8'));
  } catch {
    return undefined;
  }
  const section = (manifest as Record<string, unknown> | null)?.[
    'scaffold-ui-kit'
  ];
  // A section without `configuration` belongs to something else.
  if (
    typeof section !== 'object' ||
    section === null ||
    !('configuration' in section)
  ) {
    return undefined;
  }
  const pointer = (section as Record<string, unknown>).configuration;
  if (typeof pointer !== 'string' || pointer === '') {
    throw new Error(
      'package.json "scaffold-ui-kit.configuration" must be a path, the kit configuration relative to the kit root.'
    );
  }
  return pointer;
}

/** A configuration module, loaded afresh, and the modules it loaded. */
interface LoadedKitModule {
  /** The module's exports. */
  exports: Record<string, unknown>;
  /**
   * Every module the load evaluated, absolute: the configuration and what
   * it imports, installed packages left out.
   */
  modules: string[];
}

/**
 * The modules the last configuration load recorded, which the next load
 * evicts from the module cache so it evaluates them afresh.
 */
const recordedConfigurationModules = new Set<string>();

/** Whether a cached module path is an installed package's. */
function isInstalledPackage(path: string): boolean {
  return path.split(sep).includes('node_modules');
}

/**
 * Loads a TypeScript or JavaScript configuration module through jiti,
 * evaluating afresh the modules the last load recorded, so an edit since is
 * read anew, and reports every module the load evaluated that is not an
 * installed package, wherever it lives: the kit's own, or a workspace
 * sibling's it imports, such as design tokens linked into the kit.
 *
 * @param path - The module, absolute.
 * @returns The module's exports and the modules it loaded.
 */
function loadConfigurationModule(path: string): LoadedKitModule {
  const cache = require.cache;
  for (const recorded of recordedConfigurationModules) delete cache[recorded];
  recordedConfigurationModules.clear();
  // The configuration itself, however something else loaded it before.
  delete cache[path];
  delete cache[realpathSync(path)];
  const before = new Set(Object.keys(cache));
  const jiti = createJiti(__filename, {
    interopDefault: true,
    moduleCache: true,
    fsCache: false,
  });
  const loadedModules = (): string[] =>
    Object.keys(cache).filter(
      (cached) => !before.has(cached) && !isInstalledPackage(cached)
    );
  try {
    const loaded = jiti(path) as unknown;
    return {
      exports:
        typeof loaded === 'object' && loaded !== null
          ? (loaded as Record<string, unknown>)
          : { default: loaded },
      modules: loadedModules(),
    };
  } finally {
    // A load that failed halfway is evicted the same way next time.
    for (const module of loadedModules())
      recordedConfigurationModules.add(module);
  }
}

/** A configuration file's value, unvalidated, and the kit modules it loaded. */
interface ConfigurationFileContents {
  value: unknown;
  /** The modules a `.ts` configuration loaded, itself among them. */
  modules: string[];
}

/** Reads a configuration file, recording the kit modules a module loads. */
function readConfigurationContents(
  file: ConfigurationFile
): ConfigurationFileContents {
  if (extname(file.path) === '.json') {
    try {
      return {
        value: JSON.parse(readFileSync(file.path, 'utf8')),
        modules: [],
      };
    } catch (error) {
      throw new Error(
        `${file.name} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  let loaded: LoadedKitModule;
  try {
    loaded = loadConfigurationModule(file.path);
  } catch (error) {
    throw new Error(
      `${file.name} failed to load: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const value =
    'default' in loaded.exports ? loaded.exports.default : loaded.exports;
  if (typeof value !== 'object' || value === null) {
    throw new Error(
      `${file.name} must default-export the kit configuration: export default defineKit({ ... })`
    );
  }
  return { value, modules: loaded.modules };
}

/**
 * Reads a configuration file's value, unvalidated: JSON parsed, or a module's
 * default export, loaded afresh.
 *
 * @param file - The file.
 * @returns The value it holds.
 */
export function readConfigurationFile(file: ConfigurationFile): unknown {
  return readConfigurationContents(file).value;
}

/** A kit's configuration, with the file it came from. */
export interface ResolvedKitConfiguration {
  /** The kit root, absolute. */
  kitDirectory: string;
  /** The file the configuration was read from. */
  file: ConfigurationFile;
  /**
   * The validated configuration, in its current form: a deprecated key is
   * read into the key that replaced it and left out (see
   * {@link normalizeDeprecatedKeys}), so a reader sees `stylesheetPlacement`
   * and the `bem`, `tailwind` and `svelte` blocks alone.
   */
  configuration: KitConfiguration;
  /**
   * What the file's reader warns of: the old file name, and each deprecated
   * key it read.
   */
  warnings: string[];
  /**
   * The modules a `.ts` configuration loaded, absolute, itself among them,
   * inside the kit root or not (a workspace sibling it imports), installed
   * packages left out; none for JSON. A tool that reloads on a change
   * watches them.
   */
  modules: string[];
}

/**
 * Finds, reads and validates a kit's configuration: the one resolver the
 * build and the preview share.
 *
 * @param kitDirectory - The kit root.
 * @param options - The file a command was given, if any.
 * @returns The configuration, its file, and what to warn of.
 * @throws When no file is found, it fails to read, or it is invalid.
 * @example
 * ```ts
 * const { configuration, warnings } = resolveKitConfiguration(process.cwd(), {
 *   configuration: options.configuration,
 * });
 * ```
 */
export function resolveKitConfiguration(
  kitDirectory: string,
  options: ConfigurationLookupOptions = {}
): ResolvedKitConfiguration {
  const file = findConfigurationFile(kitDirectory, options);
  const { value: parsed, modules } = readConfigurationContents(file);
  // In scaffold-ui-kit.config.json an unknown top-level key is a warning and
  // ignored; in the other files it is an error.
  const problems = validateConfiguration(parsed, {
    unknownTopLevelKeys: file.legacy ? 'warning' : 'error',
  });
  if (problems.length > 0) {
    throw new Error(
      `${file.name} is invalid:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`
    );
  }
  const configuration = {
    ...(parsed as KitConfiguration),
    // `styling` is optional in the file; a kit without it applies none.
    styling: (parsed as KitConfiguration).styling ?? [],
  };
  const deprecations = normalizeDeprecatedKeys(configuration);
  return {
    kitDirectory: resolve(kitDirectory),
    file,
    configuration,
    warnings: [
      ...(file.legacy
        ? [
            `${file.name}: warning: the kit configuration is read under its old name, which stops being read in 3.0.0; rename it to ${CONFIGURATION_FILE_NAMES[1]}, or write it as ${CONFIGURATION_FILE_NAMES[0]} with defineKit`,
            ...topLevelKeyProblems(parsed as Record<string, unknown>).map(
              (problem) =>
                `${file.name}: warning: ${problem}; it is ignored here, and an error under ${CONFIGURATION_FILE_NAMES.join(' or ')}`
            ),
          ]
        : []),
      ...deprecations.map((deprecation) => `${file.name}: ${deprecation}`),
    ],
    modules,
  };
}

/**
 * Reads each deprecated key of a validated configuration into the key that
 * replaced it, and removes it: `stylingStrategy` becomes
 * `stylesheetPlacement`, and the flat `bem*`, `tailwind*` and `svelteMode`
 * keys become options of the `bem`, `tailwind` and `svelte` blocks. The
 * configuration is changed in place, so every reader sees the current form
 * alone.
 *
 * @param configuration - The validated configuration, which validation has
 *   kept from setting an option under both spellings.
 * @returns A warning per key read, without the file name.
 */
function normalizeDeprecatedKeys(configuration: KitConfiguration): string[] {
  const warnings: string[] = [];
  const mutable = configuration as unknown as Record<string, unknown>;
  if (configuration.stylingStrategy !== undefined) {
    configuration.stylesheetPlacement = configuration.stylingStrategy;
    delete mutable.stylingStrategy;
    warnings.push(
      "warning: 'stylingStrategy' is deprecated, is read as 'stylesheetPlacement' and will be removed in 3.0.0; rename the key"
    );
  }
  for (const { block, option, flat } of extensionOptions) {
    const value = mutable[flat];
    if (value === undefined) {
      continue;
    }
    mutable[block] = {
      ...(mutable[block] as object | undefined),
      [option]: value,
    };
    delete mutable[flat];
    warnings.push(
      `warning: '${flat}' is deprecated, is read as '${block}.${option}' and will be removed in 3.0.0; move it into the '${block}' block`
    );
  }
  return warnings;
}

/**
 * Loads and validates the kit configuration in a directory.
 *
 * @param kitDirectory - The kit root directory.
 * @param options - The file a command was given, if any.
 * @returns The validated configuration.
 */
export function loadConfiguration(
  kitDirectory: string,
  options: ConfigurationLookupOptions = {}
): KitConfiguration {
  return resolveKitConfiguration(kitDirectory, options).configuration;
}
