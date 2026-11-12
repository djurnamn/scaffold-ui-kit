import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import {
  dirname,
  extname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
} from 'node:path';

import type { StylesheetPlacement } from '@js-template-engine/types';

import {
  sharedModuleNames,
  type AddOwnership,
  type BemMode,
  type KitConfiguration,
  type KitStylesheetLink,
  type SharedModule,
  type SharedModuleCopy,
  type StylingName,
  type SvelteMode,
  type TailwindOutput,
  type TargetName,
} from './configuration';
import { stylingExtensionsOf } from './extensions';
import {
  directoryImportOf,
  importOf,
  type PackageExports,
} from './package-exports';
import { packageOfPath, type KitLayout } from './kit-packages';
import {
  resolveRelativeImport,
  type ScriptedTargetName,
} from './stylesheet-links';

/** The manifest format this release writes. */
export const KIT_MANIFEST_FORMAT = 1;

/** Where the build writes the kit manifest, relative to the kit root. */
export const KIT_MANIFEST_PATH = 'dist/scaffold-ui-kit-manifest.json';

/**
 * What a kit package hands its consumer command: every component with its
 * built files per target and the specifiers the package publishes them
 * under, and the shared modules the components import. `scaffold-ui-kit
 * build` writes it to {@link KIT_MANIFEST_PATH}; the consumer command reads
 * it and the kit's `package.json`, and nothing else of the kit's.
 *
 * Every path is relative to the kit root, with `/`. A file's `import` is
 * the bare specifier the kit's `package.json` `exports` publish it under,
 * such as `my-ui-kit/react/Button` or `my-ui-kit/styles`; a consumer tool
 * that writes a stylesheet's `@use` of it adds the `pkg:` scheme itself.
 *
 * Under `ownership: 'partial'` every piece a consumer can leave in the
 * package - each scripted target's component module and compiled
 * stylesheet, and each shared module's modules and stylesheets - has an
 * `import`. A piece without one is always copied with the piece that
 * imports it; a shared module's other files, such as fonts and images,
 * travel with the stylesheets that reference them. Under
 * `ownership: 'full'` a consumer copies every piece of a component.
 */
export interface KitManifest {
  /** The manifest format, {@link KIT_MANIFEST_FORMAT}. */
  format: typeof KIT_MANIFEST_FORMAT;
  /** The tool and version that wrote the manifest. */
  generator: { name: string; version: string };
  /**
   * The kit's name and version: the kit package's, from its `package.json`;
   * for a kit built into several packages, the kit's name and the version
   * every package shares.
   */
  kit: { name: string; version?: string };
  /**
   * For a kit built into several packages, the name of each: the kit root's
   * package of shared modules, the styles package, and each target's. The
   * manifest lies in its target's package and names the target alone.
   */
  packages?: KitManifestPackages;
  /** The targets every component is built for. */
  targets: TargetName[];
  /**
   * The stylings the components are built with, in application order: each
   * styling extension's name and the kind of class it contributes.
   */
  styling: KitManifestStyling[];
  /** The BEM extension's options, every default filled; `bem` in `styling`. */
  bem?: KitManifestBem;
  /**
   * The Tailwind extension's options, every default filled; `tailwind` in
   * `styling`.
   */
  tailwind?: KitManifestTailwind;
  /** The Svelte extension's options, every default filled; `svelte` in `targets`. */
  svelte?: KitManifestSvelte;
  /** How each component links its stylesheet (the kit configuration's). */
  stylesheetLink: KitStylesheetLink;
  /** The stylesheet language the build emitted. */
  stylingLanguage: 'css' | 'scss';
  /** Where the build placed each component's stylesheet. */
  stylesheetPlacement: StylesheetPlacement;
  /**
   * The Sass load paths the kit's stylesheets compile against, relative to
   * the kit root, which a copied stylesheet may still need; one in another
   * package of the kit names that package.
   */
  loadPaths: Array<string | KitManifestLoadPath>;
  /** The file name of a consumer's settings for the kit. */
  consumerConfiguration: string;
  /** How consumers may own the components (see the kit configuration). */
  ownership: AddOwnership;
  /** Lines the consumer command prints after a successful `add`. */
  notes: string[];
  /**
   * The cascade layer the components' rules are wrapped in, the layer
   * order, and the layer a copied stylesheet moves its rules to. Absent
   * when the kit wraps its rules in no layer.
   */
  stylingLayer?: KitManifestStylingLayer;
  /** The components, generated and hand-written, by name. */
  components: Record<string, KitManifestComponent>;
  /** The shared modules, in configuration order. */
  shared: KitManifestSharedModule[];
}

/** The cascade layer a {@link KitManifest}'s components are styled in. */
export interface KitManifestStylingLayer {
  /** The layer the components' rules are wrapped in. */
  name: string;
  /** The full layer order the stylesheets declare, when the kit states one. */
  order?: string[];
  /** The layer a copied stylesheet moves its rules to, when the kit names one. */
  owned?: string;
  /**
   * In an `scss` kit with an `order`, the generated module holding the
   * order statement, which every emitted stylesheet loads first so the
   * statement compiles ahead of what the stylesheet's other modules emit:
   * one in each directory the build writes stylesheets into, each loaded by
   * the stylesheets beside it. A copied stylesheet needs a copy of it.
   */
  orderModules?: KitManifestFile[];
}

/** One styling a {@link KitManifest}'s components are built with. */
export interface KitManifestStyling {
  /** The styling extension's name. */
  name: StylingName;
  /**
   * The kind of class the extension contributes: `'semantic'` classes name
   * what an element is, and a stylesheet selects on them; `'utility'`
   * classes each apply one declaration.
   */
  classKind: 'semantic' | 'utility';
}

