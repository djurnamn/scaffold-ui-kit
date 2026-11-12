// The component styles the html pane shows its markup under: what the kit's
// build wrote for the html target, read from `dist/html` for the components a
// story renders. Under `in-file` each page carries its styles in `<style>`
// blocks; under `separate-file` each component has a stylesheet of its own,
// compiled when it is SCSS with the kit's own Sass and load paths. The markup
// is printed from the templates on request, so a component changed since the
// last build shows its last built styles until the kit builds again.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type { PreviewContext } from './context.js';
import type { HtmlSourceResponse } from './controller/html-source.js';
import type { HtmlSourceResult } from './emit/html-source.js';
import { summarizeHtmlWarnings } from './lib/html-warnings.js';
import { kitImporters, kitPackageDirectories } from './sass-importers.js';
import type { EnumeratedComponent } from './lib/types.js';

/** Where the kit's build writes the html target, relative to the kit root. */
export const HTML_DISTRIBUTION_DIRECTORY = 'dist/html';

const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;

/**
 * The `<style>` blocks of a page, joined in document order.
 *
 * @param page - A page's markup.
 * @returns The CSS its style blocks hold, or `''` when it has none.
 * @example
 * ```ts
 * styleBlocksOf('<style>.a { color: red; }</style><p class="a"></p>');
 * // '.a { color: red; }'
 * ```
 */
export function styleBlocksOf(page: string): string {
  return [...page.matchAll(STYLE_BLOCK)]
    .map((match) => match[1].trim())
    .filter((css) => css !== '')
    .join('\n');
}

/** A component name a built file can carry: an identifier, so it names a
 *  file in the html directory and nothing outside it. */
const BUILT_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Each compiled SCSS sheet, by path, with the modification time it was
 *  compiled at. */
const compiledSheets = new Map<string, { modified: number; css: string }>();

/** The sheets already reported as left out, each reported once. */
const reportedSheets = new Set<string>();

/** Compiles an SCSS file with the kit's own Sass, or says why it cannot.
 *  A sheet unchanged since it last compiled is not compiled again. */
function compileScss(
  path: string,
  context: PreviewContext
): { css: string } | { problem: string } {
  const modified = statSync(path).mtimeMs;
  const cached = compiledSheets.get(path);
  if (cached && cached.modified === modified) return { css: cached.css };
  let sass: {
    compile: (
      path: string,
      options: { loadPaths: string[]; importers: unknown[] }
    ) => { css: string };
    NodePackageImporter?: new (entryPointDirectory?: string) => unknown;
  };
  try {
    const kitRequire = createRequire(resolve(context.kitRoot, 'package.json'));
    sass = kitRequire('sass') as typeof sass;
  } catch {
    return { problem: 'the kit has no sass installed to compile it' };
  }
  try {
    const loadPaths = [
      dirname(path),
      ...context.sassLoadPathsAbsolute,
      ...(context.configuration.scssLoadPaths ?? []).map((loadPath) =>
        resolve(context.kitRoot, loadPath)
      ),
    ];
    // The kit's own `pkg:` URLs resolve through its package.json exports,
    // as its build resolves them, and any other through Sass's own importer.
    const importers: unknown[] = [
      ...kitImporters(context.kitRoot, kitPackageDirectories(context)),
      ...(sass.NodePackageImporter
        ? [new sass.NodePackageImporter(context.kitRoot)]
        : []),
    ];
    const css = sass.compile(path, { loadPaths, importers }).css;
    compiledSheets.set(path, { modified, css });
    return { css };
  } catch (error) {
    return { problem: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The CSS the kit's build wrote for the html target of each named
 * component, in the order given: the `<style>` blocks of its page and its
 * own stylesheet, when it has one. A component with no built output adds
 * nothing.
 *
 * @param context - The kit's preview context.
 * @param components - Every component of the kit.
 * @param names - The components whose styles to read, by name.
 * @returns The CSS, one comment-headed section per component, or `''`.
 */
export function htmlComponentStylesheet(
  context: PreviewContext,
  components: readonly EnumeratedComponent[],
  names: readonly string[]
): string {
  const directory = resolve(context.kitRoot, HTML_DISTRIBUTION_DIRECTORY);
  if (!existsSync(directory)) return '';
  const sections: string[] = [];
  for (const name of names) {
    if (!components.some((candidate) => candidate.name === name)) continue;
    if (!BUILT_NAME.test(name)) continue;
    const parts: string[] = [];
    const page = resolve(directory, `${name}.html`);
    if (existsSync(page)) parts.push(styleBlocksOf(readFileSync(page, 'utf8')));
    const css = resolve(directory, `${name}.css`);
    if (existsSync(css)) parts.push(readFileSync(css, 'utf8').trim());
    const scss = resolve(directory, `${name}.scss`);
    if (existsSync(scss)) {
      const compiled = compileScss(scss, context);
      if ('css' in compiled) parts.push(compiled.css.trim());
      else if (!reportedSheets.has(scss)) {
        reportedSheets.add(scss);
        console.warn(
          `[preview] ${name}: the html pane leaves out ${name}.scss, as ${compiled.problem}`
        );
      }
    }
    const styles = parts.filter((part) => part !== '').join('\n');
    if (styles !== '') sections.push(`/* ${name} */\n${styles}`);
  }
  return sections.join('\n\n');
}

/**
 * A printed story as the html pane receives it: its markup with the styles
 * of the components it renders and the warnings for what it leaves out,
 * those one component gives for one reason counted on a single line, or
 * what keeps it from having markup.
 *
 * @param context - The kit's preview context.
 * @param components - Every component of the kit.
 * @param result - The printed story.
 * @returns The response the development server answers and the static
 *   build stores.
 */
export function htmlSourceResponse(
  context: PreviewContext,
  components: readonly EnumeratedComponent[],
  result: HtmlSourceResult
): HtmlSourceResponse {
  if (result.markup === undefined) return { missing: result.missing };
  const stylesheet = htmlComponentStylesheet(
    context,
    components,
    result.components
  );
  return {
    markup: result.markup,
    ...(stylesheet === '' ? {} : { stylesheet }),
    ...(result.warnings.length === 0
      ? {}
      : { warnings: summarizeHtmlWarnings(result.warnings) }),
  };
}
