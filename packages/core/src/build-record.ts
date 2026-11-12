import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/**
 * Where a build records the files it wrote, relative to the kit root: the
 * package cache, so the record never ships with the kit.
 */
export const BUILD_RECORD_PATH = join(
  'node_modules',
  '.cache',
  'scaffold-ui-kit',
  'build-record.json'
);

/**
 * The files one build wrote: each path relative to the kit root, in forward
 * slashes, with the SHA-256 of the content the build left there.
 */
export type BuildRecord = Map<string, string>;

/** The result of {@link removeStaleOutput}. */
export interface StaleOutputResult {
  /** The files removed, relative to the kit root. */
  removed: string[];
  /** Files the previous build wrote that were changed since, and kept. */
  kept: string[];
  /**
   * Files the previous build wrote, still present, that lie outside every
   * directory this build writes into, such as the package of a target
   * dropped from a kit built into packages. They are left in place, and the
   * new record no longer lists them.
   */
  outside: string[];
}

/**
 * Reads the record of the previous build. A kit that has not been built
 * yet, or whose record is unreadable, has an empty record.
 *
 * @param kitDirectory - The kit root.
 * @returns The previous build's files and their content hashes.
 */
export function readBuildRecord(kitDirectory: string): BuildRecord {
  const recordPath = join(kitDirectory, BUILD_RECORD_PATH);
  if (!existsSync(recordPath)) {
    return new Map();
  }
  try {
    const parsed = JSON.parse(readFileSync(recordPath, 'utf8')) as {
      files?: Record<string, unknown>;
    };
    return new Map(
      Object.entries(parsed.files ?? {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    );
  } catch {
    return new Map();
  }
}

/**
 * Records the files a build wrote, hashing each as it now stands so a later
 * build can tell its own output from a file someone changed since.
 *
 * @param kitDirectory - The kit root.
 * @param writtenPaths - The absolute paths the build wrote.
 * @param carried - Entries of the previous record to keep, for a build that
 *   removed nothing.
 * @returns The record written.
 */
export function writeBuildRecord(
  kitDirectory: string,
  writtenPaths: Iterable<string>,
  carried: BuildRecord = new Map()
): BuildRecord {
  const record: BuildRecord = new Map(carried);
  for (const path of writtenPaths) {
    if (existsSync(path)) {
      record.set(recordKeyOf(kitDirectory, path), hashOf(path));
    }
  }
  const files = Object.fromEntries(
    [...record].sort(([a], [b]) => a.localeCompare(b))
  );
  const recordPath = join(kitDirectory, BUILD_RECORD_PATH);
  mkdirSync(dirname(recordPath), { recursive: true });
  writeFileSync(recordPath, `${JSON.stringify({ files }, null, 2)}\n`);
  return record;
}

/**
 * Removes what the previous build wrote and this one did not: the output of
 * a deleted template or driver, of a target dropped from the configuration,
 * or of a stylesheet route no longer taken. Only files in the previous
 * build's record are candidates, so a file the kit put in `dist/` itself is
 * never touched; a recorded file whose content changed since that build is
 * kept as well. Directories the removal leaves empty are removed too.
 *
 * On a file system that ignores case, a recorded path that differs from a
 * written one only by case is the file this build just wrote, so it is
 * renamed to the written spelling instead of removed.
 *
 * A kit that builds into several packages names each package directory
 * among `roots`; a recorded path inside none of them is left alone, and
 * returned among `outside`.
 *
 * @param kitDirectory - The kit root.
 * @param previous - The previous build's record.
 * @param writtenPaths - The absolute paths this build wrote.
 * @param roots - The directories the build writes into; the kit root alone
 *   by default.
 * @returns The files removed, the changed files kept, and the files left
 *   outside every root.
 */
export function removeStaleOutput(
  kitDirectory: string,
  previous: BuildRecord,
  writtenPaths: Iterable<string>,
  roots: readonly string[] = [kitDirectory]
): StaleOutputResult {
  const written = new Set(
    [...writtenPaths].map((path) => recordKeyOf(kitDirectory, path))
  );
  const writtenByFoldedKey = new Map(
    [...written].map((key) => [key.toLowerCase(), key])
  );
  const removed: string[] = [];
  const kept: string[] = [];
  const outside: string[] = [];
  const kitRoot = resolve(kitDirectory);
  const resolvedRoots = roots.map((root) => resolve(root));
  for (const [key, hash] of previous) {
    if (written.has(key)) {
      continue;
    }
    const path = resolve(kitRoot, ...key.split('/'));
    // A record naming a path outside the build's directories is not the
    // build's to act on.
    const root = resolvedRoots.find((candidate) => isInside(candidate, path));
    if (root === undefined) {
      if (existsSync(path)) {
        outside.push(key);
      }
      continue;
    }
    if (!existsSync(path)) {
      continue;
    }
    const respelled = writtenByFoldedKey.get(key.toLowerCase());
    if (respelled !== undefined) {
      const writtenPath = resolve(kitRoot, ...respelled.split('/'));
      if (isSameFile(path, writtenPath)) {
        renameSync(path, writtenPath);
        continue;
      }
    }
    if (hashOf(path) !== hash) {
      kept.push(key);
      continue;
    }
    rmSync(path);
    removed.push(key);
    removeEmptyDirectories(root, dirname(path));
  }
  return { removed, kept, outside };
}

/**
 * Whether two paths name one file, as two spellings that differ by case do
 * on a file system that ignores it.
 */
function isSameFile(first: string, second: string): boolean {
  if (!existsSync(second)) {
    return false;
  }
  const firstStatus = statSync(first);
  const secondStatus = statSync(second);
  return (
    firstStatus.dev === secondStatus.dev && firstStatus.ino === secondStatus.ino
  );
}

/** Whether a path lies inside a directory, and is not the directory itself. */
function isInside(directory: string, path: string): boolean {
  const fromDirectory = relative(directory, path);
  return (
    fromDirectory !== '' &&
    !fromDirectory.startsWith('..') &&
    !isAbsolute(fromDirectory)
  );
}

/**
 * Removes a directory left empty, and each empty parent after it, stopping
 * at the root's `dist/` and never leaving the root.
 */
function removeEmptyDirectories(root: string, directory: string): void {
  const distributionRoot = join(root, 'dist');
  let current = directory;
  while (
    current !== distributionRoot &&
    current !== root &&
    current.startsWith(`${root}${sep}`) &&
    existsSync(current) &&
    readdirSync(current).length === 0
  ) {
    rmdirSync(current);
    current = dirname(current);
  }
}

/** A path's record key: relative to the kit root, in forward slashes. */
function recordKeyOf(kitDirectory: string, path: string): string {
  return relative(resolve(kitDirectory), resolve(path)).split(sep).join('/');
}

/** The SHA-256 of a file's content, in hex. */
export function hashOf(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
