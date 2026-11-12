// The static build, as `scaffold-ui-kit-preview build` runs it: check the
// story files and manual specs first, then generate and build the preview into
// the kit's static root. A check error stops the build, as it would leave a
// story the preview shows wrong or not at all.

import { rmSync } from 'node:fs';
import type { ConfigurationLookupOptions } from 'scaffold-ui-kit';
import type { InlineConfig } from 'vite';
import { checkPreview } from './check.js';
import { loadPreviewContext } from './context.js';
import { generatePreview } from './generate.js';
import { buildViteConfiguration } from './vite-configuration.js';

/** What a static build did. */
export interface PreviewBuildResult {
  /** Whether the preview was built: false when the check found errors. */
  built: boolean;
  /** The check's errors, each a line naming its component. */
  errors: string[];
  /** The check's warnings, which do not stop the build. */
  warnings: string[];
}

/**
 * Builds a kit's static preview: removes the previous build, checks the
 * kit's story files and manual specs, and, when the check finds no errors,
 * generates the preview with every story's html and builds it with Vite.
 *
 * @param kitRoot - The kit root (where its package.json lives).
 * @param build - The Vite build to run; Vite's own by default.
 * @param options - The kit configuration file, when it is not the one the
 *   kit root gives.
 * @returns Whether it built, the check's errors that stopped it, and its
 *   warnings.
 */
export async function buildPreview(
  kitRoot: string,
  build?: (configuration: InlineConfig) => Promise<unknown>,
  options: ConfigurationLookupOptions = {}
): Promise<PreviewBuildResult> {
  const context = loadPreviewContext(kitRoot, options);
  // The previous build goes first, so a build that fails leaves no output
  // behind that looks current.
  rmSync(context.staticRoot, { recursive: true, force: true });
  const { errors, warnings } = await checkPreview(kitRoot, options);
  if (errors.length > 0) return { built: false, errors, warnings };
  await generatePreview(context, { htmlSources: true });
  const runBuild = build ?? (await import('vite')).build;
  await runBuild(buildViteConfiguration(context));
  return { built: true, errors, warnings };
}
