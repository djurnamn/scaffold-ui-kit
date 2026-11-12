/**
 * Reading a kit: its manifest and its `package.json`, the only two files of
 * a kit package the consumer commands read.
 */
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';

import { moduleCandidates, stylesheetCandidates } from './specifiers.mjs';

/** The manifest format this package reads. */
export const MANIFEST_FORMAT = 1;

/** Where a kit's build writes its manifest, relative to the kit root. */
export const MANIFEST_PATH = 'dist/scaffold-ui-kit-manifest.json';

/** The scripted targets, each named after the package its components run on. */
export const scriptedTargets = ['react', 'vue', 'svelte'];

/**
 * Reads a kit package: its manifest, checked for a format this package
 * reads, and its `package.json`, with lookups over the manifest's files.
 *
 * @param {string} kitRoot - The kit package's root directory.
 * @returns {Kit}
 * @throws When the manifest is missing, unreadable, malformed or of a newer
 *   format.
 */
export function readKit(kitRoot) {
  const packagePath = join(kitRoot, 'package.json');
  if (!existsSync(packagePath)) {
    throw new Error('The kit package has no package.json.');
  }
  const kitPackage = JSON.parse(readFileSync(packagePath, 'utf8'));
  const manifestPath = join(kitRoot, MANIFEST_PATH);
  if (!existsSync(manifestPath)) {
    throw new Error(
      `${kitPackage.name ?? 'The kit'} has no ${MANIFEST_PATH}. Its build predates the manifest: rebuild the kit with scaffold-ui-kit 2.3.0 or later.`
    );
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `The kit's ${MANIFEST_PATH} is not valid JSON: ${error.message}`
    );
  }
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !Number.isInteger(manifest.format) ||
    manifest.format < 1
  ) {
    throw new Error(
      `The kit's ${MANIFEST_PATH} ${manifest?.format === undefined ? 'has no format number' : `has format ${JSON.stringify(manifest.format)}, which is not a format number`}: it is malformed. Rebuild the kit with scaffold-ui-kit.`
    );
  }
  if (manifest.format > MANIFEST_FORMAT) {
    throw new Error(
      `The kit's manifest is format ${manifest.format}, and this @scaffold-ui-kit/add reads format ${MANIFEST_FORMAT}. The kit needs a newer @scaffold-ui-kit/add: update its dependency on it.`
    );
  }
  return new Kit(kitRoot, kitPackage, manifest);
}

/**
 * Where a file of another package of a kit built into several is keyed: as
 * the package is installed, `node_modules/<package>/<path>`. A file of the
 * package the command runs from keeps its own path, so every file of the
 * kit has one key, and keys of two packages never meet.
 */
const OTHER_PACKAGE_PREFIX = 'node_modules/';

/**
 * A manifest with every file of another package keyed as
 * {@link OTHER_PACKAGE_PREFIX} gives, and each load path in another package
 * as such a key too.
 */
function localized(manifest) {
  const keyOf = (packageName, path) =>
    packageName === undefined
      ? path
      : posix.join(OTHER_PACKAGE_PREFIX, packageName, path);
  const file = (entry, packageName = entry.package) => ({
    ...entry,
    path: keyOf(packageName, entry.path),
  });
  const components = Object.fromEntries(
    Object.entries(manifest.components ?? {}).map(([name, component]) => [
      name,
      {
        ...component,
        files: Object.fromEntries(
          Object.entries(component.files ?? {}).map(([target, files]) => [
            target,
            Object.fromEntries(
              Object.entries(files).map(([piece, value]) => [
                piece,
                Array.isArray(value)
                  ? value.map((entry) => file(entry))
                  : file(value),
              ])
            ),
          ])
        ),
      },
    ])
  );
  const shared = (manifest.shared ?? []).map((sharedModule) => ({
    ...sharedModule,
    source: keyOf(sharedModule.package, sharedModule.source),
    files: (sharedModule.files ?? []).map((entry) =>
      file(entry, entry.package ?? sharedModule.package)
    ),
  }));
  const loadPaths = (manifest.loadPaths ?? []).map((loadPath) =>
    typeof loadPath === 'string'
      ? loadPath
      : keyOf(loadPath.package, loadPath.path)
  );
  const stylingLayer =
    manifest.stylingLayer?.orderModules === undefined
      ? manifest.stylingLayer
      : {
          ...manifest.stylingLayer,
          orderModules: manifest.stylingLayer.orderModules.map((entry) =>
            file(entry)
          ),
        };
  return {
    ...manifest,
    components,
    shared,
    loadPaths,
    ...(stylingLayer === undefined ? {} : { stylingLayer }),
  };
}

