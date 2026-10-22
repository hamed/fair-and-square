/**
 * The game the stage plays: a program, run by the model's engine (FnS/model), seen the way the stage needs it.
 *
 * - `wealth` holds shares of all the wealth there is (the pot's share aside), so the yard's areas sum to 1.
 * - Every change of hands the engine makes is reported as it happens (`onMoves`): each trade on its own, and a
 *   round's tax and give together as one levy, through the pot (POT), as the levy act shows it.
 * - The console's one-offs (`trade k`, `levy`, `give`) and the panel's sliders and buttons are the run's inputs:
 *   logged with the step they came before, so a link replays them exactly.
 *
 * The stage's own program is today's yard sale with the stake and a levy on two sliders: `rule beta 0.3` moves
 * the stake slider (on the fly: the run goes on), and the panel shows the same sliders.
 */
import { num, type Node, type Program } from '../../model/ast.ts';
import { Run, type InputEvent } from '../../model/engine.ts';
import { panelOf, type Panel } from '../../model/panel.ts';
import { taxOf, tradeOf } from '../../model/presets.ts';
import { POT, type Move } from './transfer.ts';

export interface Rules {
  /** The stake: a share of the poorer party's wealth in play, [0, 1). */
  readonly beta: number;
  /** The levy each round: everyone pays this share, the pot is shared equally. [0, 1]. */
  readonly tax: number;
}

export const DEFAULT_RULES: Rules = Object.freeze({ beta: 0.1, tax: 0 });

/** Most trades a single command may run: keeps a typo from freezing the page. */
export const MAX_TRADES = 10_000_000;
/** A share that moved by more than this between the moves told and the engine's own value moved by itself (growth). */
const REBASED = 1e-12;

/** The sliders the stage's program reads its rules from. */
const STAKE = 'stake';
export const TAX = 'tax';

const slider = (name: string, max: number, start: number): Node => ({
  op: 'panel.slider',
  f: { name },
  args: { min: { op: 'pct', v: 0 }, max: { op: 'pct', v: max }, start: { op: 'pct', v: start } },
});

/** The effective number's name on the panel (its whole name, not N_eff). */
export const NEFF = 'Effective number';

/** The stake and tax sliders' tops, the same so they read on one scale (owner, 2026-10-21: up to 75%, a square's face still fits in what is left): three quarters of the poorer one's money, of everyone's a round. */
export const STAKE_MAX = 0.75;
export const TAX_MAX = 0.75;

/**
 * The stage's program: N agents, random pairs, a fair coin, the stake and a levy on two sliders, and the Gini
 * watched (a number and a plot on the panel). Rules outside the sliders' ranges widen them.
 */
export function stageProgram(n: number, rules: Rules = DEFAULT_RULES): Program {
  return {
    ast: 1,
    scripts: [
      {
        op: 'ctl.start',
        body: [
          { op: 'setup.yard', f: { space: 'free' }, args: { n: num(n) } },
          {
            op: 'ctl.forever',
            body: [
              tradeOf({ stake: { op: 'stake.share', f: { of: 'poorer' }, args: { beta: slider(STAKE, Math.max(STAKE_MAX, rules.beta), rules.beta) } } }),
              taxOf({ op: 'take.wealth', args: { rate: slider(TAX, Math.max(TAX_MAX, rules.tax), rules.tax), from: { op: 'group.all' } } }, { op: 'give.to', f: { how: 'equally' }, args: { to: { op: 'group.all' } } }),
              { op: 'panel.number', f: { name: 'Gini' }, args: { value: { op: 'stat.of', f: { stat: 'gini', prop: 'wealth' }, args: { over: { op: 'group.all' } } } } },
              // how many equal squares would hold the money as they do (owner, 2026-10-22: its whole name)
              { op: 'panel.number', f: { name: NEFF }, args: { value: { op: 'stat.of', f: { stat: 'neff', prop: 'wealth' }, args: { over: { op: 'group.all' } } } } },
              { op: 'panel.plot', f: { kind: 'gini' } },
              // each chart a square of the panel (owner, 2026-10-21): the Lorenz curve, how many have at least
              { op: 'panel.plot', f: { kind: 'lorenz' } },
              { op: 'panel.plot', f: { kind: 'ccdf' } },
            ],
          },
        ],
      },
    ],
  };
}

/** A program with its yard's N changed (a literal N only). */
export function withN(program: Program, n: number): Program {
  const start = program.scripts.find((s) => s.op === 'ctl.start');
  const yard = start?.body?.[0];
  if (!yard || yard.op !== 'setup.yard' || yard.args?.n?.op !== 'num') throw new RangeError('this program sets its N with an expression: change it in its blocks');
  const body = [{ ...yard, args: { ...yard.args, n: num(n) } }, ...start!.body!.slice(1)];
  return { ...program, scripts: program.scripts.map((s) => (s === start ? { ...s, body } : s)) };
}

