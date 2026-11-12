import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, posix, relative } from 'node:path';

import * as sass from 'sass';

import type { TargetName } from './configuration';

/** The scripted targets, react, vue and svelte, whose components are modules a consumer imports. */
export type ScriptedTargetName = Exclude<TargetName, 'html'>;

/** The directory, inside `dist/<target>/`, the linked modules are written to. */
export const LINKED_DIRECTORY = 'linked';

/** The directory, inside `dist/<target>/`, the unlinked barrel is written to. */
export const UNLINKED_DIRECTORY = 'unlinked';

/** Files whose imports are followed when collecting a module's closure. */
const codeFileExtensions = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.vue',
  '.svelte',
];

/** Extensions tried, in order, when a relative import names no existing file. */
const resolvableExtensions = [
  '.tsx',
  '.ts',
  '.vue',
  '.svelte',
  '.jsx',
  '.js',
  '.mjs',
  '.scss',
  '.sass',
  '.css',
];

/** One target's emitted stylesheets, for {@link compileLinkedStylesheets}. */
export interface TargetStylesheets {
  /** The target. */
  target: TargetName;
  /** The target's build directory, `dist/<target>/`. */
  targetDirectory: string;
  /**
   * The directory of the files that link the stylesheets, which the link
   * specifiers are relative to; defaults to the target's `linked/`
   * directory. The html target's pages link from the target directory.
   */
  linkDirectory?: string;
  /**
   * The directory a compiled stylesheet that differs from the other
   * targets' is written to; defaults to the target's `linked/`
   * directory.
   */
  differingDirectory?: string;
  /**
   * The stylesheets the build emitted, relative to the target directory.
   * Each belongs to the module of the same name beside it.
   */
  stylesheets: string[];
  /**
   * Where each emitted stylesheet was written, absolute, by its path in
   * {@link stylesheets}, for a build that writes them away from the
   * target's modules; a sheet not listed lies in the target directory.
   */
  sources?: ReadonlyMap<string, string>;
}

/** What {@link compileLinkedStylesheets} needs. */
export interface CompileLinkedStylesheetsInput {
  /** Every target whose stylesheets are linked compiled. */
  targets: TargetStylesheets[];
  /** Absolute sass load paths the emitted SCSS compiles against. */
  loadPaths: string[];
  /** Sass importers the emitted SCSS compiles with, beside the load paths. */
  importers?: NonNullable<sass.Options<'sync'>['importers']>;
  /**
   * The absolute directory a compiled stylesheet identical on every target
   * is written to once, for all the targets' linked modules to link.
   */
  sharedDirectory: string;
  /**
   * The specifier a linked module or page links a compiled stylesheet by, for a
   * build whose stylesheets live in another package: the bare specifier
   * that package publishes the file under, or `undefined` when none does,
   * which is reported as an error. Left out, a link is the relative path
   * from the linking file's directory.
   */
  linkSpecifier?: (path: string) => string | undefined;
  /**
   * The kit's layer order (`stylingLayer.order`), stated first in every
   * compiled stylesheet: a module the sheet loads may emit rules inside one
   * of the layers, and its output compiles ahead of the sheet's own.
   */
  layerOrder?: readonly string[];
}

/** What {@link compileLinkedStylesheets} wrote and what failed. */
export interface CompileLinkedStylesheetsResult {
  /**
   * Per target, each module's stylesheet as the specifier its linked
   * module imports it by, relative to the `linked/` directory, keyed by the
   * module's path without extension.
   */
  links: Map<TargetName, Map<string, string>>;
  /**
   * Per target, each module's stylesheet as CSS, absolute, keyed by the
   * module's path without extension: the compiled copy of an `.scss`
   * sheet, the sheet itself when it is `.css`.
   */
  compiledPaths: Map<TargetName, Map<string, string>>;
  /** Every file written, absolute. */
  writtenPaths: string[];
  /** Stylesheets that failed to compile, as `<path>: <message>` lines. */
  errors: string[];
  /**
   * The stylesheets, absolute, that a linked module or page links but no
   * `linkSpecifier` reaches; their links are left out.
   */
  unlinked: string[];
}