/** The BEM extension's options as a {@link KitManifest} records them. */
export interface KitManifestBem {
  /** The separator between block and element. */
  elementSeparator: string;
  /** The separator before a modifier. */
  modifierSeparator: string;
  /** Whether classes are literal strings or `bem(...)` calls. */
  mode: BemMode;
  /** The package `bem(...)` is imported from under `'runtime'`. */
  importSource: string;
}

/** The Tailwind extension's options as a {@link KitManifest} records them. */
export interface KitManifestTailwind {
  /** Whether the utilities pass through as classes or are converted to styles. */
  output: TailwindOutput;
  /** The selector `dark:` utilities follow under `output: 'styles'`, when set. */
  darkSelector?: string;
  /** Whether authored styles are converted into utility classes. */
  convertStyles: boolean;
}

/** The Svelte extension's options as a {@link KitManifest} records them. */
export interface KitManifestSvelte {
  /** The Svelte dialect the components are written in. */
  mode: SvelteMode;
}

/** The packages of a kit built into several, by what each holds. */
export interface KitManifestPackages {
  /** The kit root's package: the shared modules the components import. */
  kit: string;
  /** The package of the component stylesheets. */
  styles: string;
  /** Each target's package. */
  targets: Partial<Record<TargetName, string>>;
}

/** A Sass load path in another package of the kit. */
export interface KitManifestLoadPath {
  /** The package the directory lies in. */
  package: string;
  /** The directory, relative to that package's root. */
  path: string;
}

/** One component of a {@link KitManifest}. */
export interface KitManifestComponent {
  /** The name in kebab case, such as `'dialog-trigger'`. */
  kebabName: string;
  /** A compound root's parts, by component name. */
  parts?: string[];
  /** The compound a part belongs to. */
  partOf?: string;
  /** The component's built files, per target it is built for. */
  files: Partial<Record<TargetName, KitManifestTargetFiles>>;
}

/** A component's built files for one target. */
export interface KitManifestTargetFiles {
  /** The component module, or the html target's page. */
  component: KitManifestFile;
  /** The stylesheet the build emitted beside it, when it emitted one. */
  stylesheet?: KitManifestFile;
  /**
   * The stylesheet compiled to CSS, for a consumer who owns the component
   * and not its stylesheet; the stylesheet itself in a `css` kit. An `scss`
   * kit's build compiles it under `stylesheetLink: 'both'` or a declared
   * `ownership: 'partial'`.
   */
  css?: KitManifestFile;
  /** Under `stylesheetLink: 'both'`, the component's linked module. */
  linked?: KitManifestFile;
  /**
   * The files the component reaches through relative imports that are no
   * component's own pieces, such as a hand-written driver's helper modules,
   * each imports first. A consumer who copies the component copies them.
   */
  helpers?: KitManifestFile[];
}

/** One built or shared file of a {@link KitManifest}. */
export interface KitManifestFile {
  /**
   * The package the file lies in, when it is another package of the kit
   * than the one holding the manifest.
   */
  package?: string;
  /** The file, relative to the root of its package. */
  path: string;
  /** The specifier the package publishes the file under, when it does. */
  import?: string;
  /**
   * The specifiers the file imports, as written: module imports, sass
   * `@use`, `@forward` and `@import`, a stylesheet's `url(...)` references
   * to files in the kit (relative paths, without a query or fragment), and
   * an html page's stylesheet links.
   */
  imports: string[];
}

/** One shared module of a {@link KitManifest}. */
export interface KitManifestSharedModule {
  /** The name a consumer's settings place and own the module by. */
  name: string;
  /**
   * The package the module lies in, when it is another package of the kit
   * than the one holding the manifest; its files lie there too.
   */
  package?: string;
  /** The file or directory, relative to the root of its package. */
  source: string;
  /**
   * The bare specifier the package publishes the module under, when one
   * names it whole: the file's own, or for a directory the one its modules
   * are imported below (a pattern export) or its index module's. A
   * directory exported file by file has none; its files carry theirs.
   */
  import?: string;
  /** What a consumer who owns the module copies. */
  copy: SharedModuleCopy;
  /** The module's files, those the configuration excludes left out. */
  files: KitManifestFile[];
}

/** One component's built files for one target, as the build saw them. */
export interface BuiltComponentFiles {
  /** The component module or page, absolute. */
  component: string;
  /** The emitted stylesheet, absolute. */
  stylesheet?: string;
  /** The compiled stylesheet, absolute. */
  css?: string;
  /** The linked module, absolute. */
  linked?: string;
}

/** What {@link createKitManifest} needs from the build. */
export interface KitManifestInput {
  kitDirectory: string;
  configuration: KitConfiguration;
  /** The configuration's file, as warnings name it; `scaffold-ui-kit.ts` by default. */
  configurationName?: string;
  /** Each component's files per target, keyed by component name. */
  components: Map<string, Partial<Record<TargetName, BuiltComponentFiles>>>;
  /**
   * Each compound root's parts, keyed by component name: a template's
   * `parts`, or the configuration's for a root with no template.
   */
  parts: Map<string, string[]>;
  /**
   * The layer order modules the build wrote for the manifest's targets,
   * absolute: in an `scss` kit with a `stylingLayer.order`, one in each
   * directory it wrote component stylesheets into.
   */
  layerOrderModules?: string[];
  /**
   * For a kit built into several packages, its layout and the target whose
   * package the manifest is written into.
   */
  packages?: { layout: KitLayout; target: ScriptedTargetName };
}

