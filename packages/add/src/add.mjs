/**
 * The consumer CLI behind every kit built by scaffold-ui-kit. A kit's own
 * `bin/add.mjs` calls {@link runAdd} with the kit's root, so
 * `npx <kit-name> <command>` works with the kit's components in the
 * consumer's project:
 *
 * - `initialize` writes the consumer's settings for the kit (`<kit>.json`):
 *   the target, where copies go, an import alias, and what they own.
 * - `add` copies components as the settings place and own them, rewriting
 *   every import between the copies and pointing what stays in the package
 *   at the package, and records each file it writes in a ledger
 *   (`.<kit>/copies.json`) with its content as written (`.<kit>/bases/`).
 * - `status` says, per copy, whether it was edited and whether the
 *   installed kit would write it differently.
 * - `update` brings copies to the installed kit, merging its changes into
 *   edited ones with `git merge-file`.
 *
 * It reads only the kit's manifest and `package.json`, and runs on Node
 * built-ins alone.
 */
import { parseArgs } from 'node:util';

import { addCommand } from './copy.mjs';
import { initializeCommand } from './initialize.mjs';
import { readKit } from './kit.mjs';
import { openProject } from './project.mjs';
import { defaultDirectory } from './settings.mjs';
import { statusCommand } from './status.mjs';
import { updateCommand } from './update.mjs';

/** The commands, the first the default. */
const commands = ['add', 'initialize', 'status', 'update'];

/** The options each command takes. */
const options = {
  add: {
    target: { type: 'string' },
    'output-directory': { type: 'string', short: 'o' },
    'stylesheet-link': { type: 'string' },
    own: { type: 'string' },
    force: { type: 'boolean' },
    list: { type: 'boolean' },
  },
  initialize: {
    target: { type: 'string' },
    layout: { type: 'string' },
    'component-pattern': { type: 'string' },
    'stylesheet-pattern': { type: 'string' },
    'part-pattern': { type: 'string' },
    shared: { type: 'string', multiple: true },
    alias: { type: 'string' },
    own: { type: 'string' },
    yes: { type: 'boolean', short: 'y' },
  },
  status: { json: { type: 'boolean' } },
  update: {},
};

const helpOption = { help: { type: 'boolean', short: 'h' } };

/**
 * Runs the consumer CLI for a kit: `add` (the default command),
 * `initialize`, `status` and `update`, each with `--help`. Errors are
 * printed and set a failing exit code rather than thrown.
 *
 * @param {string} kitRoot - The kit package's root directory, where its
 *   `package.json` and `dist/scaffold-ui-kit-manifest.json` live.
 * @param {string[]} [argv] - The arguments after the program name, the
 *   command among them.
 * @returns {Promise<void>}
 * @example
 * // A kit's bin/add.mjs:
 * import { fileURLToPath } from 'node:url';
 * import { runAdd } from '@scaffold-ui-kit/add';
 * await runAdd(fileURLToPath(new URL('..', import.meta.url)));
 */
export async function runAdd(kitRoot, argv = process.argv.slice(2)) {
  try {
    await main(kitRoot, argv);
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

async function main(kitRoot, argv) {
  // The command is the first positional, wherever the options stand; any
  // other first word is a component name for add.
  const { tokens } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: false,
    tokens: true,
    options: Object.assign({}, ...Object.values(options), helpOption),
  });
  const first = tokens.find((token) => token.kind === 'positional');
  const command = commands.includes(first?.value) ? first.value : undefined;
  const { values, positionals } = parseArgs({
    args:
      command === undefined
        ? argv
        : argv.filter((_, index) => index !== first.index),
    allowPositionals: true,
    options: { ...options[command ?? 'add'], ...helpOption },
  });

  const kit = readKit(kitRoot);
  const commandName = `npx ${kit.packageName}`;
  if (values.help || argv.length === 0) {
    console.log(usage(commandName, kit, command));
    return;
  }

  const project = openProject(kit);
  switch (command ?? 'add') {
    case 'initialize':
      if (positionals.length > 0) {
        throw new Error(
          `initialize takes no names; got ${positionals.join(' ')}`
        );
      }
      return initializeCommand(project, values);
    case 'status':
      if (positionals.length > 0) {
        throw new Error(`status takes no names; got ${positionals.join(' ')}`);
      }
      return statusCommand(project, values, commandName);
    case 'update':
      return updateCommand(project, positionals, commandName);
    default:
      return addCommand(project, positionals, values, commandName);
  }
}

