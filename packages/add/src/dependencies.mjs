/**
 * The packages a run's copies need: what their code imports, the `pkg:`
 * URLs their stylesheets load, the target's framework, and the kit's own
 * package for the pieces left in it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

import { scriptedTargets } from './kit.mjs';
import { findSpecifiers, isRelative } from './specifiers.mjs';

/**
 * Prints the packages the written files import that the consumer's
 * `package.json` does not list, each with the kit's own range, and how to
 * compile `pkg:` URLs when any appear. An import of the kit's package that
 * names nothing the kit publishes is a warning: it would not resolve.
 *
 * @param {Array<{ path: string, content: string | Buffer }>} files - The
 *   files written, by consumer path.
 * @param {import('./kit.mjs').Kit} kit
 * @param {string} target
 * @param {string} consumerRoot
 * @param {(line: string) => void} print
 * @param {(line: string) => void} warn
 * @param {string[]} [aliases] - The consumer's import aliases, whose
 *   specifiers name no package.
 */
export function reportDependencies(
  files,
  kit,
  target,
  consumerRoot,
  print,
  warn,
  aliases = []
) {
  const packages = new Map();
  const published = publishedSpecifiers(kit);
  let loadsSassPackages = false;

  const record = (specifier) => {
    const packageName = packageNameOf(specifier);
    if (kit.packageNames.has(packageName)) {
      if (!published.has(specifier) && specifier !== packageName) {
        warn(
          `warning: the copied files import '${specifier}', which ${packageName} does not publish; the import will not resolve`
        );
      }
      if (!packages.has(packageName))
        packages.set(packageName, kit.dependencyRange);
      return;
    }
    if (!packages.has(packageName))
      packages.set(packageName, versionRangeOf(kit, packageName));
  };

  // A Vue or Svelte component compiles against its framework without
  // importing it.
  if (scriptedTargets.includes(target) && files.length > 0) record(target);

  for (const { path, content } of files) {
    if (typeof content !== 'string') continue;
    for (const { specifier, kind } of findSpecifiers(content, path)) {
      if (kind === 'url') continue;
      if (kind === 'code') {
        if (
          isRelative(specifier) ||
          specifier.startsWith('/') ||
          specifier.startsWith('node:')
        ) {
          continue;
        }
        if (aliases.some((alias) => specifier.startsWith(alias))) continue;
        record(specifier);
        continue;
      }
      // A stylesheet names a package only through a `pkg:` URL: a bare
      // `@use "styles/color"` is a load-path URL and `sass:` a built-in.
      if (specifier.startsWith('pkg:')) {
        loadsSassPackages = true;
        record(specifier.slice('pkg:'.length));
      }
    }
    if (extname(path) === '.vue') {
      // A `<style src>` naming a package.
      for (const match of content.matchAll(/<style\s+src="([^".][^"]*)"/g))
        record(match[1]);
    }
  }

  const installed = installedPackages(consumerRoot);
  const missing = [...packages.entries()]
    .filter(([packageName]) => !installed.has(packageName))
    .sort(([first], [second]) => first.localeCompare(second));
  if (missing.length > 0) {
    print('');
    print(
      installed.size > 0
        ? 'The copied files import packages not in your package.json:'
        : 'The copied files import these packages:'
    );
    print(
      `  npm install ${missing.map(([packageName, range]) => (range === undefined ? packageName : `${packageName}@${range}`)).join(' ')}`
    );
  }
  if (loadsSassPackages) {
    print('');
    print(
      "The copied stylesheets load packages through pkg: URLs. Sass resolves them with its NodePackageImporter: pass importers: [new NodePackageImporter()] (from 'sass') beside loadPaths, or set it in your bundler's sass options."
    );
  }
}

/** Every specifier the kit's manifest says its package publishes. */
function publishedSpecifiers(kit) {
  const specifiers = new Set();
  for (const { file } of kit.files.values()) {
    if (file.import !== undefined) specifiers.add(file.import);
  }
  for (const sharedModule of kit.manifest.shared ?? []) {
    if (sharedModule.import !== undefined) specifiers.add(sharedModule.import);
  }
  return specifiers;
}

/** The package a bare specifier belongs to: `@scope/name` or `name`. */
function packageNameOf(specifier) {
  const segments = specifier.split('/');
  return specifier.startsWith('@')
    ? segments.slice(0, 2).join('/')
    : segments[0];
}

/**
 * The version range the kit itself declares for a package, if any: in the
 * package the command runs from, then in the kit's other packages, which a
 * copied shared file may come from.
 */
function versionRangeOf(kit, packageName) {
  for (const packageJson of kit.packageJsons()) {
    for (const field of [
      'peerDependencies',
      'dependencies',
      'devDependencies',
    ]) {
      const range = packageJson[field]?.[packageName];
      if (typeof range === 'string' && !range.startsWith('workspace:'))
        return range;
    }
  }
  return undefined;
}

/** The packages the consumer's package.json lists, if there is one. */
function installedPackages(consumerRoot) {
  const packageJsonPath = join(consumerRoot, 'package.json');
  if (!existsSync(packageJsonPath)) return new Set();
  try {
    const consumer = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return new Set(
      [
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'optionalDependencies',
      ].flatMap((field) => Object.keys(consumer[field] ?? {}))
    );
  } catch {
    return new Set();
  }
}
