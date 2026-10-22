/**
 * Named models: each is the default program with a few knobs changed (spec, Presets). Models are data, never
 * special-case code. Their titles, what the reader should see and their sources are the view's
 * (blocks/words/presets.en.ts); this file holds only programs.
 */
import { AST_VERSION, num, type Node, type Program } from './ast.ts';

interface Recipe {
  readonly n?: number;
  /** Where the squares live: anywhere (default) or on a square lattice (neighbours, moving). */
  readonly space?: 'free' | 'lattice';
  /** Setup blocks after the yard: traits, debt. */
  readonly setup?: readonly Node[];
  readonly pair?: Node;
  readonly coin?: Node;
  readonly stake?: Node;
  /** false: no trade block. */
  readonly trade?: boolean;
  /** Statements after the trade in each round. */
  readonly then?: readonly Node[];
}

const pct = (v: number): Node => ({ op: 'pct', v });
/** A property of each square in turn (`me`). */
const mine = (prop: string): Node => ({ op: 'val.prop', f: { prop, who: 'me' } });
const times = (k: number, x: Node): Node => ({ op: 'op.arith', f: { op: 'mul' }, args: { a: num(k), b: x } });
/** An option: its fields, and its arguments (numbers; shares as `pct`). */
const option = (op: string, f?: Record<string, string>, args?: Record<string, Node>): Node => ({
  op,
  ...(f ? { f } : {}),
  ...(args ? { args } : {}),
});

/** Groups, as the presets write them. */
export const groups = {
  all: (): Node => ({ op: 'group.all' }),
  richest: (q: number): Node => ({ op: 'group.richest', args: { q: pct(q) } }),
  poorest: (q: number): Node => ({ op: 'group.poorest', args: { q: pct(q) } }),
};
const everyone: Node = { op: 'group.all' };

/** The options, as the presets write them. */
export const options = {
  stake: (of: 'poorer' | 'loser', beta: number) => option('stake.share', { of }, { beta: pct(beta) }),
  fixed: (a: number) => option('stake.fixed', undefined, { a: num(a) }),
  split: () => option('stake.split'),
  /** The flip card: a strength for each square and the underdog's bonus; fair is 0 and 0. */
  flip: (s: Node = num(0), b = 0) => option('coin.strength', undefined, { s, b: pct(b) }),
  /** A tilt: a bonus alone, toward the poorer (or, negative, the richer): p = ½ ± b exactly. */
  tilt: (toward: 'poorer' | 'richer', b: number) => option('coin.strength', undefined, { s: num(0), b: pct(toward === 'poorer' ? b : -b) }),
  /**
   * In proportion to wealth in play: strength ½ log(in play), so p = w_p / (w_p + w_r). Nothing in play counts as
   * 10⁻³⁰⁰: strength about −345, tanh −1, p exactly 0 (recheck 5, R2); in play is w + D with debt.
   */
  share: () =>
    option('coin.strength', undefined, {
      s: times(0.5, { op: 'op.fn', f: { fn: 'log' }, args: { a: { op: 'op.fn2', f: { fn: 'max' }, args: { a: mine('inplay'), b: num(1e-300) } } } }),
      b: pct(0),
    }),
  /**
   * Boghosian's advantage as a strength: strength ζ × my wealth (−ζ: the poorer favoured), so p ≈ ½ ∓ ½ζ
   * (w richer − w poorer) while the gap is small; at a wide gap tanh bends below his straight line.
   */
  gap: (toward: 'richer' | 'poorer', zeta: number) => option('coin.strength', undefined, { s: times(toward === 'richer' ? zeta : -zeta, mine('wealth')), b: pct(0) }),
  /** A strength of 2κ talent: to first order p = ½ + κ (talent poorer − talent richer). */
  talent: (kappa: number) => option('coin.strength', undefined, { s: times(2 * kappa, mine('talent')), b: pct(0) }),
  near: (r: number) => option('pair.near', undefined, { r: num(r) }),
  /** A share of wealth (with debt, of w + D), from everyone. */
  wealthTax: (rate: number, from: Node = everyone) => option('take.wealth', undefined, { rate: pct(rate), from }),
  gainsTax: (rate: number) => option('take.gains', undefined, { rate: pct(rate), from: everyone }),
  flatTax: (a: number, from: Node = everyone) => option('take.flat', undefined, { a: num(a), from }),
  aboveTax: (rate: number, x: number) => option('take.above', undefined, { rate: pct(rate), x: num(x), from: everyone }),
  equally: (to: Node = everyone) => option('give.to', { how: 'equally' }, { to }),
  byWealth: (to: Node = everyone) => option('give.to', { how: 'wealth' }, { to }),
  poorest: (q: number) => option('give.to', { how: 'equally' }, { to: groups.poorest(q) }),
  lottery: () => option('give.to', { how: 'equally' }, { to: { op: 'group.one' } }),
};
const o = options;

