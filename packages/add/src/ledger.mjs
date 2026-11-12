/**
 * The ledger: the record of every file the consumer commands wrote into a
 * project, kept apart from the settings in `.<kit>/copies.json`, with each
 * file's content as written stored by hash in `.<kit>/bases/`, the merge
 * base `update` needs.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

/** The ledger format this package writes and reads. */
export const LEDGER_FORMAT = 1;

/** The ledger's path, relative to the consumer root, for a kit's stem. */
export function ledgerFileName(stem) {
  return `.${stem}/copies.json`;
}

/** The bases directory, relative to the consumer root, for a kit's stem. */
export function basesDirectoryName(stem) {
  return join(`.${stem}`, 'bases');
}

/**
 * A file's content with CRLF line endings turned to LF, as bytes; a file
 * holding a NUL byte is binary and returned as it is. Hashes and merges
 * read content this way, so a checkout that converts line endings is not
 * an edit.
 */
export function normalizeLineEndings(content) {
  const bytes = Buffer.from(content);
  if (bytes.includes(0) || !bytes.includes(13)) return bytes;
  return Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
}

/**
 * Text in the line endings an existing file uses: CRLF when it has any,
 * LF otherwise.
 *
 * @param {Buffer | string} content - LF text, or bytes left alone.
 * @param {Buffer | undefined} existing - The file it replaces.
 */
export function inLineEndingsOf(content, existing) {
  const bytes = Buffer.from(content);
  if (
    existing === undefined ||
    bytes.includes(0) ||
    !existing.includes('\r\n')
  ) {
    return bytes;
  }
  return Buffer.from(bytes.toString('utf8').replace(/\r?\n/g, '\r\n'));
}

/** A file's content hash, as the ledger records it: `sha256-<hex>` of its LF form. */
export function hashOf(content) {
  return `sha256-${createHash('sha256').update(normalizeLineEndings(content)).digest('hex')}`;
}

/** The order the ledger lists paths and settings in: by code point. */
function byCodePoint([first], [second]) {
  return first < second ? -1 : first > second ? 1 : 0;
}

/** A short, stable id for a settings object: its hash's first 8 hex digits. */
function settingsId(settings) {
  return createHash('sha256')
    .update(canonicalJson(settings))
    .digest('hex')
    .slice(0, 8);
}

/** JSON with object keys sorted, so equal settings give one id. */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Writes a file through a temporary sibling and a rename, so an
 * interrupted run leaves either the old file or the new one.
 */
export function writeFileAtomically(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, path);
}

/** The pieces a ledger entry can be. */
const PIECES = ['component', 'stylesheet', 're-export', 'helper', 'shared'];

/** A content hash as the ledger records it. */
const HASH_PATTERN = /^sha256-[0-9a-f]{64}$/;

/**
 * The problems that make a parsed ledger unusable: the shape the commands
 * write, every entry naming settings its table holds.
 *
 * @param {unknown} ledger
 * @returns {string[]}
 */
function ledgerProblems(ledger) {
  const isObject = (value) =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  if (!isObject(ledger)) return ['the ledger must be an object'];
  const problems = [];
  if (!Number.isInteger(ledger.format) || ledger.format < 1) {
    problems.push(
      `'format' must be a whole number from 1, not ${JSON.stringify(ledger.format)}`
    );
  }
  const table = ledger.settings ?? {};
  if (!isObject(table)) {
    problems.push("'settings' must be an object of ids to settings");
  } else {
    for (const [id, settings] of Object.entries(table)) {
      if (!isObject(settings)) {
        problems.push(`'settings.${id}' must be an object`);
      }
    }
  }
  const files = ledger.files ?? {};
  if (!isObject(files)) {
    problems.push("'files' must be an object of paths to entries");
    return problems;
  }
  for (const [path, entry] of Object.entries(files)) {
    const label = `'files.${path}'`;
    if (!isObject(entry)) {
      problems.push(`${label} must be an object, not ${JSON.stringify(entry)}`);
      continue;
    }
    if (!PIECES.includes(entry.piece)) {
      problems.push(
        `${label} has 'piece' ${JSON.stringify(entry.piece)}; a piece is one of ${PIECES.join(', ')}`
      );
    }
    if (typeof entry.source !== 'string' || entry.source === '') {
      problems.push(`${label} must have a non-empty string 'source'`);
    }
    for (const key of ['component', 'layer', 'kit', 'add']) {
      if (entry[key] !== undefined && typeof entry[key] !== 'string') {
        problems.push(`${label} must have a string '${key}' when it has one`);
      }
    }
    if (
      entry.components !== undefined &&
      (!Array.isArray(entry.components) ||
        entry.components.some((owner) => typeof owner !== 'string'))
    ) {
      problems.push(`${label} must have a list of strings as 'components'`);
    }
    if (
      entry.component === undefined &&
      entry.components === undefined &&
      entry.layer === undefined
    ) {
      problems.push(
        `${label} must name its 'component', 'components' or 'layer'`
      );
    }
    if (typeof entry.hash !== 'string' || !HASH_PATTERN.test(entry.hash)) {
      problems.push(
        `${label} must have a 'hash' of the form sha256-<64 hex digits>`
      );
    }
    for (const key of ['sourceHash', 'merging']) {
      if (
        entry[key] !== undefined &&
        (typeof entry[key] !== 'string' || !HASH_PATTERN.test(entry[key]))
      ) {
        problems.push(
          `${label} must have a '${key}' of the form sha256-<64 hex digits> when it has one`
        );
      }
    }
    if (typeof entry.settings !== 'string') {
      problems.push(
        `${label} must name its settings by their id in the 'settings' table`
      );
    } else if (isObject(table) && !Object.hasOwn(table, entry.settings)) {
      problems.push(
        `${label} names settings '${entry.settings}', which the 'settings' table does not hold`
      );
    }
  }
  return problems;
}

