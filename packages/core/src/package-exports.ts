/**
 * Maps a package's files back to the specifiers its `package.json`
 * `exports` field publishes them under, following Node's resolution rules.
 */

/** The `exports` field of a `package.json`, as written. */
export type PackageExports = unknown;

/** One subpath of an `exports` map and a file target it leads to. */
interface ExportTarget {
  /** The subpath key, `'.'` or `'./...'`, with at most one `*`. */
  key: string;
  /** A target path without its leading `./`, with at most one `*`. */
  target: string;
}

/**
 * The subpath map an `exports` field stands for: a string or an array, or an
 * object of conditions, is the `'.'` entry; an object whose keys start with
 * `.` is the map itself.
 */
function subpathMap(exportsField: PackageExports): Record<string, unknown> {
  if (
    typeof exportsField === 'object' &&
    exportsField !== null &&
    !Array.isArray(exportsField)
  ) {
    const keys = Object.keys(exportsField);
    if (keys.length > 0 && keys.every((key) => key.startsWith('.'))) {
      return exportsField as Record<string, unknown>;
    }
  }
  return exportsField === undefined ? {} : { '.': exportsField };
}

/**
 * Every file path a subpath's value can lead to, whatever conditions are
 * active: the strings of a conditions object or a fallback array, nested.
 * `null` leads nowhere.
 */
function everyTargetOf(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.startsWith('./') ? [value.slice('./'.length)] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(everyTargetOf);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).flatMap(everyTargetOf);
  }
  return [];
}

/**
 * The file paths a subpath's value leads to under a priority list of
 * conditions, as a resolver that knows them reads it: a string leads to
 * itself, a fallback array to its first entry that leads anywhere, and a
 * conditions object to the value of the first listed condition it has that
 * leads anywhere. A condition the list leaves out, such as `types`, is never
 * read.
 */
function targetsUnder(value: unknown, conditions: readonly string[]): string[] {
  if (typeof value === 'string') {
    return value.startsWith('./') ? [value.slice('./'.length)] : [];
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const targets = targetsUnder(entry, conditions);
      if (targets.length > 0) {
        return targets;
      }
    }
    return [];
  }
  if (typeof value === 'object' && value !== null) {
    for (const condition of conditions) {
      if (Object.prototype.hasOwnProperty.call(value, condition)) {
        const targets = targetsUnder(
          (value as Record<string, unknown>)[condition],
          conditions
        );
        if (targets.length > 0) {
          return targets;
        }
      }
    }
  }
  return [];
}

function exportTargets(exportsField: PackageExports): ExportTarget[] {
  return Object.entries(subpathMap(exportsField)).flatMap(([key, value]) =>
    everyTargetOf(value).map((target) => ({ key, target }))
  );
}

/**
 * Node's order of subpath patterns, most specific first: the longer part
 * before the `*`, then the longer key.
 */
function comparePatternKeys(first: string, second: string): number {
  const firstBase = first.indexOf('*');
  const secondBase = second.indexOf('*');
  const firstPrefix = firstBase === -1 ? first.length : firstBase + 1;
  const secondPrefix = secondBase === -1 ? second.length : secondBase + 1;
  if (firstPrefix !== secondPrefix) {
    return secondPrefix - firstPrefix;
  }
  return second.length - first.length;
}

/**
 * The files a subpath resolves to under Node's rules: an exact key first,
 * else the most specific pattern key that matches; a `null` value, or no
 * key, resolves to nothing.
 *
 * @param exportsField - The `exports` field.
 * @param subpath - The subpath, `'.'` or `'./...'`.
 * @param conditions - The conditions to resolve under, in priority order;
 *   left out, the targets under every condition.
 * @returns The target files, without `./`.
 */
export function resolveExport(
  exportsField: PackageExports,
  subpath: string,
  conditions?: readonly string[]
): string[] {
  const targetsOf = (value: unknown): string[] =>
    conditions === undefined
      ? everyTargetOf(value)
      : targetsUnder(value, conditions);
  const map = subpathMap(exportsField);
  if (
    Object.prototype.hasOwnProperty.call(map, subpath) &&
    !subpath.includes('*')
  ) {
    return targetsOf(map[subpath]);
  }
  const patternKeys = Object.keys(map)
    .filter((key) => key.split('*').length === 2)
    .sort(comparePatternKeys);
  for (const key of patternKeys) {
    const [prefix, suffix] = key.split('*');
    if (
      subpath.length >= key.length - 1 &&
      subpath.startsWith(prefix) &&
      subpath.endsWith(suffix) &&
      subpath !== prefix
    ) {
      const captured = subpath.slice(
        prefix.length,
        subpath.length - suffix.length
      );
      return targetsOf(map[key]).map((target) =>
        target.split('*').join(captured)
      );
    }
  }
  return [];
}

