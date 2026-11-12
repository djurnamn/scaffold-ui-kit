// Which files in a templates directory are component templates: the rule
// the kit's build reads `src/components/` by, so the preview shows a story
// for every component the build emits.

/** The extensions of a component template file, as the kit's build reads
 *  them: JSON, TypeScript and JavaScript in each module form. */
export const TEMPLATE_FILE_EXTENSIONS = [
  '.json',
  '.ts',
  '.js',
  '.mjs',
  '.cjs',
] as const;

/**
 * Whether a file name is a component template's: one of
 * {@link TEMPLATE_FILE_EXTENSIONS}, a declaration file (`.d.ts`) left out.
 *
 * @param fileName - The file's name or path.
 * @returns Whether the kit's build reads it as a template.
 * @example
 * isTemplateFile('badge.json'); // true
 * isTemplateFile('badge.d.ts'); // false
 */
export function isTemplateFile(fileName: string): boolean {
  return (
    TEMPLATE_FILE_EXTENSIONS.some((extension) =>
      fileName.endsWith(extension)
    ) && !fileName.endsWith('.d.ts')
  );
}
