// The Svelte target type-checked with svelte-check, its diagnostics compared
// against the ones a kit has accepted.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

/** Whether svelte-check reports a diagnostic as an error or a warning. */
export type DiagnosticType = 'ERROR' | 'WARNING';

/** A diagnostic svelte-check reports. */
export interface SvelteCheckDiagnostic {
  /** Whether it is an error or a warning. */
  type: DiagnosticType;
  /** The file, relative to the directory svelte-check checked. */
  filename: string;
  /** Where it starts: a zero-based line and character. */
  start: { line: number; character: number };
  /** The message, the Svelte compiler's documentation link included. */
  message: string;
  /** TypeScript's error number or the Svelte compiler's warning code. */
  code?: number | string;
  /** What reported it: `ts`, `svelte`, `css`. */
  source?: string;
}

/** A diagnostic a kit accepts, with the reason. */
export interface KnownDiagnostic {
  /** Whether svelte-check reports it as an error or a warning. */
  type: DiagnosticType;
  /** Why it is accepted, and what would remove it. */
  reason: string;
  /** The files it occurs in, as svelte-check names them (relative to the
   *  directory it checks). It must occur in each. */
  files: string[];
  /** The message: a string the message starts with, or a pattern it matches. */
  message: string | RegExp;
}

/** svelte-check's output, parsed. */
export interface SvelteCheckOutput {
  /** The errors and warnings it reported. */
  diagnostics: SvelteCheckDiagnostic[];
  /** Whether it finished its run (its `COMPLETED` line). */
  completed: boolean;
}

/** Diagnostics compared against the known ones. */
export interface DiagnosticComparison {
  /** Diagnostics no known entry accepts. */
  unexpected: SvelteCheckDiagnostic[];
  /** Diagnostics a known entry accepts. */
  accepted: SvelteCheckDiagnostic[];
  /** Known entries that no longer occur, each with the files it is missing
   *  from. */
  stale: { known: KnownDiagnostic; files: string[] }[];
}

/**
 * Parse svelte-check's `--output machine-verbose` output: one JSON object
 * per diagnostic, each on its own line after a timestamp, and a `COMPLETED`
 * line at the end of the run. Lines of any other kind are skipped.
 *
 * @param output - What svelte-check wrote, standard output and error together.
 * @returns The errors and warnings, and whether the run completed.
 * @throws When a diagnostic line is not JSON, naming the line.
 */
export function parseSvelteCheckOutput(output: string): SvelteCheckOutput {
  const diagnostics: SvelteCheckDiagnostic[] = [];
  let completed = false;
  for (const line of output.split('\n')) {
    const [, rest = ''] = /^\d+\s+(.*)$/.exec(line.trim()) ?? [];
    if (rest.startsWith('COMPLETED')) {
      completed = true;
      continue;
    }
    if (!rest.startsWith('{')) continue;
    let diagnostic: SvelteCheckDiagnostic;
    try {
      diagnostic = JSON.parse(rest) as SvelteCheckDiagnostic;
    } catch (error) {
      throw new Error(
        `svelte-check wrote a diagnostic line that is not JSON (${(error as Error).message}): ${line}`
      );
    }
    if (diagnostic.type === 'ERROR' || diagnostic.type === 'WARNING') {
      diagnostics.push(diagnostic);
    }
  }
  return { diagnostics, completed };
}

/** Whether a known entry accepts a diagnostic in a file of its own. */
function accepts(known: KnownDiagnostic, diagnostic: SvelteCheckDiagnostic) {
  return (
    known.type === diagnostic.type &&
    known.files.includes(diagnostic.filename) &&
    (typeof known.message === 'string'
      ? diagnostic.message.startsWith(known.message)
      : known.message.test(diagnostic.message))
  );
}

/**
 * Compare diagnostics against the known ones. A diagnostic no entry accepts
 * is unexpected; an entry with a file where no diagnostic it accepts occurs
 * is stale, so the list can only shrink as the markup behind it changes.
 *
 * @param diagnostics - The diagnostics svelte-check reported.
 * @param known - The diagnostics the kit accepts.
 * @returns The unexpected, the accepted and the stale.
 */
export function compareDiagnostics(
  diagnostics: SvelteCheckDiagnostic[],
  known: KnownDiagnostic[]
): DiagnosticComparison {
  const unexpected: SvelteCheckDiagnostic[] = [];
  const accepted: SvelteCheckDiagnostic[] = [];
  const occurred = new Map<KnownDiagnostic, Set<string>>();
  for (const diagnostic of diagnostics) {
    const entries = known.filter((entry) => accepts(entry, diagnostic));
    if (entries.length === 0) {
      unexpected.push(diagnostic);
      continue;
    }
    accepted.push(diagnostic);
    for (const entry of entries) {
      const files = occurred.get(entry) ?? new Set<string>();
      files.add(diagnostic.filename);
      occurred.set(entry, files);
    }
  }
  const stale = known.flatMap((entry) => {
    const files = entry.files.filter((file) => !occurred.get(entry)?.has(file));
    return files.length > 0 ? [{ known: entry, files }] : [];
  });
  return { unexpected, accepted, stale };
}