/** The manifest, or the problems that keep the build from writing it. */
export interface KitManifestResult {
  manifest: KitManifest;
  errors: string[];
  /** What the build warns of without failing. */
  warnings: string[];
}

/** The fields of a kit's `package.json` the manifest reads. */
interface KitPackage {
  name?: string;
  version?: string;
  exports?: PackageExports;
  files?: unknown;
}

/**
 * Builds the kit manifest from what the build wrote, and settles how the
 * kit's consumers may own its components.
 *
 * A declared `ownership` is recorded as declared; a declared `'partial'`
 * with a piece no export reaches is an error per suggested export. Left
 * out, the manifest records `'partial'` only when every piece a consumer can
 * leave in the package has an `import`, and `'full'` otherwise, warning of
 * each gap. Also reported as errors: a part that names no component of the
 * kit, belongs to two compounds or has parts of its own, and, under a
 * declared ownership, a `package.json` `files` that leaves the manifest out
 * (a warning otherwise). A shared module whose source does not exist is a
 * warning and left out.
 *
 * @param input - The kit, its configuration, and the build's components.
 * @returns The manifest, the errors and the warnings; the manifest is
 *   written only when there are no errors.
 */
export function createKitManifest(input: KitManifestInput): KitManifestResult {
  const { kitDirectory, configuration } = input;
  const configurationName = input.configurationName ?? 'scaffold-ui-kit.ts';
  const errors: string[] = [];
  const warnings: string[] = [];
  const kitPackage = readKitPackage(kitDirectory);
  const layout = input.packages?.layout;
  // The packages a file may lie in, and the one holding the manifest.
  const packages: ManifestPackage[] =
    layout === undefined
      ? [
          {
            name: kitPackage.name ?? configuration.name,
            directory: resolve(kitDirectory),
            packageJson: kitPackage,
          },
        ]
      : layout.packages;
  const own: ManifestPackage =
    layout === undefined
      ? packages[0]
      : layout.targets.get(input.packages!.target)!;
  const kitName = layout === undefined ? own.name : layout.kitName;
  const manifestTargets =
    layout === undefined
      ? configuration.targets
      : [input.packages!.target as TargetName];
  const declared = configuration.add?.ownership;
  const linksBoth = configuration.stylesheetLink === 'both';
  const packageJsonLabel = (entry: ManifestPackage): string =>
    toPosixPath(relative(kitDirectory, join(entry.directory, 'package.json')));
  // A file's package and path there; one outside every package is an error.
  const locate = (
    path: string
  ): { package: ManifestPackage; path: string } | undefined => {
    const found = packageOfPath(packages, path);
    if (found === undefined) {
      errors.push(
        `${toPosixPath(relative(kitDirectory, path))}: error: lies outside the kit root and every package of the kit, so no package publishes it`
      );
    }
    return found;
  };
  // The files of other packages the manifest points at, for the check
  // that their packages publish them.
  const referenced = new Map<ManifestPackage, Set<string>>();
  const describeIn = (
    found: { package: ManifestPackage; path: string },
    absolutePath: string,
    importable: boolean
  ): KitManifestFile => {
    const specifier = importable
      ? importOf(
          found.package.name,
          found.package.packageJson.exports,
          found.path
        )
      : undefined;
    if (found.package !== own) {
      referenced.set(
        found.package,
        (referenced.get(found.package) ?? new Set()).add(found.path)
      );
    }
    return {
      ...(found.package === own ? {} : { package: found.package.name }),
      path: found.path,
      ...(specifier === undefined ? {} : { import: specifier }),
      imports: importsOf(absolutePath),
    };
  };
  // The leavable pieces no export reaches, grouped by the package.json
  // that would publish them and an export that would.
  const gaps = new Map<string, Set<string>>();
  const recordGap = (
    entry: ManifestPackage,
    path: string,
    suggestion: string
  ): void => {
    const key = `${packageJsonLabel(entry)}\u0000${suggestion}`;
    gaps.set(key, (gaps.get(key) ?? new Set()).add(path));
  };
  const packageNamed = (name: string | undefined): ManifestPackage =>
    packages.find((entry) => entry.name === name) ?? own;
  // Component stylesheets the build did not compile for consumers.
  const uncompiled = new Set<string>();

  const membership = compoundMembership(
    input.parts,
    new Set(input.components.keys())
  );
  errors.push(...membership.errors);

  // Every component's own pieces, per target, so a helper is told apart.
  const piecesOf = new Map<TargetName, Set<string>>();
  for (const perTarget of input.components.values()) {
    for (const [target, built] of Object.entries(perTarget) as Array<
      [TargetName, BuiltComponentFiles | undefined]
    >) {
      if (built === undefined) continue;
      const pieces = piecesOf.get(target) ?? new Set<string>();
      for (const path of [
        built.component,
        built.stylesheet,
        built.css,
        built.linked,
      ]) {
        if (path !== undefined) pieces.add(resolve(path));
      }
      piecesOf.set(target, pieces);
    }
  }

  const components: Record<string, KitManifestComponent> = {};
  for (const name of [...input.components.keys()].sort()) {
    const perTarget = input.components.get(name)!;
    const files: Partial<Record<TargetName, KitManifestTargetFiles>> = {};
    for (const target of manifestTargets) {
      const built = perTarget[target];
      if (built === undefined) {
        continue;
      }
      let located = true;
      const describe = (path: string): KitManifestFile => {
        const found = locate(path);
        if (found === undefined) {
          located = false;
          return { path: toPosixPath(path), imports: [] };
        }
        return describeIn(found, path, target !== 'html');
      };
      const entry: KitManifestTargetFiles = {
        component: describe(built.component),
      };
      if (built.stylesheet !== undefined) {
        entry.stylesheet = describe(built.stylesheet);
      }
      if (built.css !== undefined) {
        entry.css = describe(built.css);
      }
      if (built.linked !== undefined) {
        entry.linked = describe(built.linked);
      }
      const helpers = helpersOf(
        built.component,
        layout === undefined
          ? join(kitDirectory, 'dist', target)
          : join(own.directory, 'dist'),
        piecesOf.get(target) ?? new Set()
      ).map((path) => describe(path));
      if (helpers.length > 0) {
        entry.helpers = helpers;
      }
      // A consumer imports from the package what they leave in it; the html
      // target has no module to import, so its consumers copy everything.
      if (target !== 'html' && located) {
        const componentPackage = packageNamed(entry.component.package);
        const componentExport = suggestedExport(
          entry.component.path,
          target,
          linksBoth && layout === undefined
        );
        if (entry.component.import === undefined) {
          recordGap(componentPackage, entry.component.path, componentExport);
        }
        if (entry.css !== undefined && entry.css.import === undefined) {
          // An SFC target's export of its directory reaches a sheet beside
          // the component too.
          const besideSingleFileComponent =
            (target === 'vue' || target === 'svelte') &&
            entry.css.package === entry.component.package &&
            posix.dirname(entry.css.path) ===
              posix.dirname(entry.component.path);
          recordGap(
            packageNamed(entry.css.package),
            entry.css.path,
            besideSingleFileComponent
              ? componentExport
              : suggestedExport(
                  entry.css.path,
                  target,
                  linksBoth && layout === undefined
                )
          );
        } else if (entry.stylesheet !== undefined && entry.css === undefined) {
          uncompiled.add(entry.stylesheet.path);
        }
      }
      files[target] = entry;
    }
    components[name] = {
      kebabName: kebabCase(name),
      ...(membership.parts.has(name)
        ? { parts: membership.parts.get(name) }
        : {}),
      ...(membership.partOf.has(name)
        ? { partOf: membership.partOf.get(name) }
        : {}),
      files,
    };
  }

  const authoredModules = configuration.add?.shared ?? [];
  const namings = sharedModuleNames(authoredModules);
  const shared: KitManifestSharedModule[] = [];
  authoredModules.forEach((sharedModule, index) => {
    const sourcePath = join(kitDirectory, sharedModule.source);
    if (!existsSync(sourcePath)) {
      warnings.push(
        `${configurationName}: warning: add.shared[${index}] names '${sharedModule.source}', which does not exist in the kit; it is left out of the manifest`
      );
      return;
    }
    const found = packageOfPath(packages, sourcePath);
    if (found === undefined) {
      errors.push(
        `${configurationName}: error: add.shared[${index}] names '${sharedModule.source}', which lies outside the kit root and every package of the kit`
      );
      return;
    }
    const naming = namings[index];
    if (naming.collided !== undefined) {
      warnings.push(
        `${configurationName}: warning: add.shared[${index}] takes the name '${naming.name}', since another shared module is named '${naming.collided}'; give it a 'name' of its own`
      );
    }
    const { entry, isDirectory, unreached } = describeSharedModule(
      found.package,
      found.package === own ? undefined : found.package.name,
      { ...sharedModule, source: found.path },
      naming.name
    );
    if (found.package !== own) {
      referenced.set(
        found.package,
        new Set([
          ...(referenced.get(found.package) ?? []),
          ...entry.files.map((file) => file.path),
        ])
      );
    }
    const suggestion = suggestedSharedExport(
      entry.name,
      entry.source,
      isDirectory,
      entry.files.map((file) => file.path)
    );
    for (const path of unreached) {
      recordGap(found.package, path, suggestion);
    }
    shared.push(entry);
  });

  // Every leavable piece has an import, or the consumers copy them all.
  const ownership: AddOwnership =
    declared ?? (gaps.size === 0 && uncompiled.size === 0 ? 'partial' : 'full');
  const failsOnGaps = declared === 'partial';
  const reportsGaps = declared === undefined || failsOnGaps;
  if (reportsGaps) {
    for (const [key, pathSet] of gaps) {
      const [label, suggestion] = key.split('\u0000');
      const paths = [...pathSet];
      const listed =
        paths.length > 3
          ? `${paths.slice(0, 3).join(', ')} and ${paths.length - 3} more`
          : paths.join(', ');
      (failsOnGaps ? errors : warnings).push(
        `${label}: ${failsOnGaps ? 'error' : 'warning'}: no export reaches ${listed}; for example, add ${suggestion} to "exports"`
      );
    }
  }
  if (declared === undefined && uncompiled.size > 0) {
    const paths = [...uncompiled];
    warnings.push(
      `${configurationName}: warning: ${paths.length} component stylesheet${paths.length === 1 ? ' is' : 's are'} not compiled to CSS for consumers (${paths.slice(0, 3).join(', ')}${paths.length > 3 ? ' and more' : ''}); the build compiles them under stylesheetLink "both" or a declared add.ownership of "partial"`
    );
  }
  if (
    reportsGaps &&
    (gaps.size > 0 || (declared === undefined && uncompiled.size > 0))
  ) {
    (failsOnGaps ? errors : warnings).push(
      failsOnGaps
        ? 'package.json: note: under add.ownership "partial" a consumer who copies only part of a component imports the rest from the package, by its exports. A kit that exports nothing per piece builds only for full ownership: set add.ownership to "full" to have its consumers copy every piece instead.'
        : 'package.json: note: not every piece a consumer could leave in the package is exported, so the manifest records ownership "full" and the kit\'s consumers copy every piece of a component. Export each piece and set add.ownership to "partial" to let a consumer own part of one, or set "full" to say so and silence these warnings.'
    );
  }

  // A consumer who owns only a stylesheet imports the component from the
  // package; a component that links its own stylesheet loads the kit's
  // sheet beside their copy.
  const linksOwnStylesheet =
    (configuration.stylesheetLink ?? 'component') === 'component';
  const hasLinkedStylesheets = Object.values(components).some((component) =>
    Object.entries(component.files).some(
      ([target, files]) => target !== 'html' && files?.stylesheet !== undefined
    )
  );
  if (ownership === 'partial' && linksOwnStylesheet && hasLinkedStylesheets) {
    warnings.push(
      `${configurationName}: warning: under add.ownership "partial" with stylesheetLink "component", a consumer who owns only a component's stylesheet imports the component from the package, which loads the kit's stylesheet too, beside their copy${configuration.stylingLayer !== undefined && typeof configuration.stylingLayer !== 'string' && configuration.stylingLayer.owned !== undefined ? " (the copy's rules win in the owned layer, but both load)" : ''}; set stylesheetLink to "both" so the package offers the component unlinked`
    );
  }

  if (
    Array.isArray(own.packageJson.files) &&
    !isCoveredByFiles(own.packageJson.files, KIT_MANIFEST_PATH)
  ) {
    (declared === undefined ? warnings : errors).push(
      `${packageJsonLabel(own)}: ${declared === undefined ? 'warning' : 'error'}: "files" leaves out ${KIT_MANIFEST_PATH}, which the kit's consumer command reads; add "dist"`
    );
  }
  // A file another package holds is published only if its "files" has it.
  for (const [entry, paths] of referenced) {
    const listedFiles = entry.packageJson.files;
    if (!Array.isArray(listedFiles)) continue;
    const left = [...paths].filter(
      (path) => !isCoveredByFiles(listedFiles, path)
    );
    if (left.length === 0) continue;
    (declared === undefined ? warnings : errors).push(
      `${packageJsonLabel(entry)}: ${declared === undefined ? 'warning' : 'error'}: "files" leaves out ${left.slice(0, 3).join(', ')}${left.length > 3 ? ` and ${left.length - 3} more` : ''}, which the components and their consumer command use; add ${left.length === 1 ? 'it' : 'them'} or a directory above`
    );
  }

  const loadPaths = (configuration.loadPaths ?? []).map(
    (path): string | KitManifestLoadPath => {
      const normalized = posix
        .normalize(path.replace(/\\/g, '/'))
        .replace(/\/+$/, '');
      if (layout === undefined) {
        return normalized;
      }
      const found = packageOfPath(
        packages,
        join(kitDirectory, normalized, '.load-path')
      );
      if (found === undefined) {
        errors.push(
          `${configurationName}: error: loadPaths names '${path}', which lies outside the kit root and every package of the kit`
        );
        return normalized;
      }
      const directory = posix.dirname(found.path);
      return found.package === own
        ? directory
        : { package: found.package.name, path: directory };
    }
  );

  const layer = configuration.stylingLayer;
  const orderModules = (input.layerOrderModules ?? []).flatMap((path) => {
    const found = locate(path);
    return found === undefined ? [] : [describeIn(found, path, true)];
  });
  const stylingLayer: KitManifestStylingLayer | undefined =
    layer === undefined
      ? undefined
      : typeof layer === 'string'
        ? { name: layer }
        : {
            name: layer.name,
            ...(layer.order === undefined ? {} : { order: layer.order }),
            ...(layer.owned === undefined ? {} : { owned: layer.owned }),
            ...(orderModules.length === 0 ? {} : { orderModules }),
          };

  return {
    manifest: {
      format: KIT_MANIFEST_FORMAT,
      generator: { name: 'scaffold-ui-kit', version: ownVersion() },
      kit: {
        name: kitName,
        ...(kitPackage.version === undefined
          ? {}
          : { version: kitPackage.version }),
      },
      ...(layout === undefined
        ? {}
        : {
            packages: {
              kit: layout.kit.name,
              styles: layout.styles.name,
              targets: Object.fromEntries(
                [...layout.targets].map(([target, entry]) => [
                  target,
                  entry.name,
                ])
              ),
            },
          }),
      targets: [...manifestTargets],
      styling: stylingExtensionsOf(configuration).map((extension) => ({
        name: extension.key as StylingName,
        classKind: extension.classKind,
      })),
      ...extensionBlocksOf(configuration, manifestTargets),
      stylesheetLink: configuration.stylesheetLink ?? 'component',
      stylingLanguage: configuration.stylingLanguage ?? 'css',
      stylesheetPlacement: configuration.stylesheetPlacement ?? 'in-file',
      loadPaths,
      consumerConfiguration:
        configuration.add?.consumerConfiguration ??
        defaultConsumerConfiguration(kitName),
      ownership,
      notes: configuration.add?.notes ?? [],
      ...(stylingLayer === undefined ? {} : { stylingLayer }),
      components,
      shared,
    },
    errors,
    warnings,
  };
}

