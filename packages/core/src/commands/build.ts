import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {
  basename,
  dirname,
  extname,
  join,
  posix,
  relative,
  resolve,
  sep,
} from 'node:path';

import {
  LAYER_ORDER_MODULE_FILE,
  process as processTemplate,
  validateTemplate,
} from '@js-template-engine/core';
import type { StyleLayer, Template } from '@js-template-engine/types';

import {
  resolveKitConfiguration,
  type ConfigurationLookupOptions,
  type KitConfiguration,
  type KitStylesheetLink,
  type TargetName,
} from '../configuration';
import {
  hashOf,
  readBuildRecord,
  removeStaleOutput,
  writeBuildRecord,
} from '../build-record';
import { createDiagnosticLog, type DiagnosticLog } from '../diagnostics';
import { kitSassImporters, type KitSassImporters } from '../package-importer';
import { buildExtensions, everyTargetExtension } from '../extensions';
import {
  createKitManifest,
  importsOf,
  KIT_MANIFEST_PATH,
  type BuiltComponentFiles,
} from '../kit-manifest';
import {
  isBareSpecifier,
  packageNameOf,
  packageOfPath,
  readKitLayout,
  readPackageJson,
  targetCommandName,
  writeTargetPackage,
  type KitLayout,
  type KitPackage,
} from '../kit-packages';
import { importOf } from '../package-exports';
import { hasConsumerCli, writeConsumerCli } from '../scaffold';
import {
  createSvelteWarningCheck,
  type SvelteWarningCheck,
} from '../svelte-warnings';
import {
  compileLinkedStylesheets,
  moduleSpecifier,
  LINKED_DIRECTORY,
  UNLINKED_DIRECTORY,
  writeStylesheetLinks,
  type ScriptedTargetName,
  type StylesheetLinkOutput,
  type TargetStylesheets,
} from '../stylesheet-links';

/** Where a 'both' build writes the compiled stylesheets its targets share. */
const defaultCompiledStylesheetDirectory = join('dist', 'stylesheets');

/** The html target's pages, rendered unlinked under 'both'. */
interface LinkedPages {
  targetDirectory: string;
  pages: string[];
}

/** A scripted target rendered unlinked, awaiting its compiled stylesheets. */
interface LinkedTarget {
  target: ScriptedTargetName;
  targetDirectory: string;
  modules: string[];
  /** The components that failed for the target. */
  failedComponents: Set<string>;
  /** The failed components its indexes keep from the last build. */
  kept: Set<string>;
}
import {
  componentNameFromFilePath,
  listComponentTemplates,
  listDriverFiles,
  loadTemplate,
} from '../template-sources';

/** The extensions of the stylesheets `separate-file` emits or an import names. */
const stylesheetExtensions = ['.css', '.scss', '.sass'];

/** The file extension of each scripted target's component file. */
const componentFileExtensions: Record<Exclude<TargetName, 'html'>, string> = {
  react: '.tsx',
  vue: '.vue',
  svelte: '.svelte',
};

/**
 * Builds a kit: renders every template in `src/components/` once per
 * configured target into `dist/<target>/`, copies any hand-authored
 * drivers from `src/drivers/<target>/` in beside them, and writes a
 * per-target `index.ts` barrel re-exporting both for the scripted
 * targets.
 *
 * Under `stylesheetLink: 'both'` the scripted targets render unlinked and
 * publish each component linked and unlinked: `index.ts` re-exports a
 * linked module per component (see {@link writeStylesheetLinks}) and
 * `unlinked/index.ts` re-exports the modules themselves. The html target
 * renders unlinked too, and each page then links its compiled stylesheet.
 *
 * Each build records the files it wrote in
 * `node_modules/.cache/scaffold-ui-kit/build-record.json` and removes what the previous build
 * wrote and this one did not, such as the output of a deleted template.
 * Files the kit put in `dist/` itself, and recorded files changed since, are
 * left alone; a build with a failure removes nothing. Its barrels and
 * `_index.scss` name this build's modules and, from the last build's, each
 * failed component's whose files are still in place (see
 * {@link withLastEntries}).
 *
 * Warnings go to stderr; written files are listed on stdout. Each template
 * is loaded and validated once, before any target renders it, and one that
 * fails is reported once and rendered for no target. The diagnostics of the
 * renders are printed together once every target has run: one that every
 * target reports, once, and one only some report, labeled with those
 * targets. A template that fails to load, validate or process, or a driver
 * whose destination collides with a generated file, is reported and does
 * not stop the remaining work; any failure makes the process exit
 * non-zero.
 *
 * @param kitDirectory - The kit root directory; defaults to the working
 *   directory.
 * @param options - The configuration file to read in place of the one the
 *   kit's `package.json` or root gives.
 */
