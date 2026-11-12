// Load a component's story file (stories/<Name>.story.ts, default export) if
// present. Also decides the omit by name: a kit whose naming marks a compound's
// parts declares the pattern (`preview.omitPattern`), and a matching
// component gets no story of its own.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Story } from './lib/types.js';
import type { ModuleImporter } from './lib/types.js';

/** Whether the kit's `omitPattern` leaves this component out by its name. */
export function isStructurallyOmitted(
  name: string,
  omitPattern?: RegExp
): boolean {
  return omitPattern?.test(name) ?? false;
}

export async function loadStory(
  name: string,
  storiesDirectory: string | undefined,
  importModule: ModuleImporter
): Promise<Story | undefined> {
  if (!storiesDirectory) return undefined;
  const file = resolve(storiesDirectory, `${name}.story.ts`);
  if (!existsSync(file)) return undefined;
  const mod = (await importModule(file)) as { default?: Story };
  // A story file that exports nothing would silently drop the component's
  // curation (its defaults, slots and scenarios), so it is an error. The module
  // importer's interop answers `default` even when none is exported, so the
  // export is looked for among the module's own keys.
  if (
    !Object.keys(mod).includes('default') ||
    !mod.default ||
    typeof mod.default !== 'object'
  ) {
    throw new Error(
      `[preview] ${file} must default-export the ${name} story object`
    );
  }
  return mod.default;
}
