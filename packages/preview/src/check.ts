// The preview check: everything in a kit's story files and manual specs that the
// generator would otherwise take on trust - prop names, enum values, slot names,
// fill components, story files with no component - checked against what the
// components actually declare, plus scenario coverage of every enum value and
// boolean, the kit's preview options and the option values its scenarios
// set, the packages the charcell shell needs installed, and what the kit's
// own build reports for its components. Run as
// `scaffold-ui-kit-preview check` or from a kit's own test suite.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REACT_ATTRIBUTE_NAMES } from '@js-template-engine/extension-react';
import type {
  ConfigurationLookupOptions,
  KitDiagnostics,
} from 'scaffold-ui-kit';
import {
  loadPreviewContext,
  type KitLayoutPackage,
  type PreviewContext,
} from './context.js';
import { kitPaneWidths, loadKit } from './load.js';
import { landingProblems } from './landing.js';
import {
  resolveStory,
  generatedScenarioId,
  generatesProp,
  scenarioValues,
} from './model.js';
import { collectSlotComponents } from './lib/slot-fill.js';
import { isStructurallyOmitted } from './story.js';
import {
  acceptsOptionValue,
  optionProblems,
  type PreviewOption,
} from './options.js';
import { isHtmlAttribute } from './lib/html-attributes.js';
import {
  missingShellPeers,
  missingShellPeersProblem,
  resolvesFrom,
} from './shell-peers.js';
import { HOST_PAGE, loadShellPage } from './shell-page.js';
import { moduleOfSource, TARGET_TOKEN } from './lib/module-of-source.js';
import { parseType, unionMembers } from './lib/parse-type.js';
import type { LoadedComponent } from './load.js';
import type {
  EnumeratedComponent,
  JsonValue,
  PreviewControlHints,
  SlotFill,
  SlotPlan,
  ResolvedStory,
} from './lib/types.js';

export interface PreviewCheckOptions extends ConfigurationLookupOptions {
  /** Report missing scenario coverage as errors, not warnings. */
  strict?: boolean;
}

/** The check's findings, each a line naming its component. */
export interface PreviewCheckReport {
  /** Story file or manual-spec mistakes, and what fails `scaffold-ui-kit
   *  build` for a template in the kit's `src/components/` (a line naming the
   *  template's path, as the build prints it); under `strict`, coverage
   *  gaps too. */
  errors: string[];
  /** What reading the kit configuration warns of, such as its old file
   *  name, which stays a warning under `strict`; an enum value or boolean
   *  no scenario sets, among the props generation
   *  covers: a curated scenario that takes a generated id replaces that
   *  scenario, and is named when it does not set the value (an error under
   *  `strict`); a scenario prop set to `undefined` that the story's starting
   *  value covers, which `null` would unset (an error under `strict`); and
   *  what `scaffold-ui-kit build` warns of for a template in
   *  `src/components/`, named by its path, which stays a warning under
   *  `strict`. The build's lines cover validating and
   *  rendering each template, by the kit's own installed scaffolder; a
   *  driver colliding with a generated file and the stylesheets compiled
   *  under `stylesheetLink: 'both'` are reported by the build alone. */
  warnings: string[];
  /** Props hidden from the controls because their type is not a control. */
  hidden: string[];
  /** Select and boolean props the story file's `generate` leaves out of scenario
   *  generation and coverage: still controls, but no scenario is expected. */
  ungenerated: string[];
}

const STORY_FILE_SUFFIX = '.story.ts';

function format(value: JsonValue): string {
  return typeof value === 'string' ? `'${value}'` : JSON.stringify(value);
}

/** The HTML spelling of each attribute name React spells its own way
 *  (`autoComplete` → `autocomplete`, `className` → `class`). */
const HTML_ATTRIBUTE_NAMES: ReadonlyMap<string, string> = new Map([
  ['className', 'class'],
  ...Object.entries(REACT_ATTRIBUTE_NAMES).map(
    ([html, react]) => [react, html] as [string, string]
  ),
]);

/**
 * Checks the components a fill tree composes against their declarations: an
 * `element` fill's props against the component's props (its default slot's
 * `children` and, where its root forwards them, native attributes among
 * them) and its `slots` against the named slots it declares, at every depth.
 * An unknown component is reported once, from the story's references.
 */