/** A consumer project's ledger and stored bases for one kit. */
export class Ledger {
  /**
   * @param {string} consumerRoot
   * @param {string} stem - The kit's settings file name without `.json`.
   */
  constructor(consumerRoot, stem) {
    this.root = consumerRoot;
    this.path = join(consumerRoot, ledgerFileName(stem));
    this.basesDirectory = join(consumerRoot, basesDirectoryName(stem));
    this.files = {};
    if (existsSync(this.path)) {
      let ledger;
      try {
        ledger = JSON.parse(readFileSync(this.path, 'utf8'));
      } catch (error) {
        throw new Error(
          `${ledgerFileName(stem)} is not valid JSON: ${error.message}`
        );
      }
      if (typeof ledger?.format === 'number' && ledger.format > LEDGER_FORMAT) {
        throw new Error(
          `${ledgerFileName(stem)} is format ${ledger.format}, newer than this @scaffold-ui-kit/add reads (${LEDGER_FORMAT}); it was written by a newer @scaffold-ui-kit/add. Update the kit's dependency on it.`
        );
      }
      const problems = ledgerProblems(ledger);
      if (problems.length > 0) {
        throw new Error(
          `${ledgerFileName(stem)} is not valid:\n${problems.map((problem) => `  - ${problem}`).join('\n')}\nThe commands write this file; restore it from version control, or finish the merge that left it so.`
        );
      }
      // In memory each entry holds its settings object; on disk the
      // settings sit once in a table and entries name them by id.
      const table = ledger.settings ?? {};
      this.files = Object.fromEntries(
        Object.entries(ledger.files ?? {}).map(([path, entry]) => [
          path,
          { ...entry, settings: table[entry.settings] },
        ])
      );
    }
  }

  /** Every entry, as `[path, entry]` pairs sorted by path. */
  entries() {
    return Object.entries(this.files).sort(byCodePoint);
  }

  /** The entry for a consumer path. */
  get(path) {
    return this.files[path];
  }

  /** Records an entry, and stores its base when the content matches its hash. */
  set(path, entry, content) {
    // A base is stored only under the hash of its own content.
    if (content !== undefined && hashOf(content) === entry.hash) {
      this.storeBase(entry.hash, content);
    }
    this.files[path] = entry;
  }

  /** Drops an entry. */
  delete(path) {
    delete this.files[path];
  }

  /** A stored base's content, or undefined when it is missing. */
  base(hash) {
    const path = join(this.basesDirectory, hash.replace(/^sha256-/, ''));
    return existsSync(path) ? readFileSync(path) : undefined;
  }

  /** Stores a base by its hash, in its LF form. */
  storeBase(hash, content) {
    const path = join(this.basesDirectory, hash.replace(/^sha256-/, ''));
    if (!existsSync(path)) {
      writeFileAtomically(path, normalizeLineEndings(content));
    }
  }

  /**
   * Writes the ledger, then removes every base no entry names, as its
   * hash or as the kit version a conflicted file is being merged with.
   */
  save() {
    const table = {};
    const files = {};
    for (const [path, entry] of this.entries()) {
      const id = settingsId(entry.settings ?? {});
      table[id] = entry.settings ?? {};
      files[path] = { ...entry, settings: id };
    }
    const settings = Object.fromEntries(
      Object.entries(table).sort(byCodePoint)
    );
    writeFileAtomically(
      this.path,
      `${JSON.stringify({ format: LEDGER_FORMAT, settings, files }, null, 2)}\n`
    );
    if (!existsSync(this.basesDirectory)) return;
    const named = new Set(
      Object.values(this.files)
        .flatMap((entry) => [entry.hash, entry.merging])
        .filter((hash) => hash !== undefined)
        .map((hash) => hash.replace(/^sha256-/, ''))
    );
    for (const item of readdirSync(this.basesDirectory, {
      withFileTypes: true,
    })) {
      // A temporary file is another run's write in progress; anything but
      // a file is not the commands' to remove.
      const { name } = item;
      if (!item.isFile() || named.has(name) || name.endsWith('.tmp')) continue;
      rmSync(join(this.basesDirectory, name), { force: true });
    }
  }
}
