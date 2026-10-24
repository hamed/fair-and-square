/**
 * A session: one game, one stage, one recipe, and the console that drives
 * them. Headless, so every command can be tested without a page. The page
 * (main.ts) only forwards keystrokes and pointer events and draws.
 *
 * Every command is atomic: it is parsed and checked before anything changes,
 * and if it still fails halfway everything it touched is put back.
 *
 * The game part of a session is replayable: a seed, the rules, and the game
 * commands since the last reset (`history`). That plus the recipe is the
 * share link, so a link reproduces a state to the bit.
 */
import type { FaceLook } from '../essay/face/face.ts';
import type { Input } from '../../model/engine.ts';
import { readProgram, type Program } from '../../model/ast.ts';
import { DEFAULT_RULES, Game, MAX_TRADES, stageProgram, withN, type Rules } from '../core/game.ts';
import { compile, measureOf, potRoom, type Figure } from '../core/figure.ts';
import { DEFAULT_RECIPE, PRESETS, formatRecipe, isRecipeWord, parseRecipe, type Recipe } from '../core/recipe.ts';
import { Stage } from '../core/stage.ts';
import { neffOf, statsOf } from '../core/stats.ts';
import { Transit, type MoveKind } from '../core/transit.ts';
import { POT, type Move } from '../core/transfer.ts';
import type { Live } from '../acts/track.ts';
import { afterAttach, afterCut, levelled } from '../core/aspect.ts';
import type { Scene } from '../acts/scene.ts';
import { FILL, SPLIT_FADE, envelope, line, lorenz, money, stakes, taxes, you } from '../acts/guides.ts';
import { BOX } from '../core/figure.ts';
import { WORDS } from '../words.en.ts';
import { SCRIPTS } from './scripts.ts';
import { COMMANDS, checkLook, checkRate, checkYield, checkZoom, expandPresets } from './commands.ts';

interface SessionOptions {
  readonly n?: number;
  readonly seed?: number;
  readonly rules?: Rules;
  /** A program to play instead of the stage's own (its N is its own). */
  readonly program?: Program;
  readonly recipe?: Recipe;
}

interface Script {
  readonly name: string;
  readonly lines: readonly string[];
  at: number;
  wait: number;
  until: boolean;
  /** Waiting for the play goal (`until round|gini`). */
  goal: boolean;
}

/** What a face is asked to do for a while (`face`): look at the reader, feel a feeling word, cheer, hop, rest. */
interface FaceAsk {
  readonly who: readonly number[];
  readonly what: string;
  readonly seconds: number;
}

/** A guide over the yard (`guide`): a line the reader drags across the bars, or the running total in the box. */
type Guide =
  | { kind: 'line'; f: number; moved: boolean }
  /** The running total's guide: seconds of its clock when each step began (0: not yet): the even line, the gap, the
   * triangle shaded and folded into a bar, the gap lifted into a bar over it, the labels (guides.ts `lorenz`). */
  | { kind: 'lorenz'; t: number; even: number; gap: number; tri: number; lift: number; label: number }
  | { kind: 'envelope'; t: number };

/** Where play stops, exactly (`until round k`, `until gini x`): a count, never a time, so a run is the same for everyone. */
interface Goal {
  /** round: at least this round; gini: at least this Gini; neff: N_eff down to this (or under). */
  readonly kind: 'round' | 'gini' | 'neff' | 'levy';
  readonly at: number;
  /** A levy's moment (`until levy pot|split|back`). */
  readonly mark?: string;
}

/** The view's state a checkpoint keeps beside a share link (Session.viewState). */
export interface ViewState {
  readonly fx: { trade: 'off' | 'piece' | 'toss'; tax: boolean; sync: boolean; chart: boolean };
  readonly pinned: { trade: boolean; tax: boolean };
  readonly speed: number;
  readonly veil: number;
  readonly stakes: boolean;
  readonly taxes: boolean;
  readonly divide: boolean;
  readonly glows: readonly string[];
  readonly guide: Guide | null;
  readonly badges: { round: boolean; gini: boolean; trades: boolean };
  readonly headroom: number;
  readonly you: number;
  readonly standing: boolean;
  /** Partners named (`meet i j`), the pairs they stand in, or null. */
  readonly named: readonly number[] | null;
  readonly band: readonly [number, number] | null;
  /** The charts handed to the panel so far (Learn reveals their squares). */
  readonly charted?: readonly string[];
}

/** Script-only steps: a console line containing one of these runs as a script. */
const STEP = /^(wait|until)\b/i;

const LOG_LIMIT = 400;
/**
 * Trades one hurry (Next, an act entered at once) may play to reach its goals, all of them together: the story's
 * take under a thousand; a goal the reader's own settings put out of reach (stake 0) is let go after these.
 */
export const HURRY_TRADES = 200_000;
/** Recompile a live chart at most this often while trades run, seconds. */
const LIVE_EVERY = 0.25;
/** Longest a levy waits for the room to clear the pot's spot, and a round for partners to meet, seconds. */
const CLEAR_WAIT = 3;
const MEET_WAIT = 4;
/** Longest trading waits for a chart to form, seconds. */
const FORM_WAIT = 6;
/** Seconds the squares take to spread out from a formation into wandering, before trading goes on. */
const SPREAD = 1.5;
/** Seconds the running total's curve takes to come in (`guide lorenz`). */
const LORENZ_GROW = 0.8;
/** Seconds the Gini's bars take, step by step: the triangle shaded and folded, the gap lifted over it, the labels. */
const TRI_TIME = 1.8;
/**
 * The lottery (`lottery`, owner 2026-10-22: suspense): seconds of hops, the first hop's gap and how each grows (fast,
 * then slower and slower: about 0.7 s apart at the end), and how long the last stays ringed before it is you.
 */
const LOTTERY = 6;
const DRAW_FIRST = 0.03;
const DRAW_SLOWER = 1.11;
const DRAW_LAND = 1.2;
const LIFT_TIME = 1;
const LABEL_TIME = 0.4;

export class Session {
  game: Game;
  stage: Stage;
  recipe: Recipe;
  figure: Figure;
  playing = false;
  /** Trades per second while playing; null follows N (one round a second). */
  rate: number | null = null;
  speed = 1;
  look: FaceLook | 'off' = 'manga';
  axes = false;
  /** The dev readout at the top (n, trades, fps …): off unless asked for (`hud on`). */
  hud = false;
  /** A question carried by the share link. */
  question = '';
  /** A line on the stage, from `say` (tutorials). */
  caption = '';
  /** The script running, if any. */
  script: Script | null = null;
  /** Money on its way (trade pieces, tax waves), and the wealth drawn: the game's less that. */
  transit: Transit;
  shown: Float64Array;
  /** Each person's width ÷ height as drawn: trades change it (aspect.ts), `equalize` squares everyone. */
  aspect: Float64Array;
  /** Everyone's proportions once every move the game has made has landed. */
  ahead: Float64Array;
  /** Camera: the whole yard, or (once formed) just the chart. */
  zoom: 'yard' | 'chart' = 'yard';
  /** How many characters fit across the console: help lays itself out to it. */
  columns = 80;
  /** What a drag does: push through the crowd, lift over it, or nothing. */
  drag: 'push' | 'lift' | 'off' = 'push';
  selected = -1;
  /** The partners standing together (the next round's pairs) while meeting. */
  pairs: Int32Array | null = null;
  /** Rounds the `round` command asked for, each played once its partners have met. */
  queued = 0;

  // ——— teaching: what a story (or any script) draws over the yard; generic, every one a command ———