function checkFillTree(
  name: string,
  where: string,
  fill: SlotFill | undefined,
  knownComponents: ReadonlyMap<string, EnumeratedComponent>,
  errors: string[]
): void {
  if (!fill) return;
  if (fill.kind === 'fragment') {
    for (const child of fill.children)
      checkFillTree(name, where, child, knownComponents, errors);
    return;
  }
  if (fill.kind === 'html') {
    checkFillTree(name, where, fill.children, knownComponents, errors);
    return;
  }
  if (fill.kind !== 'element') return;
  const composed = knownComponents.get(fill.component);
  if (composed) {
    const propNames = new Set([
      ...Object.keys(composed.props),
      ...(composed.hasDefaultSlot ? ['children'] : []),
    ]);
    const forwardsAttributes = Boolean(composed.passthrough || composed.rest);
    for (const prop of Object.keys(fill.props ?? {})) {
      if (
        !propNames.has(prop) &&
        !(forwardsAttributes && isHtmlAttribute(prop))
      ) {
        const html = HTML_ATTRIBUTE_NAMES.get(prop);
        errors.push(
          html !== undefined &&
            (propNames.has(html) ||
              (forwardsAttributes && isHtmlAttribute(html)))
            ? `${name}: ${where} gives ${fill.component} unknown prop '${prop}'; a story spells native attributes as HTML does: '${html}'`
            : `${name}: ${where} gives ${fill.component} unknown prop '${prop}'`
        );
      }
    }
    const slotNames = new Set([
      ...composed.slotNames,
      ...(composed.memberNames ?? []),
    ]);
    for (const slot of Object.keys(fill.slots ?? {})) {
      if (!slotNames.has(slot))
        errors.push(
          `${name}: ${where} fills named slot '${slot}' of ${fill.component}, which it lacks`
        );
    }
  }
  checkFillTree(name, where, fill.children, knownComponents, errors);
  for (const slotFill of Object.values(fill.slots ?? {}))
    checkFillTree(name, where, slotFill, knownComponents, errors);
}

