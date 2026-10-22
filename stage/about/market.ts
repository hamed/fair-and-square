/**
 * Squares that trade, in the prose, by the stage's own rule (core/game.ts:
 * random pairs, a fair spinner, the stake a share of the poorer one's wealth).
 * Areas are wealth, as on the stage: money comes off the loser as a piece of
 * its own colour and lands on the winner, who swells; faces feel each change
 * on a log scale (FaceField.react), and whoever holds most of it starts to
 * look down on the rest.
 *
 *   Pair     <span data-sq="pair" data-colours="red|teal">  two squares in a sentence, trading for ever
 *   Family   <figure data-family …>                        five, sized by height, until Play deals them all the same
 */
import { STROKES, FILLS, type ColorName } from '../essay/agentStyle.ts';
import { Game } from '../core/game.ts';
import { Body, Cast, INK, MUTED, Sheet, clamp, isColour, temperOf, type Mount, type Pointer } from './cast.ts';

/** Reactions amplified a little, as the stage's are (view/faces.ts FEEL). */
const FEEL = 2.5;

interface Flight {
  readonly from: number;
  readonly to: number;
  readonly amount: number;
  /** When the partners meet, the money leaves the loser, and lands on the winner (market clock, s). */
  readonly t0: number;
  readonly leave: number;
  readonly land: number;
  /** Where the spinner starts, radians. */
  readonly spin: number;
  left: boolean;
  landed: boolean;
}

/** The game, and its shares as drawn: a share is off its loser when the piece leaves, on its winner when it lands. */
export class Market {
  readonly game: Game;
  readonly shown: Float64Array;
  readonly flights: Flight[] = [];
  trades = 0;
  private move: { from: number; to: number; amount: number } | null = null;

  constructor(n: number, seed: number, stake: number) {
    this.game = new Game(n, seed, { beta: stake, tax: 0 });
    this.game.onMoves = (kind, moves) => {
      if (kind === 'trade' && moves[0]) this.move = { from: moves[0].from, to: moves[0].to, amount: moves[0].amount };
    };
    this.shown = Float64Array.from(this.game.wealth);
  }

  /** One trade, decided now (at `t`): the money leaves after `look` s and lands `fly` s later. */
  trade(t: number, look: number, fly: number): Flight | null {
    this.move = null;
    this.game.trade(1);
    const m = this.move as { from: number; to: number; amount: number } | null;
    if (!m) return null;
    const f: Flight = { ...m, t0: t, leave: t + look, land: t + look + fly, spin: Math.random() * Math.PI * 2, left: false, landed: false };
    this.flights.push(f);
    this.trades++;
    return f;
  }

  /** Money off and on, up to `t`; `felt` hears each: who, their share before and after. */
  advance(t: number, felt: (who: number, before: number, after: number) => void): void {
    for (const f of this.flights) {
      if (!f.left && t >= f.leave) {
        f.left = true;
        const before = this.shown[f.from];
        this.shown[f.from] = Math.max(0, before - f.amount);
        felt(f.from, before, this.shown[f.from]);
      }
      if (f.left && !f.landed && t >= f.land) {
        f.landed = true;
        const before = this.shown[f.to];
        this.shown[f.to] = before + f.amount;
        felt(f.to, before, this.shown[f.to]);
      }
    }
    for (let k = this.flights.length - 1; k >= 0; k--) if (this.flights[k].landed) this.flights.splice(k, 1);
  }

  /** Everything in the air lands at once. */
  settle(): void {
    this.flights.length = 0;
    this.shown.set(this.game.wealth);
  }

  /** The richest, and their share. */
  top(): [number, number] {
    const w = this.game.wealth;
    let best = 0;
    for (let i = 1; i < w.length; i++) if (w[i] > w[best]) best = i;
    return [best, w[best]];
  }
}

/** Play `market` until someone holds `until` of everything (or `cap` trades); returns the trades played. */
export function playOut(market: Market, until: number, cap: number, each?: (m: Market) => void): number {
  let k = 0;
  while (k < cap && market.top()[1] < until) {
    market.trade(0, 0, 0);
    market.settle();
    each?.(market);
    k++;
  }
  return k;
}

