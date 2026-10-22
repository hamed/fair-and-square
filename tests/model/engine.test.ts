import { describe, expect, it } from 'vitest';
import { num, type Node, type Program } from '../../model/ast.ts';
import { defaultNode, isObserver } from '../../model/catalogue.ts';
import { INNER_LIMIT } from '../../model/compile.ts';
import { ENGINE_VERSION, ProgramError, Run } from '../../model/engine.ts';
import { DEFAULT_PROGRAM, PRESETS, options as o, program, statementOf, taxOf, tradeOf } from '../../model/presets.ts';
import { GOLDEN, presetHashes } from './fixtures.ts';

const opt = (op: string, args?: Record<string, number>): Node =>
  args ? { op, args: Object.fromEntries(Object.entries(args).map(([k, v]) => [k, num(v)])) } : { op };
const arith = (op: string, a: Node, b: Node): Node => ({ op: 'op.arith', f: { op }, args: { a, b } });
const fn = (name: string, a: Node, b?: Node): Node => (b ? { op: 'op.fn2', f: { fn: name }, args: { a, b } } : { op: 'op.fn', f: { fn: name }, args: { a } });
const global = (name: string): Node => ({ op: 'val.global', f: { name } });
const cmp = (op: string, a: Node, b: Node): Node => ({ op: 'op.cmp', f: { op }, args: { a, b } });
const trade = (slots: Partial<Record<'pair' | 'coin' | 'stake', Node>> = {}): Node => tradeOf(slots);
/** A yard, everyone equal; 'random' adds a start Exp(1), the old random start (the same draws). */
const yard = (n: number, start: 'equal' | 'random' = 'equal', space: 'free' | 'lattice' = 'free'): Node[] => [
  { op: 'setup.yard', f: { space }, args: { n: num(n) } },
  ...(start === 'random' ? [{ op: 'setup.start', args: { with: { op: 'dist.exponential', args: { mean: num(1) } } } }] : []),
];
/** when started: yard, setup…, then the given control blocks. */
const start = (...body: Node[]): Program => ({ ast: 1, scripts: [{ op: 'ctl.start', body }] });
const sum = (xs: ArrayLike<number>) => Array.from(xs).reduce((a, b) => a + b, 0);

describe('determinism', () => {
  it('same program, seed and round: same state; another seed: another', () => {
    const a = new Run(DEFAULT_PROGRAM, 7);
    const b = new Run(DEFAULT_PROGRAM, 7);
    a.rounds(150);
    b.rounds(150);
    expect(a.hash()).toBe(b.hash());
    const c = new Run(DEFAULT_PROGRAM, 8);
    c.rounds(150);
    expect(c.hash()).not.toBe(a.hash());
  });

  it('any round is reached by replay from round 0', () => {
    const run = new Run(DEFAULT_PROGRAM, 3);
    run.rounds(40);
    const at40 = run.hash();
    run.rounds(60);
    run.seek(40);
    expect(run.round).toBe(40);
    expect(run.hash()).toBe(at40);
  });

  it(`golden hashes: every preset at round 200 (engine version ${ENGINE_VERSION})`, () => {
    expect(presetHashes()).toEqual(GOLDEN);
  });

  it('a statement that draws its own randomness moves no other draw', () => {
    const base = new Run(DEFAULT_PROGRAM, 5);
    base.rounds(100);
    // a tax of 0 × random, before the trade: it takes nothing, and the trade's draws stay where they were
    const zero: Node = taxOf(arith('mul', num(0), { op: 'op.sample', args: { d: { op: 'dist.uniform', args: { lo: num(0), hi: num(1) } } } }));
    const withRandom = new Run(start(...yard(100), { op: 'ctl.forever', body: [zero, trade()] }), 5);
    withRandom.rounds(100);
    expect(withRandom.hash()).toBe(base.hash());
  });

  it('adding a random block after another leaves the first one’s draws alone', () => {
    const taxed = (r: Node, extra?: Node): Program =>
      start(...yard(20), {
        op: 'ctl.forever',
        body: [trade(), taxOf(o.wealthTax(0.1), r), ...(extra ? [extra] : [])],
      });
    const one = new Run(taxed({ op: 'op.sample', args: { d: { op: 'dist.uniform', args: { lo: num(0), hi: num(1) } } } }), 2);
    one.rounds(30);
    // appended after the give: its path is new, the give's random block keeps its path and draws
    const two = new Run(taxed({ op: 'op.sample', args: { d: { op: 'dist.uniform', args: { lo: num(0), hi: num(1) } } } }, taxOf(arith('mul', num(0), { op: 'op.sample', args: { d: { op: 'dist.uniform', args: { lo: num(0), hi: num(1) } } } }))), 2);
    two.rounds(30);
    expect(two.hash()).toBe(one.hash());
  });
});