/** Checks one component's story file against its declared props and slots. */
function checkComponent(
  { component, story }: LoadedComponent,
  model: ResolvedStory,
  knownComponents: ReadonlyMap<string, EnumeratedComponent>,
  hints: PreviewControlHints,
  errors: string[],
  warnings: string[]
): void {
  if (!story) return;
  const name = component.name;
  const propNames = new Set(Object.keys(component.props));
  // `children` is the default slot's text, which defaultProps and scenarios may set.
  const valueNames = new Set([
    ...propNames,
    ...(component.hasDefaultSlot ? ['children'] : []),
  ]);
  const fixed = story.fixed ?? {};
  // A `passthrough` root or a `rest` spread takes the consumer's native
  // attributes beside the declared props.
  const forwardsAttributes = Boolean(component.passthrough || component.rest);

  for (const prop of Object.keys(story.controls ?? {})) {
    if (!propNames.has(prop))
      errors.push(`${name}: controls names unknown prop '${prop}'`);
  }
  // Every place a story file sets prop values, checked for names and enum values.
  const valueSources: Array<{
    where: string;
    props: Record<string, JsonValue>;
  }> = [
    { where: 'defaultProps', props: story.defaultProps ?? {} },
    { where: 'fixed', props: fixed },
    ...(story.scenarios ?? []).map((scenario) => ({
      where: `scenario '${scenario.id}'`,
      props: scenario.props ?? {},
    })),
  ];
  for (const { where, props } of valueSources) {
    for (const [prop, value] of Object.entries(props)) {
      const accepts = (candidate: string) =>
        valueNames.has(candidate) ||
        (forwardsAttributes && isHtmlAttribute(candidate));
      if (!accepts(prop)) {
        // A React spelling of an attribute the story could give as HTML
        // spells it, the form every pane takes.
        const html = HTML_ATTRIBUTE_NAMES.get(prop);
        errors.push(
          html !== undefined && accepts(html)
            ? `${name}: ${where} sets unknown prop '${prop}'; a story spells native attributes as HTML does: '${html}'`
            : `${name}: ${where} sets unknown prop '${prop}'`
        );
        continue;
      }
      if (prop === 'children' && component.defaultSlotScoped) {
        errors.push(
          `${name}: ${where} sets children, which ${name}'s default slot cannot take: it exposes values, so its content is a function of them, not text`
        );
        continue;
      }
      if (where.startsWith('scenario') && prop in fixed) {
        errors.push(`${name}: ${where} sets '${prop}', which is fixed`);
      }
      // A scenario's undefined never reaches the panes, which keep the value
      // the story starts the prop from; null is what unsets it. The scenario
      // still renders, so this is a warning, an error under `strict`.
      if (
        value === undefined &&
        where.startsWith('scenario') &&
        model.defaultProps[prop] !== undefined &&
        JSON.stringify(component.props[prop]?.default) !==
          JSON.stringify(model.defaultProps[prop])
      ) {
        warnings.push(
          `${name}: ${where} sets ${prop} to undefined, which leaves it at ${format(model.defaultProps[prop])}, the value the story starts it from: unset it with null`
        );
        continue;
      }
      const definition = component.props[prop];
      if (!definition || value === undefined) continue;
      // A two-way prop given null is controlled at null, and its code binds
      // state starting at null, which the component's types take only where
      // the prop is declared with null.
      if (
        value === null &&
        (model.bindings ?? []).some((binding) => binding.prop === prop) &&
        !unionMembers(definition.type).includes('null')
      ) {
        errors.push(
          `${name}: ${where} gives two-way prop ${prop} null, which its type '${definition.type}' does not take: declare it '${definition.type} | null', or leave ${prop} out`
        );
        continue;
      }
      // The type as the control reads it: a named type expanded through
      // the template's imports where it was.
      const parsed = parseType(definition.resolvedType ?? definition.type);
      // A prop with the color select takes one of the kit's color tokens;
      // any other prop, color named or not, takes its declared union.
      const isColor = model.propTypes.some(
        (propType) =>
          propType.name === prop && propType.control === 'color-select'
      );
      const allowed =
        isColor && hints.colorTokens
          ? hints.colorTokens.filter((token): token is string => token != null)
          : parsed.kind === 'enum'
            ? parsed.options
            : undefined;
      // A null unsets the prop (a two-way prop's is checked above).
      if (allowed === undefined || value === null) continue;
      // Beside its literals, the type may take any string (`string & {}`)
      // or a structured value (an object, an array), which the select
      // cannot offer and a story file sets.
      const open = !isColor && parsed.kind === 'enum' && parsed.open === true;
      const structural =
        !isColor && parsed.kind === 'enum' && parsed.structural === true;
      const takes =
        typeof value === 'string'
          ? open || allowed.includes(value)
          : typeof value === 'boolean'
            ? (allowed as (string | boolean)[]).includes(value)
            : typeof value === 'object' && structural;
      if (!takes) {
        const options = allowed
          .map((option) =>
            typeof option === 'string' ? `'${option}'` : String(option)
          )
          .join(', ');
        const besides = [
          ...(open ? ['any string'] : []),
          ...(structural ? ['a structured value'] : []),
        ];
        errors.push(
          `${name}: ${where} sets ${prop} to ${format(value)}, not one of ${options}${besides.length ? ` or ${besides.join(' or ')}` : ''}`
        );
      }
    }
  }

  // Named slots: a template's declared slot names, or for a driver read from
  // code any prop it declares (in React a named or scoped slot is a prop).
  const slotNames = new Set([
    ...component.slotNames,
    ...(component.memberNames ?? []),
  ]);
  // The story's plan, and each scenario's own, which fills the same slots.
  const plans: Array<[string, SlotPlan | undefined]> = [
    ['', story.slots],
    ...(story.scenarios ?? []).map(
      (scenario): [string, SlotPlan | undefined] => [
        `scenario '${scenario.id}' `,
        scenario.slots,
      ]
    ),
  ];
  // A slot whose content must take its scope takes a scoped fill alone: in
  // React its prop is the render function, which plain content is not.
  const scopeRequired = new Set(component.scopeRequiredSlots ?? []);
  // The components the fills compose, at every depth, against what each
  // declares.
  const fillTrees: Array<[string, SlotFill | undefined]> = [];
  for (const [where, plan] of plans) {
    for (const slot of Object.keys(plan?.named ?? {})) {
      if (!slotNames.has(slot))
        errors.push(
          `${name}: ${where}slots fill named slot '${slot}', which ${name} lacks`
        );
    }
    const defaultFill = plan?.default;
    const emptyFragment =
      defaultFill?.kind === 'fragment' && defaultFill.children.length === 0;
    if (defaultFill && !emptyFragment && !component.hasDefaultSlot) {
      errors.push(
        `${name}: ${where}slots fill the default slot, which ${name} lacks`
      );
    }
    const fills: Array<[string, SlotFill | undefined]> = [
      ['default', emptyFragment ? undefined : defaultFill],
      ...Object.entries(plan?.named ?? {}),
    ];
    for (const [slot, fill] of fills) {
      if (fill && fill.kind !== 'scoped' && scopeRequired.has(slot))
        errors.push(
          `${name}: ${where}slots fill ${slot === 'default' ? 'the default slot' : `named slot '${slot}'`} with plain content, which it cannot take: its content must take the values it exposes, so fill it with a scoped fill`
        );
    }
    fillTrees.push(
      [`${where}slots.default`, emptyFragment ? undefined : defaultFill],
      ...Object.entries(plan?.named ?? {}).map(
        ([slot, fill]) =>
          [`${where}slots.named.${slot}`, fill] as [string, SlotFill]
      )
    );
  }

  for (const referenced of model.slotComponents) {
    if (!knownComponents.has(referenced)) {
      errors.push(
        `${name}: slot content references '${referenced}', which no source declares`
      );
    }
  }

  fillTrees.push(
    ['around.before', story.around?.before],
    ['around.after', story.around?.after]
  );
  for (const [where, fill] of fillTrees)
    checkFillTree(name, where, fill, knownComponents, errors);
}

