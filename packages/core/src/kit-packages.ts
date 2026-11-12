import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import type {
  KitConfiguration,
  KitStylesheetLink,
  TargetName,
} from './configuration';
import { peerDependenciesOf } from './extensions';
import type { PackageExports } from './package-exports';
import type { ScriptedTargetName } from './stylesheet-links';

/** What a kit package is to the kit. */
export type KitPackageRole = 'kit' | 'styles' | ScriptedTargetName;

/** The fields of a `package.json` the build reads. */
export interface PackageJson {
  name?: string;
  version?: string;
  exports?: PackageExports;
  files?: unknown;
  bin?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  [key: string]: unknown;
}

/** One package a kit builds into or reads from. */
export interface KitPackage {
  /** The kit root, the styles package, or a scripted target's package. */
  role: KitPackageRole;
  /** The package name. */
  name: string;
  /** The package's directory, absolute. */
  directory: string;
  /** Its `package.json`, as read; empty when there is none yet. */
  packageJson: PackageJson;
}

/**
 * A kit built into one package per scripted target beside a styles
 * package, as its configuration's `packages` declares; the kit root is the
 * package of everything else.
 */
export interface KitLayout {
  /** The kit name its consumers know it by. */
  kitName: string;
  /** The kit root's package. */
  kit: KitPackage;
  /** The package the component stylesheets are written into. */
  styles: KitPackage;
  /** Each scripted target's package. */
  targets: Map<ScriptedTargetName, KitPackage>;
  /** Every package, the kit root first. */
  packages: KitPackage[];
}

/**
 * Reads a kit's package layout: the kit root's package and the packages its
 * configuration's `packages` names, with their `package.json` files. A
 * target package's `package.json` is the build's to write, so it may not
 * exist yet; the kit root's and the styles package's must.
 *
 * @param kitDirectory - The kit root.
 * @param configuration - The kit configuration.
 * @returns The layout, `undefined` for a kit without `packages`, and the
 *   problems that keep the build from using it.
 */
export function readKitLayout(
  kitDirectory: string,
  configuration: KitConfiguration
): { layout?: KitLayout; errors: string[] } {
  const declared = configuration.packages;
  if (declared === undefined) {
    return { errors: [] };
  }
  const errors: string[] = [];
  const kitJson = readPackageJson(kitDirectory);
  if (typeof kitJson.name !== 'string' || kitJson.name === '') {
    errors.push(
      'package.json: error: the kit root needs a package name; it is the package of the shared modules the targets import'
    );
  }
  if (typeof kitJson.version !== 'string') {
    errors.push(
      'package.json: error: the kit root needs a version; every package of the kit takes it'
    );
  }
  const kit: KitPackage = {
    role: 'kit',
    name: kitJson.name ?? configuration.name,
    directory: resolve(kitDirectory),
    packageJson: kitJson,
  };
  const entryOf = (
    role: Exclude<KitPackageRole, 'kit'>,
    entry: { name: string; directory: string }
  ): KitPackage => {
    const directory = resolve(kitDirectory, entry.directory);
    const packageJson = readPackageJson(directory);
    if (entry.name === kit.name) {
      errors.push(
        `packages.${role}: error: '${entry.name}' is the kit root's package name; give the ${role} package another`
      );
    }
    if (packageJson.name !== undefined && packageJson.name !== entry.name) {
      errors.push(
        `${relativePath(kitDirectory, join(directory, 'package.json'))}: error: names the package '${packageJson.name}', but packages.${role} names it '${entry.name}'; make them the same`
      );
    }
    return { role, name: entry.name, directory, packageJson };
  };
  const styles = entryOf('styles', declared.styles);
  const stylesPackagePath = relativePath(
    kitDirectory,
    join(styles.directory, 'package.json')
  );
  if (!existsSync(join(styles.directory, 'package.json'))) {
    errors.push(
      `${stylesPackagePath}: error: the styles package needs a package.json naming '${styles.name}', with the exports that publish its stylesheets`
    );
  } else if (!keepsStylesheets(styles.packageJson.sideEffects)) {
    errors.push(
      `${stylesPackagePath}: error: "sideEffects" leaves out the stylesheets, so a bundler drops the linked components' imports of them; list "**/*.css" in it, or remove it`
    );
  }
  const targets = new Map<ScriptedTargetName, KitPackage>();
  for (const target of configuration.targets) {
    if (target === 'html') continue;
    const entry = declared[target];
    if (entry !== undefined) {
      targets.set(target, entryOf(target, entry));
    }
  }
  return {
    layout: {
      kitName: configuration.name,
      kit,
      styles,
      targets,
      packages: [kit, styles, ...targets.values()],
    },
    errors,
  };
}

