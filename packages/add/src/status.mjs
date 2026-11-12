/**
 * The `status` command: for each copy in the ledger, the kit version it was
 * copied at, whether the consumer edited it, and whether add would write it
 * differently now, from the installed kit.
 */
import { hashOf } from './ledger.mjs';
import { recheck } from './recheck.mjs';
import { isText } from './kit.mjs';
import { addVersion, sameContent } from './project.mjs';

/**
 * Runs `status`. Always exits 0: it reports, it does not judge.
 *
 * @param {ReturnType<import('./project.mjs').openProject>} project
 * @param {object} values - The parsed options; `json` prints JSON.
 * @param {string} commandName
 */
export function statusCommand(project, values, commandName) {
  const { kit, ledger } = project;
  const entries = ledger.entries().filter(([, entry]) => kit.answersFor(entry));
  const { expected } = recheck(
    kit,
    ledger,
    entries,
    project.settings?.layout?.shared
  );
  const rows = entries.map(([path, entry]) => {
    const disk = project.readFile(path);
    const markers =
      disk !== undefined &&
      isText(path) &&
      /^<{7} /m.test(disk.toString('utf8')) &&
      /^>{7} /m.test(disk.toString('utf8'));
    const state =
      disk === undefined
        ? 'missing'
        : markers
          ? 'conflicted'
          : entry.merging !== undefined
            ? 'resolved'
            : hashOf(disk) === entry.hash
              ? 'untouched'
              : 'edited';
    const now = expected.get(path);
    const base = ledger.base(entry.hash);
    const today =
      now === undefined
        ? 'removed'
        : base === undefined
          ? 'unknown'
          : sameContent(base, now)
            ? 'same'
            : 'different';
    return {
      path,
      ...(entry.components !== undefined
        ? { components: entry.components }
        : entry.component !== undefined
          ? { component: entry.component }
          : { layer: entry.layer }),
      piece: entry.piece,
      kitVersion: entry.kit,
      addVersion: entry.add,
      sourceChanged: sourceChanged(kit, entry),
      state,
      today,
    };
  });

  if (values.json) {
    console.log(
      JSON.stringify(
        {
          kit: { name: kit.name, version: kit.version },
          add: { version: addVersion },
          files: rows,
        },
        null,
        2
      )
    );
    return;
  }
  if (rows.length === 0) {
    console.log(
      `No copies of ${kit.name} recorded here. Copy one with \`${commandName} add\`.`
    );
    return;
  }
  const stateText = {
    missing: 'missing',
    conflicted: 'conflicted',
    resolved: 'resolved, run update to record it',
    untouched: 'untouched',
    edited: 'edited',
  };
  // What changed between then and now: the kit's version, or else add's.
  const todayText = (row) => {
    switch (row.today) {
      case 'same':
        return 'written the same now';
      case 'removed':
        return `no longer written by ${kit.name} ${kit.version}`;
      case 'unknown':
        return 'stored base missing';
      default:
        return `would be written differently now${
          row.kitVersion !== kit.version
            ? ` (${kit.name} ${row.kitVersion} → ${kit.version})`
            : row.sourceChanged === true
              ? ` (the kit's ${entries.find(([path]) => path === row.path)[1].source} changed)`
              : row.addVersion !== addVersion
                ? ` (add ${row.addVersion} → ${addVersion})`
                : row.sourceChanged === false
                  ? ' (other copies changed)'
                  : ''
        }`;
    }
  };
  const table = rows.map((row) => [
    project.display(row.path),
    `${row.component ?? row.components?.join(', ') ?? row.layer} ${row.piece}`,
    row.kitVersion,
    stateText[row.state],
    todayText(row),
  ]);
  const widths = table[0].map((_, column) =>
    Math.max(...table.map((row) => row[column].length))
  );
  console.log(`${kit.name} ${kit.version} installed`);
  for (const row of table) {
    console.log(
      `  ${row
        .map((cell, column) => cell.padEnd(widths[column]))
        .join('  ')
        .trimEnd()}`
    );
  }
  const different = rows.filter((row) => row.today === 'different').length;
  const edited = rows.filter((row) => row.state === 'edited').length;
  const open = rows.filter((row) => row.state === 'conflicted').length;
  const resolved = rows.filter((row) => row.state === 'resolved').length;
  console.log('');
  console.log(
    `${rows.length} file${rows.length === 1 ? '' : 's'}, ${edited} edited, ${open > 0 ? `${open} with a conflict open, ` : ''}${resolved > 0 ? `${resolved} resolved (run update to record ${resolved === 1 ? 'it' : 'them'}), ` : ''}${different} that add would write differently now${different > 0 || open > 0 ? `: \`${commandName} update\` brings them in` : ''}.`
  );
}

/**
 * Whether the kit file a copy came from changed since: true or false when
 * the entry records its hash, undefined when it does not.
 */
function sourceChanged(kit, entry) {
  if (entry.sourceHash === undefined) return undefined;
  try {
    return hashOf(kit.read(entry.source)) !== entry.sourceHash;
  } catch {
    return true;
  }
}
