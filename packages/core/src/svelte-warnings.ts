import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

import type { SvelteMode } from './configuration';
import type { DiagnosticSeverity } from './diagnostics';

/** What the Svelte compiler says of one emitted component, one line. */
export interface SvelteWarning {
  /** `warning` for what the compiler warns of and compiles anyway; `error`
   *  when it refuses the component. */
  severity: DiagnosticSeverity;
  /** The warning's code, such as `a11y_no_static_element_interactions`. */
  code: string;
  /** The first line of the compiler's message. */
  message: string;
  /** Where it starts in the component, 1-based line and column. */
  line?: number;
  column?: number;
}

/**
 * Checks one emitted `.svelte` component's source and returns the Svelte
 * compiler's warnings for it, or the one error it stopped at.
 */
export type SvelteWarningCheck = (
  source: string,
  filename: string
) => SvelteWarning[];

/** The part of `svelte/compiler` the check uses. */
interface SvelteCompiler {
  VERSION?: string;
  compile(
    source: string,
    options: Record<string, unknown>
  ): {
    warnings: Array<{
      code: string;
      message: string;
      start?: { line: number; column: number };
    }>;
  };
}

/**
 * Creates the check that runs the kit's own Svelte compiler over the
 * Svelte target's components, in the kit's Svelte mode, generating no code.
 * The compiler is resolved from the kit, which installs `svelte` to use its
 * Svelte components; a kit without Svelte 5 or later installed gets no check.
 * A component the compiler cannot compile is one entry of severity `error`.
 * A `svelte-ignore` comment in the emitted component silences its warning as
 * it does in any Svelte build.
 *
 * @param kitDirectory - The kit root, absolute.
 * @param mode - The kit's Svelte mode; defaults to `legacy`.
 * @returns The check, or `undefined` when the kit has no usable compiler.
 * @example
 * ```ts
 * const check = createSvelteWarningCheck(kitDirectory, 'runes');
 * check?.(source, 'Slider.svelte'); // [{ severity: 'warning', code: 'a11y_...', message: '...', line: 4, column: 3 }]
 * ```
 */
export function createSvelteWarningCheck(
  kitDirectory: string,
  mode: SvelteMode = 'legacy'
): SvelteWarningCheck | undefined {
  const manifest = svelteManifestOf(resolve(kitDirectory));
  if (manifest === undefined) {
    return undefined;
  }
  let compiler: SvelteCompiler;
  try {
    // Through the package's own name, so its exports pick the entry.
    compiler = createRequire(manifest)('svelte/compiler') as SvelteCompiler;
  } catch {
    return undefined;
  }
  const major = Number.parseInt(compiler.VERSION ?? '', 10);
  if (!(major >= 5) || typeof compiler.compile !== 'function') {
    return undefined;
  }
  return (source, filename) => {
    try {
      const { warnings } = compiler.compile(withoutPreprocessedStyles(source), {
        filename,
        generate: false,
        runes: mode === 'runes',
      });
      return warnings.map((warning) => ({
        severity: 'warning',
        code: warning.code,
        message: firstLine(warning.message),
        line: warning.start?.line,
        // The compiler counts columns from zero.
        column:
          warning.start === undefined ? undefined : warning.start.column + 1,
      }));
    } catch (error) {
      const failure = error as {
        code?: string;
        message?: string;
        start?: { line: number; column: number };
      };
      return [
        {
          severity: 'error',
          code: failure.code ?? 'compile_error',
          message: `the Svelte compiler could not compile the component: ${firstLine(failure.message ?? String(error))}`,
          line: failure.start?.line,
          column:
            failure.start === undefined ? undefined : failure.start.column + 1,
        },
      ];
    }
  };
}

/**
 * The `package.json` of the `svelte` the kit installs, looked up through the
 * `node_modules` directories from the kit root up, as Node resolves a
 * package; the paths Node adds beyond those (`NODE_PATH`) are not the kit's.
 */
function svelteManifestOf(kitDirectory: string): string | undefined {
  let directory = kitDirectory;
  for (;;) {
    const manifest = join(directory, 'node_modules', 'svelte', 'package.json');
    if (existsSync(manifest)) {
      return manifest;
    }
    const parent = dirname(directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;
  }
}

/**
 * The source with the content of each `<style>` block that names a `lang`
 * (such as `scss`) blanked, since the compiler reads only CSS and a kit's
 * bundler preprocesses the rest. Its newlines stay, so the lines of the
 * warnings after it are the emitted file's.
 */
function withoutPreprocessedStyles(source: string): string {
  return source.replace(
    /(<style\b[^>]*\blang\s*=[^>]*>)([\s\S]*?)(<\/style>)/g,
    (_match, opening: string, content: string, closing: string) =>
      `${opening}${content.replace(/[^\n]/g, '')}${closing}`
  );
}

/** A compiler message's first line, without its documentation link. */
function firstLine(message: string): string {
  return message.split('\n')[0].trim();
}