/**
 * Checks the option values a component's scenarios set against the kit's
 * options: each must name one of them, hold a value it accepts, and not be
 * one the story file makes unavailable for the component.
 */
function checkScenarioOptions(
  { component, story }: LoadedComponent,
  previewOptions: unknown,
  errors: string[]
): void {
  const options = Array.isArray(previewOptions)
    ? (previewOptions as PreviewOption[])
    : [];
  for (const scenario of story?.scenarios ?? []) {
    for (const [id, value] of Object.entries(scenario.options ?? {})) {
      const where = `${component.name}: scenario '${scenario.id}'`;
      const option = options.find((candidate) => candidate?.id === id);
      if (!option) {
        errors.push(`${where} sets unknown option '${id}'`);
      } else if (!acceptsOptionValue(option, value)) {
        errors.push(
          `${where} sets option '${id}' to ${JSON.stringify(value)}, which it cannot hold`
        );
      } else if (story?.options?.[id] === false) {
        errors.push(
          `${where} sets option '${id}', which the story file makes unavailable`
        );
      }
    }
  }
}

/**
 * Whether a package's `exports` exports a subpath, as Node resolves it: an
 * entry for the subpath itself, or else the subpath pattern (`./*`) with the
 * longest matching prefix. An entry whose value is `null` excludes the
 * subpath.
 */
function exportsSubpath(exports: unknown, subpath: string): boolean {
  if (exports === null || typeof exports !== 'object' || Array.isArray(exports))
    return false;
  const entries = exports as Record<string, unknown>;
  if (subpath in entries) return entries[subpath] !== null;
  let best: { prefix: string; value: unknown } | undefined;
  for (const [key, value] of Object.entries(entries)) {
    const star = key.indexOf('*');
    if (star === -1 || key.indexOf('*', star + 1) !== -1) continue;
    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);
    if (
      subpath.length >= prefix.length + suffix.length &&
      subpath.startsWith(prefix) &&
      subpath.endsWith(suffix) &&
      (best === undefined || prefix.length > best.prefix.length)
    )
      best = { prefix, value };
  }
  return best !== undefined && best.value !== null;
}

/**
 * Whether a package's `exports` exports a shared module's subpath, or paths
 * below it, which the kit's built files import as `<specifier>/<path>`: an
 * entry for the subpath (see {@link exportsSubpath}) or any entry below it,
 * such as the pattern `./scripts/*` for `./scripts`, which the kit's
 * files import paths below the specifier by. The package's own name,
 * `.`, is also exported by a string or array `exports`, or an object of
 * conditions alone (`{ "import": ..., "types": ... }`).
 */
function exportsShared(exports: unknown, subpath: string): boolean {
  if (subpath === '.') {
    if (typeof exports === 'string' || Array.isArray(exports)) return true;
    if (
      exports !== null &&
      typeof exports === 'object' &&
      Object.keys(exports).length > 0 &&
      !Object.keys(exports).some((key) => key.startsWith('.'))
    )
      return true;
  }
  if (exportsSubpath(exports, subpath)) return true;
  if (
    subpath === '.' ||
    exports === null ||
    typeof exports !== 'object' ||
    Array.isArray(exports)
  )
    return false;
  return Object.entries(exports as Record<string, unknown>).some(
    ([key, value]) => key.startsWith(`${subpath}/`) && value !== null
  );
}

/**
 * The entry a package's `exports` could give a shared module's source: the
 * file itself, or a directory's `index.ts` or `index.js` when it has one,
 * relative to the package's directory. `undefined` when the source is a
 * directory with neither.
 */
function sharedEntry(
  packageDirectory: string,
  kitRoot: string,
  source: string
): string | undefined {
  const absolute = resolve(kitRoot, source);
  const path = `./${relative(packageDirectory, absolute).split(sep).join('/')}`;
  if (!statSync(absolute, { throwIfNoEntry: false })?.isDirectory())
    return path;
  const index = ['index.ts', 'index.js'].find((file) =>
    existsSync(resolve(absolute, file))
  );
  return index === undefined ? undefined : `${path}/${index}`;
}

/** A package of the kit whose `package.json` the check reads. */
interface CheckedPackage {
  /** What the messages call its exports, such as "the kit's exports". */
  label: string;
  name: string;
  directory: string;
  packagePath: string;
  exports: unknown;
}

/**
 * A package's `package.json`, read for its name and `exports`; `undefined`
 * when it has none, and an error when it is not JSON.
 */
function readCheckedPackage(
  directory: string,
  label: string,
  errors: string[]
): CheckedPackage | undefined {
  const packagePath = resolve(directory, 'package.json');
  if (!existsSync(packagePath)) return undefined;
  let manifest: { name?: unknown; exports?: unknown };
  try {
    manifest = JSON.parse(readFileSync(packagePath, 'utf8')) as typeof manifest;
  } catch (error) {
    errors.push(
      `${packagePath}: cannot be read as JSON (${(error as Error).message})`
    );
    return undefined;
  }
  const { name, exports } = manifest ?? {};
  if (typeof name !== 'string') return undefined;
  return { label, name, directory, packagePath, exports };
}

