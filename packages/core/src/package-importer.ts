import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import * as sass from 'sass';

import { resolveExport } from './package-exports';

/** The importers a kit's Sass compiles with. */
export type KitSassImporters = NonNullable<sass.Options<'sync'>['importers']>;

/**
 * The Sass importers every compile of a kit's stylesheets uses: one that
 * resolves the kit's own `pkg:<name>/...` URLs through its `package.json`
 * `exports`, under the `sass`, `style` and `default` conditions as Sass
 * reads them and only to a stylesheet, so a template's style preamble can load a shared styles layer by
 * the URL a consumer's copy will load it by, then Sass's own package importer
 * for every other `pkg:` URL.
 *
 * A kit built into several packages passes their directories too, so a
 * `pkg:` URL of any of them resolves through its own `exports` whether or
 * not it is installed beside the kit root.
 *
 * @param kitDirectory - The kit root.
 * @param packageDirectories - The kit's other packages' directories.
 * @returns The importers, in the order Sass tries them.
 * @example
 * ```ts
 * // package.json: "exports": { "./styles/*": "./src/styles/*.scss" }
 * // template style: '@use "pkg:my-ui-kit/styles/tokens" as *;'
 * sass.compile(path, { importers: kitSassImporters(kitDirectory) });
 * ```
 */
export function kitSassImporters(
  kitDirectory: string,
  packageDirectories: readonly string[] = []
): KitSassImporters {
  const importers = [kitDirectory, ...packageDirectories]
    .map((directory) => kitPackageImporter(directory))
    .filter((importer) => importer !== undefined);
  return [...importers, new sass.NodePackageImporter(kitDirectory)];
}

/** An importer that resolves a URL to a file, as Sass's `FileImporter`. */
export interface KitPackageImporter {
  findFileUrl(url: string): URL | null;
}

/**
 * The importer that resolves a kit's own `pkg:<name>/...` URLs through its
 * `package.json` `exports`, on its own: for a Sass compile that brings its
 * own package importer, such as another copy of Sass or a bundler's.
 *
 * @param kitDirectory - The kit root.
 * @returns The importer, or `undefined` when the kit's `package.json` names
 *   no package.
 */
export function kitPackageImporter(
  kitDirectory: string
): KitPackageImporter | undefined {
  const kitPackage = readKitPackage(kitDirectory);
  if (typeof kitPackage.name !== 'string') {
    return undefined;
  }
  const prefix = `pkg:${kitPackage.name}`;
  return {
    findFileUrl(url: string): URL | null {
      if (!url.startsWith(prefix)) {
        return null;
      }
      const rest = url.slice(prefix.length);
      if (rest !== '' && !rest.startsWith('/')) {
        return null;
      }
      // The subpath as written, then the variants Dart Sass tries for an
      // extensionless one: the extensions, the partial, the index files.
      const subpath = rest === '' ? '.' : `.${rest}`;
      let fallback: string | undefined;
      for (const candidate of subpathCandidates(subpath)) {
        const [target] = resolveExport(
          kitPackage.exports,
          candidate,
          SASS_CONDITIONS
        );
        if (target === undefined || !isStylesheetTarget(kitDirectory, target)) {
          continue;
        }
        if (extname(target) === '' || existsSync(join(kitDirectory, target))) {
          return pathToFileURL(join(kitDirectory, target));
        }
        if (candidate === subpath) fallback = target;
      }
      // The subpath's own target, naming a stylesheet that is missing, is
      // still the export's answer, for Sass to report.
      return fallback === undefined
        ? null
        : pathToFileURL(join(kitDirectory, fallback));
    },
  };
}

/**
 * The export subpaths a Sass URL may name, in Dart Sass's order: the
 * subpath itself, and for one without an extension the subpath with each
 * stylesheet extension, its partial, then its `index` and `_index` files,
 * each of those also without an extension.
 */
function subpathCandidates(subpath: string): string[] {
  if (subpath === '.' || extname(subpath) !== '') {
    return [subpath];
  }
  const slash = subpath.lastIndexOf('/');
  const directory = subpath.slice(0, slash);
  const name = subpath.slice(slash + 1);
  // Each variant also without an extension, for an export pattern that
  // adds one (`"./themes/*": "./src/themes/*.scss"`).
  const withExtensions = (base: string): string[] => [
    ...STYLESHEET_EXTENSIONS.map((extension) => `${base}${extension}`),
    base,
  ];
  return [
    subpath,
    ...withExtensions(subpath).slice(0, -1),
    ...withExtensions(`${directory}/_${name}`),
    ...withExtensions(`${subpath}/index`),
    ...withExtensions(`${subpath}/_index`),
  ];
}

/** The export conditions Dart Sass resolves `pkg:` URLs under, in order. */
const SASS_CONDITIONS = ['sass', 'style', 'default'] as const;

/** The extensions of a stylesheet Sass loads. */
const STYLESHEET_EXTENSIONS = ['.scss', '.sass', '.css'];

/**
 * Whether an export target is a stylesheet Sass can load: a file with a
 * stylesheet extension, or a path without one that names a stylesheet the
 * way Sass resolves a load (the extension, a partial or a directory's
 * index added). Anything else, such as a type declaration a `types`-first
 * export leads to, is left to the next importer.
 */
function isStylesheetTarget(kitDirectory: string, target: string): boolean {
  const extension = extname(target);
  if (STYLESHEET_EXTENSIONS.includes(extension)) {
    return true;
  }
  if (extension !== '') {
    return false;
  }
  const path = join(kitDirectory, target);
  const directory = dirname(path);
  const name = basename(path);
  return STYLESHEET_EXTENSIONS.some(
    (stylesheetExtension) =>
      existsSync(`${path}${stylesheetExtension}`) ||
      existsSync(join(directory, `_${name}${stylesheetExtension}`)) ||
      existsSync(join(path, `index${stylesheetExtension}`)) ||
      existsSync(join(path, `_index${stylesheetExtension}`))
  );
}

function readKitPackage(kitDirectory: string): {
  name?: unknown;
  exports?: unknown;
} {
  const packagePath = join(kitDirectory, 'package.json');
  if (!existsSync(packagePath)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(packagePath, 'utf8'));
  } catch {
    return {};
  }
}
