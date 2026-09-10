import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  OutputStrategy,
  StyleLayer,
  StylesheetLink,
} from '@js-template-engine/types';

/** The file name a kit's configuration lives under, in the kit root. */
export const configurationFileName = 'scaffold-ui-kit.config.json';

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

const outputStrategies = ['inline', 'in-file', 'separate-file'];
const stylesheetLinks = ['component', 'none'];

/**
 * A file or directory the consumer CLI copies beside the components, once:
 * a layer the built components import that is not itself a component - a
 * scripts module, a sass helper directory, a theme entry point.
 */
export interface SharedLayer {
  /** The file or directory to copy, relative to the kit root. */
  source: string;
  /**
   * Where it lands, relative to the consumer's output directory; defaults
   * to the source's base name.
   */
  destination?: string;
  /**
   * The package path the built files import the layer by, e.g.
   * `'my-ui-kit/scripts'`. Imports of it (and of any `specifier/sub/path`)
   * in the copied files are rewritten to the relative path of the copy.
   */
  specifier?: string;
  /**
   * Paths inside the layer, relative to `source`, left out of the copy -
   * the parts that belong to the package's import-and-use face rather than
   * to a copy, such as an aggregate stylesheet or a barrel.
   */
  exclude?: string[];
}

/** What the consumer CLI's `add` command copies and says beyond components. */
export interface AddConfiguration {
  /** Layers copied beside the components on the first `add`. */
  shared?: SharedLayer[];
  /** Lines printed after a successful `add` - the kit's setup guidance. */
  notes?: string[];
}

/**
 * A kit's configuration, read from `scaffold-ui-kit.config.json` by the
 * `build` command and the kit's consumer CLI.
 */