export async function buildCommand(
  kitDirectory: string = process.cwd(),
  options: ConfigurationLookupOptions = {}
): Promise<void> {
  let configuration: KitConfiguration;
  let configurationName: string;
  let templatePaths: string[];
  try {
    const resolved = resolveKitConfiguration(kitDirectory, options);
    configuration = resolved.configuration;
    configurationName = resolved.file.name;
    for (const warning of resolved.warnings) {
      console.error(warning);
    }
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

  if (
    configuration.scriptingStrategy !== undefined ||
    configuration.scriptingLanguage !== undefined
  ) {
    console.error(
      `${configurationName}: warning: scriptingStrategy and scriptingLanguage are deprecated, ` +
        'have no effect and will be removed in 3.0.0; the html target writes events as comments and emits no script.'
    );
  }

  const deprecatedSharedKeys = (configuration.add?.shared ?? []).flatMap(
    (layer, index) =>
      (['destination', 'specifier'] as const)
        .filter((key) => layer[key] !== undefined)
        .map((key) => `add.shared[${index}].${key}`)
  );
  if (deprecatedSharedKeys.length > 0) {
    console.error(
      `${configurationName}: warning: ${deprecatedSharedKeys.join(', ')} ${deprecatedSharedKeys.length === 1 ? 'is' : 'are'} deprecated, ` +
        `ha${deprecatedSharedKeys.length === 1 ? 's' : 've'} no effect and will be removed in 3.0.0; a shared module's import comes from package.json exports, and a consumer's settings place it by its 'name'.`
    );
  }

  const { layout, errors: layoutErrors } = readKitLayout(
    kitDirectory,
    configuration
  );
  if (layoutErrors.length > 0) {
    for (const error of layoutErrors) {
      console.error(error);
    }
    process.exitCode = 1;
    return;
  }
  // Every package directory the build writes into, the kit root first.
  const outputRoots = [
    kitDirectory,
    ...(layout?.packages.slice(1).map((entry) => entry.directory) ?? []),
  ];

  const loadPaths = (configuration.loadPaths ?? []).map((path) =>
    join(kitDirectory, path)
  );
  const sassImporters = kitSassImporters(kitDirectory, outputRoots.slice(1));

  const diagnostics = createDiagnosticLog();
  const svelteWarnings = svelteWarningCheckOf(kitDirectory, configuration);
  const loaded = await loadTemplates(kitDirectory, templatePaths, diagnostics);
  const templates = loaded.templates;
  let failed = loaded.failed;
  // The components whose template failed to load or validate, so no target
  // rendered them; each target adds the ones that failed to render there.
  const failedEverywhere = new Set(loaded.failedComponents);
  // Per target, the failed components the indexes keep from the last build.
  const keptByTarget = new Map<TargetName, Set<string>>();

  // Every file this build writes, so the output of the previous build that
  // this one no longer produces can be told apart and removed.
  const writtenPaths = new Set<string>();
  const linkedTargets: LinkedTarget[] = [];
  let linkedPages: LinkedPages | undefined;
  // Every target's emitted stylesheets, compiled once all have rendered.
  const stylesheetTargets: TargetStylesheets[] = [];
  // In a kit built into packages, each emitted stylesheet's content per
  // target, by its path, and each target's sheets, all written into the
  // styles package once every target has rendered.
  const emittedSheets = new Map<string, Map<TargetName, string>>();
  const packagedTargets: PackagedStylesheets[] = [];
  // The generated module stating the layer order, which each emitted SCSS
  // sheet loads first: the same under every target and component, written
  // once into every directory the build writes such sheets into, and
  // recorded per target for the manifest.
  let layerOrderModule: string | undefined;
  const layerOrderModulesByTarget = new Map<TargetName, string[]>();
  const writeLayerOrderModule = (
    target: TargetName,
    directory: string,
    content: string
  ): void => {
    const path = join(directory, LAYER_ORDER_MODULE_FILE);
    if (!writtenPaths.has(path)) {
      mkdirSync(directory, { recursive: true });
      writeFileSync(path, content);
      writtenPaths.add(path);
      console.log(`wrote ${relative(kitDirectory, path)}`);
    }
    const paths = layerOrderModulesByTarget.get(target) ?? [];
    if (!paths.includes(path)) {
      layerOrderModulesByTarget.set(target, [...paths, path]);
    }
  };
  // Each component's files per target, for the kit manifest.
  const builtComponents = new Map<
    string,
    Partial<Record<TargetName, BuiltComponentFiles>>
  >();
  const recordBuilt = (
    name: string,
    target: TargetName,
    files: BuiltComponentFiles
  ): void => {
    builtComponents.set(name, {
      ...builtComponents.get(name),
      [target]: files,
    });
  };
  // The diagnostics print however the loop ends, so a failure outside a
  // template's own render does not hide the ones gathered before it.
  try {
    for (const target of configuration.targets) {
      const targetPackage =
        target === 'html' ? undefined : layout?.targets.get(target);
      const targetDirectory =
        targetPackage === undefined
          ? join(kitDirectory, 'dist', target)
          : join(targetPackage.directory, 'dist');
      const barrelModules: string[] = [];
      const generatedPaths = new Set<string>();
      const stylesheetPaths: string[] = [];
      // Under 'both' every target renders unlinked: the scripted targets get
      // linked modules, and a static page - which no module imports - links
      // its compiled stylesheet once the build has compiled them all.
      const writesLinks =
        configuration.stylesheetLink === 'both' && target !== 'html';
      const linksPages =
        configuration.stylesheetLink === 'both' && target === 'html';
      const pagePaths: string[] = [];
      const failedComponents = new Set(failedEverywhere);
      const kept = new Set<string>();
      keptByTarget.set(target, kept);

      for (const { templatePath, label, template } of templates) {
        try {
          const result = renderTemplate(
            { templatePath, label, template },
            target,
            configuration,
            loadPaths,
            sassImporters,
            diagnostics,
            svelteWarnings,
            normalizeRelativePath(relative(kitDirectory, targetDirectory))
          );
          // Its files are written all the same, to be read; the component
          // stays in the target's indexes, since this build wrote it.
          failed = failed || !result.compiles;

          for (const file of result.files) {
            if (basename(file.path) === LAYER_ORDER_MODULE_FILE) {
              // Written beside what loads it: the sheets here, or where a
              // kit built into packages places them; a component that keeps
              // its styles in its own style block loads it beside itself,
              // in its target's directory either way.
              layerOrderModule = file.content;
              generatedPaths.add(normalizeRelativePath(file.path));
              if (
                layout === undefined ||
                (configuration.stylesheetPlacement ?? 'in-file') !==
                  'separate-file'
              ) {
                writeLayerOrderModule(
                  target,
                  join(targetDirectory, dirname(file.path)),
                  file.content
                );
              }
              continue;
            }
            if (
              layout !== undefined &&
              stylesheetExtensions.includes(extname(file.path))
            ) {
              const sheetPath = normalizeRelativePath(file.path);
              emittedSheets.set(
                sheetPath,
                (emittedSheets.get(sheetPath) ?? new Map()).set(
                  target,
                  file.content
                )
              );
              stylesheetPaths.push(sheetPath);
              continue;
            }
            const filePath = join(targetDirectory, file.path);
            mkdirSync(dirname(filePath), { recursive: true });
            writeFileSync(filePath, file.content);
            writtenPaths.add(filePath);
            generatedPaths.add(normalizeRelativePath(file.path));
            if (stylesheetExtensions.includes(extname(file.path))) {
              stylesheetPaths.push(normalizeRelativePath(file.path));
            }
            if (extname(file.path) === '.html') {
              pagePaths.push(normalizeRelativePath(file.path));
            }
            console.log(`wrote ${relative(kitDirectory, filePath)}`);
          }

          const componentModule = componentModuleOf(target, result.files);
          if (componentModule !== undefined) {
            barrelModules.push(componentModule);
          }
          const componentFile =
            componentModule ??
            result.files.find((file) => extname(file.path) === '.html')?.path;
          // The component's own stylesheet, never the layer order module a
          // style block loads beside it.
          const stylesheetFile = result.files.find(
            (file) =>
              stylesheetExtensions.includes(extname(file.path)) &&
              basename(file.path) !== LAYER_ORDER_MODULE_FILE
          )?.path;
          if (componentFile !== undefined) {
            // A component is known by the module it renders to, which its
            // template's name gives.
            recordBuilt(
              basename(componentFile, extname(componentFile)),
              target,
              {
                component: join(targetDirectory, componentFile),
                ...(stylesheetFile === undefined
                  ? {}
                  : { stylesheet: join(targetDirectory, stylesheetFile) }),
              }
            );
          }
        } catch (error) {
          failed = true;
          failedComponents.add(componentNameFromFilePath(templatePath));
          diagnostics.recordError(label, error, target);
        }
      }

      // Carry hand-authored drivers through into dist beside the generated
      // components they compose. The html target has no drivers (its output
      // is static previews, barrel-less); drivers belong to the scripted
      // targets.
      if (target !== 'html') {
        // The stylesheet index lands here for a target with SCSS sheets, or
        // with a failed component whose last entry it keeps, unless the
        // styles package takes it.
        const writesStylesheetIndex =
          layout === undefined &&
          (stylesheetPaths.some((path) => extname(path) === '.scss') ||
            (failedComponents.size > 0 &&
              configuration.stylingLanguage === 'scss'));
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
          const reserved = reservedOutputPath(
            relativePath,
            writesLinks,
            writesStylesheetIndex
          );
          if (reserved !== undefined) {
            failed = true;
            console.error(
              `drivers/${target}/${driver.relativePath}: error: collides with ${reserved} the build writes at ${normalizeRelativePath(relative(kitDirectory, destinationPath))}; rename the driver`
            );
            continue;
          }
          mkdirSync(dirname(destinationPath), { recursive: true });
          copyFileSync(driver.absolutePath, destinationPath);
          writtenPaths.add(destinationPath);
          console.log(`wrote ${relative(kitDirectory, destinationPath)}`);

          if (isDriverModule(target, relativePath)) {
            barrelModules.push(relativePath);
            recordBuilt(basename(relativePath, extname(relativePath)), target, {
              component: destinationPath,
            });
          }
        }
      }

      if (layout !== undefined) {
        // Placed in the styles package once every target has rendered.
        packagedTargets.push({
          target,
          targetDirectory,
          stylesheets: stylesheetPaths,
          failedComponents,
          kept,
        });
      } else {
        writeIndexOf(
          kitDirectory,
          targetDirectory,
          stylesheetPaths.map((path) => join(targetDirectory, path)),
          failedComponents,
          kept,
          writtenPaths
        );
      }

      // Under 'both' the linked modules link the compiled sheets from
      // `linked/`, and the pages from beside them; otherwise the compiled sheets are only
      // for consumers, and one that differs per target lands beside its
      // source.
      if (layout === undefined) {
        stylesheetTargets.push({
          target,
          targetDirectory,
          stylesheets: stylesheetPaths,
          ...(configuration.stylesheetLink === 'both'
            ? target === 'html'
              ? { linkDirectory: targetDirectory }
              : {}
            : {
                linkDirectory: targetDirectory,
                differingDirectory: targetDirectory,
              }),
        });
      }

      if (linksPages) {
        linkedPages = {
          targetDirectory,
          pages: pagePaths,
        };
      }

      if (target === 'html' || barrelModules.length === 0) {
        continue;
      }

      if (!writesLinks) {
        const barrelPath = join(targetDirectory, 'index.ts');
        writeBarrel(
          kitDirectory,
          barrelPath,
          writtenPaths,
          withLastEntries(
            barrelPath,
            barrelModules.map((modulePath) =>
              barrelEntry(
                target,
                basename(modulePath, extname(modulePath)),
                `./${moduleSpecifier(target, modulePath)}`
              )
            ),
            failedComponents,
            kept
          )
        );
        continue;
      }

      // The linked modules wait for every target: a stylesheet compiled the
      // same on all of them is written once and linked from each.
      linkedTargets.push({
        target,
        targetDirectory,
        modules: barrelModules,
        failedComponents,
        kept,
      });
    }
  } finally {
    for (const line of diagnostics.lines(configuration.targets)) {
      console.error(line);
    }
    if (
      configuration.targets.includes('svelte') &&
      svelteWarnings === undefined
    ) {
      console.error(SVELTE_CHECK_SKIPPED_NOTE);
    }
  }

  if (layout !== undefined) {
    const placed = placeStylesheets(
      kitDirectory,
      layout,
      configuration,
      emittedSheets,
      packagedTargets,
      writtenPaths,
      layerOrderModule === undefined
        ? undefined
        : { content: layerOrderModule, write: writeLayerOrderModule }
    );
    stylesheetTargets.push(...placed);
    // Each component's stylesheet is where the styles package holds it.
    for (const entry of placed) {
      for (const perTarget of builtComponents.values()) {
        const built = perTarget[entry.target];
        if (built?.stylesheet === undefined) continue;
        const sheet = normalizeRelativePath(
          relative(entry.targetDirectory, built.stylesheet)
        );
        built.stylesheet = entry.sources?.get(sheet) ?? built.stylesheet;
      }
    }
  }

  const emitsStylesheets = stylesheetTargets.some(
    (entry) => entry.stylesheets.length > 0
  );
  if (
    emitsStylesheets ||
    linkedTargets.length > 0 ||
    linkedPages !== undefined
  ) {
    // Each component's sheet is compiled for the linked modules, or for a
    // consumer who owns a component and imports the kit's CSS for its
    // stylesheet, which a kit offers by declaring partial ownership. A kit
    // that declares nothing compiles no more than its linked modules need.
    const compilesSheets =
      configuration.stylesheetLink === 'both' ||
      configuration.add?.ownership === 'partial';
    const compiled = compileLinkedStylesheets({
      targets: compilesSheets
        ? stylesheetTargets
        : stylesheetTargets.map((entry) => ({
            ...entry,
            stylesheets: entry.stylesheets.filter(
              (path) => extname(path) === '.css'
            ),
          })),
      loadPaths,
      importers: sassImporters,
      layerOrder: stylingLayerOf(configuration)?.order,
      sharedDirectory: join(
        layout?.styles.directory ?? kitDirectory,
        configuration.compiledStylesheetDirectory ??
          defaultCompiledStylesheetDirectory
      ),
      // In a kit built into packages, a linked module imports its stylesheet
      // from the styles package, by the specifier that package publishes it
      // under.
      ...(layout !== undefined && configuration.stylesheetLink === 'both'
        ? {
            linkSpecifier: (path: string) =>
              importOf(
                layout.styles.name,
                layout.styles.packageJson.exports,
                normalizeRelativePath(relative(layout.styles.directory, path))
              ),
          }
        : {}),
    });
    for (const writtenPath of compiled.writtenPaths) {
      writtenPaths.add(writtenPath);
      console.log(`wrote ${relative(kitDirectory, writtenPath)}`);
    }
    for (const error of compiled.errors) {
      failed = true;
      console.error(error);
    }
    if (layout !== undefined && compiled.unlinked.length > 0) {
      failed = true;
      const stylesPackage = join(layout.styles.directory, 'package.json');
      const paths = compiled.unlinked.map((path) =>
        normalizeRelativePath(relative(layout.styles.directory, path))
      );
      const directory = posix.dirname(paths[0]);
      console.error(
        `${normalizeRelativePath(relative(kitDirectory, stylesPackage))}: error: no export reaches ${paths.slice(0, 3).join(', ')}${paths.length > 3 ? ` and ${paths.length - 3} more` : ''}, which the linked modules import; for example, add "./${directory.replace(/^dist\/?/, '') || 'stylesheets'}/*.css": "./${directory}/*.css" to "exports"`
      );
    }
    for (const linkedTarget of linkedTargets) {
      const linked = writeLinks(
        kitDirectory,
        linkedTarget,
        compiled.links.get(linkedTarget.target) ?? new Map(),
        writtenPaths
      );
      for (const output of linked) {
        const built = builtComponents.get(output.name)?.[linkedTarget.target];
        if (built !== undefined) {
          built.linked = join(linkedTarget.targetDirectory, output.path);
        }
      }
    }
    if (linkedPages !== undefined) {
      linkPages(linkedPages, compiled.links.get('html') ?? new Map());
    }
    for (const [target, paths] of compiled.compiledPaths) {
      for (const [moduleKey, css] of paths) {
        const built = builtComponents.get(moduleKey)?.[target];
        if (built !== undefined) {
          built.css = css;
        }
      }
    }
  }

  const previousRecord = readBuildRecord(kitDirectory);

  // The manifest describes a whole build, so a failed one leaves the last
  // good manifest in place. In a kit built into packages, each target's
  // package gets its package.json, its consumer command and a manifest of
  // its own; the kit root gets none.
  if (!failed && layout === undefined) {
    failed = !writeKitManifest(
      kitDirectory,
      configuration,
      configurationName,
      templates,
      builtComponents,
      [...new Set([...layerOrderModulesByTarget.values()].flat())],
      writtenPaths
    );
  } else if (!failed && layout !== undefined) {
    for (const [target, targetPackage] of layout.targets) {
      const danglingImports = danglingRelativeImportsOf({
        kitDirectory,
        layout,
        targetPackage,
        stylesheets: stylesheetTargets.find((entry) => entry.target === target),
        writtenPaths,
        previousRecord,
        stylesheetLink: configuration.stylesheetLink ?? 'component',
      });
      if (danglingImports.length > 0) {
        for (const error of danglingImports) {
          console.error(error);
        }
        failed = true;
        continue;
      }
      const result = writeTargetPackage({
        layout,
        target,
        configuration,
        imports: packageImportsOf(
          kitDirectory,
          targetPackage.directory,
          writtenPaths
        ),
      });
      for (const error of result.errors) {
        console.error(error);
      }
      if (result.errors.length > 0) {
        failed = true;
        continue;
      }
      targetPackage.packageJson = result.packageJson;
      if (result.written) {
        console.log(
          `wrote ${normalizeRelativePath(relative(kitDirectory, join(targetPackage.directory, 'package.json')))}`
        );
      }
      const directoryLabel = normalizeRelativePath(
        relative(kitDirectory, targetPackage.directory)
      );
      writeConsumerCli(targetPackage.directory, {
        report: (line) => console.log(`${directoryLabel}: ${line}`),
      });
      targetPackage.packageJson = readPackageJson(targetPackage.directory);
    }
    if (!failed) {
      const printed = new Set<string>();
      for (const target of layout.targets.keys()) {
        failed =
          !writeKitManifest(
            kitDirectory,
            configuration,
            configurationName,
            templates,
            builtComponents,
            layerOrderModulesByTarget.get(target) ?? [],
            writtenPaths,
            { layout, target },
            printed
          ) || failed;
      }
    }
  }

  for (const [target, kept] of keptByTarget) {
    if (kept.size > 0) {
      const names = [...kept].join(', ');
      console.error(
        `dist/${target}: warning: ${names} failed to build, so ${kept.size === 1 ? 'its' : 'their'} files from the last build stay, and the target's index files keep naming them until a build succeeds`
      );
    }
  }

  // A build that failed somewhere may not have written everything it owns -
  // a template that failed to load still has its output from the last good
  // build - so it removes nothing and keeps the previous record's entries.
  if (failed) {
    writeBuildRecord(kitDirectory, writtenPaths, previousRecord);
  } else {
    const stale = removeStaleOutput(
      kitDirectory,
      previousRecord,
      writtenPaths,
      outputRoots
    );
    for (const path of stale.removed) {
      console.log(`removed ${path}`);
    }
    for (const path of stale.kept) {
      console.error(
        `${path}: warning: no longer built, but changed since the build wrote it; left in place`
      );
    }
    for (const [directory, paths] of groupedByDirectory(stale.outside)) {
      const files =
        paths.length === 1
          ? `the file the last build wrote there (${paths[0]}) is`
          : `the ${paths.length} files the last build wrote there (${paths[0]} and ${paths.length - 1} more) are`;
      console.error(
        `${directory}: warning: the build no longer writes into this directory, so ${files} left in place and no longer tracked`
      );
    }
    writeBuildRecord(kitDirectory, writtenPaths);
  }

  // The consumer CLI lives in its own package: keep the kit's shim and its
  // dependency range current, so a kit scaffolded by an earlier release moves
  // to the current CLI. Unchanged files are not rewritten, and a dependency
  // spec the current version satisfies, or one that is the kit's own choice
  // (a pin, a file:, link: or workspace: spec), is kept.
  // A kit built into packages runs its consumer command from each target's
  // package, so the kit root keeps none.
  if (layout === undefined) {
    writeConsumerCli(kitDirectory, { report: (line) => console.log(line) });
  } else if (hasConsumerCli(kitDirectory)) {
    console.error(
      `bin/add.mjs: warning: the kit root still has the consumer command, which has no manifest to read now that each target's package runs its own (${[
        ...layout.targets.keys(),
      ]
        .map((target) => targetCommandName(layout.kitName, target))
        .join(
          ', '
        )}); remove bin/add.mjs and its "bin" entry from the kit root's package.json`
    );
  }

  if (failed) {
    process.exitCode = 1;
  }
}

