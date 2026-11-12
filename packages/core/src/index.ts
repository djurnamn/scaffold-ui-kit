/**
 * Scaffolder for framework-agnostic UI kits powered by js-template-engine.
 *
 * The `scaffold-ui-kit` binary scaffolds kit projects (`initialize`) and builds
 * them (`build`): every component template renders once per configured
 * target into `dist/<target>/`, and the kit ships a consumer CLI that
 * copies built components into consuming projects, reading the kit
 * manifest the build writes. This module exposes the program, its building
 * blocks, and the manifest's types for programmatic use.
 */
export {
  buildCommand,
  diagnoseKit,
  type KitDiagnostics,
} from './commands/build';
export {
  initCommand,
  initializeCommand,
  type InitCommandOptions,
  type InitializeCommandOptions,
} from './commands/initialize';
export {
  CONFIGURATION_FILE_EXTENSIONS,
  CONFIGURATION_FILE_NAMES,
  configurationFileName,
  defineKit,
  findConfigurationFile,
  LEGACY_CONFIGURATION_FILE_NAME,
  loadConfiguration,
  readConfigurationFile,
  resolveKitConfiguration,
  sharedModuleNames,
  stylingNames,
  targetNames,
  validateConfiguration,
  type AddConfiguration,
  type AddOwnership,
  type ConfigurationFile,
  type ConfigurationLookupOptions,
  type KitConfiguration,
  type KitPreviewConfiguration,
  type KitStylingLayer,
  type ResolvedKitConfiguration,
  type SharedModule,
  type SharedModuleCopy,
  type StylingName,
  type TargetName,
} from './configuration';
export { buildExtensions } from './extensions';
export {
  defaultConsumerConfiguration,
  KIT_MANIFEST_FORMAT,
  KIT_MANIFEST_PATH,
  sharedModulesOf,
  type KitManifest,
  type KitManifestBem,
  type KitManifestComponent,
  type KitManifestFile,
  type KitManifestSharedModule,
  type KitManifestStyling,
  type KitManifestStylingLayer,
  type KitManifestSvelte,
  type KitManifestTailwind,
  type KitManifestTargetFiles,
} from './kit-manifest';
export {
  kitPackageImporter,
  kitSassImporters,
  type KitPackageImporter,
  type KitSassImporters,
} from './package-importer';
export { validateProjectName } from './project-name';
export { createProgram, parseStylingList, parseTargetList } from './program';
export {
  CONSUMER_CLI_PACKAGE,
  PREVIEW_PACKAGE,
  scaffoldKit,
  writeConsumerCli,
  type ConsumerCliOptions,
  type ScaffoldOptions,
} from './scaffold';
export {
  componentNameFromFilePath,
  listComponentTemplates,
  loadTemplate,
} from './template-sources';
