#!/usr/bin/env node
// The preview CLI: `scaffold-ui-kit-preview <command>` run from (or pointed at)
// a kit root whose configuration carries a `preview` block. `dev` is the daily driver:
// generate, then serve the host + per-target iframes on one Vite server,
// regenerating as the kit changes.

import { resolve } from 'node:path';
import { Command } from 'commander';
import { buildPreview } from './build.js';
import { checkPreview } from './check.js';
import { loadPreviewContext } from './context.js';
import { generatePreview } from './generate.js';
import { DEFAULT_PORT } from './vite-configuration.js';

const program = new Command();

program
  .name('scaffold-ui-kit-preview')
  .description('Preview for scaffold-ui-kit kits')
  .option('--kit <path>', 'kit root', '.')
  .option(
    '--configuration <path>',
    "the kit configuration file (default: the one the kit's package.json names, else scaffold-ui-kit.ts or scaffold-ui-kit.json in the kit root)"
  );

function kitRoot(): string {
  return resolve(process.cwd(), program.opts<{ kit: string }>().kit);
}

/** The kit configuration file `--configuration` names, if any. */
function configurationOptions(): { configuration?: string } {
  const { configuration } = program.opts<{ configuration?: string }>();
  return configuration === undefined ? {} : { configuration };
}

function context() {
  const loaded = loadPreviewContext(kitRoot(), configurationOptions());
  for (const line of loaded.warnings) console.warn(`warning ${line}`);
  return loaded;
}

program
  .command('generate')
  .description(
    'one-shot: render the registries + manifest into .preview-generated/'
  )
  .action(async () => {
    await generatePreview(context());
  });

program
  .command('dev')
  .description(
    'generate, then serve the preview (host + framework iframes), regenerating as the kit changes'
  )
  .option(
    '--port <number>',
    `dev-server port (default: the kit's configured port, else ${DEFAULT_PORT})`,
    Number
  )
  .option(
    '--host [address]',
    "the address to listen on, or every address without one, so another device on the network can open the preview (default: the kit's configured host, else this machine only)"
  )
  .action(async (options: { port?: number; host?: string | boolean }) => {
    const { startDevelopmentServer } = await import('./development-server.js');
    await startDevelopmentServer(
      kitRoot(),
      { port: options.port, host: options.host },
      configurationOptions()
    );
  });

program
  .command('check')
  .description(
    'check the story files, the manual specs and the build against the components'
  )
  .option(
    '--strict',
    'fail on every warning the check itself raises, such as a select value or boolean no scenario sets'
  )
  .action(async (options: { strict?: boolean }) => {
    const report = await checkPreview(kitRoot(), {
      strict: options.strict,
      ...configurationOptions(),
    });
    for (const line of report.errors) console.error(`error   ${line}`);
    for (const line of report.warnings) console.warn(`warning ${line}`);
    for (const line of report.hidden) console.log(`hidden  ${line}`);
    for (const line of report.ungenerated) console.log(`ungenerated ${line}`);
    console.log(
      `[preview:check] ${report.errors.length} errors, ${report.warnings.length} warnings, ${report.hidden.length} hidden props, ${report.ungenerated.length} ungenerated props`
    );
    if (report.errors.length > 0) process.exitCode = 1;
  });

program
  .command('build')
  .description(
    'check, then generate and build the static preview into .preview-static/; a check error stops it'
  )
  .action(async () => {
    // A check error stops the build, with the errors printed as `check`
    // prints them.
    const { built, errors, warnings } = await buildPreview(
      kitRoot(),
      undefined,
      configurationOptions()
    );
    for (const line of warnings) console.warn(`warning ${line}`);
    if (built) return;
    for (const line of errors) console.error(`error   ${line}`);
    console.error(
      `[preview:build] ${errors.length} ${errors.length === 1 ? 'error' : 'errors'} from the check; the preview is not built`
    );
    process.exitCode = 1;
  });

program.parseAsync().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