/** A kit package, read. */
export class Kit {
  /** Each other package's root, found once. */
  #roots = new Map();

  constructor(root, kitPackage, manifest) {
    /** The kit root: the package the command runs from. */
    this.root = root;
    /** The kit's `package.json`. */
    this.package = kitPackage;
    /**
     * The kit manifest, every file of another package of the kit keyed by
     * where it is installed, `node_modules/<package>/<path>`.
     */
    this.manifest = localized(manifest);
    /** The kit's name: its package name, or the name of a kit built into several. */
    this.name = manifest.kit?.name ?? kitPackage.name;
    /** The name of the package the command runs from. */
    this.packageName = kitPackage.name ?? this.name;
    /** Whether the kit is built into a package per target. */
    this.inPackages = manifest.packages !== undefined;
    /** Every package of the kit, by name. */
    this.packageNames = new Set(
      [
        this.inPackages ? undefined : this.name,
        this.packageName,
        manifest.packages?.kit,
        manifest.packages?.styles,
        ...Object.values(manifest.packages?.targets ?? {}),
      ].filter((name) => typeof name === 'string')
    );
    /** The kit's version, or `'0.0.0'` when it has none. */
    this.version = manifest.kit?.version ?? kitPackage.version ?? '0.0.0';
    /** Every file the manifest names, by path, with what it is. */
    this.files = new Map();
    for (const [name, component] of Object.entries(this.manifest.components)) {
      for (const [target, files] of Object.entries(component.files ?? {})) {
        for (const piece of ['component', 'stylesheet', 'css', 'linked']) {
          if (files[piece] !== undefined) {
            this.#record(files[piece], { component: name, target, piece });
          }
        }
        for (const helper of files.helpers ?? []) {
          this.#record(helper, { component: name, target, piece: 'helper' });
        }
      }
    }
    for (const sharedModule of this.manifest.shared) {
      for (const file of sharedModule.files) {
        this.#record(file, { layer: sharedModule.name, piece: 'shared' });
      }
    }
    /**
     * The generated module stating the kit's layer order, which every
     * stylesheet of an `scss` kit with a layer order loads first: the first
     * of the copies the build wrote, which stands for them all, since each
     * holds the same statement. Undefined when the kit has none.
     */
    this.layerOrderModule = this.manifest.stylingLayer?.orderModules?.[0];
    for (const file of this.manifest.stylingLayer?.orderModules ?? []) {
      this.#record(file, { piece: 'layer-order' });
    }
  }

  /**
   * The layer order module a kit path is a copy of: the one the kit's
   * stylesheets are copied with, whichever copy the path names.
   *
   * @param {string | undefined} path - A kit path.
   * @returns {object | undefined} The module's manifest file, or undefined
   *   when the path is no copy of it.
   */
  layerOrderModuleAt(path) {
    if (path === undefined) return undefined;
    const known = this.files.get(path);
    return known?.roles.some((role) => role.piece === 'layer-order')
      ? this.layerOrderModule
      : undefined;
  }

  /**
   * Whether a ledger entry is this package's to check and update: every
   * entry, unless the kit is built into a package per target, whose
   * packages share one ledger and each answer for the copies made for its
   * own target. A shared file is the same whichever target copied it, so
   * every package answers for it: the target its entry records is the last
   * one that wrote it.
   */
  answersFor(entry) {
    const target = entry.settings?.target;
    return (
      !this.inPackages ||
      entry.layer !== undefined ||
      target === undefined ||
      (this.manifest.targets ?? []).includes(target)
    );
  }