/**
 * The per-extension blocks the manifest records, for the extensions in use:
 * `bem` and `tailwind` when the kit applies them, `svelte` when the
 * manifest's targets include it, each option filled with the default its
 * extension takes when the configuration leaves it out.
 */
function extensionBlocksOf(
  configuration: KitConfiguration,
  targets: readonly TargetName[]
): Pick<KitManifest, 'bem' | 'tailwind' | 'svelte'> {
  const blocks: Pick<KitManifest, 'bem' | 'tailwind' | 'svelte'> = {};
  if (configuration.styling.includes('bem')) {
    const bem = configuration.bem ?? {};
    blocks.bem = {
      elementSeparator: bem.elementSeparator ?? '__',
      modifierSeparator: bem.modifierSeparator ?? '--',
      mode: bem.mode ?? 'literal',
      importSource: bem.importSource ?? 'use-bem',
    };
  }
  if (configuration.styling.includes('tailwind')) {
    const tailwind = configuration.tailwind ?? {};
    blocks.tailwind = {
      output: tailwind.output ?? 'classes',
      ...(tailwind.darkSelector === undefined
        ? {}
        : { darkSelector: tailwind.darkSelector }),
      convertStyles: tailwind.convertStyles ?? false,
    };
  }
  if (targets.includes('svelte')) {
    blocks.svelte = { mode: configuration.svelte?.mode ?? 'legacy' };
  }
  return blocks;
}

