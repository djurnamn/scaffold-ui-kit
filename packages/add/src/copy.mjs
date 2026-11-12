/**
 * The `add` command: copies components into the consumer's project as the
 * settings place and own them, and records each file in the ledger.
 */
import { posix } from 'node:path';

import { reportDependencies } from './dependencies.mjs';
import { isText } from './kit.mjs';
import { hashOf } from './ledger.mjs';
import { planCopies, resolveSpecifier, stylesheetLinks } from './plan.mjs';
import {
  findSpecifiers,
  isRelative,
  moduleCandidates,
  stylesheetCandidates,
} from './specifiers.mjs';
import { entryFor, sameContent } from './project.mjs';
import { chooseFrom, confirm } from './prompt.mjs';
import {
  defaultDirectory,
  defaultOwn,
  ownProblemsOf,
  resolveLayout,
} from './settings.mjs';

/**
 * Runs `add`.
 *
 * @param {ReturnType<import('./project.mjs').openProject>} project
 * @param {string[]} requests - The component names asked for.
 * @param {object} values - The parsed options.
 * @param {string} commandName - How the kit's command is run, for hints.
 */
export async function addCommand(project, requests, values, commandName) {
  const { kit, settings, ledger } = project;
  const targets = kit.manifest.targets ?? [];

  if (values.list) {
    for (const target of targets) {
      console.log(
        `${target}: ${describeComponents(kit, target) || '(not built)'}`
      );
    }
    return;
  }

  const stylesheetLink = values['stylesheet-link'] ?? stylesheetLinks[0];
  if (!stylesheetLinks.includes(stylesheetLink)) {
    throw new Error(
      `Unknown --stylesheet-link '${stylesheetLink}'. Use ${stylesheetLinks.join(' or ')}.`
    );
  }
  for (const warning of project.settingsWarnings)
    console.error(`warning: ${warning}`);

  // A package of a kit built into one per target copies its own target,
  // whatever target the settings name for another package of the kit.
  const target = kit.inPackages
    ? (values.target ?? targets[0])
    : (values.target ??
      settings?.target ??
      (targets.length === 1
        ? targets[0]
        : await chooseFrom('Which target?', targets)));
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
  const available = kit.componentsFor(target);
  if (available.length === 0) {
    throw new Error(
      `No built components for '${target}'. The kit was published without them.`
    );
  }

  const own =
    values.own !== undefined
      ? parseOwn(values.own, kit)
      : (settings?.own ?? defaultOwn);
  const names = (
    requests.length > 0
      ? requests
      : [await chooseFrom('Which component?', available)]
  ).map((request) => {
    const name = kit.findComponent(request, target);
    if (name === undefined) {
      throw new Error(
        `Unknown component '${request}'. Available for ${target}: ${available.join(', ')}.`
      );
    }
    return name;
  });

  const outputDirectory =
    values['output-directory'] === undefined
      ? undefined
      : project.fromCommandLine(values['output-directory']);
  if (
    outputDirectory !== undefined &&
    (outputDirectory === '..' ||
      outputDirectory.startsWith('../') ||
      posix.isAbsolute(outputDirectory))
  ) {
    throw new Error(
      `--output-directory ${values['output-directory']} is outside the project (${project.root}); add writes only inside it.`
    );
  }
  const { layout, alias } = resolveLayout(settings, {
    target,
    sharedModules: kit.manifest.shared ?? [],
    outputDirectory,
  });

  const plan = planCopies({
    kit,
    target,
    layout,
    alias,
    own,
    stylesheetLink,
    requested: [...new Set(names)],
    ledger,
    widenKept: true,
  });
  if (plan.owns.reason !== undefined) console.log(plan.owns.reason);
  const files = plan.build();
  for (const file of files) project.checkInside(file.path);
  const recordedSettings = {
    target,
    layout,
    ...(alias === undefined ? {} : { alias }),
    own: plan.owns.list,
    stylesheetLink,
  };
  const force = values.force === true;

  // Decide everything first - removals, then each file, prompts included -
  // and write only once nothing is left to decide.
  const removals = decideRemovals(project, plan, files, target, force, alias);
  const decisions = [];
  for (const file of files) {
    const owners =
      file.components !== undefined ? [...file.components] : [file.component];
    const blocked = owners.find((owner) => removals.refused.has(owner));
    if (blocked !== undefined && file.piece !== 'shared') {
      decisions.push({
        file,
        action: 'skip',
        failed: true,
        message: `skipped ${project.display(file.path)} (${removals.refused.get(blocked)})`,
      });
      continue;
    }
    decisions.push(await decide(project, file, target, force, plan.named));
  }
  // A requested component whose own file was skipped is left as it was:
  // its other pieces are neither written nor recorded, and nothing of it
  // is removed. Shared files still go.
  const skippedComponents = new Map();
  for (const decision of decisions) {
    const { file } = decision;
    if (
      decision.action === 'skip' &&
      file.requested &&
      file.component !== undefined
    ) {
      if (!skippedComponents.has(file.component)) {
        skippedComponents.set(file.component, project.display(file.path));
      }
    }
  }
  if (skippedComponents.size > 0) {
    for (const decision of decisions) {
      const { file } = decision;
      if (file.piece === 'shared' || decision.action === 'skip') continue;
      const owners =
        file.components !== undefined ? [...file.components] : [file.component];
      const held = owners.filter((owner) => skippedComponents.has(owner));
      if (held.length === 0 || held.length < owners.length) continue;
      Object.assign(decision, {
        action: 'skip',
        failed: true,
        warning: false,
        message: `skipped ${project.display(file.path)} (${skippedComponents.get(held[0])} was skipped, so ${held[0]} stays as it was)`,
      });
    }
    removals.remove = removals.remove.filter((path) => {
      const entry = ledger.get(path);
      const owners = entry.components ?? [entry.component];
      return !owners.some((owner) => skippedComponents.has(owner));
    });
    removals.messages = removals.messages.filter(
      (line) =>
        line.error ||
        removals.remove.some((path) =>
          line.text.includes(` ${project.display(path)} `)
        )
    );
  }

  let failed = removals.failed || decisions.some((decision) => decision.failed);
  const written = [];
  try {
    for (const decision of decisions) {
      const { file } = decision;
      if (decision.action === 'write')
        project.writeFile(file.path, file.content);
      if (decision.action === 'write' || decision.action === 'record') {
        ledger.set(
          file.path,
          entryFor(
            file,
            kit,
            file.stylesheetLink === undefined
              ? recordedSettings
              : { ...recordedSettings, stylesheetLink: file.stylesheetLink },
            file.content
          ),
          file.content
        );
        written.push({ path: file.path, content: file.content });
      }
    }
    for (const path of removals.remove) {
      if (project.readFile(path) !== undefined) project.removeFile(path);
      ledger.delete(path);
    }
    for (const { path, component } of plan.releases) {
      const entry = ledger.get(path);
      // A component whose narrowing was refused keeps everything it had.
      if (removals.refused.has(component) || skippedComponents.has(component))
        continue;
      if (entry === undefined || written.some((file) => file.path === path))
        continue;
      ledger.files[path] = {
        ...entry,
        components: (entry.components ?? [entry.component]).filter(
          (owner) => owner !== component
        ),
      };
    }
  } finally {
    ledger.save();
  }

  // A directory shared module found whole as it was is one line, not one per file.
  const sharedDecisions = new Map();
  for (const decision of decisions) {
    if (decision.file.piece === 'shared') {
      const list = sharedDecisions.get(decision.file.layer) ?? [];
      list.push(decision);
      sharedDecisions.set(decision.file.layer, list);
    } else {
      printMessage(decision);
    }
  }
  for (const [sharedModuleName, list] of sharedDecisions) {
    const sharedModule = kit.sharedModule(sharedModuleName);
    // Where the files are: the layout's directory for the module, or,
    // for files recorded elsewhere, the directory they share.
    const layoutDirectory = layout.shared?.[sharedModuleName];
    const paths = list.map((decision) => decision.file.path);
    const directory =
      layoutDirectory !== undefined &&
      paths.every((path) => isUnder(path, layoutDirectory))
        ? layoutDirectory
        : commonDirectory(paths);
    const allPresent = list.every((decision) => decision.state === 'present');
    const isDirectory = list.every(
      (decision) => decision.file.source !== sharedModule.source
    );
    if (allPresent && isDirectory && directory !== undefined) {
      console.log(`kept ${project.display(directory)} (already present)`);
    } else {
      for (const decision of list) printMessage(decision);
    }
  }
  for (const path of plan.kept) {
    const entry = ledger.get(path);
    const disk = project.readFile(path);
    if (
      force &&
      entry !== undefined &&
      disk !== undefined &&
      hashOf(disk) !== entry.hash
    ) {
      console.error(
        `warning: kept ${project.display(path)} (already present, edited; ${howToReplace(entry)})`
      );
    } else {
      console.log(`kept ${project.display(path)} (already present)`);
    }
  }
  for (const line of removals.messages) {
    (line.error ? console.error : console.log)(line.text);
  }

  for (const warning of plan.warnings) console.error(`warning: ${warning}`);
  reportDependencies(
    written,
    kit,
    target,
    project.root,
    (line) => console.log(line),
    (line) => console.error(line),
    Object.values(alias ?? {})
  );
  const notes = [...plan.notes, ...(kit.manifest.notes ?? [])];
  if (notes.length > 0) {
    console.log('');
    for (const note of notes) console.log(note);
  }
  // Later runs find copies through the ledger, so an output directory
  // places only new files.
  const leftInPlace =
    outputDirectory !== undefined &&
    decisions.some(
      (decision) =>
        decision.action !== 'skip' &&
        ledger.get(decision.file.path) !== undefined &&
        !isUnder(decision.file.path, outputDirectory)
    );
  if (leftInPlace) {
    console.log('');
    console.log(
      `Copies already recorded stay where they are; --output-directory ${project.display(outputDirectory)} places only new files.`
    );
  }
  // --force replaces at the paths this run writes; it cannot see a copy
  // made elsewhere without the ledger, so it says when it found nothing.
  const nothingReplaced = force
    ? decisions
        .filter(
          (decision) =>
            decision.state === 'added' &&
            decision.file.requested &&
            decision.file.piece === 'component'
        )
        .map((decision) => project.display(decision.file.path))
    : [];
  if (nothingReplaced.length > 0) {
    console.log('');
    console.log(
      `--force found nothing at ${nothingReplaced.join(', ')}, so it replaced nothing there; a copy you keep in another directory stays, and --output-directory with that directory replaces it.`
    );
  }
  if (settings === undefined) {
    console.log('');
    console.log(
      `No ${kit.consumerConfiguration} here, so add places new copies flat in ${project.display(outputDirectory ?? defaultDirectory)}: run \`${commandName} initialize\` to choose where copies go and what you own.`
    );
  }
  if (failed) process.exitCode = 1;
}

