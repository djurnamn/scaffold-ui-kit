#!/usr/bin/env node
/**
 * Consumer CLI shipped with every kit built by scaffold-ui-kit.
 *
 * `npx <kit-name> add` copies built component files from the kit's
 * published `dist/<target>/` into the consumer's project, together with
 * everything they import: sibling modules and stylesheets by relative path,
 * and the shared layers the kit declares under `add.shared` in its
 * configuration (a scripts module, a styles directory). Imports of a shared
 * layer's package specifier are rewritten to point at the copy, so the
 * copied files depend on nothing the consumer does not own. It has no
 * dependencies: component selection, target selection, and conflict
 * prompts run on Node built-ins alone.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, posix, relative } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const defaultOutputDirectory = join('src', 'components', 'ui');

/** File extensions that name a component (as opposed to a stylesheet). */
const componentFileExtensions = ['.tsx', '.vue', '.svelte', '.html'];

/** Files whose imports are read, rewritten, and reported. */
const codeFileExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.vue', '.svelte'];

/** Files whose `@use`/`@forward`/`@import` are read. */
const stylesheetFileExtensions = ['.scss', '.sass', '.css'];

/**
 * Extensions tried, in order, when a relative import names no existing file.
 */
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

main().catch((error) => {
  console.error(`error: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});

async function main() {
  const kit = readKitJson('package.json');
  const configuration = readKitJson('scaffold-ui-kit.config.json');
  const targets = configuration.targets;
  const sharedLayers = (configuration.add?.shared ?? []).map(normalizeSharedLayer);
  const notes = configuration.add?.notes ?? [];

  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      target: { type: 'string' },
      'output-directory': { type: 'string', short: 'o' },
      list: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help || positionals[0] !== 'add') {
    printUsage(kit.name, targets);
    if (!values.help && positionals.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  if (values.list) {
    for (const target of targets) {
      console.log(`${target}: ${publicComponentsFor(target).join(', ') || '(not built)'}`);
    }
    return;
  }

  const target = values.target ?? (await chooseFrom('Which target?', targets));
  if (!targets.includes(target)) {
    throw new Error(
      `Unknown target '${target}'. This kit is built for ${targets.join(', ')}.`
    );
  }

  const available = modulesFor(target);
  if (available.length === 0) {
    throw new Error(
      `No built components for '${target}'. The kit was published without dist/${target} output.`
    );
  }

  let requested = positionals.slice(1);
  if (requested.length === 0) {
    requested = [await chooseFrom('Which component?', publicComponentsFor(target))];
  }

  const components = requested.map((request) => {
    const match = available.find(
      (component) => component.toLowerCase() === request.toLowerCase()
    );
    if (match === undefined) {
      throw new Error(
        `Unknown component '${request}'. Available for ${target}: ${publicComponentsFor(target).join(', ')}.`
      );
    }
    return match;
  });

  const outputDirectory = values['output-directory'] ?? defaultOutputDirectory;
  mkdirSync(outputDirectory, { recursive: true });

  const distDirectory = join(packageRoot, 'dist', target);
  const { files, unresolved } = collectComponentFiles(distDirectory, components);
  for (const { file, specifier } of unresolved) {
    console.error(
      `warning: ${file} imports '${specifier}', which is not in dist/${target}; copied as it is`
    );
  }

  const copiedCodeFiles = [];
  let skipped = false;
  for (const { file, requested } of files) {
    const sourcePath = join(distDirectory, file);
    const targetPath = join(outputDirectory, file);
    if (existsSync(targetPath)) {
      // A file pulled in as a dependency of a requested component belongs to
      // the consumer once it is there - a second component composing the
      // same Visual finds it present and leaves it alone. A file the consumer
      // asked for by name is the one conflict worth a prompt.
      if (!requested) {
        console.log(`kept ${targetPath} (already present)`);
        continue;
      }
      if (!(await confirmOverwrite(targetPath))) {
        console.error(`skipped ${targetPath} (already exists)`);
        skipped = true;
        continue;
      }
    }
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(
      targetPath,
      rewriteSpecifiers(readFileSync(sourcePath, 'utf8'), targetPath, outputDirectory, sharedLayers)
    );
    console.log(`added ${targetPath}`);
    if (isCodeFile(file)) {
      copiedCodeFiles.push(targetPath);
    }
  }

  for (const layer of sharedLayers) {
    const sourcePath = join(packageRoot, layer.source);
    if (!existsSync(sourcePath)) {
      throw new Error(
        `Shared layer '${layer.source}' is not in the kit package. The kit's add.shared names a path its published files do not include.`
      );
    }
    const targetPath = join(outputDirectory, layer.destination);
    if (existsSync(targetPath)) {
      console.log(`kept ${targetPath} (already present)`);
      continue;
    }
    mkdirSync(dirname(targetPath), { recursive: true });
    cpSync(sourcePath, targetPath, {
      recursive: true,
      // `exclude` names paths inside the layer that belong to the package's
      // import-and-use face, not to a copy - an aggregate stylesheet, a
      // barrel - by their path relative to the layer's source.
      filter: (candidate) => !layer.exclude.includes(toPosix(relative(sourcePath, candidate))),
    });
    console.log(`added ${targetPath}`);
    copiedCodeFiles.push(...listCodeFiles(targetPath));
  }

  if (skipped) {
    process.exitCode = 1;
  }

  reportDependencies(copiedCodeFiles, kit, sharedLayers);

  if (notes.length > 0) {
    console.log('');
    for (const note of notes) {
      console.log(note);
    }
  }
}

