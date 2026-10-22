/**
 * AST → closures, and the runner that plays them.
 *
 * Each statement compiles to a function of the Runtime; each expression to a closure that reads the Runtime's
 * current agents (me, poorer, richer, winner, loser) and the world. The runner is a generator over the control
 * blocks: it yields 'setup' once the setup blocks have run, 'round' after each pass of the outermost loop, and
 * 'pause' at a pause block. The operators are the spec's (Model, Operators, Engine semantics); the choices it
 * left open are in docs/model-blocks-spec.md, "Decisions".
 *
 * Draws: the built-in streams are keyed by (seed, stream, round, occurrence), the occurrence counting the runs of
 * that kind of statement (trade, grow, give, move) in this round; a random block by (seed, its path, round, how
 * many times its statement has run this round). Within a key, the index is the agent or the pair's ordinal.
 */
import { argPath, bodyPath, type Node, type Path, type Program } from './ast.ts';
import { SETUP, isObserver, type Global, type Prop, type Who } from './catalogue.ts';
import { atanh, exp, log, pow, sqrt, tanh } from './dmath.ts';
import { Draws, STREAM, keyOf, type Key } from './rng.ts';
import { COUNTRIES, lorenzOf } from './countries.ts';
import { MAX_N, MAX_THRIFT, MIN_N, Snapshot, World } from './world.ts';
import { statOf, type Stat } from './stats.ts';

export type WarningCode = 'not-finite' | 'clamped' | 'runaway' | 'collapse';
export type Signal = 'setup' | 'round' | 'pause' | 'wait';

/**
 * How many passes all loops inside other loops may make together in one round before they are cut short, with a
 * warning. One allowance per round, shared by every nesting level (review MB1: a per-loop allowance let three
 * nested loops run 10¹⁰ passes).
 */
export const INNER_LIMIT = 100_000;

type Num = (rt: Runtime) => number;
type Bool = (rt: Runtime) => boolean;
/** Told of an observer as it runs: its op and fields, and for a block that names a group, who is in it now. */
export type ViewListener = (op: string, f: Readonly<Record<string, string>>, members?: Uint8Array, value?: number) => void;

/** A group: is square k in it, now? */
type Member = (rt: Runtime, k: number) => boolean;

/** Bumps on every site begun, across every run: a group drawn at random is drawn once per visit. */
let visits = 0;
type Kind = 'trade' | 'grow' | 'give' | 'move';

/** A place that evaluates expressions: a statement or a control block. Its random blocks are re-keyed each run. */
interface Site {
  readonly id: number;
  readonly randoms: { readonly draws: Draws; readonly key: Key }[];
  /** A trade that reads ranks or measured globals takes the snapshot before its first transfer. */
  needsSnap: boolean;
  /** What is measured as the statement begins, before anything in it moves (`stat.of`). */
  readonly begins: ((rt: Runtime) => void)[];
}

type Stmt =
  | { readonly kind: 'exec'; readonly setup: boolean; readonly run: (rt: Runtime) => void }
  | { readonly kind: 'pause' }
  | { readonly kind: 'wait'; readonly name: string }
  | { readonly kind: 'every'; readonly site: Site; readonly k: Num; readonly body: readonly Stmt[]; readonly path: Path }
  | {
      readonly kind: 'loop';
      readonly op: 'forever' | 'repeat' | 'until';
      readonly site: Site;
      readonly count?: Num;
      readonly cond?: Bool;
      readonly body: readonly Stmt[];
      readonly path: Path;
    };

export interface Compiled {
  readonly sites: number;
  readonly body: readonly Stmt[];
  /** What each button runs when pressed, its scripts one after another. */
  readonly buttons: ReadonlyMap<string, readonly Stmt[]>;
  /** The console's `trade k` (the first trade block's coin and stake), or null without one. */
  readonly trade: ((rt: Runtime, k: number) => void) | null;
  /**
   * The pairs the next round's first trade will make, without playing it: for random pairs (pair.match) only,
   * whose draws depend on nothing but the round. Partners walk up to each other on the stage before they trade.
   */
  readonly peek: ((rt: Runtime) => Int32Array) | null;
  /** The panel's watched numbers, by their block's path: worked out when the panel asks (`Run.evaluate`). */
  readonly watches: ReadonlyMap<Path, { readonly site: Site; readonly value: Num }>;
  /** The `when` scripts: a condition looked at after every step, and the stack it runs each time it turns true. */
  readonly whens: readonly { readonly site: Site; readonly cond: Bool; readonly body: readonly Stmt[] }[];
}

/** The pot, as the other end of a tax payment or a give. */
export const POT = -1;
export type MoveKind = 'trade' | 'tax' | 'give';

/** Everything a compiled program reads and writes while it runs. */
export class Runtime {
  readonly seed: number;
  world!: World;
  snap!: Snapshot;
  me = 0;
  poorer = 0;
  richer = 0;
  winner = 0;
  loser = 0;
  /** The draw index for random blocks: the agent, or the pair's ordinal. */
  index = 0;
  /** The site visit now running (see `visits`). */
  visit = 0;
  /** An observer's own snapshot, so looking never disturbs the step it looks at. */
  private lookSnap!: Snapshot;
  /** Told of each observer (camera, panel output) as it runs: what the view should do now. */
  onView: ViewListener | null = null;
  /** Told of every change of hands as it happens (amounts in units of mean wealth; POT for the pot). */
  onMove: ((kind: MoveKind, from: number, to: number, amount: number) => void) | null = null;
  /** The console's one-off trades this round, numbered through it. */
  consoleRuns = 0;
  /** The panel's sliders, by name: their last value (none yet: the slider's start). */
  readonly sliders = new Map<string, number>();
  /** Each `when` script's condition when last looked at (1: true), so its stack runs only as it turns true. */
  whenWas = new Uint8Array(0);
  /** The button a wait block is waiting for, and whether it has been pressed. */
  waitingFor: string | null = null;
  released = false;
  /** The first warning at each path since the run began. */
  readonly warnings = new Map<Path, WarningCode>();
  readonly kindRuns: Record<Kind, number> = { trade: 0, grow: 0, give: 0, move: 0 };
  /** Passes of inner loops so far this round (INNER_LIMIT). */
  innerPasses = 0;
  readonly siteRuns: Int32Array;
  readonly draws = {
    pair: new Draws(),
    coin: new Draws(),
    split: new Draws(),
    grow: new Draws(),
    give: new Draws(),
    move: new Draws(),
    setup: new Draws(),
  };
  // scratch, sized when the yard is set up
  pairs = new Int32Array(0);
  order = new Int32Array(0);
  matched = new Uint8Array(0);
  values = new Float64Array(0);
  candidates = new Int32Array(0);
  stamp = new Int32Array(0);
  stampNow = 0;

  constructor(seed: number, sites: number) {
    this.seed = seed;
    this.siteRuns = new Int32Array(sites);
  }

  warn(path: Path, code: WarningCode): void {
    if (!this.warnings.has(path)) this.warnings.set(path, code);
  }

  /** A finite number, or 0 with a warning (spec: NaN or infinity evaluates to 0, visibly). */
  finite(x: number, path: Path): number {
    if (Number.isFinite(x)) return x;
    this.warn(path, 'not-finite');
    return 0;
  }

