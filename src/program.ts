import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Command, InvalidArgumentError } from 'commander';

import { buildCommand } from './commands/build';
import { initCommand } from './commands/init';
import {
  stylingNames,
  targetNames,
  type StylingName,
  type TargetName,
} from './configuration';

/**
 * Parses the `--targets` value: a comma-separated list of target names.
 *
 * @param value - The raw flag value, e.g. `'react,vue'`.
 * @returns The target names.
 */
export function parseTargetList(value: string): TargetName[] {
  const names = splitList(value);
  if (names.length === 0) {
    throw new InvalidArgumentError(
      `Name at least one target. Allowed choices are ${targetNames.join(', ')}.`
    );
  }
  for (const name of names) {
    if (!(targetNames as readonly string[]).includes(name)) {
      throw new InvalidArgumentError(
        `Unknown target '${name}'. Allowed choices are ${targetNames.join(', ')}.`
      );
    }
  }
  return names as TargetName[];
}

/**
 * Parses the `--styling` value: a comma-separated list of styling
 * extension names, kept in the order given, or `none` for no styling.
 *
 * @param value - The raw flag value, e.g. `'bem,tailwind'` or `'none'`.
 * @returns The styling extension names.
 */
export function parseStylingList(value: string): StylingName[] {
  if (value.trim() === 'none') {
    return [];
  }
  const names = splitList(value);
  for (const name of names) {
    if (!(stylingNames as readonly string[]).includes(name)) {
      throw new InvalidArgumentError(
        `Unknown styling extension '${name}'. Allowed choices are ${stylingNames.join(', ')}, or none.`
      );
    }
  }
  return names as StylingName[];
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

/**
 * Creates the `scaffold-ui-kit` command-line program.
 *
 * @returns The configured program; call `parseAsync` to run it.
 */
export function createProgram(): Command {
  const { version } = JSON.parse(
    readFileSync(join(__dirname, '..', 'package.json'), 'utf8')
  ) as { version: string };

  const program = new Command();
  program
    .name('scaffold-ui-kit')
    .description(
      'Scaffold UI kits that define components once as data and build them for React, Vue, Svelte, and HTML'
    )
    .version(version);

  program
    .command('init', { isDefault: true })
    .description('Scaffold a new kit project')
    .argument(
      '[project-name]',
      'the kit package name (lowercase, npm-compatible)'
    )
    .option(
      '--targets <names>',
      `comma-separated targets (${targetNames.join(', ')})`,
      parseTargetList
    )
    .option(
      '--styling <names>',
      `comma-separated styling extensions (${stylingNames.join(', ')}), applied in order, or none`,
      parseStylingList
    )
    .option('--examples', 'include the example components (button, card)')
    .option('--no-examples', 'skip the example components')
    .option(
      '-d, --directory <path>',
      'directory the kit is created inside',
      process.cwd()
    )
    .action(initCommand);

  program
    .command('build')
    .description(
      "Render every template in src/components/ into dist/<target>/ for the kit's configured targets"
    )
    .action(() => buildCommand());

  return program;
}