/** The program a recipe describes, every input written out. */
export function program(recipe: Recipe = {}): Program {
  const yard: Node = { op: 'setup.yard', f: { space: recipe.space ?? 'free' }, args: { n: num(recipe.n ?? 100) } };
  const trade = tradeOf({ pair: recipe.pair, coin: recipe.coin, stake: recipe.stake });
  const round = [...(recipe.trade === false ? [] : [trade]), ...(recipe.then ?? [])];
  return {
    ast: AST_VERSION,
    scripts: [{ op: 'ctl.start', body: [yard, ...(recipe.setup ?? []), { op: 'ctl.forever', body: round }] }],
  };
}

/** The spec's default program: 100 equal agents, random pairs, a fair coin, β = 0.1 of the poorer's in-play. */
export const DEFAULT_PROGRAM: Program = program();

/** A trade block: pair up, flip, pay (the defaults: random pairs, a fair coin (`coin.fair`), 10 % of the poorer's), observers after. */
export function tradeOf(slots: { pair?: Node; coin?: Node; stake?: Node } = {}, ...observers: Node[]): Node {
  return {
    op: 'trade',
    body: [
      { op: 'trade.pair', args: { pair: slots.pair ?? option('pair.match', undefined, { within: everyone }) } },
      { op: 'trade.flip', args: { coin: slots.coin ?? { op: 'coin.fair' } } },
      { op: 'trade.pay', args: { stake: slots.stake ?? o.stake('poorer', 0.1) } },
      ...observers,
    ],
  };
}

/** A tax block: take τ into the pot, then give it back by `r` (without one: the pot keeps it, a burn). */
export function taxOf(tau: Node, r: Node = option('give.keep'), ...observers: Node[]): Node {
  return { op: 'tax', body: [{ op: 'tax.take', args: { tau } }, { op: 'tax.give', args: { r } }, ...observers] };
}

export const statementOf = {
  tax: taxOf,
  grow: (mu: number, sigma: number): Node => ({ op: 'grow', args: { mu: num(mu), sigma: num(sigma) } }),
  move: (v: number): Node => ({ op: 'move', args: { v: num(v) } }),
  thrift: (lambda: number): Node => ({ op: 'traits.thrift', args: { d: { op: 'dist.same', args: { v: num(lambda) } } } }),
  thriftBetween: (lo: number, hi: number): Node => ({ op: 'traits.thrift', args: { d: { op: 'dist.uniform', args: { lo: num(lo), hi: num(hi) } } } }),
  talent: (m: number, s: number): Node => ({ op: 'traits.talent', args: { d: { op: 'dist.normal', args: { m: num(m), s: num(s) } } } }),
  debt: (d: number): Node => ({ op: 'debt', args: { d: num(d) } }),
};
const { tax, grow, move, thrift, thriftBetween, talent, debt } = statementOf;

export interface Preset {
  readonly id: string;
  readonly program: Program;
}

export const PRESETS: readonly Preset[] = [
  { id: 'yard-sale', program: program() },
  { id: 'fixed-stake', program: program({ stake: o.fixed(0.1) }) },
  { id: 'theft-fraud', program: program({ stake: o.stake('loser', 0.1) }) },
  { id: 'saving', program: program({ setup: [thrift(0.5)], stake: o.split() }) },
  { id: 'mixed-saving', program: program({ setup: [thriftBetween(0, 1)], stake: o.split() }) },
  { id: 'tilt-to-poor', program: program({ coin: o.tilt('poorer', 0.05) }) },
  { id: 'wealth-tax', program: program({ then: [tax(o.wealthTax(0.01), o.equally())] }) },
  // χ = 0.0005, not wealth-tax's 0.01: with ζ = 0.01, βζ = 0.001 must exceed χ for an oligarch (spec copy, Decisions)
  { id: 'advantage', program: program({ coin: o.gap('richer', 0.01), then: [tax(o.wealthTax(0.0005), o.equally())] }) },
  { id: 'debt', program: program({ setup: [debt(1)] }) },
  { id: 'growth', program: program({ trade: false, then: [grow(0, 0.05)] }) },
  { id: 'trickle-up', program: program({ then: [tax(o.flatTax(0.01), o.byWealth())] }) },
  { id: 'local', program: program({ space: 'lattice', pair: o.near(1), then: [move(0)] }) },
  { id: 'merit', program: program({ setup: [talent(0.6, 0.1)], coin: o.talent(0.5) }) },
  { id: 'floor', program: program({ then: [tax(o.wealthTax(0.01), o.poorest(0.1))] }) },
  { id: 'income-tax', program: program({ then: [tax(o.gainsTax(0.3), o.equally())] }) },
];

export function preset(id: string): Preset {
  const found = PRESETS.find((p) => p.id === id);
  if (!found) throw new RangeError(`no preset ${id}`);
  return found;
}
