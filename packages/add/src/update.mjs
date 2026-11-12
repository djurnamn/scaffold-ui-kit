/**
 * The `update` command: brings copies to what the installed kit writes,
 * replacing untouched files and merging the kit's changes into edited ones.
 */
import { isText } from './kit.mjs';
import { hashOf, inLineEndingsOf, normalizeLineEndings } from './ledger.mjs';
import { hasGit, mergeFile } from './merge.mjs';
import { partComesWithRoot } from './plan.mjs';
import { entryFor, sameContent } from './project.mjs';
import { recheck } from './recheck.mjs';

/**
 * Runs `update [component...]`; no names updates every copy. Exits
 * non-zero when a file conflicted.
 *
 * @param {ReturnType<import('./project.mjs').openProject>} project
 * @param {string[]} requests - Component names.
 * @param {string} commandName
 */
export function updateCommand(project, requests, commandName) {
  const { kit, ledger } = project;
  const comparable = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const wanted = new Set(requests.map(comparable));
  const all = ledger.entries().filter(([, entry]) => kit.answersFor(entry));
  const ownersOf = (entry) =>
    entry.components ??
    (entry.component !== undefined ? [entry.component] : []);
  const recorded = new Set(
    all.flatMap(([, entry]) => ownersOf(entry)).map(comparable)
  );
  for (const request of requests) {
    if (!recorded.has(comparable(request))) {
      throw new Error(
        `No copy of '${request}' is recorded here; copy it with \`${commandName} add ${request}\`.`
      );
    }
  }
  // A named root's parts, per target it is copied for: the ones add copies
  // with it are covered, the rest were named on their own and stay. The
  // ledger keeps copies per target, so a part copied for another target
  // than the root's is neither.
  const coveredParts = new Map();
  const otherParts = new Map();
  for (const [, entry] of all) {
    if (
      entry.piece !== 'component' ||
      entry.component === undefined ||
      !wanted.has(comparable(entry.component))
    ) {
      continue;
    }
    const target = entry.settings?.target;
    for (const part of kit.component(entry.component)?.parts ?? []) {
      const parts = partComesWithRoot(kit, target, part)
        ? coveredParts
        : otherParts;
      if (!parts.has(target)) parts.set(target, new Set());
      parts.get(target).add(part);
    }
  }
  const covers = (owner, target) =>
    wanted.has(comparable(owner)) || coveredParts.get(target)?.has(owner);
  const entries =
    wanted.size === 0
      ? all
      : all.filter(([, entry]) =>
          ownersOf(entry).some((owner) => covers(owner, entry.settings?.target))
        );
  const leftParts = all.filter(
    ([, entry]) =>
      otherParts.get(entry.settings?.target)?.has(entry.component) &&
      !entries.some(([, covered]) => covered === entry)
  );
  const skippedShared =
    wanted.size === 0
      ? 0
      : all.filter(([, entry]) => entry.layer !== undefined).length;
  if (entries.length === 0) {
    console.log(`No copies of ${kit.name} recorded here.`);
    return;
  }
  const { expected, planned, added, warnings } = recheck(
    kit,
    ledger,
    entries,
    project.settings?.layout?.shared
  );
  // The parts left out that the kit has moved on from, for the closing line.
  const { expected: leftExpected } = recheck(kit, ledger, leftParts);
  const differingParts = [
    ...new Set(
      leftParts
        .filter(([path, entry]) => {
          const now = leftExpected.get(path);
          const base = ledger.base(entry.hash);
          return (
            now !== undefined && base !== undefined && !sameContent(base, now)
          );
        })
        .map(([, entry]) => entry.component)
    ),
  ];

  // Settle every action first, merges included, so nothing is written
  // until nothing can fail but the writes themselves.
  const actions = entries.map(([path, entry]) => {
    const action = settle(path, entry);
    // A write would turn a symbolic link into a file and leave its target
    // as it was, so a link is never written over.
    return ['replace', 'merge'].includes(action.kind) &&
      project.isSymbolicLink(path)
      ? { path, entry, kind: 'symbolic-link' }
      : action;
  });
  function settle(path, entry) {
    const theirs = expected.get(path);
    const disk = project.readFile(path);
    const base = ledger.base(entry.hash);
    if (theirs === undefined) return { path, entry, kind: 'removed' };
    if (disk === undefined) return { path, entry, kind: 'missing' };
    const untouched = hashOf(disk) === entry.hash;
    const markers =
      !untouched &&
      isText(path) &&
      /^<{7} /m.test(disk.toString('utf8')) &&
      /^>{7} /m.test(disk.toString('utf8'));
    if (entry.merging !== undefined && !markers) {
      // A conflict resolved: the consumer's file already holds the kit
      // version it conflicted with, or is merged on from it.
      if (hashOf(theirs) === entry.merging) {
        return { path, entry, kind: 'resolved', theirs };
      }
      const merged = ledger.base(entry.merging);
      if (merged !== undefined) {
        return { path, entry, kind: 'merge', theirs, disk, base: merged };
      }
    }
    if (markers) {
      return {
        path,
        entry,
        kind: entry.merging !== undefined ? 'unresolved' : 'foreign-markers',
        theirs,
      };
    }
    if (base !== undefined && sameContent(base, theirs)) {
      return { path, entry, kind: 'unchanged', theirs };
    }
    if (untouched && sameContent(disk, theirs)) {
      // Its base is missing, and it already holds what the kit writes.
      return { path, entry, kind: 'unchanged', theirs };
    }
    if (untouched) return { path, entry, kind: 'replace', theirs, disk };
    if (sameContent(disk, theirs))
      return { path, entry, kind: 'matches', theirs };
    if (base === undefined) return { path, entry, kind: 'no-base', theirs };
    if (!isText(path)) return { path, entry, kind: 'binary', theirs };
    return { path, entry, kind: 'merge', theirs, disk, base };
  }
  if (actions.some((action) => action.kind === 'merge') && !hasGit()) {
    throw new Error(
      "update merges edited files with git merge-file, and git is not on the path. Install git and run update again, or take the kit's version with add <component> --force, or remove a shared file and run add <component> again."
    );
  }
  for (const action of actions) {
    if (action.kind !== 'merge') continue;
    const display = project.display(action.path);
    const { content, conflicts } = mergeFile(
      {
        ours: normalizeLineEndings(action.disk),
        base: normalizeLineEndings(action.base),
        theirs: normalizeLineEndings(action.theirs),
      },
      {
        ours: display,
        base: `${display} (${action.entry.kit})`,
        theirs: `${kit.name} ${kit.version}`,
      }
    );
    action.merged = content;
    action.conflicts = conflicts;
  }
  const additions = added.filter(
    ({ file, settings }) =>
      wanted.size === 0 ||
      file.piece === 'shared' ||
      // Planned only from the copies this run covers: what they now reach.
      file.requested === false ||
      (file.components !== undefined
        ? [...file.components]
        : [file.component]
      ).some((owner) => owner !== undefined && covers(owner, settings.target))
  );
  for (const { file } of additions) project.checkInside(file.path);

  // Write, then record; the ledger is saved whatever happens on the way.
  const lines = [];
  const say = (text, error = false) => lines.push({ text, error });
  let conflicted = 0;
  try {
    for (const action of actions) {
      const { path, entry } = action;
      const display = project.display(path);
      // Recorded from what add plans today: a kit file that moved
      // updates the entry's source, a helper its owners.
      const record = (base) =>
        ledger.set(
          path,
          entryFor(planned.get(path) ?? entry, kit, entry.settings, base),
          base
        );
      switch (action.kind) {
        case 'removed':
          say(
            `warning: kept ${display} (${kit.name} ${kit.version} no longer writes it)`,
            true
          );
          break;
        case 'missing':
          say(
            `warning: ${display} is missing; copy it again with \`${commandName} add\``,
            true
          );
          break;
        case 'unchanged':
          // The same content, now at the installed versions and source.
          record(ledger.base(entry.hash) ?? action.theirs);
          break;
        case 'symbolic-link':
          conflicted += 1;
          say(
            `skipped ${display} (a symbolic link; update writes only regular files, so replace the link with the file it points to and run update again)`,
            true
          );
          break;
        case 'replace':
          project.writeFile(path, inLineEndingsOf(action.theirs, action.disk));
          record(action.theirs);
          say(`updated ${display}`);
          break;
        case 'matches':
          record(action.theirs);
          say(`updated ${display} (already matches the kit)`);
          break;
        case 'no-base':
        case 'binary':
          conflicted += 1;
          say(
            `conflict ${display} (${action.kind === 'binary' ? 'an edited binary file' : 'edited, and its stored base is missing'}; kept yours; ${takeTheKitsVersion(action.entry, commandName)})`,
            true
          );
          break;
        case 'resolved':
          record(action.theirs);
          say(`resolved ${display}`);
          break;
        case 'unresolved':
          conflicted += 1;
          say(
            `conflict ${display} (still holds conflict markers; resolve them and run update again)`,
            true
          );
          break;
        case 'foreign-markers':
          conflicted += 1;
          say(
            `conflict ${display} (holds conflict markers update did not write; resolve them, or ${takeTheKitsVersion(action.entry, commandName)})`,
            true
          );
          break;
        case 'merge':
          project.writeFile(path, inLineEndingsOf(action.merged, action.disk));
          if (action.conflicts > 0) {
            // The old entry stays until the consumer resolves the markers
            // and runs update again; it notes the kit version being merged.
            conflicted += 1;
            ledger.storeBase(hashOf(action.theirs), action.theirs);
            ledger.set(
              path,
              { ...entry, merging: hashOf(action.theirs) },
              // Its own base, if it is still stored; never another under
              // its hash.
              ledger.base(entry.hash)
            );
            say(
              `conflict ${display} (${action.conflicts} conflict${action.conflicts === 1 ? '' : 's'} marked in the file; resolve ${action.conflicts === 1 ? 'it' : 'them'} and run update again)`,
              true
            );
          } else {
            record(action.theirs);
            say(`merged ${display}`);
          }
          break;
      }
    }
    for (const { file, settings } of additions) {
      const display = project.display(file.path);
      const disk = project.readFile(file.path);
      if (disk === undefined && project.isSymbolicLink(file.path)) {
        say(
          `warning: skipped ${display} (a symbolic link to nothing; update writes only regular files)`,
          true
        );
        continue;
      }
      if (disk !== undefined && !sameContent(disk, file.content)) {
        say(
          `warning: kept ${display} (already present, and not what the kit writes there)`,
          true
        );
        continue;
      }
      if (disk === undefined) project.writeFile(file.path, file.content);
      ledger.set(
        file.path,
        entryFor(file, kit, settings, file.content),
        file.content
      );
      say(`${disk === undefined ? 'added' : 'kept'} ${display}`);
    }
  } finally {
    ledger.save();
  }

  for (const line of lines)
    (line.error ? console.error : console.log)(line.text);
  for (const warning of warnings) console.error(`warning: ${warning}`);
  if (skippedShared > 0) {
    console.log(
      `Left ${skippedShared} shared file${skippedShared === 1 ? '' : 's'} as ${skippedShared === 1 ? 'it is' : 'they are'}: \`${commandName} update\` without names updates shared modules too.`
    );
  }
  if (differingParts.length > 0) {
    const one = differingParts.length === 1;
    console.log(
      `Left ${differingParts.join(', ')} as ${one ? 'it is' : 'they are'}, though the kit would write ${one ? 'it' : 'them'} differently now: \`${commandName} update ${differingParts.join(' ')}\` brings ${one ? 'it' : 'them'} in.`
    );
  }
  if (conflicted > 0) {
    process.exitCode = 1;
  } else if (
    !actions.some((action) =>
      ['replace', 'matches', 'merge', 'resolved'].includes(action.kind)
    )
  ) {
    console.log(
      `Every copy${requests.length > 0 ? ` of ${requests.join(', ')}` : ''} is up to date with ${kit.name} ${kit.version}.`
    );
  }
}

/**
 * How a consumer takes the kit's version of a copy `update` could not
 * merge: `--force` replaces a component's files by name, and a shared file
 * belongs to no component, so it is copied again.
 */
function takeTheKitsVersion(entry, commandName) {
  if (entry.layer !== undefined) {
    return "remove it and run add <component> again to take the kit's";
  }
  const owners = entry.components ?? [entry.component];
  return `take the kit's version with \`${commandName} add ${owners.join(' or ')} --force\``;
}