  /** Whether a bare specifier names a package of the kit, or a path below one. */
  ownsSpecifier(specifier) {
    return [...this.packageNames].some(
      (name) => specifier === name || specifier.startsWith(`${name}/`)
    );
  }

  /**
   * The version range a consumer depends on a package of the kit at: the
   * kit's own version for every package of a kit built into several, which
   * version together; a caret range otherwise.
   */
  get dependencyRange() {
    return this.inPackages ? this.version : `^${this.version}`;
  }

  /**
   * A kit file's directory and path there: another package's file is read
   * from where that package is installed.
   */
  locate(path) {
    if (this.inPackages && path.startsWith(OTHER_PACKAGE_PREFIX)) {
      const rest = path.slice(OTHER_PACKAGE_PREFIX.length);
      const name = [...this.packageNames].find((candidate) =>
        rest.startsWith(`${candidate}/`)
      );
      if (name !== undefined && name !== this.packageName) {
        return {
          root: this.#rootOf(name),
          path: rest.slice(name.length + 1),
        };
      }
    }
    return { root: this.root, path };
  }

  /**
   * The `package.json` files of the kit's packages, the running one first;
   * one that is not installed is left out.
   */
  packageJsons() {
    const found = [this.package];
    for (const name of this.packageNames) {
      if (name === this.packageName || name === this.name) continue;
      try {
        found.push(
          JSON.parse(
            readFileSync(join(this.#rootOf(name), 'package.json'), 'utf8')
          )
        );
      } catch {
        // Not installed: its ranges are not needed to copy.
      }
    }
    return found;
  }

  /**
   * Where another package of the kit is installed: found as Node finds a
   * package, from the running package's directory, then from the working
   * directory.
   */
  #rootOf(name) {
    const known = this.#roots.get(name);
    if (known !== undefined) return known;
    for (const start of [this.root, process.cwd()]) {
      let directory = resolve(start);
      for (;;) {
        const candidate = join(directory, 'node_modules', name);
        if (existsSync(join(candidate, 'package.json'))) {
          const root = realpathSync(candidate);
          this.#roots.set(name, root);
          return root;
        }
        const parent = dirname(directory);
        if (parent === directory) break;
        directory = parent;
      }
    }
    throw new Error(
      `${name} is not installed. ${this.packageName} reads its files from it: install it with npm install ${name}@${this.version}.`
    );
  }

  #record(file, role) {
    const known = this.files.get(file.path);
    if (known === undefined) {
      this.files.set(file.path, { file, roles: [role] });
    } else {
      known.roles.push(role);
    }
  }

  /** The kit's file name stem for a consumer's files: the settings name without `.json`. */
  get consumerStem() {
    return this.consumerConfiguration.replace(/\.json$/, '');
  }

  /** The file name of a consumer's settings for the kit. */
  get consumerConfiguration() {
    return (
      this.manifest.consumerConfiguration ??
      `${this.name.replace(/^@/, '').replace('/', '-')}.json`
    );
  }

  /** The components built for a target, by name, sorted. */
  componentsFor(target) {
    return Object.keys(this.manifest.components ?? {})
      .filter(
        (name) => this.manifest.components[name].files?.[target] !== undefined
      )
      .sort();
  }

  /** A component's manifest entry. */
  component(name) {
    return this.manifest.components?.[name];
  }

  /** A component's built files for a target, or undefined. */
  filesOf(name, target) {
    return this.manifest.components?.[name]?.files?.[target];
  }

  /** The shared module of a name, or undefined. */
  sharedModule(name) {
    return (this.manifest.shared ?? []).find(
      (sharedModule) => sharedModule.name === name
    );
  }

  /** Whether the kit's consumers copy every piece. */
  get ownsEverything() {
    return this.manifest.ownership === 'full';
  }

  /**
   * The component a request names for a target: by name in any case, or by
   * its kebab-case name (`text-input` for `TextInput`).
   */
  findComponent(request, target) {
    const available = this.componentsFor(target);
    const comparable = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return (
      available.find((name) => name.toLowerCase() === request.toLowerCase()) ??
      available.find((name) => comparable(name) === comparable(request))
    );
  }