/**
 * A diagnostic as one line: `file:line:character type code: message`, the
 * position one-based.
 *
 * @param diagnostic - The diagnostic.
 * @returns The line.
 */
export function formatDiagnostic(diagnostic: SvelteCheckDiagnostic): string {
  const { type, filename, start, message, code } = diagnostic;
  const label =
    code === undefined
      ? ''
      : typeof code === 'number'
        ? ` TS${code}`
        : ` ${code}`;
  return `${filename}:${start.line + 1}:${start.character + 1} ${type.toLowerCase()}${label}: ${message.split('\n')[0]}`;
}

/** What {@link checkSvelte} runs. */
export interface CheckSvelteOptions {
  /** The tsconfig naming the files to check, relative to `directory`. */
  tsconfig: string;
  /** The diagnostics the kit accepts. */
  known?: KnownDiagnostic[];
  /** The directory svelte-check checks, and resolves itself and the tsconfig
   *  from: the current directory by default. */
  directory?: string;
  /** Report warnings as well as errors (the default), or errors only. */
  threshold?: 'warning' | 'error';
}

/** What {@link checkSvelte} found. */
export interface CheckSvelteResult extends DiagnosticComparison {
  /** Whether no diagnostic is unexpected and no known entry is stale. */
  passed: boolean;
  /** Every diagnostic svelte-check reported. */
  diagnostics: SvelteCheckDiagnostic[];
  /** A summary to print: the unexpected diagnostics, the stale entries and
   *  the counts. */
  report: string;
}

/** The svelte-check command-line script, resolved from `directory`. */
function svelteCheckScript(directory: string): string {
  const require = createRequire(join(directory, 'package.json'));
  const manifestPath = require.resolve('svelte-check/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    bin: string | Record<string, string>;
  };
  const script =
    typeof manifest.bin === 'string'
      ? manifest.bin
      : manifest.bin['svelte-check'];
  if (!script) throw new Error('svelte-check names no command-line script.');
  return resolve(dirname(manifestPath), script);
}

/** The part of the TypeScript compiler {@link assertReachesSvelte} uses. */
interface TypeScriptCompiler {
  sys: { readFile(path: string): string | undefined };
  readConfigFile(
    path: string,
    readFile: (path: string) => string | undefined
  ): { config?: unknown };
  parseJsonConfigFileContent(
    json: unknown,
    host: unknown,
    basePath: string,
    existingOptions: undefined,
    configFileName: string,
    resolutionStack: undefined,
    extraFileExtensions: {
      extension: string;
      isMixedContent: boolean;
      scriptKind: number;
    }[]
  ): {
    fileNames: string[];
    options: object;
    raw?: { files?: string[]; include?: string[]; exclude?: string[] };
  };
  preProcessFile(
    text: string,
    readImportFiles: boolean,
    detectJavaScriptImports: boolean
  ): { importedFiles: { fileName: string }[] };
  resolveModuleName(
    specifier: string,
    containingFile: string,
    options: object,
    host: unknown
  ): { resolvedModule?: { resolvedFileName: string } };
  ScriptKind: { Deferred: number };
}

/** A Svelte component, or a module written with runes. */
const SVELTE_FILE = /\.svelte(\.[jt]s)?$/;

/**
 * Whether files reach a Svelte file through their imports, as svelte-check's
 * program does. A specifier TypeScript cannot resolve counts when it names a
 * Svelte file, as svelte-check resolves those itself or reports them.
 */
function importsReachSvelte(
  ts: TypeScriptCompiler,
  fileNames: string[],
  options: object
): boolean {
  const visited = new Set(fileNames);
  const pending = [...fileNames];
  for (let file = pending.pop(); file; file = pending.pop()) {
    const text = ts.sys.readFile(file);
    if (text === undefined) continue;
    for (const { fileName } of ts.preProcessFile(text, true, true)
      .importedFiles) {
      const resolved = ts.resolveModuleName(fileName, file, options, ts.sys)
        .resolvedModule?.resolvedFileName;
      if (SVELTE_FILE.test(resolved ?? fileName)) return true;
      if (!resolved || resolved.includes('/node_modules/')) continue;
      if (!visited.has(resolved)) {
        visited.add(resolved);
        pending.push(resolved);
      }
    }
  }
  return false;
}

