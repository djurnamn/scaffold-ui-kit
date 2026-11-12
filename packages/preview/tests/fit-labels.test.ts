import { describe, expect, it } from 'vitest';
import { fitLabels } from '../application/shells/charcell/fit-labels';

describe('fitLabels', () => {
  it('keeps every label that fits, each with a cell of padding at each side', () => {
    expect(fitLabels(['reload', 'open'], 14)).toEqual(['reload', 'open']);
    expect(fitLabels(['reload', 'open'], 40)).toEqual(['reload', 'open']);
  });

  it('keeps them all while the cells are not known', () => {
    expect(fitLabels(['reload', 'open'], undefined)).toEqual(['reload', 'open']);
  });

  it('takes one letter at a time off the last label, behind an ellipsis', () => {
    expect(fitLabels(['reload', 'open'], 13)).toEqual(['reload', 'op\u2026']);
    expect(fitLabels(['reload', 'open'], 12)).toEqual(['reload', 'o\u2026']);
  });

  it('drops a label before it is only an ellipsis, and the one before gives way', () => {
    expect(fitLabels(['reload', 'open'], 11)).toEqual(['reload']);
    expect(fitLabels(['reload', 'open'], 8)).toEqual(['reload']);
    expect(fitLabels(['reload', 'open'], 7)).toEqual(['relo\u2026']);
    expect(fitLabels(['reload', 'open'], 4)).toEqual(['r\u2026']);
  });

  it('shows nothing when not even a letter and the ellipsis fit', () => {
    expect(fitLabels(['reload', 'open'], 3)).toEqual([]);
    expect(fitLabels(['reload', 'open'], -3)).toEqual([]);
  });

  it('never takes more cells than there are', () => {
    for (let cells = 0; cells <= 20; cells += 1) {
      const taken = fitLabels(['reload', 'open'], cells).reduce((sum, label) => sum + [...label].length + 2, 0);
      expect(taken).toBeLessThanOrEqual(cells);
    }
  });
});