  attach(world: World): void {
    this.world = world;
    this.snap = new Snapshot(world);
    this.lookSnap = new Snapshot(world);
    const n = world.n;
    this.pairs = new Int32Array(n + 1);
    this.order = new Int32Array(n);
    this.matched = new Uint8Array(n);
    this.values = new Float64Array(n);
    this.candidates = new Int32Array(Math.max(n, 9));
    this.stamp = new Int32Array(world.side * world.side);
    this.stampNow = 0;
  }

  beginSite(site: Site): void {
    const occurrence = this.siteRuns[site.id]++;
    this.visit = ++visits;
    const round = this.world ? this.world.round : 0;
    for (const r of site.randoms) r.draws.at(this.seed, r.key, round, occurrence);
    // a scalar expression (a count, a condition, a pairing argument) draws at index 0, whatever ran before;
    // per-agent and per-pair statements set their own index (review MB3)
    this.index = 0;
    if (this.snap) {
      this.snap.reset();
      if (site.needsSnap) this.snap.take();
    }
    // (before the yard is set up there is nothing to measure: read then, a measure is 0 as before)
    if (this.world) for (const measure of site.begins) measure(this);
  }

  /**
   * An observer's look at the state: its own site begun on its own snapshot, then the step's context (snapshot,
   * visit, draw index, `me`) put back, so the step goes on exactly as if nothing had looked.
   */
  observe<T>(site: Site, look: () => T): T {
    const snap = this.snap;
    const visit = this.visit;
    const index = this.index;
    const me = this.me;
    this.snap = this.lookSnap;
    try {
      this.beginSite(site);
      return look();
    } finally {
      this.snap = snap;
      this.visit = visit;
      this.index = index;
      this.me = me;
    }
  }

  endRound(): void {
    const world = this.world;
    world.round++;
    this.kindRuns.trade = this.kindRuns.grow = this.kindRuns.give = this.kindRuns.move = 0;
    this.siteRuns.fill(0);
    this.innerPasses = 0;
    this.consoleRuns = 0;
    world.start.set(world.w);
    world.gain.fill(0);
  }

  /** A fresh mark for "seen this cell" (no clearing between scans). */
  nextStamp(): number {
    if (++this.stampNow > 0x7fffffff) {
      this.stamp.fill(0);
      this.stampNow = 1;
    }
    return this.stampNow;
  }
}

/** Compile a valid program (validate first: this trusts its shape). */
export function compile(program: Program): Compiled {
  const c = new Compiler();
  const index = program.scripts.findIndex((s) => s.op === 'ctl.start');
  const start = program.scripts[index];
  const body = c.body(start.body ?? [], String(index));
  const buttons = new Map<string, Stmt[]>();
  program.scripts.forEach((script, i) => {
    if (script.op !== 'panel.button') return;
    const name = script.f!.name;
    buttons.set(name, [...(buttons.get(name) ?? []), ...c.body(script.body ?? [], String(i))]);
  });
  // after the rest, so a program without them compiles to the same sites as before
  const whens: { site: Site; cond: Bool; body: Stmt[] }[] = [];
  program.scripts.forEach((script, i) => {
    if (script.op !== 'show.when') return;
    const site = c.site();
    whens.push({ site, cond: c.bool(script.args!.c, argPath(String(i), 'c'), site), body: c.body(script.body ?? [], String(i)) });
  });
  return { body, sites: c.sites, buttons, trade: c.consoleTrade, peek: c.peek, watches: c.watches, whens };
}

/**
 * The `when` scripts, at a step boundary: each condition looked at as an observer looks (its own site and snapshot:
 * the economy never sees it), and its stack (camera blocks: they change nothing) run if it has just turned true.
 */
export function whens(rt: Runtime, compiled: Compiled): void {
  const list = compiled.whens;
  if (!list.length) return;
  if (rt.whenWas.length !== list.length) rt.whenWas = new Uint8Array(list.length);
  for (let k = 0; k < list.length; k++) {
    const w = list[k];
    const now = rt.observe(w.site, () => w.cond(rt));
    if (now && !rt.whenWas[k]) for (const s of w.body) if (s.kind === 'exec') s.run(rt);
    rt.whenWas[k] = now ? 1 : 0;
  }
}

/** Everyone pays `rate` of w + D into a pot shared equally at once (the console's `levy`). */
export function levyNow(rt: Runtime, rate: number): void {
  const world = rt.world;
  const w = world.w;
  const n = world.n;
  let pot = 0;
  for (let k = 0; k < n; k++) {
    const owed = Math.max(0, Math.min(rate * (w[k] + world.debt), w[k] + world.debt));
    w[k] -= owed;
    pot += owed;
    if (rt.onMove && owed > 0) rt.onMove('tax', k, POT, owed);
  }
  const share = pot / n;
  for (let k = 0; k < n; k++) {
    w[k] += share;
    if (rt.onMove && share > 0) rt.onMove('give', POT, k, share);
  }
}

/** `from` gives `to` up to `amount` (units of mean wealth), never below −D (the console's `give`). Returns what moved. */
export function giftNow(rt: Runtime, from: number, to: number, amount: number): number {
  const world = rt.world;
  if (from === to) return 0;
  const moved = Math.max(0, Math.min(amount, world.w[from] + world.debt));
  world.w[from] -= moved;
  world.w[to] += moved;
  if (rt.onMove && moved > 0) rt.onMove('give', from, to, moved);
  return moved;
}

/** A button pressed (at a step boundary): its scripts run once, and a wait for it lets go. */
export function press(rt: Runtime, compiled: Compiled, name: string): void {
  if (rt.waitingFor === name) rt.released = true;
  for (const s of compiled.buttons.get(name) ?? []) if (s.kind === 'exec') s.run(rt);
}

/** Run the program: the setup blocks, then the rest, round by round. */
export function* execute(rt: Runtime, compiled: Compiled): Generator<Signal, void, void> {
  const body = compiled.body;
  let i = 0;
  for (; i < body.length; i++) {
    const s = body[i];
    if (s.kind !== 'exec' || !s.setup) break;
    s.run(rt);
  }
  yield 'setup';
  yield* block(rt, body.slice(i), false);
}

function* block(rt: Runtime, body: readonly Stmt[], inLoop: boolean): Generator<Signal, void, void> {
  for (const s of body) {
    if (s.kind === 'exec') s.run(rt);
    else if (s.kind === 'pause') yield 'pause';
    else if (s.kind === 'wait') {
      rt.waitingFor = s.name;
      rt.released = false;
      while (!rt.released) yield 'wait';
      rt.waitingFor = null;
      rt.released = false;
    }
    else if (s.kind === 'every') {
      rt.beginSite(s.site);
      let k = Math.floor(rt.finite(s.k(rt), argPath(s.path, 'k')));
      if (!(k >= 1)) {
        rt.warn(s.path, 'clamped');
        k = 1;
      }
      if ((rt.world.round + 1) % k === 0) yield* block(rt, s.body, inLoop);
    } else yield* loop(rt, s, inLoop);
  }
}