  /** Everyone faded out (1) or shown (0), eased toward `veilTo` (`veil`). */
  veil = 0;
  veilTo = 0;
  /** All the money as one pile in the box (`money fill|split`), and the seconds since. */
  money: { mode: 'fill' | 'split'; t: number } | null = null;
  /** The next round's stakes shown on each pair (`stakes on`), and the seconds since. */
  stakes: { t: number } | null = null;
  /** Everyone's tax shown, cut and lifted, before it is paid (`taxes on`), and the seconds since. */
  taxes: { t: number } | null = null;
  /** The yard divided into four by a cross of walls (`divide`): for yards shown in its quarters. */
  divide = false;
  /** What glows (`glow`): 'stake:poorer', 'body:3', 'slider:stake', 'tab:play' … */
  glows = new Set<string>();
  /** A guide over the yard (`guide`). */
  guide: Guide | null = null;
  /** How many bodies reach the line guide, as last drawn. */
  reach = 0;
  /** Readouts in the yard's corner (`badge`): the round, the Gini. */
  badges = { round: false, gini: false, trades: false };
  /** Yard units kept free above the room, for words over the yard (`headroom`): the walls open up by it. */
  headroom = 0;
  /** Face requests (`face`), taken by the view as it draws. */
  faceAsks: FaceAsk[] = [];
  /** Who you are (`be`): a ring and a card with your rank and share; and the seconds since. */
  you: { i: number; t: number } | null = null;
  /**
   * Which experiment this is: one more each time the run begins again (Start again, New luck, a new crowd or
   * program, a rewind), so what is measured across rounds is never joined across two of them.
   */
  experiment = 0;
  /** Play stops exactly here (`until round|gini`). */
  goal: Goal | null = null;
  /** Partners stay standing together (`meet`) until a round has been played. */
  standing = false;
  /** Partners named (`meet i j`): how many pairs head `pairs`; the rest watch. Null: everyone paired. */
  partners: number | null = null;
  /** Heights the room keeps its homes between (`band`), yard units: clear of words and controls over the yard. */
  band: [number, number] | null = null;
  /** Everything at once (hurry): no beats shown, waits skipped. */
  hurrying = false;
  /** Trades a hurry may still play to reach its goals (HURRY_TRADES at its start). */
  private budget = HURRY_TRADES;
  readonly log: string[] = [];
  /** Seconds the room has been still, so a momentary pause does not count as rest. */
  private calm = 0;
  /** Milliseconds the last compile took. */
  private compileCost = 0;
  private debt = 0;
  private compiled = -1;
  private compiledFx = -1;
  private compiledAt = -Infinity;
  /** The pot's space the room was last laid out with. */
  private laidPot = 0;
  /** Seconds a levy has waited for the pot's spot, and partners for each other. */
  private clearing = 0;
  private walked = 0;
  /** Seconds a chart has been forming. */
  private forming = 0;

  constructor(options: SessionOptions = {}) {
    this.game = new Game(options.n ?? 36, options.seed ?? 1, options.program ?? options.rules ?? DEFAULT_RULES);
    this.recipe = inPlaces(options.recipe ?? DEFAULT_RECIPE, this.game.program);
    this.figure = compile(this.recipe, this.game.wealth, undefined, undefined, { cells: cellsOf(this.game) });
    this.compiled = this.game.revision;
    this.stage = new Stage(this.figure, this.game.wealth, this.game.seed);
    this.transit = new Transit(this.game.n);
    this.shown = Float64Array.from(this.game.wealth);
    this.aspect = new Float64Array(this.game.n).fill(1);
    this.ahead = new Float64Array(this.game.n).fill(1);
    this.hook();
  }

  /**
   * Every move the game makes is shown (trades while `animated` runs, levies
   * always) or, if not, takes effect on everyone's proportions at once; shown,
   * it does so as its money comes off and on (frame). Either way by the same
   * rule, so links replay to the same shapes.
   */
  private hook(): void {
    this.game.onMoves = (kind, moves) => this.moved(kind, moves);
    // growth moved the shares under moves still showing (sized on the old ones): they land now, so what is
    // drawn is what there is
    this.game.onRebase = () => {
      if (this.transit.busy) this.finishTransit();
    };
    // the view's own steps, replayed from a link at the point they were taken
    this.game.run.onNote = (text) => {
      if (text === 'equalize') this.equalize();
      // the players' money shared another way (`split`), or their duel: the gift that follows leaves them the same
      // height, each as wide as its money (owner, 2026-10-22)
      else if (text === 'split' || text === 'duel') this.levelNext = true;
    };
    // the program's observers say how the yard shows things: applied after the step that ran them
    this.game.run.onView = (op, f, members, value) => {
      this.views.push([op, f, members, value]);
      // a hold asked for stops a batch of rounds right there (playRounds)
      if (op === 'show.hold') this.holdAsked = true;
    };
  }

  /** Observers run during the last steps, still to apply. */
  private views: [string, Readonly<Record<string, string>>, Uint8Array | undefined, number | undefined][] = [];
  /** The next moves leave their two holders the same height (a `split` or `duel` note, live or replayed). */
  private levelNext = false;
  /** The console's `fx` pins how trades and levies show for this session: observers no longer change it. */
  pinned = { trade: false, tax: false };
  /** What the squares are coloured by (`show.colour`): 'none' keeps their own colours. */
  colourBy = 'none';
  /**
   * All the money trades have moved so far, each trade as a share of all the money then (owner, 2026-10-22: the
   * essay's turnover, in Play): the panel's turnover chart is how much of it each round adds.
   */
  traded = 0;
  /** Seconds since another arrangement was asked for while its squares were still on their way (null: none). */
  private reforming: number | null = null;
  /** Seconds the view still holds (`show.hold`): play waits. */
  held = 0;
  /** A hold has been asked for since the requests were last applied. */
  private holdAsked = false;
  /** Who the camera frames (`show.zoom`): a flag per square, or null for the whole yard. */
  follow: Uint8Array | null = null;
  /** Who is ringed (`show.outline`): a flag per square, as the group was when the block ran; or null. */
  highlight: Uint8Array | null = null;

  /** What the observers asked for: how trades and levies show, a pose. */
  private applyViews(): void {
    this.holdAsked = false;
    if (!this.views.length) return;
    const views = this.views;
    this.views = [];
    let recipe: Recipe | null = null;
    for (const [op, f, members, value] of views) {
      if (op === 'show.trades' && !this.pinned.trade) this.transit.trade = f.as === 'meet' ? 'toss' : f.as === 'instant' ? 'off' : 'piece';
      else if (op === 'show.tax' && !this.pinned.tax) this.transit.tax = f.as !== 'instant';
      else if (op === 'show.colour') this.colourBy = f.by ?? 'none';
      else if (op === 'show.outline') this.highlight = members ?? null;
      else if (op === 'panel.print') this.print(`${f.name}: ${value === undefined || !Number.isFinite(value) ? '—' : +value.toPrecision(6)}`);
      // each sets its own slots over what is posed (or already asked for this frame)
      else if (op === 'show.arrange') recipe = parseRecipe(`${f.layout === 'places' ? this.places : f.layout} ${f.sort}`, recipe ?? this.recipe);
      else if (op === 'show.shape') recipe = parseRecipe(f.shape, recipe ?? this.recipe);
      else if (op === 'show.size') {
        // side = wealth: the area drawn is wealth squared; all equal: one size; the rest natural sizes
        const words = f.scale === 'side' ? 'wealth squared' : f.scale === 'equal' ? 'wealth equal' : `${f.scale} natural`;
        recipe = parseRecipe(words, recipe ?? this.recipe);
      } else if (op === 'show.hold') this.held = Math.max(0, Math.min(60, value ?? 0));
      else if (op === 'show.zoom') this.follow = members && members.includes(0) ? members : null;
    }
    if (recipe && formatRecipe(recipe) !== formatRecipe(this.recipe)) this.pose(recipe);
  }

  private animating = false;
  /** Trades now are a met round's: tossed. */
  private tossing = false;
  /** The trade now is the players' duel: their stakes off the sides facing each other (acts/index.ts `facing`). */
  private duelling = false;
  private together = false;

  private moved(kind: MoveKind, moves: readonly Move[]): void {
    // turnover: the money trades move, as a share of all of it (gifts and the tax never count)
    if (kind === 'trade') {
      let total = 0;
      for (const w of this.game.wealth) total += w;
      if (total > 0) for (const m of moves) this.traded += m.amount / total;
    }
    // proportions are decided now, in the order the game moves money (so a link replays them);
    // shown, each holder takes them as its money comes off or on
    const shaped = this.shapeMoves(moves);
    let played = false;
    // debt: a body the size of its debt cannot have money cut off it: whatever touches a debtor lands at once
    const w = this.game.wealth;
    const debtor = moves.some((m) => (m.from >= 0 && (w[m.from] < 0 || w[m.from] + m.amount < 0)) || (m.to >= 0 && (w[m.to] < 0 || w[m.to] - m.amount < 0)));
    if (debtor) {
      // nothing shown
    } else if (kind === 'levy') {
      // a levy that is played waits for room in the middle; in a chart (everyone locked in
      // place) it happens at once and the chart re-forms
      let pot = 0;
      for (const m of moves) if (m.to === POT) pot += m.amount;
      this.transit.hold = this.showsMoney && this.crowded(pot);
      // the taxes shown before (`taxes on`): the levy starts with the slices off
      played = this.showsMoney && this.transit.play(kind, shaped, this.live, { lifted: this.taxes !== null });
      if (played) this.taxes = null;
    } else if (this.animating) {
      // a toss only where partners have met; any other trade in toss mode is shown as a piece
      // stakes shown on the table before (a named pair's): the toss starts with them there
      const lifted = this.stakes !== null && this.partners !== null;
      played = this.transit.play(kind, shaped, this.live, { style: this.tossing ? 'toss' : 'piece', together: this.together || this.transit.sync, lifted, facing: this.duelling, bars: this.recipe.shape === 'bar' });
    }
    if (!played) {
      // happening at once: whatever is still showing lands first (its money and shapes came
      // earlier), so no balance is spent twice and no older shape lands on a newer one
      this.finishTransit();
      for (const m of shaped) {
        if (m.from >= 0 && Number.isFinite(m.offShape)) this.aspect[m.from] = m.offShape!;
        if (m.to >= 0 && Number.isFinite(m.onShape)) this.aspect[m.to] = m.onShape!;
      }
    }
  }