describe('trade', () => {
  it('bet: the coin picks, the loser pays β of the poorer’s in-play; ties go to the lower index', () => {
    // p = 1: the poorer always wins
    const run = new Run(start(...yard(2), { op: 'ctl.forever', body: [trade({ coin: o.tilt('poorer', 0.5) })] }), 1);
    run.rounds(1);
    expect(Array.from(run.world.w)).toEqual([1.1, 0.9]); // equal: agent 0 counts as poorer
    run.rounds(1);
    expect(run.world.w[1]).toBeCloseTo(0.99, 15);
    expect(run.world.w[0]).toBeCloseTo(1.01, 15);
  });

  it('the stake is capped at the loser’s in-play wealth; nobody falls below −D', () => {
    const run = new Run(start(...yard(2), { op: 'ctl.forever', body: [trade({ coin: o.tilt('richer', 0.5), stake: opt('stake.fixed', { a: 5 }) })] }), 1);
    run.rounds(1);
    expect(Array.from(run.world.w)).toEqual([0, 2]); // the richer won everything the loser had in play
    const debt = new Run(start(...yard(50), statementOf.debt(1), { op: 'ctl.forever', body: [trade({ stake: opt('stake.fixed', { a: 0.5 }) })] }), 4);
    let min = Infinity;
    for (let r = 0; r < 400; r++) {
      debt.rounds(1);
      min = Math.min(min, ...debt.world.w);
    }
    expect(min).toBeLessThan(0);
    expect(min).toBeGreaterThanOrEqual(-1 - 1e-12);
  });

  it('coin p is clipped to [0, 1]: a huge advantage, the richer always wins', () => {
    const run = new Run(start(...yard(10), { op: 'ctl.forever', body: [trade({ coin: o.gap('richer', 1e6) })] }), 9);
    run.rounds(1); // equal at the start: p = 1/2
    const before = Array.from(run.world.w);
    run.rounds(1);
    // every pair whose wealth differed moved money from the poorer to the richer
    const after = Array.from(run.world.w);
    expect(Math.max(...after)).toBeGreaterThanOrEqual(Math.max(...before));
    expect(run.warnings.size).toBe(0);
  });

  it('split: in-play wealth pooled, a uniform share; thrift keeps λw out of play', () => {
    const run = new Run(start(...yard(100), statementOf.thrift(0.5), { op: 'ctl.forever', body: [trade({ stake: opt('stake.split') })] }), 3);
    const before = Float64Array.from(run.world.w);
    run.rounds(1);
    const w = run.world.w;
    expect(sum(w)).toBeCloseTo(100, 10);
    for (let k = 0; k < 100; k++) expect(w[k]).toBeGreaterThanOrEqual(0.5 * before[k] - 1e-12);
  });

  it('pair.match with N odd: one sits out; pair.draw: may repeat', () => {
    const run = new Run(start(...yard(5), { op: 'ctl.forever', body: [trade({ stake: opt('stake.fixed', { a: 0.25 }) })] }), 1);
    run.rounds(1);
    expect(Array.from(run.world.w).filter((x) => x === 1).length).toBe(1);
  });
});