function* loop(rt: Runtime, s: Extract<Stmt, { kind: 'loop' }>, inLoop: boolean): Generator<Signal, void, void> {
  let passes = Infinity;
  if (s.op === 'repeat') {
    rt.beginSite(s.site);
    passes = Math.max(0, Math.floor(rt.finite(s.count!(rt), argPath(s.path, 'n'))));
  }
  for (let pass = 0; pass < passes; pass++) {
    if (inLoop && rt.innerPasses >= INNER_LIMIT) {
      rt.warn(s.path, 'runaway');
      return;
    }
    if (s.op === 'until') {
      rt.beginSite(s.site);
      if (s.cond!(rt)) return;
    }
    yield* block(rt, s.body, true);
    if (!inLoop) {
      rt.endRound();
      yield 'round';
    } else rt.innerPasses++;
  }
}

const MAIN_KEYS = { coin: STREAM.coin, split: STREAM.split };
const CONSOLE_KEYS = { coin: STREAM.consoleCoin, split: STREAM.consoleSplit };

class Compiler {
  sites = 0;
  /** The first trade block's coin and stake, for the console's one-off trades. */
  consoleTrade: ((rt: Runtime, k: number) => void) | null = null;
  /** The first trade block's pairs for the next round, if they can be known ahead (pair.match). */
  peek: ((rt: Runtime) => Int32Array) | null = null;
  private traded = false;
  /** Named groups (`group.define`), compiled afresh where they are used, so their ranks are that site's. */
  private readonly groups = new Map<string, { node: Node; path: Path }>();
  /** The panel's watched numbers (`panel.number`), by path. */
  readonly watches = new Map<Path, { site: Site; value: Num }>();
  /** Names being compiled: a group named inside itself refuses rather than recursing. */
  private readonly naming = new Set<string>();

  site(): Site {
    return { id: this.sites++, randoms: [], needsSnap: false, begins: [] };
  }

  body(nodes: readonly Node[], path: Path): Stmt[] {
    const out: Stmt[] = [];
    nodes.forEach((node, i) => {
      const s = this.stmt(node, bodyPath(path, i));
      if (s) out.push(s);
    });
    return out;
  }

  stmt(node: Node, path: Path): Stmt | null {
    const exec = (run: (rt: Runtime) => void): Stmt => ({ kind: 'exec', setup: SETUP.has(node.op), run });
    switch (node.op) {
      case 'ctl.forever':
        return { kind: 'loop', op: 'forever', site: this.site(), body: this.body(node.body ?? [], path), path };
      case 'ctl.repeat': {
        const site = this.site();
        const count = this.num(node.args!.n, argPath(path, 'n'), site);
        return { kind: 'loop', op: 'repeat', site, count, body: this.body(node.body ?? [], path), path };
      }
      case 'ctl.until': {
        const site = this.site();
        const cond = this.bool(node.args!.c, argPath(path, 'c'), site);
        return { kind: 'loop', op: 'until', site, cond, body: this.body(node.body ?? [], path), path };
      }
      case 'ctl.every': {
        const site = this.site();
        return { kind: 'every', site, k: this.num(node.args!.k, argPath(path, 'k'), site), body: this.body(node.body ?? [], path), path };
      }
      case 'ctl.pause':
        return { kind: 'pause' };
      case 'panel.wait':
        return { kind: 'wait', name: node.f!.name };
      case 'setup.yard':
        return exec(this.yard(node, path));
      case 'setup.start': {
        // its own site; its draws keyed by the start stream, as the yard's were: the same start as before
        const site = this.site();
        const start = this.start(node.args!.with, argPath(path, 'with'), site);
        return exec((rt) => {
          rt.beginSite(site);
          const world = rt.world;
          const w = world.w;
          start(rt, w, rt.draws.setup.at(rt.seed, STREAM.start, 0, 0));
          // rescaled to mean 1
          let sum = 0;
          for (let k = 0; k < w.length; k++) sum += w[k];
          const mean = sum / w.length;
          for (let k = 0; k < w.length; k++) w[k] /= mean;
          world.start.set(w);
        });
      }
      case 'traits.talent':
        return exec(this.talent(node, path));
      case 'traits.thrift':
        return exec(this.thrift(node, path));
      case 'debt':
        return exec(this.debt(node, path));
      case 'group.define':
        this.groups.set(node.f!.name, { node: node.args!.group, path: argPath(path, 'group') });
        return exec(() => {});
      case 'trade':
        // observers where they stand: before pair up, after it (flip and pay are pair by pair: between them
        // counts as before the payments), after pay
        return exec(this.trade(node, path, this.observers(node, path)));
      case 'grow':
        return exec(this.grow(node, path));
      case 'tax': {
        // take, then give back (each its own snapshot: the give's ranks are after the take), or keep it: a burn
        const views = this.observers(node, path);
        const [take, takeAt] = stepOf(node, path, 'tax.take');
        const [give, giveAt] = stepOf(node, path, 'tax.give');
        const taking = this.tax(take, takeAt);
        const giving = give.args!.r.op === 'give.keep' ? null : this.give(give, giveAt);
        return exec((rt) => {
          views(rt, 0);
          taking(rt);
          views(rt, 1);
          giving?.(rt);
          views(rt, 2);
        });
      }
      case 'move':
        return exec(this.move(node, path));
      default: {
        // camera and panel blocks never change the simulation: they tell the view, when they run
        if (!isObserver(node.op)) return null;
        return { kind: 'exec', setup: false, run: this.observer(node, path) };
      }
    }
  }

  /**
   * The observers among a step block's steps, by gap: gap g holds those after g steps (0: before the first).
   * `views(rt, g)` tells the view of gap g's, in their order (they change nothing).
   */
  private observers(node: Node, path: Path): (rt: Runtime, gap: number) => void {
    const gaps: ((rt: Runtime) => void)[][] = [[]];
    (node.body ?? []).forEach((n, i) => {
      if (isObserver(n.op)) gaps[gaps.length - 1].push(this.observer(n, bodyPath(path, i)));
      else gaps.push([]);
    });
    return (rt, gap) => {
      const tell = gaps[gap];
      if (tell) for (const t of tell) t(rt);
    };
  }

  /**
   * An observer: tells the view its fields; a block with a group works out who is in it, on its own site (its
   * own snapshot and draws), so the economy never sees it.
   */
  private observer(node: Node, path: Path): (rt: Runtime) => void {
    const f = node.f ?? {};
    // a number the observer tells: a log's value, a hold's seconds
    const told = node.op === 'show.hold' ? 'seconds' : 'value';
    if (node.op === 'panel.number' || node.op === 'panel.print' || node.op === 'show.hold') {
      const site = this.site();
      const value = this.num(node.args![told], argPath(path, told), site);
      if (node.op === 'panel.number') {
        this.watches.set(path, { site, value });
        return (rt) => rt.onView?.(node.op, f);
      }
      return (rt) => {
        if (!rt.onView) return;
        const v = rt.observe(site, () => value(rt));
        rt.onView(node.op, f, undefined, v);
      };
    }
    const groupNode = node.args?.who;
    if (!groupNode) return (rt) => rt.onView?.(node.op, f);
    const site = this.site();
    const member = this.group(groupNode, argPath(path, 'who'), site);
    return (rt) => {
      if (!rt.onView) return;
      const members = rt.observe(site, () => {
        const n = rt.world.n;
        const inside = new Uint8Array(n);
        for (let k = 0; k < n; k++) inside[k] = member(rt, k) ? 1 : 0;
        return inside;
      });
      rt.onView(node.op, f, members);
    };
  }

