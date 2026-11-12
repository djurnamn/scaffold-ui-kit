// The Sass importers the preview compiles a kit's SCSS with, in the html
// pane's stylesheets and in Vite: the kit's own `pkg:` URLs resolve as the
// kit's build resolves them.

import { createRequire } from 'node:module';
import type { KitPackageImporter } from 'scaffold-ui-kit';

/**
 * The Sass importers the preview compiles a kit's SCSS with: one per
 * package of the kit that resolves its own `pkg:` URLs, as the kit's build
 * does. Sass's own package importer is left to the copy of Sass that
 * compiles.
 *
 * @param kitRoot - The kit root.
 * @param packageDirectories - The kit's other packages' directories, absolute,
 *   for a kit built into one package per target.
 * @returns The importers, the kit root's first; none for a package whose
 *   package.json names no package.
 */
export function kitImporters(
  kitRoot: string,
  packageDirectories: readonly string[] = []
): KitPackageImporter[] {
  const { kitPackageImporter } = createRequire(import.meta.url)(
    'scaffold-ui-kit'
  ) as typeof import('scaffold-ui-kit');
  return [kitRoot, ...packageDirectories]
    .map((directory) => kitPackageImporter(directory))
    .filter((importer) => importer !== undefined);
}

/**
 * The directories of a kit's packages besides the kit root, for
 * {@link kitImporters}: none for a kit built as one package.
 *
 * @param context - The preview context's `kitPackages`.
 * @returns The directories, absolute.
 */
export function kitPackageDirectories(context: {
  kitPackages?: Array<{ directoryAbsolute: string }>;
}): string[] {
  return (context.kitPackages ?? []).map(
    ({ directoryAbsolute }) => directoryAbsolute
  );
}