function readKitJson(fileName) {
  const filePath = join(packageRoot, fileName);
  if (!existsSync(filePath)) {
    throw new Error(`Missing ${fileName} in the kit package`);
  }
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

/**
 * A shared layer with its defaults applied: the destination is the source's
 * base name unless the kit says otherwise.
 */
function normalizeSharedLayer(layer) {
  return {
    source: layer.source,
    destination: layer.destination ?? basename(layer.source),
    specifier: layer.specifier,
    exclude: (layer.exclude ?? []).map(toPosix),
  };
}

/** Every module built for a target, from its dist directory. */
function modulesFor(target) {
  const targetDirectory = join(packageRoot, 'dist', target);
  if (!existsSync(targetDirectory)) {
    return [];
  }
  return readdirSync(targetDirectory)
    .filter((file) => componentFileExtensions.includes(extname(file)))
    .map((file) => basename(file, extname(file)))
    .sort();
}

/**
 * The components a target offers: the names its barrel exports when the kit
 * ships one (the public surface, without the modules a component is composed
 * of), otherwise every module in the directory.
 */
function publicComponentsFor(target) {
  const barrelPath = join(packageRoot, 'dist', target, 'index.ts');
  if (!existsSync(barrelPath)) {
    return modulesFor(target);
  }
  const names = new Set();
  const barrel = readFileSync(barrelPath, 'utf8');
  for (const match of barrel.matchAll(/from\s+['"]\.\/([^'"]+)['"]/g)) {
    names.add(basename(match[1], extname(match[1])));
  }
  const modules = modulesFor(target);
  const exported = modules.filter((module) => names.has(module));
  return exported.length > 0 ? exported : modules;
}

/**
 * The files to copy for a set of components: each component's own files
 * (its module plus any stylesheet of the same name, marked `requested`) and,
 * transitively, everything they import by relative path from the same dist
 * directory.
 *
 * @returns The dist-relative files in copy order, each with whether it was
 *   asked for by name, and the relative imports that resolve to nothing in
 *   dist.
 */
function collectComponentFiles(distDirectory, components) {
  const files = [];
  const seen = new Set();
  const unresolved = [];
  const queue = [];

  const enqueue = (file, requested) => {
    if (!seen.has(file)) {
      seen.add(file);
      queue.push({ file, requested });
    }
  };

  for (const component of components) {
    for (const file of ownFilesOf(distDirectory, component)) {
      enqueue(file, true);
    }
  }

  while (queue.length > 0) {
    const entry = queue.shift();
    files.push(entry);
    for (const specifier of relativeImportsOf(join(distDirectory, entry.file))) {
      const resolved = resolveRelativeImport(distDirectory, entry.file, specifier);
      if (resolved === undefined) {
        unresolved.push({ file: entry.file, specifier });
      } else {
        enqueue(resolved, false);
      }
    }
  }

  return { files, unresolved };
}

/** A component's own built files: its module plus stylesheets of the same name. */
function ownFilesOf(distDirectory, component) {
  return readdirSync(distDirectory).filter(
    (file) => basename(file, extname(file)) === component && file !== 'index.ts'
  );
}

/** The relative specifiers a built file imports. */
function relativeImportsOf(filePath) {
  return importSpecifiersOf(filePath).filter((specifier) =>
    /^\.\.?\//.test(specifier)
  );
}

/**
 * Every module specifier a built file imports: `import`/`export ... from`
 * statements, side-effect imports, dynamic imports, and a stylesheet's
 * `@use`, `@forward` and `@import`. Statements are matched at line start,
 * so a `from '...'` inside a comment, a string or a type (`'from' | 'to'`)
 * is not an import.
 */
function importSpecifiersOf(filePath) {
  const extension = extname(filePath);
  const content = readFileSync(filePath, 'utf8');
  const specifiers = [];
  if (isCodeFile(filePath)) {
    const patterns = [
      /^[ \t]*import\s+[^;'"]*?\bfrom\s*(['"])([^'"]+)\1/gm,
      /^[ \t]*export\s+(?:\*|type\s+\*|\{[^}]*\}|type\s+\{[^}]*\})\s*(?:as\s+\w+\s+)?from\s*(['"])([^'"]+)\1/gm,
      /^[ \t]*import\s*(['"])([^'"]+)\1/gm,
      /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
    ];
    for (const pattern of patterns) {
      for (const match of content.matchAll(pattern)) {
        specifiers.push(match[2]);
      }
    }
  } else if (stylesheetFileExtensions.includes(extension)) {
    for (const match of content.matchAll(
      /^[ \t]*@(?:use|forward|import)\s+(['"])([^'"]+)\1/gm
    )) {
      specifiers.push(match[2]);
    }
  }
  return specifiers;
}

/**
 * Resolves a relative import from a dist file to a dist-relative path:
 * the exact path, then the module extensions, then an `index` module and a
 * sass partial. A `.js` import names a TypeScript source next to it.
 */
function resolveRelativeImport(distDirectory, fromFile, specifier) {
  const base = posix.normalize(posix.join(posix.dirname(toPosix(fromFile)), specifier));
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
  candidates.push(posix.join(posix.dirname(base), `_${posix.basename(base)}.scss`));

  return candidates.find((candidate) => {
    const candidatePath = join(distDirectory, candidate);
    return existsSync(candidatePath) && statSync(candidatePath).isFile();
  });
}

/**
 * Rewrites imports of each shared layer's package specifier (and of any
 * path below it) in a copied code file to the relative path of the copy.
 */
function rewriteSpecifiers(content, filePath, outputDirectory, sharedLayers) {
  if (!isCodeFile(filePath)) {
    return content;
  }
  let rewritten = content;
  for (const layer of sharedLayers) {
    if (layer.specifier === undefined) {
      continue;
    }
    const target = relativeSpecifier(dirname(filePath), join(outputDirectory, layer.destination));
    const pattern = new RegExp(
      `(['"])${escapeRegExp(layer.specifier)}(\\/[^'"]*)?\\1`,
      'g'
    );
    rewritten = rewritten.replace(pattern, (_match, quote, subpath = '') =>
      `${quote}${target}${subpath}${quote}`
    );
  }
  return rewritten;
}

/** A relative module specifier from one directory to a path, `./`-prefixed. */
function relativeSpecifier(fromDirectory, toPath) {
  const specifier = toPosix(relative(fromDirectory, toPath));
  return specifier.startsWith('.') ? specifier : `./${specifier}`;
}

/**
 * Prints the packages the copied files import, with the kit's own version
 * ranges, leaving out what the consumer's package.json already lists. An
 * import of the kit's own package that no shared layer covers is a warning:
 * the copy would still depend on the package it was meant to replace.
 */
function reportDependencies(copiedCodeFiles, kit, sharedLayers) {
  const rewritten = sharedLayers
    .map((layer) => layer.specifier)
    .filter((specifier) => specifier !== undefined);
  const packages = new Map();
  const kitImports = new Set();

  for (const filePath of copiedCodeFiles) {
    for (const specifier of importSpecifiersOf(filePath)) {
      if (
        specifier.startsWith('.') ||
        specifier.startsWith('/') ||
        specifier.startsWith('node:') ||
        rewritten.some((prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`))
      ) {
        continue;
      }
      if (specifier === kit.name || specifier.startsWith(`${kit.name}/`)) {
        kitImports.add(specifier);
        continue;
      }
      const packageName = packageNameOf(specifier);
      if (!packages.has(packageName)) {
        packages.set(packageName, versionRangeOf(kit, packageName));
      }
    }
  }

  for (const specifier of [...kitImports].sort()) {
    console.error(
      `warning: the copied files import '${specifier}', which no add.shared entry covers; the copy still needs the ${kit.name} package for it`
    );
  }

  const installed = installedPackages();
  const missing = [...packages.entries()]
    .filter(([packageName]) => !installed.has(packageName))
    .sort(([a], [b]) => a.localeCompare(b));
  if (missing.length === 0) {
    return;
  }
  console.log('');
  console.log(
    installed.size > 0
      ? 'The copied files import packages not in your package.json:'
      : 'The copied files import these packages:'
  );
  console.log(
    `  npm install ${missing.map(([packageName, range]) => (range === undefined ? packageName : `${packageName}@${range}`)).join(' ')}`
  );
}

/** The package a bare specifier belongs to: `@scope/name` or `name`. */
function packageNameOf(specifier) {
  const segments = specifier.split('/');
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
}

/** The version range the kit itself declares for a package, if any. */
function versionRangeOf(kit, packageName) {
  for (const field of ['peerDependencies', 'dependencies', 'devDependencies']) {
    const range = kit[field]?.[packageName];
    if (typeof range === 'string' && !range.startsWith('workspace:')) {
      return range;
    }
  }
  return undefined;
}

/** The packages the consumer's package.json lists, if there is one. */
function installedPackages() {
  const packageJsonPath = join(process.cwd(), 'package.json');
  if (!existsSync(packageJsonPath)) {
    return new Set();
  }
  try {
    const consumer = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return new Set(
      ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].flatMap(
        (field) => Object.keys(consumer[field] ?? {})
      )
    );
  } catch {
    return new Set();
  }
}

/** Every code file under a path (the path itself when it is a file). */
function listCodeFiles(path) {
  if (statSync(path).isFile()) {
    return isCodeFile(path) ? [path] : [];
  }
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    listCodeFiles(join(path, entry.name))
  );
}

function isCodeFile(filePath) {
  return codeFileExtensions.includes(extname(filePath));
}

function toPosix(path) {
  return path.split('\\').join('/');
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function chooseFrom(message, choices) {
  const answer = await ask(
    `${message}\n${choices.map((choice, i) => `  ${i + 1}. ${choice}`).join('\n')}\n> `
  );
  const index = Number.parseInt(answer, 10);
  if (Number.isInteger(index) && index >= 1 && index <= choices.length) {
    return choices[index - 1];
  }
  if (choices.includes(answer.trim())) {
    return answer.trim();
  }
  throw new Error(`Invalid choice '${answer.trim()}'`);
}

async function confirmOverwrite(targetPath) {
  if (!process.stdin.isTTY) {
    return false;
  }
  const answer = await ask(`${targetPath} already exists. Overwrite? [y/N] `);
  return answer.trim().toLowerCase() === 'y';
}

async function ask(question) {
  if (!process.stdin.isTTY) {
    throw new Error(
      'Non-interactive run with missing choices. Pass the component names and --target.'
    );
  }
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await readline.question(question);
  } finally {
    readline.close();
  }
}

function printUsage(name, targets) {
  console.log(
    [
      `Usage: npx ${name} add [components...] [options]`,
      '',
      'Copies built component files into your project, with the modules and',
      'stylesheets they import and the shared layers the kit declares.',
      '',
      'Options:',
      `  --target <name>              target to copy from (${targets.join(', ')})`,
      `  -o, --output-directory <path>  destination (default ${defaultOutputDirectory})`,
      '  --list                       list the built components per target',
      '  -h, --help                   show this help',
    ].join('\n')
  );
}