export interface KitConfiguration {
  /** The kit's package name. */
  name: string;
  /** The targets every component is built for, e.g. `['react', 'vue']`. */
  targets: TargetName[];
  /** Styling extensions applied to every build, in application order. */
  styling: StylingName[];
  /**
   * How the Tailwind extension emits when `'tailwind'` is in `styling`:
   * `'classes'` (default) appends the utility classes verbatim;
   * `'styles'` converts them to plain CSS so the output needs no Tailwind
   * build. Ignored when `'tailwind'` is not configured.
   */
  tailwindOutput?: TailwindOutput;
  /**
   * When `true`, converts each component's authored `style` into Tailwind
   * utility classes (the inverse of `tailwindOutput: 'styles'`). Defaults
   * to `false`. Ignored when `'tailwind'` is not configured.
   */
  tailwindConvertStyles?: boolean;
  /** Style output strategy; defaults to `'in-file'`. */
  stylingStrategy?: OutputStrategy;
  /**
   * Whether each component links the stylesheet `stylingStrategy:
   * 'separate-file'` emits; defaults to `'component'`. `'none'` emits
   * `<Name>.css` exactly as before and links it from nowhere, so a kit can
   * ship per-component stylesheets its consumer loads however it likes - as
   * one bundle, one at a time, or through its own build. Requires the
   * `separate-file` strategy.
   */
  stylesheetLink?: StylesheetLink;
  /**
   * The cascade layer emitted stylesheet rules are wrapped in; omitted emits
   * them unlayered. A bare string names the layer; the object form also
   * declares the full layer order (`@layer a, b, c;`) ahead of the wrapper,
   * which a kit shipping one stylesheet per component has nowhere else to
   * state. Applies under every styling strategy.
   */
  stylingLayer?: string | StyleLayer;
  /**
   * Stylesheet output language; defaults to `'css'`. `'scss'` emits nested
   * SCSS. The react and html targets require the `separate-file` strategy
   * under `'scss'`; Vue and Svelte tag their SFC style blocks `lang="scss"`.
   */
  stylingLanguage?: 'css' | 'scss';
  /**
   * Sass load-path directories, relative to the kit root, for resolving
   * `@use`/`@include` in component styles. Under `stylingLanguage: 'css'`
   * (or the `inline` strategy) the engine resolves the Sass itself against
   * them - expanding mixins, functions, and `$variables` to flat CSS - so a
   * kit can author SCSS helpers and still emit any styling strategy. Under
   * `'scss'` they pass through for the consumer's own sass build.
   */
  loadPaths?: string[];
  /** Script output strategy; defaults to `'in-file'`. */
  scriptingStrategy?: OutputStrategy;
  /**
   * Script output language; defaults to `'javascript'`. `'typescript'`
   * types the generated prop-default consts. It affects the html target
   * only - the framework targets emit TypeScript regardless - and there
   * requires the `separate-file` strategy (emitting `<Name>.ts`).
   */
  scriptingLanguage?: 'javascript' | 'typescript';
  /** Separator between BEM block and element; defaults to `'__'`. */
  bemElementSeparator?: string;
  /** Separator before a BEM modifier; defaults to `'--'`. */
  bemModifierSeparator?: string;
  /**
   * How BEM classes are rendered when `'bem'` is in `styling`; defaults to
   * `'literal'`. `'runtime'` emits `use-bem` `bem(...)` calls for the
   * framework targets (HTML keeps the literal classes) - the kit then ships
   * `use-bem` as a peer dependency. Ignored when `'bem'` is not configured.
   */
  bemMode?: BemMode;
  /**
   * The package the `use-bem` helper is imported from under
   * `bemMode: 'runtime'`; defaults to `'use-bem'`. Ignored otherwise.
   */
  bemImportSource?: string;
  /**
   * How the Svelte target emits when `'svelte'` is in `targets`; defaults
   * to `'legacy'`. `'runes'` emits Svelte 5 runes components - a typed
   * `Props` interface destructured from `$props()`, snippet props rendered
   * through `{@render}`, and `onevent` attribute bindings - in place of the
   * classic `export let`, `<slot>`, and `on:event` component shape. Ignored
   * when `'svelte'` is not a target.
   */
  svelteMode?: SvelteMode;
  /**
   * What the consumer CLI's `add` command copies beside the components
   * (`shared`: the non-component layers the built files import, each with
   * the package specifier to rewrite to the copy) and prints afterwards
   * (`notes`). Omitted, `add` copies components and their relative imports
   * alone.
   */
  add?: AddConfiguration;
}

/**
 * Validates a parsed configuration value.
 *
 * @param value - The parsed JSON value.
 * @returns The problems found; an empty array means the value is valid.
 */
export function validateConfiguration(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return ['configuration must be a JSON object'];
  }
  const problems: string[] = [];
  const configuration = value as Record<string, unknown>;

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

  const tailwindOutput = configuration.tailwindOutput;
  if (
    tailwindOutput !== undefined &&
    !tailwindOutputs.includes(tailwindOutput as TailwindOutput)
  ) {
    problems.push(`'tailwindOutput' must be one of ${tailwindOutputs.join(', ')}`);
  }

  for (const key of ['stylingStrategy', 'scriptingStrategy'] as const) {
    const strategy = configuration[key];
    if (strategy !== undefined && !outputStrategies.includes(strategy as string)) {
      problems.push(
        `'${key}' must be one of ${outputStrategies.join(', ')}`
      );
    }
  }

  const stylesheetLink = configuration.stylesheetLink;
  if (
    stylesheetLink !== undefined &&
    !stylesheetLinks.includes(stylesheetLink as string)
  ) {
    problems.push(`'stylesheetLink' must be one of ${stylesheetLinks.join(', ')}`);
  } else if (
    stylesheetLink === 'none' &&
    (configuration.stylingStrategy ?? 'in-file') !== 'separate-file'
  ) {
    problems.push(
      "'stylesheetLink' of 'none' requires 'stylingStrategy' of 'separate-file'"
    );
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

  for (const key of ['bemElementSeparator', 'bemModifierSeparator'] as const) {
    const separator = configuration[key];
    if (separator !== undefined && typeof separator !== 'string') {
      problems.push(`'${key}' must be a string`);
    }
  }

  const bemMode = configuration.bemMode;
  if (bemMode !== undefined && !bemModes.includes(bemMode as BemMode)) {
    problems.push(`'bemMode' must be one of ${bemModes.join(', ')}`);
  }

  const svelteMode = configuration.svelteMode;
  if (
    svelteMode !== undefined &&
    !svelteModes.includes(svelteMode as SvelteMode)
  ) {
    problems.push(`'svelteMode' must be one of ${svelteModes.join(', ')}`);
  }

  if (
    configuration.bemImportSource !== undefined &&
    typeof configuration.bemImportSource !== 'string'
  ) {
    problems.push("'bemImportSource' must be a string");
  }

  if (
    configuration.tailwindConvertStyles !== undefined &&
    typeof configuration.tailwindConvertStyles !== 'boolean'
  ) {
    problems.push("'tailwindConvertStyles' must be a boolean");
  }

  problems.push(...validateAddConfiguration(configuration.add));

  return problems;
}