/**
 * States a layer order first in compiled CSS, ahead of every rule.
 *
 * Cascade layers are ordered by first declaration. A component stylesheet
 * states its layer order after its `@use` lines - Sass allows nothing before
 * them - so a loaded module that emits rules inside one of the layers would
 * declare that layer first and reverse the order. Every top-level statement
 * of exactly this order is removed and one is written at the start, after a
 * leading byte order mark or `@charset`. Other layer statements, and any
 * nested inside a block, stay where they are. CSS with no rules is returned
 * as it is.
 *
 * @param css - The compiled CSS.
 * @param order - The layer names, in cascade order.
 * @returns The CSS, starting with the order statement.
 *
 * @example
 * withLayerOrderFirst('@layer kit.b{a{x:y}}@layer kit.a, kit.b;', ['kit.a', 'kit.b']);
 * // '@layer kit.a, kit.b;@layer kit.b{a{x:y}}'
 */
export function withLayerOrderFirst(
  css: string,
  order: readonly string[]
): string {
  let prefix = '';
  let body = css;
  if (body.startsWith('\uFEFF')) {
    prefix = '\uFEFF';
    body = body.slice(1);
  }
  const charset = /^@charset\s*(?:"[^"]*"|'[^']*')\s*;/.exec(body);
  if (charset !== null) {
    prefix += charset[0];
    body = body.slice(charset[0].length);
  }

  const kept: string[] = [];
  let depth = 0;
  let start = 0;
  let index = 0;
  while (index < body.length) {
    const character = body[index];
    if (character === '"' || character === "'") {
      index += 1;
      while (index < body.length && body[index] !== character) {
        index += body[index] === '\\' ? 2 : 1;
      }
    } else if (character === '/' && body[index + 1] === '*') {
      const end = body.indexOf('*/', index + 2);
      index = end === -1 ? body.length : end + 1;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        kept.push(body.slice(start, index + 1));
        start = index + 1;
      }
    } else if (character === ';' && depth === 0) {
      const segment = body.slice(start, index + 1);
      const statement = LAYER_ORDER_STATEMENT_PATTERN.exec(segment);
      kept.push(
        statement !== null && sameLayerNames(statement[2], order)
          ? statement[1]
          : segment
      );
      start = index + 1;
    }
    index += 1;
  }
  kept.push(body.slice(start));

  const rest = kept.join('').replace(/^\s+/, '');
  if (rest === '') {
    return css;
  }
  return `${prefix}@layer ${order.join(', ')};${rest}`;
}

/**
 * A top-level layer statement, with the comments and whitespace ahead of it
 * (kept) and its layer names.
 */
const LAYER_ORDER_STATEMENT_PATTERN =
  /^((?:\s|\/\*[\s\S]*?\*\/)*)@layer\s+([^;{}]+);$/;

/** Whether a statement's comma-separated layer names are exactly `order`. */
function sameLayerNames(names: string, order: readonly string[]): boolean {
  const listed = names.split(',').map((name) => name.trim());
  return (
    listed.length === order.length &&
    listed.every((name, position) => name === order[position])
  );
}

/**
 * Compiles each component's stylesheet to CSS, once across targets where it
 * can be: the sheets the linked modules import, and the ones a consumer who
 * owns a component but not its stylesheet imports from the package.
 *
 * An emitted `.scss` sheet is compiled with sass against the load paths, so
 * a linked module - or an html page - needs no sass to load it. When a sheet compiles
 * to the same CSS on every target that emitted it, it is written once to the
 * shared directory and every target links that copy; a sheet that differs
 * between targets - a kit may style a target on its own - is written to each
 * target's differing directory instead, its `linked/` directory unless the
 * target names another. An emitted `.css` sheet is linked
 * where it is, beside the component.
 *
 * @param input - The targets and their emitted stylesheets, the sass load
 *   paths, and the shared directory.
 * @returns The link specifiers per target, the files written, and any
 *   compile failures.
 */