/**
 * Writes the kit manifest, or prints why it cannot be written.
 *
 * @returns Whether the manifest was written.
 */
function writeKitManifest(
  kitDirectory: string,
  configuration: KitConfiguration,
  configurationName: string,
  templates: LoadedTemplate[],
  builtComponents: Map<
    string,
    Partial<Record<TargetName, BuiltComponentFiles>>
  >,
  layerOrderModules: string[],
  writtenPaths: Set<string>,
  packages?: { layout: KitLayout; target: ScriptedTargetName },
  printed: Set<string> = new Set()
): boolean {
  const parts = new Map<string, string[]>();
  const templateNames = new Set<string>();
  for (const { template } of templates) {
    if (Array.isArray(template)) continue;
    templateNames.add(template.name);
    if (template.parts !== undefined) {
      parts.set(template.name, template.parts);
    }
  }
  // A compound whose root has no template, such as a hand-written
  // component, lists its parts in the configuration instead.
  const configurationErrors: string[] = [];
  for (const [root, rootParts] of Object.entries(configuration.parts ?? {})) {
    if (templateNames.has(root)) {
      configurationErrors.push(
        `${configurationName}: error: parts names '${root}', which has a template; list its parts in the template's parts instead`
      );
    } else if (!builtComponents.has(root)) {
      configurationErrors.push(
        `${configurationName}: error: parts names '${root}', which is not a component of the kit`
      );
    } else {
      parts.set(root, rootParts);
    }
  }
  const {
    manifest,
    errors: manifestErrors,
    warnings,
  } = createKitManifest({
    kitDirectory,
    configuration,
    configurationName,
    components: builtComponents,
    parts,
    layerOrderModules,
    ...(packages === undefined ? {} : { packages }),
  });
  const errors = [...configurationErrors, ...manifestErrors];
  // Each target's manifest of a kit built into packages reports what they
  // share, such as a shared module's gaps, once.
  for (const line of [...warnings, ...errors]) {
    if (printed.has(line)) continue;
    printed.add(line);
    console.error(line);
  }
  if (errors.length > 0) {
    return false;
  }
  const manifestPath = join(
    packages?.layout.targets.get(packages.target)?.directory ?? kitDirectory,
    KIT_MANIFEST_PATH
  );
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writtenPaths.add(manifestPath);
  console.log(`wrote ${relative(kitDirectory, manifestPath)}`);
  return true;
}

