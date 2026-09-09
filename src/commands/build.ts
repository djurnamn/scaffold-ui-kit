import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, sep } from 'node:path';

import { process as processTemplate } from '@js-template-engine/core';
import type { StyleLayer } from '@js-template-engine/types';

import {
  loadConfiguration,
  type KitConfiguration,
  type TargetName,
} from '../configuration';
import { buildExtensions } from '../extensions';
import { writeConsumerCli } from '../scaffold';
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

  // A shared layer the consumer CLI would copy has to exist in the kit; a
  // missing one is a configuration error, caught here rather than in the
  // consumer's project.
  const missingSharedSources = (configuration.add?.shared ?? [])
    .map((layer) => layer.source)
    .filter((source) => !existsSync(join(kitDirectory, source)));
  if (missingSharedSources.length > 0) {
    console.error(
      `error: add.shared names ${missingSharedSources.map((source) => `'${source}'`).join(', ')}, which do${missingSharedSources.length === 1 ? 'es' : ''} not exist in the kit`
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
            stylesheetLink: configuration.stylesheetLink ?? 'component',
            loadPaths: (configuration.loadPaths ?? []).map((path) =>
              join(kitDirectory, path)
            ),
            layer: stylingLayerOf(configuration),
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

  // The consumer CLI is this package's, not the kit's: refresh it on every
  // build so a kit scaffolded by an earlier release ships the current one.
  console.log(`wrote ${writeConsumerCli(kitDirectory)}`);

  if (failed) {
    process.exitCode = 1;
  }
}

/**
 * The cascade layer the kit's emitted stylesheet rules are wrapped in. The
 * configuration accepts a bare layer name as shorthand for the object form.
 *
 * @param configuration - The kit configuration.
 * @returns The layer, or `undefined` when the kit configures none.
 */
function stylingLayerOf(
  configuration: KitConfiguration
): StyleLayer | undefined {
  const layer = configuration.stylingLayer;
  if (layer === undefined) {
    return undefined;
  }
  return typeof layer === 'string' ? { name: layer } : layer;
}

/**
 * The barrel `export` entry re-exporting one rendered component, derived
 * from the target's component file among the rendered output files. The
 * `html` target gets no barrel.
 *
 * The entry carries the component's full module surface, so an
 * `export type` / `export interface` the template declares is importable
 * from the barrel beside the component. React components are named
 * exports, so `export * from` alone covers them (the same form drivers
 * get). An SFC module's component is its default export - which a star
 * export never forwards - so the SFC targets pair a named default
 * re-export with the star line; at runtime the star line is a no-op (a
 * compiled SFC's runtime surface is its default export), it exists for
 * the type checker.
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
    ? `export * from './${componentName}';`
    : `export { default as ${componentName} } from './${componentFile.path}';\nexport * from './${componentFile.path}';`;
}

/**
 * The barrel `export` line re-exporting one driver, or `undefined` when
 * the driver is not a top-level module of the target's framework (helpers,
 * types, and files in subdirectories are imported by the driver rather
 * than re-exported from the kit).
 *
 * Drivers get the same per-target rule as generated components. React
 * drivers author their component as a named export, so `export * from`
 * forwards the component and any types with no further assumption. An SFC
 * driver's component is the module's default export - which a star export
 * never forwards - so the SFC targets pair a named default re-export
 * (named after the file) with the star line for the driver's types. The
 * specifier matches the target's generated convention: extensionless for
 * react, file-suffixed for the SFC targets.
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
  const driverName = basename(relativePath, extension);
  return target === 'react'
    ? `export * from './${driverName}';`
    : `export { default as ${driverName} } from './${relativePath}';\nexport * from './${relativePath}';`;
}

/**
 * Normalizes a path to forward slashes so generated and copied paths
 * compare equal regardless of the platform's path separator.
 */
function normalizeRelativePath(path: string): string {
  return path.split(sep).join('/');
}
