// Load and validate the kit configuration's `preview` block. The build leaves
// the block alone - this package owns it: the kit configuration is found and
// read by scaffold-ui-kit's own resolver (`scaffold-ui-kit.ts` or
// `scaffold-ui-kit.json`), and the block is validated by hand (the errors
// name the offending key) and resolved into absolute paths. Kit-authored TS
// modules (templates, story files, manual specs, views) are imported through
// jiti, so the built CLI compiles them on the fly as the build compiles
// templates.

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, resolve } from 'node:path';
import { createJiti } from 'jiti';
import type { BemOptions } from '@js-template-engine/extension-bem';
import type { TailwindOptions } from '@js-template-engine/extension-tailwind';
import type { StylesheetPlacement } from '@js-template-engine/types';
import type {
  ConfigurationLookupOptions,
  ResolvedKitConfiguration,
} from 'scaffold-ui-kit';
import {
  ALL_TARGETS,
  PREVIEW_BROWSER_KEYS,
  type ModuleImporter,
  type PreviewBrowserConfiguration,
  type PreviewConfiguration,
  type HandWrittenMapping,
  type PreviewPaneWidth,
  type PreviewShellSetting,
  type PreviewSourceConfiguration,
  type Target,
} from './lib/types.js';
import { isPaneWidth, MAXIMUM_PANE_WIDTH } from './controller/persistence.js';

export interface ResolvedSource extends PreviewSourceConfiguration {
  /** Absolute (resolved against the kit root). */
  templatesDirectoryAbsolute?: string;
  manualModuleAbsolute?: string;
  storiesDirectoryAbsolute?: string;
}

/**
 * A package of a kit built into one package per target (the kit
 * configuration's `packages`), other than the kit root's own.
 */
export interface KitLayoutPackage {
  /** The target the package is built for, or `styles` for the package of
   *  the kit's stylesheets. */
  role: Target | 'styles';
  /** The package name. */
  name: string;
  /** The package's directory, absolute. */
  directoryAbsolute: string;
}

export interface PreviewContext {
  /** The kit's root (where its package.json lives). */
  kitRoot: string;
  /**
   * The kit's other packages, when its configuration builds it into one
   * package per target (`packages`): the styles package first,
   * then each target's. Absent for a kit built as one package.
   */
  kitPackages?: KitLayoutPackage[];
  /** The kit configuration file, absolute. */
  configurationPath: string;
  /** The kit's own modules a `.ts` configuration loaded beside its file. */
  configurationModules: string[];
  /** What reading the kit configuration warns of, such as its old file
   *  name. */
  warnings: string[];
  /** The kit's name (the kit configuration's `name`). */
  kitName: string;
  /** The kit's version (its package.json `version`), when it has one. */
  kitVersion?: string;
  /**
   * The scripted targets the kit builds (the kit configuration's `targets`, its
   * `html` target left out), in the preview's order; all three when the kit
   * names none. A component renders only in these, whatever its own targets.
   */
  targets: Target[];
  /** Whether the kit builds html (`html` among the kit configuration's
   *  `targets`), so the preview shows an html pane beside the other targets'. */
  buildsHtml?: boolean;
  /** The mode the kit builds its Svelte target in (the kit configuration's
   *  `svelte.mode`), `legacy` when it names none. */
  svelteMode: 'legacy' | 'runes';
  /** The generated tree (`<kitRoot>/.preview-generated`). */
  generatedRoot: string;
  /** The static-build output (`<kitRoot>/.preview-static`). */
  staticRoot: string;
  /** The preview block, with `options` and `themes` defaulted to none and
   *  `controlHints.colorTokens`' unset choice as `null`. */
  configuration: PreviewConfiguration &
    Pick<PreviewBrowserConfiguration, 'options' | 'themes' | 'canvas'>;
  sources: ResolvedSource[];
  /** Absolute path of the kit's custom-views module, when registered. */
  viewsModuleAbsolute?: string;
  /** Absolute path of the kit's code-block module, when it names one. */
  codeBlockModuleAbsolute?: string;
  /** Absolute path of the shell module `preview.shell` names. */
  shellModuleAbsolute: string;
  /** Absolute path of the shell's page module, when it has one: the module
   *  `preview.shell.page` names, or the one its package ships. */
  shellPageAbsolute?: string;
  /**
   * Absolute path of the shell shipped with the preview, when the kit's
   * shell is it: named as it is, or through a module of the kit's that
   * imports it to configure it (`charcellShell({ ... })`). Absent under a
   * shell of the kit's own.
   */
  charcellShellAbsolute?: string;
  /** The kit's `omitPattern`, compiled. */
  omitPattern?: RegExp;
  importModule: ModuleImporter;
  /** The kit's styling settings, which the html source renders with. */
  styling: KitStyling;
  /**
   * The kit's shared modules templates import by specifier (`add.shared`
   * code modules the kit's `package.json` exports), resolved against the
   * kit root. The html
   * source puts their exports in scope, so an expression calling a kit helper
   * evaluates.
   */
  sharedModulesAbsolute: string[];
  /**
   * The framework-free entries of `@scaffold-ui-kit/helpers` (`/runtime`
   * and `/zag`) as installed for the kit, resolved from the kit root or one
   * of its packages. The html source puts their exports in scope beside the
   * shared modules', so an expression calling a helper evaluates. Empty when
   * the kit does not have the package.
   */
  helperModulesAbsolute: string[];
  /**
   * The kit's shared modules with the package path its built files import
   * each by (the one the kit's `package.json` exports give it, or an older
   * configuration's `specifier`), the source relative to the kit root as
   * written.
   */
  sharedSpecifiers: { source: string; specifier: string }[];
  /**
   * The kit's Sass load paths (the kit configuration's top-level
   * `loadPaths`), resolved against the kit root, which the kit's build
   * compiles its SCSS with.
   */
  sassLoadPathsAbsolute: string[];
  /**
   * The parts of each compound whose root has no template, such as a
   * hand-written component (the kit configuration's `parts`), by root name.
   */
  parts: Record<string, string[]>;
}