describe('pairing in space and by rank', () => {
  it('pair.near pairs neighbours within R on the torus; move keeps one agent per cell', () => {
    const p = start(...yard(60, 'equal', 'lattice'), { op: 'ctl.forever', body: [trade({ pair: opt('pair.near', { r: 1 }) }), statementOf.move(1)] });
    const run = new Run(p, 2);
    const side = run.world.side;
    expect(side).toBe(Math.ceil(Math.sqrt(60 / 0.6)));
    const cells = Array.from(run.world.cell);
    expect(new Set(cells).size).toBe(60);
    run.rounds(20);
    const moved = Array.from(run.world.cell);
    expect(moved).not.toEqual(cells);
    expect(new Set(moved).size).toBe(60);
    for (let k = 0; k < 60; k++) expect(run.world.occupant[moved[k]]).toBe(k);
  });

  it('pair.near with R = 0 and no move: nobody trades', () => {
    const run = new Run(start(...yard(30, 'equal', 'lattice'), { op: 'ctl.forever', body: [trade({ pair: opt('pair.near', { r: 0 }) })] }), 1);
    run.rounds(10);
    expect(Array.from(run.world.w).every((x) => x === 1)).toBe(true);
  });

  it('pair.similar trades only within k ranks', () => {
    // every trade moves money (β of the poorer's wealth), so the agents whose wealth changed are the traders
    const run = new Run(start(...yard(40, 'random'), { op: 'ctl.forever', body: [trade({ pair: opt('pair.similar', { k: 1 }) })] }), 6);
    const before = Float64Array.from(run.world.w);
    const rank = new Map(Array.from(before.keys()).sort((a, b) => before[a] - before[b] || a - b).map((agent, i) => [agent, i]));
    run.rounds(1);
    const changed = Array.from(run.world.w.keys()).filter((k) => run.world.w[k] !== before[k]);
    expect(changed.length).toBeGreaterThan(20);
    // with k = 1 each trader's partner is its rank neighbour: the changed agents come in adjacent-rank pairs
    const ranks = changed.map((k) => rank.get(k)!).sort((a, b) => a - b);
    for (let i = 0; i + 1 < ranks.length; i += 2) expect(ranks[i + 1] - ranks[i]).toBe(1);
  });
});

describe('tax, give, grow', () => {
  it('tax into the pot and give it back: the total holds; without give the pot burns', () => {
    const run = new Run(PRESETS.find((p) => p.id === 'wealth-tax')!.program, 1);
    run.rounds(300);
    expect(sum(run.world.w) + run.world.pot).toBeCloseTo(100, 9);
    expect(run.world.pot).toBe(0);
    const burn = new Run(start(...yard(10), { op: 'ctl.forever', body: [taxOf(o.wealthTax(0.1))] }), 1);
    burn.rounds(2);
    expect(burn.world.pot).toBeCloseTo(10 * (1 - 0.9 * 0.9), 12);
    expect(burn.outputs().potShare).toBeCloseTo(0.19, 12);
  });

  it('a tax on wealth sees w + D; τ is capped at w + D', () => {
    const run = new Run(start(...yard(4), statementOf.debt(1), { op: 'ctl.forever', body: [taxOf(o.wealthTax(0.5))] }), 1);
    run.rounds(1);
    expect(Array.from(run.world.w)).toEqual([0, 0, 0, 0]); // each paid 0.5 · (1 + 1)
    const capped = new Run(start(...yard(4), { op: 'ctl.forever', body: [taxOf(o.flatTax(3))] }), 1);
    capped.rounds(1);
    expect(Array.from(capped.world.w)).toEqual([0, 0, 0, 0]);
    expect(capped.world.pot).toBe(4);
  });

  it('tax.gains taxes only this round’s positive gains', () => {
    const taxGains = taxOf(o.gainsTax(1));
    const run = new Run(start(...yard(2), { op: 'ctl.forever', body: [trade({ coin: o.tilt('poorer', 0.5) }), taxGains] }), 1);
    run.rounds(1);
    expect(Array.from(run.world.w)).toEqual([1, 0.9]); // agent 0 won 0.1, all of it taxed
    expect(run.world.pot).toBeCloseTo(0.1, 15);
  });

  it('give to the poorest: the ⌈qN⌉ poorest share the pot; to one at random: one agent takes it all', () => {
    const poorest = new Run(start(...yard(100, 'random'), { op: 'ctl.forever', body: [taxOf(o.flatTax(0.001), o.poorest(0.1))] }), 1);
    const before = Float64Array.from(poorest.world.w);
    poorest.rounds(1);
    const gained = Array.from(poorest.world.w.keys()).filter((k) => poorest.world.w[k] > before[k] - 0.001 + 1e-12);
    expect(gained.length).toBe(10);
    const lottery = new Run(start(...yard(50), { op: 'ctl.forever', body: [taxOf(o.flatTax(0.1), o.lottery())] }), 1);
    lottery.rounds(1);
    expect(Array.from(lottery.world.w).filter((x) => x > 0.9).length).toBe(1);
    expect(Math.max(...lottery.world.w)).toBeCloseTo(0.9 + 5, 12);
  });

  it('give weights all zero: equal shares', () => {
    const run = new Run(start(...yard(10), { op: 'ctl.forever', body: [taxOf(o.flatTax(0.5), num(0))] }), 1);
    run.rounds(1);
    expect(Array.from(run.world.w)).toEqual(new Array(10).fill(1));
  });

  it('grow: W/W₀ compounds, wealth stays in units of the mean', () => {
    const run = new Run(start(...yard(10), { op: 'ctl.forever', body: [statementOf.grow(0.01, 0)] }), 1);
    run.rounds(100);
    expect(run.world.total).toBeCloseTo(Math.exp(1), 9);
    expect(sum(run.world.w)).toBeCloseTo(10, 12);
    const noisy = new Run(PRESETS.find((p) => p.id === 'growth')!.program, 1);
    noisy.rounds(200);
    expect(sum(noisy.world.w)).toBeCloseTo(100, 9);
    expect(noisy.outputs().gini).toBeGreaterThan(0.2);
  });

  it('grow with debt scales w + D: nobody falls below −D', () => {
    const p = start(...yard(30), statementOf.debt(1), { op: 'ctl.forever', body: [trade({ stake: o.stake('loser', 0.5) }), statementOf.grow(0, 0.3)] });
    const run = new Run(p, 2);
    for (let r = 0; r < 200; r++) {
      run.rounds(1);
      expect(Math.min(...run.world.w)).toBeGreaterThanOrEqual(-run.world.debt - 1e-12);
    }
  });
});