/** A template loaded and validated, ready to render for each target. */
interface LoadedTemplate {
  templatePath: string;
  /** Its path relative to the kit, which its diagnostics are labeled with. */
  label: string;
  template: Template;
}

/**
 * Loads and validates each template once, as it is the same for every
 * target: one that fails is reported once, not once per target, and is left
 * out. Each is validated for every scripted target, as a kit builds them
 * all. Two templates whose component names are the same, or differ only by
 * case, would write the same files, so the second is an error.
 */
async function loadTemplates(
  kitDirectory: string,
  templatePaths: string[],
  diagnostics: DiagnosticLog
): Promise<{
  templates: LoadedTemplate[];
  failed: boolean;
  failedComponents: string[];
}> {
  let failed = false;
  const templates: LoadedTemplate[] = [];
  const failedComponents: string[] = [];
  const firstByFoldedName = new Map<string, { name: string; label: string }>();
  for (const templatePath of templatePaths) {
    const label = relative(kitDirectory, templatePath);
    try {
      const template = await loadTemplate(templatePath);
      validateTemplate(template, { extensions: everyTargetExtension() });
      const name = componentNameOf(template, templatePath);
      const first = firstByFoldedName.get(name.toLowerCase());
      if (first !== undefined) {
        throw new Error(
          first.name === name
            ? `The component name '${name}' is also ${first.label}'s, and the two would write the same files; give one another name`
            : `The component name '${name}' differs from ${first.label}'s '${first.name}' only by case, and the two would write the same files where file names ignore case; give one another name`
        );
      }
      firstByFoldedName.set(name.toLowerCase(), { name, label });
      templates.push({ templatePath, label, template });
    } catch (error) {
      failed = true;
      failedComponents.push(componentNameFromFilePath(templatePath));
      diagnostics.recordError(label, error);
    }
  }
  return { templates, failed, failedComponents };
}

