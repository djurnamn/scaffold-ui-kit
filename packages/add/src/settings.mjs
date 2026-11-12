/**
 * A consumer's settings for a kit, `<kit>.json` at the consumer's package
 * root: the target, where copies go (the layout), an import alias, and what
 * the consumer owns.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

/** The keys a settings file takes. */
const settingsKeys = ['target', 'layout', 'alias', 'own'];

/** The keys a layout takes. */
const layoutKeys = ['component', 'stylesheet', 'part', 'shared'];

/** The tokens a layout pattern takes. */
export const layoutTokens = [
  'name',
  'kebab-name',
  'component',
  'extension',
  'stylesheet-extension',
];

/** The pieces a consumer can own, besides `shared:<name>`. */
export const ownableKinds = ['component', 'stylesheet', 'shared'];

/** What a consumer owns when nothing says otherwise: everything. */
export const defaultOwn = ['component', 'stylesheet', 'shared'];

/** The directory the flat layout puts copies in. */
export const defaultDirectory = 'src/components/ui';

/** The layout presets `initialize` offers, by name. */
export const layoutPresets = ['flat', 'folder'];

/**
 * A layout preset: `flat` puts every copy in one directory, `folder` gives
 * each component a folder of its own, with its parts beside it. React's
 * folder module is `index.tsx`, so the folder is the import; Vue, Svelte
 * and html files keep the component's name.
 *
 * @param {'flat' | 'folder'} preset
 * @param {string} target
 * @param {object[]} sharedModules - The kit's shared modules.
 * @param {string} [directory] - The flat layout's directory.
 * @returns {object} The layout.
 */
export function presetLayout(
  preset,
  target,
  sharedModules,
  directory = defaultDirectory
) {
  const root = directory.replace(/\/+$/, '');
  if (preset === 'flat') {
    // The project root itself is a directory too: `-o .`.
    const prefix = root === '' || root === '.' ? '' : `${root}/`;
    return {
      component: `${prefix}{name}.{extension}`,
      stylesheet: `${prefix}{name}.{stylesheet-extension}`,
      part: `${prefix}{name}.{extension}`,
      shared: sharedDefaults(prefix.replace(/\/$/, '') || '.', sharedModules),
    };
  }
  const file = target === 'react' ? 'index' : '{name}';
  return {
    component: `src/components/{name}/${file}.{extension}`,
    stylesheet: `src/components/{name}/${file}.{stylesheet-extension}`,
    part: 'src/components/{component}/{name}.{extension}',
    shared: sharedDefaults('src/components', sharedModules),
  };
}

/** Which preset a layout is, or undefined for a custom one. */
export function presetOf(layout, target, sharedModules) {
  return layoutPresets.find((preset) => {
    const candidate = presetLayout(preset, target, sharedModules);
    return ['component', 'stylesheet', 'part'].every(
      (key) => candidate[key] === layout[key]
    );
  });
}

/** Each shared module placed in a directory under its source's base name. */
function sharedDefaults(directory, sharedModules) {
  return Object.fromEntries(
    sharedModules.map((sharedModule) => [
      sharedModule.name,
      posix.join(directory, posix.basename(sharedModule.source)),
    ])
  );
}

/**
 * Where a shared module goes when no layout key names it: under its source's
 * base name, in the directory the component pattern starts with.
 *
 * @param {string} componentPattern
 * @param {{ source: string }} sharedModule
 * @returns {string}
 */
export function sharedDefaultPath(componentPattern, sharedModule) {
  return posix.join(
    staticDirectoryOf(componentPattern),
    posix.basename(sharedModule.source)
  );
}

/**
 * The consumer's package root: the nearest directory holding a
 * `package.json`, from the working directory up, or the working directory
 * when there is none.
 *
 * @param {string} workingDirectory
 * @returns {string}
 */
export function findConsumerRoot(workingDirectory) {
  let directory = workingDirectory;
  for (;;) {
    if (existsSync(join(directory, 'package.json'))) return directory;
    const parent = dirname(directory);
    if (parent === directory) return workingDirectory;
    directory = parent;
  }
}

/**
 * Reads and validates a consumer's settings, or returns undefined when the
 * file does not exist.
 *
 * @param {string} path - The settings file.
 * @param {import('./kit.mjs').Kit} kit
 * @returns {{ settings: object, warnings: string[] } | undefined}
 * @throws With every problem found, when the settings are invalid.
 */