/**
 * Checks that the kit's package exports each path the preview imports it
 * by: a source whose `moduleBase` is the kit's own package name imports
 * `<name>/<target>`, which resolves only through an `exports` entry for
 * `./<target>` (or a subpath pattern covering it), and the kit's built
 * files import each shared module by its `add.shared` `specifier`, which
 * resolves the same way when it is a path of the kit's own package. A
 * module the kit aliases is resolved by the alias instead.
 *
 * A kit built into one package per target (its configuration's
 * `packages`) is checked as its packages: a shared module's specifier
 * against the exports of the package it names (the kit root's or the
 * styles package's), the kit's own source against the target packages'
 * names, and each package for resolving from the kit root.
 */
function checkTargetExports(context: PreviewContext, errors: string[]): void {
  const aliases = context.configuration.aliases ?? {};
  const kit = readCheckedPackage(context.kitRoot, "the kit's exports", errors);
  const layout = context.kitPackages;
  const styles = layout?.find(({ role }) => role === 'styles');
  const styled =
    styles === undefined
      ? undefined
      : readCheckedPackage(
          styles.directoryAbsolute,
          "the styles package's exports",
          errors
        );
  const exporting = [kit, styled].filter(
    (checked): checked is CheckedPackage =>
      checked !== undefined && !(checked.name in aliases)
  );
  for (const { source, specifier } of context.sharedSpecifiers) {
    const holder = exporting
      .filter(
        ({ name }) => specifier === name || specifier.startsWith(`${name}/`)
      )
      .sort((a, b) => b.name.length - a.name.length)[0];
    if (holder === undefined) continue;
    const subpath = `.${specifier.slice(holder.name.length)}`;
    if (specifier in aliases || exportsShared(holder.exports, subpath))
      continue;
    const entry = sharedEntry(holder.directory, context.kitRoot, source);
    errors.push(
      `${holder.packagePath}: add.shared gives '${source}' the specifier '${specifier}', but ${holder.label} has no '${subpath}' entry, so the preview and the kit's consumers cannot import it; ${
        entry === undefined
          ? `add one naming the module '${source}' exports from`
          : `add one, such as "${subpath}": "${entry}"`
      }`
    );
  }
  if (layout !== undefined) {
    checkLayoutSources(context, kit?.name, errors);
    checkLayoutResolves(context, layout, errors);
    return;
  }
  if (kit === undefined || kit.name in aliases) return;
  const { name, exports, packagePath } = kit;
  if (!context.sources.some((source) => source.moduleBase === name)) return;
  for (const target of context.targets) {
    const specifier = `${name}/${target}`;
    if (specifier in aliases || exportsSubpath(exports, `./${target}`))
      continue;
    errors.push(
      `${packagePath}: the kit builds the ${target} target, but its package.json has no exports entry for './${target}', so the preview cannot import '${specifier}'; add one, such as "./${target}": "./dist/${target}/index.ts"`
    );
  }
}

/**
 * The `moduleBase` with `{target}` whose module for each target is that
 * target's package name, when one covers them all.
 */
function targetPattern(
  packages: readonly KitLayoutPackage[]
): string | undefined {
  const [first] = packages;
  if (first === undefined) return undefined;
  for (
    let index = first.name.indexOf(first.role);
    index !== -1;
    index = first.name.indexOf(first.role, index + 1)
  ) {
    const pattern = `${first.name.slice(0, index)}${TARGET_TOKEN}${first.name.slice(index + first.role.length)}`;
    if (
      packages.every(({ role, name }) => moduleOfSource(pattern, role) === name)
    )
      return pattern;
  }
  return undefined;
}

/**
 * Checks, for a kit built into one package per target, that the
 * kit's own source imports each target from its package: a source naming the
 * kit (its package name or kit name, without `{target}`) or a `{target}`
 * pattern that yields some target packages' names but not the rest is
 * reported, with the pattern that covers the configured names.
 */