/** What the build says when the kit builds the Svelte target and has no
 *  Svelte 5 or later to compile its components with. */
const SVELTE_CHECK_SKIPPED_NOTE =
  'note: the Svelte components were not compile-checked, because Svelte 5 or later is not installed in this kit. Install Svelte 5 or later as a devDependency to check them.';

/**
 * The check of the Svelte target's components against the kit's own Svelte
 * compiler, when the kit builds that target and has Svelte 5 or later
 * installed.
 */
function svelteWarningCheckOf(
  kitDirectory: string,
  configuration: KitConfiguration
): SvelteWarningCheck | undefined {
  return configuration.targets.includes('svelte')
    ? createSvelteWarningCheck(kitDirectory, configuration.svelte?.mode)
    : undefined;
}

/**
 * The name a template's files are written under: the one a component
 * template declares, else its file's name in PascalCase.
 */
function componentNameOf(template: Template, templatePath: string): string {
  const declared =
    !Array.isArray(template) && template.type === 'component'
      ? template.name
      : undefined;
  return typeof declared === 'string' && declared !== ''
    ? declared
    : componentNameFromFilePath(templatePath);
}

/**
 * Renders a template for one target as the build does, recording the
 * render's warnings. Under `stylesheetLink: 'both'` every target renders
 * unlinked. A failing render throws. For the Svelte target, what the Svelte
 * compiler says of each emitted component is recorded too, with its code and
 * its place in the emitted file: a warning as a warning, and a component it
 * cannot compile as an error, reported through `compiles`. The caller still
 * writes that component's files, so the author can read what failed.
 */
function renderTemplate(
  { templatePath, label, template }: LoadedTemplate,
  target: TargetName,
  configuration: KitConfiguration,
  loadPaths: string[],
  sassImporters: KitSassImporters,
  diagnostics: DiagnosticLog,
  svelteWarnings?: SvelteWarningCheck,
  outputDirectory = `dist/${target}`
): ReturnType<typeof processTemplate> & { compiles: boolean } {
  const result = processTemplate(template, {
    componentName: componentNameFromFilePath(templatePath),
    extensions: buildExtensions(target, configuration),
    // A kit is built for every target, so each target's build reserves
    // every target's names and gives a prop the same alias.
    reserveNamesOf: everyTargetExtension(),
    styling: {
      placement: configuration.stylesheetPlacement ?? 'in-file',
      language: configuration.stylingLanguage ?? 'css',
      stylesheetLink:
        configuration.stylesheetLink === 'both'
          ? 'none'
          : (configuration.stylesheetLink ?? 'component'),
      loadPaths,
      sassImporters,
      layer: stylingLayerOf(configuration),
    },
  });
  for (const warning of result.warnings) {
    const location =
      warning.nodePath === undefined || warning.nodePath === ''
        ? ''
        : ` (at ${warning.nodePath})`;
    diagnostics.record(
      label,
      'warning',
      `${warning.message}${location}`,
      target
    );
  }
  let compiles = true;
  if (target === 'svelte' && svelteWarnings !== undefined) {
    for (const file of result.files) {
      if (extname(file.path) !== '.svelte') {
        continue;
      }
      const emittedPath = `${outputDirectory}/${normalizeRelativePath(file.path)}`;
      for (const warning of svelteWarnings(file.content, file.path)) {
        const position =
          warning.line === undefined
            ? ''
            : `:${warning.line}${warning.column === undefined ? '' : `:${warning.column}`}`;
        diagnostics.record(
          label,
          warning.severity,
          `${warning.code}: ${warning.message} (at ${emittedPath}${position})`,
          target
        );
        compiles = compiles && warning.severity !== 'error';
      }
    }
  }
  return { ...result, compiles };
}

/** What building a kit's components reports, without the build. */
export interface KitDiagnostics {
  /** What fails the build: the configuration, or a template that fails to
   *  load, validate or render for a target. */
  errors: string[];
  /** What the build warns of. */
  warnings: string[];
}

/**
 * Reports what `scaffold-ui-kit build` reports for a kit's components,
 * writing no output: each template in `src/components/` is loaded, validated and rendered for every
 * configured target the way the build renders it. Each line names the
 * template by its path in the kit, labeled with the targets that report it
 * when not all of them do, as the build prints it. It covers validation,
 * rendering and the Svelte compiler's warnings for the Svelte target's
 * components; a driver colliding with a generated file and the stylesheets
 * compiled under `stylesheetLink: 'both'` are the build's alone.
 *
 * @param kitDirectory - The kit root directory, absolute or relative to the
 *   working directory.
 * @param options - The configuration file to read in place of the one the
 *   kit's `package.json` or root gives.
 * @returns The errors and the warnings, one line each.
 * @example
 * ```ts
 * const { errors } = await diagnoseKit(process.cwd());
 * if (errors.length > 0) process.exitCode = 1;
 * ```
 */
export async function diagnoseKit(
  kitDirectory: string,
  options: ConfigurationLookupOptions = {}
): Promise<KitDiagnostics> {
  // Template paths are imported by path, which a relative one is not.
  kitDirectory = resolve(kitDirectory);
  let configuration: KitConfiguration;
  let templatePaths: string[];
  try {
    configuration = resolveKitConfiguration(
      kitDirectory,
      options
    ).configuration;
    templatePaths = listComponentTemplates(kitDirectory);
  } catch (error) {
    return {
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
    };
  }
  const loadPaths = (configuration.loadPaths ?? []).map((path) =>
    join(kitDirectory, path)
  );
  const sassImporters = kitSassImporters(
    kitDirectory,
    Object.entries(configuration.packages ?? {}).map(([, entry]) =>
      resolve(kitDirectory, entry.directory)
    )
  );
  const diagnostics = createDiagnosticLog();
  const svelteWarnings = svelteWarningCheckOf(kitDirectory, configuration);
  const { templates } = await loadTemplates(
    kitDirectory,
    templatePaths,
    diagnostics
  );
  for (const target of configuration.targets) {
    for (const loaded of templates) {
      try {
        renderTemplate(
          loaded,
          target,
          configuration,
          loadPaths,
          sassImporters,
          diagnostics,
          svelteWarnings,
          targetOutputDirectory(kitDirectory, configuration, target)
        );
      } catch (error) {
        diagnostics.recordError(loaded.label, error, target);
      }
    }
  }
  const entries = diagnostics.entries(configuration.targets);
  return {
    errors: entries
      .filter((entry) => entry.severity === 'error')
      .map((entry) => entry.line),
    warnings: entries
      .filter((entry) => entry.severity === 'warning')
      .map((entry) => entry.line),
  };
}

