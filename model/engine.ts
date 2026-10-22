/**
 * The engine's face: a Run plays one program from one seed. The same program, seed and round give the same
 * state, bit for bit, in every browser (spec, Engine semantics); any round is reached by replaying from round 0.
 */
import type { Path, Program } from './ast.ts';
import { Runtime, compile, execute, giftNow, levyNow, press, whens, type Compiled, type MoveKind, type Signal, type ViewListener, type WarningCode } from './compile.ts';
import { digest } from './rng.ts';
import { measure, type Measures } from './stats.ts';
import { validate, type Issue } from './validate.ts';
import type { World } from './world.ts';

/**
 * Bumped by any change to any output of any preset (the golden hashes in tests/model/engine.test.ts fail first).
 * Old versions are to stay callable once there is a second one.
 */
export const ENGINE_VERSION = 1;

/** A program that does not validate. */
export class ProgramError extends Error {
  readonly issues: readonly Issue[];
  constructor(issues: readonly Issue[]) {
    super(`the program has ${issues.length} issue${issues.length === 1 ? '' : 's'}: ${issues.map((i) => `${i.path || 'program'} ${i.code}`).join(', ')}`);
    this.issues = issues;
  }
}

type Status = 'running' | 'paused' | 'waiting' | 'ended';

/** What the reader does on the panel: moves a slider, presses a button. */
export type InputEvent =
  | { readonly kind: 'slider'; readonly name: string; readonly value: number }
  | { readonly kind: 'button'; readonly name: string }
  // the console's one-offs: k trades by the program's first trade block, a levy shared equally, a gift
  | { readonly kind: 'trades'; readonly k: number }
  | { readonly kind: 'levy'; readonly rate: number }
  | { readonly kind: 'gift'; readonly from: number; readonly to: number; readonly amount: number }
  // something the view does that a replay must redo at the same point (the stage's `equalize`); the economy ignores it
  | { readonly kind: 'note'; readonly text: string };

/**
 * An input and the step it came before. Steps, not rounds: a wait or a pause stops the run inside a round, and
 * an input given there must replay there. With the log, a run is a function of (program, seed, inputs, round).
 */
export interface Input {
  readonly step: number;
  readonly event: InputEvent;
}

/** The outputs of one moment (spec, Outputs per round). */
interface Outputs extends Measures {
  readonly round: number;
  /** sₖ = wₖ / W. */
  readonly shares: Float64Array;
  /** W / W₀. */
  readonly growth: number;
}

export class Run {
  readonly program: Program;
  readonly seed: number;
  private readonly compiled: Compiled;
  private rt!: Runtime;
  private runner!: Generator<Signal, void, void>;
  private state: Status = 'running';
  private listener: ((kind: MoveKind, from: number, to: number, amount: number) => void) | null = null;
  private viewer: ViewListener | null = null;
  /** Told of each note in the log as it is applied, live or replayed. */
  onNote: ((text: string) => void) | null = null;
  private log: Input[] = [];
  /** What the setup showed while no one listened: told to the first listener. */
  private early: Parameters<ViewListener>[] = [];
  /** Inputs of the log already applied, and steps taken (the setup counts as one). */
  private applied = 0;
  private stepCount = 0;

