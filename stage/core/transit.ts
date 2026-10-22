/**
 * The player: shows the game's moves as acts (stage/acts), on one clock.
 * Headless and deterministic; the page draws from `draw`.
 *
 * A set of moves the game has made (a trade, a gift, a levy) opens its
 * transfers in the ledger at once (so everyone is drawn as before), and an
 * act shows them; the act says when each move's money comes off and on, and
 * the ledger keeps what is drawn exact. Acts start in the order they come,
 * each as soon as nobody in it is in an earlier one still showing (one
 * person's cuts and joins never overlap; meanwhile its money is drawn where
 * it was); a levy, everyone's, waits for everything before it to land and
 * for the room to make space (`hold`), and trading waits for it.
 */
import { levyAct, pieceAct, tossAct, type Act, type Live, type MakeAct } from '../acts/index.ts';
import type { Scene } from '../acts/scene.ts';
import { Ledger, POT, type Move, type MoneyEvent, type Transfer } from './transfer.ts';

/** How trades are shown: not at all, where people stand, or (partners met first) tossed. */
type TradeStyle = 'off' | 'piece' | 'toss';

export type MoveKind = 'trade' | 'levy' | 'give';

type TransitEvent = MoneyEvent | { readonly kind: 'brace'; readonly pays: Float64Array } | { readonly kind: 'relax' };

/** Streamed trades: at most this many in progress, one starting every so often. */
const MAX_TRADES = 6;
const SPAWN_GAP = 0.1;
/**
 * An act cuts its people as they are drawn, so it starts once each is drawn at its size (within SIZE_TOL of the
 * area its money makes): after growth they are still growing into it. Trading alone, they always are. It waits at
 * most SIZE_WAIT seconds (a body with no room to grow stays smaller), then cuts as they are.
 */
const SIZE_TOL = 0.02;
const SIZE_WAIT = 1;

export interface Run {
  readonly kind: MoveKind;
  /** How a trade is shown (a levy: null). */
  readonly style: 'piece' | 'toss' | null;
  readonly moves: readonly Move[];
  readonly transfers: readonly Transfer[];
  /** Money through the pot (a levy): its area, the pot's size. */
  readonly pot: number;
  /** Clock time the act starts: NaN while it waits. */
  start: number;
  /** Clock time it was asked for. */
  readonly opened: number;
  /** Everyone whose money it moves (a levy: everyone). */
  readonly holders: ReadonlySet<number>;
  act: Act | null;
  readonly make: (live: Live) => Act;
  relaxed: boolean;
}

export class Transit {
  readonly n: number;
  runs: Run[] = [];
  events: TransitEvent[] = [];
  revision = 0;
  trade: TradeStyle = 'piece';
  tax = true;
  sync = false;
  /** Trades shown in a chart too (`fx chart on`): the chart re-forms as each lands. */
  chart = false;
  /** A levy waits while this is set (the page is clearing the pot's spot). */
  hold = false;
  private readonly ledger: Ledger;
  private time = 0;
  private lastSpawn = -Infinity;
  private spawned = 0;

  constructor(n: number) {
    this.n = n;
    this.ledger = new Ledger(n);
  }

  /**
   * Moves the game just made: show them if wanted and there is room; returns
   * whether they will be shown. `style`: how a trade is shown; `together`: a
   * round's trades all start now, on one clock.
   */
  play(kind: MoveKind, moves: readonly Move[], live: Live, opts: { style?: 'piece' | 'toss'; together?: boolean; lifted?: boolean; facing?: boolean; bars?: boolean } = {}): boolean {
    const ms = moves.map((m) => ({ ...m }));
    if (kind === 'levy') {
      if (!this.tax || this.levy) return false;
      let pot = 0;
      for (const m of ms) if (m.to === POT) pot += m.amount;
      if (!(pot > 0)) return false;
      const lifted = opts.lifted;
      this.open(kind, null, ms, pot, (l) => levyAct(l, ms, { bend: 0, lifted }));
      return true;
    }
    // (pacing a stream is the caller's: `canPlay`; a trade asked for is always shown, in its turn)
    if (this.trade === 'off' || this.levy) return false;
    const style = opts.style ?? 'piece';
    const make: MakeAct = style === 'toss' ? tossAct : pieceAct;
    const bend = (this.spawned++ % 2 ? 1 : -1) * 0.16;
    const { lifted, facing, bars } = opts;
    const run = this.open(kind, style, ms, 0, (l) => make(l, ms, { bend, lifted, facing, bars }));
    // someone in it is still in an earlier act (or growing to their size): it waits its turn, drawn as before meanwhile
    if (this.ready(run, live)) this.begin(run, live);
    this.lastSpawn = this.time;
    return true;
  }

  /** `run` may start: nothing before it shares a person with it, no levy (everyone's) is before it, its people are at their size. */
  private ready(run: Run, live: Live): boolean {
    for (const r of this.runs) {
      if (r === run) return (run.kind !== 'levy' || !this.hold) && this.sized(run, live);
      if (r.kind === 'levy' || run.kind === 'levy') return false;
      for (const i of run.holders) if (r.holders.has(i)) return false;
    }
    return false;
  }

  /** Everyone `run` moves money for is drawn at the size their money makes (or it has waited long enough). */
  private sized(run: Run, live: Live): boolean {
    if (this.time - run.opened >= SIZE_WAIT) return true;
    for (const i of run.holders) {
      if (i < 0) continue;
      const b = live.box(i);
      const want = live.measure(live.drawn(i));
      if (want > 0 && Math.abs(b.w * b.h - want) > SIZE_TOL * want) return false;
    }
    return true;
  }

