/** The simpler vocabulary (owner, 2026-10-19: "simple is better") and the new starting distributions. */
import * as Blockly from 'blockly/core';
import { describe, expect, it } from 'vitest';
import { fromBlockly, toBlockly } from '../../blocks/convert.ts';
import { defineBlocks } from '../../blocks/define.ts';
import { num, type Node, type Program } from '../../model/ast.ts';
import { COUNTRIES, lorenzOf } from '../../model/countries.ts';
import { Run } from '../../model/engine.ts';
import { measure, statOf } from '../../model/stats.ts';
import { panelOf } from '../../model/panel.ts';
import { atanh, tanh } from '../../model/dmath.ts';
import { options as o, program, statementOf, tradeOf } from '../../model/presets.ts';
import { validate } from '../../model/validate.ts';

/** The yard and its start (two setup blocks since the yard says only how many and where). */
const yard = (n: number, start: Node): Node[] => [{ op: 'setup.yard', f: { space: 'free' }, args: { n: num(n) } }, { op: 'setup.start', args: { with: start } }];
const begin = (n: number, start: Node): Program => ({ ast: 1, scripts: [{ op: 'ctl.start', body: [...yard(n, start)] }] });
const pct = (v: number): Node => ({ op: 'pct', v });
const sum = (xs: ArrayLike<number>) => Array.from(xs).reduce((a, b) => a + b, 0);
const sorted = (xs: ArrayLike<number>) => Array.from(xs).sort((a, b) => a - b);

describe('starting distributions', () => {
  it('every start is valid, mean 1, and its own shape', () => {
    const starts: Node[] = [
      { op: 'dist.lognormal', args: { sigma: num(1) } },
      { op: 'dist.pareto', args: { alpha: num(1.5) } },
      { op: 'alloc.classes', args: { q: pct(0.1), s: pct(0.5) } },
      { op: 'alloc.oligarch', args: { s: pct(0.5) } },
      { op: 'alloc.country', f: { country: 'us' } },
    ];
    for (const start of starts) {
      const p = begin(1000, start);
      expect(validate(p), start.op).toEqual([]);
      const w = new Run(p, 3).world.w;
      expect(sum(w) / 1000, start.op).toBeCloseTo(1, 10);
      expect(Math.min(...w), start.op).toBeGreaterThan(0);
    }
  });

  it('two classes and one oligarch hold exactly their shares', () => {
    const classes = sorted(new Run(begin(100, { op: 'alloc.classes', args: { q: pct(0.1), s: pct(0.6) } }), 1).world.w);
    expect(sum(classes.slice(90)) / 100).toBeCloseTo(0.6, 12);
    expect(new Set(classes.map((x) => x.toFixed(9))).size).toBe(2);
    const oligarch = new Run(begin(50, { op: 'alloc.oligarch', args: { s: pct(0.3) } }), 1);
    expect(measure(oligarch.world.w, 0).topOne).toBeCloseTo(0.3, 12);
  });

  it('a country: the published group shares, at any N', () => {
    const us = COUNTRIES.us;
    const lorenz = lorenzOf(us);
    const total = us.groups.reduce((s, [, worth]) => s + worth, 0);
    expect(lorenz(0.5)).toBeCloseTo(us.groups[0][1] / total, 12); // bottom 50 %: 2.3 %
    for (const n of [100, 1000, 2000]) {
      const w = sorted(new Run(begin(n, { op: 'alloc.country', f: { country: 'us' } }), 2).world.w);
      expect(sum(w.slice(0, n / 2)) / n, `N ${n}`).toBeCloseTo(lorenz(0.5), 10);
      expect(sum(w.slice(0, (n * 9) / 10)) / n, `N ${n}`).toBeCloseTo(lorenz(0.9), 10);
    }
  });

  it('a heavier power law is more unequal; a wider lognormal too', () => {
    const gini = (start: Node) => measure(new Run(begin(2000, start), 4).world.w, 0).gini;
    expect(gini({ op: 'dist.pareto', args: { alpha: num(1.2) } })).toBeGreaterThan(gini({ op: 'dist.pareto', args: { alpha: num(3) } }));
    expect(gini({ op: 'dist.lognormal', args: { sigma: num(1.5) } })).toBeGreaterThan(gini({ op: 'dist.lognormal', args: { sigma: num(0.5) } }));
  });
});