/** The styling keys of the kit configuration the html source reads. */
export interface KitStyling {
  /** The styling extensions, in configuration order. */
  extensions: Array<'bem' | 'tailwind'>;
  /** Where each component's stylesheet is placed (the kit configuration's
   *  `stylesheetPlacement`), `in-file` when it names none. */
  placement: StylesheetPlacement;
  /** The BEM extension's options (the kit configuration's `bem` block). */
  bem?: BemOptions;
  /** The Tailwind extension's options (the kit configuration's `tailwind`
   *  block). */
  tailwind?: TailwindOptions;
}

function fail(message: string): never {
  throw new Error(`[preview] ${message}`);
}

/** The keys the `preview` block takes. */
const PREVIEW_KEYS = [
  'shell',
  'sources',
  'options',
  'canvas',
  'themes',
  'mount',
  'viewCanvas',
  'paneWidths',
  'controlHints',
  'labels',
  'viewsModule',
  'codeBlock',
  'setupModules',
  'htmlStylesheets',
  'aliases',
  'scssLoadPaths',
  'optimizeDepsExclude',
  'dedupe',
  'omitPattern',
  'handWrittenComponents',
  'port',
  'host',
  'persistence',
  'landing',
] as const satisfies readonly (keyof PreviewConfiguration)[];

/** The keys a `preview.sources` entry takes. */
const SOURCE_KEYS = [
  'id',
  'label',
  'order',
  'moduleBase',
  'templatesDirectory',
  'manualModule',
  'storiesDirectory',
] as const satisfies readonly (keyof PreviewSourceConfiguration)[];

/** The keys `preview.codeBlock` takes. */
const CODE_BLOCK_KEYS = [
  'module',
  'framework',
] as const satisfies readonly (keyof NonNullable<
  PreviewConfiguration['codeBlock']
>)[];

/** The keys `preview.landing` takes. */
const LANDING_KEYS = ['view', 'component', 'scenario'] as const;

/** The keys the object form of a `handWrittenComponents` entry takes. */
const HAND_WRITTEN_KEYS = [
  'template',
  'slots',
] as const satisfies readonly (keyof Exclude<HandWrittenMapping, string>)[];

/** What to write for a key the `preview` block does not take, where one thing is meant. */
const PREVIEW_KEY_REPLACEMENTS: ReadonlyMap<string, string> = new Map([
  ['scopes', "'sources'"],
  [
    'configurationModule',
    "the keys of the 'preview' block, such as options, canvas, themes and mount",
  ],
]);

/** What to write for a key a `preview.sources` entry does not take, where one thing is meant. */
const SOURCE_KEY_REPLACEMENTS: ReadonlyMap<string, string> = new Map([
  ['sidecarsDirectory', "'storiesDirectory'"],
]);

/** Whether a value is a plain object, whose keys can be checked. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Each key of an object that is not among the keys it takes, with its path
 * and the keys the object takes, as the scaffolder reports the
 * configuration's own keys, or what to use instead where `replacements`
 * names it.
 */
function unknownKeyProblems(
  value: object,
  allowed: readonly string[],
  path: string,
  description: string,
  replacements: ReadonlyMap<string, string> = new Map()
): string[] {
  return Object.keys(value)
    .filter((key) => !allowed.includes(key))
    .map((key) => {
      const replacement = replacements.get(key);
      return `unknown key '${path}.${key}'; ${
        replacement === undefined
          ? `${description} takes ${allowed.join(', ')}`
          : `use ${replacement}`
      }`;
    });
}

/**
 * What is wrong with a list of pane widths, or nothing: it must be a list of
 * `{ label, width }`, each label a non-empty string and each width a whole
 * number of CSS pixels from 1 to the most a pane is laid out at, no label
 * and no width named twice.
 *
 * @param paneWidths - The list, as the kit gives it.
 * @param name - Where the kit gives it, for the message.
 * @returns The problem, or `undefined` when the list is sound.
 * @example
 * ```ts
 * paneWidthsProblem([{ label: 'small', width: 375 }], 'paneWidths'); // undefined
 * ```
 */