/** Whether a root-relative path lies in a root-relative directory. */
function isUnder(path, directory) {
  return directory === '' || path.startsWith(`${directory}/`);
}

/** The deepest directory every one of some root-relative paths lies in. */
function commonDirectory(paths) {
  const [first, ...rest] = paths.map((path) => posix.dirname(path).split('/'));
  let length = first.length;
  for (const segments of rest) {
    let same = 0;
    while (same < length && segments[same] === first[same]) same += 1;
    length = same;
  }
  return first.slice(0, length).join('/');
}

function printMessage(decision) {
  if (decision.message === undefined) return;
  (decision.failed || decision.warning ? console.error : console.log)(
    decision.message
  );
}

/**
 * Settles which earlier files a run removes. A file is kept, and the
 * component it belongs to skipped this run, when the consumer edited it
 * (unless `--force`) or when a copy the run leaves alone still imports it;
 * so a re-export module and a component copy never end up side by side.
 */
function decideRemovals(project, plan, files, target, force, alias) {
  const { kit, ledger } = project;
  const remove = [];
  const refused = new Map();
  const messages = [];
  let failed = false;
  const removing = new Set(plan.removals);
  const plannedPaths = new Set(files.map((file) => file.path));
  // The copies this run neither writes nor removes, which keep their
  // imports as they are.
  const untouchedCopies = ledger
    .entries()
    .filter(
      ([path, entry]) =>
        !removing.has(path) &&
        !plannedPaths.has(path) &&
        entry.piece !== 're-export' &&
        (entry.layer !== undefined || entry.settings?.target === target)
    );
  // What each copy holds once this run is through: a planned file the run
  // writes holds its new content, any other its content on disk.
  const contentAfter = (path) => {
    const file = files.find((candidate) => candidate.path === path);
    const disk = project.readFile(path);
    if (file === undefined) return disk;
    const entry = ledger.get(path);
    const written =
      disk === undefined ||
      (force && file.named) ||
      (entry !== undefined && hashOf(disk) === entry.hash);
    return written ? Buffer.from(file.content) : disk;
  };
  const survivors = [
    ...new Set([
      ...untouchedCopies.map(([path]) => path),
      ...files.map((file) => file.path),
    ]),
  ].filter((path) => !removing.has(path));
  const importers = (removedPath, source) =>
    survivors.filter((path) => {
      // The copy as it is in the project: its specifiers, resolved
      // against the project's paths and the alias it was written with.
      const content = contentAfter(path);
      if (content !== undefined && isText(path) && !content.includes(0)) {
        const copyAlias = ledger.get(path)?.settings?.alias ?? alias;
        // A specifier reaches the file it resolves to first, among those
        // left after the run, and the one being removed.
        const remains = (candidate) =>
          !removing.has(candidate) &&
          (plannedPaths.has(candidate) || project.isFile(candidate));
        const hit = findSpecifiers(content.toString('utf8'), path).some(
          ({ specifier, kind }) =>
            consumerCandidates(path, specifier, kind, copyAlias).find(
              (candidate) => candidate === removedPath || remains(candidate)
            ) === removedPath
        );
        if (hit) return true;
      }
      // And, as a second net, the kit file it came from.
      const entry = ledger.get(path);
      if (
        entry === undefined ||
        !isText(entry.source) ||
        !existsInKit(kit, entry.source)
      ) {
        return false;
      }
      return findSpecifiers(kit.read(entry.source), entry.source).some(
        ({ specifier, kind }) =>
          resolveSpecifier(kit, entry.source, specifier, kind)?.path === source
      );
    });
  // A narrowed React component is replaced by its re-export module at the
  // same path without the extension, which an import of it still reaches.
  const replacedInPlace = (path) =>
    target === 'react' &&
    files.some(
      (file) =>
        file.piece === 're-export' &&
        file.path.replace(/\.ts$/, '') === path.replace(/\.tsx$/, '')
    );

  for (const path of plan.removals) {
    const entry = ledger.get(path);
    const disk = project.readFile(path);
    const owners = entry.components ?? [entry.component];
    if (disk === undefined) {
      remove.push(path);
      continue;
    }
    const display = project.display(path);
    const edited = hashOf(disk) !== entry.hash;
    const importedBy =
      entry.piece === 're-export' || replacedInPlace(path)
        ? []
        : importers(path, entry.source);
    if (importedBy.length > 0) {
      const reason = `${display} is still imported by ${importedBy.map((importer) => project.display(importer)).join(', ')}`;
      for (const owner of owners) refused.set(owner, reason);
      messages.push({
        error: true,
        text: `kept ${display} (${importedBy.map((importer) => project.display(importer)).join(', ')} still ${importedBy.length === 1 ? 'imports' : 'import'} it)`,
      });
      failed = true;
    } else if (
      edited &&
      !(force && owners.some((owner) => plan.named.has(owner)))
    ) {
      const remedy = force
        ? `name ${owners.join(' or ')} with --force`
        : 'pass --force';
      const reason = `${display} is edited and stays; remove it, or ${remedy}`;
      for (const owner of owners) refused.set(owner, reason);
      messages.push({
        error: true,
        text: `kept ${display} (edited, and no longer what add writes for ${owners.join(', ')}; remove it, or ${remedy})`,
      });
      failed = true;
    } else {
      remove.push(path);
    }
  }
  // A refused removal keeps the whole component as it was.
  const keptRemovals = remove.filter((path) => {
    const entry = ledger.get(path);
    const owners = entry.components ?? [entry.component];
    return !owners.some((owner) => refused.has(owner));
  });
  for (const path of keptRemovals) {
    const entry = ledger.get(path);
    if (project.readFile(path) === undefined) continue;
    messages.push({
      error: false,
      text: `removed ${project.display(path)} (${entry.piece === 're-export' ? 'replaced by the copy' : 'no longer owned'})`,
    });
  }
  return { remove: keptRemovals, refused, failed, messages };
}

