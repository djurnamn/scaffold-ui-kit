// The cells the charcell shell's stacked output rows start at
// (application/shells/charcell/stacked-rows): each row at its story's height
// when the stories fit, the rest under the last story; an equal share when
// they don't, a shorter story keeping its height; each row's least the
// readable least or its story's when shorter, the code row at its share as
// far as those leasts allow, and the rows sharing more than the stage holds
// only when the leasts don't fit.
import { describe, expect, it } from 'vitest';
import { stackedLeastCells, stackedRowCells, stackedRowMinimums } from '../application/shells/charcell/stacked-rows';

const code = { least: 8, share: 30 };

describe('stackedRowCells', () => {
  it('starts each row at its story when the stories fit, the last row taking the rest', () => {
    expect(stackedRowCells({ wanted: [5, 12, 4, 6], total: 60, least: 10 })).toEqual([5, 12, 4, 39]);
  });

  it('gives the rest to the code row under rows that fit', () => {
    expect(stackedRowCells({ wanted: [5, 12], total: 60, least: 10, code })).toEqual([5, 12, 43]);
  });

  it('fits four short stories and the code row on a short stage, the code row at its share at least', () => {
    const cells = stackedRowCells({ wanted: [4, 4, 4, 4], total: 40, least: 10, code });
    expect(cells).toEqual([4, 4, 4, 4, 24]);
    expect(cells[4]).toBeGreaterThanOrEqual(Math.round(0.3 * 40));
    expect(stackedLeastCells([4, 4, 4, 4], 10, code)).toBe(16 + 8 + 4);
  });

  it('shares the space equally between stories too tall to fit', () => {
    expect(stackedRowCells({ wanted: [50, 50, 50, 50], total: 48, least: 10 })).toEqual([12, 12, 12, 12]);
  });

  it('keeps a shorter story at its height, the taller ones sharing the rest', () => {
    expect(stackedRowCells({ wanted: [5, 40, 40], total: 60, least: 4 })).toEqual([5, 27, 28]);
  });

  it('gives mixed stories over the code row their least, the code row its share as far as they allow', () => {
    // Two short stories and two tall ones: the code row takes its 30%.
    expect(stackedRowCells({ wanted: [4, 50, 4, 50], total: 60, least: 10, code })).toEqual([4, 17, 4, 17, 18]);
    // On a shorter stage it gives up its share for the tall rows' least.
    expect(stackedRowCells({ wanted: [4, 50, 4, 50], total: 32, least: 10, code })).toEqual([4, 10, 4, 10, 8]);
    expect(stackedLeastCells([4, 50, 4, 50], 10, code)).toBe(28 + 8 + 4);
  });

  it('asks for an equal share for a story that has not reported its height', () => {
    expect(stackedRowCells({ wanted: [undefined, 4, undefined], total: 40, least: 10 })).toEqual([18, 4, 18]);
  });

  it('starts the code row at its share as far as the output rows keep their least', () => {
    expect(stackedRowCells({ wanted: [50, 50, 50, 50], total: 80, least: 10, code })).toEqual([14, 14, 14, 14, 24]);
    expect(stackedRowCells({ wanted: [50, 50, 50, 50], total: 48, least: 10, code })).toEqual([10, 10, 10, 10, 8]);
  });

  it('keeps every taller row at its least when the stage is shorter than the rows need', () => {
    expect(stackedRowCells({ wanted: [50, 50, 50, 50], total: 20, least: 10 })).toEqual([10, 10, 10, 10]);
  });
});

describe('stackedRowMinimums and stackedLeastCells', () => {
  it("takes each row's least as the readable least or its story's, an unreported one the readable least", () => {
    expect(stackedRowMinimums([4.2, undefined, 30], 10)).toEqual([5, 10, 10]);
  });

  it("counts each row's least and a cell per handle", () => {
    expect(stackedLeastCells([50, 50, 50, 50], 10)).toBe(43);
    expect(stackedLeastCells([50, 50, 50, 50], 10, code)).toBe(52);
  });
});