/**
 * Validates the `add` block: shared layers with kit-relative sources and
 * output-relative destinations, and the notes printed after an add.
 *
 * @param value - The raw configuration value.
 * @returns The problems found; an empty array means the value is valid.
 */
function validateAddConfiguration(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return ["'add' must be an object with optional 'shared' and 'notes'"];
  }
  const problems: string[] = [];
  const add = value as Record<string, unknown>;

  if (add.shared !== undefined) {
    if (!Array.isArray(add.shared)) {
      problems.push("'add.shared' must be an array");
    } else {
      add.shared.forEach((entry, index) => {
        problems.push(...validateSharedLayer(entry, `'add.shared[${index}]'`));
      });
    }
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

function validateSharedLayer(value: unknown, label: string): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [`${label} must be an object with a 'source'`];
  }
  const problems: string[] = [];
  const layer = value as Record<string, unknown>;

  for (const key of ['source', 'destination'] as const) {
    const path = layer[key];
    if (path === undefined) {
      if (key === 'source') {
        problems.push(`${label}.source is required`);
      }
      continue;
    }
    if (typeof path !== 'string' || path === '') {
      problems.push(`${label}.${key} must be a non-empty string`);
    } else if (!isContainedRelativePath(path)) {
      problems.push(
        `${label}.${key} must be a relative path that stays inside its directory`
      );
    }
  }

  if (
    layer.specifier !== undefined &&
    (typeof layer.specifier !== 'string' || layer.specifier === '')
  ) {
    problems.push(`${label}.specifier must be a non-empty string`);
  }

  if (
    layer.exclude !== undefined &&
    (!Array.isArray(layer.exclude) ||
      !layer.exclude.every(
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

/** Whether a path is relative and never climbs above its starting directory. */
function isContainedRelativePath(path: string): boolean {
  if (path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)) {
    return false;
  }
  return !path.split(/[\\/]/).includes('..');
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
      "'stylingLayer' must be a non-empty layer name, or an object with 'name' and optional 'order'",
    ];
  }
  const problems: string[] = [];
  const layer = value as Record<string, unknown>;
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
  return problems;
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
 * Loads and validates the kit configuration in a directory.
 *
 * @param kitDirectory - The kit root directory.
 * @returns The validated configuration.
 */
export function loadConfiguration(kitDirectory: string): KitConfiguration {
  const configurationPath = join(kitDirectory, configurationFileName);
  if (!existsSync(configurationPath)) {
    throw new Error(
      `No ${configurationFileName} found in '${kitDirectory}'. Run this command in a kit created by scaffold-ui-kit.`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configurationPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `${configurationFileName} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const problems = validateConfiguration(parsed);
  if (problems.length > 0) {
    throw new Error(
      `${configurationFileName} is invalid:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`
    );
  }
  return parsed as KitConfiguration;
}