/**
 * Each shared module of a kit as the manifest records it, with the
 * specifier the kit's `package.json` `exports` publish it under, for a tool
 * that reads a kit's shared modules from its source, such as its preview. A
 * module whose source does not exist is described all the same, with no
 * files.
 *
 * A kit built into several packages passes their directories: a module in
 * one of them is described from that package, its `source` and files
 * relative to its root, and names the package.
 *
 * @param kitDirectory - The kit root.
 * @param sharedModules - The kit configuration's `add.shared`.
 * @param packageDirectories - The kit's other packages' directories.
 * @returns The shared modules, in order.
 */
export function sharedModulesOf(
  kitDirectory: string,
  sharedModules: SharedModule[],
  packageDirectories: readonly string[] = []
): KitManifestSharedModule[] {
  const packages: ManifestPackage[] = [kitDirectory, ...packageDirectories].map(
    (directory) => {
      const packageJson = readKitPackage(directory);
      return {
        name: packageJson.name ?? '',
        directory: resolve(directory),
        packageJson,
      };
    }
  );
  const namings = sharedModuleNames(sharedModules);
  return sharedModules.map((sharedModule, index) => {
    const found = packageOfPath(
      packages,
      join(kitDirectory, sharedModule.source)
    );
    const holder = found?.package ?? packages[0];
    return describeSharedModule(
      holder,
      holder === packages[0] ? undefined : holder.name,
      found === undefined
        ? sharedModule
        : { ...sharedModule, source: found.path },
      namings[index].name
    ).entry;
  });
}