describe('control', () => {
  it('repeat: n rounds, then the end; until: stops when its condition holds', () => {
    const repeat = new Run(start(...yard(10), { op: 'ctl.repeat', args: { n: num(3) }, body: [trade()] }), 1);
    expect(repeat.rounds(10)).toBe(3);
    expect(repeat.status).toBe('ended');
    const until = new Run(start(...yard(10), { op: 'ctl.until', args: { c: cmp('ge', global('round'), num(5)) }, body: [trade()] }), 1);
    until.rounds(100);
    expect(until.round).toBe(5);
    expect(until.status).toBe('ended');
  });

  it('pause stops the run until the next step', () => {
    const p = start(...yard(10), { op: 'ctl.repeat', args: { n: num(3) }, body: [trade()] }, { op: 'ctl.pause' }, { op: 'ctl.forever', body: [trade()] });
    const run = new Run(p, 1);
    expect(run.rounds(10)).toBe(3);
    expect(run.status).toBe('paused');
    expect(run.rounds(10)).toBe(10);
  });

  it('every (k): its body runs on the k-th, 2k-th, … pass', () => {
    const burn = taxOf(o.flatTax(0.1));
    const run = new Run(start(...yard(10), { op: 'ctl.forever', body: [{ op: 'ctl.every', args: { k: num(3) }, body: [burn] }] }), 1);
    const pots: number[] = [];
    for (let r = 0; r < 7; r++) {
      run.rounds(1);
      pots.push(Math.round(run.world.pot * 10) / 10);
    }
    expect(pots).toEqual([0, 0, 1, 1, 1, 2, 2]);
  });

  it('a loop inside a loop that never ends is cut short, with a warning, and the round still ends', () => {
    const p = start(...yard(4), { op: 'ctl.forever', body: [{ op: 'ctl.forever', body: [] }] });
    const run = new Run(p, 1);
    run.rounds(1);
    expect(run.round).toBe(1);
    expect([...run.warnings.values()]).toEqual(['runaway']);
    expect(INNER_LIMIT).toBe(100_000);
  });

  it('camera blocks change nothing', () => {
    const plain = new Run(DEFAULT_PROGRAM, 4);
    const filmed = new Run(start(...yard(100), { op: 'ctl.forever', body: [defaultNode('show.arrange'), defaultNode('show.shape'), defaultNode('show.size'), trade(), defaultNode('show.hold'), defaultNode('show.zoom')] }), 4);
    plain.rounds(50);
    filmed.rounds(50);
    expect(filmed.hash()).toBe(plain.hash());
  });
});