/** The usage text for one command, or for them all. */
function usage(commandName, kit, command) {
  const targets = (kit.manifest.targets ?? []).join(', ');
  const sections = {
    add: [
      `${commandName} add [components...] [options]`,
      '',
      'Copies components into your project as your settings place and own them,',
      'with the modules, stylesheets and shared files they need. What you do not',
      'own stays in the package and is imported from it.',
      '',
      `  --target <name>                target to copy from (${targets})`,
      `  -o, --output-directory <path>  put everything in one directory (default ${defaultDirectory})`,
      '  --own <list>                   own these for this run: component, stylesheet,',
      '                                 shared, shared:<name> (comma-separated)',
      '  --stylesheet-link <link>       component (default) links each copied',
      "                                 component's stylesheet from it; none leaves",
      '                                 loading the stylesheets to you',
      "  --force                        replace the named components' files, edited",
      '                                 or not; anything else that differs stays and',
      '                                 is named in the output',
      '  --list                         list the components per target',
    ],
    initialize: [
      `${commandName} initialize [options]`,
      '',
      `Writes ${kit.consumerConfiguration}: the target, where copies go, an import alias,`,
      'and what you own. Asks for each, with your current settings as the defaults.',
      '',
      '  -y, --yes                       take the defaults without asking',
      `  --target <name>                 ${targets}`,
      '  --layout <name>                 flat, folder or custom',
      '  --component-pattern <pattern>   where a component goes, such as',
      '                                  src/components/{name}/index.{extension}',
      '  --stylesheet-pattern <pattern>  where its stylesheet goes',
      "  --part-pattern <pattern>        where a compound's part goes",
      '  --shared <name=path>            where a shared module goes (repeatable)',
      '  --alias <prefix=alias>          an import alias, such as src/=@/',
      '  --own <list>                    component, stylesheet, shared, shared:<name>',
      '',
      'Patterns take {name}, {kebab-name}, {component} (the compound a part',
      'belongs to), {extension} and {stylesheet-extension}.',
    ],
    status: [
      `${commandName} status [--json]`,
      '',
      'Lists every copy add recorded: the kit version it was copied at, whether',
      'you edited it, and whether add would write it differently now.',
      `add records its copies in .${kit.consumerStem}/copies.json, with each file's`,
      `content as written in .${kit.consumerStem}/bases/; commit the folder.`,
    ],
    update: [
      `${commandName} update [components...]`,
      '',
      'Brings copies to the installed kit: untouched files are replaced, edited',
      "ones get the kit's changes merged in with git merge-file. A conflict",
      'leaves markers in the file; resolve them and run update again, or take',
      "the kit's version with add <component> --force (a shared file: remove it",
      'and run add <component> again). No names updates every copy; a',
      "compound's root covers the parts add copies with it.",
    ],
  };
  const indent = (lines) => lines.map((line) => `  ${line}`.trimEnd());
  if (command !== undefined) {
    return [
      'Usage:',
      ...indent(sections[command]),
      '',
      '  -h, --help  show this help',
    ].join('\n');
  }
  return [
    `Usage: ${commandName} <command> [options]`,
    '',
    'Commands:',
    '  initialize               choose where copies go and what you own',
    '  add [components...]      copy components (the default command)',
    '  status                   show what was copied, edited and changed in the kit',
    '  update [components...]   bring copies to the installed kit',
    '',
    ...Object.values(sections).flatMap((lines) => [...indent(lines), '']),
    '  -h, --help  show this help',
  ].join('\n');
}