  /**
   * The kit file a relative specifier in a kit file names, or undefined.
   * Files the manifest names are found first; any other file of the kit
   * package is found on disk.
   *
   * @param {string} fromPath - The importing kit file.
   * @param {string} specifier - The relative specifier.
   * @param {'code' | 'style' | 'url'} kind - How the file imports it.
   */
  resolveRelative(fromPath, specifier, kind) {
    const base = posix.normalize(
      posix.join(posix.dirname(fromPath), specifier)
    );
    if (base.startsWith('..')) return undefined;
    const candidates =
      kind === 'style'
        ? stylesheetCandidates(base)
        : kind === 'url'
          ? [base]
          : moduleCandidates(base);
    return (
      candidates.find((candidate) => this.files.has(candidate)) ??
      candidates.find((candidate) => {
        const located = this.locate(candidate);
        const path = join(located.root, located.path);
        return existsSync(path) && statSync(path).isFile();
      })
    );
  }

  /**
   * The shared-module file a bare specifier of the kit's package names, such
   * as `my-ui-kit/scripts/ids` or, from a stylesheet, `my-ui-kit/styles/tokens`.
   *
   * @param {string} specifier - The specifier, without `pkg:`.
   * @param {'code' | 'style'} kind - How the file imports it.
   * @returns {{ sharedModule: object, file: object } | undefined}
   */
  resolvePackageSpecifier(specifier, kind) {
    if (!this.ownsSpecifier(specifier)) {
      return undefined;
    }
    for (const sharedModule of this.manifest.shared ?? []) {
      const exact = sharedModule.files.find(
        (file) => file.import === specifier
      );
      if (exact !== undefined) return { sharedModule, file: exact };
    }
    // Below a shared module's own specifier, the rest is a path inside its source.
    for (const sharedModule of this.manifest.shared ?? []) {
      if (
        sharedModule.import === undefined ||
        !specifier.startsWith(`${sharedModule.import}/`)
      )
        continue;
      const base = posix.join(
        sharedModule.source,
        specifier.slice(sharedModule.import.length + 1)
      );
      const candidates =
        kind === 'style' ? stylesheetCandidates(base) : moduleCandidates(base);
      const file = candidates
        .map((candidate) =>
          sharedModule.files.find((entry) => entry.path === candidate)
        )
        .find((entry) => entry !== undefined);
      if (file !== undefined) return { sharedModule, file };
    }
    return undefined;
  }

  /**
   * The shared-module file a Sass load-path URL names (`@use "styles/color"`
   * against a load path of `src`), or undefined.
   */
  resolveLoadPath(specifier) {
    for (const loadPath of this.manifest.loadPaths ?? []) {
      const base = posix.normalize(posix.join(loadPath, specifier));
      for (const candidate of stylesheetCandidates(base)) {
        const known = this.files.get(candidate);
        const role = known?.roles.find((entry) => entry.piece === 'shared');
        if (role !== undefined) {
          return {
            sharedModule: this.sharedModule(role.layer),
            file: known.file,
          };
        }
      }
    }
    return undefined;
  }

  /** The shared module a kit file belongs to, with its manifest entry. */
  sharedFileAt(path) {
    const role = this.files
      .get(path)
      ?.roles.find((entry) => entry.piece === 'shared');
    return role === undefined
      ? undefined
      : {
          sharedModule: this.sharedModule(role.layer),
          file: this.files.get(path).file,
        };
  }

  /** The component piece a kit file is for a target, or undefined. */
  componentFileAt(path, target) {
    return this.files
      .get(path)
      ?.roles.find(
        (entry) => entry.component !== undefined && entry.target === target
      );
  }

  /** A kit file's text, or its bytes for a file that is not text. */
  read(path) {
    const located = this.locate(path);
    const bytes = readFileSync(join(located.root, located.path));
    return isText(path) ? bytes.toString('utf8') : bytes;
  }
}

const textExtensions = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.html',
  '.scss',
  '.sass',
  '.css',
  '.json',
  '.md',
  '.svg',
  '.txt',
];

/** Whether a file is read and written as text. */
export function isText(path) {
  return textExtensions.includes(posix.extname(path));
}