/**
 * The package a file lies in, and its path there: the package whose
 * directory holds it most closely, so a package nested in the kit root's
 * directory wins over the kit root.
 *
 * @param packages - The packages, with absolute directories.
 * @param path - The file, absolute.
 * @returns The package and the path relative to its root, in forward
 *   slashes, or `undefined` when no package holds the file.
 */
export function packageOfPath<Package extends { directory: string }>(
  packages: readonly Package[],
  path: string
): { package: Package; path: string } | undefined {
  let found: { package: Package; path: string } | undefined;
  let depth = -1;
  for (const candidate of packages) {
    const fromPackage = relative(candidate.directory, resolve(path));
    if (
      fromPackage === '' ||
      fromPackage.startsWith('..') ||
      isAbsolute(fromPackage)
    ) {
      continue;
    }
    const candidateDepth = resolve(candidate.directory).split(sep).length;
    if (candidateDepth > depth) {
      depth = candidateDepth;
      found = {
        package: candidate,
        path: fromPackage.split(sep).join('/'),
      };
    }
  }
  return found;
}

/** The command a target package publishes its consumer CLI under. */
export function targetCommandName(kitName: string, target: TargetName): string {
  return `${kitName.replace(/^@/, '').replace('/', '-')}-${target}`;
}

/**
 * The `exports` a target package publishes: its barrel, each component
 * module one at a time, and under `stylesheetLink: 'both'` the linked
 * modules beside the unlinked ones.
 *
 * @param target - The scripted target.
 * @param stylesheetLink - How the kit links its stylesheets.
 * @returns The exports, by subpath.
 */
export function targetPackageExports(
  target: ScriptedTargetName,
  stylesheetLink: KitStylesheetLink
): Record<string, string> {
  // A React module is imported without its extension; an SFC with it.
  const modules = target === 'react' ? './dist/*.tsx' : './dist/*';
  return stylesheetLink === 'both'
    ? {
        '.': './dist/index.ts',
        './unlinked': './dist/unlinked/index.ts',
        './unlinked/*': modules,
        './package.json': './package.json',
        './*': './dist/linked/*.ts',
      }
    : {
        '.': './dist/index.ts',
        './package.json': './package.json',
        './*': modules,
      };
}

/** What {@link writeTargetPackage} needs. */
export interface TargetPackageInput {
  /** The layout. */
  layout: KitLayout;
  /** The target whose package is written. */
  target: ScriptedTargetName;
  /** The kit configuration. */
  configuration: KitConfiguration;
  /**
   * The bare packages the target's built files import, each with the first
   * file that imports it, relative to the kit root.
   */
  imports: Map<string, string>;
}

/** What {@link writeTargetPackage} wrote, or why it could not. */
export interface TargetPackageResult {
  /** The `package.json` as written, or as it stood when nothing changed. */
  packageJson: PackageJson;
  /** Whether the file was written. */
  written: boolean;
  errors: string[];
}

/**
 * Writes a target package's `package.json`. The build owns `exports`,
 * `files`, `bin`, `dependencies`, `peerDependencies`, `type` and
 * `sideEffects`, and the version, which is the kit root's; every other
 * field is the kit author's and kept. A file that does not exist yet is
 * created with the package's name.
 *
 * Dependencies: the kit root's package at its exact version, and each other
 * package the built files import, at the range the target's
 * `dependencies` gives, else the kit root's `package.json`. Peers: the
 * target extension's, the target's `peerDependencies` over them, and the
 * styles package at the exact version, so one copy of the stylesheets is
 * installed beside every target. A dependency on another package of the
 * kit that is a `workspace:` range is kept, for a workspace that links them.
 *
 * @param input - The layout, the target and what its files import.
 * @returns The `package.json`, whether it was written, and the problems.
 */
