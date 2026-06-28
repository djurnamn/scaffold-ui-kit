import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, sep } from 'node:path';

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
  listDriverFiles,
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
 * configured target into `dist/<target>/`, copies any hand-authored
 * drivers from `src/drivers/<target>/` in beside them, and writes a
 * per-target `index.ts` barrel re-exporting both for the framework
 * targets.
 *
 * Warnings go to stderr; written files are listed on stdout. A template
 * that fails to load or process, or a driver whose destination collides
 * with a generated file, is reported and does not stop the remaining
 * work; any failure makes the process exit non-zero.
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
    const generatedPaths = new Set<string>();

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
            loadPaths: (configuration.loadPaths ?? []).map((path) =>
              join(kitDirectory, path)
            ),
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
          generatedPaths.add(normalizeRelativePath(file.path));
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

    // Carry hand-authored drivers through into dist beside the generated
    // components they compose. The html target has no drivers (its output
    // is static previews, barrel-less); drivers are framework-only.
    if (target !== 'html') {
      for (const driver of listDriverFiles(kitDirectory, target)) {
        const relativePath = normalizeRelativePath(driver.relativePath);
        if (generatedPaths.has(relativePath)) {
          failed = true;
          console.error(
            `drivers/${target}/${driver.relativePath}: error: collides with generated dist/${target}/${driver.relativePath}; a driver must compose its Visual under a distinct name, never restate it`
          );
          continue;
        }
        const destinationPath = join(targetDirectory, driver.relativePath);
        mkdirSync(dirname(destinationPath), { recursive: true });
        copyFileSync(driver.absolutePath, destinationPath);
        console.log(`wrote ${relative(kitDirectory, destinationPath)}`);

        const barrelEntry = driverBarrelEntry(target, relativePath);
        if (barrelEntry !== undefined) {
          barrelEntries.push(barrelEntry);
        }
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

/**
 * The barrel `export` line re-exporting one driver, or `undefined` when
 * the driver is not a top-level module of the target's framework (helpers,
 * types, and files in subdirectories are imported by the driver rather
 * than re-exported from the kit).
 *
 * Drivers use `export * from` - forwarding whatever the hand-written
 * module exports (component plus any types) with no default-vs-named
 * assumption. The specifier matches the target's generated convention:
 * extensionless for react, file-suffixed for the SFC targets.
 */
function driverBarrelEntry(
  target: TargetName,
  relativePath: string
): string | undefined {
  if (target === 'html' || dirname(relativePath) !== '.') {
    return undefined;
  }
  const extension = componentFileExtensions[target];
  if (extname(relativePath) !== extension) {
    return undefined;
  }
  const specifier =
    target === 'react' ? basename(relativePath, extension) : relativePath;
  return `export * from './${specifier}';`;
}

/**
 * Normalizes a path to forward slashes so generated and copied paths
 * compare equal regardless of the platform's path separator.
 */
function normalizeRelativePath(path: string): string {
  return path.split(sep).join('/');
}