  // ——— setup ———

  private yard(node: Node, path: Path): (rt: Runtime) => void {
    const site = this.site();
    const nPath = argPath(path, 'n');
    const count = this.num(node.args!.n, nPath, site);
    return (rt) => {
      rt.beginSite(site);
      const asked = Math.round(rt.finite(count(rt), nPath));
      const n = Math.min(MAX_N, Math.max(MIN_N, asked));
      if (n !== asked) rt.warn(nPath, 'clamped');
      const world = new World(n);
      rt.attach(world);
      // everyone starts with 1 (a start block may say otherwise); places on the torus: a shuffle of the cells,
      // the first n taken
      const cells = Int32Array.from({ length: world.side * world.side }, (_, i) => i);
      shuffle(cells, cells.length, rt.draws.setup.at(rt.seed, STREAM.place, 0, 0));
      for (let k = 0; k < n; k++) {
        world.cell[k] = cells[k];
        world.occupant[cells[k]] = k;
      }
    };
  }

  /** The start option: fills everyone's first wealth (any scale; the yard rescales it to mean 1). null: equal. */
  /** The start: everyone's first wealth from a distribution (any scale: the yard rescales it to mean 1). */
  private start(node: Node, path: Path, site: Site): (rt: Runtime, w: Float64Array, d: Draws) => void {
    // below 0 counts as 0 (nobody starts in debt), and nothing at all as equal
    const dist = this.dist(node, path, site);
    return (rt, w, d) => {
      const draw = dist(rt, d);
      let clamped = false;
      let sum = 0;
      for (let k = 0; k < w.length; k++) {
        const x = draw(k);
        w[k] = x > 0 ? x : 0;
        if (!(x >= 0)) clamped = true;
        sum += w[k];
      }
      if (!(sum > 0) || !Number.isFinite(sum)) {
        w.fill(1);
        clamped = true;
      }
      if (clamped) rt.warn(path, 'clamped');
    };
  }

  private talent(node: Node, path: Path): (rt: Runtime) => void {
    const site = this.site();
    const dist = this.dist(node.args!.d, argPath(path, 'd'), site);
    return (rt) => {
      rt.beginSite(site);
      const draw = dist(rt, rt.draws.setup.at(rt.seed, STREAM.talent, 0, 0));
      const t = rt.world.talent;
      for (let k = 0; k < t.length; k++) t[k] = Math.min(1, Math.max(0, draw(k)));
    };
  }

  private thrift(node: Node, path: Path): (rt: Runtime) => void {
    const site = this.site();
    const at = argPath(path, 'd');
    const dist = this.dist(node.args!.d, at, site);
    return (rt) => {
      rt.beginSite(site);
      const draw = dist(rt, rt.draws.setup.at(rt.seed, STREAM.thrift, 0, 0));
      const lambda = rt.world.thrift;
      let clamped = false;
      for (let k = 0; k < lambda.length; k++) {
        // λ is kept in [0, 1): at 1 nothing would ever be in play
        const x = rt.finite(draw(k), at);
        lambda[k] = Math.min(MAX_THRIFT, Math.max(0, x));
        if (x < 0 || x > 1) clamped = true;
      }
      if (clamped) rt.warn(at, 'clamped');
    };
  }

  /**
   * A distribution: given the run and its draws (keyed by whoever samples), the value for index i. Its
   * parameters are read once, when it is set up for a step.
   */
  dist(node: Node, path: Path, site: Site): (rt: Runtime, d: Draws) => (i: number) => number {
    const arg = (name: string): Num => {
      const at = argPath(path, name);
      const f = this.num(node.args![name], at, site);
      return (rt) => rt.finite(f(rt), at);
    };
    switch (node.op) {
      case 'dist.same': {
        const v = arg('v');
        return (rt) => {
          const x = v(rt);
          return () => x;
        };
      }
      case 'dist.uniform': {
        const lo = arg('lo');
        const hi = arg('hi');
        return (rt, d) => {
          const a = lo(rt);
          const b = hi(rt);
          return (i) => a + (b - a) * d.uniform(i);
        };
      }
      case 'dist.normal': {
        const m = arg('m');
        const s = arg('s');
        return (rt, d) => {
          const mean = m(rt);
          const spread = s(rt);
          return (i) => mean + spread * d.normal(i);
        };
      }
      case 'dist.exponential': {
        const mean = arg('mean');
        return (rt, d) => {
          const mu = Math.max(0, mean(rt));
          // −log(1 − u): Exp(1), times the mean (×1 is exact)
          return (i) => -log(1 - d.uniform(i)) * mu;
        };
      }
      case 'dist.lognormal': {
        const sigma = arg('sigma');
        return (rt, d) => {
          const s = Math.max(0, sigma(rt));
          return (i) => exp(s * d.normal(i));
        };
      }
      case 'dist.pareto': {
        const alpha = arg('alpha');
        const at = argPath(path, 'alpha');
        return (rt, d) => {
          let a = alpha(rt);
          if (!(a >= 0.1)) {
            rt.warn(at, 'clamped');
            a = 0.1;
          }
          // x_min = 1: (1 − u)^(−1/α)
          return (i) => exp(-log(1 - d.uniform(i)) / a);
        };
      }
      // allocations, not samples: everyone's share set at once (in a shuffled order, so who is rich has nothing
      // to do with index or place), then read square by square
      case 'alloc.classes': {
        const q = arg('q');
        const share = arg('s');
        return (rt, d) => {
          const n = rt.world.n;
          const top = Math.min(n - 1, Math.max(1, Math.round(q(rt) * n)));
          const s = Math.min(1, Math.max(0, share(rt)));
          const order = shuffledOrder(n, d);
          const w = new Float64Array(n);
          for (let i = 0; i < n; i++) w[order[i]] = i < top ? (s * n) / top : ((1 - s) * n) / (n - top);
          return (i) => w[i];
        };
      }
      case 'alloc.oligarch': {
        const share = arg('s');
        return (rt, d) => {
          const n = rt.world.n;
          const s = Math.min(1, Math.max(0, share(rt)));
          const w = new Float64Array(n).fill(((1 - s) * n) / (n - 1));
          w[d.below(n, 0)] = s * n;
          return (i) => w[i];
        };
      }
      case 'alloc.country': {
        const lorenz = lorenzOf(COUNTRIES[node.f!.country]);
        return (rt, d) => {
          const n = rt.world.n;
          const order = shuffledOrder(n, d);
          const w = new Float64Array(n);
          // the poorest-ranked first: each takes its slice of the curve
          for (let p = 0; p < n; p++) w[order[p]] = n * (lorenz((p + 1) / n) - lorenz(p / n));
          return (i) => w[i];
        };
      }
      case 'dist.clip': {
        const inner = this.dist(node.args!.d, argPath(path, 'd'), site);
        const lo = arg('lo');
        const hi = arg('hi');
        return (rt, d) => {
          const draw = inner(rt, d);
          const a = lo(rt);
          const b = hi(rt);
          return (i) => Math.min(b, Math.max(a, draw(i)));
        };
      }
      default:
        throw new RangeError(`${path}: ${node.op} is not a distribution`);
    }
  }