export function writeTargetPackage(
  input: TargetPackageInput
): TargetPackageResult {
  const { layout, target, configuration } = input;
  const targetPackage = layout.targets.get(target)!;
  const errors: string[] = [];
  const packagePath = join(targetPackage.directory, 'package.json');
  const existed = existsSync(packagePath);
  const source = existed ? readFileSync(packagePath, 'utf8') : '';
  const current: PackageJson = existed
    ? (JSON.parse(source) as PackageJson)
    : {};
  const version = layout.kit.packageJson.version ?? '0.0.0';
  const declared = configuration.packages?.[target];
  const kitJson = layout.kit.packageJson;
  const layoutNames = new Set(layout.packages.map((entry) => entry.name));

  const peers: Record<string, string> = {
    ...peerDependenciesOf(target, configuration),
    ...declared?.peerDependencies,
  };
  // A package of the kit at the kit's version, or as a workspace links it.
  const keptRange = (name: string): string => {
    const range =
      current.dependencies?.[name] ?? current.peerDependencies?.[name];
    return range?.startsWith('workspace:') ? range : version;
  };
  peers[layout.styles.name] = keptRange(layout.styles.name);

  const dependencies: Record<string, string> = {
    [layout.kit.name]: keptRange(layout.kit.name),
  };
  const consumerCli = current.dependencies?.['@scaffold-ui-kit/add'];
  if (consumerCli !== undefined) {
    dependencies['@scaffold-ui-kit/add'] = consumerCli;
  }
  const targetNames = new Set(
    [...layout.targets.values()].map((entry) => entry.name)
  );
  for (const [packageName, importer] of input.imports) {
    if (packageName in peers || packageName in dependencies) continue;
    // A target's components import its own package by relative paths, and
    // never another target's.
    if (targetNames.has(packageName)) {
      if (packageName !== targetPackage.name) {
        errors.push(
          `${importer}: error: imports '${packageName}', another target's package; a ${target} component imports only the kit root's and the styles package's modules`
        );
      }
      continue;
    }
    if (layoutNames.has(packageName)) {
      dependencies[packageName] = keptRange(packageName);
      continue;
    }
    const range =
      declared?.dependencies?.[packageName] ??
      kitJson.dependencies?.[packageName] ??
      kitJson.devDependencies?.[packageName] ??
      kitJson.peerDependencies?.[packageName];
    if (range === undefined) {
      errors.push(
        `${importer}: error: imports '${packageName}', which neither packages.${target}.dependencies nor the kit root's package.json lists; add its version range to either`
      );
      continue;
    }
    dependencies[packageName] = range;
  }

  const generated: PackageJson = {
    exports: targetPackageExports(
      target,
      configuration.stylesheetLink ?? 'component'
    ),
    files: ['bin', 'dist'],
    bin: {
      [targetCommandName(layout.kitName, target)]: './bin/add.mjs',
    },
    dependencies: sortedByName(dependencies),
    peerDependencies: sortedByName(peers),
    type: 'module',
    // Marks the modules free of side effects, so a bundler drops the linked
    // modules a consumer never imports. A linked module binds every export
    // itself, so the one it keeps keeps its stylesheet import, which the
    // styles package's own `sideEffects` must keep too.
    sideEffects: ['**/*.css', '**/*.scss'],
  };
  // Fields already present keep their place in the file.
  const next: PackageJson = {
    name: targetPackage.name,
    ...current,
    version,
    ...generated,
  };
  if (errors.length > 0) {
    return { packageJson: current, written: false, errors };
  }
  const indentation = /^([ \t]+)"/m.exec(source)?.[1] ?? 2;
  const content = `${JSON.stringify(next, null, indentation)}\n`;
  if (content === source) {
    return { packageJson: next, written: false, errors };
  }
  mkdirSync(targetPackage.directory, { recursive: true });
  writeFileSync(packagePath, content);
  return { packageJson: next, written: true, errors };
}

/**
 * Whether a `package.json` `sideEffects` keeps a package's CSS files: left
 * out or `true`, or a list with an entry that matches a `.css` file.
 */
function keepsStylesheets(sideEffects: unknown): boolean {
  if (sideEffects === undefined || sideEffects === true) return true;
  if (!Array.isArray(sideEffects)) return false;
  return sideEffects.some(
    (entry) =>
      typeof entry === 'string' &&
      (entry.endsWith('.css') || entry.endsWith('*') || entry === '**')
  );
}

/** The package a bare specifier names: `@scope/name/sub` → `@scope/name`. */
export function packageNameOf(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** Whether a specifier names a package, rather than a file or a builtin. */
export function isBareSpecifier(specifier: string): boolean {
  return !(
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('node:') ||
    specifier.startsWith('#') ||
    /^[a-z][a-z0-9+.-]*:/i.test(specifier) ||
    specifier.startsWith('$')
  );
}

/** A record with its keys sorted, as npm and pnpm write dependencies. */
function sortedByName(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => a.localeCompare(b))
  );
}

/** A directory's `package.json`, or an empty object when it has none. */
export function readPackageJson(directory: string): PackageJson {
  const path = join(directory, 'package.json');
  if (!existsSync(path)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PackageJson;
  } catch {
    return {};
  }
}

/** A path relative to the kit root, in forward slashes, for messages. */
export function relativePath(kitDirectory: string, path: string): string {
  return relative(kitDirectory, path).split(sep).join('/');
}