describe('values and warnings', () => {
  it('NaN or infinity counts as 0 and warns on its block', () => {
    const coin = arith('div', num(1), num(0));
    const run = new Run(start(...yard(10), { op: 'ctl.forever', body: [trade({ coin })] }), 1);
    run.rounds(1);
    expect([...run.warnings]).toEqual([['0/body/1/body/0/body/1/args/coin', 'not-finite']]);
    const log = new Run(start(...yard(10), { op: 'ctl.forever', body: [taxOf(fn('log', num(-1)))] }), 1);
    log.rounds(1);
    expect(log.world.pot).toBe(0);
    expect([...log.warnings.values()]).toEqual(['not-finite']);
  });

  it('N is clamped to [2, 2000], with a warning', () => {
    const run = new Run(start(...yard(5000)), 1);
    expect(run.world.n).toBe(2000);
    expect([...run.warnings]).toEqual([['0/body/0/args/n', 'clamped']]);
  });

  it('setup: random start has mean 1; talent in [0, 1]; thrift between its ends', () => {
    const run = new Run(start(...yard(1000, 'random'), statementOf.talent(0.6, 0.1), statementOf.thriftBetween(0.2, 0.4)), 1);
    const w = run.world;
    expect(sum(w.w) / 1000).toBeCloseTo(1, 12);
    expect(Math.min(...w.talent)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...w.talent)).toBeLessThanOrEqual(1);
    expect(sum(w.talent) / 1000).toBeCloseTo(0.6, 1);
    expect(Math.min(...w.thrift)).toBeGreaterThanOrEqual(0.2);
    expect(Math.max(...w.thrift)).toBeLessThan(0.4);
  });

  it('globals and ranks come from the statement’s start', () => {
    // a coin that reads the Gini: the trade takes it once, before any money moves
    const coin = { op: 'op.clamp', args: { x: arith('add', num(0.5), { op: 'stat.of', f: { stat: 'gini', prop: 'wealth' }, args: { over: { op: 'group.all' } } }), lo: num(0), hi: num(1) } };
    const run = new Run(start(...yard(50), { op: 'ctl.forever', body: [trade({ coin })] }), 1);
    run.rounds(1);
    expect(run.warnings.size).toBe(0);
    const out = run.outputs();
    expect(sum(out.shares) + out.potShare).toBeCloseTo(1, 12);
  });

  it('an invalid program does not run', () => {
    expect(() => new Run(start(trade()), 1)).toThrow(ProgramError);
    expect(() => new Run(program(), 2 ** 32)).toThrow(/seed/);
  });
});

describe('observers', () => {
  /** Every observer out of a program, wherever it sits. */
  const strip = (node: Node): Node => ({
    ...node,
    ...(node.body ? { body: node.body.filter((n) => !isObserver(n.op)).map(strip) } : {}),
  });
  it('stripping every observer leaves the state hash unchanged; their view events still come', () => {
    const observed: Program = start(
      ...yard(40, 'random'),
      { op: 'show.arrange', f: { layout: 'stack', sort: 'desc' } }, { op: 'show.shape', f: { shape: 'bar' } }, { op: 'show.size', f: { scale: 'log' } },
      {
        op: 'ctl.forever',
        body: [
          tradeOf({}, { op: 'show.trades', f: { as: 'meet' } }, { op: 'panel.number', f: { name: 'Gini' }, args: { value: { op: 'stat.of', f: { stat: 'gini', prop: 'wealth' }, args: { over: { op: 'group.all' } } } } }, { op: 'show.colour', f: { by: 'talent' } }),
          { op: 'show.outline', args: { who: { op: 'group.random', args: { q: { op: 'pct', v: 0.3 } } } } },
          { op: 'panel.plot', f: { kind: 'lorenz' } },
          taxOf(o.wealthTax(0.02), o.poorest(0.2), { op: 'show.tax', f: { as: 'instant' } }),
        ],
      },
    );
    const bare: Program = { ...observed, scripts: observed.scripts.map(strip) };
    expect(JSON.stringify(bare)).not.toContain('cam.');
    const a = new Run(observed, 3);
    const b = new Run(bare, 3);
    const views: string[] = [];
    a.onView = (op, f, members) => views.push(`${op}:${Object.values(f).join()}${members ? `:${members.reduce((x, y) => x + y, 0)}` : ''}`);
    a.rounds(50);
    b.rounds(50);
    expect(a.hash()).toBe(b.hash());
    expect(new Set(views)).toEqual(new Set(['show.arrange:stack,desc', 'show.shape:bar', 'show.size:log', 'show.trades:meet', 'panel.number:Gini', 'panel.plot:lorenz', 'show.tax:instant', 'show.colour:talent', 'show.outline::12']));
    for (const p of PRESETS) {
      const plain = new Run(p.program, 1);
      const stripped = new Run({ ...p.program, scripts: p.program.scripts.map(strip) }, 1);
      plain.rounds(20);
      stripped.rounds(20);
      expect(stripped.hash(), p.id).toBe(plain.hash());
    }
  });
});