  private debt(node: Node, path: Path): (rt: Runtime) => void {
    const site = this.site();
    const at = argPath(path, 'd');
    const d = this.num(node.args!.d, at, site);
    return (rt) => {
      rt.beginSite(site);
      const value = rt.finite(d(rt), at);
      if (value < 0) rt.warn(at, 'clamped');
      rt.world.debt = Math.max(0, value);
    };
  }

  // ——— economy ———

  private trade(node: Node, path: Path, views: (rt: Runtime, gap: number) => void = () => {}): (rt: Runtime) => void {
    const site = this.site();
    const [pairStep, pairAt] = stepOf(node, path, 'trade.pair');
    const [flipStep, flipAt] = stepOf(node, path, 'trade.flip');
    const [payStep, payAt] = stepOf(node, path, 'trade.pay');
    const pairing = this.pairing(pairStep.args!.pair, argPath(pairAt, 'pair'), site);
    const split = payStep.args!.stake.op === 'stake.split';
    const coinPath = argPath(flipAt, 'coin');
    const stakePath = argPath(payAt, 'stake');
    // a split ignores the coin: its expression is never evaluated
    const coin = split ? null : this.num(flipStep.args!.coin, coinPath, site);
    const stake = split ? null : this.num(payStep.args!.stake, stakePath, site);
    /** The pairs in rt.pairs trade, their coins and splits drawn from (keys, occurrence). */
    const play = (rt: Runtime, count: number, occurrence: number, keys: { coin: Key; split: Key }, base = 0) => {
      const world = rt.world;
      const w = world.w;
      const pairs = rt.pairs;
      const move = rt.onMove;
      if (split) {
        const d = rt.draws.split.at(rt.seed, keys.split, world.round, occurrence);
        for (let p = 0; p < count; p++) {
          const i = pairs[2 * p];
          const j = pairs[2 * p + 1];
          const ui = world.inplay(i);
          const uj = world.inplay(j);
          const delta = d.uniform(base + p) * (ui + uj) - ui;
          w[i] += delta;
          w[j] -= delta;
          if (move && delta !== 0) delta > 0 ? move('trade', j, i, delta) : move('trade', i, j, -delta);
        }
      } else {
        const d = rt.draws.coin.at(rt.seed, keys.coin, world.round, occurrence);
        for (let p = 0; p < count; p++) {
          const i = pairs[2 * p];
          const j = pairs[2 * p + 1];
          const iPoorer = w[i] < w[j] || (w[i] === w[j] && i < j);
          const poorer = iPoorer ? i : j;
          const richer = iPoorer ? j : i;
          rt.poorer = poorer;
          rt.richer = richer;
          rt.index = p;
          let chance = rt.finite(coin!(rt), coinPath);
          if (chance < 0) chance = 0;
          else if (chance > 1) chance = 1;
          const poorerWins = d.uniform(base + p) < chance;
          const winner = poorerWins ? poorer : richer;
          const loser = poorerWins ? richer : poorer;
          rt.winner = winner;
          rt.loser = loser;
          const s = Math.max(0, Math.min(rt.finite(stake!(rt), stakePath), world.inplay(loser)));
          w[winner] += s;
          w[loser] -= s;
          if (move && s > 0) move('trade', loser, winner, s);
        }
      }
      const gain = world.gain;
      const start = world.start;
      for (let k = 0; k < world.n; k++) gain[k] = w[k] - start[k];
    };
    if (!this.traded) {
      this.traded = true;
      const within = pairStep.args!.pair.args?.within;
      if (pairStep.args!.pair.op === 'pair.match' && (!within || within.op === 'group.all'))
        this.peek = (rt) => {
          const order = Int32Array.from({ length: rt.world.n }, (_, i) => i);
          shuffle(order, order.length, new Draws().at(rt.seed, STREAM.pair, rt.world.round, 0));
          return order;
        };
    }
    // the console's `trade k`: k pairs drawn one after another, traded by this block's coin and stake. They are
    // numbered through the round, so `trade 1` six times is `trade 6`.
    this.consoleTrade ??= (rt, k) => {
      rt.beginSite(site);
      const n = rt.world.n;
      const chunk = Math.max(1, n >> 1);
      for (let done = 0; done < k; ) {
        const count = Math.min(chunk, k - done);
        const base = rt.consoleRuns;
        const d = rt.draws.pair.at(rt.seed, STREAM.consolePair, rt.world.round, 0);
        for (let p = 0; p < count; p++) {
          const i = d.below(n, base + p, 0);
          let j = d.below(n - 1, base + p, 1);
          if (j >= i) j++;
          rt.pairs[2 * p] = i;
          rt.pairs[2 * p + 1] = j;
        }
        play(rt, count, 0, CONSOLE_KEYS, base);
        rt.consoleRuns += count;
        done += count;
      }
    };
    return (rt) => {
      views(rt, 0);
      const occurrence = rt.kindRuns.trade++;
      rt.beginSite(site);
      const count = pairing(rt, occurrence);
      views(rt, 1);
      views(rt, 2);
      play(rt, count, occurrence, MAIN_KEYS);
      views(rt, 3);
    };
  }