  private open(kind: MoveKind, style: Run['style'], moves: Move[], pot: number, make: (live: Live) => Act): Run {
    const holders = new Set<number>();
    for (const m of moves) {
      if (m.from >= 0) holders.add(m.from);
      if (m.to >= 0) holders.add(m.to);
    }
    const run: Run = { kind, style, moves, holders, transfers: this.ledger.add(moves), pot, start: NaN, opened: this.time, act: null, make, relaxed: false };
    this.runs.push(run);
    this.revision++;
    return run;
  }

  private begin(run: Run, live: Live): void {
    run.start = this.time;
    run.act = run.make(live);
    run.act.times.forEach((t, k) => {
      run.transfers[k].offAt = run.start + t.off;
      run.transfers[k].onAt = run.start + t.on;
    });
    if (run.act.brace) this.events.push({ kind: 'brace', pays: run.act.brace });
    this.revision++;
  }

  /**
   * The levy plays to its moment `mark` and holds there (`until levy pot|split|back`): null, it plays on. The
   * moment's clock time once the levy has started; until then nothing is held.
   */
  holdAt: string | null = null;

  /** The acts' clock, seconds. */
  get clock(): number {
    return this.time;
  }

  /** The levy's clock time at its moment `mark`, if it is playing (NaN if not started, Infinity if there is none). */
  levyAt(mark: string): number {
    const run = this.runs.find((r) => r.kind === 'levy');
    if (!run) return Infinity;
    if (!run.act) return NaN;
    return run.start + (run.act.marks?.[mark] ?? run.act.length);
  }

  step(dt: number, live: Live): void {
    if (!(dt > 0)) return;
    if (this.holdAt !== null) {
      // held at the levy's moment: the clock goes no further than it
      const at = this.levyAt(this.holdAt);
      if (Number.isFinite(at)) dt = Math.max(0, Math.min(dt, at - this.time));
      if (!(dt > 0)) return;
    }
    this.time += dt;
    // waiting acts start, in order, once nobody in them is in an earlier one (a levy: once
    // everything before it has landed and the room has made space)
    for (const r of this.runs) if (!r.act && this.ready(r, live)) this.begin(r, live);
    const money: MoneyEvent[] = [];
    if (this.ledger.advance(this.time, money)) {
      this.events.push(...money);
      this.revision++;
    }
    for (const r of this.runs) {
      if (r.act?.relaxAt !== undefined && !r.relaxed && this.time >= r.start + r.act.relaxAt) {
        r.relaxed = true;
        this.events.push({ kind: 'relax' });
      }
    }
    const over = this.runs.filter((r) => r.act && this.time >= r.start + r.act.length);
    if (over.length) {
      for (const r of over) this.ledger.close(r.transfers);
      this.runs = this.runs.filter((r) => !over.includes(r));
      this.revision++;
    }
  }

  /** Every act in progress, into `scene`. */
  draw(live: Live, scene: Scene): void {
    for (const r of this.runs) if (r.act) r.act.draw(this.time - r.start, live, scene);
  }

  /** Seconds since `run` started (NaN while it waits). */
  age(run: Run): number {
    return this.time - run.start;
  }

  clear(): void {
    this.runs = [];
    this.ledger.clear();
    // nothing left to hold at (review 2026-10-21, 1: a hold must not outlive what it held)
    this.holdAt = null;
    this.revision++;
  }

  /**
   * Every act still showing or waiting, done at once: each move's money off
   * and on now, in order (the events carry each holder's shapes), nothing
   * left in transit. For whatever changes wealth at once while acts are open.
   */
  finish(): void {
    if (!this.runs.length) return;
    const levy = this.levy !== null;
    const money: MoneyEvent[] = [];
    this.ledger.advance(Infinity, money);
    this.events.push(...money);
    if (levy) this.events.push({ kind: 'relax' });
    this.runs = [];
    this.ledger.clear();
    this.revision++;
  }

  get busy(): boolean {
    return this.runs.length > 0;
  }

  /** The trades (and gifts) in progress. */
  get trades(): Run[] {
    return this.runs.filter((r) => r.kind !== 'levy');
  }

  /** The levy waiting or in progress. */
  get levy(): Run | null {
    return this.runs.find((r) => r.kind === 'levy') ?? null;
  }

  /** A trade now would be played (not happen unseen): room in the air, no levy playing. */
  get canPlay(): boolean {
    return this.trade !== 'off' && !this.levy && this.trades.length < MAX_TRADES && this.time - this.lastSpawn >= SPAWN_GAP;
  }

  /** Trading waits while a levy plays, and between the rounds of synchronous trades. */
  get holding(): boolean {
    return this.levy !== null || (this.sync && this.trades.length > 0);
  }

  /** Money no person holds now: cut off and not yet taken in, or in the pot. */
  get inTransit(): number {
    return this.ledger.inTransit;
  }

  get owed(): Float64Array {
    return this.ledger.owed;
  }

  /**
   * What each person is drawn with: the game's wealth less what is still owed to the stage. Someone in debt is
   * drawn the size of the debt (the renderer greys them); money to or from a debtor lands at once (session), so
   * nothing is owed to them.
   */
  shown(wealth: ArrayLike<number>, out: Float64Array): Float64Array {
    const owed = this.ledger.owed;
    for (let i = 0; i < this.n; i++) out[i] = wealth[i] < 0 ? -wealth[i] : Math.max(wealth[i] - owed[i], wealth[i] * 1e-6);
    return out;
  }
}
