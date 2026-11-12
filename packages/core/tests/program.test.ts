import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  initCommand,
  initializeCommand,
  nextSteps,
} from '../src/commands/initialize';
import {
  createProgram,
  parseStylingList,
  parseTargetList,
} from '../src/program';

describe('parseTargetList', () => {
  it('parses a comma-separated list, order preserved', () => {
    expect(parseTargetList('vue,react')).toEqual(['vue', 'react']);
  });

  it('trims whitespace and drops empty entries', () => {
    expect(parseTargetList(' react , html ,')).toEqual(['react', 'html']);
  });

  it('rejects an unknown target', () => {
    expect(() => parseTargetList('react,angular')).toThrow(
      "Unknown target 'angular'"
    );
  });

  it('rejects an empty list', () => {
    expect(() => parseTargetList(',')).toThrow('at least one target');
  });
});

describe('parseStylingList', () => {
  it('parses a comma-separated list, order preserved', () => {
    expect(parseStylingList('tailwind,bem')).toEqual(['tailwind', 'bem']);
  });

  it("maps 'none' to an empty list", () => {
    expect(parseStylingList('none')).toEqual([]);
  });

  it('rejects an unknown styling extension', () => {
    expect(() => parseStylingList('scss')).toThrow(
      "Unknown styling extension 'scss'"
    );
  });
});

describe('createProgram', () => {
  it('declares the initialize and build commands, initialize as the default', () => {
    const program = createProgram();
    expect(program.name()).toBe('scaffold-ui-kit');
    expect(program.commands.map((command) => command.name())).toEqual([
      'initialize',
      'build',
    ]);
  });

  it('keeps init as an alias of initialize', () => {
    const program = createProgram();
    const initialize = program.commands.find(
      (command) => command.name() === 'initialize'
    );
    expect(initialize?.aliases()).toEqual(['init']);
    expect(initCommand).toBe(initializeCommand);
  });

  it('warns when run as init, and not when run as initialize', async () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const directory = mkdtempSync(join(tmpdir(), 'scaffold-ui-kit-program-'));
    const run = (command: string, name: string): Promise<unknown> =>
      createProgram().parseAsync(
        [
          command,
          name,
          '--targets',
          'react',
          '--styling',
          'bem',
          '--no-examples',
          '--no-preview',
          '-d',
          directory,
        ],
        { from: 'user' }
      );
    try {
      await run('initialize', 'kit-one');
      expect(error).not.toHaveBeenCalled();
      await run('init', 'kit-two');
      expect(error).toHaveBeenCalledWith(
        "warning: 'init' is deprecated and will be removed in 3.0.0; run 'initialize'"
      );
    } finally {
      error.mockRestore();
      log.mockRestore();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("prints the next steps, the preview's script building the kit itself", () => {
    expect(nextSteps('my-ui-kit', true)).toBe(
      '\nYour kit is ready. Next steps:\n  cd my-ui-kit\n  npm install\n  npm run preview'
    );
    expect(nextSteps('my-ui-kit', false)).toBe(
      '\nYour kit is ready. Next steps:\n  cd my-ui-kit\n  npm install\n  npm run build'
    );
  });

  it('lets initialize opt out of the preview', () => {
    const program = createProgram();
    const initialize = program.commands.find(
      (command) => command.name() === 'initialize'
    );
    const flags = initialize?.options.map((option) => option.long);
    expect(flags).toContain('--preview');
    expect(flags).toContain('--no-preview');
  });
});
