/**
 * The `initialize` command: writes the consumer's settings for a kit,
 * asking for each value or taking it from a flag, with the current
 * settings as the defaults.
 */
import { writeFileAtomically } from './ledger.mjs';
import { ask, chooseFrom } from './prompt.mjs';
import {
  defaultOwn,
  layoutPresets,
  ownProblemsOf,
  presetLayout,
  presetOf,
  validateSettings,
} from './settings.mjs';

/** The targets that name the framework package a project lists. */
const frameworkTargets = ['react', 'vue', 'svelte'];

const missing =
  'Pass --yes to take the defaults, or set each answer with a flag (see initialize --help).';

/**
 * Runs `initialize`.
 *
 * @param {ReturnType<import('./project.mjs').openProject>} project
 * @param {object} values - The parsed options.
 */
export async function initializeCommand(project, values) {
  const { kit } = project;
  const current = project.settings ?? {};
  const sharedModules = kit.manifest.shared ?? [];
  const targets = kit.manifest.targets ?? [];
  const accept = values.yes === true;
  const question = async (flag, defaultValue, prompt) =>
    flag !== undefined ? flag : accept ? defaultValue : prompt(defaultValue);

  // A package of a kit built into one per target names its target.
  const target = kit.inPackages
    ? (values.target ?? targets[0])
    : await question(
        values.target,
        current.target ?? projectTarget(project, targets) ?? targets[0],
        (defaultChoice) =>
          targets.length === 1
            ? targets[0]
            : chooseFrom('Which target do you copy components for?', targets, {
                defaultChoice,
                missing,
              })
      );
  if (kit.inPackages && !targets.includes(target)) {
    throw new Error(
      `${kit.packageName} copies ${targets.join(', ')} components; for ${target}, run the command of ${kit.name}'s ${target} package.`
    );
  }
  if (!targets.includes(target)) {
    throw new Error(
      `Unknown target '${target}'. This kit is built for ${targets.join(', ')}.`
    );
  }

  const patternFlags = {
    component: values['component-pattern'],
    stylesheet: values['stylesheet-pattern'],
    part: values['part-pattern'],
  };
  const currentPreset =
    current.layout === undefined
      ? 'flat'
      : (presetOf(current.layout, target, sharedModules) ?? 'custom');
  const layoutChoices = [...layoutPresets, 'custom'];
  const preset = await question(
    values.layout ??
      (Object.values(patternFlags).some((flag) => flag !== undefined)
        ? 'custom'
        : undefined),
    currentPreset,
    (defaultChoice) =>
      chooseFrom(
        'Where do copies go? flat puts every component in src/components/ui; folder gives each its own folder under src/components, its parts beside it; custom asks for each pattern.',
        layoutChoices,
        { defaultChoice, missing }
      )
  );
  if (!layoutChoices.includes(preset)) {
    throw new Error(
      `Unknown --layout '${preset}'. Use ${layoutChoices.join(', ')}.`
    );
  }

  let layout;
  if (preset === 'custom') {
    const base = current.layout ?? presetLayout('flat', target, sharedModules);
    layout = { shared: {} };
    for (const key of ['component', 'stylesheet', 'part']) {
      layout[key] = await question(
        patternFlags[key],
        base[key],
        (defaultAnswer) =>
          ask(
            `The ${key} pattern ({name}, {kebab-name}, {component}, {extension}, {stylesheet-extension}):`,
            {
              defaultAnswer,
              missing,
            }
          )
      );
    }
    for (const sharedModule of sharedModules) {
      const sharedFlag = parsePairs(values.shared, '--shared')[
        sharedModule.name
      ];
      layout.shared[sharedModule.name] = await question(
        sharedFlag,
        base.shared?.[sharedModule.name] ??
          presetLayout('flat', target, sharedModules).shared[sharedModule.name],
        (defaultAnswer) =>
          ask(
            `Where does the shared module '${sharedModule.name}' (${sharedModule.source}) go?`,
            {
              defaultAnswer,
              missing,
            }
          )
      );
    }
  } else {
    layout = presetLayout(preset, target, sharedModules);
    const sharedFlags = parsePairs(values.shared, '--shared');
    for (const sharedModule of sharedModules) {
      if (sharedFlags[sharedModule.name] !== undefined) {
        layout.shared[sharedModule.name] = sharedFlags[sharedModule.name];
      } else if (
        preset === currentPreset &&
        current.layout?.shared?.[sharedModule.name] !== undefined
      ) {
        layout.shared[sharedModule.name] =
          current.layout.shared[sharedModule.name];
      }
    }
  }
  if (Object.keys(layout.shared).length === 0) delete layout.shared;

  const aliasText = await question(
    values.alias,
    formatPairs(current.alias),
    (defaultAnswer) =>
      ask(
        'An import alias for the copies, as prefix=alias (src/=@/), or blank for none:',
        {
          defaultAnswer,
          missing,
        }
      )
  );
  const alias =
    aliasText === '' || aliasText === 'none'
      ? undefined
      : parsePairs(aliasText, '--alias');

  let own;
  if (kit.ownsEverything || target === 'html') {
    own = current.own ?? defaultOwn;
    console.log(
      kit.ownsEverything
        ? `${kit.name} is built for full ownership: add copies every piece whatever 'own' says.`
        : 'The html target has no module to import from: add copies every piece.'
    );
  } else {
    const sharedModuleNames = sharedModules.map(
      (sharedModule) => sharedModule.name
    );
    const ownText = await question(
      values.own,
      (current.own ?? defaultOwn).join(','),
      (defaultAnswer) =>
        ask(
          `What do you own by default? Any of component, stylesheet, shared${sharedModuleNames.length > 0 ? ` (or ${sharedModuleNames.map((name) => `shared:${name}`).join(', ')})` : ''}, comma-separated; what you leave out is imported from ${kit.name}:`,
          { defaultAnswer, missing }
        )
    );
    own = ownText
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '');
    const { problems } = ownProblemsOf(
      own,
      sharedModuleNames,
      kit.name,
      '--own'
    );
    if (problems.length > 0) throw new Error(problems.join('; '));
  }

  const settings = {
    target,
    layout,
    ...(alias === undefined ? {} : { alias }),
    own,
  };
  const { problems, warnings } = validateSettings(settings, kit);
  if (problems.length > 0) {
    throw new Error(
      `The answers do not make valid settings:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`
    );
  }
  for (const warning of warnings) console.error(`warning: ${warning}`);
  writeFileAtomically(
    project.settingsPath,
    `${JSON.stringify(settings, null, 2)}\n`
  );
  // Above the working directory a relative path hides where it went.
  console.log(
    project.root === project.workingDirectory
      ? `wrote ${project.display(kit.consumerConfiguration)}`
      : `wrote ${project.settingsPath} (your package root: the nearest directory up from here with a package.json)`
  );
}