export function paneWidthsProblem(
  paneWidths: unknown,
  name: string
): string | undefined {
  if (
    !Array.isArray(paneWidths) ||
    paneWidths.some(
      (paneWidth: unknown) =>
        !isPlainObject(paneWidth) ||
        typeof paneWidth.label !== 'string' ||
        paneWidth.label.trim() === '' ||
        !isPaneWidth(paneWidth.width)
    )
  )
    return `${name} must be a list of { label, width }: a label to pick it by, and a width in CSS pixels, a whole number from 1 to ${MAXIMUM_PANE_WIDTH}`;
  const widths = paneWidths as PreviewPaneWidth[];
  if (
    new Set(widths.map((paneWidth) => paneWidth.label)).size !== widths.length
  )
    return `${name} must not name a label twice`;
  if (
    new Set(widths.map((paneWidth) => paneWidth.width)).size !== widths.length
  )
    return `${name} must not name a width twice`;
  return undefined;
}

/** What is wrong with the shape of `preview.landing`, or nothing. */
function landingShapeProblem(landing: unknown): string | undefined {
  const shape =
    "preview.landing must be { view } or { component, scenario? }: a view's id, or a story's id and, if it is not to open on its baseline, a scenario's, as the preview's address names them";
  if (!isPlainObject(landing)) return shape;
  const candidate: Record<string, unknown> = landing;
  const named = (key: (typeof LANDING_KEYS)[number]) =>
    typeof candidate[key] === 'string' && candidate[key] !== '';
  if ('view' in candidate) {
    if (!named('view') || 'component' in candidate || 'scenario' in candidate)
      return shape;
    return undefined;
  }
  if (!named('component')) return shape;
  if ('scenario' in candidate && !named('scenario')) return shape;
  return undefined;
}

function validateSource(
  source: unknown,
  index: number
): PreviewSourceConfiguration {
  const candidate = source as Partial<PreviewSourceConfiguration>;
  if (!candidate || typeof candidate !== 'object')
    fail(`preview.sources[${index}] must be an object`);
  for (const key of ['id', 'label', 'moduleBase'] as const) {
    if (typeof candidate[key] !== 'string' || !candidate[key]) {
      fail(`preview.sources[${index}].${key} must be a non-empty string`);
    }
  }
  if (typeof candidate.order !== 'number')
    fail(`preview.sources[${index}].order must be a number`);
  return candidate as PreviewSourceConfiguration;
}

/**
 * What is wrong with a `preview.shell` that is set, or `undefined` when it
 * is a specifier or a `{ module, page }` of specifiers.
 */
function shellSettingProblem(setting: unknown): string | undefined {
  if (typeof setting === 'string') return undefined;
  const shape =
    "preview.shell must be a package specifier or a module path, or an object with 'module' and optional 'page'";
  if (typeof setting !== 'object' || setting === null || Array.isArray(setting))
    return shape;
  const { module, page, ...rest } = setting as Record<string, unknown>;
  const unknown = Object.keys(rest);
  if (unknown.length > 0)
    return `unknown key 'preview.shell.${unknown[0]}'; preview.shell takes module and page`;
  if (typeof module !== 'string' || !module)
    return "preview.shell.module is required: the shell's module, as a package specifier or a module path relative to the kit root";
  if (page !== undefined && (typeof page !== 'string' || !page))
    return "preview.shell.page must be a package specifier or a module path relative to the kit root: the shell's page module";
  return undefined;
}

/** The shell shipped with the preview, named when a kit configures none. */
export const CHARCELL_SHELL = '@scaffold-ui-kit/preview/shells/charcell';

/**
 * Where `preview.shell` points: a module in the kit when it is
 * written as a path (relative, absolute, or one that exists under the kit
 * root, like the other module settings), else a package resolved from the
 * kit's root the way the kit's own imports are.
 */
function resolveShellModule(kitRoot: string, shell: string): string {
  if (isModulePath(kitRoot, shell)) {
    const inKit = resolve(kitRoot, shell);
    if (!existsSync(inKit)) {
      fail(`preview.shell names a module that does not exist: ${inKit}`);
    }
    return inKit;
  }
  try {
    return createRequire(resolve(kitRoot, 'package.json')).resolve(shell);
  } catch {
    return fail(
      `preview.shell '${shell}' is neither a module in the kit nor a package installed in it (resolved from ${kitRoot}). ` +
        `Install the package the shell comes from, or give a path relative to the kit root. ` +
        `The shell shipped with the preview is '${CHARCELL_SHELL}'; it needs charcell and @zag-js/react installed.`
    );
  }
}

/** Whether a module setting is written as a path: relative, absolute, or
 *  one that exists under the kit root. Anything else is a package specifier. */
function isModulePath(kitRoot: string, setting: string): boolean {
  return (
    setting.startsWith('.') ||
    isAbsolute(setting) ||
    existsSync(resolve(kitRoot, setting))
  );
}

/**
 * Whether the package a specifier names lists `<specifier>/<subpath>` among
 * its exports, read from its `package.json`; `false` when the package or its
 * exports cannot be read.
 */