export class Game {
  readonly program: Program;
  /** The program's panel blocks (its sliders, buttons, watched numbers, plots): read once, as the program never changes. */
  readonly panel: Panel;
  readonly seed: number;
  readonly run: Run;
  readonly n: number;
  /** Shares of all the wealth there is; the pot holds the rest. */
  readonly wealth: Float64Array;
  /** Trades since the last reset (the console's and the program's). */
  trades = 0;
  /** Bumps on every change of wealth: views compare it instead of the array. */
  revision = 0;
  /**
   * Every change of hands, after the wealth has moved: a trade's or a gift's one move, a levy's payments into
   * the pot (POT) and shares out of it. Off when null. A trade's array is reused: copy what you keep.
   */
  onMoves: ((kind: 'trade' | 'levy' | 'give', moves: readonly Move[]) => void) | null = null;
  /**
   * Shares changed by something that is not a change of hands (growth: each one's own, so the shares move), after
   * a step: moves still being shown were sized on the shares before it. Off when null.
   */
  onRebase: (() => void) | null = null;
  private readonly one: { from: number; to: number; amount: number }[] = [{ from: 0, to: 0, amount: 0 }];
  /** A round's payments into the pot and shares out of it, reported together. */
  private pooled: Move[] = [];
  /** All the wealth there is, in the engine's units (≈ N): a move's amount over this is a share. */
  private unit = 1;

  /** The stage's program for `n` agents with these rules, or any program (its N is its own). Throws if invalid. */
  constructor(n: number, seed = 1, rules: Rules | Program = DEFAULT_RULES) {
    this.program = 'ast' in rules ? rules : stageProgram(n, rules);
    this.panel = panelOf(this.program);
    this.seed = seed;
    this.run = new Run(this.program, seed);
    this.n = this.run.world.n;
    this.wealth = new Float64Array(this.n);
    this.run.onMove = (kind, from, to, amount) => this.moved(kind, from, to, amount);
    this.sync();
  }

  /** The rules the stage reads: the stake and tax sliders where the program has them. */
  get rules(): Rules {
    const sliders = this.panel.sliders;
    const value = (name: string, fallback: number) => {
      const s = sliders.find((x) => x.name === name);
      return s ? Math.min(Math.max(this.run.sliders.get(name) ?? s.start, s.min), s.max) : fallback;
    };
    return { beta: value(STAKE, 0.1), tax: value(TAX, 0) };
  }

  /** Move the stake and tax sliders (the run goes on). Throws if the program has no such slider. */
  setRules(rules: Partial<Rules>): void {
    const names = new Set(this.panel.sliders.map((s) => s.name));
    const set = (name: string, value: number | undefined, lo: number, hi: number) => {
      if (value === undefined) return;
      if (!(value >= lo && value <= hi)) throw new RangeError(`${name} must be in [${lo}, ${hi}]`);
      if (!names.has(name)) throw new RangeError(`this program has no "${name}" slider: change it in its blocks`);
    };
    set(STAKE, rules.beta, 0, 0.999);
    set(TAX, rules.tax, 0, 1);
    if (rules.beta !== undefined) this.input({ kind: 'slider', name: STAKE, value: rules.beta });
    if (rules.tax !== undefined) this.input({ kind: 'slider', name: TAX, value: rules.tax });
  }

  /** Everyone back at round 0, the dice at the seed, the inputs forgotten. */
  reset(): void {
    this.run.reset(false);
    this.trades = 0;
    this.sync();
  }

  /** `k` one-off trades by the program's first trade block, pairs drawn one after another. */
  trade(k: number): void {
    if (!Number.isSafeInteger(k) || k < 0 || k > MAX_TRADES) throw new RangeError(`trades must be an integer in [0, ${MAX_TRADES}]`);
    if (k > 0) this.input({ kind: 'trades', k });
  }

  /** `k` rounds of the program (fewer if it pauses, waits or ends, or `until` says stop). Returns the rounds played. */
  round(k = 1, until?: () => boolean): number {
    if (!Number.isSafeInteger(k) || k < 0 || k * Math.floor(this.n / 2) > MAX_TRADES) throw new RangeError(`rounds must be a whole number, at most ${MAX_TRADES} trades`);
    let played = 0;
    for (; played < k; played++) {
      this.unit = this.total();
      const s = this.run.step();
      this.flush();
      if (s !== 'round') break;
      if (until?.()) {
        played++;
        break;
      }
    }
    this.sync(true);
    return played;
  }

  /** Partners can meet before a round: its pairs are known ahead. */
  get meets(): boolean {
    return this.run.pairsAhead;
  }

