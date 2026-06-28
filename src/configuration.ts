import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { OutputStrategy } from '@js-template-engine/types';

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

export type TargetName = (typeof targetNames)[number];
export type StylingName = (typeof stylingNames)[number];
export type TailwindOutput = (typeof tailwindOutputs)[number];
export type BemMode = (typeof bemModes)[number];

const outputStrategies = ['inline', 'in-file', 'separate-file'];

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