/** A package a manifest's files may lie in. */
interface ManifestPackage {
  name: string;
  /** Absolute. */
  directory: string;
  packageJson: KitPackage;
}

/**
 * A shared module's manifest entry, whether its source is a directory, and
 * the files a consumer who leaves the module in the package could not
 * import: none when a pattern export or an exact export names the module
 * whole, else every file without an `import` of its own.
 *
 * @param holder - The package the module lies in.
 * @param recordedPackage - The holder's name when it is not the package holding
 *   the manifest, which the entry records.
 * @param sharedModule - The module, its `source` relative to the holder's
 *   root (the kit root's `source` is resolved from the kit root).
 * @param name - The module's name.
 */
function describeSharedModule(
  holder: ManifestPackage,
  recordedPackage: string | undefined,
  sharedModule: SharedModule,
  name: string
): {
  entry: KitManifestSharedModule;
  isDirectory: boolean;
  unreached: string[];
} {
  const packageDirectory = holder.directory;
  const exportsField = holder.packageJson.exports;
  const packageName = holder.name;
  const toKitPath = (path: string): string =>
    relative(packageDirectory, path).split(sep).join('/');
  const sourcePath = resolve(packageDirectory, sharedModule.source);
  const source = toKitPath(sourcePath);
  const exclude = sharedModule.exclude ?? [];
  const exists = existsSync(sourcePath);
  const isDirectory = exists && statSync(sourcePath).isDirectory();
  const moduleFiles = (
    isDirectory ? filesUnder(sourcePath) : exists ? [sourcePath] : []
  )
    .map(toKitPath)
    .filter(
      (path) =>
        !exclude.some((excluded) => {
          const excludedPath = posix.join(source, excluded);
          return path === excludedPath || path.startsWith(`${excludedPath}/`);
        })
    );
  const specifier = isDirectory
    ? directoryImportOf(packageName, exportsField, source, moduleFiles)
    : importOf(packageName, exportsField, source);
  const files = moduleFiles.map((path) => {
    const fileImport = importOf(packageName, exportsField, path);
    return {
      path,
      ...(fileImport === undefined ? {} : { import: fileImport }),
      imports: importsOf(join(packageDirectory, path)),
    };
  });
  return {
    isDirectory,
    // Only a module or a stylesheet is imported on its own; a font or an
    // image travels with the stylesheets that reference it.
    unreached: files
      .filter((file) => file.import === undefined && isImportable(file.path))
      .map((file) => file.path),
    entry: {
      name,
      ...(recordedPackage === undefined ? {} : { package: recordedPackage }),
      source,
      ...(specifier === undefined ? {} : { import: specifier }),
      copy: sharedModule.copy ?? 'all',
      files,
    },
  };
}

/**
 * The files a component reaches through relative imports that are no
 * component's own piece, followed transitively, each before the files it
 * imports are followed: a hand-written driver's helper modules.
 *
 * @param componentPath - The component module, absolute.
 * @param targetDirectory - The directory the target's modules are built
 *   into, absolute; a helper lies inside it.
 * @param pieces - Every component's own pieces, absolute.
 * @returns The helpers, absolute.
 */