  /** Throws ProgramError if the program has issues. Seed: an unsigned 32-bit integer. */
  constructor(program: Program, seed = 1) {
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) throw new RangeError('seed must be an unsigned 32-bit integer');
    const issues = validate(program);
    if (issues.length) throw new ProgramError(issues);
    this.program = program;
    this.seed = seed;
    this.compiled = compile(program);
    this.reset();
  }

  /** Back to round 0: setup done, nothing traded. The inputs stay in the log (replayed as they come), unless dropped. */
  reset(keepInputs = true): void {
    if (!keepInputs) this.log = [];
    this.rt = new Runtime(this.seed, this.compiled.sites);
    this.rt.onMove = this.listener;
    // what the setup shows (its camera blocks, a `when` true from the start) reaches a listener attached later too
    this.early = [];
    this.rt.onView = this.viewer ?? ((...view) => this.early.push(view));
    this.runner = execute(this.rt, this.compiled);
    this.runner.next(); // runs the setup blocks, stops at 'setup'
    whens(this.rt, this.compiled);
    this.rt.onView = this.viewer;
    this.applied = 0;
    this.stepCount = 1;
    this.state = 'running';
  }

  /** The inputs so far, in order. */
  get inputs(): readonly Input[] {
    return this.log;
  }

  /**
   * A slider moved, a button pressed or a console one-off: it takes effect now, between steps, and is kept for
   * replay (where it is applied at the same point: before the next step).
   */
  input(event: InputEvent): void {
    this.check(event);
    // after a seek back, what was logged ahead of here is a future this input replaces
    this.log.length = this.applied;
    this.log.push({ step: this.stepCount, event });
    this.applyInputs();
  }

  /** Throws unless the event is well formed (a link's log is checked the same way). */
  private check(event: InputEvent): void {
    const text = (x: unknown) => typeof x === 'string' && x.length > 0 && x.length <= 40;
    switch (event?.kind) {
      case 'slider':
        if (!text(event.name) || !Number.isFinite(event.value)) throw new RangeError('a slider input has a name and a finite value');
        return;
      case 'button':
        if (!text(event.name)) throw new RangeError('a button input has a name');
        return;
      case 'trades':
        if (!(Number.isSafeInteger(event.k) && event.k >= 0 && event.k <= 10_000_000)) throw new RangeError('trades must be a whole number up to 10,000,000');
        return;
      case 'levy':
        if (!(event.rate >= 0 && event.rate <= 1)) throw new RangeError('a levy rate is in [0, 1]');
        return;
      case 'gift': {
        const n = this.rt.world.n;
        const ok = (i: number) => Number.isInteger(i) && i >= 0 && i < n;
        if (!ok(event.from) || !ok(event.to) || !(event.amount >= 0 && Number.isFinite(event.amount))) throw new RangeError('a gift is from and to an agent, a finite amount');
        return;
      }
      case 'note':
        if (!text(event.text)) throw new RangeError('a note has a text');
        return;
      default:
        throw new RangeError('unknown input');
    }
  }

  /** Told of each observer as it runs (camera and panel blocks: what the view should do now). Kept across resets. */
  set onView(listener: ViewListener | null) {
    this.viewer = listener;
    this.rt.onView = listener;
    if (!listener) return;
    const early = this.early;
    this.early = [];
    for (const view of early) listener(...view);
  }

  /** Told of every change of hands (amounts in units of mean wealth; −1 for the pot). */
  set onMove(listener: ((kind: MoveKind, from: number, to: number, amount: number) => void) | null) {
    this.listener = listener;
    this.rt.onMove = listener;
  }

  /**
   * The pairs the next round will trade in (partners side by side; with N odd the last sits out), or null when
   * they cannot be known ahead (pairs that depend on the state, or a program whose round does not start with a
   * trade of random pairs).
   */
  peekPairs(): Int32Array | null {
    return this.compiled.peek && this.state !== 'ended' ? this.compiled.peek(this.rt) : null;
  }

  /** Whether the next round's pairs can be known ahead (see peekPairs). */
  get pairsAhead(): boolean {
    return this.compiled.peek !== null;
  }

  /** A fresh start with this input log (a link's), ready to replay it step by step. */
  setInputs(inputs: readonly Input[]): void {
    let last = 1;
    for (const i of inputs) {
      if (!(Number.isSafeInteger(i.step) && i.step >= last)) throw new RangeError('inputs come in step order, from step 1');
      last = i.step;
      this.check(i.event);
    }
    this.log = inputs.map((i) => ({ step: i.step, event: i.event }));
    this.reset();
  }

  /** Inputs given at this point, applied now (step applies them first anyway). */
  applyPending(): void {
    this.applyInputs();
  }

  /** Steps taken since round 0 (the setup is the first). */
  get steps(): number {
    return this.stepCount;
  }

  /**
   * Back to an earlier point: the log cut to `inputs` entries, replayed to `step` silently: no moves, observers or
   * notes told (a rollback: whoever listens kept its own state of that point).
   */
  rewind(step: number, inputs: number): void {
    this.log = this.log.slice(0, inputs);
    const { listener, viewer, onNote } = this;
    this.listener = this.viewer = this.onNote = null;
    try {
      this.reset();
      while (this.stepCount < step && this.step() !== 'end');
      this.applyInputs();
    } finally {
      this.listener = listener;
      this.viewer = viewer;
      this.onNote = onNote;
      this.rt.onMove = listener;
      this.rt.onView = viewer;
      this.early = [];
    }
  }

  /** The slider values now (the ones moved; the others are at their start). */
  get sliders(): ReadonlyMap<string, number> {
    return this.rt.sliders;
  }

  /** The button a wait block waits for, or null. */
  get waitingFor(): string | null {
    return this.state === 'waiting' ? this.rt.waitingFor : null;
  }

  private applyInputs(): void {
    while (this.applied < this.log.length && this.log[this.applied].step <= this.stepCount) {
      const { event } = this.log[this.applied++];
      if (event.kind === 'slider') this.rt.sliders.set(event.name, event.value);
      else if (event.kind === 'button') press(this.rt, this.compiled, event.name);
      else if (event.kind === 'trades') this.compiled.trade?.(this.rt, event.k);
      else if (event.kind === 'levy') levyNow(this.rt, event.rate);
      else if (event.kind === 'gift') giftNow(this.rt, event.from, event.to, event.amount);
      else this.onNote?.(event.text);
    }
  }

  get world(): World {
    return this.rt.world;
  }

  get round(): number {
    return this.rt.world.round;
  }

  /** running: more rounds to come; paused: at a pause block (step continues); ended: the program has finished. */
  get status(): Status {
    return this.state;
  }

  /** Where an expression gave NaN or infinity (it counted as 0), a value was clamped, or an inner loop ran away. */
  get warnings(): ReadonlyMap<Path, WarningCode> {
    return this.rt.warnings;
  }

  /** On to the next round boundary, pause, wait or end, the inputs given so far applied first. Returns what stopped it. */
  step(): 'round' | 'pause' | 'wait' | 'end' {
    if (this.state === 'ended') return 'end';
    this.applyInputs();
    const next = this.runner.next();
    this.stepCount++;
    // the conditions looked at after every step, the last one included
    whens(this.rt, this.compiled);
    if (next.done) {
      this.state = 'ended';
      return 'end';
    }
    const signal = next.value === 'setup' ? 'round' : next.value;
    this.state = signal === 'pause' ? 'paused' : signal === 'wait' ? 'waiting' : 'running';
    return signal;
  }

  /** Up to k more rounds; stops early at a pause or the end. Returns the rounds played. */
  rounds(k: number): number {
    const from = this.round;
    while (this.round - from < k) {
      const s = this.step();
      if (s !== 'round') break;
    }
    return this.round - from;
  }

  /** Play until `round` (from round 0 again if it has passed), replaying the inputs: stops early only at the end or an unreleased wait. */
  seek(round: number): void {
    if (round < this.round) this.reset();
    // through pauses (the reader played on) and waits the log releases; a wait nothing releases stops it
    while (this.round < round) {
      const s = this.step();
      if (s === 'end' || (s === 'wait' && this.applied >= this.log.length)) break;
    }
    // inputs given at this point (after the round) belong to it
    this.applyInputs();
  }

  outputs(): Outputs {
    const world = this.rt.world;
    const m = measure(world.w, world.pot);
    const shares = new Float64Array(world.n);
    for (let k = 0; k < world.n; k++) shares[k] = world.w[k] / m.total;
    return { ...m, round: world.round, shares, growth: world.total };
  }

  /** A watched number (`panel.number` at this path) as things stand now; NaN if there is none or it is not finite. */
  evaluate(path: string): number {
    const watch = this.compiled.watches.get(path);
    if (!watch) return NaN;
    const value = this.rt.observe(watch.site, () => watch.value(this.rt));
    return Number.isFinite(value) ? value : NaN;
  }

  /** The whole state's bits as 16 hex digits: equal hashes, equal states. */
  hash(): string {
    const world = this.rt.world;
    const cells = Array.from(world.cell);
    return digest([world.round, world.pot, world.total, world.debt, ...world.w, ...world.talent, ...world.thrift, ...cells]);
  }
}

/** The issues of a program (empty: it runs). */
export { validate };