describe('the merged options', () => {
  const twoRounds = (body: Node[], n = 10, seed = 1) => {
    const run = new Run({ ast: 1, scripts: [{ op: 'ctl.start', body: [...yard(n, { op: 'dist.same', args: { v: { op: 'num', v: 1 } } }), { op: 'ctl.forever', body }] }] }, seed);
    run.rounds(2);
    return run;
  };

  it('a tax from the richest q only: everyone else keeps everything', () => {
    const richest: Node = { op: 'take.flat', args: { a: num(0.1), from: { op: 'group.richest', args: { q: pct(0.2) } } } };
    const run = new Run(
      { ast: 1, scripts: [{ op: 'ctl.start', body: [...yard(10, { op: 'alloc.classes', args: { q: pct(0.2), s: pct(0.5) } }), { op: 'ctl.forever', body: [statementOf.tax(richest)] }] }] },
      1,
    );
    const before = Float64Array.from(run.world.w);
    run.rounds(1);
    const paid = Array.from(run.world.w, (x, k) => before[k] - x);
    expect(paid.filter((x) => x > 0).length).toBe(2);
    expect(run.world.pot).toBeCloseTo(0.2, 12);
  });

  it('a tax above x takes only the excess', () => {
    const start = { op: 'alloc.oligarch', args: { s: pct(0.5) } };
    const run = new Run({ ast: 1, scripts: [{ op: 'ctl.start', body: [...yard(10, start), { op: 'ctl.forever', body: [statementOf.tax(o.aboveTax(1, 2))] }] }] }, 1);
    run.rounds(1);
    expect(Math.max(...run.world.w)).toBeCloseTo(2, 12);
  });

  it('give by wealth to the poorest q: the pot goes to them, in proportion', () => {
    const toPoorest: Node = { op: 'give.to', f: { how: 'wealth' }, args: { to: { op: 'group.poorest', args: { q: pct(0.5) } } } };
    const run = twoRounds([statementOf.tax(o.flatTax(0.1), toPoorest)]);
    expect(sum(run.world.w)).toBeCloseTo(10, 12);
  });

  it('the coin tilts either way; a strength can favour the poorer', () => {
    const rich = twoRounds([tradeOf({ pair: { op: 'pair.match', args: { within: { op: 'group.all' } } }, coin: o.tilt('richer', 0.5), stake: o.stake('poorer', 0.1) })], 2);
    const poor = twoRounds([tradeOf({ pair: { op: 'pair.match', args: { within: { op: 'group.all' } } }, coin: o.gap('poorer', 1e6), stake: o.stake('poorer', 0.1) })], 2);
    // round 1 from equal (agent 0 counts as poorer): the richer always wins under the first, so agent 1 leads
    expect(rich.world.w[1]).toBeGreaterThan(rich.world.w[0]);
    // under a huge gap toward the poorer, round 2's poorer wins back
    expect(Math.abs(poor.world.w[0] - poor.world.w[1])).toBeLessThan(0.2);
  });
});

describe('percent blocks', () => {
  it('a pct shows as percent and comes back as the share it was, through Blockly', () => {
    defineBlocks();
    const p = program({ stake: o.stake('poorer', 0.07), then: [statementOf.tax(o.wealthTax(0.0005), o.poorest(0.33))] });
    const state = toBlockly(p);
    expect(JSON.stringify(state)).toContain('"v":7');
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(state, ws);
    expect(fromBlockly(Blockly.serialization.workspaces.save(ws)).program).toEqual(p);
    ws.dispose();
  });
});