/**
 * The project paths a specifier in a copy may name: relative to the copy,
 * or below an alias prefix it was written with. A Sass URL is tried
 * relative first, as Sass does.
 */
function consumerCandidates(fromPath, specifier, kind, alias) {
  let base;
  if (isRelative(specifier) || kind === 'url') {
    base = posix.normalize(posix.join(posix.dirname(fromPath), specifier));
  } else {
    const match = Object.entries(alias ?? {}).find(([, replacement]) =>
      specifier.startsWith(replacement)
    );
    if (match !== undefined) {
      base = posix.normalize(`${match[0]}${specifier.slice(match[1].length)}`);
    } else if (kind === 'style' && !/^[a-z][a-z0-9+.-]*:/i.test(specifier)) {
      base = posix.normalize(posix.join(posix.dirname(fromPath), specifier));
    } else {
      return [];
    }
  }
  if (base === '..' || base.startsWith('../') || posix.isAbsolute(base)) {
    return [];
  }
  if (kind === 'url') return [base];
  return kind === 'style' ? stylesheetCandidates(base) : moduleCandidates(base);
}

function existsInKit(kit, path) {
  try {
    kit.read(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * What to do with one planned file, without doing it.
 *
 * A file that is not there is written. One that holds what add writes is
 * recorded. A symbolic link is otherwise skipped. One add wrote that nobody edited since is replaced. One
 * recorded for another target is left alone unless it is identical. One
 * edited, or not written by add, is replaced by `--force` when it belongs to
 * a component the run names, and is a conflict worth a prompt only when it
 * is a requested component's own; anything else is kept with a word, and a
 * copy present that follows this run's wider ownership with the package
 * imports it still has to change.
 */
async function decide(project, file, target, force, named) {
  const { kit, ledger } = project;
  const display = project.display(file.path);
  const entry = ledger.get(file.path);
  const disk = project.readFile(file.path);
  const write = (label) => ({
    file,
    action: 'write',
    state: label,
    message: `${label} ${display}`,
  });
  // A write replaces the file, so a link would become a file and its
  // target stay as it was; a link is never written over.
  const link = project.isSymbolicLink(file.path);
  const linkSkipped = {
    file,
    action: 'skip',
    failed: true,
    message: `skipped ${display} (a symbolic link; add writes only regular files, so replace the link with the file it points to)`,
  };
  if (disk === undefined) return link ? linkSkipped : write('added');
  // A path another target's copy holds keeps its entry: the same content
  // is kept as it is, other content is not written.
  if (
    entry !== undefined &&
    entry.settings?.target !== undefined &&
    entry.settings.target !== target &&
    entry.layer === undefined
  ) {
    if (sameContent(disk, file.content)) {
      return {
        file,
        action: 'keep',
        state: 'present',
        message: `kept ${display} (already present, recorded for ${entry.settings.target})`,
      };
    }
    return {
      file,
      action: 'skip',
      failed: true,
      message: `skipped ${display} (already holds ${entry.component ?? entry.components?.join(', ')} for ${entry.settings.target}; give ${target} another layout)`,
    };
  }
  if (sameContent(disk, file.content)) {
    return {
      file,
      action: 'record',
      state: 'present',
      message: `kept ${display} (already present)`,
    };
  }
  if (link) return linkSkipped;
  const untouched = entry !== undefined && hashOf(disk) === entry.hash;
  if (untouched) return write('updated');
  if (force && file.named) {
    const replaced = write('replaced');
    replaced.message += replacedNote(kit, file, named);
    return replaced;
  }
  if (file.requested) {
    if (await confirm(`${display} already exists. Overwrite?`)) {
      return write('replaced');
    }
    return {
      file,
      action: 'skip',
      failed: true,
      message: `skipped ${display} (already exists${entry !== undefined ? " and is edited; run update to merge the kit's changes, or pass --force" : '; pass --force to replace it'})`,
    };
  }
  const left = file.kept === true ? packageImportsLeft(kit, file, disk) : [];
  // Asked to replace, a run that keeps a file says so where it warns.
  const replacing = force ? `${howToReplace(file)}; ` : '';
  return {
    file,
    action: 'keep',
    state: 'kept',
    warning: entry !== undefined || force,
    message:
      entry === undefined
        ? force
          ? `warning: kept ${display} (exists and differs from what the kit writes; --force replaces only the components you name: ${howToReplace(file)})`
          : `kept ${display} (already present, and different from what the kit writes; not recorded)`
        : left.length > 0
          ? `warning: kept ${display} (edited; ${replacing}it still imports ${left.map((specifier) => `'${specifier}'`).join(', ')} from ${kit.name}, now copied: point ${left.length === 1 ? 'it' : 'them'} at the ${left.length === 1 ? 'copy' : 'copies'}, or run update to merge the change)`
          : `warning: kept ${display} (edited; ${replacing}run update to merge the kit's changes)`,
  };
}

/** The components a planned file or a ledger entry belongs to. */
function ownersOf(file) {
  if (file.components !== undefined) return [...file.components];
  return file.component !== undefined ? [file.component] : [];
}

/**
 * What a `--force` replacement reached beyond the components asked for: the
 * root a part came with, and any other copy that uses the same file.
 */
function replacedNote(kit, file, named) {
  const owners = ownersOf(file);
  const notes = [];
  if (!file.requested) {
    const roots = new Set(
      owners
        .filter((owner) => named.has(owner))
        .map((owner) => kit.component(owner)?.partOf)
        .filter((root) => root !== undefined)
    );
    if (roots.size > 0) notes.push(`comes with ${[...roots].join(', ')}`);
  }
  const others = owners.filter((owner) => !named.has(owner));
  if (others.length > 0) {
    notes.push(`${others.map((owner) => `${owner}'s`).join(' and ')} too`);
  }
  return notes.length > 0 ? ` (${notes.join('; ')})` : '';
}

/** How a consumer replaces a file `--force` kept because it was not named. */
function howToReplace(file) {
  const owners = ownersOf(file);
  return owners.length > 0
    ? `name ${owners.join(' or ')} to replace it`
    : "remove it and run add again to take the kit's";
}

/**
 * The package specifiers an edited copy still holds where what add writes
 * today reaches a copy instead: the imports left to change by hand, or by
 * `update`.
 */
function packageImportsLeft(kit, file, disk) {
  if (
    !isText(file.path) ||
    disk.includes(0) ||
    typeof file.content !== 'string'
  )
    return [];
  const written = new Set(
    findSpecifiers(file.content, file.path).map(({ specifier }) => specifier)
  );
  return [
    ...new Set(
      findSpecifiers(disk.toString('utf8'), file.path)
        .map(({ specifier }) => specifier)
        .filter(
          (specifier) =>
            !written.has(specifier) &&
            kit.ownsSpecifier(specifier.replace(/^pkg:/, ''))
        )
    ),
  ];
}

/** `--own component,stylesheet` as a list, validated. */
export function parseOwn(value, kit) {
  const own = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  const { problems, warnings } = ownProblemsOf(
    own,
    (kit.manifest.shared ?? []).map((sharedModule) => sharedModule.name),
    kit.name,
    '--own'
  );
  if (problems.length > 0) throw new Error(problems.join('; '));
  for (const warning of warnings) console.error(`warning: ${warning}`);
  return own;
}

/** A target's components for `--list`: each compound with its parts. */
function describeComponents(kit, target) {
  const names = kit.componentsFor(target);
  return names
    .filter(
      (name) =>
        kit.component(name).partOf === undefined ||
        !names.includes(kit.component(name).partOf)
    )
    .map((name) => {
      const parts = (kit.component(name).parts ?? []).filter((part) =>
        names.includes(part)
      );
      return parts.length > 0 ? `${name} (${parts.join(', ')})` : name;
    })
    .join(', ');
}
