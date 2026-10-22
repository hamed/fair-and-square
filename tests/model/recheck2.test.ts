/** REVIEW-2026-10-19-MODEL-BLOCKS-RECHECK-2: the model's findings (N3–N6, N8), each a reproduction. */
import { describe, expect, it } from 'vitest';
import { canonical, num, type Node, type Program } from '../../model/ast.ts';
import { Run } from '../../model/engine.ts';
import { measure } from '../../model/stats.ts';
import { statementOf, taxOf, tradeOf } from '../../model/presets.ts';

const pct = (v: number): Node => ({ op: 'pct', v });
const yard = (n: number): Node => ({ op: 'setup.yard', f: { space: 'free' }, args: { n: num(n) } });
const forever = (n: number, ...body: Node[]): Program => ({ ast: 1, scripts: [{ op: 'ctl.start', body: [yard(n), { op: 'ctl.forever', body }] }] });
const uniform: Node = { op: 'dist.uniform', args: { lo: num(0), hi: num(1) } };
const sample: Node = { op: 'op.sample', args: { d: uniform } };
const stat = (s: string): Node => ({ op: 'stat.of', f: { stat: s, prop: 'wealth' }, args: { over: { op: 'group.all' } } });
const log = (name: string, value: Node): Node => ({ op: 'panel.print', f: { name }, args: { value } });
const flat = (a: number, from: Node): Node => ({ op: 'take.flat', args: { a: num(a), from } });
const burn: Node = { op: 'give.keep' };
/** Who paid a flat tax from this group in round 1. */
const payers = (n: number, from: Node, seed = 1) => {
  const run = new Run(forever(n, statementOf.tax(flat(0.1, from), burn)), seed);
  const before = Float64Array.from(run.world.w);
  run.rounds(1);
  return Array.from(run.world.w, (x, k) => (x < before[k] ? k : -1)).filter((k) => k >= 0);
};

describe('N3: observers run where they stand among the steps', () => {
  it('a log after pay sees the trade; a log before pair up does not', () => {
    const trade = tradeOf({});
    const body = trade.body!;
    const run = new Run(forever(2, { ...trade, body: [log('before', stat('gini')), ...body, log('after', stat('gini'))] }), 1);
    const seen: Record<string, number> = {};
    run.onView = (op, f, _m, value) => {
      if (op === 'panel.print') seen[f.name] = value!;
    };
    run.rounds(1);
    expect(seen.before).toBe(0);
    expect(seen.after).toBeCloseTo(measure(run.world.w, run.world.pot).gini, 12);
    expect(seen.after).toBeGreaterThan(0);
  });

  it('a log between take and give sees the pot full; after give it sees what is kept', () => {
    const tax = taxOf(flat(0.5, { op: 'group.all' }), burn);
    const [take, give] = tax.body!;
    const pot: Node = { op: 'val.global', f: { name: 'pot' } };
    const run = new Run(forever(2, { ...tax, body: [log('first', pot), take, log('taken', pot), give, log('kept', pot)] }), 1);
    const seen: Record<string, number> = {};
    run.onView = (op, f, _m, value) => {
      if (op === 'panel.print') seen[f.name] = value!;
    };
    run.rounds(1);
    expect(seen).toEqual({ first: 0, taken: 1, kept: 1 });
  });

  it('an observer between the steps leaves the trade exactly as it was (its snapshot is its own)', () => {
    const ranked: Node = { op: 'pair.similar', args: { k: num(2) } };
    const plain = tradeOf({ pair: ranked });
    const [pair, flip, pay] = plain.body!;
    const watched = { ...plain, body: [pair, log('top', { op: 'stat.of', f: { stat: 'share', prop: 'rank' }, args: { over: { op: 'group.random', args: { q: pct(0.3) } } } }), flip, pay] };
    const a = new Run(forever(30, plain), 4);
    const b = new Run(forever(30, watched), 4);
    b.onView = () => {};
    a.rounds(20);
    b.rounds(20);
    expect(b.hash()).toBe(a.hash());
  });
});