/** The piece of a loser's square on its way, `side` px, turning as it flies. */
function drawPiece(ctx: CanvasRenderingContext2D, x: number, y: number, side: number, angle: number, colour: ColorName): void {
  if (!(side > 0.4)) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = FILLS[colour];
  ctx.fillRect(-side / 2, -side / 2, side, side);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = STROKES[colour];
  ctx.lineWidth = Math.min(1.25, 0.25 * side);
  ctx.strokeRect(-side / 2, -side / 2, side, side);
  ctx.restore();
}

/** The stage's spinner (view/render.ts): a faint disc, an arrow that turns and stops on the winner. */
function drawSpinner(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, angle: number, alpha: number): void {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(40, 37, 31, 0.07)';
  ctx.strokeStyle = 'rgba(40, 37, 31, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
  const dx = Math.cos(angle);
  const dy = -Math.sin(angle);
  const head = 0.32 * r;
  const tip: [number, number] = [x + dx * 0.88 * r, y + dy * 0.88 * r];
  const neck: [number, number] = [tip[0] - dx * head, tip[1] - dy * head];
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = Math.max(1.5, 0.09 * r);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - dx * 0.5 * r, y - dy * 0.5 * r);
  ctx.lineTo(neck[0], neck[1]);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tip[0], tip[1]);
  ctx.lineTo(neck[0] - dy * head * 0.55, neck[1] + dx * head * 0.55);
  ctx.lineTo(neck[0] + dy * head * 0.55, neck[1] - dx * head * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A flight's piece, where it is at `t`: from the loser's middle to the winner's, over an arc. */
function drawFlight(ctx: CanvasRenderingContext2D, f: Flight, bodies: readonly Body[], unit: number, t: number): void {
  if (!f.left || f.landed) return;
  const a = bodies[f.from];
  const b = bodies[f.to];
  const u = clamp((t - f.leave) / Math.max(1e-3, f.land - f.leave), 0, 1);
  const e = u * u * (3 - 2 * u);
  const dist = Math.abs(b.cx - a.cx);
  const x = a.cx + (b.cx - a.cx) * e;
  const y = a.cy + (b.cy - a.cy) * e - Math.sin(Math.PI * e) * (0.35 * unit + 0.25 * dist);
  drawPiece(ctx, x, y, unit * Math.sqrt(f.amount), e * Math.PI * (b.cx > a.cx ? 1 : -1), a.colour);
}

const ease = (dt: number, tau: number) => 1 - Math.exp(-dt / tau);

// ——— two in a sentence ———

export class Pair implements Mount {
  readonly faces = 2;
  readonly host: HTMLElement;
  private readonly sheet: Sheet;
  private readonly colours: [ColorName, ColorName];
  private bodies: Body[] = [];
  private cast: Cast | null = null;
  private market = new Market(2, 1 + Math.floor(Math.random() * 1e6), 0.3);
  private next = 1.2;
  private resetAt = Infinity;

  constructor(host: HTMLElement) {
    this.host = host;
    const c = (host.dataset.colours ?? '').split('|');
    this.colours = [isColour(c[0]) ? c[0] : 'red', isColour(c[1]) ? c[1] : 'teal'];
    const size = clamp(Number(host.dataset.size) || 1, 0.3, 6);
    host.style.width = `${2.9 * size}em`;
    host.style.height = `${size}em`;
    this.sheet = new Sheet(host, host.getAttribute('aria-label') ?? undefined);
  }

  bind(cast: Cast, first: number): void {
    this.cast = cast;
    this.bodies = this.colours.map((c, k) => {
      cast.field.temper(first + k, temperOf(undefined, (first + k) * 31 + 7));
      return new Body(first + k, c, 10);
    });
    this.host.addEventListener('click', () => {
      if (cast.reduced) return;
      for (const b of this.bodies) b.hop(0.5 * b.side);
    });
  }

  frame(t: number, dt: number, pointer: Pointer, drawn: boolean): void {
    const cast = this.cast;
    if (!cast) return;
    const sheet = this.sheet;
    sheet.fit((_w, h) => ({ top: Math.max(14, 1.1 * h), side: Math.max(8, 0.3 * h), bottom: Math.max(4, 0.2 * h) }));
    const unit = sheet.boxH * Math.SQRT2; // a whole's side: an equal half is a square of the gap's height
    const [l, r] = this.bodies;
    const m = this.market;
    // a trade every few seconds; when one of them has most of it, they start over, even
    if (!cast.reduced && t >= this.next && !m.flights.length && this.resetAt === Infinity) {
      m.trade(t, 0.55, 0.6);
      this.next = t + 2.6;
    }
    const looking = m.flights[0];
    m.advance(t, (who, before, after) => {
      cast.field.react(this.bodies[who].face, before, after, FEEL);
      if (after < before) this.bodies[who].squash(1);
      else this.bodies[who].swell = 1;
    });
    if (this.resetAt === Infinity && !m.flights.length && m.top()[1] >= 0.8) this.resetAt = t + 1.8;
    if (t >= this.resetAt) {
      this.resetAt = Infinity;
      this.market = new Market(2, 1 + Math.floor(Math.random() * 1e6), 0.3);
      for (const b of this.bodies) cast.field.feel(b.face, 0.4, 0.3);
      this.next = t + 1.5;
    }
    const k = ease(dt, 0.12);
    for (let i = 0; i < 2; i++) {
      const b = this.bodies[i];
      const target = Math.max(2, unit * Math.sqrt(this.market.shown[i]));
      b.side += (target - b.side) * (cast.reduced ? 1 : k);
    }
    const mid = sheet.pads.side + sheet.boxW / 2;
    const gap = 0.16 * sheet.boxH;
    l.x = mid - gap / 2 - l.side / 2;
    r.x = mid + gap / 2 + r.side / 2;
    l.y = r.y = sheet.pads.top + sheet.boxH;
    for (const b of this.bodies) {
      const other = b === l ? r : l;
      if (looking && t < looking.leave + 0.3) cast.lookToward(b.face, other.cx - b.cx, other.cy - b.cy);
      else {
        const [x, y] = sheet.client(b.cx, b.cy);
        if (!cast.watch(b.face, x, y, b.side, pointer, t * 1000, 200)) cast.field.glance(b.face);
      }
      b.step(dt);
    }
    if (!drawn) return;
    const ctx = sheet.begin();
    for (const b of this.bodies) b.draw(ctx, cast, t * 1000, sheet.boxH / Math.sqrt(Math.PI));
    for (const f of this.market.flights) drawFlight(ctx, f, this.bodies, unit, t);
  }
}

// ——— the family ———

type Mode = 'photo' | 'deal' | 'play' | 'done';

/** Words the figure carries (its data-*), so the page's words stay in the page. */
interface Words {
  readonly names: string[];
  readonly won: string[];
  readonly led: string;
  readonly count: string;
  readonly play: string;
  readonly pause: string;
  readonly resume: string;
  readonly again: string;
}

/** Seconds between trades, the k-th: slow enough to follow at first, then quicker and quicker. */
export const interval = (k: number) => Math.max(0.075, 0.9 * 0.94 ** k);

export class Family implements Mount {
  readonly faces: number;
  readonly host: HTMLElement;
  private readonly sheet: Sheet;
  private readonly colours: ColorName[];
  private readonly heights: number[];
  private readonly words: Words;
  private readonly firstSeed: number;
  private readonly stake: number;
  private readonly until: number;
  private readonly button: HTMLButtonElement | null;
  private readonly result: HTMLElement | null;
  private cast: Cast | null = null;
  private bodies: Body[] = [];
  private mode: Mode = 'photo';
  private market: Market | null = null;
  private games = 0;
  private paused = false;
  /** The market's own clock: stops while paused. */
  private clock = 0;
  private next = 0;
  private dealt = 0;
  private stopped = false;
  /** The highest share the first person (the page's author) has held this game. */
  private peak = 0;
  /** Glances between them in the photo: who looks at whom, until when. */
  private gazes: { at: number; until: number }[] = [];
  private nextGaze = 1;
  private hops: number[] = [];
  private hovered = -1;
  private xs: number[] = [];
  private labelW: number[] = [];

  constructor(host: HTMLElement) {
    this.host = host;
    const d = host.dataset;
    const list = (s: string | undefined) => (s ?? '').split('|').map((x) => x.trim());
    const names = list(d.names);
    this.faces = Math.max(1, names.length);
    const colours = list(d.colours);
    this.colours = names.map((_, i) => (isColour(colours[i]) ? colours[i] : (['blue', 'red', 'green', 'teal', 'violet', 'pink'] as const)[i % 6]));
    const h = list(d.heights).map(Number);
    this.heights = names.map((_, i) => clamp(h[i] || 1, 0.2, 1));
    this.words = {
      names,
      // data-won-0 … (a hyphen before a digit stays in the dataset's key)
      won: names.map((_, i) => d[`won-${i}`] ?? '{p}'),
      led: d.led ?? '',
      count: d.count ?? '{n}',
      play: d.play ?? 'Play',
      pause: d.pause ?? 'Pause',
      resume: d.resume ?? 'Go on',
      again: d.again ?? 'Again',
    };
    this.firstSeed = Number(d.seed) || 1;
    this.stake = clamp(Number(d.stake) || 0.3, 0.01, 0.9);
    this.until = clamp(Number(d.until) || 0.8, 0.3, 0.99);
    const photo = host.querySelector<HTMLElement>('.photo') ?? host;
    this.sheet = new Sheet(photo, photo.getAttribute('aria-label') ?? undefined);
    this.button = host.querySelector('button');
    this.result = host.querySelector('.result');
    if (this.button) this.button.textContent = this.words.play;
    this.button?.addEventListener('click', () => this.press());
  }

  bind(cast: Cast, first: number): void {
    this.cast = cast;
    this.bodies = this.colours.map((c, i) => {
      cast.field.temper(first + i, temperOf(i === 0 ? 'glad' : undefined, (first + i) * 17 + 11, 0.8));
      return new Body(first + i, c, 10);
    });
    this.gazes = this.bodies.map(() => ({ at: -1, until: 0 }));
    this.hops = this.heights.map(() => 2 + Math.random() * 4);
    this.xs = this.bodies.map(() => NaN);
    // a square under the pointer smiles at the reader; clicked, it hops
    const photo = this.sheet.host;
    photo.addEventListener('pointermove', (e) => {
      const i = this.under(e.clientX, e.clientY);
      if (i !== this.hovered && i >= 0) {
        cast.field.startle(this.bodies[i].face, 0.25);
        cast.field.feel(this.bodies[i].face, 0.3, 0.2);
      }
      this.hovered = i;
    });
    photo.addEventListener('pointerleave', () => (this.hovered = -1));
    photo.addEventListener('click', (e) => {
      const i = this.under(e.clientX, e.clientY);
      if (i >= 0 && !cast.reduced) this.bodies[i].hop(0.5 * this.bodies[i].side);
    });
  }

  /** Who is under a client point, or −1. */
  private under(x: number, y: number): number {
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      const [x0, y0] = this.sheet.client(b.x - b.w / 2, b.y - b.lift - b.h);
      if (x >= x0 - 3 && x <= x0 + b.w + 3 && y >= y0 - 3 && y <= y0 + b.h + 3) return i;
    }
    return -1;
  }

  private press(): void {
    const cast = this.cast;
    if (!cast) return;
    if (this.mode === 'play') {
      this.paused = !this.paused;
      this.label();
      return;
    }
    // a new game: everyone gets the same, the first time from the page's seed, then by chance
    const seed = this.games++ === 0 ? this.firstSeed : 1 + Math.floor(Math.random() * 1e9);
    this.market = new Market(this.bodies.length, seed, this.stake);
    this.peak = this.market.shown[0];
    this.stopped = false;
    this.paused = false;
    this.clock = 0;
    this.next = 0;
    for (const b of this.bodies) {
      cast.field.startle(b.face, 0.4);
      cast.field.feel(b.face, 0.45, 0.4);
      cast.field.contemptTo[b.face] = 0;
    }
    if (cast.reduced) {
      // no motion: straight to how it ends
      const m = this.market;
      playOut(m, this.until, 2000, () => (this.peak = Math.max(this.peak, m.shown[0])));
      // felt once, from the equal start to how it ended
      for (let i = 0; i < this.bodies.length; i++) cast.field.react(this.bodies[i].face, 1 / this.bodies.length, m.shown[i], FEEL);
      this.finish();
      return;
    }
    this.mode = 'deal';
    this.dealt = 0;
    if (this.result) this.result.textContent = '';
    this.label();
  }

  private label(): void {
    if (!this.button) return;
    const w = this.words;
    this.button.textContent = this.mode === 'play' ? (this.paused ? w.resume : w.pause) : this.mode === 'done' ? w.again : w.play;
  }

  private finish(): void {
    const m = this.market;
    const cast = this.cast;
    if (!m || !cast) return;
    m.settle();
    this.mode = 'done';
    const [i, share] = m.top();
    const p = `${Math.round(share * 100)}%`;
    let text = this.words.won[i].replace('{p}', p);
    if (i !== 0 && this.peak >= 0.5 && this.words.led) text += ` ${this.words.led}`;
    if (this.result) this.result.textContent = text;
    this.label();
  }

  /** Each one's side now, px: by height in the photo, by beans in the game (an equal share is `unit`). */
  private targets(unit: number, photo: number): number[] {
    const m = this.market;
    if (this.mode === 'photo' || !m) return this.heights.map((h) => photo * h);
    if (this.mode === 'deal') return this.bodies.map(() => unit);
    return this.bodies.map((_, i) => Math.max(2, unit * Math.sqrt(m.shown[i] * this.bodies.length)));
  }

  frame(t: number, dt: number, pointer: Pointer, drawn: boolean): void {
    const cast = this.cast;
    if (!cast) return;
    const sheet = this.sheet;
    sheet.fit(() => ({ top: 0, side: 0, bottom: 0 }));
    const n = this.bodies.length;
    const ground = sheet.h - 26;
    // a game stops once someone holds `until` (one trade may take it a little past): that much, with room
    // over it for a hop, fits above the ground; the photo's tallest stands half as tall again as a share
    const room = sheet.w - 12 * (n + 1);
    const unit = Math.min(46, (ground - 22) / Math.sqrt(n * Math.min(1, this.until + 0.06)), room / (n * 1.25));
    const photo = Math.min(unit * 1.55, ground - 24, room / this.heights.reduce((a, b) => a + b, 0));
    const ctx = sheet.ctx;
    ctx.font = '13px Vazirmatn, system-ui, sans-serif';
    this.labelW = this.words.names.map((s) => ctx.measureText(s).width);

    // the game
    const m = this.market;
    if (this.mode === 'deal') {
      this.dealt += dt;
      if (this.dealt > 1) {
        this.mode = 'play';
        this.label();
      }
    }
    let fast = false;
    if (this.mode === 'play' && m && !this.paused) {
      this.clock += dt;
      if (!this.stopped && this.clock >= this.next) {
        const k = m.trades;
        const gap = interval(k);
        const look = Math.min(0.5, 0.55 * gap);
        m.trade(this.clock, look, clamp(0.85 * gap, 0.16, 0.5));
        this.next = this.clock + gap;
        this.peak = Math.max(this.peak, m.game.wealth[0]);
        if (m.top()[1] >= this.until || m.trades >= 600) this.stopped = true;
      }
      fast = interval(m.trades) < 0.3;
      m.advance(this.clock, (who, before, after) => {
        const b = this.bodies[who];
        cast.field.react(b.face, before, after, FEEL);
        if (after < before) b.squash(1.1);
        else b.swell = 1;
      });
      if (this.stopped && !m.flights.length) this.finish();
      if (this.result && this.mode === 'play') this.result.textContent = this.words.count.replace('{n}', String(m.trades));
    }
    // whoever holds most of it looks down on the rest
    for (let i = 0; i < n; i++) {
      const share = m && this.mode !== 'photo' ? m.shown[i] : 0;
      cast.field.contemptTo[this.bodies[i].face] = clamp((share - 0.5) / 0.3, 0, 1);
    }

    // sizes and places: each in a slot wide enough for its name, the row centred
    const target = this.targets(unit, photo);
    const k = cast.reduced ? 1 : ease(dt, 0.12);
    for (let i = 0; i < n; i++) this.bodies[i].side += (target[i] - this.bodies[i].side) * k;
    const gap = 12;
    const slots = this.bodies.map((b, i) => Math.max(b.side, this.labelW[i] + 6));
    let x = (sheet.w - slots.reduce((a, b) => a + b, 0) - gap * (n - 1)) / 2;
    const kx = cast.reduced ? 1 : ease(dt, 0.18);
    for (let i = 0; i < n; i++) {
      const b = this.bodies[i];
      const want = x + slots[i] / 2;
      this.xs[i] = Number.isNaN(this.xs[i]) ? want : this.xs[i] + (want - this.xs[i]) * kx;
      b.x = this.xs[i];
      b.y = ground;
      x += slots[i] + gap;
    }

    // where they look: partners at each other; in the slow part everyone else at the spinner;
    // in the photo, at the pointer, at each other, about
    const trade = m && this.mode === 'play' ? m.flights[m.flights.length - 1] : undefined;
    const meeting = trade && this.clock < trade.leave + 0.25 ? trade : undefined;
    for (let i = 0; i < n; i++) {
      const b = this.bodies[i];
      if (meeting && (i === meeting.from || i === meeting.to)) {
        const o = this.bodies[i === meeting.from ? meeting.to : meeting.from];
        cast.lookToward(b.face, o.cx - b.cx, o.cy - b.cy);
        continue;
      }
      if (meeting && !fast) {
        const [sx, sy] = this.spinnerAt(meeting, unit);
        cast.lookToward(b.face, sx - b.cx, sy - b.cy);
        continue;
      }
      if (i === this.hovered) {
        cast.field.look(b.face, 0, 0);
        continue;
      }
      const [cx, cy] = sheet.client(b.cx, b.cy);
      if (cast.watch(b.face, cx, cy, b.side, pointer, t * 1000, 260)) continue;
      const g = this.gazes[i];
      if (this.mode === 'photo' && g.at >= 0 && t < g.until) {
        const o = this.bodies[g.at];
        cast.lookToward(b.face, o.cx - b.cx, o.cy - b.cy);
      } else cast.field.glance(b.face);
    }
    if (this.mode === 'photo' && !cast.reduced) {
      // now and then one looks at another; the little ones hop
      if (t >= this.nextGaze) {
        this.nextGaze = t + 1.2 + Math.random() * 2.4;
        const i = Math.floor(Math.random() * n);
        let j = Math.floor(Math.random() * (n - 1));
        if (j >= i) j++;
        this.gazes[i] = { at: j, until: t + 1.2 + Math.random() };
      }
      for (let i = 0; i < n; i++) {
        if (t < this.hops[i]) continue;
        const keen = clamp((0.9 - this.heights[i]) * 3, 0, 1);
        this.hops[i] = t + 3 + Math.random() * 5;
        if (Math.random() < keen) this.bodies[i].hop((0.25 + 0.2 * Math.random()) * this.bodies[i].side);
      }
    }
    for (const b of this.bodies) b.step(dt);
    if (!drawn) return;

    const c = sheet.begin();
    const r0 = (this.mode === 'photo' ? photo : unit) / Math.sqrt(Math.PI);
    for (const b of this.bodies) b.draw(c, cast, t * 1000, r0);
    if (m && this.mode === 'play') {
      for (const f of m.flights) drawFlight(c, f, this.bodies, unit * Math.sqrt(n), this.clock);
      if (meeting && !fast) {
        const [sx, sy] = this.spinnerAt(meeting, unit);
        const v = clamp((this.clock - meeting.t0) / Math.max(1e-3, meeting.leave - meeting.t0), 0, 1);
        const w = this.bodies[meeting.to];
        const end = Math.atan2(-(w.cy - sy), w.cx - sx);
        const turn = ((end - meeting.spin) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) + 4 * Math.PI;
        const alpha = Math.min(1, v * 5, (meeting.leave + 0.25 - this.clock) * 5);
        drawSpinner(c, sx, sy, clamp(0.26 * unit, 7, 12), meeting.spin + turn * (1 - (1 - v) ** 3), alpha);
      }
    }
    // names under their squares
    c.font = '13px Vazirmatn, system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillStyle = MUTED;
    for (let i = 0; i < n; i++) c.fillText(this.words.names[i], this.bodies[i].x, ground + 18);
  }

  /** Where a meeting's spinner stands: above the two, between them. */
  private spinnerAt(f: Flight, unit: number): [number, number] {
    const a = this.bodies[f.from];
    const b = this.bodies[f.to];
    const r = clamp(0.26 * unit, 7, 12);
    const top = Math.min(a.y - a.h, b.y - b.h);
    return [(a.x + b.x) / 2, Math.max(r + 2, top - r - 8)];
  }
}
