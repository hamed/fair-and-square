import { describe, expect, it } from 'vitest';
import { Session } from '../stage/console/session.ts';
import { parseRecipe } from '../stage/core/recipe.ts';
import { FAIR, GRID, cells, pixelCells } from '../stage/view/logo.ts';
import { castOf } from '../stage/view/opening.ts';

const overlap = (a: { x: number; y: number; side: number }, b: { x: number; y: number; side: number }) =>
  a.x < b.x + b.side - 1e-12 && b.x < a.x + a.side - 1e-12 && a.y < b.y + b.side - 1e-12 && b.y < a.y + a.side - 1e-12;

describe('the logo', () => {
  it('is sixteen squares inside the box, none overlapping, whose wealth sums to one', () => {
    const sq = cells(GRID);
    expect(sq).toHaveLength(16);
    let total = 0;
    for (const [i, a] of sq.entries()) {
      total += a.share;
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.x + a.side).toBeLessThanOrEqual(1 + 1e-12);
      expect(a.y + a.side).toBeLessThanOrEqual(1 + 1e-12);
      for (const b of sq.slice(i + 1)) expect(overlap(a, b)).toBe(false);
    }
    expect(total).toBeCloseTo(1, 12);
    expect(sq[0].share).toBeCloseTo(9 / 16, 12);
  });

  it('with the gutters closed, every square is its wealth: 7 + 5 + 3 + 1 tiles the box', () => {
    const sq = cells({ ...GRID, gap: 0 });
    let area = 0;
    for (const a of sq) {
      expect(a.side * a.side).toBeCloseTo(a.share, 12);
      area += a.side * a.side;
    }
    expect(area).toBeCloseTo(1, 12);
  });

  it('unfolds into the fair 4 × 4: each cell once, the big one and the ring where they were', () => {
    expect(new Set(FAIR.map(([r, c]) => `${r},${c}`)).size).toBe(16);
    for (const [r, c] of FAIR) expect(r >= 0 && r < 4 && c >= 0 && c < 4).toBe(true);
    expect(FAIR[0]).toEqual([0, 0]);
    expect(FAIR.slice(1, 4)).toEqual([[0, 3], [1, 3], [2, 3]]);
    expect(FAIR.slice(4, 7)).toEqual([[3, 0], [3, 1], [3, 2]]);
    expect(FAIR[15]).toEqual([3, 3]);
  });

  it('fits whole pixels at favicon sizes: every square inside, none touching', () => {
    for (const P of [16, 24, 32, 48, 64]) {
      const { cells: grid } = pixelCells(P);
      for (const [i, a] of grid.entries()) {
        expect(Number.isInteger(a.x) && Number.isInteger(a.y) && Number.isInteger(a.side)).toBe(true);
        expect(a.x + a.side).toBeLessThanOrEqual(P);
        for (const b of grid.slice(i + 1)) expect(overlap(a, b)).toBe(false);
      }
    }
  });
});

describe('the opening', () => {
  it('casts the stage’s sixteen folded people, one to each square', () => {
    const who = castOf(new Session({ n: 16, recipe: parseRecipe('fold') }));
    expect(who).not.toBeNull();
    expect([...who!].sort((a, b) => a - b)).toEqual([...Array(16).keys()]);
  });

  it('declines a stage it cannot end on: not sixteen, or not folded', () => {
    expect(castOf(new Session())).toBeNull();
    expect(castOf(new Session({ n: 16 }))).toBeNull();
  });
});
