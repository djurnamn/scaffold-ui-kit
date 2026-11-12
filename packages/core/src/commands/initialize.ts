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

/** The `initialize` command's parsed options. */
export interface InitializeCommandOptions {
  targets?: TargetName[];
  styling?: StylingName[];
  examples: boolean;
  preview: boolean;
  directory: string;
  /** Where the kit configuration is written, relative to the kit root. */
  configuration?: string;
}

/** @deprecated Use `InitializeCommandOptions`; removed in 3.0.0. */
export type InitCommandOptions = InitializeCommandOptions;

/**
 * Scaffolds a new kit project.
 *
 * Every choice can be supplied as a flag; missing choices are prompted
 * for interactively. A non-interactive run (no TTY) with missing choices
 * is an error rather than a hang, except for the preview, which is set up
 * unless `--no-preview` is passed.
 *
 * @param projectNameArgument - The project name argument, when given.
 * @param options - The parsed command-line options.
 * @param command - The commander command, used to tell flag-set options
 *   from defaults.
 */
export async function initializeCommand(
  projectNameArgument: string | undefined,
  options: InitializeCommandOptions,
  command: Command
): Promise<void> {
  try {
    if (command.parent?.args[0] === 'init') {
      console.error(
        "warning: 'init' is deprecated and will be removed in 3.0.0; run 'initialize'"
      );
    }

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
        message: 'Which styling extensions should be applied? (none is fine)',
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

    const includePreview =
      command.getOptionValueSource('preview') === 'cli'
        ? options.preview
        : !process.stdin.isTTY ||
          (await promptValue<boolean>({
            type: 'confirm',
            name: 'value',
            message:
              'Set up the preview (@scaffold-ui-kit/preview with its charcell shell)?',
            initial: true,
          }));

    const createdFiles = scaffoldKit({
      projectName,
      parentDirectory: options.directory,
      targets,
      styling,
      includeExamples,
      includePreview,
      ...(options.configuration === undefined
        ? {}
        : { configurationFile: options.configuration }),
    });

    for (const file of createdFiles) {
      console.log(`created ${join(projectName, file)}`);
    }
    console.log(nextSteps(projectName, includePreview));
  } catch (error) {
    console.error(
      `error: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}

/** @deprecated Use `initializeCommand`; removed in 3.0.0. */
export const initCommand = initializeCommand;

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

/**
 * What `initialize` prints once the kit is written: the commands to run
 * next. A kit with the preview runs `npm run preview`, which builds the kit
 * first; one without it runs `npm run build`.
 *
 * @param projectName - The kit's directory.
 * @param includePreview - Whether the kit has the preview.
 * @returns The lines, joined, a blank one first.
 * @example
 * ```ts
 * nextSteps('my-ui-kit', true); // ... npm install\n  npm run preview
 * ```
 */
export function nextSteps(
  projectName: string,
  includePreview: boolean
): string {
  return [
    '',
    `Your kit is ready. Next steps:`,
    `  cd ${projectName}`,
    '  npm install',
    includePreview ? '  npm run preview' : '  npm run build',
  ].join('\n');
}