function helpersOf(
  componentPath: string,
  targetDirectory: string,
  pieces: Set<string>
): string[] {
  const fromTarget = relative(targetDirectory, componentPath);
  if (fromTarget.startsWith('..') || isAbsolute(fromTarget)) {
    return [];
  }
  const helpers: string[] = [];
  const seen = new Set<string>([resolve(componentPath)]);
  const visit = (path: string): void => {
    for (const specifier of importsOf(path)) {
      if (!/^\.\.?\//.test(specifier)) continue;
      const resolved = resolveRelativeImport(
        targetDirectory,
        toPosixPath(relative(targetDirectory, path)),
        specifier
      );
      if (resolved === undefined) continue;
      const resolvedPath = resolve(targetDirectory, resolved);
      if (seen.has(resolvedPath) || pieces.has(resolvedPath)) continue;
      seen.add(resolvedPath);
      helpers.push(resolvedPath);
      visit(resolvedPath);
    }
  };
  visit(resolve(componentPath));
  return helpers;
}

/** A path in forward slashes. */
function toPosixPath(path: string): string {
  return path.split(sep).join('/');
}

/** The version of scaffold-ui-kit writing the manifest. */
function ownVersion(): string {
  try {
    const { version } = JSON.parse(
      readFileSync(join(__dirname, '..', 'package.json'), 'utf8')
    ) as { version?: string };
    return version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * The default name of a consumer's settings file: the package name with its
 * scope joined by a hyphen, `.json` added.
 *
 * @param packageName - The kit package's name.
 * @returns The file name, such as `'acme-ui.json'` for `'@acme/ui'`.
 */
export function defaultConsumerConfiguration(packageName: string): string {
  return `${packageName.replace(/^@/, '').replace('/', '-')}.json`;
}

/** Each part's compound and each compound's parts. */
function compoundMembership(
  parts: Map<string, string[]>,
  componentNames: Set<string>
): {
  parts: Map<string, string[]>;
  partOf: Map<string, string>;
  errors: string[];
} {
  const errors: string[] = [];
  const partOf = new Map<string, string>();
  const recorded = new Map<string, string[]>();
  for (const [root, rootParts] of parts) {
    const kept: string[] = [];
    for (const part of rootParts) {
      if (!componentNames.has(part)) {
        errors.push(
          `${root}: error: parts names '${part}', which is not a component of the kit`
        );
        continue;
      }
      const owner = partOf.get(part);
      if (owner !== undefined) {
        errors.push(
          `${root}: error: parts names '${part}', which is already a part of '${owner}'; a part belongs to one compound`
        );
        continue;
      }
      partOf.set(part, root);
      kept.push(part);
    }
    if (kept.length > 0) {
      recorded.set(root, kept);
    }
  }
  for (const [part, root] of partOf) {
    if (recorded.has(part)) {
      errors.push(
        `${part}: error: is a part of '${root}' and lists parts of its own; list them on '${root}' instead`
      );
    }
  }
  return { parts: recorded, partOf, errors };
}

/** `DialogTrigger` → `dialog-trigger`. */
function kebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * An export that would reach a built file and its siblings, as a
 * `"key": "target"` pair: the module's directory without `dist/`, with the
 * extension a consumer leaves off (a `.ts`/`.tsx` module) dropped from the
 * key, and a stylesheet's kept. Under `stylesheetLink: 'both'` a scripted
 * target's component module, rendered unlinked, is suggested under an
 * `/unlinked/` subpath, beside the linked module the target's barrel exports.
 */
function suggestedExport(
  path: string,
  target: TargetName,
  linksBoth: boolean
): string {
  const directory = posix.dirname(path);
  const extension = extname(path);
  let keyDirectory = directory.replace(/^dist(\/|$)/, '');
  const isModule = ['.ts', '.tsx', '.vue', '.svelte'].includes(extension);
  if (linksBoth && isModule && keyDirectory === target) {
    keyDirectory = `${target}/unlinked`;
  }
  const keyBase = keyDirectory === '' ? '.' : `./${keyDirectory}`;
  if (extension === '.ts' || extension === '.tsx') {
    return `"${keyBase}/*": "./${directory}/*${extension}"`;
  }
  if (extension === '.vue' || extension === '.svelte') {
    return `"${keyBase}/*": "./${directory}/*"`;
  }
  return `"${keyBase}/*${extension}": "./${directory}/*${extension}"`;
}

/** The export that would reach a shared module. */
function suggestedSharedExport(
  name: string,
  source: string,
  isDirectory: boolean,
  files: string[]
): string {
  if (!isDirectory) {
    return `"./${name}${extname(source)}": "./${source}"`;
  }
  const extensions = new Set(files.map((file) => extname(file)));
  const extension = extensions.size === 1 ? [...extensions][0] : '';
  return `"./${name}/*": "./${source}/*${extension === '.ts' || extension === '.js' ? extension : ''}"`;
}

/** Every file under a directory, absolute, sorted. */
function filesUnder(directory: string): string[] {
  const files: string[] = [];
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort(
      (first, second) => first.name.localeCompare(second.name)
    )) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  };
  visit(directory);
  return files;
}

/** The files a consumer imports on their own: modules and stylesheets. */
const importableExtensions = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.scss',
  '.sass',
  '.css',
];

/** Whether a file is a module or a stylesheet, as opposed to an asset. */
function isImportable(path: string): boolean {
  return importableExtensions.includes(extname(path));
}

