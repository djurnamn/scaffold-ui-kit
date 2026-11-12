/**
 * Reading and rewriting the specifiers a file imports: module imports in
 * code, and `@use`/`@forward`/`@import` and relative `url(...)` references
 * in stylesheets and in the style blocks of a Vue or Svelte component.
 */
import { extname, posix } from 'node:path';

/** Files whose module imports are read and rewritten. */
export const codeFileExtensions = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
];

/** Files whose Sass and CSS rules are read and rewritten. */
export const styleFileExtensions = [
  '.scss',
  '.sass',
  '.css',
  '.vue',
  '.svelte',
];

/** Extensions tried, in order, when a relative module import names no file. */
const moduleExtensions = [
  '.tsx',
  '.ts',
  '.vue',
  '.svelte',
  '.jsx',
  '.js',
  '.mjs',
];

/** Extensions tried, in order, when a stylesheet rule names no file. */
const stylesheetExtensions = ['.scss', '.sass', '.css'];

/**
 * Module statements, matched at line start so a `from '...'` inside a
 * comment, a string or a type (`'from' | 'to'`) is not an import.
 */
const codePatterns = [
  /^[ \t]*import\s+[^;'"]*?\bfrom\s*(['"])([^'"]+)\1/gm,
  /^[ \t]*export\s+(?:\*|type\s+\*|\{[^}]*\}|type\s+\{[^}]*\})\s*(?:as\s+\w+\s+)?from\s*(['"])([^'"]+)\1/gm,
  /^[ \t]*import\s*(['"])([^'"]+)\1/gm,
  /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
];

/** Sass and CSS rules that load another stylesheet. */
const stylePatterns = [/^[ \t]*@(?:use|forward|import)\s+(['"])([^'"]+)\1/gm];

/** Whether a file's module imports are read. */
export function isCodeFile(path) {
  return codeFileExtensions.includes(extname(path));
}

/** Whether a file's stylesheet rules are read. */
export function isStyleFile(path) {
  return styleFileExtensions.includes(extname(path));
}

/**
 * Every specifier a file's text imports, each with where it stands and
 * whether a module statement or a stylesheet rule imports it, in order.
 * Overlapping matches count once.
 *
 * @param {string} content - The file's text.
 * @param {string} path - The file's path, for its extension.
 * @returns {Array<{ start: number, end: number, specifier: string, kind: 'code' | 'style' | 'url' }>}
 *   `start` and `end` bound the specifier itself, without its quotes; a
 *   `url` is a stylesheet's relative `url(...)` reference, its query and
 *   fragment left out.
 */
export function findSpecifiers(content, path) {
  const found = [];
  const collect = (patterns, kind) => {
    for (const pattern of patterns) {
      for (const match of content.matchAll(pattern)) {
        const [whole, quote, specifier] = match;
        const offset = whole.lastIndexOf(`${quote}${specifier}${quote}`);
        const start = (match.index ?? 0) + offset + 1;
        found.push({ start, end: start + specifier.length, specifier, kind });
      }
    }
  };
  if (isCodeFile(path)) collect(codePatterns, 'code');
  if (isStyleFile(path)) {
    collect(stylePatterns, 'style');
    for (const match of content.matchAll(
      /\burl\(\s*(['"]?)([^'")\s]+)\1\s*\)/g
    )) {
      const [whole, quote, value] = match;
      const reference = value.replace(/[?#].*$/, '');
      if (
        reference === '' ||
        /^[a-z][a-z0-9+.-]*:/i.test(value) ||
        /^[/#]/.test(value)
      ) {
        continue;
      }
      const start =
        (match.index ?? 0) + whole.indexOf(`${quote}${value}`) + quote.length;
      found.push({
        start,
        end: start + reference.length,
        specifier: reference,
        kind: 'url',
      });
    }
  }
  found.sort((first, second) => first.start - second.start);
  return found.filter(
    (entry, index) => index === 0 || entry.start >= found[index - 1].end
  );
}

/**
 * A file's text with each specifier the replacer returns a new value for
 * replaced, in one pass, so a rewritten specifier is never read again.
 *
 * @param {string} content - The file's text.
 * @param {string} path - The file's path, for its extension.
 * @param {(specifier: string, kind: 'code' | 'style' | 'url') => string | undefined} replace
 * @returns {string}
 */
export function replaceSpecifiers(content, path, replace) {
  let result = '';
  let position = 0;
  for (const { start, end, specifier, kind } of findSpecifiers(content, path)) {
    const replacement = replace(specifier, kind);
    if (replacement === undefined || replacement === specifier) continue;
    result += content.slice(position, start) + replacement;
    position = end;
  }
  return result + content.slice(position);
}

/** Whether a specifier is relative: `./` or `../`. */
export function isRelative(specifier) {
  return /^\.\.?\//.test(specifier);
}

/**
 * The paths a relative module import may name, in the order a bundler
 * tries them: the exact path, a `.js` import's TypeScript source, the
 * module extensions, then an `index` module.
 *
 * @param {string} base - The imported path, joined and normalized.
 * @returns {string[]}
 */
export function moduleCandidates(base) {
  const candidates = [base];
  if (base.endsWith('.js')) {
    candidates.push(`${base.slice(0, -3)}.ts`, `${base.slice(0, -3)}.tsx`);
  }
  for (const extension of moduleExtensions)
    candidates.push(`${base}${extension}`);
  for (const extension of moduleExtensions) {
    candidates.push(posix.join(base, `index${extension}`));
  }
  for (const extension of stylesheetExtensions)
    candidates.push(`${base}${extension}`);
  return candidates;
}

/**
 * The paths a Sass rule's URL may name, in the order Sass tries them: the
 * exact path, the extensions, a partial, then an index file.
 *
 * @param {string} base - The loaded path, joined and normalized.
 * @returns {string[]}
 */
export function stylesheetCandidates(base) {
  const directory = posix.dirname(base);
  const name = posix.basename(base);
  const candidates = [base];
  for (const extension of stylesheetExtensions) {
    candidates.push(`${base}${extension}`);
    candidates.push(posix.join(directory, `_${name}${extension}`));
  }
  for (const extension of stylesheetExtensions) {
    candidates.push(posix.join(base, `index${extension}`));
    candidates.push(posix.join(base, `_index${extension}`));
  }
  return candidates;
}

/**
 * A relative module specifier from one file to another, written the way
 * the original specifier was: without an extension when it had none (and
 * without the `index` file it reached through a directory), with a `.js`
 * extension for a TypeScript module it named by `.js`, and with the
 * target's own extension otherwise.
 *
 * @param {string} fromPath - The importing file.
 * @param {string} toPath - The imported file.
 * @param {string} original - The specifier as the kit wrote it.
 * @param {string} resolvedSource - The kit file the original named.
 * @returns {string}
 */
export function moduleSpecifier(fromPath, toPath, original, resolvedSource) {
  let target = toPath;
  const originalExtension = extname(original);
  const namedExtension =
    originalExtension !== '' &&
    (originalExtension === extname(resolvedSource) ||
      (originalExtension === '.js' &&
        ['.ts', '.tsx'].includes(extname(resolvedSource))));
  if (!namedExtension) {
    const withoutExtension = target.slice(
      0,
      target.length - extname(target).length
    );
    // A Vue or Svelte module is imported by its extension; an index module
    // by its directory, unless the specifier named the index itself.
    target = ['.vue', '.svelte'].includes(extname(target))
      ? target
      : posix.basename(withoutExtension) === 'index' &&
          !posix.basename(original).startsWith('index') &&
          posix.dirname(withoutExtension) !== posix.dirname(fromPath)
        ? posix.dirname(withoutExtension)
        : withoutExtension;
  } else if (
    originalExtension === '.js' &&
    ['.ts', '.tsx'].includes(extname(target))
  ) {
    target = `${target.slice(0, target.length - extname(target).length)}.js`;
  }
  return relativeSpecifier(fromPath, target);
}

/**
 * A Sass URL from one stylesheet to another: relative, without a partial's
 * underscore, its extension or an index file's name; a plain CSS file
 * keeps its extension.
 *
 * @param {string} fromPath - The loading stylesheet.
 * @param {string} toPath - The loaded stylesheet.
 * @returns {string}
 */
export function stylesheetSpecifier(fromPath, toPath) {
  if (extname(fromPath) === '.css') {
    return relativeSpecifier(fromPath, toPath);
  }
  let target = toPath.slice(0, toPath.length - extname(toPath).length);
  const name = posix.basename(target).replace(/^_/, '');
  target =
    name === 'index'
      ? posix.dirname(target)
      : posix.join(posix.dirname(target), name);
  return relativeSpecifier(fromPath, target);
}

/** A `./`- or `../`-led path from one file to another. */
export function relativeSpecifier(fromPath, toPath) {
  const specifier = posix.relative(posix.dirname(fromPath), toPath);
  return specifier.startsWith('.') ? specifier : `./${specifier}`;
}
