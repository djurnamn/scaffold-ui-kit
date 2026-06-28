/** Names that cannot be used as a kit's package name. */
const reservedNames = [
  'node_modules',
  'favicon.ico',
  'package.json',
  'init',
  'build',
];

/**
 * Validates a kit project name against npm package-name rules.
 *
 * The name doubles as the generated package's name and its consumer
 * command (`npx <name> add`), so it must be a valid unscoped npm name.
 *
 * @param name - The candidate project name.
 * @returns `true` when valid, otherwise a message describing the problem.
 */
export function validateProjectName(name: string): true | string {
  if (name.length === 0) {
    return 'Project name is required';
  }
  if (name.length > 214) {
    return 'Project name must be at most 214 characters';
  }
  if (name.toLowerCase() !== name) {
    return 'Project name must be lowercase';
  }
  if (!/^[a-z0-9-_.]+$/.test(name)) {
    return 'Project name may only contain lowercase letters, numbers, hyphens, underscores, and dots';
  }
  if (/^[-_.]/.test(name)) {
    return 'Project name cannot start with a hyphen, underscore, or dot';
  }
  if (reservedNames.includes(name)) {
    return `'${name}' cannot be used as a project name`;
  }
  return true;
}
