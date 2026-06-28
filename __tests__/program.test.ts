import { describe, expect, it } from 'vitest';

import { createProgram, parseStylingList, parseTargetList } from '../src/program';

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
  it('declares the init and build commands, init as the default', () => {
    const program = createProgram();
    expect(program.name()).toBe('scaffold-ui-kit');
    expect(program.commands.map((command) => command.name())).toEqual([
      'init',
      'build',
    ]);
  });
});