describe('the strength coin', () => {
  const mine = (prop: string): Node => ({ op: 'val.prop', f: { prop, who: 'me' } });
  const strength = (s: Node, b: number): Node => ({ op: 'coin.strength', args: { s, b: pct(b) } });
  const fixed: Node = { op: 'stake.fixed', args: { a: num(0.1) } };
  const pairOf = (coin: Node, start: Node = { op: 'dist.same', args: { v: { op: 'num', v: 1 } } }) =>
    new Run({ ast: 1, scripts: [{ op: 'ctl.start', body: [...yard(2, start), { op: 'ctl.forever', body: [tradeOf({ pair: { op: 'pair.match', args: { within: { op: 'group.all' } } }, coin, stake: fixed })] }] }] }, 1);

  it('tanh and artanh: deterministic, and the textbook values', () => {
    for (let k = -400; k <= 400; k++) {
      const x = k / 37;
      expect(tanh(x)).toBeCloseTo(Math.tanh(x), 14);
      if (Math.abs(x) < 3) expect(atanh(tanh(x))).toBeCloseTo(x, 11);
    }
    expect(tanh(50)).toBe(1);
    expect(atanh(1)).toBe(Infinity);
    expect(atanh(2)).toBeNaN();
  });

  it('a full bonus: the poorer always wins; a huge strength in wealth: the richer always wins', () => {
    const under = pairOf(strength(num(0), 0.5));
    under.rounds(1);
    // from equal, square 0 counts as the poorer and wins; then square 1 is the poorer and wins back
    expect(under.world.w[0]).toBeGreaterThan(under.world.w[1]);
    under.rounds(1);
    expect(under.world.w[0]).toBeCloseTo(under.world.w[1], 12);
    const strong = pairOf(strength({ op: 'op.arith', f: { op: 'mul' }, args: { a: num(1e6), b: mine('wealth') } }, 0));
    // round 1 is even (equal strengths): whoever leads after it wins every round after
    strong.rounds(3);
    expect(Math.max(...strong.world.w)).toBeCloseTo(1.3, 12);
  });

  it('in proportion to wealth: the poorer of 0.2 against 1.8 wins about 10 % of the time', () => {
    const start: Node = { op: 'alloc.classes', args: { q: pct(0.5), s: pct(0.9) } };
    let wins = 0;
    const seeds = 3000;
    for (let seed = 1; seed <= seeds; seed++) {
      const run = new Run({ ast: 1, scripts: [{ op: 'ctl.start', body: [...yard(2, start), { op: 'ctl.forever', body: [tradeOf({ pair: { op: 'pair.match', args: { within: { op: 'group.all' } } }, coin: o.share(), stake: fixed })] }] }] }, seed);
      const poorer = run.world.w[0] < run.world.w[1] ? 0 : 1;
      const before = run.world.w[poorer];
      run.rounds(1);
      if (run.world.w[poorer] > before) wins++;
    }
    expect(wins / seeds).toBeGreaterThan(0.08);
    expect(wins / seeds).toBeLessThan(0.12);
  });
});


