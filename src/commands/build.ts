import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';

import { process as processTemplate } from '@js-template-engine/core';

import {
  loadConfiguration,
  type KitConfiguration,
  type TargetName,
} from '../configuration';
import { buildExtensions } from '../extensions';
import {
  componentNameFromFilePath,
  listComponentTemplates,
  loadTemplate,
} from '../template-sources';

/** The file extension of each framework target's component file. */
const componentFileExtensions: Record<Exclude<TargetName, 'html'>, string> = {
  react: '.tsx',
  vue: '.vue',
  svelte: '.svelte',
};

/**
 * Builds a kit: renders every template in `src/components/` once per
 * configured target into `dist/<target>/`, plus a per-target `index.ts`
 * barrel for the framework targets.
 *
 * Warnings go to stderr; written files are listed on stdout. A template
 * that fails to load or process is reported and does not stop the
 * remaining work; any failure makes the process exit non-zero.
 *
 * @param kitDirectory - The kit root directory; defaults to the working
 *   directory.
 */
export async function buildCommand(
  kitDirectory: string = process.cwd()
): Promise<void> {
  let configuration: KitConfiguration;
  let templatePaths: string[];
  try {
    configuration = loadConfiguration(kitDirectory);
    templatePaths = listComponentTemplates(kitDirectory);
  } catch (error) {
    console.error(
      `error: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
    return;
  }

  if (templatePaths.length === 0) {
    console.error(
      'error: no component templates found in src/components; add a template and rerun'
    );
    process.exitCode = 1;
    return;
  }

  let failed = false;
  for (const target of configuration.targets) {
    const targetDirectory = join(kitDirectory, 'dist', target);
    const barrelEntries: string[] = [];

    for (const templatePath of templatePaths) {
      const label = relative(kitDirectory, templatePath);
      try {
        const template = await loadTemplate(templatePath);
        const result = processTemplate(template, {
          componentName: componentNameFromFilePath(templatePath),
          extensions: buildExtensions(target, configuration),
          styling: {
            outputStrategy: configuration.stylingStrategy ?? 'in-file',
            language: configuration.stylingLanguage ?? 'css',
          },
          scripting: {
            outputStrategy: configuration.scriptingStrategy ?? 'in-file',
            language: configuration.scriptingLanguage ?? 'javascript',
          },
        });

        for (const warning of result.warnings) {
          const location =
            warning.nodePath === undefined || warning.nodePath === ''
              ? ''
              : ` (at ${warning.nodePath})`;
          console.error(`${label}: warning: ${warning.message}${location}`);
        }

        for (const file of result.files) {
          const filePath = join(targetDirectory, file.path);
          mkdirSync(dirname(filePath), { recursive: true });
          writeFileSync(filePath, file.content);
          console.log(`wrote ${relative(kitDirectory, filePath)}`);
        }

        const barrelEntry = barrelEntryFor(target, result.files);
        if (barrelEntry !== undefined) {
          barrelEntries.push(barrelEntry);
        }
      } catch (error) {
        failed = true;
        console.error(
          `${label}: error: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (barrelEntries.length > 0) {
      const barrelPath = join(targetDirectory, 'index.ts');
      writeFileSync(barrelPath, `${barrelEntries.join('\n')}\n`);
      console.log(`wrote ${relative(kitDirectory, barrelPath)}`);
    }
  }

  if (failed) {
    process.exitCode = 1;
  }
}

/**
 * The barrel `export` line re-exporting one rendered component, derived
 * from the target's component file among the rendered output files. The
 * `html` target gets no barrel.
 */
function barrelEntryFor(
  target: TargetName,
  files: Array<{ path: string }>
): string | undefined {
  if (target === 'html') {
    return undefined;
  }
  const extension = componentFileExtensions[target];
  const componentFile = files.find((file) => extname(file.path) === extension);
  if (componentFile === undefined) {
    return undefined;
  }
  const componentName = basename(componentFile.path, extension);
  return target === 'react'
    ? `export { ${componentName} } from './${componentName}';`
    : `export { default as ${componentName} } from './${componentFile.path}';`;
}
