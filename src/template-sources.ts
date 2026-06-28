import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';

import type { Template } from '@js-template-engine/types';
import { createJiti } from 'jiti';

/** The file extensions recognized as component template sources. */
const templateFileExtensions = ['.json', '.ts', '.js', '.mjs', '.cjs'];

const jiti = createJiti(__filename, { interopDefault: true });

/**
 * Lists the component template files of a kit, sorted by name.
 *
 * Templates live directly in `src/components/`; subdirectories are not
 * searched.
 *
 * @param kitDirectory - The kit root directory.
 * @returns Absolute paths of the kit's template files.
 */
export function listComponentTemplates(kitDirectory: string): string[] {
  const componentsDirectory = join(kitDirectory, 'src', 'components');
  if (!existsSync(componentsDirectory)) {
    throw new Error(
      `No src/components directory found in '${kitDirectory}'. Run this command in a kit created by scaffold-ui-kit.`
    );
  }
  return readdirSync(componentsDirectory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        templateFileExtensions.includes(extname(entry.name)) &&
        !entry.name.endsWith('.d.ts')
    )
    .map((entry) => join(componentsDirectory, entry.name))
    .sort();
}

/** A hand-authored driver file discovered under `src/drivers/<target>/`. */
export interface DriverFile {
  /** Absolute path of the source file. */
  absolutePath: string;
  /**
   * Path relative to `src/drivers/<target>/`, preserving subdirectories;
   * the same path the file is copied to under `dist/<target>/`.
   */
  relativePath: string;
}

/**
 * Lists the hand-authored driver files of a kit for one target.
 *
 * Drivers live under `src/drivers/<target>/` and are copied verbatim into
 * `dist/<target>/` by the `build` command (ship-raw / copy-and-own). The
 * search is recursive so a driver's helpers and types in subdirectories
 * are carried through unchanged. A missing directory yields an empty list.
 *
 * @param kitDirectory - The kit root directory.
 * @param target - The framework target whose drivers to list.
 * @returns The driver files, sorted by relative path.
 */
export function listDriverFiles(
  kitDirectory: string,
  target: string
): DriverFile[] {
  const driversDirectory = join(kitDirectory, 'src', 'drivers', target);
  if (!existsSync(driversDirectory)) {
    return [];
  }
  const files: DriverFile[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
      } else if (entry.isFile()) {
        files.push({
          absolutePath,
          relativePath: relative(driversDirectory, absolutePath),
        });
      }
    }
  };
  walk(driversDirectory);
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/**
 * Loads a component template from a file.
 *
 * `.json` files are parsed as JSON; the other template extensions are
 * loaded as modules and must default-export the template.
 *
 * @param filePath - Absolute path of the template file.
 * @returns The template the file defines.
 */
export async function loadTemplate(filePath: string): Promise<Template> {
  if (extname(filePath) === '.json') {
    return JSON.parse(readFileSync(filePath, 'utf8')) as Template;
  }

  const template = await jiti.import(filePath, { default: true });
  if (!isTemplateShaped(template)) {
    throw new Error(`'${filePath}' does not default-export a template`);
  }
  return template as Template;
}

/**
 * Derives a component name from a template file path: the base name in
 * PascalCase (`theme-toggle.ts` → `ThemeToggle`), used when the template
 * declares no `ComponentNode` name of its own.
 *
 * @param filePath - The template file path.
 * @returns The derived component name.
 */
export function componentNameFromFilePath(filePath: string): string {
  const stem = basename(filePath, extname(filePath));
  const name = stem
    .split(/[^a-zA-Z0-9]+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');
  if (name === '') {
    return 'Component';
  }
  return /^[0-9]/.test(name) ? `_${name}` : name;
}

/**
 * Whether a module's default export has a template's root shape - a node
 * array or a node object. Modules without a default export resolve to
 * their namespace object, which this rules out.
 */
function isTemplateShaped(value: unknown): boolean {
  if (Array.isArray(value)) {
    return true;
  }
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}
