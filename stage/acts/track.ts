/**
 * Time on stage. A Track is steps one after another, each `dur` long, drawn
 * at a fraction u ∈ [0, 1] of the step; a frame that skips a step still
 * begins and ends it, so later steps start from where it ended.
 *
 * A Money is a piece of money with its own track, built from a handful of
 * steps that every act uses (area.ts does the arithmetic). Its `area` is how
 * big it is drawn, in the pose's scale; it may change size on the way (a
 * travel's or a reshape's target of another area), and docks as whatever
 * area its host takes in:
 *
 *   mark     the cut line appears on its source
 *   lift     the piece comes off, a gap opens          (the money is off: `offAt`)
 *   reshape  it changes shape, keeping its area
 *   wait     it stays where it is
 *   travel   it goes somewhere on a bow, changing shape on the way if asked
 *   close    it goes back where it came from (it was never really off)
 *   dock     it joins a host by the single join rule: the gap closes, its colour turns, the seam fades
 *   merge    the host is one body again                (the money is on: `onAt`)
 */
import { at, away, centreOf, cut, join, morph, seam, GAP, lerp, type Box, type Side } from '../core/area.ts';
import { DUR, bow, fast, smooth } from '../core/motion.ts';
import type { Blend, Scene } from './scene.ts';

/**
 * The stage as acts see it: each body's box now, the walls, the wealth each
 * is drawn with, and the area a wealth is drawn at in the pose's scale (the
 * arithmetic is in wealth; `measure` is only how big it looks).
 */
export interface Live {
  readonly n: number;
  box(i: number): Box;
  readonly right: number;
  readonly top: number;
  drawn(i: number): number;
  measure(w: number): number;
}

export interface Step {
  readonly dur: number;
  /** Once, as the step begins. */
  begin?(live: Live): void;
  draw(u: number, live: Live, scene: Scene): void;
  /** Once, as it ends. */
  end?(live: Live): void;
}

export class Track {
  /** Act time at which the track starts. */
  readonly start: number;
  length = 0;
  private readonly steps: Step[] = [];
  private begun = -1;
  private ended = -1;

  constructor(start = 0) {
    this.start = start;
  }

  /** Append a step; returns the act time it starts. */
  add(step: Step): number {
    const t = this.start + this.length;
    this.steps.push(step);
    this.length += step.dur;
    return t;
  }

  get end(): number {
    return this.start + this.length;
  }

  draw(t: number, live: Live, scene: Scene): void {
    if (t < this.start) return;
    let s = this.start;
    for (let k = 0; k < this.steps.length; k++) {
      const step = this.steps[k];
      const e = s + step.dur;
      if (k > this.begun) {
        this.begun = k;
        step.begin?.(live);
      }
      if (t < e) {
        step.draw(step.dur > 0 ? (t - s) / step.dur : 1, live, scene);
        return;
      }
      if (k > this.ended) {
        this.ended = k;
        step.end?.(live);
      }
      s = e;
    }
  }
}

/** How far through its change of shape a piece is, at u of a travel. */
type Shaping = (u: number) => number;

export class Money {
  readonly track: Track;
  /** How big it is drawn when it comes off (or appears). */
  readonly area: number;
  /** Whose colour, or a blend of several. */
  colour: number;
  blend: Blend | undefined;
  /** Where it is (null: not on stage). */
  box: Box | null = null;
  /** Act times the money comes off its source and is taken in by its host (NaN: not this piece's). */
  offAt = NaN;
  onAt = NaN;
  private source = -1;
  private side: Side = 1;
  private rest: Box | null = null;
  private piece: Box | null = null;
  /** The source is drawn as what the cut left, until released. */
  private holding = false;
  private joined: Box | null = null;
  /** How far it was lifted off its source. */
  private lifted = GAP;

  constructor(area: number, colour: number, start = 0, blend?: Blend) {
    this.area = area;
    this.colour = colour;
    this.blend = blend;
    this.track = new Track(start);
  }

  get end(): number {
    return this.track.end;
  }

  draw(t: number, live: Live, scene: Scene): void {
    this.track.draw(t, live, scene);
  }

  private put(scene: Scene, box: Box, extra: { to?: number; turn?: number } = {}): void {
    scene.pieces.push({ box, alpha: 0.95, colour: this.colour, blend: this.blend, ...extra });
  }

  /** The source drawn as the cut left it, or (releasing) easing back to its own box. */
  private hold(scene: Scene, live: Live, release: number | null): void {
    if (!this.holding || !this.rest) return;
    scene.display.set(this.source, release === null ? this.rest : lerp(this.rest, live.box(this.source), smooth(release)));
  }

  /** Appear at `box` (a share dealt from a pile). */
  from(box: Box): this {
    this.track.add({ dur: 0, begin: () => (this.box = box), draw: () => {} });
    return this;
  }

  /** The cut line on `box` (the source `source` as it stood), the slice of this area at its `side` end. */
  mark(source: number, box: Box, side: Side, dur: number = DUR.mark): this {
    const { piece, rest } = cut(box, side, this.area);
    this.track.add({
      dur,
      begin: () => {
        this.source = source;
        this.side = side;
        this.piece = piece;
        this.rest = rest;
        this.box = piece;
      },
      draw: (u, _live, scene) => scene.lines.push({ ...seam(piece, side), alpha: smooth(u / 0.6) }),
    });
    return this;
  }