describe('groups', () => {
  const richest = (q: number): Node => ({ op: 'group.richest', args: { q: pct(q) } });
  const poorest = (q: number): Node => ({ op: 'group.poorest', args: { q: pct(q) } });
  const flat = (from: Node): Node => ({ op: 'take.flat', args: { a: num(0.01), from } });
  const burn: Node = { op: 'give.keep' };
  /** Who paid in one round of a flat tax from this group, burnt, over a yard of unequal classes. */
  const payers = (from: Node, setup: Node[] = [], seed = 1) => {
    const run = new Run(
      {
        ast: 1,
        scripts: [{ op: 'ctl.start', body: [...yard(20, { op: 'dist.pareto', args: { alpha: num(1.5) } }), ...setup, { op: 'ctl.forever', body: [statementOf.tax(flat(from), burn)] }] }],
      },
      seed,
    );
    const before = Float64Array.from(run.world.w);
    const ranks = sorted(before);
    run.rounds(1);
    return { paid: Array.from(run.world.w, (x, k) => (x < before[k] ? k : -1)).filter((k) => k >= 0), before, ranks };
  };

  it('the richest and the poorest q, by this round’s ranks', () => {
    const { paid, before, ranks } = payers(richest(0.2));
    expect(paid.length).toBe(4);
    for (const k of paid) expect(before[k]).toBeGreaterThanOrEqual(ranks[16]);
    const poor = payers(poorest(0.1));
    expect(poor.paid.length).toBe(2);
    for (const k of poor.paid) expect(poor.before[k]).toBeLessThanOrEqual(poor.ranks[1]);
  });

  it('where, combined, named: the same squares however it is written', () => {
    const rich = payers(richest(0.5)).paid;
    const top = payers(richest(0.1)).paid;
    const butNot = payers({ op: 'group.combine', f: { op: 'butnot' }, args: { a: richest(0.5), b: richest(0.1) } }).paid;
    expect(butNot).toEqual(rich.filter((k) => !top.includes(k)));
    const either = payers({ op: 'group.combine', f: { op: 'or' }, args: { a: richest(0.1), b: poorest(0.1) } }).paid;
    expect(either.length).toBe(4);
    const where = payers({ op: 'group.where', args: { c: { op: 'op.cmp', f: { op: 'gt' }, args: { a: { op: 'val.prop', f: { prop: 'wealth', who: 'me' } }, b: num(1) } } } });
    expect(where.paid).toEqual(Array.from(where.before.keys()).filter((k) => where.before[k] > 1));
    const named = payers({ op: 'group.named', f: { name: 'top' } }, [{ op: 'group.define', f: { name: 'top' }, args: { group: richest(0.1) } }]).paid;
    expect(named).toEqual(top);
  });

  it('at random: exactly ⌈qN⌉ squares, the same for the same seed, others for another', () => {
    const a = payers({ op: 'group.random', args: { q: pct(0.25) } }, [], 3).paid;
    expect(a.length).toBe(5);
    expect(payers({ op: 'group.random', args: { q: pct(0.25) } }, [], 3).paid).toEqual(a);
    expect(payers({ op: 'group.random', args: { q: pct(0.25) } }, [], 4).paid).not.toEqual(a);
    expect(payers({ op: 'group.one' }).paid.length).toBe(1);
  });

  it('pairs within a group: the others sit the round out', () => {
    const run = new Run(
      {
        ast: 1,
        scripts: [
          {
            op: 'ctl.start',
            body: [
              ...yard(20, { op: 'dist.pareto', args: { alpha: num(1.5) } }),
              { op: 'ctl.forever', body: [tradeOf({ pair: { op: 'pair.match', args: { within: poorest(0.5) } } })] },
            ],
          },
        ],
      },
      2,
    );
    const before = Float64Array.from(run.world.w);
    const median = sorted(before)[10];
    run.rounds(1);
    for (let k = 0; k < 20; k++) if (before[k] >= median) expect(run.world.w[k]).toBe(before[k]);
    expect(Array.from(run.world.w).some((x, k) => x !== before[k])).toBe(true);
  });
});

