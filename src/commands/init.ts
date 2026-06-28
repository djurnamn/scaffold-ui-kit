import { join } from 'node:path';

import type { Command } from 'commander';
import enquirer from 'enquirer';

import {
  stylingNames,
  targetNames,
  type StylingName,
  type TargetName,
} from '../configuration';
import { validateProjectName } from '../project-name';
import { scaffoldKit } from '../scaffold';

const { prompt } = enquirer;

/** The `init` command's parsed options. */
export interface InitCommandOptions {
  targets?: TargetName[];
  styling?: StylingName[];
  examples: boolean;
  directory: string;
}

/**
 * Scaffolds a new kit project.
 *
 * Every choice can be supplied as a flag; missing choices are prompted
 * for interactively. A non-interactive run (no TTY) with missing choices
 * is an error rather than a hang.
 *
 * @param projectNameArgument - The project name argument, when given.
 * @param options - The parsed command-line options.
 * @param command - The commander command, used to tell flag-set options
 *   from defaults.
 */
export async function initCommand(
  projectNameArgument: string | undefined,
  options: InitCommandOptions,
  command: Command
): Promise<void> {
  try {
    const projectName =
      projectNameArgument ?? (await promptValue<string>(projectNamePrompt));

    const nameValidation = validateProjectName(projectName);
    if (nameValidation !== true) {
      throw new Error(nameValidation);
    }

    const targets =
      options.targets ??
      (await promptValue<TargetName[]>({
        type: 'multiselect',
        name: 'value',
        message: 'Which targets should components be built for?',
        choices: targetNames.map((target) => ({
          name: target,
          message: target,
        })),
        validate: (selected: unknown) =>
          Array.isArray(selected) && selected.length > 0
            ? true
            : 'Select at least one target',
      }));

    const styling =
      options.styling ??
      (await promptValue<StylingName[]>({
        type: 'multiselect',
        name: 'value',
        message:
          'Which styling extensions should be applied? (none is fine)',
        choices: stylingNames.map((name) => ({ name, message: name })),
      }));

    const includeExamples =
      command.getOptionValueSource('examples') === 'cli'
        ? options.examples
        : await promptValue<boolean>({
            type: 'confirm',
            name: 'value',
            message: 'Include the example components (button, card)?',
            initial: true,
          });

    const createdFiles = scaffoldKit({
      projectName,
      parentDirectory: options.directory,
      targets,
      styling,
      includeExamples,
    });

    for (const file of createdFiles) {
      console.log(`created ${join(projectName, file)}`);
    }
    console.log(
      [
        '',
        `Your kit is ready. Next steps:`,
        `  cd ${projectName}`,
        '  npm install',
        '  npm run build',
      ].join('\n')
    );
  } catch (error) {
    console.error(
      `error: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}

const projectNamePrompt = {
  type: 'input',
  name: 'value',
  message: 'What is your kit called?',
  initial: 'my-ui-kit',
  validate: (value: string) => validateProjectName(value),
};

/**
 * Runs one enquirer prompt for a missing choice, after checking the run
 * is interactive.
 */
async function promptValue<Value>(promptOptions: object): Promise<Value> {
  if (!process.stdin.isTTY) {
    throw new Error(
      'Non-interactive run with missing choices. Pass the project name plus --targets, --styling, and --examples/--no-examples.'
    );
  }
  const response = await prompt<{ value: Value }>(
    promptOptions as Parameters<typeof prompt>[0]
  );
  return response.value;
}