  /** The pairing option: fills rt.pairs with (i, j) pairs and returns how many. */
  private pairing(node: Node, path: Path, site: Site): (rt: Runtime, occurrence: number) => number {
    switch (node.op) {
      case 'pair.draw':
        return (rt, occurrence) => {
          const n = rt.world.n;
          const d = rt.draws.pair.at(rt.seed, STREAM.pair, rt.world.round, occurrence);
          const count = n >> 1;
          for (let p = 0; p < count; p++) {
            const i = d.below(n, p, 0);
            let j = d.below(n - 1, p, 1);
            if (j >= i) j++;
            rt.pairs[2 * p] = i;
            rt.pairs[2 * p + 1] = j;
          }
          return count;
        };
      case 'pair.near': {
        const radiusAt = argPath(path, 'r');
        const radius = this.num(node.args!.r, radiusAt, site);
        return (rt, occurrence) => {
          const world = rt.world;
          const side = world.side;
          const r = Math.min(Math.max(0, Math.floor(rt.finite(radius(rt), radiusAt))), side >> 1);
          const d = rt.draws.pair.at(rt.seed, STREAM.pair, world.round, occurrence);
          return greedyPairs(rt, d, (a) => {
            const x = world.cell[a] % side;
            const y = (world.cell[a] - x) / side;
            const stamp = rt.nextStamp();
            let c = 0;
            for (let dy = -r; dy <= r; dy++) {
              const row = ((((y + dy) % side) + side) % side) * side;
              for (let dx = -r; dx <= r; dx++) {
                const cell = row + ((((x + dx) % side) + side) % side);
                if (rt.stamp[cell] === stamp) continue;
                rt.stamp[cell] = stamp;
                const b = world.occupant[cell];
                if (b >= 0 && b !== a && !rt.matched[b]) rt.candidates[c++] = b;
              }
            }
            return c;
          });
        };
      }
      case 'pair.similar': {
        const ranksAt = argPath(path, 'k');
        const ranks = this.num(node.args!.k, ranksAt, site);
        return (rt, occurrence) => {
          const n = rt.world.n;
          const k = Math.max(0, Math.floor(rt.finite(ranks(rt), ranksAt)));
          const sorted = rt.snap.sortedAgents();
          const d = rt.draws.pair.at(rt.seed, STREAM.pair, rt.world.round, occurrence);
          return greedyPairs(rt, d, (a) => {
            const at = rt.snap.positionOf(a);
            let c = 0;
            for (let q = Math.max(0, at - k); q <= Math.min(n - 1, at + k); q++) {
              const b = sorted[q];
              if (b !== a && !rt.matched[b]) rt.candidates[c++] = b;
            }
            return c;
          });
        };
      }
      default: {
        // pair.match: a random matching, among a group (the others sit the round out)
        const within = node.args?.within;
        if (!within || within.op === 'group.all')
          return (rt, occurrence) => {
            const n = rt.world.n;
            const order = rt.pairs;
            for (let i = 0; i < n; i++) order[i] = i;
            shuffle(order, n, rt.draws.pair.at(rt.seed, STREAM.pair, rt.world.round, occurrence));
            return n >> 1; // with N odd the last one sits out
          };
        const member = this.group(within, argPath(path, 'within'), site);
        return (rt, occurrence) => {
          const n = rt.world.n;
          const order = rt.pairs;
          let m = 0;
          for (let i = 0; i < n; i++) if (member(rt, i)) order[m++] = i;
          shuffle(order, m, rt.draws.pair.at(rt.seed, STREAM.pair, rt.world.round, occurrence));
          return m >> 1;
        };
      }
    }
  }

  private grow(node: Node, path: Path): (rt: Runtime) => void {
    const site = this.site();
    const muAt = argPath(path, 'mu');
    const sigmaAt = argPath(path, 'sigma');
    const mu = this.num(node.args!.mu, muAt, site);
    const sigma = this.num(node.args!.sigma, sigmaAt, site);
    return (rt) => {
      const occurrence = rt.kindRuns.grow++;
      rt.beginSite(site);
      const world = rt.world;
      const n = world.n;
      const factor = rt.values;
      const d = rt.draws.grow.at(rt.seed, STREAM.grow, world.round, occurrence);
      for (let k = 0; k < n; k++) {
        rt.me = k;
        rt.index = k;
        const m = rt.finite(mu(rt), muAt);
        const s = rt.finite(sigma(rt), sigmaAt);
        const f = exp(m - (s * s) / 2 + s * d.normal(k));
        factor[k] = Number.isFinite(f) ? f : (rt.warn(path, 'not-finite'), 1);
      }
      // grow scales w + D, so nobody falls below −D (at D = 0, the spec's w · e^…). The step is worked out first
      // and committed only if its mean can carry the units: positive and finite (review MB2).
      const w = world.w;
      const debt = world.debt;
      let sum = 0;
      for (let k = 0; k < n; k++) sum += factor[k] = (w[k] + debt) * factor[k] - debt;
      const mean = (sum + world.pot) / n;
      if (!(mean > 0) || !Number.isFinite(mean)) {
        rt.warn(path, 'collapse');
        return;
      }
      w.set(factor);
      renormalise(world, mean);
    };
  }

  private tax(node: Node, path: Path): (rt: Runtime) => void {
    const site = this.site();
    const at = argPath(path, 'tau');
    const tau = this.num(node.args!.tau, at, site);
    return (rt) => {
      rt.beginSite(site);
      const world = rt.world;
      const w = world.w;
      const owed = rt.values;
      // every τ from the state before any is taken
      for (let k = 0; k < world.n; k++) {
        rt.me = k;
        rt.index = k;
        const t = rt.finite(tau(rt), at);
        owed[k] = Math.max(0, Math.min(t, w[k] + world.debt));
      }
      let pot = world.pot;
      for (let k = 0; k < world.n; k++) {
        w[k] -= owed[k];
        pot += owed[k];
        if (rt.onMove && owed[k] > 0) rt.onMove('tax', k, POT, owed[k]);
      }
      world.pot = pot;
    };
  }

  private give(node: Node, path: Path): (rt: Runtime) => void {
    const site = this.site();
    const at = argPath(path, 'r');
    const weight = this.num(node.args!.r, at, site);
    return (rt) => {
      rt.kindRuns.give++;
      rt.beginSite(site);
      const world = rt.world;
      const n = world.n;
      const w = world.w;
      const r = rt.values;
      let top = 0;
      for (let k = 0; k < n; k++) {
        rt.me = k;
        rt.index = k;
        r[k] = Math.max(0, rt.finite(weight(rt), at));
        if (r[k] > top) top = r[k];
      }
      // weights scaled by the largest first, so their sum never overflows (review MB6); weights of 1 stay 1
      let sum = 0;
      if (top > 0) for (let k = 0; k < n; k++) sum += r[k] /= top;
      const pot = world.pot;
      for (let k = 0; k < n; k++) {
        const share = sum > 0 ? (pot * r[k]) / sum : pot / n; // all zero: equal shares
        w[k] += share;
        if (rt.onMove && share > 0) rt.onMove('give', POT, k, share);
      }
      world.pot = 0;
    };
  }