/**
 * Links each html page to its compiled stylesheet, in the form and at the
 * place the engine links a separate-file stylesheet: a `<link>` opening the
 * page.
 */
function linkPages(
  linkedPages: LinkedPages,
  stylesheetLinks: Map<string, string>
): void {
  for (const page of linkedPages.pages) {
    const specifier = stylesheetLinks.get(page.slice(0, -extname(page).length));
    if (specifier === undefined) {
      continue;
    }
    const pagePath = join(linkedPages.targetDirectory, page);
    const href = specifier.replace(/^\.\//, '');
    writeFileSync(
      pagePath,
      `<link rel="stylesheet" href="${href}">\n\n${readFileSync(pagePath, 'utf8')}`
    );
  }
}

/**
 * Writes a target's linked modules and its two barrels: `index.ts`
 * exporting the linked modules and `unlinked/index.ts` exporting the
 * modules themselves.
 *
 * @returns The linked modules written.
 */
function writeLinks(
  kitDirectory: string,
  { target, targetDirectory, modules, failedComponents, kept }: LinkedTarget,
  stylesheetLinks: Map<string, string>,
  writtenPaths: Set<string>
): StylesheetLinkOutput[] {
  const links = writeStylesheetLinks({
    target,
    targetDirectory,
    modules,
    stylesheetLinks,
  });
  for (const writtenPath of links.writtenPaths) {
    writtenPaths.add(writtenPath);
    console.log(`wrote ${relative(kitDirectory, writtenPath)}`);
  }
  for (const warning of links.warnings) {
    console.error(`dist/${target}/${warning}`);
  }
  const linkedBarrel = join(targetDirectory, 'index.ts');
  writeBarrel(
    kitDirectory,
    linkedBarrel,
    writtenPaths,
    withLastEntries(
      linkedBarrel,
      links.linked.map((output) =>
        barrelEntry(
          target,
          output.name,
          `./${output.path.replace(/\.ts$/, '')}`
        )
      ),
      failedComponents,
      kept
    )
  );
  const unlinkedBarrel = join(targetDirectory, UNLINKED_DIRECTORY, 'index.ts');
  writeBarrel(
    kitDirectory,
    unlinkedBarrel,
    writtenPaths,
    withLastEntries(
      unlinkedBarrel,
      modules.map((modulePath) =>
        barrelEntry(
          target,
          basename(modulePath, extname(modulePath)),
          `../${moduleSpecifier(target, modulePath)}`
        )
      ),
      failedComponents,
      kept
    )
  );
  return links.linked;
}

/** The relative module specifier an index line names, if any. */
function specifierOf(line: string): string | undefined {
  return /(['"])(\.{1,2}\/[^'"]+)\1/.exec(line)?.[2];
}

/**
 * An index's entries - a barrel's `export` entries or `_index.scss`'s
 * `@use` lines - followed by the last build's entries for the components
 * that failed this time, from the index on disk. A failed build removes
 * nothing, so a failed component's last good files stay; its entry stays
 * beside them, so what imports it through the index still resolves. An
 * entry is kept only while the file it imports exists (see
 * {@link importedFiles}), and never twice. The
 * kept components are added to `kept`, for the build's report.
 *
 * @param indexPath - The index's path.
 * @param entries - This build's entries.
 * @param failedComponents - The components that failed for the target.
 * @param kept - The kept components, added to.
 * @returns This build's entries, then the kept ones.
 */
function withLastEntries(
  indexPath: string,
  entries: string[],
  failedComponents: ReadonlySet<string>,
  kept: Set<string>
): string[] {
  if (failedComponents.size === 0 || !existsSync(indexPath)) {
    return entries;
  }
  const current = new Set(
    entries.flatMap((entry) => entry.split('\n').map(specifierOf))
  );
  const keptLines = new Map<string, string[]>();
  for (const line of readFileSync(indexPath, 'utf8').split('\n')) {
    const specifier = specifierOf(line);
    if (specifier === undefined || current.has(specifier)) {
      continue;
    }
    const name = basename(specifier).split('.')[0];
    const exists = importedFiles(indexPath, specifier).some((file) =>
      existsSync(file)
    );
    if (!failedComponents.has(name) || !exists) {
      continue;
    }
    keptLines.set(specifier, [...(keptLines.get(specifier) ?? []), line]);
    kept.add(name);
  }
  return [
    ...entries,
    ...[...keptLines.values()].map((lines) => lines.join('\n')),
  ];
}

/**
 * The files an index entry's specifier can resolve to, the ones the index
 * actually imports: for `_index.scss` the sheet or its `_`-prefixed
 * partial; for a barrel the module itself - the file named, when the
 * specifier carries an extension (`.vue`, `.svelte`), else its `.tsx` or
 * `.ts` - never a stylesheet of the same name.
 */
function importedFiles(indexPath: string, specifier: string): string[] {
  const file = join(dirname(indexPath), specifier);
  if (extname(indexPath) === '.scss') {
    const stem = file.endsWith('.scss') ? file.slice(0, -'.scss'.length) : file;
    return [`${stem}.scss`, join(dirname(stem), `_${basename(stem)}.scss`)];
  }
  return extname(specifier) === '' ? [`${file}.tsx`, `${file}.ts`] : [file];
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
 * The rendered component module among a template's output files, relative
 * to the target directory: the file with the target's component extension.
 * The `html` target has none.
 */
function componentModuleOf(
  target: TargetName,
  files: Array<{ path: string }>
): string | undefined {
  if (target === 'html') {
    return undefined;
  }
  const extension = componentFileExtensions[target];
  return files.find((file) => extname(file.path) === extension)?.path;
}

/**
 * What the build itself writes at a path in a scripted target's directory,
 * where a driver of that name would be overwritten: the barrel, the
 * stylesheet index when the build writes one there, and under
 * `stylesheetLink: 'both'` the linked modules and the unlinked barrel.
 *
 * @param relativePath - The path, relative to the target directory, with
 *   forward slashes.
 * @param writesLinks - Whether this build writes the linked modules.
 * @param writesStylesheetIndex - Whether this build writes the target's
 *   `_index.scss` into the target directory.
 * @returns A description of the file the build writes there, or `undefined`
 *   when the path is free.
 */
function reservedOutputPath(
  relativePath: string,
  writesLinks: boolean,
  writesStylesheetIndex: boolean
): string | undefined {
  if (relativePath === 'index.ts') {
    return "the target's index";
  }
  if (writesStylesheetIndex && relativePath === STYLESHEET_INDEX_FILE) {
    return "the target's stylesheet index";
  }
  if (writesLinks) {
    if (relativePath === `${UNLINKED_DIRECTORY}/index.ts`) {
      return "the target's unlinked index";
    }
    if (relativePath.startsWith(`${LINKED_DIRECTORY}/`)) {
      return 'the linked modules';
    }
  }
  return undefined;
}

/**
 * Record keys grouped by the directory they lie in beside or above the kit
 * root: the leading `../` segments and the next one, such as `../vue`.
 */
function groupedByDirectory(keys: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const key of keys) {
    const directory = /^((?:\.\.\/)*[^/]+)/.exec(key)?.[1] ?? key;
    groups.set(directory, [...(groups.get(directory) ?? []), key]);
  }
  return groups;
}

/**
 * Where a target's output is written, relative to the kit root, with forward
 * slashes: `dist/<target>`, or the `dist` directory of the target's package
 * in a kit built into packages.
 */
function targetOutputDirectory(
  kitDirectory: string,
  configuration: KitConfiguration,
  target: TargetName
): string {
  const entry =
    target === 'html' ? undefined : configuration.packages?.[target];
  return entry === undefined
    ? `dist/${target}`
    : normalizeRelativePath(
        relative(
          kitDirectory,
          join(resolve(kitDirectory, entry.directory), 'dist')
        )
      );
}

/**
 * Whether a driver is a top-level module of the target, which the barrel
 * re-exports. Helpers, types, and files in subdirectories are
 * imported by the driver rather than re-exported from the kit.
 */
function isDriverModule(target: TargetName, relativePath: string): boolean {
  return (
    target !== 'html' &&
    dirname(relativePath) === '.' &&
    extname(relativePath) === componentFileExtensions[target]
  );
}

/**
 * The barrel `export` entry re-exporting one module - a generated
 * component, a driver, or a linked module of either - with its full module
 * surface, so an `export type` / `export interface` it declares is
 * importable from the barrel beside the component.
 *
 * React components are named exports, so `export * from` alone covers
 * them. An SFC module's component is its default export - which a star
 * export never forwards - so the SFC targets pair a named default re-export
 * with the star line; at runtime the star line is a no-op (a compiled SFC's
 * runtime surface is its default export), it exists for the type checker.
 *
 * @param target - The scripted target.
 * @param name - The name the component is exported under.
 * @param specifier - The module specifier, relative to the barrel.
 */
function barrelEntry(
  target: ScriptedTargetName,
  name: string,
  specifier: string
): string {
  return target === 'react'
    ? `export * from '${specifier}';`
    : `export { default as ${name} } from '${specifier}';\nexport * from '${specifier}';`;
}

/** Writes a barrel of `export` entries, records it, and reports it. */
function writeBarrel(
  kitDirectory: string,
  barrelPath: string,
  writtenPaths: Set<string>,
  entries: string[]
): void {
  mkdirSync(dirname(barrelPath), { recursive: true });
  writeFileSync(barrelPath, `${entries.join('\n')}\n`);
  writtenPaths.add(barrelPath);
  console.log(`wrote ${relative(kitDirectory, barrelPath)}`);
}

/** The generated index of a target's SCSS component sheets. */
const STYLESHEET_INDEX_FILE = '_index.scss';

/**
 * Writes `_index.scss` beside a target's SCSS component sheets: a sorted
 * `@use` of every one, so a kit's own stylesheet takes them all with
 * `@use "<path to dist>/<target>"` (Sass resolves a directory to its
 * `_index.scss`). Each sheet carries its own layer, so the index wraps
 * nothing; the leading underscore keeps it clear of every component's file
 * name. Nothing is written for a target with no SCSS sheets.
 *
 * A kit built into packages writes each target's index into the styles
 * package, beside the sheets that differ for the target, `@use`-ing the
 * sheets every target shares from their directory.
 *
 * @param kitDirectory - The kit root, for the log line.
 * @param indexDirectory - The directory the index is written into.
 * @param stylesheets - The stylesheets the target emitted, absolute.
 * @param writtenPaths - The build's written files, the index joining them.
 */
function writeStylesheetIndex(
  kitDirectory: string,
  indexDirectory: string,
  stylesheets: string[],
  writtenPaths: Set<string>
): void {
  const sheets = stylesheets
    .filter((path) => extname(path) === '.scss')
    .map((path) => indexSpecifier(indexDirectory, path))
    .sort();
  if (sheets.length === 0) {
    return;
  }
  // The namespace only has to be unique; nothing reads the sheets' members.
  const uses = sheets.map(
    (sheet) =>
      `@use "${sheet}" as ${sheet
        .replace(/^(\.\.?\/)+/, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')};`
  );
  const indexPath = join(indexDirectory, STYLESHEET_INDEX_FILE);
  mkdirSync(indexDirectory, { recursive: true });
  writeFileSync(
    indexPath,
    [
      '// Generated by scaffold-ui-kit build - do not edit.',
      '// Every component stylesheet of this target, for a stylesheet that takes them all.',
      '',
      ...uses,
      '',
    ].join('\n')
  );
  writtenPaths.add(indexPath);
  console.log(`wrote ${relative(kitDirectory, indexPath)}`);
}

/** A stylesheet's `@use` specifier from an index's directory, without `.scss`. */
function indexSpecifier(indexDirectory: string, sheetPath: string): string {
  const specifier = normalizeRelativePath(
    relative(indexDirectory, sheetPath)
  ).slice(0, -'.scss'.length);
  return specifier.startsWith('.') ? specifier : `./${specifier}`;
}

/**
 * Writes a target's `_index.scss`, keeping the last build's entry for each
 * component that failed this time, as the barrels keep its module.
 */
function writeIndexOf(
  kitDirectory: string,
  indexDirectory: string,
  stylesheets: string[],
  failedComponents: ReadonlySet<string>,
  kept: Set<string>,
  writtenPaths: Set<string>
): void {
  const indexPath = join(indexDirectory, STYLESHEET_INDEX_FILE);
  const ownUses = stylesheets
    .filter((path) => extname(path) === '.scss')
    .map((path) => `@use "${indexSpecifier(indexDirectory, path)}"`);
  const keptSheets = withLastEntries(indexPath, ownUses, failedComponents, kept)
    .slice(ownUses.length)
    .map((line) => join(indexDirectory, `${specifierOf(line)}.scss`));
  writeStylesheetIndex(
    kitDirectory,
    indexDirectory,
    [...stylesheets, ...keptSheets],
    writtenPaths
  );
}

/** One target's emitted stylesheets in a kit built into packages. */
interface PackagedStylesheets {
  target: TargetName;
  /** The target's build directory, in its package. */
  targetDirectory: string;
  /** The emitted stylesheets, relative to the target directory. */
  stylesheets: string[];
  failedComponents: Set<string>;
  kept: Set<string>;
}

/**
 * Writes every emitted stylesheet of a kit built into packages into its
 * styles package: a sheet every target emitted the same is written once, to
 * the compiled stylesheet directory beside its compiled CSS; one that
 * differs between targets is written to the target's own directory,
 * `dist/<target>/`, where its compiled CSS goes too. Each target's
 * `_index.scss` is written into its own directory, and the layer order
 * module, when the sheets load one, into every directory an SCSS sheet is
 * written to.
 *
 * @returns Each target's stylesheets, with where each was written, for
 *   compiling.
 */
function placeStylesheets(
  kitDirectory: string,
  layout: KitLayout,
  configuration: KitConfiguration,
  emittedSheets: Map<string, Map<TargetName, string>>,
  targets: PackagedStylesheets[],
  writtenPaths: Set<string>,
  layerOrderModule?: {
    content: string;
    write: (target: TargetName, directory: string, content: string) => void;
  }
): TargetStylesheets[] {
  const sharedDirectory = join(
    layout.styles.directory,
    configuration.compiledStylesheetDirectory ??
      defaultCompiledStylesheetDirectory
  );
  const ownDirectoryOf = (target: TargetName): string =>
    join(layout.styles.directory, 'dist', target);
  const sources = new Map<TargetName, Map<string, string>>();
  for (const [sheet, perTarget] of emittedSheets) {
    const shared = new Set(perTarget.values()).size === 1;
    for (const [target, content] of perTarget) {
      const destination = shared
        ? join(sharedDirectory, sheet)
        : join(ownDirectoryOf(target), sheet);
      if (!writtenPaths.has(destination)) {
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, content);
        writtenPaths.add(destination);
        console.log(
          `wrote ${normalizeRelativePath(relative(kitDirectory, destination))}`
        );
      }
      sources.set(
        target,
        (sources.get(target) ?? new Map()).set(sheet, destination)
      );
      // An SCSS sheet loads the order module from its own directory.
      if (layerOrderModule !== undefined && extname(sheet) === '.scss') {
        layerOrderModule.write(
          target,
          dirname(destination),
          layerOrderModule.content
        );
      }
    }
  }
  return targets.map((entry) => {
    const targetSources = sources.get(entry.target) ?? new Map();
    writeIndexOf(
      kitDirectory,
      ownDirectoryOf(entry.target),
      entry.stylesheets.map(
        (sheet) =>
          targetSources.get(sheet) ?? join(entry.targetDirectory, sheet)
      ),
      entry.failedComponents,
      entry.kept,
      writtenPaths
    );
    return {
      target: entry.target,
      targetDirectory: entry.targetDirectory,
      stylesheets: entry.stylesheets,
      sources: targetSources,
      differingDirectory: ownDirectoryOf(entry.target),
    };
  });
}

/**
 * The packages a target package's built files import by bare specifier,
 * each with the first file that imports it, relative to the kit root.
 */
function packageImportsOf(
  kitDirectory: string,
  packageDirectory: string,
  writtenPaths: Set<string>
): Map<string, string> {
  const imports = new Map<string, string>();
  for (const path of [...writtenPaths].sort()) {
    if (packageOfPath([{ directory: packageDirectory }], path) === undefined) {
      continue;
    }
    // A type-only import is erased from the compiled module, so it adds no
    // dependency.
    for (const specifier of importsOf(path, { runtimeOnly: true })) {
      if (!isBareSpecifier(specifier)) continue;
      const name = packageNameOf(specifier);
      if (!imports.has(name)) {
        imports.set(name, normalizeRelativePath(relative(kitDirectory, path)));
      }
    }
  }
  return imports;
}

/** What a relative specifier may leave off, as a bundler fills it in. */
const impliedImportEndings = [
  '.ts',
  '.tsx',
  '.d.ts',
  '.mts',
  '.js',
  '.jsx',
  '.mjs',
  '.vue',
  '.svelte',
  '.json',
  '.css',
  '.scss',
  '.sass',
  '/index.ts',
  '/index.tsx',
  '/index.d.ts',
  '/index.mts',
  '/index.js',
  '/index.jsx',
];

/**
 * The partial forms Sass also tries for a `@use`, `@forward` or `@import`:
 * `_tokens.scss` beside the path, and `tokens/_index.scss` under it.
 */
function sassPartialForms(location: string): string[] {
  const directory = dirname(location);
  const name = basename(location, extname(location));
  return ['.scss', '.sass', '.css'].flatMap((extension) => [
    join(directory, `_${name}${extension}`),
    join(directory, name, `_index${extension}`),
    join(directory, name, `index${extension}`),
  ]);
}

/** The path without its extension. */
function withoutExtension(path: string): string {
  return path.slice(0, path.length - extname(path).length);
}

/** What {@link danglingRelativeImportsOf} needs. */
interface DanglingImportsInput {
  kitDirectory: string;
  layout: KitLayout;
  /** The target's package, whose built files are read. */
  targetPackage: KitPackage;
  /** Where the build placed the target's stylesheets. */
  stylesheets?: TargetStylesheets;
  writtenPaths: Set<string>;
  /**
   * The previous build's files: one this build did not write is removed,
   * unless it has changed since.
   */
  previousRecord: Map<string, string>;
  /** How the kit links its stylesheets. */
  stylesheetLink: KitStylesheetLink;
}

/**
 * The errors for each relative import in a target package's built files
 * that leads to nothing inside that package. A package is published alone,
 * so such an import fails in a consumer's bundler however the kit's own
 * directories lie. A stylesheet is not rewritten through the styles
 * package: a target's modules are built unlinked, and an import of the sheet
 * in one would load it for a consumer who chose the unlinked export.
 */
function danglingRelativeImportsOf(input: DanglingImportsInput): string[] {
  const { kitDirectory, layout, targetPackage, stylesheets } = input;
  const holds = (path: string): boolean => {
    if (packageOfPath([targetPackage], path) === undefined) return false;
    if (input.writtenPaths.has(path)) return true;
    if (!existsSync(path) || !statSync(path).isFile()) return false;
    // What the last build wrote is removed after this one, as written.
    const recorded = input.previousRecord.get(
      normalizeRelativePath(relative(kitDirectory, path))
    );
    return recorded === undefined || hashOf(path) !== recorded;
  };
  const errors: string[] = [];
  for (const path of [...input.writtenPaths].sort()) {
    if (
      packageOfPath([targetPackage], path) === undefined ||
      stylesheetExtensions.includes(extname(path))
    ) {
      continue;
    }
    const importer = normalizeRelativePath(relative(kitDirectory, path));
    const sassSpecifiers = new Set(importsOf(path, { sassOnly: true }));
    for (const specifier of importsOf(path)) {
      if (!/^\.\.?(\/|$)/.test(specifier)) continue;
      const location = resolve(dirname(path), specifier.replace(/[?#].*$/, ''));
      // A TypeScript module may be imported by the name it compiles to.
      const candidates = [
        location,
        location.replace(/\.(m?)js(x?)$/, '.$1ts$2'),
        location.replace(/\.js$/, '.tsx'),
        location.replace(/\.js$/, '.d.ts'),
        ...impliedImportEndings.map((ending) => `${location}${ending}`),
        ...(sassSpecifiers.has(specifier) ? sassPartialForms(location) : []),
      ];
      if (candidates.some(holds)) continue;

      const moved =
        stylesheets === undefined ||
        !stylesheetExtensions.includes(extname(location))
          ? undefined
          : [...(stylesheets.sources?.entries() ?? [])].find(
              ([sheet]) =>
                withoutExtension(sheet) ===
                withoutExtension(
                  normalizeRelativePath(
                    relative(stylesheets.targetDirectory, location)
                  )
                )
            )?.[1];
      if (moved === undefined) {
        errors.push(
          `${importer}: error: imports '${specifier}', which leads to no file in the package ${targetPackage.name}, and a package is published alone; point it at a file the package holds, or import it from a package by name`
        );
        continue;
      }
      if (input.stylesheetLink === 'both') {
        errors.push(
          `${importer}: error: imports '${specifier}', a stylesheet the build writes into the styles package ${layout.styles.name}, so nothing is there to import; remove the import, as the linked module brings the stylesheet`
        );
        continue;
      }
      const published = importOf(
        layout.styles.name,
        layout.styles.packageJson.exports,
        normalizeRelativePath(
          relative(
            layout.styles.directory,
            `${withoutExtension(moved)}${extname(location)}`
          )
        )
      );
      errors.push(
        `${importer}: error: imports '${specifier}', a stylesheet the build writes into the styles package ${layout.styles.name}, so nothing is there to import; remove the import, or ${published === undefined ? 'add an export of the styles package that reaches it and import it by that' : `import it as '${published}'`}`
      );
    }
  }
  return errors;
}

/**
 * Normalizes a path to forward slashes so generated and copied paths
 * compare equal regardless of the platform's path separator.
 */
function normalizeRelativePath(path: string): string {
  return path.split(sep).join('/');
}