  /** Every act still showing, landed now: its money off and on, its shapes taken, in order. */
  finishTransit(): void {
    const from = this.transit.events.length;
    this.transit.finish();
    for (const e of this.transit.events.slice(from)) {
      if ((e.kind === 'off' || e.kind === 'on') && e.holder >= 0 && Number.isFinite(e.shape)) this.aspect[e.holder] = e.shape;
    }
    // drawn as it is now
    this.transit.shown(this.game.wealth, this.shown);
  }

  /**
   * The single rule for proportions (aspect.ts), in wealth: money off cuts
   * across the longer side, money on joins the long edge. Worked out on
   * `ahead`, everyone's proportions once every move so far has landed; any
   * pose draws them at its own sizes. Scale-free, so the same history gives
   * the same shapes whatever was on screen.
   */
  private shapeMoves(moves: readonly Move[]): Move[] {
    const w = this.game.wealth;
    const a = this.ahead;
    // what each holder had before these moves (the game has made them already)
    const had = new Map<number, number>();
    const get = (i: number) => had.get(i) ?? w[i];
    for (const m of moves) {
      if (m.from >= 0) had.set(m.from, get(m.from) + m.amount);
      if (m.to >= 0) had.set(m.to, get(m.to) - m.amount);
    }
    // the two players: the same height, each as wide as its money (aspect = its money ÷ the pair's mean)
    const level = this.levelNext;
    this.levelNext = false;
    return moves.map((m) => {
      let offShape = NaN;
      let onShape = NaN;
      // the pair's money, which their gift keeps
      const pair = level && m.from >= 0 && m.to >= 0 ? get(m.from) + get(m.to) : NaN;
      // through debt (before or after at or below zero) a body keeps its proportions: there is nothing to cut
      if (m.from >= 0) {
        const before = get(m.from);
        if (before > 0 && before - m.amount > 0) offShape = a[m.from] = level ? levelled(before - m.amount, pair) : afterCut(a[m.from], before, m.amount);
        had.set(m.from, before - m.amount);
      }
      if (m.to >= 0) {
        const before = get(m.to);
        if (before > 0) onShape = a[m.to] = level ? levelled(before + m.amount, pair) : afterAttach(a[m.to], before, m.amount);
        had.set(m.to, before + m.amount);
      }
      return { from: m.from, to: m.to, amount: m.amount, offShape, onShape };
    });
  }

  /** Everyone square, now and ahead (what is on its way is shown at once: its shapes were decided before). */
  equalize(): void {
    this.transit.clear();
    this.aspect.fill(1);
    this.ahead.fill(1);
  }

  /** Money is shown moving: animations on, people free to move, and rectangles (a cut off a triangle or hexagon is not a slice of it). */
  get showsMoney(): boolean {
    const shape = this.recipe.shape;
    return !this.hurrying && (!this.locked || this.transit.chart) && shape !== 'tri' && shape !== 'hex';
  }

  /** The area a wealth is drawn at now, in the pose's scale (everyone else as drawn now). */
  measure(): (w: number) => number {
    const w = this.game.wealth;
    let total = 0;
    for (let i = 0; i < w.length; i++) total += w[i];
    return measureOf(this.recipe, this.transit.shown(w, new Float64Array(w.length)), total);
  }

  /**
   * The stage as acts see it: each body's box now (lifted ones where they are
   * drawn), the walls, the wealth each is drawn with, and the area a wealth is
   * drawn at in the pose's scale.
   */
  get live(): Live {
    const st = this.stage;
    const w = this.game.wealth;
    const owed = this.transit.owed;
    let measure: ((x: number) => number) | null = null;
    return {
      n: st.n,
      box: (i) => ({ x: st.x[i], y: st.y[i] + st.lift(i), w: st.w[i], h: st.h[i] }),
      right: st.wallGoal.right,
      top: st.wallGoal.top,
      drawn: (i) => Math.max(w[i] - owed[i], w[i] * 1e-6),
      measure: (x) => (measure ??= this.measure())(x),
    };
  }

  /**
   * Trades are played beat by beat: animations on, and people free to move.
   * In a chart (stack, row, pack, fold) everyone is locked to a place, so
   * pairs, stakes and spinners mean nothing: trades happen at once and the
   * chart re-forms.
   */
  get plays(): boolean {
    return this.transit.trade !== 'off' && this.showsMoney;
  }

  /** Everyone has a place in a chart. */
  get locked(): boolean {
    const p = this.recipe.pose;
    return p !== 'free' && p !== 'wander' && p !== 'still';
  }

  /** Run `fn` with each trade offered to the transit to play (a few of them, or, `together`, all on one clock). */
  animated(fn: () => void, together = false): void {
    this.animating = this.plays;
    this.together = together;
    try {
      fn();
    } finally {
      this.animating = false;
      this.together = false;
    }
  }

  get tradeRate(): number {
    return this.rate ?? this.game.n;
  }

  /** Run one line: commands separated by ';'. Output goes to the log and is returned. */
  run(line: string): string {
    const parts = line
      .split(';')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (parts.some((p) => STEP.test(p))) {
      this.print(`> ${line.trim()}`);
      this.start('(typed)', parts);
      return 'script started';
    }
    const outputs: string[] = [];
    for (const part of line.split(';')) {
      const text = part.trim();
      if (!text) continue;
      this.print(`> ${text}`);
      const out = this.exec(text);
      if (out) this.print(out);
      outputs.push(out);
    }
    return outputs.join('\n');
  }

  print(text: string): void {
    this.log.push(text);
    if (this.log.length > LOG_LIMIT) this.log.splice(0, this.log.length - LOG_LIMIT);
  }