  /**
   * A link's state: this input log replayed up to `step`, every move reported as it happens (so the stage's
   * shapes follow the same history), the trades counted.
   */
  replay(inputs: readonly import('../../model/engine.ts').Input[], step: number): void {
    this.run.setInputs(inputs);
    this.trades = 0;
    this.pooled = [];
    this.sync();
    while (this.run.steps < step && this.run.status !== 'ended') {
      this.unit = this.total();
      this.run.step();
      this.flush();
    }
    this.unit = this.total();
    this.run.applyPending();
    this.flush();
    this.sync();
  }

  /** The pairs the next round will have (partners side by side), or null if they cannot be known ahead. */
  peek(): Int32Array | null {
    return this.run.peekPairs();
  }

  /** Everyone pays `rate` of their wealth; the pot is shared equally. */
  levy(rate: number): void {
    if (!(rate >= 0 && rate <= 1)) throw new RangeError('rate must be in [0, 1]');
    this.input({ kind: 'levy', rate });
  }

  /** `from` gives `to` up to `amount` (a share of all wealth). Returns what moved, as a share. */
  give(from: number, to: number, amount: number): number {
    const check = (i: number) => {
      if (!Number.isInteger(i) || i < 0 || i >= this.n) throw new RangeError(`agent must be an integer in [0, ${this.n - 1}]`);
    };
    check(from);
    check(to);
    if (!(amount >= 0 && Number.isFinite(amount))) throw new RangeError('amount must be finite and non-negative');
    const before = this.wealth[from];
    // a gift keeps a remainder: wealth never reaches zero, so a log pose always has a finite poorest
    const capped = Math.min(amount, Math.max(0, before) * (1 - 1e-9));
    this.input({ kind: 'gift', from, to, amount: capped * this.total() });
    return before - this.wealth[from];
  }

  /** A slider moved or a button pressed on the panel. */
  input(event: InputEvent): void {
    this.unit = this.total();
    this.run.input(event);
    this.flush();
    this.sync(true);
  }

  /** Everything a command may change, for rolling back a command that fails halfway. */
  snapshot(): { step: number; inputs: number; trades: number } {
    return { step: this.run.steps, inputs: this.run.inputs.length, trades: this.trades };
  }

  restore(s: ReturnType<Game['snapshot']>): void {
    this.run.rewind(s.step, s.inputs);
    this.trades = s.trades;
    this.pooled = [];
    this.sync();
  }

  /** All the wealth there is now, in the engine's units. */
  private total(): number {
    const w = this.run.world.w;
    let sum = this.run.world.pot;
    for (let k = 0; k < w.length; k++) sum += w[k];
    return sum;
  }

  /** The engine moved money: kept in the shares at once, reported as the stage needs it. */
  private moved(kind: 'trade' | 'tax' | 'give', from: number, to: number, amount: number): void {
    const w = this.wealth;
    const ew = this.run.world.w;
    // the shares as they were before this move are not what was last told: something else moved them (growth)
    const before = (i: number, back: number) => i >= 0 && Math.abs((ew[i] + back) / this.unit - w[i]) > REBASED;
    if (before(from, amount) || before(to, -amount)) this.rebase();
    const a = amount / this.unit;
    // from the engine's own values, not by adding up moves: a tiny share keeps its sign through many trades
    if (from >= 0) w[from] = ew[from] / this.unit;
    if (to >= 0) w[to] = ew[to] / this.unit;
    if (kind === 'trade') this.trades++;
    if (kind === 'tax' || (kind === 'give' && from === POT)) {
      this.pooled.push({ from, to, amount: a });
      return;
    }
    // a trade or a gift between two people: whatever went through the pot before it is reported first
    this.flush();
    this.revision++;
    if (!this.onMoves) return;
    const m = this.one[0];
    m.from = from;
    m.to = to;
    m.amount = a;
    this.onMoves(kind === 'trade' ? 'trade' : 'give', this.one);
  }

  /** The pot's payments and shares so far, as one levy. */
  private flush(): void {
    if (!this.pooled.length) return;
    const moves = this.pooled;
    this.pooled = [];
    this.revision++;
    this.onMoves?.('levy', moves);
  }

  /**
   * The shares from the engine, exactly (growth, rounding): after every step or input. `report`: shares that moved
   * other than by the moves told (beyond rounding) are told to onRebase.
   */
  private sync(report = false): void {
    const w = this.run.world.w;
    const total = this.total();
    let moved = 0;
    for (let k = 0; k < this.n; k++) {
      const share = w[k] / total;
      moved = Math.max(moved, Math.abs(share - this.wealth[k]));
      this.wealth[k] = share;
    }
    this.revision++;
    if (report && moved > REBASED) this.onRebase?.();
  }

  /**
   * In the middle of a step, a move about to be told finds the shares moved under it (growth before it): the shares
   * taken afresh from the engine (this move's included, as a move's are when it is told) and onRebase told first,
   * so what is still showing (a levy pooled before the growth too) lands on the shares it was sized on.
   */
  private rebase(): void {
    this.flush();
    this.unit = this.total();
    this.sync();
    this.onRebase?.();
  }
}