/** What {@link importsOf} reads. */
export interface ImportsOfOptions {
  /**
   * Leaves out the imports and re-exports that only bring in types -
   * `import type`, `export type`, and a braced list whose every name is
   * marked `type` - which the compiled module does not load.
   */
  runtimeOnly?: boolean;
  /** Reads only the `@use`, `@forward` and `@import` rules. */
  sassOnly?: boolean;
}

/**
 * Whether an import or re-export statement brings in only types: `import
 * type ...`, `export type ...`, or `import { type A, type B }` and `export {
 * type A }` with every name marked `type` and no default import.
 */
function isTypeOnlyStatement(statement: string): boolean {
  const head = statement.trimStart();
  if (/^(?:import|export)\s+type\b(?!\s*,)(?!\s+from\b)/.test(head)) {
    return true;
  }
  const braced = /^(?:import|export)\s*\{([^}]*)\}\s*from\b/.exec(head);
  if (braced === null) {
    return false;
  }
  const names = braced[1]
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');
  return names.length > 0 && names.every(isTypeOnlySpecifier);
}

/**
 * Whether one name in a braced import or export list is marked `type`:
 * `type A`, `type A as B`, `type type as t`, `type as` (the type named
 * `as`) and `type as as t`. In `type as t` the `type` is the binding's own
 * name, renamed `t`, and brings in a value.
 */
function isTypeOnlySpecifier(name: string): boolean {
  const words = name.split(/\s+/);
  if (words[0] !== 'type' || words.length < 2) {
    return false;
  }
  return !(words[1] === 'as' && words.length === 3);
}

/**
 * The specifiers a file imports, as written, each once, in order. A
 * stylesheet's `url(...)` references count when they are relative paths to
 * files that exist, such as a font beside it.
 *
 * @param path - The file's path.
 * @param options - Whether to leave out the imports that bring in only
 *   types.
 */
export function importsOf(
  path: string,
  options: ImportsOfOptions = {}
): string[] {
  const extension = extname(path);
  const patterns: RegExp[] = [];
  const sassOnly = options.sassOnly === true;
  const code = [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.vue',
    '.svelte',
  ];
  const styles = ['.scss', '.sass', '.css', '.vue', '.svelte'];
  if (code.includes(extension) && !sassOnly) {
    patterns.push(
      /^[ \t]*import\s+[^;'"]*?\bfrom\s*(['"])([^'"]+)\1/gm,
      /^[ \t]*export\s+(?:\*|type\s+\*|\{[^}]*\}|type\s+\{[^}]*\})\s*(?:as\s+\w+\s+)?from\s*(['"])([^'"]+)\1/gm,
      /^[ \t]*import\s*(['"])([^'"]+)\1/gm,
      /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g
    );
  }
  if (styles.includes(extension)) {
    patterns.push(/^[ \t]*@(?:use|forward|import)\s+(['"])([^'"]+)\1/gm);
  }
  if (extension === '.html' && !sassOnly) {
    patterns.push(/<link\b[^>]*\bhref=(["'])([^"']+)\1/g);
  }
  // Only a file whose imports are read is read: a shared module may hold
  // fonts and images.
  if (patterns.length === 0 || !existsSync(path)) {
    return [];
  }
  const content = readFileSync(path, 'utf8');
  const found: Array<{ index: number; specifier: string }> = [];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (options.runtimeOnly === true && isTypeOnlyStatement(match[0])) {
        continue;
      }
      found.push({ index: match.index ?? 0, specifier: match[2] });
    }
  }
  if (styles.includes(extension) && !sassOnly) {
    for (const match of content.matchAll(
      /\burl\(\s*(['"]?)([^'")\s]+)\1\s*\)/g
    )) {
      // A relative path, its query and fragment left off; not a data URL,
      // an absolute URL, a root path or a fragment.
      const reference = match[2].replace(/[?#].*$/, '');
      if (
        reference === '' ||
        /^[a-z][a-z0-9+.-]*:/i.test(match[2]) ||
        /^[/#]/.test(match[2])
      ) {
        continue;
      }
      const referenced = join(dirname(path), reference);
      if (existsSync(referenced) && statSync(referenced).isFile()) {
        found.push({ index: match.index ?? 0, specifier: reference });
      }
    }
  }
  return [
    ...new Set(
      found
        .sort((first, second) => first.index - second.index)
        .map((entry) => entry.specifier)
    ),
  ];
}

/**
 * Whether a `package.json` `files` list publishes a path: an entry naming
 * it or a directory above it, or a glob matching either.
 */
function isCoveredByFiles(entries: unknown[], path: string): boolean {
  const candidates = path
    .split('/')
    .map((_, index, parts) => parts.slice(0, index + 1).join('/'));
  return entries.some((entry) => {
    if (typeof entry !== 'string' || entry.startsWith('!')) {
      return false;
    }
    const normalized = entry.replace(/^\.\//, '').replace(/\/+$/, '');
    if (!/[*?]/.test(normalized)) {
      return candidates.includes(normalized);
    }
    const pattern = new RegExp(
      `^${normalized
        .split('**')
        .map((part) =>
          part
            .split('*')
            .map((piece) =>
              piece.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\?/g, '[^/]')
            )
            .join('[^/]*')
        )
        .join('.*')}$`
    );
    return candidates.some((candidate) => pattern.test(candidate));
  });
}

function readKitPackage(kitDirectory: string): KitPackage {
  const packagePath = join(kitDirectory, 'package.json');
  if (!existsSync(packagePath)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(packagePath, 'utf8')) as KitPackage;
  } catch {
    return {};
  }
}