/**
 * Throw when a tsconfig reaches no Svelte file. svelte-check's own count is
 * of every file in its program, the standard library's included, so it does
 * not tell. The tsconfig is read the way svelte-check reads it, with the
 * TypeScript it runs on, and the files it names are followed through their
 * imports.
 */
function assertReachesSvelte(
  directory: string,
  tsconfig: string,
  diagnostics: SvelteCheckDiagnostic[]
): void {
  const require = createRequire(join(directory, 'package.json'));
  const fromCheck = createRequire(require.resolve('svelte-check/package.json'));
  const ts = fromCheck('typescript') as TypeScriptCompiler;
  const path = resolve(directory, tsconfig);
  const { fileNames, options, raw } = ts.parseJsonConfigFileContent(
    ts.readConfigFile(path, ts.sys.readFile).config ?? {},
    ts.sys,
    dirname(path),
    undefined,
    path,
    undefined,
    [
      {
        extension: 'svelte',
        isMixedContent: true,
        scriptKind: ts.ScriptKind.Deferred,
      },
    ]
  );
  if (
    fileNames.some((file) => SVELTE_FILE.test(file)) ||
    importsReachSvelte(ts, fileNames, options)
  ) {
    return;
  }
  const named = (['files', 'include', 'exclude'] as const)
    .filter((key) => raw?.[key] !== undefined)
    .map((key) => `${key}: ${JSON.stringify(raw?.[key])}`);
  throw new Error(
    [
      `${tsconfig} reaches no .svelte file, so svelte-check checked none (${named.join('; ') || 'no files, include or exclude'}).`,
      ...diagnostics.map(formatDiagnostic),
    ].join('\n')
  );
}

/**
 * Run svelte-check over the files a tsconfig names and compare what it
 * reports against the diagnostics the kit accepts. The check passes when
 * every diagnostic is a known one and every known one still occurs. A
 * template cannot carry a `svelte-ignore` comment for one target, so a
 * warning the Svelte compiler gives on markup a template writes on purpose
 * is listed here, with its reason.
 *
 * @param options - The tsconfig, the known diagnostics and where to run.
 * @returns The diagnostics, compared, and a report.
 * @throws When svelte-check cannot be run, writes a diagnostic that is not
 *   JSON, or does not complete its run, and when the tsconfig reaches no
 *   Svelte file, naming what it includes.
 * @example
 * ```ts
 * const result = checkSvelte({
 *   tsconfig: 'tsconfig.svelte.json',
 *   known: [
 *     {
 *       type: 'WARNING',
 *       reason: 'The row takes a click as a shortcut for the link inside it.',
 *       files: ['dist/svelte/Table.svelte'],
 *       message: 'Visible, non-interactive element `<div>` with a click event',
 *     },
 *   ],
 * });
 * console.log(result.report);
 * if (!result.passed) process.exit(1);
 * ```
 */
export function checkSvelte(options: CheckSvelteOptions): CheckSvelteResult {
  const directory = resolve(options.directory ?? process.cwd());
  const run = spawnSync(
    process.execPath,
    [
      svelteCheckScript(directory),
      '--workspace',
      directory,
      '--tsconfig',
      options.tsconfig,
      '--threshold',
      options.threshold ?? 'warning',
      '--output',
      'machine-verbose',
    ],
    { cwd: directory, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  if (run.error) throw run.error;
  const output = `${run.stdout}\n${run.stderr}`;
  const { diagnostics, completed } = parseSvelteCheckOutput(output);
  if (!completed) {
    const ending =
      run.signal !== null
        ? `was ended by ${run.signal}`
        : `exited with status ${run.status}`;
    throw new Error(
      `svelte-check did not complete its run; it ${ending}:\n${output}`
    );
  }
  assertReachesSvelte(directory, options.tsconfig, diagnostics);
  const comparison = compareDiagnostics(diagnostics, options.known ?? []);
  return {
    ...comparison,
    diagnostics,
    passed: comparison.unexpected.length === 0 && comparison.stale.length === 0,
    report: reportOf(comparison),
  };
}

/** The report {@link checkSvelte} returns. */
function reportOf(comparison: DiagnosticComparison): string {
  const lines = comparison.unexpected.map(formatDiagnostic);
  for (const { known, files } of comparison.stale) {
    const message =
      typeof known.message === 'string' ? known.message : known.message.source;
    lines.push(
      `A known diagnostic no longer occurs in ${files.join(', ')}; remove it from the list: ${message}`
    );
  }
  const errors = comparison.unexpected.filter(
    (diagnostic) => diagnostic.type === 'ERROR'
  ).length;
  lines.push(
    `svelte-check: ${errors} error(s), ${comparison.unexpected.length - errors} warning(s), ${comparison.accepted.length} known diagnostic(s) accepted, ${comparison.stale.length} known diagnostic(s) no longer occurring.`
  );
  return lines.join('\n');
}