  /** One command, all or nothing. Errors come back as text starting with "error:". */
  exec(text: string): string {
    const saved = this.save();
    try {
      return this.dispatch(text);
    } catch (e) {
      this.restore(saved);
      return `error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  /** The page's tick: trades if playing, a live chart, and the stage. */
  frame(dt: number): void {
    if (!(dt > 0)) return;
    this.applyViews();
    const t = dt * this.speed;
    // last frame's events have been seen by the page
    this.transit.events = [];
    this.calm = this.still ? this.calm + t : 0;
    this.teach(t);
    this.advance(t);
    // a levy waits (a little while at most) for the room to clear the pot's spot
    const levy = this.transit.levy;
    if (levy && !levy.act && this.transit.hold) {
      this.clearing += t;
      this.transit.hold = this.clearing < CLEAR_WAIT && this.crowded(levy.pot);
    } else {
      this.clearing = 0;
      this.transit.hold = false;
    }
    // a chart forms before trading moves it (a dense chart whose places change four times a
    // second never settles: the walkers jam), for a while at most
    this.forming = this.locked && this.stage.posing && !this.stage.done ? this.forming + t : 0;
    // after another arrangement, trading waits until everyone is in place (or, wandering, has spread out), at most
    // FORM_WAIT seconds
    if (this.reforming !== null) {
      this.reforming += t;
      const placed = this.stage.posing ? this.stage.done : this.reforming >= SPREAD;
      if (placed || this.reforming >= FORM_WAIT) this.reforming = null;
    }
    const forming = (this.forming > 0 && this.forming < FORM_WAIT) || this.reforming !== null;
    // a round asked for whose partners can no longer meet (toss mode off, a chart, triangles):
    // played the way rounds are played now
    if (this.queued > 0 && !this.meeting) {
      const k = this.queued;
      this.queued = 0;
      if (this.plays) this.animated(() => this.game.round(k), true);
      else this.game.round(k);
    }
    // trading waits while a levy plays: rounds of the program, as fast as the rate allows
    // a hold first: while it lasts nothing plays, partners' meetings included
    if (this.held > 0) this.held = Math.max(0, this.held - t);
    else if (this.meeting && !this.transit.holding) this.meetUp(t);
    else if (this.playing && this.game.n > 1 && !this.transit.holding && !forming) this.playRounds(t);
    // the meeting over and its last round landed: everyone goes home
    if (this.pairs && !this.meeting && !this.standing && !this.transit.busy) {
      this.pairs = null;
      this.partners = null;
      this.recompile();
    }
    this.transit.step(t, this.live);
    // money coming off and on, as it is shown: the same rule as when it is not (drawn wealth still before it here)
    for (const e of this.transit.events) {
      if ((e.kind === 'off' || e.kind === 'on') && e.holder >= 0 && Number.isFinite(e.shape)) this.aspect[e.holder] = e.shape;
    }
    // a live chart recompiles a few times a second (never spending over a fifth of the time
    // compiling); a beat of an animation shows at once
    const every = Math.max(LIVE_EVERY, (5 * this.compileCost) / 1000);
    const fx = this.transit.revision !== this.compiledFx;
    if (fx || (this.game.revision !== this.compiled && (!this.playing || this.stage.time - this.compiledAt >= every))) {
      this.recompile(this.playing || fx);
    }
    this.stage.step(t);
  }

  /**
   * Rounds while playing: played, a round starts when the last one (and its
   * levy) has landed, every pair through every beat together; not played, as
   * many rounds as the rate allows (N/2 trades a round).
   */
  private playRounds(t: number): void {
    const pairs = Math.max(1, Math.floor(this.game.n / 2));
    if (this.plays) {
      // a round when the last has landed, and the rate allows one (N/2 trades a round)
      this.debt = Math.min(1, this.debt + (this.tradeRate * t) / pairs);
      if (this.transit.busy || this.debt < 1) return;
      this.debt -= 1;
      this.animated(() => this.game.round(1), true);
      this.atGoal();
      this.stopped();
      return;
    }
    this.debt += (this.tradeRate * t) / pairs;
    const k = Math.min(Math.floor(MAX_TRADES / pairs), Math.floor(this.debt));
    if (k > 0) {
      // a hold asked for mid-batch, or the goal reached, stops the batch there; the rounds not played are not owed
      const played = this.game.round(k, () => this.holdAsked || this.atGoalNow());
      this.debt = played < k ? 0 : this.debt - k;
      this.atGoal();
      this.stopped();
    }
    // what the rounds asked of the view applies now, before anything plays on
    this.applyViews();
  }

  /** The program paused or ended: play stops (Play or Step goes on). A wait keeps playing until its button. */
  private stopped(): void {
    const status = this.game.run.status;
    if (status === 'paused' || status === 'ended') this.playing = false;
  }

  /** The demo mode (fx trade toss): partners walk up to each other before each round, and a spinner decides. */
  get meets(): boolean {
    return this.transit.trade === 'toss';
  }

  /** No round waits for its partners any more, and nobody stands paired. */
  cancelMeeting(): void {
    this.queued = 0;
    this.pairs = null;
    this.walked = 0;
    this.partners = null;
  }

  /** Partners meet before a round: toss mode, trades shown, and a round to play (playing in rounds, or asked for). */
  get meeting(): boolean {
    if (!this.meets || !this.plays || this.game.n < 2) return false;
    return this.game.meets && (this.playing || this.queued > 0);
  }

  /**
   * The next round's partners walk up to each other (the dice only peeked at),
   * then the round is played, every pair together; after it lands, the next
   * partners. A pair that cannot get together in time trades where it is.
   */
  private meetUp(t: number): void {
    // playing, a meeting waits for the rate to allow its round (a round asked for does not)
    const paced = this.queued === 0;
    if (paced) this.debt = Math.min(1, this.debt + (this.tradeRate * t) / Math.max(1, Math.floor(this.game.n / 2)));
    if (this.transit.busy || (paced && this.debt < 1 && !this.pairs)) return;
    const order = this.game.peek()!;
    const pairs = this.pairs;
    if (!pairs || this.partners !== null || pairs.length !== order.length || order.some((v, k) => v !== pairs[k])) {
      this.partners = null;
      this.pairs = order;
      this.walked = 0;
      this.recompile();
      return;
    }
    this.walked += t;
    if (this.stage.posing && !this.stage.done && this.walked < MEET_WAIT) return;
    if (paced && this.debt < 1) return;
    if (paced) this.debt -= 1;
    this.tossing = true;
    try {
      this.animated(() => this.game.round(1), true);
    } finally {
      this.tossing = false;
    }
    this.standing = false;
    this.atGoal();
    if (this.queued > 0) this.queued--;
    // a pause or the end stops play here too; a hold asked for applies now
    this.stopped();
    this.applyViews();
  }

  /** Someone stands on the spot a pot of area `pot` needs (the room only: a chart stays as it is). */
  private crowded(pot: number): boolean {
    if (this.recipe.pose !== 'free' || !this.transit.tax || !(pot > 0)) return false;
    const st = this.stage;
    const half = Math.sqrt(2 * pot) / 2;
    const cx = st.wallGoal.right / 2;
    const cy = st.wallGoal.top / 2;
    for (let i = 0; i < st.n; i++) {
      if (Math.abs(st.x[i] + st.w[i] / 2 - cx) < st.w[i] / 2 + half && Math.abs(st.y[i] + st.h[i] / 2 - cy) < st.h[i] / 2 + half) return true;
    }
    return false;
  }

  /** The empty square the room keeps in the middle: room for the pot of the levy playing, or of the tax's. */
  get potSpace(): number {
    if (!this.transit.tax) return 0;
    // a pot's area is its rate of all the wealth there is, which is 1
    return potRoom(Math.max(this.game.rules.tax, this.transit.levy?.pot ?? 0));
  }

  /** Run `lines` as a script from the next frame on (the first lines run now, up to the first wait). */
  start(name: string, lines: readonly string[]): void {
    this.script = { name, lines, at: 0, wait: 0, until: false, goal: false };
    this.advance(0);
  }

  /** Everything is where it is going: the pose is finished, or (wandering) nobody is moving and the walls are home. */
  get still(): boolean {
    const st = this.stage;
    if (st.posing) return st.done;
    if (st.walls.right !== st.wallGoal.right || st.walls.top !== st.wallGoal.top) return false;
    for (let i = 0; i < st.n; i++) if (st.air[i] > 0 || Math.hypot(st.vx[i], st.vy[i]) > 0.02) return false;
    return true;
  }

  /**
   * `until done`: nothing left to do: no round waiting for its partners, no
   * trade or levy playing, and a finished pose, or a room that has stayed at
   * rest for a moment.
   */
  get settled(): boolean {
    if (this.queued > 0 || this.transit.busy || this.teaching) return false;
    return this.stage.posing ? this.stage.done : this.calm >= 0.4;
  }

  // ——— teaching ———

  /** The teaching clocks: the veil eases, the pile fills, stakes lift, the guide grows, your card comes in. */
  private teach(t: number): void {
    const k = 1 - Math.exp(-t / 0.18);
    this.veil += (this.veilTo - this.veil) * k;
    if (Math.abs(this.veil - this.veilTo) < 0.004) this.veil = this.veilTo;
    if (this.money) {
      this.money.t += t;
      // cut, the squares come in as the pile fades
      if (this.money.mode === 'split' && this.money.t >= SPLIT_FADE) this.veilTo = 0;
      if (this.money.mode === 'split' && this.money.t > SPLIT_FADE + 0.8) this.money = null;
    }
    if (this.stakes) this.stakes.t += t;
    if (this.taxes) this.taxes.t += t;
    if (this.guide?.kind === 'lorenz' || this.guide?.kind === 'envelope') this.guide.t += t;
    if (this.you) this.you.t += t;
    if (this.draw) this.drawing(t);
  }

  /**
   * Who you are, drawn like a lottery (owner, 2026-10-22: chance shown): a ring hops from square to square, ever
   * slower, and stops on one, who is you (its card opens: `be`). Hops and the winner fixed when it starts.
   */
  draw: { t: number; at: number[]; who: number[] } | null = null;

  /** Starts the draw: about LOTTERY seconds of hops, slowing, ending on a square chosen at random. */
  startDraw(): void {
    const n = this.game.n;
    const at: number[] = [];
    const who: number[] = [];
    let t = 0;
    let gap = DRAW_FIRST;
    let last = -1;
    while (t < LOTTERY) {
      let i = Math.floor(Math.random() * n);
      if (n > 1 && i === last) i = (i + 1) % n;
      at.push(t);
      who.push(i);
      last = i;
      t += gap;
      gap *= DRAW_SLOWER;
    }
    this.you = null;
    this.draw = { t: 0, at, who };
  }

  private drawing(t: number): void {
    const d = this.draw!;
    d.t += t;
    let k = 0;
    while (k + 1 < d.at.length && d.at[k + 1] <= d.t) k++;
    const ring = new Uint8Array(this.game.n);
    if (d.t < d.at[d.at.length - 1] + DRAW_LAND) {
      ring[d.who[k]] = 1;
      this.highlight = ring;
      return;
    }
    this.landDraw();
  }

  /** The draw stops: its last square is you. */
  private landDraw(): void {
    const d = this.draw;
    if (!d) return;
    const i = d.who[d.who.length - 1];
    this.draw = null;
    this.highlight = null;
    this.you = { i, t: 0 };
    this.selected = i;
    this.ask([i], 'cheer');
  }

  /** A teaching animation still on its way: the veil, the pile filling or being cut, the running total growing. */
  get teaching(): boolean {
    if (this.veil !== this.veilTo) return true;
    if (this.draw) return true;
    if (this.money && (this.money.mode === 'split' || this.money.t < FILL)) return true;
    const g = this.guide;
    return g?.kind === 'lorenz' && (g.t < LORENZ_GROW || (g.even > 0 && g.t < g.even + 0.6) || (g.gap > 0 && g.t < g.gap + 0.8) || (g.tri > 0 && g.t < g.tri + TRI_TIME) || (g.lift > 0 && g.t < g.lift + LIFT_TIME) || (g.label > 0 && g.t < g.label + LABEL_TIME));
  }

  /** The play goal is reached (or there is none). */
  goalMet(): boolean {
    const g = this.goal;
    if (!g) return true;
    if (g.kind === 'round') return this.game.run.round >= g.at;
    if (g.kind === 'levy') {
      // reached once the levy's clock is at its moment (or there is no levy)
      const at = this.transit.levyAt(g.mark ?? 'back');
      return at === Infinity || this.transit.clock >= at - 1e-9;
    }
    return g.kind === 'gini' ? statsOf(this.game.wealth).gini >= g.at : neffOf(this.game.wealth) <= g.at;
  }

  /** There is a goal, and it is reached. */
  private atGoalNow(): boolean {
    return this.goal !== null && this.goalMet();
  }

  /** Play stops at the goal, exactly there. */
  private atGoal(): void {
    if (this.atGoalNow()) this.playing = false;
  }

  /**
   * The goal, now: rounds played at once until it is reached, out of what is left of this hurry's budget. A goal
   * the budget does not reach (stake 0: nothing moves) is let go, said so in the log, and the script goes on.
   */
  private reachGoal(): void {
    if (!this.goal || this.goalMet()) return;
    if (this.goal.kind === 'levy') {
      // at once: the levy lands, held nowhere
      this.transit.holdAt = null;
      this.finishTransit();
      this.goal = null;
      return;
    }
    this.finishTransit();
    this.cancelMeeting();
    const pairs = Math.max(1, Math.floor(this.game.n / 2));
    const cap = Math.floor(Math.min(MAX_TRADES, this.budget) / pairs);
    const played = this.game.round(cap, () => this.goalMet());
    this.budget = Math.max(0, this.budget - played * pairs);
    this.playing = false;
    if (!this.goalMet()) {
      this.print(`${this.script?.name ?? 'script'}: goal not reached (${this.goal.kind} ${this.goal.at}), let go`);
      this.goal = null;
    }
    this.recompile();
  }

  /** Everything still on its way lands now: rounds asked for, acts, the teaching clocks, the pose. */
  private settleNow(): void {
    if (this.queued > 0) {
      const k = this.queued;
      this.queued = 0;
      this.game.round(k);
      this.standing = false;
    }
    this.finishTransit();
    this.veil = this.veilTo;
    if (this.money) {
      if (this.money.mode === 'split') {
        this.money = null;
        this.veil = this.veilTo = 0;
      } else this.money.t = Math.max(this.money.t, FILL);
    }
    if (this.stakes) this.stakes.t = Math.max(this.stakes.t, 1);
    this.landDraw();
    const g = this.guide;
    if (g?.kind === 'lorenz') g.t = Math.max(g.t, LORENZ_GROW, g.even + 0.6, g.gap + 0.8, g.tri > 0 ? g.tri + TRI_TIME : 0, g.lift > 0 ? g.lift + LIFT_TIME : 0, g.label > 0 ? g.label + LABEL_TIME : 0);
    this.recompile();
    this.stage.finish();
  }

  /**
   * The running script, all of it now: waits skipped, poses and acts landed,
   * goals played to at once. What it leaves playing (a `play` with no goal)
   * goes on.
   */
  hurry(): void {
    this.hurrying = true;
    this.budget = HURRY_TRADES;
    try {
      this.hurried();
    } finally {
      this.hurrying = false;
    }
  }

  /** Lines run as a script, all at once (hurry from its first line). */
  runAtOnce(name: string, lines: readonly string[]): void {
    this.hurrying = true;
    this.budget = HURRY_TRADES;
    try {
      this.start(name, lines);
      this.hurried();
    } finally {
      this.hurrying = false;
    }
  }

  private hurried(): void {
    for (let guard = 0; guard < 10_000 && this.script; guard++) {
      const sc = this.script;
      sc.wait = 0;
      if (sc.until) {
        this.settleNow();
        sc.until = false;
      }
      if (sc.goal) this.reachGoal();
      this.advance(0);
    }
    this.settleNow();
  }

  /** What teaching draws this frame (acts/guides.ts): the pile, the stakes, the line, the running total, your card, glows. */
  extras(scene: Scene): void {
    const live = this.live;
    if (this.money) {
      const f = this.figure;
      const places = Array.from({ length: f.kind.length }, (_, i) => ({ x: f.x[i], y: f.y[i], w: f.w[i], h: f.h[i] }));
      money(this.money.mode, this.money.t, places, scene);
    }
    if (this.stakes && !this.transit.busy) {
      const pairs = this.pairs ?? this.game.peek();
      if (pairs) stakes(live, this.partners !== null ? pairs.slice(0, 2 * this.partners) : pairs, this.game.rules.beta, this.stakes.t, this.glows.has('stake:poorer'), scene);
    }
    if (this.taxes && !this.transit.busy) taxes(live, this.game.rules.tax, this.taxes.t, scene);
    const g = this.guide;
    if (g?.kind === 'line') this.reach = line(live, this.lineX(), scene);
    else if (g?.kind === 'envelope') envelope(live, g.t, scene);
    else if (g?.kind === 'lorenz') {
      const ease = (u: number) => Math.min(1, Math.max(0, u));
      // the curve once the stairs stand (the bodies are its blocks)
      const curve = this.recipe.pose === 'stairs' && this.stage.done ? ease(g.t / LORENZ_GROW) : 0;
      const since = (v: number) => (v > 0 ? Math.max(0, g.t - v) : 0);
      lorenz(this.game.wealth, curve, g.even > 0 ? ease((g.t - g.even) / 0.6) : 0, g.gap > 0 ? ease((g.t - g.gap) / 0.8) : 0, scene, { tri: since(g.tri), lift: since(g.lift), label: since(g.label) });
    }
    if (this.you && this.you.i < live.n) you(live, this.you.i, this.youText(), this.you.t, scene);
    for (const name of this.glows) {
      if (!name.startsWith('body:')) continue;
      const i = Number(name.slice(5));
      if (i >= 0 && i < live.n) scene.glows.push({ box: live.box(i), alpha: 1, of: i });
    }
    // every square's bottom edge (or left edge): its side, so its money, when side = money
    const bottom = this.glows.has('edge:bottom');
    if (bottom || this.glows.has('edge:left'))
      for (let i = 0; i < live.n; i++) {
        const b = live.box(i);
        scene.edges.push(bottom ? { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y, alpha: 1, of: i } : { x0: b.x, y0: b.y, x1: b.x, y1: b.y + b.h, alpha: 1, of: i });
      }
  }

  /** Who you are, in numbers: your rank (1 = the richest) of N, and your share of all the money; null if no one. */
  youAre(): { rank: number; n: number; share: string } | null {
    const r = this.rankOf(this.you?.i ?? -1);
    return r && { rank: r.rank, n: r.n, share: share(r.share) };
  }

  /**
   * Square `i`'s place: its rank (1 = the richest), of N; its share of all the money (the pot's included, a debt
   * negative); and its money × the average (all the money ÷ N, as the panel's charts measure it: review 2026-10-21,
   * 4). Null if there is no `i`.
   */
  rankOf(i: number): { rank: number; n: number; share: number; times: number } | null {
    if (i < 0 || i >= this.game.n) return null;
    const world = this.game.run.world;
    const w = world.w;
    let rank = 1;
    let total = world.pot;
    for (let j = 0; j < w.length; j++) {
      if (w[j] > w[i]) rank++;
      total += w[j];
    }
    const n = this.game.n;
    return { rank, n, share: total !== 0 ? w[i] / total : 0, times: total !== 0 ? (w[i] * n) / total : 0 };
  }

  /**
   * A chart taught in the yard, handed to its square in the panel (`handoff ccdf|lorenz|gini`): which, the yard's
   * part it is drawn in (world), and a count, so the page flies each once.
   */
  handoff: { kind: string; box: { x: number; y: number; w: number; h: number }; id: number } | null = null;
  /** The charts photographed so far: Learn and Play reveal their squares after handoff. */
  charted = new Set<string>();

  /** Who built this yard and where they are (a shared link's `by`, `by-url`), shown in its corner; null for most. */
  credit: { by: string; url: string } | null = null;

  /** Your card's words: your rank of N, and your share. */
  youText(): string {
    const you = this.youAre();
    return you ? WORDS.you.replace('{rank}', String(you.rank)).replace('{n}', String(you.n)).replace('{share}', you.share) : '';
  }

  /** Where the line guide is: `f` of the way from the box's left edge to the longest body's right edge. */
  lineX(): number {
    const g = this.guide;
    const f = g?.kind === 'line' ? g.f : 0.5;
    return BOX + f * (this.reachRight() - BOX);
  }

  private reachRight(): number {
    const st = this.stage;
    let right = BOX + 1;
    for (let i = 0; i < st.n; i++) right = Math.max(right, st.x[i] + st.w[i]);
    return right;
  }

  /** The line guide is within `tol` yard units of x (the pointer can take it). */
  handleAt(x: number, tol: number): boolean {
    return this.guide?.kind === 'line' && Math.abs(x - this.lineX()) <= tol;
  }

  /** The reader moves the line guide to x. */
  dragHandle(x: number): void {
    const g = this.guide;
    if (g?.kind !== 'line') return;
    const span = Math.max(1e-9, this.reachRight() - BOX);
    g.f = Math.min(1, Math.max(0, (x - BOX) / span));
    g.moved = true;
  }

  /** Faces asked to do something (the view takes them as it draws). */
  ask(who: readonly number[], what: string, seconds = 2.5): void {
    this.faceAsks.push({ who, what, seconds });
    if (this.faceAsks.length > 200) this.faceAsks.splice(0, this.faceAsks.length - 200);
  }

  /** The view's state beside a share link: how things show, the teaching overlays, the speed. */
  viewState(): ViewState {
    const t = this.transit;
    const g = this.guide;
    return {
      fx: { trade: t.trade, tax: t.tax, sync: t.sync, chart: t.chart },
      pinned: { ...this.pinned },
      speed: this.speed,
      veil: this.veilTo,
      stakes: !!this.stakes,
      taxes: !!this.taxes,
      divide: this.divide,
      glows: [...this.glows],
      // a guide as it ends (a checkpoint plays its beat again from there)
      guide: !g ? null : g.kind === 'line' ? { ...g } : g.kind === 'envelope' ? { kind: 'envelope', t: 99 } : { kind: 'lorenz', t: Math.max(g.t, 99), even: g.even > 0 ? 1 : 0, gap: g.gap > 0 ? 1 : 0, tri: g.tri > 0 ? 1 : 0, lift: g.lift > 0 ? 1 : 0, label: g.label > 0 ? 1 : 0 },
      badges: { ...this.badges },
      headroom: this.headroom,
      you: this.you?.i ?? -1,
      standing: this.standing,
      named: this.partners !== null && this.pairs ? Array.from(this.pairs.slice(0, 2 * this.partners)) : null,
      band: this.band ? [this.band[0], this.band[1]] : null,
      charted: [...this.charted],
    };
  }

  /** A checkpoint's view, back: everything shown as it was, at rest. */
  applyViewState(v: ViewState): void {
    this.transit.trade = v.fx.trade;
    this.transit.tax = v.fx.tax;
    this.transit.sync = v.fx.sync;
    this.transit.chart = v.fx.chart;
    this.pinned = { ...v.pinned };
    this.speed = v.speed;
    this.veil = this.veilTo = v.veil;
    this.money = null;
    this.stakes = v.stakes ? { t: 1 } : null;
    this.taxes = v.taxes ? { t: 1 } : null;
    this.divide = v.divide;
    this.glows = new Set(v.glows);
    this.guide = v.guide ? { ...v.guide } : null;
    this.badges = { ...v.badges };
    this.headroom = v.headroom;
    this.you = v.you >= 0 && v.you < this.game.n ? { i: v.you, t: 1 } : null;
    this.goal = null;
    this.band = v.band ? [v.band[0], v.band[1]] : null;
    this.charted = new Set(v.charted ?? []);
    if (v.named) this.name(v.named);
    else {
      this.standing = v.standing && this.meets && this.game.meets;
      if (this.standing) this.pairs = this.game.peek();
    }
    this.recompile();
    this.stage.finish();
  }

  /** Partners named, in pairs (i, j, k, l …): they stand together, apart enough for their stakes; the rest watch. */
  name(partners: readonly number[]): void {
    const n = this.game.n;
    const named = new Set(partners);
    const order = [...partners, ...Array.from({ length: n }, (_, k) => k).filter((k) => !named.has(k))];
    this.pairs = Int32Array.from(order);
    this.partners = partners.length >> 1;
    this.standing = true;
  }

  /** Gifts in the run's log: the duels so far (and the console's gives). */
  get gifts(): number {
    let k = 0;
    for (const i of this.game.run.inputs) if (i.event.kind === 'gift') k++;
    return k;
  }

  /** Duels so far (each marks the log before its gift): what the next duel's coin is drawn by. */
  get duels(): number {
    let k = 0;
    for (const i of this.game.run.inputs) if (i.event.kind === 'note' && i.event.text === 'duel') k++;
    return k;
  }

  /** The two players (the first pair named), left one first as they stand; null if none are named. */
  players(): [number, number] | null {
    if (this.partners === null || !this.pairs || this.pairs.length < 2) return null;
    const [a, b] = [this.pairs[0], this.pairs[1]];
    return this.stage.x[a] <= this.stage.x[b] ? [a, b] : [b, a];
  }

  /** The left player's share of the two players' money (as they stand), or NaN if no players are named. */
  get split(): number {
    const p = this.players();
    if (!p) return NaN;
    const w = this.game.wealth;
    return w[p[0]] / (w[p[0]] + w[p[1]]);
  }

  /**
   * The two players' money shared `f` to the left one, 1 − f to the right (owner, 2026-10-21: Learn's wealth
   * slider): a gift between them, so a link replays it.
   */
  splitPlayers(f: number): void {
    const p = this.players();
    if (!p) throw new RangeError('split: name the players first (meet i j)');
    const [a, b] = p;
    const w = this.game.wealth;
    const d = f * (w[a] + w[b]) - w[a];
    if (Math.abs(d) < 1e-12) return;
    // noted in the log, so a link replays them square too
    this.game.input({ kind: 'note', text: 'split' });
    if (d > 0) this.game.give(b, a, d);
    else this.game.give(a, b, -d);
    this.recompile();
  }

  /**
   * A fair trade between i and j alone (the others watch): a coin from the dice (the seed and how many gifts the
   * log holds, so a link replays it), the stake the program's (β × the poorer one's), paid as a gift in the run's
   * log. Shown as a toss, coin and all.
   */
  duel(i: number, j: number): void {
    const w = this.game.wealth;
    // the coin counts duels (each marked in the log), not every gift: a split of their money is a gift too
    const [winner, loser] = coinOf(this.game.seed, this.duels) < 0.5 ? [i, j] : [j, i];
    this.game.input({ kind: 'note', text: 'duel' });
    const stake = this.game.rules.beta * Math.min(w[i], w[j]);
    this.tossing = this.duelling = true;
    try {
      this.animated(() => this.game.give(loser, winner, stake), true);
    } finally {
      this.tossing = this.duelling = false;
    }
  }

  /** The script's next lines, until it has to wait. */
  private advance(dt: number): void {
    const sc = this.script;
    if (!sc) return;
    if (sc.wait > 0) {
      sc.wait -= dt;
      if (sc.wait > 0) return;
    }
    if (sc.until) {
      if (!this.settled) return;
      sc.until = false;
    }
    if (sc.goal) {
      if (this.goal && !this.goalMet()) return;
      // a levy played to its end is held no more; at an earlier moment it stays held for the next line
      if (this.goal?.kind === 'levy' && this.goal.mark === 'back') this.transit.holdAt = null;
      sc.goal = false;
      this.goal = null;
    }
    while (sc.at < sc.lines.length) {
      const line = sc.lines[sc.at++].trim();
      if (!line || line.startsWith('#')) continue;
      const wait = /^wait\s+(\S+)$/i.exec(line);
      if (wait) {
        const t = Number(wait[1]);
        if (!(t >= 0 && t <= 600)) {
          this.print(`error: ${sc.name}: wait takes seconds in [0, 600]`);
          this.script = null;
          return;
        }
        if (this.hurrying) continue;
        sc.wait = t;
        return;
      }
      if (/^until\s+done$/i.test(line)) {
        if (this.hurrying) {
          this.settleNow();
          continue;
        }
        sc.until = true;
        return;
      }
      const levy = /^until\s+levy\s+(pot|split|back)$/i.exec(line);
      if (levy) {
        // the levy plays to that moment and holds there (Learn's slow round of tax, a step at a time)
        const mark = levy[1].toLowerCase();
        this.transit.holdAt = mark;
        this.goal = { kind: 'levy', at: 0, mark };
        if (this.hurrying) this.reachGoal();
        if (this.goalMet()) {
          if (mark === 'back') this.transit.holdAt = null;
          this.goal = null;
          continue;
        }
        sc.goal = true;
        return;
      }
      const goal = /^until\s+(round|gini|neff)\s+(\+?)([\d.]+)$/i.exec(line);
      if (goal) {
        const v = Number(goal[3]);
        const kind = goal[1].toLowerCase() as Goal['kind'];
        if (!(v >= 0) || (kind !== 'round' && goal[2]) || (kind === 'gini' && v > 1) || (kind === 'neff' && v < 1) || (kind === 'round' && !Number.isSafeInteger(v))) {
          this.print(`error: ${sc.name}: until round <k> | round +<k> | gini <x in [0, 1]> | neff <x ≥ 1>`);
          this.script = null;
          return;
        }
        this.goal = { kind, at: goal[2] ? this.game.run.round + v : v };
        if (this.hurrying) this.reachGoal();
        if (this.goalMet()) {
          this.goal = null;
          continue;
        }
        sc.goal = true;
        return;
      }
      if (STEP.test(line)) {
        this.print(`error: ${sc.name}: "${line}" (wait <seconds>, until done, until round <k>, until gini <x>)`);
        this.script = null;
        return;
      }
      this.print(`» ${line}`);
      const out = this.exec(line);
      if (out) this.print(out);
      if (out.startsWith('error:')) {
        this.script = null;
        return;
      }
      // the line itself ran or stopped a script
      if (this.script !== sc) return;
    }
    this.script = null;
  }

  /**
   * Same pose, new wealth. `live` (trading in small steps while playing): those
   * in place are carried along with the chart. Otherwise (a one-off command,
   * a big change) they walk to their new places.
   */
  recompile(live = false): void {
    const pot = this.potSpace;
    // the pot's spot growing or shrinking moves the whole room: everyone walks
    if (pot !== this.laidPot) live = false;
    this.laidPot = pot;
    const t0 = performance.now();
    const before = this.figure;
    this.figure = this.figureOf(this.recipe);
    // partners stand where they met: while paired, sizes change in place (laid out afresh, the
    // rows could reshuffle mid-act); the next meeting lays the room out again
    if (live && this.pairs && !before.free && before.kind.length === this.figure.kind.length) {
      const f = this.figure;
      for (let i = 0; i < f.kind.length; i++) {
        f.x[i] = before.x[i] + (before.w[i] - f.w[i]) / 2;
        f.y[i] = before.y[i] + (before.h[i] - f.h[i]) / 2;
      }
    }
    this.compileCost = performance.now() - t0;
    this.stage.apply(this.figure, this.shown, live);
    this.compiled = this.game.revision;
    this.compiledFx = this.transit.revision;
    this.compiledAt = this.stage.time;
  }

  /** The recipe on the wealth as drawn: what is in transit is no one's yet. */
  private figureOf(recipe: Recipe): Figure {
    this.transit.shown(this.game.wealth, this.shown);
    let total = 0;
    for (let i = 0; i < this.game.n; i++) total += this.game.wealth[i];
    return compile(recipe, this.shown, total, this.aspect, { pot: this.potSpace, pairs: this.pairs ?? undefined, stake: this.game.rules.beta, cells: cellsOf(this.game), headroom: this.headroom, band: this.band ?? undefined, partners: this.partners ?? undefined });
  }

  /** The yard puts its squares on a square lattice (the program's yard block): neighbours are the model's. */
  get onLattice(): boolean {
    return onLattice(this.game.program);
  }

  /** "In their places": on the model's lattice for a yard on one, else standing anywhere. */
  get places(): 'lattice' | 'free' {
    return this.onLattice ? 'lattice' : 'free';
  }

  /**
   * The state as a URL hash: the program (left out when it is the stage's own), the seed, the input log and the
   * step reached, so a link replays to the bit; then the view (pose, look, play, zoom, question).
   */
  share(): string {
    const p = new URLSearchParams();
    const own = JSON.stringify(stageProgram(this.game.n)) === JSON.stringify(this.game.program);
    if (own) p.set('n', String(this.game.n));
    else p.set('p', JSON.stringify(this.game.program));
    p.set('seed', String(this.game.seed));
    const inputs = this.game.run.inputs;
    if (inputs.length) p.set('in', JSON.stringify(inputs.map((i) => [i.step, i.event])));
    if (this.game.run.steps > 1) p.set('at', String(this.game.run.steps));
    if (this.stage.yieldRule !== 'equal') p.set('yield', this.stage.yieldRule);
    const pose = formatRecipe(this.recipe);
    if (pose) p.set('pose', pose);
    if (this.look !== 'manga') p.set('look', this.look);
    // the default rate (N a second, following N) is `auto`; any number is that rate
    if (this.playing) p.set('play', this.rate === null ? 'auto' : String(this.rate));
    if (this.zoom !== 'yard') p.set('zoom', this.zoom);
    if (this.question) p.set('q', this.question);
    if (this.credit) {
      p.set('by', this.credit.by);
      if (this.credit.url) p.set('by-url', this.credit.url);
    }
    return `#${p.toString()}`;
  }

  /** A session from a share link's hash. Throws on anything malformed. */
  static load(hash: string): Session {
    const p = new URLSearchParams(hash.replace(/^#/, ''));
    const int = (key: string, fallback: number) => {
      const v = p.get(key);
      if (v === null) return fallback;
      if (!/^\d+$/.test(v)) throw new RangeError(`${key} must be a whole number`);
      return Number(v);
    };
    if (p.has('do') || p.has('beta') || p.has('tax')) throw new Error('an old link (before programs): it cannot be replayed');
    const text = p.get('p');
    const program = text === null ? undefined : readProgram(JSON.parse(text));
    const s = new Session({ n: int('n', 36), seed: int('seed', 1), program, recipe: parseRecipe(p.get('pose') ?? '') });
    const yieldRule = p.get('yield');
    if (yieldRule !== null) s.stage.yieldRule = checkYield(yieldRule);
    // the log replays at once: nothing to watch, and every trade's shape lands now
    const fx = { trade: s.transit.trade, tax: s.transit.tax };
    s.transit.trade = 'off';
    s.transit.tax = false;
    const raw = JSON.parse(p.get('in') ?? '[]') as unknown;
    if (!Array.isArray(raw) || !raw.every((x) => Array.isArray(x) && x.length === 2 && Number.isSafeInteger(x[0]))) throw new RangeError('in: a list of [step, input]');
    const inputs: Input[] = raw.map(([step, event]) => ({ step, event }));
    s.game.replay(inputs, int('at', 1));
    s.transit.trade = fx.trade;
    s.transit.tax = fx.tax;
    // what the program's observers asked for on the way is history, settled now: the pose the link was shared in
    // is the one it opens in (and no old hold keeps it still)
    const posed = s.recipe;
    s.applyViews();
    s.held = 0;
    if (formatRecipe(s.recipe) !== formatRecipe(posed)) s.pose(posed);
    const look = p.get('look');
    if (look !== null) s.look = checkLook(look);
    const play = p.get('play');
    if (play !== null) {
      s.playing = true;
      s.rate = play === 'auto' ? null : checkRate(Number(play));
    }
    s.question = (p.get('q') ?? '').slice(0, 280);
    // who built this yard, if the link says (and where to find them: a web address only)
    const by = (p.get('by') ?? '').trim().slice(0, 60);
    if (by) {
      const url = (p.get('by-url') ?? '').trim();
      s.credit = { by, url: /^https?:\/\/[^\s]+$/i.test(url) ? url.slice(0, 300) : '' };
    }
    const zoom = p.get('zoom');
    if (zoom !== null) s.zoom = checkZoom(zoom);
    s.transit.clear();
    s.recompile();
    s.stage.scatter();
    s.stage.finish();
    // a link may carry a tutorial: a built-in script by name, or lines of its own
    const name = p.get('run');
    if (name !== null) {
      if (!Object.hasOwn(SCRIPTS, name)) throw new Error(`no script "${name}"`);
      s.start(name, SCRIPTS[name].split('\n'));
    }
    const script = p.get('script');
    if (script !== null) s.start('link', script.split(/[;\n]/));
    return s;
  }

  // ——— internals ———

  private dispatch(text: string): string {
    const words = text.split(/\s+/);
    const head = words[0].toLowerCase();
    if (Object.hasOwn(COMMANDS, head)) return COMMANDS[head].run(this, words.slice(1));
    if (head === 'preset' || Object.hasOwn(PRESETS, head)) {
      const name = head === 'preset' ? words[1]?.toLowerCase() : head;
      if (!name || !Object.hasOwn(PRESETS, name)) throw new Error(`presets: ${Object.keys(PRESETS).join(', ')}`);
      const rest = words.slice(head === 'preset' ? 2 : 1).join(' ');
      return this.pose(parseRecipe(rest, parseRecipe(PRESETS[name])));
    }
    if (isRecipeWord(head) || ['rescale', 'resize', 'reshape', 'sort', 'group', 'arrange'].includes(head)) {
      return this.pose(parseRecipe(expandPresets(text), this.recipe));
    }
    throw new Error(`unknown command "${head}" (try help)`);
  }

  pose(recipe: Recipe): string {
    // a pose that shows no money moving (a chart, triangles, hexagons): what is showing lands now
    const before = this.recipe;
    this.recipe = recipe;
    const shows = this.showsMoney;
    this.recipe = before;
    // another arrangement while trading: what is flying lands now, and trading waits for everyone to be in their new
    // places (owner, 2026-10-22: stacks came apart, squares moved about in a mess)
    const another = formatRecipe(recipe) !== formatRecipe(before);
    if (!shows || (another && this.playing)) this.finishTransit();
    if (another) this.reforming = 0;
    const figure = this.figureOf(recipe);
    this.recipe = recipe;
    this.figure = figure;
    this.stage.apply(figure, this.shown);
    this.compiled = this.game.revision;
    this.compiledFx = this.transit.revision;
    return `pose: ${formatRecipe(recipe) || 'room'}`;
  }

  private save() {
    return {
      game: this.game,
      wealth: this.game.snapshot(),
      stage: this.stage,
      yieldRule: this.stage.yieldRule,
      recipe: this.recipe,
      figure: this.figure,
      playing: this.playing,
      rate: this.rate,
      speed: this.speed,
      look: this.look,
      axes: this.axes,
      hud: this.hud,
      question: this.question,
      caption: this.caption,
      selected: this.selected,
      // the same experiment: a command undone keeps what has been measured (recheck 2026-10-22)
      experiment: this.experiment,
      // proportions: a rollback's replay tells no one, so they are put back as they were
      aspect: Float64Array.from(this.aspect),
      ahead: Float64Array.from(this.ahead),
      views: [...this.views],
      camera: { pinned: { ...this.pinned }, colourBy: this.colourBy, highlight: this.highlight, held: this.held, follow: this.follow },
      teach: {
        taxes: this.taxes && { ...this.taxes },
        divide: this.divide,
        veil: this.veil,
        veilTo: this.veilTo,
        money: this.money && { ...this.money },
        stakes: this.stakes && { ...this.stakes },
        glows: new Set(this.glows),
        guide: this.guide && { ...this.guide },
        badges: { ...this.badges },
        headroom: this.headroom,
        you: this.you && { ...this.you },
        goal: this.goal,
        standing: this.standing,
      },
    };
  }

  private restore(s: ReturnType<Session['save']>): void {
    this.experiment = s.experiment;
    this.compiledAt = -Infinity;
    this.game = s.game;
    this.game.restore(s.wealth);
    this.aspect = s.aspect;
    this.ahead = s.ahead;
    this.views = s.views;
    this.holdAsked = false;
    ({ pinned: this.pinned, colourBy: this.colourBy, highlight: this.highlight, held: this.held, follow: this.follow } = s.camera);
    this.stage = s.stage;
    this.stage.yieldRule = s.yieldRule;
    this.recipe = s.recipe;
    this.figure = s.figure;
    this.playing = s.playing;
    this.rate = s.rate;
    this.speed = s.speed;
    this.look = s.look;
    this.axes = s.axes;
    this.hud = s.hud;
    this.question = s.question;
    this.caption = s.caption;
    this.selected = s.selected;
    ({ veil: this.veil, veilTo: this.veilTo, money: this.money, stakes: this.stakes, glows: this.glows, guide: this.guide, badges: this.badges } = s.teach);
    ({ headroom: this.headroom, you: this.you, goal: this.goal, standing: this.standing, taxes: this.taxes, divide: this.divide } = s.teach);
    this.stage.apply(this.figure, this.shown);
  }

  /** A new population: new game and stage built first, then swapped in. The program stays, with N changed. */
  rebuild(n: number, seed: number): void {
    const sliders = new Map(this.game.run.sliders);
    this.swap(new Game(n, seed, n === this.game.n ? this.game.program : withN(this.game.program, n)));
    this.keepSliders(sliders);
  }

  /** Everyone equal again, the dice back to the seed: the same run again, the sliders as the reader set them. */
  restart(): void {
    const sliders = new Map(this.game.run.sliders);
    this.experiment++;
    this.game.reset();
    this.keepSliders(sliders);
  }

  /**
   * The sliders set as they were (a new crowd, new dice, or the same dice again): the experiment's conditions are
   * the reader's until they move them. Set at round 0, so a link replays them.
   */
  private keepSliders(set: ReadonlyMap<string, number>): void {
    for (const sl of this.game.panel.sliders) {
      const v = set.get(sl.name);
      if (v !== undefined && v !== sl.start) this.slide(sl.name, v);
    }
  }

  /** Another program (the Rules drawer's): round 0, the same seed, the pose kept. Throws ProgramError if invalid. */
  setProgram(program: Program): void {
    this.swap(new Game(0, this.game.seed, program));
    this.pinned = { trade: false, tax: false };
    this.colourBy = 'none';
    this.highlight = null;
    this.held = 0;
    this.follow = null;
    this.cancelMeeting();
    this.recompile();
  }

  /** A panel slider moved: the run goes on with the new value. */
  slide(name: string, value: number): void {
    const pot = this.potSpace;
    this.game.input({ kind: 'slider', name, value });
    // a tax slider changes the pot's spot in the room
    if (this.potSpace !== pot) this.recompile();
  }

  /** A panel button pressed: its scripts run once, and a wait for it lets go. */
  press(name: string): void {
    this.game.input({ kind: 'button', name });
  }

  private swap(game: Game): void {
    const { n, seed } = game;
    // squares in their places stay in their places: on the new yard's lattice if it has one, among its cells
    this.recipe = inPlaces(this.recipe, game.program);
    const figure = compile(this.recipe, game.wealth, undefined, undefined, { cells: cellsOf(game) });
    const stage = new Stage(figure, game.wealth, seed);
    stage.yieldRule = this.stage.yieldRule;
    const transit = new Transit(n);
    transit.trade = this.transit.trade;
    transit.tax = this.transit.tax;
    transit.sync = this.transit.sync;
    transit.chart = this.transit.chart;
    this.experiment++;
    this.game = game;
    this.figure = figure;
    this.stage = stage;
    this.transit = transit;
    this.shown = Float64Array.from(game.wealth);
    this.aspect = new Float64Array(n).fill(1);
    this.ahead = new Float64Array(n).fill(1);
    // the old game's camera requests go with it
    this.views = [];
    this.holdAsked = false;
    this.hook();
    this.compiled = game.revision;
    this.compiledFx = transit.revision;
    // the new stage's clock starts at 0: the live chart's last compile is on it, or it waits for the old one's time
    // (owner, 2026-10-22: a formation went straight after a new crowd and stayed)
    this.compiledAt = -Infinity;
    this.selected = -1;
    this.pairs = null;
    this.queued = 0;
    this.standing = false;
    this.partners = null;
    if (this.you && this.you.i >= n) this.you = null;
  }
}

/** The duel's coin: a number in [0, 1) from the seed and the duel's count, the same in every browser (integer hash). */
export function coinOf(seed: number, k: number): number {
  let x = (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(k + 1, 0xc2b2ae35)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** A share for readers: whole percents, or one decimal under 10%, or "under 0.1%". */
export const share = (x: number) => (x >= 0.1 ? `${Math.round(100 * x)}%` : x >= 0.001 || x === 0 || x <= -0.001 ? `${+(100 * x).toFixed(1)}%` : x > 0 ? '< 0.1%' : '> −0.1%');

/** A program whose yard puts its squares on a square lattice. */
function onLattice(program: Program): boolean {
  const start = program.scripts.find((s) => s.op === 'ctl.start');
  return start?.body?.find((n) => n.op === 'setup.yard')?.f?.space === 'lattice';
}

/** The model's lattice cells for the picture, when the yard has a lattice. */
function cellsOf(game: Game): { cell: Int32Array; side: number } | undefined {
  const world = game.run.world;
  return onLattice(game.program) ? { cell: world.cell, side: world.side } : undefined;
}

/** "In their places" follows the yard: on its lattice if it has one, else standing anywhere; other poses stay. */
function inPlaces(recipe: Recipe, program: Program): Recipe {
  if (recipe.pose !== 'free' && recipe.pose !== 'lattice') return recipe;
  const places = onLattice(program) ? 'lattice' : 'free';
  return recipe.pose === places ? recipe : parseRecipe(places, recipe);
}