/**
 * The specifier a consumer imports a file of the package by, through its
 * `exports`: every subpath whose target reaches the file and that resolves
 * back to it (so a more specific key or a `null` exclusion is honored). The
 * most specific target wins: an exact path, then the pattern with the longer
 * part before its `*`, then the longer part after it, then the first
 * written.
 *
 * @param packageName - The package's name.
 * @param exportsField - The `exports` field.
 * @param file - The file, relative to the package root, with `/`.
 * @returns The specifier, such as `'my-ui-kit/react/Button'`, or
 *   `undefined` when no export reaches the file.
 * @example
 * ```ts
 * importOf('my-ui-kit', { './react/*': './dist/react/*.tsx' }, 'dist/react/Button.tsx');
 * // 'my-ui-kit/react/Button'
 * ```
 */
export function importOf(
  packageName: string,
  exportsField: PackageExports,
  file: string
): string | undefined {
  const candidates: Array<{ subpath: string; rank: number[]; order: number }> =
    [];
  exportTargets(exportsField).forEach(({ key, target }, order) => {
    const keyParts = key.split('*');
    const targetParts = target.split('*');
    let subpath: string | undefined;
    let rank: number[];
    if (targetParts.length === 1) {
      if (target !== file || keyParts.length !== 1) {
        return;
      }
      subpath = key;
      rank = [1, target.length, 0];
    } else if (targetParts.length === 2 && keyParts.length === 2) {
      const [prefix, suffix] = targetParts;
      if (
        file.length < prefix.length + suffix.length + 1 ||
        !file.startsWith(prefix) ||
        !file.endsWith(suffix)
      ) {
        return;
      }
      const captured = file.slice(prefix.length, file.length - suffix.length);
      subpath = keyParts.join(captured);
      rank = [0, prefix.length, suffix.length];
    } else {
      return;
    }
    if (resolveExport(exportsField, subpath).includes(file)) {
      candidates.push({ subpath, rank, order });
    }
  });
  if (candidates.length === 0) {
    return undefined;
  }
  candidates.sort(
    (first, second) =>
      second.rank[0] - first.rank[0] ||
      second.rank[1] - first.rank[1] ||
      second.rank[2] - first.rank[2] ||
      first.order - second.order
  );
  return specifierOf(packageName, candidates[0].subpath);
}

/**
 * The specifier a package publishes a directory's modules under: the key
 * of a pattern export whose target starts with the directory (the modules
 * are imported below it, such as `'my-ui-kit/scripts/positioning'`), else
 * the key of an exact export of an index module in it (`'my-ui-kit/lib'`).
 *
 * @param packageName - The package's name.
 * @param exportsField - The `exports` field.
 * @param directory - The directory, relative to the package root, with `/`.
 * @param files - The files in the directory, relative to the package root.
 * @returns The specifier, or `undefined` when no export reaches the
 *   directory.
 */
export function directoryImportOf(
  packageName: string,
  exportsField: PackageExports,
  directory: string,
  files: string[]
): string | undefined {
  const base = `${directory.replace(/\/$/, '')}/`;
  for (const { key, target } of exportTargets(exportsField)) {
    const keyParts = key.split('*');
    if (
      keyParts.length === 2 &&
      keyParts[0].endsWith('/') &&
      keyParts[1] === '' &&
      target.startsWith(`${base}*`) &&
      files.some((file) => importOf(packageName, exportsField, file))
    ) {
      return specifierOf(packageName, keyParts[0].slice(0, -1));
    }
  }
  const index = files.find((file) =>
    /^(?:index\.[cm]?[jt]sx?|_?index\.(?:scss|sass|css))$/.test(
      file.slice(base.length)
    )
  );
  if (index !== undefined) {
    const specifier = importOf(packageName, exportsField, index);
    if (specifier !== undefined && !specifier.endsWith('/index')) {
      return specifier;
    }
  }
  return undefined;
}

/** The specifier of a subpath: the package name, then the subpath. */
function specifierOf(packageName: string, subpath: string): string {
  return subpath === '.'
    ? packageName
    : `${packageName}/${subpath.slice('./'.length)}`;
}
