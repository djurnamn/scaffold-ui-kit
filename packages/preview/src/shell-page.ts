// The host page's start, as the shell's page module gives it: the module is
// loaded in Node, its `head` and `root` are worked out once, and the files
// they reference are given addresses the development server or the static
// build serves.

import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PreviewContext } from './context.js';
import type { ShellPage, ShellPageMarkup } from './shell.js';

/** The host page shipped with the preview, which a shell's page is written
 *  into. */
export const HOST_PAGE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../application/index.html'
);

/** A shell's page, worked out: what goes where in the host page. */
export interface ResolvedShellPage {
  /** Markup for the end of the page's `<head>`; empty with none. */
  head: string;
  /** Markup for the page's root element; empty with none. */
  root: string;
  /** The directories of the files the markup references, which the
   *  development server has to be allowed to serve. */
  assetDirectories: string[];
}

/** Where the page is going. */
export interface ShellPageTarget {
  /** The host page's absolute path. */
  hostPage: string;
  /** Whether the development server serves the page; the static build
   *  writes it otherwise. */
  serving: boolean;
}

/**
 * Load the shell's page module and work out its markup.
 *
 * @param context - The kit's preview context, for the page module and the
 *   importer that loads it.
 * @param target - Where the page is going.
 * @returns The page's markup and the directories its files are in, or
 *   `undefined` when the shell has no page.
 * @throws When the module's default export is not a shell page, a part of
 *   it is neither markup nor a function, a function gives something other
 *   than markup, `asset` is given a path that is not absolute, or the module
 *   cannot be loaded.
 */
export async function loadShellPage(
  context: Pick<PreviewContext, 'shellPageAbsolute' | 'importModule'>,
  target: ShellPageTarget
): Promise<ResolvedShellPage | undefined> {
  const modulePath = context.shellPageAbsolute;
  if (modulePath === undefined) return undefined;
  const fail = (problem: string): never => {
    throw new Error(`[preview] The shell page ${modulePath} ${problem}`);
  };
  let loaded: { default?: unknown } | null | undefined;
  try {
    loaded = (await context.importModule(modulePath)) as typeof loaded;
  } catch (error) {
    return fail(`could not be loaded: ${(error as Error).message}`);
  }
  const page = loaded?.default as ShellPage | undefined;
  if (typeof page !== 'object' || page === null || Array.isArray(page)) {
    return fail(
      'must default-export a shell page, as defineShellPage({ head, root }) gives.'
    );
  }
  const unknown = Object.keys(page).filter(
    (key) => key !== 'head' && key !== 'root'
  );
  if (unknown.length > 0) {
    return fail(
      `has the unknown key '${unknown[0]}'; a shell page takes head and root.`
    );
  }
  const assetDirectories = new Set<string>();
  const asset = (file: string): string => {
    if (typeof file !== 'string' || !isAbsolute(file)) {
      return fail(
        `called asset(${JSON.stringify(file)}); asset takes a file's absolute path.`
      );
    }
    assetDirectories.add(dirname(file));
    if (target.serving) {
      // The development server serves a file outside its root by its
      // absolute path. Each segment is encoded, so a `#`, a `?` or a space
      // in a directory's name stays part of the path; a drive's colon is
      // kept. An `@` or a `+`, as a package manager's store has in its
      // directory names, is left as it is: the server reads neither back
      // from its encoded form.
      const segments = resolve(file)
        .split(sep)
        .map((segment, index) =>
          index === 0 && /^[A-Za-z]:$/.test(segment)
            ? segment
            : encodeURI(segment).replace(/#/g, '%23').replace(/\?/g, '%3F')
        );
      const path = segments.join('/');
      return `/@fs${path.startsWith('/') ? '' : '/'}${path}`;
    }
    // The build takes the file relative to the page.
    const fromPage = relative(dirname(target.hostPage), file);
    if (isAbsolute(fromPage)) {
      return fail(
        `called asset(${JSON.stringify(file)}), a file on another drive than the preview, which the static build cannot reach.`
      );
    }
    return fromPage.split(sep).join('/');
  };
  const markup = async (
    name: 'head' | 'root',
    part: ShellPageMarkup | undefined
  ): Promise<string> => {
    if (part === undefined) return '';
    if (typeof part !== 'string' && typeof part !== 'function') {
      return fail(`has a '${name}' that is neither markup nor a function.`);
    }
    const given = typeof part === 'function' ? await part({ asset }) : part;
    if (typeof given !== 'string') {
      return fail(`has a '${name}' function that gave no markup.`);
    }
    return given.trim();
  };
  return {
    head: await markup('head', page.head),
    root: await markup('root', page.root),
    assetDirectories: [...assetDirectories],
  };
}