/**
 * The kit's target for the framework the project's `package.json` lists,
 * when exactly one matches; otherwise the first-target default stands.
 */
function projectTarget(project, targets) {
  const content = project.readFile('package.json');
  if (content === undefined) return undefined;
  let manifest;
  try {
    manifest = JSON.parse(content.toString('utf8'));
  } catch {
    return undefined;
  }
  const listed = new Set(
    ['dependencies', 'devDependencies', 'peerDependencies'].flatMap((field) =>
      Object.keys(manifest?.[field] ?? {})
    )
  );
  const matches = targets.filter(
    (target) => frameworkTargets.includes(target) && listed.has(target)
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/** `a=b,c=d` (or repeated flags) as an object. */
function parsePairs(value, label) {
  if (value === undefined) return {};
  const entries = (Array.isArray(value) ? value : [value])
    .flatMap((item) => item.split(','))
    .map((item) => item.trim())
    .filter((item) => item !== '');
  return Object.fromEntries(
    entries.map((item) => {
      const at = item.indexOf('=');
      if (at <= 0 || at === item.length - 1) {
        throw new Error(`${label} takes name=value pairs, not '${item}'`);
      }
      return [item.slice(0, at), item.slice(at + 1)];
    })
  );
}

/** An object as `a=b,c=d`. */
function formatPairs(pairs) {
  return pairs === undefined
    ? ''
    : Object.entries(pairs)
        .map(([key, value]) => `${key}=${value}`)
        .join(',');
}
