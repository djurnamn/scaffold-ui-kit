/**
 * The consumer's project as every command sees it: its package root, its
 * settings for the kit, and the ledger of the copies already made.
 */
import { existsSync, lstatSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Ledger,
  hashOf,
  normalizeLineEndings,
  writeFileAtomically,
} from './ledger.mjs';
import { findConsumerRoot, readSettings } from './settings.mjs';

/** This package's version, recorded in each ledger entry. */
export const addVersion = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../package.json', import.meta.url)),
    'utf8'
  )
).version;

/**
 * Opens the consumer's project for a kit.
 *
 * @param {import('./kit.mjs').Kit} kit
 * @param {string} [workingDirectory]
 */
export function openProject(kit, workingDirectory = process.cwd()) {
  const root = findConsumerRoot(workingDirectory);
  const settingsPath = join(root, kit.consumerConfiguration);
  const read = readSettings(settingsPath, kit);
  /** A root-relative path, refused when it leads outside the root. */
  const inside = (path) => {
    const absolute = resolve(root, path);
    const fromRoot = relative(root, absolute);
    if (
      fromRoot === '' ||
      fromRoot === '..' ||
      fromRoot.startsWith(`..${sep}`) ||
      resolve(fromRoot) === fromRoot
    ) {
      throw new Error(
        `${toPosix(path)} is outside the project (${root}); add writes only inside it.`
      );
    }
    return absolute;
  };
  return {
    kit,
    root,
    workingDirectory,
    settingsPath,
    settings: read?.settings,
    settingsWarnings: read?.warnings ?? [],
    ledger: new Ledger(root, kit.consumerStem),
    /** A root-relative path as the person running the command reads it. */
    display(path) {
      return toPosix(relative(workingDirectory, join(root, path))) || '.';
    },
    /** A path typed on the command line, relative to the root. */
    fromCommandLine(path) {
      return toPosix(relative(root, resolve(workingDirectory, path)));
    },
    /**
     * Checks that a root-relative path stays inside the root; every path
     * the commands read, write or remove passes through it.
     */
    checkInside(path) {
      inside(path);
    },
    /** Whether a root-relative path is a file. */
    isFile(path) {
      const absolute = inside(path);
      return existsSync(absolute) && statSync(absolute).isFile();
    },
    /** A root-relative file's bytes, or undefined when it does not exist. */
    readFile(path) {
      const absolute = inside(path);
      return existsSync(absolute) && statSync(absolute).isFile()
        ? readFileSync(absolute)
        : undefined;
    },
    /**
     * Whether a root-relative path is a symbolic link. The commands never
     * write over one: a write replaces the file, which would turn the link
     * into a file and leave its target as it was.
     */
    isSymbolicLink(path) {
      return isSymbolicLink(inside(path));
    },
    writeFile(path, content) {
      const absolute = inside(path);
      if (isSymbolicLink(absolute)) {
        throw new Error(
          `${toPosix(path)} is a symbolic link; add writes only regular files.`
        );
      }
      writeFileAtomically(absolute, content);
    },
    removeFile(path) {
      rmSync(inside(path), { force: true });
    },
  };
}

/** Whether an absolute path is a symbolic link, dangling or not. */
function isSymbolicLink(absolute) {
  try {
    return lstatSync(absolute).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * A ledger entry for a file as written.
 *
 * @param {object} file - The planned file.
 * @param {import('./kit.mjs').Kit} kit
 * @param {object} settings - The settings it was written with.
 * @param {Buffer | string} content - What was written.
 */
export function entryFor(file, kit, settings, content) {
  const owner =
    file.components !== undefined
      ? { components: [...file.components].sort() }
      : file.component !== undefined
        ? { component: file.component }
        : { layer: file.layer };
  return {
    ...owner,
    piece: file.piece,
    source: file.source,
    ...sourceHashOf(kit, file.source),
    kit: kit.version,
    add: addVersion,
    hash: hashOf(content),
    settings,
  };
}

/**
 * The hash of the kit file a copy came from, so `status` can tell a
 * changed kit file from a change elsewhere.
 */
function sourceHashOf(kit, source) {
  try {
    return { sourceHash: hashOf(kit.read(source)) };
  } catch {
    return {};
  }
}

/** Two contents, string or bytes, compared byte for byte in their LF form. */
export function sameContent(first, second) {
  return normalizeLineEndings(first).equals(normalizeLineEndings(second));
}

export function toPosix(path) {
  return path.split(sep).join('/');
}