export function readSettings(path, kit) {
  if (!existsSync(path)) return undefined;
  let settings;
  try {
    settings = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(
      `${posix.basename(path)} is not valid JSON: ${error.message}`
    );
  }
  const { problems, warnings } = validateSettings(settings, kit);
  if (problems.length > 0) {
    throw new Error(
      `${posix.basename(path)} is not valid:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`
    );
  }
  return { settings, warnings };
}

/**
 * The problems that make settings unusable, and what is only worth a
 * warning: a shared module the kit does not have, which an older or newer
 * kit version may.
 *
 * @param {unknown} settings
 * @param {import('./kit.mjs').Kit} kit
 * @returns {{ problems: string[], warnings: string[] }}
 */
export function validateSettings(settings, kit) {
  const problems = [];
  const warnings = [];
  if (
    typeof settings !== 'object' ||
    settings === null ||
    Array.isArray(settings)
  ) {
    return { problems: ['the settings must be an object'], warnings };
  }
  for (const key of Object.keys(settings)) {
    if (!settingsKeys.includes(key)) {
      problems.push(
        `unknown key '${key}'; the settings take ${settingsKeys.join(', ')}`
      );
    }
  }
  // A kit built into packages shares the settings between them, each
  // package copying its own target.
  const targets = kit.manifest.targets ?? [];
  if (
    !kit.inPackages &&
    settings.target !== undefined &&
    !targets.includes(settings.target)
  ) {
    problems.push(`'target' must be one of ${targets.join(', ')}`);
  }
  const sharedModuleNames = (kit.manifest.shared ?? []).map(
    (sharedModule) => sharedModule.name
  );
  const { layout } = settings;
  if (layout !== undefined) {
    if (
      typeof layout !== 'object' ||
      layout === null ||
      Array.isArray(layout)
    ) {
      problems.push("'layout' must be an object");
    } else {
      for (const key of Object.keys(layout)) {
        if (!layoutKeys.includes(key)) {
          problems.push(
            `unknown key 'layout.${key}'; a layout takes ${layoutKeys.join(', ')}`
          );
        }
      }
      for (const key of ['component', 'stylesheet', 'part']) {
        if (layout[key] === undefined) continue;
        problems.push(...patternProblems(`layout.${key}`, layout[key], true));
        if (
          key !== 'stylesheet' &&
          typeof layout[key] === 'string' &&
          !layout[key].includes('{extension}')
        ) {
          problems.push(
            `'layout.${key}' must hold {extension}: a module's extension says what it is, and a stylesheet-only copy's module takes .ts there`
          );
        }
      }
      if (layout.shared !== undefined) {
        if (
          typeof layout.shared !== 'object' ||
          layout.shared === null ||
          Array.isArray(layout.shared)
        ) {
          problems.push(
            "'layout.shared' must be an object of shared module names to paths"
          );
        } else {
          for (const [name, path] of Object.entries(layout.shared)) {
            problems.push(
              ...patternProblems(`layout.shared.${name}`, path, false)
            );
            if (!sharedModuleNames.includes(name)) {
              warnings.push(
                `layout.shared names '${name}', which is not a shared module of ${kit.name}${sharedModuleNames.length > 0 ? ` (it has ${sharedModuleNames.join(', ')})` : ''}`
              );
            }
          }
        }
      }
    }
  }
  if (settings.alias !== undefined) {
    if (
      typeof settings.alias !== 'object' ||
      settings.alias === null ||
      Array.isArray(settings.alias)
    ) {
      problems.push(
        '\'alias\' must be an object of path prefixes to aliases, such as { "src/": "@/" }'
      );
    } else {
      for (const [prefix, alias] of Object.entries(settings.alias)) {
        if (typeof alias !== 'string' || alias === '') {
          problems.push(`'alias.${prefix}' must be a non-empty string`);
        }
        if (!prefix.endsWith('/')) {
          problems.push(
            `'alias' prefix '${prefix}' must end in '/', so it matches whole directories`
          );
        }
        if (prefix.includes('\\')) {
          problems.push(
            `'alias' prefix '${prefix}' separates directories with '/', not '\\', so it reads the same on every platform`
          );
        }
        if (prefix.startsWith('/') || prefix.split('/').includes('..')) {
          problems.push(
            `'alias' prefix '${prefix}' must be a path inside the project`
          );
        }
      }
    }
  }
  if (settings.own !== undefined) {
    const { problems: ownProblems, warnings: ownWarnings } = ownProblemsOf(
      settings.own,
      sharedModuleNames,
      kit.name,
      "'own'"
    );
    problems.push(...ownProblems);
    warnings.push(...ownWarnings);
  }
  return { problems, warnings };
}