export function compileLinkedStylesheets(
  input: CompileLinkedStylesheetsInput
): CompileLinkedStylesheetsResult {
  const writtenPaths: string[] = [];
  const errors: string[] = [];
  const links = new Map<TargetName, Map<string, string>>();
  const compiledPaths = new Map<TargetName, Map<string, string>>();
  const linkDirectoryOf = (entry: TargetStylesheets): string =>
    entry.linkDirectory ?? join(entry.targetDirectory, LINKED_DIRECTORY);
  const sourceOf = (entry: TargetStylesheets, stylesheet: string): string =>
    entry.sources?.get(stylesheet) ?? join(entry.targetDirectory, stylesheet);
  // The compiled sheets no `linkSpecifier` reaches, each once.
  const unlinkable = new Set<string>();
  const link = (
    entry: TargetStylesheets,
    moduleKey: string,
    path: string
  ): void => {
    if (input.linkSpecifier === undefined) {
      links
        .get(entry.target)!
        .set(moduleKey, relativeSpecifier(linkDirectoryOf(entry), path));
      return;
    }
    const specifier = input.linkSpecifier(path);
    if (specifier !== undefined) {
      links.get(entry.target)!.set(moduleKey, specifier);
    } else {
      unlinkable.add(path);
    }
  };

  // Each compiled sheet's CSS per target, keyed by its module.
  const compiled = new Map<string, Map<TargetName, string>>();
  for (const entry of input.targets) {
    const { target, stylesheets } = entry;
    links.set(target, new Map());
    compiledPaths.set(target, new Map());
    for (const stylesheet of stylesheets) {
      const moduleKey = withoutExtension(stylesheet);
      const sourcePath = sourceOf(entry, stylesheet);
      if (extname(stylesheet) === '.css') {
        compiledPaths.get(target)!.set(moduleKey, sourcePath);
        link(entry, moduleKey, sourcePath);
        continue;
      }
      try {
        const result = sass.compile(sourcePath, {
          loadPaths: input.loadPaths,
          importers: input.importers,
          style: 'compressed',
        });
        const css =
          input.layerOrder !== undefined && input.layerOrder.length > 0
            ? withLayerOrderFirst(result.css, input.layerOrder)
            : result.css;
        if (!compiled.has(moduleKey)) {
          compiled.set(moduleKey, new Map());
        }
        compiled.get(moduleKey)!.set(target, `${css}\n`);
      } catch (error) {
        errors.push(
          `${entry.sources?.has(stylesheet) ? toPosix(sourcePath) : `dist/${target}/${toPosix(stylesheet)}`}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  const writeSheet = (path: string, css: string): void => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, css);
    writtenPaths.push(path);
  };
  for (const [moduleKey, perTarget] of compiled) {
    const outputs = new Set(perTarget.values());
    if (outputs.size === 1) {
      const sharedPath = join(input.sharedDirectory, `${moduleKey}.css`);
      writeSheet(sharedPath, [...outputs][0]);
      for (const entry of input.targets) {
        if (perTarget.has(entry.target)) {
          compiledPaths.get(entry.target)!.set(moduleKey, sharedPath);
          link(entry, moduleKey, sharedPath);
        }
      }
      continue;
    }
    for (const entry of input.targets) {
      const css = perTarget.get(entry.target);
      if (css !== undefined) {
        const copyPath = join(
          entry.differingDirectory ??
            join(entry.targetDirectory, LINKED_DIRECTORY),
          `${moduleKey}.css`
        );
        writeSheet(copyPath, css);
        compiledPaths.get(entry.target)!.set(moduleKey, copyPath);
        link(entry, moduleKey, copyPath);
      }
    }
  }

  return {
    links,
    compiledPaths,
    writtenPaths,
    errors,
    unlinked: [...unlinkable],
  };
}

/** What {@link writeStylesheetLinks} needs to know about one built target. */
export interface StylesheetLinksInput {
  /** The scripted target the linked modules are written for. */
  target: ScriptedTargetName;
  /** The target's build directory, `dist/<target>/`. */
  targetDirectory: string;
  /**
   * The modules the target's barrel exports, relative to the target
   * directory - generated components and top-level drivers alike.
   */
  modules: string[];
  /**
   * Each module's stylesheet as the specifier a linked module imports it by, keyed
   * by the module's path without extension - the target's entry in
   * {@link compileLinkedStylesheets}'s links.
   */
  stylesheetLinks: Map<string, string>;
}

/** One module {@link writeStylesheetLinks} wrote: a component's linked export. */
export interface StylesheetLinkOutput {
  /** The exported module's name, e.g. `'Button'`. */
  name: string;
  /** The module, relative to the target directory. */
  path: string;
}

/** What {@link writeStylesheetLinks} wrote and what failed. */
export interface StylesheetLinksResult {
  /** The linked modules, in the order of the input modules. */
  linked: StylesheetLinkOutput[];
  /** Every file written, absolute. */
  writtenPaths: string[];
  /**
   * Modules with exports a linked module cannot bind, as
   * `<path>: warning: <message>` lines. A bundler that honors `sideEffects`
   * resolves such an export past the linked module, so using only it leaves
   * the linked module's stylesheets out.
   */
  warnings: string[];
}

/** One runtime value a module exports, which its linked module binds itself. */
interface RuntimeExport {
  /** The exported name. */
  name: string;
  /** Whether the export also names a type - a class or an enum. */
  declaresType: boolean;
}

/**
 * Writes the linked module of each exported module of a target whose
 * components were rendered unlinked: `linked/<Name>.ts`, which imports the
 * compiled stylesheet of every module the component renders and re-exports
 * the component unchanged, so the component code exists once.
 *
 * The linked module binds each runtime export in a declaration of its own
 * rather than passing it through. A bundler that honors `sideEffects`
 * resolves a pass-through re-export straight to the component module and
 * never includes the linked module, taking its stylesheet imports with it; a
 * binding the linked module declares is included exactly when the export is
 * used. Types still travel by `export *`.
 *
 * A linked module links the stylesheets of the module's whole relative-import
 * closure, dependencies first - the order a linked build loads them in,
 * where each component imports its dependencies ahead of its own sheet. A
 * component that composes another would otherwise render the composed one
 * unstyled, since the unlinked module it imports links nothing.
 *
 * The stylesheets come compiled from {@link compileLinkedStylesheets}.
 *
 * @param input - The target, its build directory, its exported modules, and
 *   the specifiers its stylesheets are linked by.
 * @returns The linked modules, the files written, and the exports a linked
 *   module could not bind.
 */
export function writeStylesheetLinks(
  input: StylesheetLinksInput
): StylesheetLinksResult {
  const { target, targetDirectory } = input;
  const linkedDirectory = join(targetDirectory, LINKED_DIRECTORY);
  const writtenPaths: string[] = [];
  const warnings: string[] = [];
  mkdirSync(linkedDirectory, { recursive: true });

  const linked: StylesheetLinkOutput[] = [];
  for (const modulePath of input.modules) {
    const name = basename(modulePath, extname(modulePath));
    const links = closureOf(targetDirectory, modulePath)
      .map((file) => input.stylesheetLinks.get(withoutExtension(file)))
      .filter((specifier): specifier is string => specifier !== undefined)
      .map((specifier) => `import '${specifier}';`);
    const scanned = runtimeExportsOf(targetDirectory, toPosix(modulePath));
    for (const specifier of scanned.unbound) {
      warnings.push(
        `${modulePath}: warning: re-exports '${specifier}' through 'export *', which its linked module cannot bind; using only those exports leaves the linked module's stylesheets out`
      );
    }
    const bindings = linkedBindings(target, name, modulePath, scanned.exports);
    const linkedPath = join(linkedDirectory, `${name}.ts`);
    writeFileSync(linkedPath, `${[...links, ...bindings].join('\n')}\n`);
    writtenPaths.push(linkedPath);
    linked.push({
      name,
      path: `${LINKED_DIRECTORY}/${name}.ts`,
    });
  }

  return { linked, writtenPaths, warnings };
}

/**
 * The lines of a linked module after its stylesheet links: the import of the
 * component module, the star re-export carrying its types, and a local
 * declaration for each runtime export - the default export on the SFC
 * targets, where the component is the module's default, and every named
 * runtime export.
 */
function linkedBindings(
  target: ScriptedTargetName,
  name: string,
  modulePath: string,
  runtimeExports: RuntimeExport[]
): string[] {
  const componentSpecifier = `../${moduleSpecifier(target, modulePath)}`;
  const taken = new Set(
    runtimeExports.map((runtimeExport) => runtimeExport.name)
  );
  const aliasOf = (base: string): string => {
    let alias = `${base}Export`;
    while (taken.has(alias)) {
      alias = `${alias}Export`;
    }
    taken.add(alias);
    return alias;
  };

  const defaultAlias = target === 'react' ? undefined : aliasOf(name);
  const named = runtimeExports.map((runtimeExport) => ({
    ...runtimeExport,
    alias: aliasOf(runtimeExport.name),
  }));

  const importClauses: string[] = [];
  if (defaultAlias !== undefined) {
    importClauses.push(defaultAlias);
  }
  if (named.length > 0) {
    importClauses.push(
      `{ ${named.map((binding) => `${binding.name} as ${binding.alias}`).join(', ')} }`
    );
  }

  const lines: string[] = [];
  if (importClauses.length > 0) {
    lines.push(
      `import ${importClauses.join(', ')} from '${componentSpecifier}';`
    );
  }
  lines.push(`export * from '${componentSpecifier}';`);
  if (defaultAlias !== undefined) {
    lines.push(`export default ${defaultAlias};`);
  }
  for (const binding of named) {
    lines.push(`export const ${binding.name} = ${binding.alias};`);
    if (binding.declaresType) {
      lines.push(`export type ${binding.name} = ${binding.alias};`);
    }
  }
  return lines;
}

/**
 * The named runtime exports of a built module, found by its top-level
 * `export` statements: declarations, export lists, and namespace
 * re-exports, following `export *` into modules beside it. Type-only
 * exports are left to the linked module's own `export *`. On the SFC targets only a
 * module-level script is read (a Svelte `module` script, a Vue `<script>`
 * without `setup`): the component itself is the default export, and a
 * Svelte instance script's `export let` declares a prop.
 *
 * @returns The exports, and the specifiers of `export *` re-exports that
 *   lead outside the target and cannot be enumerated.
 */
function runtimeExportsOf(
  targetDirectory: string,
  modulePath: string,
  visited: Set<string> = new Set()
): { exports: RuntimeExport[]; unbound: string[] } {
  const found = new Map<string, RuntimeExport>();
  const unbound: string[] = [];
  if (visited.has(modulePath)) {
    return { exports: [], unbound };
  }
  visited.add(modulePath);

  const add = (name: string, declaresType = false): void => {
    if (name !== 'default' && !found.has(name)) {
      found.set(name, { name, declaresType });
    }
  };
  const source = moduleScriptOf(
    modulePath,
    readFileSync(join(targetDirectory, modulePath), 'utf8')
  );
  const identifier = '([A-Za-z_$][\\w$]*)';

  for (const match of source.matchAll(
    new RegExp(
      `^export\\s+(?:async\\s+)?function\\b\\s*\\*?\\s*${identifier}`,
      'gm'
    )
  )) {
    add(match[1]);
  }
  for (const match of source.matchAll(
    new RegExp(`^export\\s+(?:const|let|var)\\s+(?!enum\\b)${identifier}`, 'gm')
  )) {
    add(match[1]);
  }
  for (const match of source.matchAll(
    new RegExp(`^export\\s+(?:abstract\\s+)?class\\s+${identifier}`, 'gm')
  )) {
    add(match[1], true);
  }
  for (const match of source.matchAll(
    new RegExp(`^export\\s+enum\\s+${identifier}`, 'gm')
  )) {
    add(match[1], true);
  }
  for (const match of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const member of match[1].split(',')) {
      const trimmed = member.trim();
      if (trimmed === '' || /^type\s/.test(trimmed)) {
        continue;
      }
      add(
        trimmed
          .split(/\s+as\s+/)
          .pop()!
          .trim()
      );
    }
  }
  for (const match of source.matchAll(
    new RegExp(`^export\\s*\\*\\s*as\\s+${identifier}\\s+from`, 'gm')
  )) {
    add(match[1]);
  }
  for (const match of source.matchAll(
    /^export\s*\*\s*from\s*(['"])([^'"]+)\1/gm
  )) {
    const specifier = match[2];
    const resolved = /^\.\.?\//.test(specifier)
      ? resolveRelativeImport(targetDirectory, modulePath, specifier)
      : undefined;
    if (resolved === undefined || !isCodeFile(resolved)) {
      unbound.push(specifier);
      continue;
    }
    const nested = runtimeExportsOf(targetDirectory, resolved, visited);
    for (const runtimeExport of nested.exports) {
      add(runtimeExport.name, runtimeExport.declaresType);
    }
    unbound.push(...nested.unbound);
  }

  return { exports: [...found.values()], unbound };
}

/**
 * The part of a built module whose `export` statements are the module's
 * own named exports: the whole file for a script module, the module-level
 * `<script>` blocks for an SFC.
 */
function moduleScriptOf(modulePath: string, content: string): string {
  const extension = extname(modulePath);
  if (extension !== '.svelte' && extension !== '.vue') {
    return content;
  }
  const blocks: string[] = [];
  for (const match of content.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/g
  )) {
    const attributes = match[1];
    const moduleLevel =
      extension === '.svelte'
        ? /\bcontext\s*=\s*["']module["']|(?:^|\s)module(?:\s|$)/.test(
            attributes
          )
        : !/(?:^|\s)setup(?:\s|=|$)/.test(attributes);
    if (moduleLevel) {
      blocks.push(match[2].replace(/^\n/, ''));
    }
  }
  return blocks.join('\n');
}

/**
 * The specifier a module is imported by, relative to its own directory and
 * without the `./`: extensionless for react, file-suffixed for the SFC
 * targets - the convention the generated components follow.
 *
 * @param target - The scripted target.
 * @param modulePath - The module, relative to the target directory.
 */
export function moduleSpecifier(
  target: ScriptedTargetName,
  modulePath: string
): string {
  return target === 'react' ? withoutExtension(modulePath) : modulePath;
}

/**
 * Every code module a module reaches through relative imports, the module
 * itself last and each dependency ahead of the modules importing it.
 */
function closureOf(targetDirectory: string, modulePath: string): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) {
      return;
    }
    seen.add(file);
    for (const specifier of relativeImportsOf(join(targetDirectory, file))) {
      const resolved = resolveRelativeImport(targetDirectory, file, specifier);
      if (resolved !== undefined && isCodeFile(resolved)) {
        visit(resolved);
      }
    }
    ordered.push(file);
  };
  visit(toPosix(modulePath));
  return ordered;
}