  private move(node: Node, path: Path): (rt: Runtime) => void {
    const site = this.site();
    const at = argPath(path, 'v');
    const chance = this.num(node.args!.v, at, site);
    return (rt) => {
      const occurrence = rt.kindRuns.move++;
      rt.beginSite(site);
      const world = rt.world;
      const side = world.side;
      const d = rt.draws.move.at(rt.seed, STREAM.move, world.round, occurrence);
      for (let k = 0; k < world.n; k++) {
        rt.me = k;
        rt.index = k;
        if (!(d.uniform(k, 0) < rt.finite(chance(rt), at))) continue;
        const cell = world.cell[k];
        const x = cell % side;
        const y = (cell - x) / side;
        const stamp = rt.nextStamp();
        let c = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const next = ((y + dy + side) % side) * side + ((x + dx + side) % side);
            if (rt.stamp[next] === stamp) continue;
            rt.stamp[next] = stamp;
            if (world.occupant[next] < 0) rt.candidates[c++] = next;
          }
        }
        if (c === 0) continue;
        const target = rt.candidates[d.below(c, k, 1)];
        world.occupant[cell] = -1;
        world.occupant[target] = k;
        world.cell[k] = target;
      }
    };
  }

  // ——— expressions ———

  num(node: Node, path: Path, site: Site): Num {
    const arg = (name: string): Num => this.num(node.args![name], argPath(path, name), site);
    switch (node.op) {
      case 'num':
      case 'pct': {
        const v = node.v!;
        return () => v;
      }
      case 'val.prop':
        return this.prop(node.f!.prop as Prop, node.f!.who as Who, site);
      case 'panel.slider': {
        const name = node.f!.name;
        const lo = arg('min');
        const hi = arg('max');
        const start = arg('start');
        return (rt) => Math.min(Math.max(rt.sliders.get(name) ?? start(rt), lo(rt)), hi(rt));
      }
      case 'stat.of': {
        // the group's values, measured once per visit of the site: as the step began, like a global
        const stat = node.f!.stat as Stat;
        const prop = node.f!.prop as Prop;
        const over = this.group(node.args!.over, argPath(path, 'over'), site);
        if (prop === 'rank') site.needsSnap = true;
        const valueOf = (rt: Runtime, k: number): number => {
          const world = rt.world;
          switch (prop) {
            case 'wealth':
              return world.w[k];
            case 'inplay':
              return world.inplay(k);
            case 'rank':
              return rt.snap.rank(k);
            case 'talent':
              return world.talent[k];
            case 'thrift':
              return world.thrift[k];
            default:
              return world.gain[k];
          }
        };
        let at = -1;
        let result = 0;
        const measure = (rt: Runtime): void => {
          at = rt.visit;
          const n = rt.world.n;
          const v: number[] = [];
          const w: number[] = [];
          let all = prop === 'wealth' ? rt.world.pot : 0;
          for (let k = 0; k < n; k++) {
            const x = valueOf(rt, k);
            all += x;
            if (!over(rt, k)) continue;
            v.push(x);
            w.push(rt.world.w[k]);
          }
          result = statOf(stat, Float64Array.from(v), all, Float64Array.from(w), n);
        };
        // measured as the site begins, whichever pair or branch reads it first (review 2026-10-20, finding 7)
        site.begins.push(measure);
        return (rt) => {
          if (rt.visit !== at) measure(rt);
          return rt.finite(result, path);
        };
      }
      case 'val.global': {
        const name = node.f!.name as Global;
        if (name !== 'n' && name !== 'round' && name !== 'total' && name !== 'pot') site.needsSnap = true;
        return (rt) => rt.snap.global(name);
      }
      case 'op.arith': {
        const a = arg('a');
        const b = arg('b');
        switch (node.f!.op) {
          case 'add':
            return (rt) => rt.finite(a(rt) + b(rt), path);
          case 'sub':
            return (rt) => rt.finite(a(rt) - b(rt), path);
          case 'mul':
            return (rt) => rt.finite(a(rt) * b(rt), path);
          default:
            return (rt) => rt.finite(a(rt) / b(rt), path);
        }
      }
      case 'op.fn':
      case 'op.fn2': {
        const a = arg('a');
        switch (node.f!.fn) {
          case 'min': {
            const b = arg('b');
            return (rt) => Math.min(a(rt), b(rt));
          }
          case 'max': {
            const b = arg('b');
            return (rt) => Math.max(a(rt), b(rt));
          }
          case 'power': {
            const b = arg('b');
            return (rt) => rt.finite(pow(a(rt), b(rt)), path);
          }
          case 'abs':
            return (rt) => Math.abs(a(rt));
          case 'log':
            return (rt) => rt.finite(log(a(rt)), path);
          case 'exp':
            return (rt) => rt.finite(exp(a(rt)), path);
          default:
            return (rt) => rt.finite(sqrt(a(rt)), path);
        }
      }
      case 'op.clamp': {
        const x = arg('x');
        const lo = arg('lo');
        const hi = arg('hi');
        return (rt) => Math.min(Math.max(x(rt), lo(rt)), hi(rt));
      }
      case 'op.sample': {
        // keyed by this block's place: its draws are its own, index by index (a square, a pair), round by round
        const draws = new Draws();
        site.randoms.push({ draws, key: keyOf(path) });
        const dist = this.dist(node.args!.d, argPath(path, 'd'), site);
        return (rt) => dist(rt, draws)(rt.index);
      }
      case 'op.if': {
        const c = this.bool(node.args!.c, argPath(path, 'c'), site);
        const a = arg('a');
        const b = arg('b');
        return (rt) => (c(rt) ? a(rt) : b(rt));
      }
      // coin: p = P(the poorer wins)
      case 'coin.fair':
        return () => 0.5;
      case 'coin.strength': {
        const b = arg('b');
        // no strength (a literal 0): p = ½ + b exactly, the tanh form's value without its rounding (fair, a tilt)
        const strength = node.args!.s;
        if (strength.op === 'num' && strength.v === 0) return (rt) => 0.5 + b(rt);
        const s = arg('s');
        return (rt) => {
          // each partner's strength is its own: read as that square, drawing at its index
          const me = rt.me;
          const index = rt.index;
          rt.me = rt.index = rt.poorer;
          const poorer = s(rt);
          rt.me = rt.index = rt.richer;
          const richer = s(rt);
          rt.me = me;
          rt.index = index;
          const y = 2 * b(rt);
          if (y >= 1) return 1;
          if (y <= -1) return 0;
          return 0.5 * (1 + tanh(poorer - richer + atanh(y)));
        };
      }
      // stake: whose wealth sizes it; capped at the loser's in-play wealth by the trade
      case 'stake.share': {
        const beta = arg('beta');
        return node.f!.of === 'loser'
          ? (rt) => beta(rt) * rt.world.inplay(rt.loser)
          : (rt) => beta(rt) * Math.min(rt.world.inplay(rt.poorer), rt.world.inplay(rt.richer));
      }
      case 'stake.fixed':
        return arg('a');
      // tax: what is taxed × who pays (owner, 2026-10-18: a tax on wealth sees w + D)
      // take: what each square owes, by card; then only from the group
      case 'take.wealth':
      case 'take.above':
      case 'take.gains':
      case 'take.flat': {
        let base: Num;
        if (node.op === 'take.flat') base = arg('a');
        else {
          const rate = arg('rate');
          if (node.op === 'take.above') {
            const x = arg('x');
            base = (rt) => rate(rt) * Math.max(rt.world.w[rt.me] - x(rt), 0);
          } else if (node.op === 'take.gains') base = (rt) => rate(rt) * Math.max(rt.world.gain[rt.me], 0);
          // a tax on wealth sees w + D (owner, 2026-10-18)
          else base = (rt) => rate(rt) * (rt.world.w[rt.me] + rt.world.debt);
        }
        const from = node.args!.from;
        if (!from || from.op === 'group.all') return base;
        const member = this.group(from, argPath(path, 'from'), site);
        return (rt) => (member(rt, rt.me) ? base(rt) : 0);
      }
      // give: how × to whom, a weight for each agent
      case 'give.to': {
        const how: Num = node.f!.how === 'wealth' ? (rt) => Math.max(rt.world.w[rt.me], 0) : () => 1;
        const to = node.args!.to;
        if (!to || to.op === 'group.all') return how;
        const member = this.group(to, argPath(path, 'to'), site);
        return (rt) => (member(rt, rt.me) ? how(rt) : 0);
      }
      default:
        throw new RangeError(`${path}: ${node.op} is not a number`);
    }
  }

  /** A group: membership of square k, on the site's snapshot (ranks as the step began). */
  group(node: Node, path: Path, site: Site): Member {
    /** How many: ⌈qN⌉ (at least `least`), q read once per visit of the site, at the scalar draw index. */
    const share = (name: string, least: number) => {
      const q = this.num(node.args![name], argPath(path, name), site);
      let at = -1;
      let count = 0;
      return (rt: Runtime) => {
        if (rt.visit !== at) {
          at = rt.visit;
          const index = rt.index;
          rt.index = 0;
          const n = rt.world.n;
          count = Math.min(n, Math.max(least, Math.ceil(rt.finite(q(rt), argPath(path, name)) * n)));
          rt.index = index;
        }
        return count;
      };
    };
    switch (node.op) {
      case 'group.all':
        return () => true;
      case 'group.richest': {
        const count = share('q', 1);
        site.needsSnap = true;
        return (rt, k) => rt.snap.positionOf(k) >= rt.world.n - count(rt);
      }
      case 'group.poorest': {
        const count = share('q', 1);
        site.needsSnap = true;
        return (rt, k) => rt.snap.positionOf(k) < count(rt);
      }
      case 'group.random':
      case 'group.one': {
        // the `count` squares with the smallest draws, drawn once per visit of the site
        // exactly ⌈qN⌉: none at q = 0 (the ranked groups keep at least one)
        const count = node.op === 'group.one' ? () => 1 : share('q', 0);
        const draws = new Draws();
        site.randoms.push({ draws, key: keyOf(path) });
        let at = -1;
        let chosen = new Uint8Array(0);
        return (rt, k) => {
          if (rt.visit !== at) {
            at = rt.visit;
            const n = rt.world.n;
            if (chosen.length !== n) chosen = new Uint8Array(n);
            chosen.fill(0);
            const u = Float64Array.from({ length: n }, (_, i) => draws.uniform(i));
            const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => u[a] - u[b] || a - b);
            const c = count(rt);
            for (let r = 0; r < c; r++) chosen[order[r]] = 1;
          }
          return chosen[k] === 1;
        };
      }
      case 'group.where': {
        const c = this.bool(node.args!.c, argPath(path, 'c'), site);
        return (rt, k) => {
          const me = rt.me;
          const index = rt.index;
          rt.me = rt.index = k;
          const inside = c(rt);
          rt.me = me;
          rt.index = index;
          return inside;
        };
      }
      case 'group.combine': {
        const a = this.group(node.args!.a, argPath(path, 'a'), site);
        const b = this.group(node.args!.b, argPath(path, 'b'), site);
        const op = node.f!.op;
        return op === 'and' ? (rt, k) => a(rt, k) && b(rt, k) : op === 'or' ? (rt, k) => a(rt, k) || b(rt, k) : (rt, k) => a(rt, k) && !b(rt, k);
      }
      case 'group.named': {
        const name = node.f!.name;
        const named = this.groups.get(name);
        if (!named || this.naming.has(name)) throw new RangeError(`${path}: no group named ${name} above`);
        this.naming.add(name);
        try {
          return this.group(named.node, named.path, site);
        } finally {
          this.naming.delete(name);
        }
      }
      default:
        throw new RangeError(`${path}: ${node.op} is not a group`);
    }
  }

  bool(node: Node, path: Path, site: Site): Bool {
    switch (node.op) {
      case 'op.cmp': {
        const a = this.num(node.args!.a, argPath(path, 'a'), site);
        const b = this.num(node.args!.b, argPath(path, 'b'), site);
        switch (node.f!.op) {
          case 'lt':
            return (rt) => a(rt) < b(rt);
          case 'le':
            return (rt) => a(rt) <= b(rt);
          case 'eq':
            return (rt) => a(rt) === b(rt);
          case 'ge':
            return (rt) => a(rt) >= b(rt);
          default:
            return (rt) => a(rt) > b(rt);
        }
      }
      case 'op.logic': {
        const a = this.bool(node.args!.a, argPath(path, 'a'), site);
        const b = this.bool(node.args!.b, argPath(path, 'b'), site);
        return node.f!.op === 'and' ? (rt) => a(rt) && b(rt) : (rt) => a(rt) || b(rt);
      }
      case 'op.not': {
        const a = this.bool(node.args!.a, argPath(path, 'a'), site);
        return (rt) => !a(rt);
      }
      default:
        throw new RangeError(`${path}: ${node.op} is not a condition`);
    }
  }

  private prop(prop: Prop, who: Who, site: Site): Num {
    const agent: (rt: Runtime) => number =
      who === 'me'
        ? (rt) => rt.me
        : who === 'poorer'
          ? (rt) => rt.poorer
          : who === 'richer'
            ? (rt) => rt.richer
            : who === 'winner'
              ? (rt) => rt.winner
              : (rt) => rt.loser;
    switch (prop) {
      case 'wealth':
        return (rt) => rt.world.w[agent(rt)];
      case 'inplay':
        return (rt) => rt.world.inplay(agent(rt));
      case 'rank':
        site.needsSnap = true;
        return (rt) => rt.snap.rank(agent(rt));
      case 'talent':
        return (rt) => rt.world.talent[agent(rt)];
      case 'thrift':
        return (rt) => rt.world.thrift[agent(rt)];
      default:
        return (rt) => rt.world.gain[agent(rt)];
    }
  }
}