function checkLayoutSources(
  context: PreviewContext,
  kitPackageName: string | undefined,
  errors: string[]
): void {
  const aliases = context.configuration.aliases ?? {};
  const targetPackages = (context.kitPackages ?? []).filter(
    ({ role }) => role !== 'styles'
  );
  if (targetPackages.length === 0) return;
  const pattern = targetPattern(targetPackages);
  const remedy =
    pattern === undefined
      ? `name the per-target packages so one pattern with '${TARGET_TOKEN}' covers them all (such as '${context.kitName}-${TARGET_TOKEN}'), and set moduleBase to it`
      : `set moduleBase to '${pattern}'`;
  for (const source of context.sources) {
    const { moduleBase } = source;
    const namesKit =
      !moduleBase.includes(TARGET_TOKEN) &&
      (moduleBase === kitPackageName || moduleBase === context.kitName);
    const matches = targetPackages.filter(
      ({ role, name }) => moduleOfSource(moduleBase, role) === name
    );
    if (!namesKit && matches.length === 0) continue;
    for (const { role, name } of targetPackages) {
      const imported = moduleOfSource(moduleBase, role);
      if (imported === name || imported in aliases) continue;
      errors.push(
        `source '${source.id}': moduleBase '${moduleBase}' imports '${imported}', but the ${role} target is built into '${name}'; ${remedy}`
      );
      // One message per source says what to change.
      break;
    }
  }
}

/**
 * Checks that each package of a kit built into one package per target
 * resolves from the kit root, as the preview imports it by name.
 */
function checkLayoutResolves(
  context: PreviewContext,
  layout: readonly KitLayoutPackage[],
  errors: string[]
): void {
  const aliases = context.configuration.aliases ?? {};
  for (const { role, name } of layout) {
    if (name in aliases || resolvesFrom(name, context.kitRoot)) continue;
    errors.push(
      `packages.${role}: '${name}' does not resolve from the kit root, so the preview cannot import it; add it to the kit's workspace or as a dev dependency of the kit root`
    );
  }
}

type DiagnoseKit = (
  kitDirectory: string,
  options: { configuration: string }
) => Promise<KitDiagnostics>;

/** `diagnoseKit` from a module's exports, ES or CommonJS, when it has one. */
function diagnoseKitOf(module: unknown): DiagnoseKit | undefined {
  const exports = module as {
    diagnoseKit?: unknown;
    default?: { diagnoseKit?: unknown };
  };
  const found = exports.diagnoseKit ?? exports.default?.diagnoseKit;
  return typeof found === 'function' ? (found as DiagnoseKit) : undefined;
}

/** Whether a report is the shape `diagnoseKit` returns: lists of lines. */
function isKitDiagnostics(report: unknown): report is KitDiagnostics {
  const lines = (value: unknown) =>
    Array.isArray(value) && value.every((line) => typeof line === 'string');
  return (
    typeof report === 'object' &&
    report !== null &&
    lines((report as KitDiagnostics).errors) &&
    lines((report as KitDiagnostics).warnings)
  );
}

/** Whether an error says a module is not there to load. */
function isMissingModule(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return (
    code === 'MODULE_NOT_FOUND' || code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
  );
}

/**
 * What `scaffold-ui-kit build` reports for the kit's components, by the
 * scaffolder the kit builds with: the kit's own installed copy, else the
 * preview's. A kit copy that cannot be loaded, has no `diagnoseKit` or
 * returns something other than its report is set aside for the preview's,
 * with a warning saying why; a kit with none installed is not warned of. A
 * kit with no `src/components/`, whose components are all manual or come
 * from another directory, has nothing the build renders, and gets nothing
 * here.
 */
async function buildDiagnostics(
  kitRoot: string,
  configuration: string
): Promise<KitDiagnostics> {
  if (!existsSync(join(kitRoot, 'src', 'components')))
    return { errors: [], warnings: [] };
  const fallback = async (reason?: string): Promise<KitDiagnostics> => {
    const own = diagnoseKitOf(await import('scaffold-ui-kit'));
    const report = own
      ? await own(kitRoot, { configuration })
      : { errors: [], warnings: [] };
    return reason === undefined
      ? report
      : {
          errors: report.errors,
          warnings: [
            `the kit's scaffold-ui-kit ${reason}, so the build's diagnostics come from the preview's own copy`,
            ...report.warnings,
          ],
        };
  };
  let entry: string;
  try {
    entry = createRequire(join(kitRoot, 'package.json')).resolve(
      'scaffold-ui-kit'
    );
  } catch (error) {
    if (isMissingModule(error)) return fallback();
    throw error;
  }
  let module: unknown;
  try {
    module = await import(pathToFileURL(entry).href);
  } catch (error) {
    return fallback(
      `could not be loaded (${error instanceof Error ? error.message : String(error)})`
    );
  }
  const diagnoseKit = diagnoseKitOf(module);
  if (!diagnoseKit)
    return fallback(
      'exports no diagnoseKit; update scaffold-ui-kit in the kit'
    );
  const report: unknown = await diagnoseKit(kitRoot, { configuration });
  if (!isKitDiagnostics(report))
    return fallback(
      "returned a report that isn't lists of errors and warnings"
    );
  return report;
}

/** The component a tag names, or undefined for an HTML element: the part
 *  before any `.`, when it starts with a capital. A dynamic tag names its
 *  `default`. */