  /** The slice comes off, a gap opens (`distance`, a hair by default): the money is off its source from here. */
  lift(dur: number = DUR.lift, distance = GAP): this {
    this.lifted = distance;
    const t = this.track.add({
      dur,
      draw: (u, _live, scene) => {
        this.box = away(this.piece!, this.side, distance * smooth(u));
        scene.display.set(this.source, this.rest!);
        this.put(scene, this.box);
      },
      end: () => {
        this.box = away(this.piece!, this.side, distance);
        this.holding = true;
      },
    });
    this.offAt = t + dur;
    return this;
  }

  /** Change shape (keeping the area) to `to`, quickly, then hold; `release`: the source eases back to its own box meanwhile. */
  reshape(to: (m: Money, live: Live) => Box, opts: { dur?: number; release?: boolean } = {}): this {
    const dur = opts.dur ?? DUR.reshape;
    let from: Box;
    let target: Box;
    this.track.add({
      dur,
      begin: (live) => {
        from = this.box!;
        target = to(this, live);
      },
      draw: (u, live, scene) => {
        this.box = morph(from, target, fast(u));
        this.hold(scene, live, opts.release ? u : null);
        this.put(scene, this.box);
      },
      end: () => {
        this.box = target;
        if (opts.release) this.holding = false;
      },
    });
    return this;
  }

  /** Stay where it is; `release`: the source eases back to its own box meanwhile. */
  wait(dur: number, opts: { release?: boolean } = {}): this {
    if (dur <= 0) return this;
    this.track.add({
      dur,
      draw: (u, live, scene) => {
        this.hold(scene, live, opts.release ? u : null);
        if (this.box) this.put(scene, this.box);
      },
      end: () => {
        if (opts.release) this.holding = false;
      },
    });
    return this;
  }

  /**
   * Go to `to` on a bow bending by `bend`; `shaping` says how far through
   * becoming `to`'s shape it is on the way (default: it keeps its own); `trail`
   * leaves fading copies behind.
   */
  travel(dur: number, to: (live: Live, m: Money) => Box, opts: { bend?: number; shaping?: Shaping; trail?: boolean } = {}): this {
    let from: Box;
    const bend = opts.bend ?? 0;
    this.track.add({
      dur,
      begin: () => (from = this.box!),
      draw: (u, live, scene) => {
        const target = to(live, this);
        const [x0, y0] = centreOf(from);
        const [x1, y1] = centreOf(target);
        const where = (v: number) => bow(x0, y0, x1, y1, bend, smooth(Math.min(1, Math.max(0, v))));
        if (opts.trail) {
          for (let k = 5; k >= 1; k--) {
            const [x, y] = where(u - k * 0.06);
            scene.pieces.push({ box: at({ x: 0, y: 0, w: from.w * 0.84, h: from.h * 0.84 }, x, y), alpha: 0.28 * (1 - k / 6), colour: this.colour, blend: this.blend });
          }
        }
        const shape = opts.shaping ? morph(from, target, opts.shaping(u)) : from;
        const [x, y] = where(u);
        this.box = at(shape, x, y);
        this.put(scene, this.box);
      },
      end: (live) => (this.box = to(live, this)),
    });
    return this;
  }

  /** Back where it came from: the gap closes, the cut line fades. It was never really off. */
  close(dur: number): this {
    this.track.add({
      dur,
      draw: (u, _live, scene) => {
        const back = away(this.piece!, this.side, this.lifted * (1 - smooth(u / 0.6)));
        scene.display.set(this.source, this.rest!);
        this.put(scene, back);
        scene.lines.push({ ...seam(back, this.side), alpha: 1 - smooth((u - 0.6) / 0.4) });
      },
      end: () => {
        this.box = null;
        this.holding = false;
      },
    });
    return this;
  }

  /**
   * Join `host` (a body, or a fixed box such as a pile) on `side` by the single
   * rule, as `area` (default its own): the gap closes, the colour turns to the
   * host's (`turn`), the seam fades (`seam`). A share bigger than its host
   * stays a square and the host becomes the bar.
   */
  dock(host: number | Box, side: Side, opts: { dur?: number; turn?: boolean; seam?: boolean; area?: number } = {}): this {
    const dur = opts.dur ?? DUR.dock;
    const a = opts.area ?? this.area;
    const hostBox = (live: Live) => (typeof host === 'number' ? live.box(host) : host);
    const t = this.track.add({
      dur,
      draw: (u, live, scene) => {
        const h = hostBox(live);
        const close = smooth(u / 0.6);
        const j = join(h, a, side, GAP * (1 - close));
        if (typeof host === 'number' && j.host !== h) scene.display.set(host, morph(h, j.host, fast(u / 0.35)));
        const turn = opts.turn !== false && typeof host === 'number' ? { to: host, turn: smooth(u) } : {};
        this.put(scene, j.piece, turn);
        if (opts.seam !== false && close > 0) scene.lines.push({ ...seam(j.piece, side), alpha: 1 - smooth((u - 0.6) / 0.4) });
        this.joined = join(h, a, side, 0).joined;
      },
      end: (live) => {
        this.joined = join(hostBox(live), a, side, 0).joined;
        this.box = null;
      },
    });
    if (typeof host !== 'number') this.onAt = t + dur;
    return this;
  }

  /** One body again: the host eases from the joined box to its own. The money is on from here. */
  merge(host: number, dur: number = DUR.merge): this {
    this.onAt = this.track.add({
      dur,
      draw: (u, live, scene) => {
        if (this.joined) scene.display.set(host, lerp(this.joined, live.box(host), smooth(u)));
      },
    });
    return this;
  }
}