describe('N4: a square’s own expression draws at its own index', () => {
  it('a sampled strength differs between the partners', () => {
    const coin: Node = { op: 'coin.strength', args: { s: sample, b: pct(0) } };
    for (const seed of [1, 2, 4]) {
      const strong = new Run(forever(20, tradeOf({ coin })), seed);
      const fair = new Run(forever(20, tradeOf({ coin: { op: 'coin.strength', args: { s: { op: 'num', v: 0 }, b: { op: 'pct', v: 0 } } } })), seed);
      strong.rounds(100);
      fair.rounds(100);
      expect(strong.hash(), `seed ${seed}`).not.toBe(fair.hash());
    }
  });

  it('a sampled condition picks some squares, not all or none', () => {
    const half: Node = { op: 'group.where', args: { c: { op: 'op.cmp', f: { op: 'lt' }, args: { a: sample, b: num(0.5) } } } };
    for (const seed of [1, 2, 3, 4]) {
      const run = new Run(forever(20, { op: 'show.outline', args: { who: half } }), seed);
      let count = -1;
      run.onView = (_op, _f, members) => {
        count = members!.reduce((a, b) => a + b, 0);
      };
      run.rounds(1);
      expect(count, `seed ${seed}`).toBeGreaterThan(2);
      expect(count, `seed ${seed}`).toBeLessThan(18);
    }
  });
});

describe('N5: a group’s fraction is read once per step', () => {
  it('a sampled richest share is a tail of the ranks', () => {
    // from equal, ties rank by index: the richest k are the last k indices
    for (const seed of [1, 2, 3]) {
      const paid = payers(20, { op: 'group.richest', args: { q: sample } }, seed);
      expect(paid.length, `seed ${seed}`).toBeGreaterThan(0);
      expect(paid, `seed ${seed}`).toEqual(Array.from({ length: paid.length }, (_, i) => 20 - paid.length + i));
    }
  });
});

describe('N6: a random group of size 0 is empty', () => {
  it('q = 0 takes nobody; a tiny q takes one; the ranked groups keep at least one', () => {
    expect(payers(10, { op: 'group.random', args: { q: pct(0) } })).toEqual([]);
    expect(payers(10, { op: 'group.random', args: { q: pct(0.01) } })).toHaveLength(1);
    expect(payers(10, { op: 'group.richest', args: { q: pct(0) } })).toHaveLength(1);
  });
});

describe('N8: an input after seeking back replaces the future', () => {
  it('takes effect at once, keeps the log in order, and the branch replays', () => {
    const slider: Node = { op: 'panel.slider', f: { name: 'stake' }, args: { min: pct(0), max: pct(0.9), start: pct(0.2) } };
    const program = forever(20, tradeOf({ stake: { op: 'stake.share', f: { of: 'poorer' }, args: { beta: slider } } }));
    const run = new Run(program, 1);
    run.rounds(20);
    run.input({ kind: 'slider', name: 'stake', value: 0.4 });
    run.rounds(20);
    run.seek(5);
    run.input({ kind: 'slider', name: 'stake', value: 0.8 });
    expect(run.sliders.get('stake')).toBe(0.8);
    expect(run.inputs.map((i) => i.step)).toEqual([6]);
    run.rounds(10);
    const replay = new Run(program, 1);
    replay.setInputs(run.inputs);
    replay.seek(15);
    expect(replay.hash()).toBe(run.hash());
  });
});

describe('N11: programs compare by content, not by how their keys were written', () => {
  it('the same program with keys in another order is the same text', () => {
    const a: Program = { ast: 1, scripts: [{ op: 'ctl.start', body: [{ op: 'setup.yard', f: { space: 'free' }, args: { n: num(5) } }] }] };
    const b = JSON.parse('{"scripts":[{"body":[{"args":{"n":{"v":5,"op":"num"}},"op":"setup.yard","f":{"space":"free"}}],"op":"ctl.start"}],"ast":1}') as Program;
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(canonical(a)).toBe(canonical(b));
    expect(canonical(a)).not.toBe(canonical({ ...a, scripts: [{ ...a.scripts[0], body: [] }] }));
  });
});