describe('the stats block, watch and log', () => {
  const stat = (s: string, prop = 'wealth', over: Node = { op: 'group.all' }): Node => ({ op: 'stat.of', f: { stat: s, prop }, args: { over } });

  it('the measures, on small known cases', () => {
    const v = Float64Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(statOf('gini', Float64Array.from([2, 2, 2]), 6, v)).toBe(0);
    expect(statOf('mean', v, 55, v)).toBe(5.5);
    expect(statOf('median', v, 55, v)).toBe(5.5);
    expect(statOf('share', v.subarray(0, 5), 55, v)).toBeCloseTo(15 / 55, 15);
    // Palma: the top 1 of 10 over the bottom 4: 10 / (1 + 2 + 3 + 4)
    expect(statOf('palma', v, 55, v)).toBe(1);
    expect(statOf('neff', Float64Array.from([1, 1, 1, 1]), 4, v)).toBeCloseTo(4, 12);
    expect(statOf('rankcorr', v, 55, v)).toBeCloseTo(1, 12);
    expect(statOf('rankcorr', v, 55, v.slice().reverse())).toBeCloseTo(-1, 12);
    expect(statOf('min', new Float64Array(0), 0, new Float64Array(0))).toBeNaN();
    expect(statOf('fraction', v.subarray(0, 3), 55, v, 12)).toBe(0.25);
    expect(statOf('fraction', new Float64Array(0), 0, new Float64Array(0), 12)).toBe(0);
  });

  it('a watched number is the stats block now; it matches the measures; a share in percent', () => {
    const p: Program = {
      ast: 1,
      scripts: [
        {
          op: 'ctl.start',
          body: [
            ...yard(100, { op: 'dist.exponential', args: { mean: num(1) } }),
            { op: 'panel.number', f: { name: 'Gini' }, args: { value: stat('gini') } },
            { op: 'panel.number', f: { name: 'top 1 %' }, args: { value: stat('share', 'wealth', { op: 'group.richest', args: { q: pct(0.01) } }) } },
            { op: 'ctl.forever', body: [tradeOf()] },
          ],
        },
      ],
    };
    expect(validate(p)).toEqual([]);
    const run = new Run(p, 5);
    run.rounds(30);
    const m = measure(run.world.w, run.world.pot);
    const watches = panelOf(p).watches;
    expect(watches.map((w) => [w.name, w.percent])).toEqual([['Gini', false], ['top 1 %', true]]);
    expect(run.evaluate(watches[0].path)).toBeCloseTo(m.gini, 12);
    expect(run.evaluate(watches[1].path)).toBeCloseTo(m.top1, 12);
    const before = run.hash();
    run.evaluate(watches[0].path);
    expect(run.hash()).toBe(before);
  });

  it('a log tells its value each time it runs; a stat needs a running yard (not in setup)', () => {
    const log: Node = { op: 'panel.print', f: { name: 'gini' }, args: { value: stat('gini') } };
    const run = new Run({ ast: 1, scripts: [{ op: 'ctl.start', body: [...yard(20, { op: 'dist.exponential', args: { mean: num(1) } }), { op: 'ctl.forever', body: [tradeOf(), log] }] }] }, 2);
    const seen: number[] = [];
    run.onView = (op, _f, _m, value) => op === 'panel.print' && seen.push(value!);
    run.rounds(3);
    expect(seen).toHaveLength(3);
    expect(seen[2]).toBeCloseTo(measure(run.world.w, 0).gini, 12);
    const inSetup = { ast: 1, scripts: [{ op: 'ctl.start', body: [...yard(10, { op: 'dist.same', args: { v: { op: 'num', v: 1 } } }), { op: 'debt', args: { d: stat('max') } }] }] } as Program;
    expect(validate(inSetup).map((i) => i.code)).toContain('no-globals');
  });

  it('merit or math: talent and wealth, rank-correlated under merit, barely under a fair coin', () => {
    const corr = (coin: Node) => {
      const p: Program = {
        ast: 1,
        scripts: [
          {
            op: 'ctl.start',
            body: [...yard(500, { op: 'dist.same', args: { v: { op: 'num', v: 1 } } }), statementOf.talent(0.6, 0.1), { op: 'panel.number', f: { name: 'ρ' }, args: { value: stat('rankcorr', 'talent') } }, { op: 'ctl.forever', body: [tradeOf({ coin })] }],
          },
        ],
      };
      const run = new Run(p, 1);
      run.rounds(300);
      return run.evaluate(panelOf(p).watches[0].path);
    };
    expect(corr(o.talent(0.5))).toBeGreaterThan(0.3);
    expect(Math.abs(corr({ op: 'coin.strength', args: { s: { op: 'num', v: 0 }, b: { op: 'pct', v: 0 } } }))).toBeLessThan(0.15);
  });
});