function packageExports(
  fromKit: NodeJS.Require,
  specifier: string,
  subpath: string
): boolean {
  const [scopeOrName, name] = specifier.split('/');
  const packageName = specifier.startsWith('@')
    ? `${scopeOrName}/${name}`
    : scopeOrName!;
  try {
    const manifest = fromKit(`${packageName}/package.json`) as {
      exports?: unknown;
    };
    const key = `.${specifier.slice(packageName.length)}/${subpath}`;
    return (
      typeof manifest.exports === 'object' &&
      manifest.exports !== null &&
      key in manifest.exports
    );
  } catch {
    return false;
  }
}

/**
 * Where the shell's page module is: the one `preview.shell.page` names, a
 * path in the kit or a package resolved from the kit's root, as the shell
 * itself is; or, with none named, the module at the shell's specifier
 * followed by `/page`, when the shell is named as a package specifier and
 * its package has one. A shell with no page has none, and the host page
 * starts empty.
 *
 * @param kitRoot - The kit's root directory.
 * @param shell - The shell module, as `preview.shell` names it.
 * @param page - The page module, as `preview.shell.page` names it.
 * @returns The page module's absolute path, or `undefined` with no page.
 */
function resolveShellPage(
  kitRoot: string,
  shell: string,
  page: string | undefined
): string | undefined {
  const fromKit = createRequire(resolve(kitRoot, 'package.json'));
  if (page === undefined) {
    if (isModulePath(kitRoot, shell)) return undefined;
    try {
      return fromKit.resolve(`${shell}/page`);
    } catch (error) {
      // A package that exports no page has none; one whose export cannot
      // be loaded is a mistake worth naming.
      const code = (error as NodeJS.ErrnoException).code;
      if (
        code === 'ERR_PACKAGE_PATH_NOT_EXPORTED' ||
        (code === 'MODULE_NOT_FOUND' && !packageExports(fromKit, shell, 'page'))
      ) {
        return undefined;
      }
      return fail(
        `the shell '${shell}' exports a page at '${shell}/page' that does not resolve: ${(error as Error).message}`
      );
    }
  }
  if (isModulePath(kitRoot, page)) {
    const inKit = resolve(kitRoot, page);
    if (!existsSync(inKit)) {
      fail(`preview.shell.page names a module that does not exist: ${inKit}`);
    }
    return inKit;
  }
  try {
    return fromKit.resolve(page);
  } catch {
    return fail(
      `preview.shell.page '${page}' is neither a module in the kit nor a package installed in it (resolved from ${kitRoot}). ` +
        `Give a path relative to the kit root, or the page module of an installed shell, such as '${CHARCELL_SHELL}/page'.`
    );
  }
}

/** Whether a module's source imports the shell shipped with the preview. */
const IMPORTS_CHARCELL_SHELL = new RegExp(
  `(?:from\\s*|import\\s*\\(\\s*|require\\s*\\(\\s*)['"]${CHARCELL_SHELL.replace(/\./g, '\\.')}['"]`
);

/**
 * Where the shell shipped with the preview is, when the kit's shell is it:
 * the shell module itself when `preview.shell` names it, or the module it
 * resolves to from a module of the kit's that imports it to configure it.
 * `undefined` under a shell of the kit's own, or when the kit's module
 * imports it from a package the kit has not installed.
 */
function resolveCharcellShell(
  shell: string,
  shellModuleAbsolute: string
): string | undefined {
  if (shell === CHARCELL_SHELL) return shellModuleAbsolute;
  let source: string;
  try {
    source = readFileSync(shellModuleAbsolute, 'utf8');
  } catch {
    return undefined;
  }
  if (!IMPORTS_CHARCELL_SHELL.test(source)) return undefined;
  try {
    return createRequire(shellModuleAbsolute).resolve(CHARCELL_SHELL);
  } catch {
    return undefined;
  }
}

function readPackageVersion(kitRoot: string): string | undefined {
  const packagePath = resolve(kitRoot, 'package.json');
  if (!existsSync(packagePath)) return undefined;
  // A package.json that is not JSON has no version to read; `check` reports it.
  let manifest: { version?: unknown } | null;
  try {
    manifest = JSON.parse(readFileSync(packagePath, 'utf8')) as {
      version?: unknown;
    } | null;
  } catch {
    return undefined;
  }
  const version = manifest?.version;
  return typeof version === 'string' ? version : undefined;
}

/** The kit configuration's keys the preview reads beside its block. */
type KitConfigurationRead = Pick<KitStyling, 'bem' | 'tailwind'> & {
  name?: string;
  stylesheetPlacement?: StylesheetPlacement;
  targets?: unknown;
  styling?: Array<'bem' | 'tailwind'>;
  preview?: unknown;
  add?: { shared?: Array<{ source?: unknown; specifier?: unknown }> };
  packages?: unknown;
  loadPaths?: unknown;
  svelte?: { mode?: unknown };
  parts?: unknown;
};

/**
 * The kit configuration's `parts`, each root's list of part names; what is
 * not a list of names is left out, as the kit's build reports it.
 */
function partsOf(value: unknown): Record<string, string[]> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return {};
  const parts: Record<string, string[]> = {};
  for (const [root, rootParts] of Object.entries(value)) {
    if (Array.isArray(rootParts))
      parts[root] = rootParts.filter(
        (part): part is string => typeof part === 'string' && part !== ''
      );
  }
  return parts;
}