/**
 * The problems of an ownership list, from the settings or `--own`.
 *
 * @param {unknown} own
 * @param {string[]} sharedModuleNames
 * @param {string} kitName
 * @param {string} label - How the problems name the list.
 */
export function ownProblemsOf(own, sharedModuleNames, kitName, label) {
  const problems = [];
  const warnings = [];
  if (!Array.isArray(own) || own.some((entry) => typeof entry !== 'string')) {
    return { problems: [`${label} must be a list of strings`], warnings };
  }
  for (const entry of own) {
    if (ownableKinds.includes(entry)) continue;
    if (entry.startsWith('shared:')) {
      const name = entry.slice('shared:'.length);
      if (!sharedModuleNames.includes(name)) {
        warnings.push(
          `${label} names '${entry}', but ${kitName} has no shared module '${name}'`
        );
      }
      continue;
    }
    problems.push(
      `${label} takes component, stylesheet, shared and shared:<name>, not '${entry}'`
    );
  }
  return { problems, warnings };
}

/** The problems of one layout pattern. */
function patternProblems(label, pattern, named) {
  if (typeof pattern !== 'string' || pattern === '') {
    return [`'${label}' must be a non-empty string`];
  }
  const problems = [];
  for (const match of pattern.matchAll(/\{([^}]*)\}/g)) {
    if (!named) {
      problems.push(`'${label}' takes no tokens; '{${match[1]}}' is one`);
    } else if (!layoutTokens.includes(match[1])) {
      problems.push(
        `'${label}' has an unknown token '{${match[1]}}'; the tokens are ${layoutTokens.map((token) => `{${token}}`).join(', ')}`
      );
    }
  }
  if (named && !/\{(?:name|kebab-name)\}/.test(pattern)) {
    problems.push(
      `'${label}' must hold {name} or {kebab-name}, or every component would land on one path`
    );
  }
  if (pattern.includes('\\')) {
    problems.push(
      `'${label}' separates directories with '/', not '\\', so it reads the same on every platform`
    );
  }
  if (pattern.startsWith('/') || posix.normalize(pattern).startsWith('..')) {
    problems.push(
      `'${label}' must be a path inside the project, relative to its package root`
    );
  }
  return problems;
}

/**
 * The settings a run uses: the file's, with every key it leaves out
 * filled in, and the layout replaced by a flat one rooted at an output
 * directory when one is given.
 *
 * @param {object | undefined} settings - The file's settings.
 * @param {object} options
 * @param {string} options.target
 * @param {object[]} options.sharedModules - The kit's shared modules.
 * @param {string} [options.outputDirectory] - Root-relative.
 * @returns {{ layout: object, alias?: object }}
 */
export function resolveLayout(
  settings,
  { target, sharedModules, outputDirectory }
) {
  const flat = presetLayout(
    'flat',
    target,
    sharedModules,
    outputDirectory ?? defaultDirectory
  );
  if (outputDirectory !== undefined || settings?.layout === undefined) {
    return { layout: flat, alias: settings?.alias };
  }
  const layout = settings.layout;
  const component = layout.component ?? flat.component;
  return {
    layout: {
      component,
      stylesheet:
        layout.stylesheet ??
        component.replace(/\{extension\}/g, '{stylesheet-extension}'),
      part: layout.part ?? component,
      shared: {
        ...sharedDefaults(staticDirectoryOf(component), sharedModules),
        ...(layout.shared ?? {}),
      },
    },
    alias: settings.alias,
  };
}

/** The directory a pattern starts with, before its first token. */
function staticDirectoryOf(pattern) {
  const before = pattern.split('{')[0];
  return posix.dirname(`${before}x`).replace(/^\.$/, '') || '.';
}

/**
 * A path from a layout pattern.
 *
 * @param {string} pattern
 * @param {Record<string, string>} values - The tokens' values.
 * @returns {string}
 */
export function expandPattern(pattern, values) {
  return posix.normalize(
    pattern.replace(
      /\{([^}]*)\}/g,
      (_match, token) => values[token] ?? `{${token}}`
    )
  );
}
