#!/usr/bin/env node
/**
 * Consumer CLI shipped with every kit built by scaffold-ui-kit.
 *
 * `npx <kit-name> add` copies built component files from the kit's
 * published `dist/<target>/` into the consumer's project. It has no
 * dependencies: component selection, target selection, and conflict
 * prompts run on Node built-ins alone.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { basename, extname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const defaultOutputDirectory = join('src', 'components', 'ui');

/** File extensions that name a component (as opposed to a stylesheet). */
const componentFileExtensions = ['.tsx', '.vue', '.svelte', '.html'];

main().catch((error) => {
  console.error(`error: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});

async function main() {
  const { name } = readKitJson('package.json');
  const { targets } = readKitJson('scaffold-ui-kit.config.json');

  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      target: { type: 'string' },
      'output-directory': { type: 'string', short: 'o' },
      list: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help || positionals[0] !== 'add') {
    printUsage(name, targets);
    if (!values.help && positionals.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  if (values.list) {
    for (const target of targets) {
      console.log(`${target}: ${componentsFor(target).join(', ') || '(not built)'}`);
    }
    return;
  }

  const target = values.target ?? (await chooseFrom('Which target?', targets));
  if (!targets.includes(target)) {
    throw new Error(
      `Unknown target '${target}'. This kit is built for ${targets.join(', ')}.`
    );
  }

  const available = componentsFor(target);
  if (available.length === 0) {
    throw new Error(
      `No built components for '${target}'. The kit was published without dist/${target} output.`
    );
  }

  let requested = positionals.slice(1);
  if (requested.length === 0) {
    requested = [await chooseFrom('Which component?', available)];
  }

  const components = requested.map((request) => {
    const match = available.find(
      (component) => component.toLowerCase() === request.toLowerCase()
    );
    if (match === undefined) {
      throw new Error(
        `Unknown component '${request}'. Available for ${target}: ${available.join(', ')}.`
      );
    }
    return match;
  });

  const outputDirectory = values['output-directory'] ?? defaultOutputDirectory;
  mkdirSync(outputDirectory, { recursive: true });

  let skipped = false;
  for (const component of components) {
    for (const file of componentFiles(target, component)) {
      const targetPath = join(outputDirectory, file);
      if (existsSync(targetPath) && !(await confirmOverwrite(targetPath))) {
        console.error(`skipped ${targetPath} (already exists)`);
        skipped = true;
        continue;
      }
      copyFileSync(join(packageRoot, 'dist', target, file), targetPath);
      console.log(`added ${targetPath}`);
    }
  }
  if (skipped) {
    process.exitCode = 1;
  }
}

function readKitJson(fileName) {
  const filePath = join(packageRoot, fileName);
  if (!existsSync(filePath)) {
    throw new Error(`Missing ${fileName} in the kit package`);
  }
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

/** The component names built for a target, from its dist directory. */
function componentsFor(target) {
  const targetDirectory = join(packageRoot, 'dist', target);
  if (!existsSync(targetDirectory)) {
    return [];
  }
  return readdirSync(targetDirectory)
    .filter((file) => componentFileExtensions.includes(extname(file)))
    .map((file) => basename(file, extname(file)))
    .sort();
}

/** All built files belonging to a component: its file plus stylesheets. */
function componentFiles(target, component) {
  return readdirSync(join(packageRoot, 'dist', target)).filter(
    (file) => basename(file, extname(file)) === component && file !== 'index.ts'
  );
}

async function chooseFrom(message, choices) {
  const answer = await ask(
    `${message}\n${choices.map((choice, i) => `  ${i + 1}. ${choice}`).join('\n')}\n> `
  );
  const index = Number.parseInt(answer, 10);
  if (Number.isInteger(index) && index >= 1 && index <= choices.length) {
    return choices[index - 1];
  }
  if (choices.includes(answer.trim())) {
    return answer.trim();
  }
  throw new Error(`Invalid choice '${answer.trim()}'`);
}

async function confirmOverwrite(targetPath) {
  if (!process.stdin.isTTY) {
    return false;
  }
  const answer = await ask(`${targetPath} already exists. Overwrite? [y/N] `);
  return answer.trim().toLowerCase() === 'y';
}

async function ask(question) {
  if (!process.stdin.isTTY) {
    throw new Error(
      'Non-interactive run with missing choices. Pass the component names and --target.'
    );
  }
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await readline.question(question);
  } finally {
    readline.close();
  }
}

function printUsage(name, targets) {
  console.log(
    [
      `Usage: npx ${name} add [components...] [options]`,
      '',
      'Copies built component files into your project.',
      '',
      'Options:',
      `  --target <name>              target to copy from (${targets.join(', ')})`,
      `  -o, --output-directory <path>  destination (default ${defaultOutputDirectory})`,
      '  --list                       list the built components per target',
      '  -h, --help                   show this help',
    ].join('\n')
  );
}