function componentOfTag(tag: unknown): string | undefined {
  const name =
    typeof tag === 'string'
      ? tag
      : tag && typeof tag === 'object'
        ? (tag as { default?: unknown }).default
        : undefined;
  if (typeof name !== 'string') return undefined;
  const head = name.split('.')[0];
  return /^[A-Z]/.test(head) ? head : undefined;
}

/** Every component an element or fragment in a template tree renders, through
 *  its tag or a target's `tag` override. */
function collectRendered(node: unknown, into: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) collectRendered(child, into);
    return;
  }
  const record = node as Record<string, unknown>;
  if (record.type === 'element' || record.type === 'fragment') {
    const own = componentOfTag(record.tag);
    if (own) into.add(own);
    const extensions = record.extensions;
    if (extensions && typeof extensions === 'object') {
      for (const override of Object.values(extensions)) {
        if (override && typeof override === 'object') {
          const named = componentOfTag((override as { tag?: unknown }).tag);
          if (named) into.add(named);
        }
      }
    }
  }
  for (const value of Object.values(record)) collectRendered(value, into);
}

/** Each component's renderers: the other templates whose trees render it,
 *  omitted ones included. A story file's slot plan is not a renderer. */
function templateRenderers(
  components: LoadedComponent[]
): Map<string, Set<string>> {
  const renderers = new Map<string, Set<string>>();
  for (const { component } of components) {
    if (!component.template) continue;
    const rendered = new Set<string>();
    collectRendered(component.template, rendered);
    rendered.delete(component.name);
    for (const name of rendered) {
      const set = renderers.get(name) ?? new Set<string>();
      set.add(component.name);
      renderers.set(name, set);
    }
  }
  return renderers;
}

/** The labels of the stories a reader browses, each as `<source> <label>`: a
 *  standalone component neither omitted nor unlisted, whose story file names its
 *  story. A label stands in for a component of its own source only. */
function labelsOfStories(
  components: LoadedComponent[],
  omitPattern?: RegExp
): Set<string> {
  const labels = new Set<string>();
  for (const { component, story, source } of components) {
    const label = story?.label;
    if (typeof label !== 'string') continue;
    const omit =
      (story?.omit ?? false) ||
      isStructurallyOmitted(component.name, omitPattern);
    const standalone =
      (story?.standalone ?? true) && (component.standalone ?? true);
    const unlisted =
      (story?.unlisted ?? false) || (component.unlisted ?? false);
    if (!omit && standalone && !unlisted) labels.add(`${source.id} ${label}`);
  }
  return labels;
}

/** Whether a component's template is a compound's root, listing parts. */
function listsParts(template: unknown): boolean {
  if (!template || typeof template !== 'object' || Array.isArray(template))
    return false;
  const parts = (template as { parts?: unknown }).parts;
  return Array.isArray(parts) && parts.length > 0;
}

/**
 * Checks a kit's preview story files and manual specs against its components.
 *
 * @param kitRoot - The kit root (where its package.json lives)
 * @param options - `strict` turns coverage warnings into errors; `configuration`
 *   names the kit configuration file, as `--configuration` does
 * @returns The errors, warnings and hidden props, each a line naming its component
 * @example
 * ```ts
 * it('keeps the preview in step with the components', async () => {
 *   const report = await checkPreview(process.cwd());
 *   expect(report.errors).toEqual([]);
 * });
 * ```
 */
