/** REVIEW-2026-10-19-MODEL-BLOCKS-RECHECK-5: R1 (the lattice through rebuilds), R2 (a proportional flip at zero). */
import { describe, expect, it } from 'vitest';
import { num, type Node, type Program } from '../model/ast.ts';
import { Run } from '../model/engine.ts';
import { options as o, preset, tradeOf } from '../model/presets.ts';
import { Session } from '../stage/console/session.ts';

/** Every body centred on its model cell, the cell size taken from the figure. */
function onCells(s: Session): boolean {
  const world = s.game.run.world;
  const f = s.figure;
  const cx = (i: number) => f.x[i] + f.w[i] / 2;
  const col = (i: number) => world.cell[i] % world.side;
  const row = (i: number) => Math.floor(world.cell[i] / world.side);
  // the cell: any two bodies in different columns
  let cell = NaN;
  for (let i = 1; i < s.game.n && !(cell > 0); i++) if (col(i) !== col(0)) cell = (cx(i) - cx(0)) / (col(i) - col(0));
  if (!(cell > 0)) return false;
  for (let i = 0; i < s.game.n; i++) {
    if (Math.abs(cx(i) - (col(i) + 0.5) * cell) > 1e-9) return false;
    if (Math.abs(f.y[i] + f.h[i] / 2 - (row(i) + 0.5) * cell) > 1e-9) return false;
  }
  return true;
}

describe('R1: a lattice yard stays on its lattice', () => {
  it('after construction, a seed change and a new N, before any round', () => {
    const s = new Session({ program: preset('local').program });
    expect(s.recipe.pose).toBe('lattice');
    expect(onCells(s)).toBe(true);
    s.run('seed 2');
    expect(onCells(s)).toBe(true);
    s.frame(1 / 60);
    expect(onCells(s)).toBe(true);
    s.run('n 20');
    expect(s.game.n).toBe(20);
    expect(onCells(s)).toBe(true);
    s.frame(1 / 60);
    expect(onCells(s)).toBe(true);
  });
});

describe('R2: in proportion to wealth, at zero and with debt', () => {
  const two = (start: Node, setup: Node[] = []): Program => ({
    ast: 1,
    scripts: [
      {
        op: 'ctl.start',
        body: [
          { op: 'setup.yard', f: { space: 'free' }, args: { n: num(2) } },
          { op: 'setup.start', args: { with: start } },
          ...setup,
          { op: 'ctl.forever', body: [tradeOf({ coin: o.share(), stake: { op: 'stake.fixed', args: { a: num(0.1) } } })] },
        ],
      },
    ],
  });
  const all: Node = { op: 'alloc.classes', args: { q: { op: 'pct', v: 0.5 }, s: { op: 'pct', v: 1 } } };

  it('a square with nothing never wins, and nothing warns', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const run = new Run(two(all), seed);
      const before = Array.from(run.world.w);
      run.rounds(1);
      expect(Array.from(run.world.w), `seed ${seed}`).toEqual(before);
      expect(run.warnings.size).toBe(0);
    }
  });

  it('with debt, wealth in play (w + D) sets the odds: from 0 and 2 with D = 1, the poorer wins a quarter', () => {
    const debt: Node = { op: 'debt', args: { d: num(1) } };
    let poorerWins = 0;
    for (let seed = 1; seed <= 400; seed++) {
      // from 0 and 2, D = 1: in play 1 and 3, so the poorer wins a quarter of the time
      const run = new Run(two(all, [debt]), seed);
      run.rounds(1);
      if (run.world.w[0] + run.world.w[1] === 2 && Math.min(...run.world.w) > 0) poorerWins++;
    }
    expect(poorerWins / 400).toBeGreaterThan(0.18);
    expect(poorerWins / 400).toBeLessThan(0.32);
  });
});
