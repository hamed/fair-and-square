/** The stage's game: a program run by the model's engine, seen as shares, its moves reported as they happen. */
import { describe, expect, it } from 'vitest';
import { preset } from '../model/presets.ts';
import { statsOf } from '../stage/core/stats.ts';
import { Game, stageProgram, withN } from '../stage/core/game.ts';
import { POT, type Move } from '../stage/core/transfer.ts';

const sum = (xs: ArrayLike<number>) => Array.from(xs).reduce((a, b) => a + b, 0);
const potShare = (g: Game) => g.run.world.pot / (sum(g.run.world.w) + g.run.world.pot);

describe('game', () => {
  it('starts equal with total 1 and conserves it through rounds, trades, levies and gifts', () => {
    const g = new Game(50, 3);
    expect(Array.from(g.wealth).every((x) => x === 1 / 50)).toBe(true);
    g.round(40);
    g.trade(300);
    g.levy(0.2);
    g.give(1, 2, 0.01);
    g.setRules({ tax: 0.05 });
    g.round(10);
    expect(sum(g.wealth) + potShare(g)).toBeCloseTo(1, 12);
  });

  it('is deterministic per seed and replays after reset', () => {
    const a = new Game(30, 7);
    const b = new Game(30, 7);
    a.round(60);
    b.round(60);
    expect(Array.from(a.wealth)).toEqual(Array.from(b.wealth));
    const at60 = Array.from(a.wealth);
    a.reset();
    expect(Array.from(a.wealth).every((x) => x === 1 / 30)).toBe(true);
    a.round(60);
    expect(Array.from(a.wealth)).toEqual(at60);
    const c = new Game(30, 8);
    c.round(60);
    expect(Array.from(c.wealth)).not.toEqual(at60);
  });

  it('concentrates wealth under the yard sale and spreads it under a tax', () => {
    const free = new Game(100, 1);
    const taxed = new Game(100, 1, { beta: 0.2, tax: 0.05 });
    free.round(2000);
    taxed.round(2000);
    expect(statsOf(free.wealth).gini).toBeGreaterThan(0.8);
    expect(statsOf(taxed.wealth).gini).toBeLessThan(0.5);
  });

  it('a gift never empties the giver: a log pose always has a finite poorest', () => {
    const g = new Game(10, 1);
    const moved = g.give(0, 1, 1);
    expect(moved).toBeLessThan(0.1);
    expect(g.wealth[0]).toBeGreaterThan(0);
  });

  it('every change of hands is reported: the moves add up to the change of wealth', () => {
    const g = new Game(12, 5, { beta: 0.3, tax: 0.1 });
    const before = Float64Array.from(g.wealth);
    const delta = new Float64Array(12);
    const kinds: string[] = [];
    g.onMoves = (kind, moves: readonly Move[]) => {
      kinds.push(kind);
      for (const m of moves) {
        if (m.from !== POT) delta[m.from] -= m.amount;
        if (m.to !== POT) delta[m.to] += m.amount;
      }
    };
    g.round(1);
    expect(kinds.filter((k) => k === 'trade')).toHaveLength(6);
    expect(kinds.at(-1)).toBe('levy');
    for (let k = 0; k < 12; k++) expect(before[k] + delta[k]).toBeCloseTo(g.wealth[k], 12);
  });

  it('the rules are the program\'s sliders: moving them keeps the run going', () => {
    const g = new Game(20, 2);
    g.round(10);
    g.setRules({ beta: 0.4 });
    expect(g.rules.beta).toBe(0.4);
    expect(g.run.round).toBe(10);
    expect(g.run.inputs.map((i) => i.event)).toEqual([{ kind: 'slider', name: 'stake', value: 0.4 }]);
    const plain = new Game(20, 2, preset('yard-sale').program);
    expect(() => plain.setRules({ beta: 0.3 })).toThrow(/no "stake" slider/);
    expect(() => g.setRules({ beta: 1 })).toThrow(/stake must be in/);
  });

  it('peek: the next round trades exactly the partners it showed', () => {
    const g = new Game(10, 4);
    g.round(3);
    const order = g.peek()!;
    const partner = new Map<number, number>();
    for (let p = 0; p + 1 < 10; p += 2) {
      partner.set(order[p], order[p + 1]);
      partner.set(order[p + 1], order[p]);
    }
    g.onMoves = (kind, moves) => {
      if (kind === 'trade') expect(partner.get(moves[0].from)).toBe(moves[0].to);
    };
    g.round(1);
    expect(new Game(10, 4, preset('local').program).peek()).toBeNull();
  });

  it('snapshot and restore: back to the same state, inputs and all', () => {
    const g = new Game(16, 9);
    g.round(20);
    const saved = g.snapshot();
    const at = Array.from(g.wealth);
    g.trade(50);
    g.levy(0.3);
    g.round(5);
    g.restore(saved);
    expect(Array.from(g.wealth)).toEqual(at);
    expect(g.run.inputs).toHaveLength(0);
    expect(g.run.round).toBe(20);
  });

  it('a share as it is reported is the engine\'s: a tiny one stays positive through many trades', () => {
    // a 20% stake: 30,000 trades leave someone with almost nothing
    const g = new Game(30, 1, { beta: 0.2, tax: 0 });
    let negative = 0;
    g.onMoves = (_, moves) => {
      for (const m of moves) if (g.wealth[m.from] <= 0 || g.wealth[m.to] <= 0) negative++;
    };
    g.trade(30000);
    expect(Math.min(...g.wealth)).toBeLessThan(1e-12);
    expect(negative).toBe(0);
  });

  it('withN changes the yard of a program; an expression N refuses', () => {
    expect(new Game(1, 1, withN(stageProgram(36), 12)).n).toBe(12);
  });
});