export async function checkPreview(
  kitRoot: string,
  options: PreviewCheckOptions = {}
): Promise<PreviewCheckReport> {
  const context = loadPreviewContext(kitRoot, {
    configuration: options.configuration,
    workingDirectory: options.workingDirectory,
  });
  const { components, parts } = await loadKit(context);
  const kitConfiguration = context.configuration;
  const hints = kitConfiguration.controlHints ?? {};
  const errors: string[] = [];
  const warnings: string[] = [];
  const hidden: string[] = [];
  const ungenerated: string[] = [];
  const knownComponents = new Map(
    components.map((loaded) => [loaded.component.name, loaded.component])
  );
  const renderers = templateRenderers(components);
  const storyLabels = labelsOfStories(components, context.omitPattern);
  errors.push(...optionProblems(kitConfiguration.options));
  errors.push(...kitPaneWidths(context).errors);
  const shellProblem = missingShellPeersProblem(missingShellPeers(context));
  if (shellProblem !== undefined) errors.push(shellProblem);
  // The shell's page, loaded as `dev` and `build` load it.
  try {
    await loadShellPage(context, { hostPage: HOST_PAGE, serving: false });
  } catch (error) {
    errors.push((error as Error).message.replace(/^\[preview\] /, ''));
  }
  checkTargetExports(context, errors);
  // What the kit's own build reports for its components, as it reports it:
  // a story of a component the build fails has nothing to show.
  const build = await buildDiagnostics(
    resolve(kitRoot),
    context.configurationPath
  );
  errors.push(...build.errors);
  // The browseable stories, which the landing entry may name.
  const stories: ResolvedStory[] = [];

  for (const loaded of components) {
    const { component, story } = loaded;
    let model: ResolvedStory;
    try {
      model = resolveStory(
        component,
        story,
        hints,
        kitConfiguration.labels,
        context.omitPattern,
        context.targets
      );
    } catch (error) {
      errors.push((error as Error).message);
      continue;
    }
    // `unlisted` hides a story; an omitted component or one that is not
    // standalone has none.
    if ((story?.unlisted ?? false) || (component.unlisted ?? false)) {
      if (model.omit)
        errors.push(
          `${component.name}: unlisted has no story to hide, as the component is omitted`
        );
      else if (!model.standalone)
        errors.push(
          `${component.name}: unlisted has no story to hide, as the component is standalone: false`
        );
    }
    // A compound's root names its parts in its template, or in the kit
    // configuration when it has none; a story file's
    // `standalone: false` alone still takes a component out of the navigation,
    // but no compound copies it whole. One that is no one compound's part
    // needs no listing: a block two
    // templates render, a component a labeled story stands in for, or a
    // root with parts of its own.
    if (
      story?.standalone === false &&
      !parts.has(component.name) &&
      (renderers.get(component.name)?.size ?? 0) < 2 &&
      !storyLabels.has(`${loaded.source.id} ${component.name}`) &&
      !listsParts(component.template) &&
      (context.parts[component.name]?.length ?? 0) === 0
    )
      warnings.push(
        `${component.name}: its story file sets standalone: false, but no compound lists it in parts, fewer than two templates render it, no story in its source is labeled '${component.name}' and it lists no parts of its own; list it in its root's parts`
      );
    if (!model.omit && model.standalone) stories.push(model);
    checkComponent(loaded, model, knownComponents, hints, errors, warnings);
    checkScenarioOptions(loaded, kitConfiguration.options, errors);

    // Omitted components get no story, so their coverage is moot. A prop the
    // story file's `generate` leaves out is out of coverage by that choice, and is
    // listed as ungenerated instead.
    if (!model.omit && model.standalone) {
      const generate = story?.generate;
      const ungeneratedProps = new Set<string>();
      for (const { prop, value } of scenarioValues(
        model.propTypes,
        model.defaultProps
      )) {
        if (!generatesProp(generate, prop)) {
          ungeneratedProps.add(prop);
          continue;
        }
        if (
          !model.scenarios.some((scenario) => scenario.props?.[prop] === value)
        ) {
          const id = generatedScenarioId(prop, value);
          const replacing = story?.scenarios?.some(
            (scenario) => scenario.id === id
          );
          warnings.push(
            `${component.name}: no scenario sets ${prop} to ${format(value)}` +
              (replacing
                ? ` (scenario '${id}' replaces the generated one and does not set it)`
                : '')
          );
        }
      }
      for (const prop of ungeneratedProps)
        ungenerated.push(`${component.name}: ${prop}`);
    }

    for (const propType of model.propTypes) {
      const excluded =
        story?.controls?.[propType.name] === false ||
        propType.name in (story?.fixed ?? {});
      if (!propType.include && !excluded) {
        hidden.push(
          `${component.name}: ${propType.name} (${component.props[propType.name].type})`
        );
      }
    }
  }

  // A story file that matches no component in its source is never read. A
  // stories directory the kit has not made yet holds none.
  for (const source of context.sources) {
    if (
      !source.storiesDirectoryAbsolute ||
      !existsSync(source.storiesDirectoryAbsolute)
    )
      continue;
    const componentNames = new Set(
      components
        .filter((loaded) => loaded.source.id === source.id)
        .map((loaded) => loaded.component.name)
    );
    for (const file of readdirSync(source.storiesDirectoryAbsolute)) {
      if (!file.endsWith(STORY_FILE_SUFFIX)) continue;
      const name = file.slice(0, -STORY_FILE_SUFFIX.length);
      if (!componentNames.has(name)) {
        errors.push(
          `${name}: ${resolve(source.storiesDirectoryAbsolute, file)} matches no component in source '${source.id}'; name it after a template, or list a hand-written component in the source's manualModule`
        );
      }
    }
  }

  errors.push(...landingProblems(context.configuration.landing, stories));

  // `strict` makes the coverage gaps errors; what reading the kit
  // configuration warns of, such as a file name it still accepts, and the
  // build's warnings stay warnings.
  return options.strict
    ? {
        errors: [...errors, ...warnings],
        warnings: [...context.warnings, ...build.warnings],
        hidden,
        ungenerated,
      }
    : {
        errors,
        warnings: [...context.warnings, ...build.warnings, ...warnings],
        hidden,
        ungenerated,
      };
}
