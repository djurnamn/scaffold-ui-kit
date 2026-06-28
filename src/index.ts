/**
 * Scaffolder for framework-agnostic UI kits powered by js-template-engine.
 *
 * The `scaffold-ui-kit` binary scaffolds kit projects (`init`) and builds
 * them (`build`): every component template renders once per configured
 * target into `dist/<target>/`, and the kit ships a consumer CLI that
 * copies built components into consuming projects. This module exposes
 * the program and its building blocks for programmatic use.
 */
export { buildCommand } from './commands/build';
export { initCommand, type InitCommandOptions } from './commands/init';
export {
  configurationFileName,
  loadConfiguration,
  stylingNames,
  targetNames,
  validateConfiguration,
  type KitConfiguration,
  type StylingName,
  type TargetName,
} from './configuration';
export { buildExtensions } from './extensions';
export { validateProjectName } from './project-name';
export {
  createProgram,
  parseStylingList,
  parseTargetList,
} from './program';
export { scaffoldKit, type ScaffoldOptions } from './scaffold';
export {
  componentNameFromFilePath,
  listComponentTemplates,
  loadTemplate,
} from './template-sources';