/**
 * The relative specifiers a built code file imports: `import`/`export ...
 * from` statements, side-effect imports and dynamic imports, matched at line
 * start so a `from '...'` inside a comment or string is not an import.
 */
function relativeImportsOf(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf8');
  const patterns = [
    /^[ \t]*import\s+[^;'"]*?\bfrom\s*(['"])([^'"]+)\1/gm,
    /^[ \t]*export\s+(?:\*|type\s+\*|\{[^}]*\}|type\s+\{[^}]*\})\s*(?:as\s+\w+\s+)?from\s*(['"])([^'"]+)\1/gm,
    /^[ \t]*import\s*(['"])([^'"]+)\1/gm,
    /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
  ];
  const specifiers: string[] = [];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      specifiers.push(match[2]);
    }
  }
  return specifiers.filter((specifier) => /^\.\.?\//.test(specifier));
}

/**
 * Resolves a relative import to a path relative to the target directory:
 * the exact path, then the module extensions, then an `index` module. A
 * `.js` import names a TypeScript source next to it. An import leaving the
 * target directory resolves to nothing.
 *
 * @param targetDirectory - The directory the paths are relative to.
 * @param fromFile - The importing file, relative to it, with `/`.
 * @param specifier - The relative specifier, as written.
 * @returns The imported file, relative to the target directory, or
 *   `undefined` when nothing there matches.
 */
export function resolveRelativeImport(
  targetDirectory: string,
  fromFile: string,
  specifier: string
): string | undefined {
  const base = posix.normalize(posix.join(posix.dirname(fromFile), specifier));
  if (base.startsWith('..')) {
    return undefined;
  }
  const candidates = [base];
  if (base.endsWith('.js')) {
    candidates.push(`${base.slice(0, -3)}.ts`, `${base.slice(0, -3)}.tsx`);
  }
  for (const extension of resolvableExtensions) {
    candidates.push(`${base}${extension}`);
  }
  for (const extension of resolvableExtensions) {
    candidates.push(posix.join(base, `index${extension}`));
  }
  return candidates.find((candidate) => {
    const candidatePath = join(targetDirectory, candidate);
    return existsSync(candidatePath) && statSync(candidatePath).isFile();
  });
}

/** A relative module specifier from a directory to a file, `./`-prefixed. */
function relativeSpecifier(fromDirectory: string, toPath: string): string {
  const specifier = toPosix(relative(fromDirectory, toPath));
  return specifier.startsWith('.') ? specifier : `./${specifier}`;
}

function isCodeFile(filePath: string): boolean {
  return codeFileExtensions.includes(extname(filePath));
}

function withoutExtension(filePath: string): string {
  const posixPath = toPosix(filePath);
  return posixPath.slice(0, posixPath.length - extname(posixPath).length);
}

function toPosix(path: string): string {
  return path.split('\\').join('/');
}