describe('distributions', () => {
  const setupOnly = (...body: Node[]) => new Run({ ast: 1, scripts: [{ op: 'ctl.start', body }] }, 7);
  const d = (op: string, args: Record<string, number>): Node => ({ op, args: Object.fromEntries(Object.entries(args).map(([k, v]) => [k, num(v)])) });

  it('talent and thrift drawn from any of them, kept in their ranges', () => {
    const run = setupOnly(
      ...yard(2000, { op: 'dist.same', args: { v: { op: 'num', v: 1 } } }),
      { op: 'traits.talent', args: { d: d('dist.uniform', { lo: 0.2, hi: 0.4 }) } },
      { op: 'traits.thrift', args: { d: { op: 'dist.clip', args: { d: d('dist.normal', { m: 0.5, s: 1 }), lo: num(0.1), hi: num(0.9) } } } },
    );
    const t = Array.from(run.world.talent);
    expect(Math.min(...t)).toBeGreaterThanOrEqual(0.2);
    expect(Math.max(...t)).toBeLessThan(0.4);
    expect(sum(t) / 2000).toBeCloseTo(0.3, 2);
    const l = Array.from(run.world.thrift);
    expect(Math.min(...l)).toBe(0.1);
    expect(Math.max(...l)).toBe(0.9);
  });

  it('a start drawn below 0 counts as 0, with a warning; the mean is 1', () => {
    const run = setupOnly(...yard(1000, d('dist.normal', { m: 1, s: 2 })));
    expect(Math.min(...run.world.w)).toBe(0);
    expect(sum(run.world.w) / 1000).toBeCloseTo(1, 10);
    expect(run.warnings.size).toBeGreaterThan(0);
  });

  it('exponential, lognormal and pareto starts: their own shapes', () => {
    const gini = (start: Node) => measure(setupOnly(...yard(4000, start)).world.w, 0).gini;
    // Exp: Gini ½; a lognormal of σ 1: 2Φ(σ/√2) − 1 ≈ 0.52
    expect(gini(d('dist.exponential', { mean: 3 }))).toBeCloseTo(0.5, 1);
    expect(gini(d('dist.lognormal', { sigma: 1 }))).toBeCloseTo(0.52, 1);
    expect(gini(d('dist.same', { v: 4 }))).toBe(0);
  });

  it('a draw anywhere: each square its own, fresh each round', () => {
    const grow: Node = { op: 'grow', args: { mu: { op: 'op.sample', args: { d: d('dist.uniform', { lo: 0, hi: 0.1 }) } }, sigma: num(0) } };
    const run = new Run({ ast: 1, scripts: [{ op: 'ctl.start', body: [...yard(500, { op: 'dist.same', args: { v: { op: 'num', v: 1 } } }), { op: 'ctl.forever', body: [grow] }] }] }, 3);
    run.rounds(1);
    const w = Array.from(run.world.w);
    expect(new Set(w.map((x) => x.toFixed(12))).size).toBeGreaterThan(400);
  });
});

describe('a fair coin, plainly (owner, 2026-10-21)', () => {
  it('coin.fair plays exactly as strength 0, bonus 0; a new trade block flips it; it round-trips as a block', () => {
    const strength: Node = { op: 'coin.strength', args: { s: num(0), b: { op: 'pct', v: 0 } } };
    const a = new Run(program({ n: 50, coin: { op: 'coin.fair' } }), 9);
    const b = new Run(program({ n: 50, coin: strength }), 9);
    a.rounds(300);
    b.rounds(300);
    expect(a.hash()).toBe(b.hash());
    expect(JSON.stringify(program())).toContain('"coin.fair"');
    defineBlocks();
    const p = program({ n: 10 });
    expect(fromBlockly(toBlockly(p)).program).toEqual(p);
  });
});
