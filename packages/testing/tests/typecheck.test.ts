import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  checkSvelte,
  compareDiagnostics,
  formatDiagnostic,
  parseSvelteCheckOutput,
  type KnownDiagnostic,
} from '../src/typecheck/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixtures/svelte-check');

// svelte-check 4's `--output machine-verbose` over fixtures/svelte-check, as
// it wrote it (the workspace path replaced).
const machineOutput = readFileSync(
  join(here, 'fixtures/svelte-check-machine-verbose.txt'),
  'utf8'
);

const keyHandler: KnownDiagnostic = {
  type: 'WARNING',
  reason: 'The fixture takes a click on a div on purpose.',
  files: ['src/Clickable.svelte'],
  message: 'Visible, non-interactive element `<div>` with a click event',
};

const role: KnownDiagnostic = {
  type: 'WARNING',
  reason: 'The same div.',
  files: ['src/Clickable.svelte'],
  message: /must have an ARIA role/,
};

describe('parseSvelteCheckOutput', () => {
  it("reads svelte-check's machine-verbose output", () => {
    const { diagnostics, completed } = parseSvelteCheckOutput(machineOutput);
    expect(completed).toBe(true);
    expect(
      diagnostics.map(({ type, filename, start, code, source }) => ({
        type,
        filename,
        start,
        code,
        source,
      }))
    ).toEqual([
      {
        type: 'WARNING',
        filename: 'src/Clickable.svelte',
        start: { line: 4, character: 0 },
        code: 'a11y_click_events_have_key_events',
        source: 'svelte',
      },
      {
        type: 'WARNING',
        filename: 'src/Clickable.svelte',
        start: { line: 4, character: 0 },
        code: 'a11y_no_static_element_interactions',
        source: 'svelte',
      },
      {
        type: 'WARNING',
        filename: 'src/Counter.svelte',
        start: { line: 2, character: 24 },
        code: 'state_referenced_locally',
        source: 'svelte',
      },
      {
        type: 'ERROR',
        filename: 'src/Counter.svelte',
        start: { line: 2, character: 8 },
        code: 2322,
        source: 'ts',
      },
    ]);
    expect(diagnostics[3]?.message).toBe(
      "Type 'number' is not assignable to type 'string'."
    );
  });

  it('reports a run without its COMPLETED line as incomplete', () => {
    const cut = machineOutput.split('\n').slice(0, 3).join('\n');
    const { diagnostics, completed } = parseSvelteCheckOutput(cut);
    expect(completed).toBe(false);
    expect(diagnostics).toHaveLength(2);
  });

  it('names a diagnostic line that is not JSON', () => {
    expect(() =>
      parseSvelteCheckOutput('1794051325707 {"type":"ERROR",')
    ).toThrow(
      /svelte-check wrote a diagnostic line that is not JSON .*: 1794051325707 \{"type":"ERROR",$/
    );
  });

  it('skips lines that are not diagnostics', () => {
    expect(
      parseSvelteCheckOutput('Loading svelte-check\n\n1 START "/x"\n')
        .diagnostics
    ).toEqual([]);
  });
});

describe('compareDiagnostics', () => {
  const { diagnostics } = parseSvelteCheckOutput(machineOutput);

  it('accepts a known diagnostic by type, file and message', () => {
    const comparison = compareDiagnostics(diagnostics, [keyHandler, role]);
    expect(comparison.accepted.map(({ code }) => code)).toEqual([
      'a11y_click_events_have_key_events',
      'a11y_no_static_element_interactions',
    ]);
    expect(comparison.unexpected.map(({ code }) => code)).toEqual([
      'state_referenced_locally',
      2322,
    ]);
    expect(comparison.stale).toEqual([]);
  });

  it('reports a known diagnostic that no longer occurs', () => {
    const gone: KnownDiagnostic = {
      ...keyHandler,
      message: 'A message no file has',
    };
    expect(compareDiagnostics(diagnostics, [gone]).stale).toEqual([
      { known: gone, files: ['src/Clickable.svelte'] },
    ]);
  });

  it('reports each file of a known diagnostic where it no longer occurs', () => {
    const wider: KnownDiagnostic = {
      ...keyHandler,
      files: ['src/Clickable.svelte', 'src/Clean.svelte'],
    };
    expect(compareDiagnostics(diagnostics, [wider]).stale).toEqual([
      { known: wider, files: ['src/Clean.svelte'] },
    ]);
  });

  it('matches neither another type nor another file', () => {
    const asError: KnownDiagnostic = { ...keyHandler, type: 'ERROR' };
    const elsewhere: KnownDiagnostic = {
      ...keyHandler,
      files: ['src/Other.svelte'],
    };
    const comparison = compareDiagnostics(diagnostics, [asError, elsewhere]);
    expect(comparison.accepted).toEqual([]);
    expect(comparison.stale).toHaveLength(2);
  });
});

describe('formatDiagnostic', () => {
  it('writes a diagnostic as one line with a one-based position', () => {
    const { diagnostics } = parseSvelteCheckOutput(machineOutput);
    expect(diagnostics.map(formatDiagnostic).slice(2)).toEqual([
      'src/Counter.svelte:3:25 warning state_referenced_locally: This reference only captures the initial value of `start`. Did you mean to reference it inside a closure instead?',
      "src/Counter.svelte:3:9 error TS2322: Type 'number' is not assignable to type 'string'.",
    ]);
  });
});

describe('checkSvelte', () => {
  it('names the exit status when svelte-check does not complete', () => {
    expect(() =>
      checkSvelte({ directory: fixture, tsconfig: 'missing.json' })
    ).toThrow(
      /svelte-check did not complete its run; it exited with status \d+/
    );
  }, 120_000);

  it('fails when the tsconfig reaches no Svelte file, naming its include', () => {
    expect(() =>
      checkSvelte({ directory: fixture, tsconfig: 'tsconfig.no-svelte.json' })
    ).toThrow(
      'tsconfig.no-svelte.json reaches no .svelte file, so svelte-check checked none (include: ["typescript-only/**/*"]; exclude: ["typescript-only/imports-svelte.ts"]).'
    );
  }, 120_000);

  it('checks a tsconfig that reaches a Svelte file among others', () => {
    const result = checkSvelte({
      directory: fixture,
      tsconfig: 'tsconfig.mixed.json',
    });
    expect(result.passed).toBe(true);
  }, 120_000);

  it('checks a Svelte file reached only through an import', () => {
    const result = checkSvelte({
      directory: fixture,
      tsconfig: 'tsconfig.imported.json',
    });
    expect(result.passed).toBe(true);
  }, 120_000);

  it('follows imports through a chain of modules to a Svelte file', () => {
    const result = checkSvelte({
      directory: fixture,
      tsconfig: 'tsconfig.chain.json',
    });
    expect(result.passed).toBe(false);
    expect(result.report).toContain(
      "src/Counter.svelte:3:9 error TS2322: Type 'number' is not assignable to type 'string'."
    );
  }, 120_000);

  it('counts a module written with runes as a Svelte file', () => {
    const result = checkSvelte({
      directory: fixture,
      tsconfig: 'tsconfig.runes-module.json',
    });
    expect(result.passed).toBe(true);
  }, 120_000);

  it("includes svelte-check's warning when a named file does not exist", () => {
    expect(() =>
      checkSvelte({
        directory: fixture,
        tsconfig: 'tsconfig.missing-file.json',
      })
    ).toThrow(/reaches no \.svelte file[^]*warning[^]*missing\.ts/);
  }, 120_000);

  it('reports a missing file beside a Svelte file instead of failing to read it', () => {
    const result = checkSvelte({
      directory: fixture,
      tsconfig: 'tsconfig.missing-file-among.json',
    });
    expect(result.passed).toBe(false);
    expect(result.report).toContain('missing.ts');
  }, 120_000);

  it('runs svelte-check and passes only once every diagnostic is known', () => {
    const counter: KnownDiagnostic[] = [
      {
        type: 'WARNING',
        reason: 'The fixture reads its prop once.',
        files: ['src/Counter.svelte'],
        message: 'This reference only captures the initial value of `start`',
      },
      {
        type: 'ERROR',
        reason: 'The fixture assigns a number to a string.',
        files: ['src/Counter.svelte'],
        message: "Type 'number' is not assignable to type 'string'.",
      },
    ];
    const failing = checkSvelte({
      directory: fixture,
      tsconfig: 'tsconfig.json',
      known: [keyHandler],
    });
    expect(failing.passed).toBe(false);
    expect(failing.diagnostics).toHaveLength(4);
    expect(failing.report).toContain(
      'svelte-check: 1 error(s), 2 warning(s), 1 known diagnostic(s) accepted, 0 known diagnostic(s) no longer occurring.'
    );

    const passing = checkSvelte({
      directory: fixture,
      tsconfig: 'tsconfig.json',
      known: [keyHandler, role, ...counter],
    });
    expect(passing.passed).toBe(true);

    const errorsOnly = checkSvelte({
      directory: fixture,
      tsconfig: 'tsconfig.json',
      threshold: 'error',
      known: [counter[1] as KnownDiagnostic],
    });
    expect(errorsOnly.passed).toBe(true);
  }, 120_000);
});