/** scaffold-ui-kit, loaded as the CommonJS package it is. */
function scaffoldUiKit(): typeof import('scaffold-ui-kit') {
  return createRequire(import.meta.url)(
    'scaffold-ui-kit'
  ) as typeof import('scaffold-ui-kit');
}

/** The resolver and module loader of scaffold-ui-kit the preview reads a
 *  kit's configuration with. */
type KitResolver = Pick<
  typeof import('scaffold-ui-kit'),
  'resolveKitConfiguration'
>;

/**
 * The scaffold-ui-kit the kit has installed, when it has the resolver, so
 * the preview reads the configuration as the kit's own build does; else the
 * preview's own copy.
 */
function kitResolver(kitRoot: string): KitResolver {
  const own = scaffoldUiKit();
  let installed: Partial<KitResolver> | undefined;
  try {
    installed = createRequire(resolve(kitRoot, 'package.json'))(
      'scaffold-ui-kit'
    ) as Partial<KitResolver>;
  } catch {
    return own;
  }
  return typeof installed.resolveKitConfiguration === 'function'
    ? (installed as KitResolver)
    : own;
}

/**
 * The problems that keep a value from reaching the browser as JSON, each
 * naming where in the value it sits: a function, `undefined` in a list, a
 * number JSON has no form for, and an object other than a plain one or a
 * list (a regular expression, a date, a map).
 *
 * @param value - The value.
 * @param path - Where the value sits, as `preview.options`.
 * @returns One message per problem.
 * @example
 * ```ts
 * jsonProblems({ apply: () => {} }, 'preview.options[0]');
 * // ["preview.options[0].apply is a function, which can't be sent to the browser as JSON"]
 * ```
 */
export function jsonProblems(
  value: unknown,
  path: string,
  ancestors: WeakMap<object, string> = new WeakMap()
): string[] {
  const unsendable = (what: string) => [
    `${path} is ${what}, which can't be sent to the browser as JSON`,
  ];
  if (value === null) return [];
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return [];
    case 'number':
      return Number.isFinite(value) ? [] : unsendable(String(value));
    case 'undefined':
      return unsendable('undefined');
    case 'function':
      return unsendable('a function');
    case 'bigint':
    case 'symbol':
      return unsendable(`a ${typeof value}`);
  }
  const object = value as object;
  // An object inside itself has no end to write out.
  const outer = ancestors.get(object);
  if (outer !== undefined)
    return [
      `${path} is ${outer} again, a cycle that can't be sent to the browser as JSON`,
    ];
  const prototype = Object.getPrototypeOf(object);
  if (
    !Array.isArray(object) &&
    prototype !== Object.prototype &&
    prototype !== null
  )
    return unsendable(`${object.constructor?.name ?? 'an object'} object`);
  ancestors.set(object, path);
  const problems = Array.isArray(object)
    ? object.flatMap((entry, index) =>
        jsonProblems(entry, `${path}[${index}]`, ancestors)
      )
    : Object.entries(object as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .flatMap(([key, entry]) =>
          jsonProblems(entry, `${path}.${key}`, ancestors)
        );
  // Only an ancestor makes a cycle; the same object twice side by side is fine.
  ancestors.delete(object);
  return problems;
}

/**
 * Finds the kit configuration (`--configuration`, the kit's `package.json`
 * pointer, or `scaffold-ui-kit.ts` or `scaffold-ui-kit.json` at the kit
 * root) and resolves the preview context from its `preview` block.
 *
 * @param kitRoot - The kit root.
 * @param options - The configuration file a command was given, if any.
 * @returns The context.
 */