/** 0 … n−1 in a shuffled order. */
function shuffledOrder(n: number, d: Draws): Int32Array {
  const order = Int32Array.from({ length: n }, (_, i) => i);
  shuffle(order, n, d);
  return order;
}

/** A step block's step: the node and its path. */
function stepOf(node: Node, path: Path, op: string): [Node, Path] {
  const i = node.body!.findIndex((n) => n.op === op);
  return [node.body![i], bodyPath(path, i)];
}

/** Fisher–Yates over the first n entries, step a drawing from index a. */
function shuffle(order: Int32Array, n: number, d: Draws): void {
  for (let a = n - 1; a > 0; a--) {
    const b = d.below(a + 1, a, 0);
    const t = order[a];
    order[a] = order[b];
    order[b] = t;
  }
}

/**
 * A greedy random maximal matching: agents in a shuffled order (draws k = 0); each unmatched one takes a uniform
 * unmatched candidate (draw k = 1 at its own index) from those `candidates` lists into rt.candidates.
 */
function greedyPairs(rt: Runtime, d: Draws, candidates: (a: number) => number): number {
  const n = rt.world.n;
  const order = rt.order;
  for (let i = 0; i < n; i++) order[i] = i;
  shuffle(order, n, d);
  rt.matched.fill(0);
  let count = 0;
  for (let s = 0; s < n; s++) {
    const a = order[s];
    if (rt.matched[a]) continue;
    const c = candidates(a);
    if (c === 0) continue;
    const b = rt.candidates[d.below(c, a, 1)];
    rt.matched[a] = rt.matched[b] = 1;
    rt.pairs[2 * count] = a;
    rt.pairs[2 * count + 1] = b;
    count++;
  }
  return count;
}

/** After grow: back to units of the new mean (Σw + P = N), the debt limit and W/W₀ carried along. */
function renormalise(world: World, mean: number): void {
  const w = world.w;
  for (let k = 0; k < world.n; k++) {
    w[k] /= mean;
    world.start[k] /= mean;
    world.gain[k] /= mean;
  }
  world.pot /= mean;
  world.debt /= mean;
  world.total *= mean;
}
