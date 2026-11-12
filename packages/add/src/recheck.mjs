/**
 * What `add` would write today for copies already made: each ledger entry
 * planned again from the installed kit with the settings it was written
 * with.
 */
import { planCopies } from './plan.mjs';

/**
 * Plans the given ledger entries again, grouped by the settings each was
 * written with.
 *
 * @param {import('./kit.mjs').Kit} kit
 * @param {import('./ledger.mjs').Ledger} ledger
 * @param {Array<[string, object]>} entries - The `[path, entry]` pairs.
 * @param {Record<string, string>} [currentSharedLayout] - The consumer's
 *   `layout.shared` today, which places a shared module the recorded layout
 *   predates.
 * @returns {{ expected: Map<string, Buffer | string | undefined>, planned: Map<string, object>, added: object[], warnings: string[] }}
 *   `expected` holds what add writes today per entry path (undefined when
 *   it writes nothing there any more), `planned` the planned file itself,
 *   with its kit `source` and owners; `added` the files it writes today
 *   that no entry records, such as a shared file the copies newly reach.
 */
export function recheck(kit, ledger, entries, currentSharedLayout) {
  const groups = new Map();
  for (const [path, entry] of entries) {
    const key = JSON.stringify(entry.settings ?? {});
    const group = groups.get(key) ?? {
      settings: entry.settings ?? {},
      entries: [],
    };
    group.entries.push([path, entry]);
    groups.set(key, group);
  }
  const expected = new Map();
  const planned = new Map();
  const added = new Map();
  const warnings = [];
  for (const { settings, entries: groupEntries } of groups.values()) {
    const target = settings.target;
    const components = [
      ...new Set(
        groupEntries
          .flatMap(([, entry]) => entry.components ?? [entry.component])
          .filter(
            (name) =>
              name !== undefined && kit.filesOf(name, target) !== undefined
          )
      ),
    ];
    const sharedFiles = groupEntries
      .filter(([, entry]) => entry.layer !== undefined)
      .map(([, entry]) => entry.source);
    let files = [];
    if (target !== undefined && settings.layout !== undefined) {
      const plan = planCopies({
        kit,
        target,
        layout: settings.layout,
        alias: settings.alias,
        own: settings.own ?? [],
        stylesheetLink: settings.stylesheetLink ?? 'component',
        requested: components,
        ledger,
        sharedFiles,
        currentSharedLayout,
      });
      files = plan.build();
      warnings.push(...plan.warnings);
    }
    const byPath = new Map(files.map((file) => [file.path, file]));
    for (const [path] of groupEntries) {
      expected.set(path, byPath.get(path)?.content);
      if (byPath.has(path)) planned.set(path, byPath.get(path));
    }
    for (const file of files) {
      if (ledger.get(file.path) === undefined && !added.has(file.path)) {
        added.set(file.path, { file, settings });
      }
    }
  }
  return {
    expected,
    planned,
    added: [...added.values()],
    warnings: [...new Set(warnings)],
  };
}