export function loadPreviewContext(
  kitRoot: string,
  options: ConfigurationLookupOptions = {}
): PreviewContext {
  const resolver = kitResolver(kitRoot);
  let resolved: ResolvedKitConfiguration;
  try {
    resolved = resolver.resolveKitConfiguration(kitRoot, options);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  const configurationPath = resolved.file.path;
  const configurationName = resolved.file.name;
  const warnings = [...resolved.warnings];
  const configurationModules = new Set(resolved.modules ?? []);
  const kitConfiguration = resolved.configuration as KitConfigurationRead;

  const authoredBlock: unknown = kitConfiguration.preview;
  if (!isPlainObject(authoredBlock)) {
    fail(
      `${configurationName} has no preview block${
        'extensions' in (kitConfiguration as object)
          ? "; the preview's settings go in a top-level 'preview' block, not 'extensions'"
          : ''
      }`
    );
  }
  const authored = authoredBlock as unknown as PreviewConfiguration;
  // A misspelled key would otherwise go unread without a word: every unknown
  // key fails, the block's and each object's inside it, all named at once.
  const unknownKeys = [
    ...unknownKeyProblems(
      authored,
      PREVIEW_KEYS,
      'preview',
      "the 'preview' block",
      PREVIEW_KEY_REPLACEMENTS
    ),
    ...(Array.isArray(authored.sources) ? authored.sources : []).flatMap(
      (source: unknown, index) =>
        source && typeof source === 'object' && !Array.isArray(source)
          ? unknownKeyProblems(
              source,
              SOURCE_KEYS,
              `preview.sources[${index}]`,
              'a source',
              SOURCE_KEY_REPLACEMENTS
            )
          : []
    ),
    ...(isPlainObject(authored.codeBlock)
      ? unknownKeyProblems(
          authored.codeBlock,
          CODE_BLOCK_KEYS,
          'preview.codeBlock',
          'a code block'
        )
      : []),
    ...(isPlainObject(authored.setupModules)
      ? unknownKeyProblems(
          authored.setupModules,
          ALL_TARGETS,
          'preview.setupModules',
          "the 'setupModules' map"
        )
      : []),
    ...(isPlainObject(authored.landing)
      ? unknownKeyProblems(
          authored.landing,
          LANDING_KEYS,
          'preview.landing',
          'the landing entry'
        )
      : []),
    ...(isPlainObject(authored.handWrittenComponents)
      ? Object.entries(authored.handWrittenComponents).flatMap(
          ([name, mapping]: [string, unknown]) =>
            isPlainObject(mapping)
              ? unknownKeyProblems(
                  mapping,
                  HAND_WRITTEN_KEYS,
                  `preview.handWrittenComponents.${name}`,
                  'a hand-written component'
                )
              : []
        )
      : []),
  ];
  if (unknownKeys.length > 0) fail(unknownKeys.join('\n[preview] '));
  if (!Array.isArray(authored.sources) || authored.sources.length === 0) {
    fail('preview.sources must be a non-empty array');
  }
  authored.sources.forEach(validateSource);
  const shellSetting = authored.shell as unknown;
  if (shellSetting === undefined || shellSetting === '') {
    fail(
      `preview.shell is required: the shell that renders the preview's interface, as a package specifier or a module path relative to the kit root. ` +
        `To use the shell shipped with the preview, install charcell and @zag-js/react and set shell: '${CHARCELL_SHELL}'.`
    );
  }
  const shellProblem = shellSettingProblem(shellSetting);
  if (shellProblem !== undefined) fail(shellProblem);
  const shell =
    typeof shellSetting === 'string'
      ? shellSetting
      : (shellSetting as PreviewShellSetting).module;
  const shellPage =
    typeof shellSetting === 'string'
      ? undefined
      : (shellSetting as PreviewShellSetting).page;
  const canvas = authored.canvas as unknown;
  if (
    canvas !== undefined &&
    (!isPlainObject(canvas) ||
      typeof canvas.namePrefix !== 'string' ||
      canvas.namePrefix === '')
  ) {
    fail(
      "preview.canvas must be { namePrefix, pageBackground?, extraCss? }: namePrefix the prefix for the names the preview sets in each frame, such as 'my-ui-kit'"
    );
  }
  for (const key of ['options', 'themes'] as const) {
    if (authored[key] !== undefined && !Array.isArray(authored[key]))
      fail(`preview.${key} must be a list`);
  }
  for (const key of [
    'mount',
    'viewCanvas',
    'controlHints',
    'labels',
  ] as const) {
    if (authored[key] !== undefined && !isPlainObject(authored[key]))
      fail(`preview.${key} must be an object`);
  }
  // What the preview's pages read reaches them as JSON, so it must be JSON.
  const unsendable = PREVIEW_BROWSER_KEYS.filter(
    (key) => authored[key] !== undefined
  ).flatMap((key) => jsonProblems(authored[key], `preview.${key}`));
  if (unsendable.length > 0) fail(unsendable.join('\n[preview] '));
  const colorTokens = authored.controlHints?.colorTokens;
  if (colorTokens !== undefined && !Array.isArray(colorTokens))
    fail('preview.controlHints.colorTokens must be a list of tokens');
  const configuration: PreviewContext['configuration'] = {
    ...authored,
    options: authored.options ?? [],
    themes: authored.themes ?? [],
    // The kit's name, made safe for the names it prefixes, by default.
    canvas: authored.canvas ?? {
      namePrefix: (kitConfiguration.name ?? 'kit')
        .replace(/[^A-Za-z0-9_-]/g, '-')
        .replace(/^-+|-+$/g, ''),
    },
    shell,
    ...(authored.controlHints
      ? {
          controlHints: {
            ...authored.controlHints,
            ...(colorTokens
              ? { colorTokens: colorTokens.map((token) => token ?? null) }
              : {}),
          },
        }
      : {}),
  };
  let omitPattern: RegExp | undefined;
  if (configuration.omitPattern !== undefined) {
    try {
      omitPattern = new RegExp(configuration.omitPattern);
    } catch {
      fail(
        `preview.omitPattern must be a regular expression: ${String(configuration.omitPattern)}`
      );
    }
  }

  const handWritten = configuration.handWrittenComponents;
  if (
    handWritten !== undefined &&
    (typeof handWritten !== 'object' ||
      handWritten === null ||
      Array.isArray(handWritten) ||
      Object.values(handWritten).some(
        (value) =>
          typeof value !== 'string' &&
          (typeof value !== 'object' ||
            value === null ||
            typeof value.template !== 'string' ||
            (value.slots !== undefined &&
              (typeof value.slots !== 'object' ||
                Object.values(value.slots).some(
                  (slot) => typeof slot !== 'string'
                ))))
      ))
  ) {
    fail(
      "preview.handWrittenComponents must map each component name to 'content', a template name, or { template, slots }"
    );
  }

  const dedupe = configuration.dedupe;
  if (
    dedupe !== undefined &&
    (!Array.isArray(dedupe) ||
      dedupe.some((name) => typeof name !== 'string' || name === ''))
  ) {
    fail('preview.dedupe must be a list of package names');
  }

  const htmlStylesheets = configuration.htmlStylesheets;
  if (
    htmlStylesheets !== undefined &&
    (!Array.isArray(htmlStylesheets) ||
      htmlStylesheets.some((path) => typeof path !== 'string' || path === ''))
  ) {
    fail(
      'preview.htmlStylesheets must be a list of stylesheet paths, relative to the kit root'
    );
  }

  const codeBlock = configuration.codeBlock;
  if (
    codeBlock !== undefined &&
    (typeof codeBlock !== 'object' ||
      codeBlock === null ||
      typeof codeBlock.module !== 'string' ||
      codeBlock.module === '' ||
      (codeBlock.framework !== undefined &&
        !['react', 'vue', 'svelte', 'dom'].includes(codeBlock.framework)))
  ) {
    fail(
      "preview.codeBlock must be { module, framework? }: a module path relative to the kit root, and 'react', 'vue', 'svelte' or 'dom'"
    );
  }

  const persistence = configuration.persistence;
  if (
    persistence !== undefined &&
    persistence !== 'url' &&
    persistence !== 'url-and-local-storage'
  ) {
    fail(
      `preview.persistence must be 'url' or 'url-and-local-storage', not ${JSON.stringify(persistence)}`
    );
  }

  if (configuration.landing !== undefined) {
    const problem = landingShapeProblem(configuration.landing);
    if (problem) fail(problem);
  }

  const sources: ResolvedSource[] = [...configuration.sources]
    .sort((a, b) => a.order - b.order)
    .map((source) => {
      const templatesDirectoryAbsolute = source.templatesDirectory
        ? resolve(kitRoot, source.templatesDirectory)
        : undefined;
      const storiesDirectoryAbsolute = source.storiesDirectory
        ? resolve(kitRoot, source.storiesDirectory)
        : undefined;
      return {
        ...source,
        templatesDirectoryAbsolute,
        manualModuleAbsolute: source.manualModule
          ? resolve(kitRoot, source.manualModule)
          : undefined,
        storiesDirectoryAbsolute,
      };
    });

  const kitTargets = kitConfiguration.targets;
  if (
    kitTargets !== undefined &&
    (!Array.isArray(kitTargets) ||
      kitTargets.some((target) => typeof target !== 'string'))
  ) {
    fail(`${configurationName} targets must be a list of target names`);
  }
  const targets = kitTargets
    ? ALL_TARGETS.filter((target) => (kitTargets as string[]).includes(target))
    : [...ALL_TARGETS];

  const jiti = createJiti(import.meta.url);
  const importModule: ModuleImporter = (absolutePath) =>
    jiti.import(absolutePath);
  const shellModuleAbsolute = resolveShellModule(kitRoot, shell);
  const shellPageAbsolute = resolveShellPage(kitRoot, shell, shellPage);
  const charcellShellAbsolute = resolveCharcellShell(
    shell,
    shellModuleAbsolute
  );
  if (charcellShellAbsolute !== undefined && shellPageAbsolute === undefined) {
    warnings.push(
      `preview.shell names a module that configures the charcell shell and no page, so the host page starts empty and light until the shell loads; ` +
        `name the shell's page beside it: shell: { module: '${shell}', page: '${CHARCELL_SHELL}/page' }`
    );
  }
  const kitPackages = kitPackagesOf(kitRoot, kitConfiguration.packages);
  const sharedSpecifiers = sharedSpecifiersOf(
    kitRoot,
    kitConfiguration.add?.shared,
    (kitPackages ?? []).map(({ directoryAbsolute }) => directoryAbsolute)
  );

  return {
    kitRoot,
    ...(kitPackages === undefined ? {} : { kitPackages }),
    configurationPath,
    configurationModules: [...configurationModules].filter(
      (module) => module !== configurationPath
    ),
    warnings,
    kitName: kitConfiguration.name ?? 'kit',
    kitVersion: readPackageVersion(kitRoot),
    targets,
    buildsHtml: (kitTargets as string[] | undefined)?.includes('html') ?? false,
    svelteMode: kitConfiguration.svelte?.mode === 'runes' ? 'runes' : 'legacy',
    generatedRoot: resolve(kitRoot, '.preview-generated'),
    staticRoot: resolve(kitRoot, '.preview-static'),
    configuration,
    sources,
    viewsModuleAbsolute: configuration.viewsModule
      ? resolve(kitRoot, configuration.viewsModule)
      : undefined,
    codeBlockModuleAbsolute: configuration.codeBlock
      ? resolve(kitRoot, configuration.codeBlock.module)
      : undefined,
    shellModuleAbsolute: shellModuleAbsolute,
    ...(shellPageAbsolute === undefined ? {} : { shellPageAbsolute }),
    ...(charcellShellAbsolute === undefined ? {} : { charcellShellAbsolute }),
    omitPattern,
    importModule,
    styling: {
      extensions: kitConfiguration.styling ?? [],
      placement: kitConfiguration.stylesheetPlacement ?? 'in-file',
      ...(kitConfiguration.bem === undefined
        ? {}
        : { bem: kitConfiguration.bem }),
      ...(kitConfiguration.tailwind === undefined
        ? {}
        : { tailwind: kitConfiguration.tailwind }),
    },
    parts: partsOf(kitConfiguration.parts),
    sassLoadPathsAbsolute: (Array.isArray(kitConfiguration.loadPaths)
      ? kitConfiguration.loadPaths
      : []
    )
      .filter((path): path is string => typeof path === 'string')
      .map((path) => resolve(kitRoot, path)),
    sharedModulesAbsolute: sharedSpecifiers
      .filter(({ source }) => /(^|\/)[^./]*$|\.[cm]?[jt]sx?$/.test(source))
      .map(({ source }) => resolve(kitRoot, source)),
    sharedSpecifiers,
    helperModulesAbsolute: helperModulesOf([
      kitRoot,
      ...(kitPackages ?? []).map(({ directoryAbsolute }) => directoryAbsolute),
    ]),
  };
}

/** The package whose framework-free entries a story's html has in scope. */
const HELPERS_PACKAGE = '@scaffold-ui-kit/helpers';

/** The entries of `@scaffold-ui-kit/helpers` that import no framework. */
const FRAMEWORK_FREE_HELPER_ENTRIES = ['./runtime', './zag'];

/**
 * Each framework-free helper entry as the first of the directories that has
 * the package installed gives it: the package found in `node_modules` from
 * that directory up, and the entry's file from its `exports` (`import`, else
 * `default`). Nothing else is searched, so a kit without the package gets
 * none. An entry the package does not export is left out.
 */
function helperModulesOf(directories: readonly string[]): string[] {
  for (const directory of directories) {
    const packageDirectory = installedPackageDirectory(
      directory,
      HELPERS_PACKAGE
    );
    if (packageDirectory === undefined) continue;
    let exportsField: unknown;
    try {
      exportsField = (
        JSON.parse(
          readFileSync(resolve(packageDirectory, 'package.json'), 'utf8')
        ) as { exports?: unknown }
      ).exports;
    } catch {
      continue;
    }
    if (!isPlainObject(exportsField)) continue;
    return FRAMEWORK_FREE_HELPER_ENTRIES.flatMap((entry) => {
      const target = exportsField[entry];
      const file =
        typeof target === 'string'
          ? target
          : isPlainObject(target)
            ? (target.import ?? target.default)
            : undefined;
      return typeof file === 'string'
        ? [realpathSync(resolve(packageDirectory, file))]
        : [];
    });
  }
  return [];
}

/**
 * The directory of a package installed for `start`, as Node finds it: in
 * `node_modules` of `start` or of a directory above it, its links resolved.
 */
function installedPackageDirectory(
  start: string,
  name: string
): string | undefined {
  let directory = resolve(start);
  for (;;) {
    const candidate = resolve(directory, 'node_modules', name);
    if (existsSync(resolve(candidate, 'package.json'))) {
      return realpathSync(candidate);
    }
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

/**
 * The kit's shared modules with the specifier its built files import each
 * by: the one the kit's `package.json` exports give the module, else the
 * `specifier` a configuration still names.
 */
function sharedSpecifiersOf(
  kitRoot: string,
  sharedModules: unknown,
  packageDirectories: readonly string[]
): { source: string; specifier: string }[] {
  const authored = (Array.isArray(sharedModules) ? sharedModules : []).filter(
    (sharedModule): sharedModule is { source: string; specifier?: unknown } =>
      isPlainObject(sharedModule) && typeof sharedModule.source === 'string'
  );
  const { sharedModulesOf } = scaffoldUiKit();
  const published = sharedModulesOf(
    kitRoot,
    authored.map(({ source }) => ({ source })),
    packageDirectories
  );
  return authored.flatMap((sharedModule, index) => {
    const specifier =
      published[index].import ??
      (typeof sharedModule.specifier === 'string'
        ? sharedModule.specifier
        : undefined);
    return specifier === undefined
      ? []
      : [{ source: sharedModule.source, specifier }];
  });
}

/**
 * The kit's packages besides the kit root's, from its configuration's
 * `packages`: the styles package, then each target's, their
 * directories resolved against the kit root. `undefined` for a kit without
 * `packages`; an entry without a name and directory is left out, as the
 * kit's build reports it.
 */
function kitPackagesOf(
  kitRoot: string,
  packages: unknown
): KitLayoutPackage[] | undefined {
  if (!isPlainObject(packages)) return undefined;
  const roles: Array<KitLayoutPackage['role']> = ['styles', ...ALL_TARGETS];
  return roles.flatMap((role) => {
    const entry = packages[role];
    if (
      !isPlainObject(entry) ||
      typeof entry.name !== 'string' ||
      entry.name === '' ||
      typeof entry.directory !== 'string' ||
      entry.directory === ''
    )
      return [];
    return [
      {
        role,
        name: entry.name,
        directoryAbsolute: resolve(kitRoot, entry.directory),
      },
    ];
  });
}
