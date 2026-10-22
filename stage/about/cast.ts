/**
 * The about page's people: the stage's squares (its colours, its line, its
 * resting density) with the essay's faces, small enough to stand in a line of
 * text. Nothing here draws a character: the bodies are the stage's squares,
 * the faces are the engine's, and everything else is how they move.
 *
 *   Cast    one FaceField for every face on the page, one painter each
 *   Body    a square standing on a point: hops, squash and stretch, a tilt, a shake, a swell
 *   Sheet   a canvas laid over a gap in the prose, a little bigger than the gap (room to hop)
 */
import { COLOR_NAMES, FILLS, STROKES, type ColorName } from '../essay/agentStyle.ts';
import { FacePainter } from '../essay/face/draw.ts';
import { faceRadius } from '../essay/face/face.ts';
import { FaceField } from '../essay/face/field.ts';
import { FEELINGS, temperament, type Temperament } from '../essay/face/moments.ts';
import { paint } from '../view/faces.ts';

export const INK = '#28251f';
export const PAPER = '#fffaf0';
export const MUTED = '#7a7262';

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export const isColour = (s: string | undefined): s is ColorName => !!s && (COLOR_NAMES as readonly string[]).includes(s);

/**
 * A feeling word (moments.ts FEELINGS: glad, proud, tired …) held as somebody's
 * resting temperament: the word's push, `strength` times over. Any other word,
 * or none, gets a seeded everyday temperament, as the stage's crowd has.
 */
export function temperOf(word: string | undefined, seed: number, strength = 1.6): Temperament {
  const f = word ? FEELINGS[word] : undefined;
  if (!f) return temperament(seed);
  const k = (x: number) => clamp(x * strength, -1, 1);
  return { v0: k(f.v), a0: k(f.a), d0: k(f.d), smirk: 0.3, reactivity: 1, drift: 0.05 };
}

/** Where the reader's pointer is, client px, and when it last moved (performance.now ms). */
export interface Pointer {
  x: number;
  y: number;
  at: number;
}

/** How long a still pointer keeps the eyes on it, ms. */
const POINTER_HOLD = 1800;

export class Cast {
  readonly field: FaceField;
  /** Reduced motion: no blinks, no hops; feelings still show. */
  readonly reduced: boolean;
  private readonly painters: FacePainter[];

  constructor(n: number, reduced: boolean) {
    this.field = new FaceField(n, 3);
    this.reduced = reduced;
    this.painters = Array.from({ length: n }, () => new FacePainter());
  }

  get n(): number {
    return this.field.n;
  }

  /**
   * Face `i` on a body `w` × `h` px centred on (cx, cy), as the stage sizes it
   * (Faces.draw): `r0` is an equal share's radius, so a body bigger than its
   * share grows its face a little and slows its rhythms. `shut`: eyes closed.
   */
  face(ctx: CanvasRenderingContext2D, i: number, cx: number, cy: number, w: number, h: number, r0: number, colour: ColorName, now: number, shut = false): void {
    const f = this.field;
    const short = Math.min(w, h);
    const r = Math.sqrt((w * h) / Math.PI);
    const s = Math.round(Math.min(faceRadius(r, r0), 0.45 * short) * 4) / 4;
    f.size(i, r, r0);
    f.still[i] = s < 7 ? 1 : 0;
    if (s < 4) return;
    const read = f.poseOf(i, this.reduced);
    const pose = shut ? { ...read.pose, blink: 1 } : read.pose;
    const d = this.painters[i].paint('manga', 'square', Math.max(0.6, Math.min(r, short / Math.sqrt(Math.PI))), s, pose, read.marks, f.seed[i], now);
    if (d) paint(ctx, d, cx, cy, STROKES[colour], FILLS[colour]);
  }

  /**
   * Face `i` turns toward something `dx`, `dy` px away (y down). Closer than
   * `near` px it is looking at the one holding it: at the reader.
   */
  lookToward(i: number, dx: number, dy: number, near = 0): void {
    const d = Math.hypot(dx, dy);
    if (!(d > 0)) return this.field.look(i, 0, 0);
    const k = near > 0 ? clamp((d - near) / (2 * near), 0, 1) : 1;
    this.field.look(i, (0.9 * k * dx) / d, (0.55 * k * dy) / d);
  }

  /**
   * Face `i`, whose centre is at (x, y) client px, looks at the pointer if it
   * moved lately and is within `reach` px. Returns whether it did.
   */
  watch(i: number, x: number, y: number, side: number, pointer: Pointer, now: number, reach: number): boolean {
    if (!(now - pointer.at < POINTER_HOLD)) return false;
    const dx = pointer.x - x;
    const dy = pointer.y - y;
    if (!(Math.hypot(dx, dy) < reach)) return false;
    this.lookToward(i, dx, dy, side * 0.6);
    return true;
  }
}

/** Squash and stretch: a spring on the height (the width keeps the area). */
const SPRING = 320;
const DAMP = 16;

export class Body {
  readonly face: number;
  colour: ColorName;
  /** The side at rest, px. */
  side: number;
  /** Where it stands: the middle of its bottom edge, canvas px. */
  x = 0;
  y = 0;
  /** A hop: height above the ground and speed upward, px and px/s. */
  lift = 0;
  vy = 0;
  /** Height × stretch, width ÷ stretch. */
  stretch = 1;
  private stretchV = 0;
  /** Leaning, radians (about its feet), eased toward `tiltTo`. */
  tilt = 0;
  tiltTo = 0;
  /** Seconds of shaking left. */
  shake = 0;
  /** A short swell (something arrived), decaying. */
  swell = 0;
  /** Eyes shut (drinking). */
  shut = false;

  constructor(face: number, colour: ColorName, side: number) {
    this.face = face;
    this.colour = colour;
    this.side = side;
  }

  get airborne(): boolean {
    return this.lift > 0 || this.vy > 0;
  }

  /** Gravity in sides: small people hop quickly, big ones slowly, all the same shape of arc. */
  private get g(): number {
    return 26 * Math.max(4, this.side);
  }

  /** Up, `height` px: a stretch at take-off, a squash on landing. */
  hop(height: number): void {
    if (this.airborne || !(height > 0)) return;
    this.vy = Math.sqrt(2 * this.g * height);
    this.stretchV += 2.5;
  }

  /** A squash (a piece leaving), or a stretch for `amount` < 0. */
  squash(amount: number): void {
    this.stretchV -= amount;
  }

  step(dt: number): void {
    if (this.airborne) {
      this.vy -= this.g * dt;
      this.lift += this.vy * dt;
      if (this.lift <= 0) {
        const impact = -this.vy / Math.max(4, this.side);
        this.lift = 0;
        this.vy = 0;
        this.stretchV -= Math.min(6, 0.9 * impact);
      }
    }
    this.stretchV += (-(this.stretch - 1) * SPRING - this.stretchV * DAMP) * dt;
    this.stretch = clamp(this.stretch + this.stretchV * dt, 0.72, 1.3);
    this.tilt += (this.tiltTo - this.tilt) * (1 - Math.exp(-dt / 0.12));
    this.shake = Math.max(0, this.shake - dt);
    this.swell *= Math.exp(-dt / 0.18);
  }

  /** Width and height as drawn. */
  get w(): number {
    return (this.side / this.stretch) * (1 + 0.07 * this.swell);
  }

  get h(): number {
    return this.side * this.stretch * (1 + 0.07 * this.swell);
  }

  /** The middle of the body as drawn, canvas px (the face's centre, near enough under a tilt). */
  get cx(): number {
    return this.x - Math.sin(this.tilt) * (this.h / 2);
  }

  get cy(): number {
    return this.y - this.lift - Math.cos(this.tilt) * (this.h / 2);
  }

  /**
   * The stage's square: its pastel fill at a resting density, its outline, its
   * face; a shadow left on the ground while it hops. `r0`: an equal share's
   * radius (default: its own, an ordinary face). `extra` draws in the body's
   * own frame (feet at the origin), after the face: a sticker moves with it.
   */
  draw(ctx: CanvasRenderingContext2D, cast: Cast, now: number, r0 = NaN, extra?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): void {
    const { w, h } = this;
    if (!(w > 0.3 && h > 0.3)) return;
    if (this.lift > 0.5) {
      const far = clamp(1 - this.lift / (3 * this.side), 0.3, 1);
      ctx.fillStyle = `rgba(40, 37, 31, ${0.16 * far})`;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, Math.max(1, w * 0.45 * far), Math.max(0.6, w * 0.1 * far), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const jitter = this.shake > 0 ? Math.sin(now * 0.09) * Math.min(1.4, 0.06 * this.side) * Math.min(1, this.shake / 0.1) : 0;
    ctx.save();
    ctx.translate(this.x + jitter, this.y - this.lift);
    if (this.tilt) ctx.rotate(this.tilt);
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = FILLS[this.colour];
    ctx.fillRect(-w / 2, -h, w, h);
    ctx.globalAlpha = 1;
    if (Math.min(w, h) > 1.2) {
      ctx.lineJoin = 'round';
      ctx.strokeStyle = STROKES[this.colour];
      ctx.lineWidth = Math.min(1.25, 0.25 * Math.min(w, h));
      ctx.strokeRect(-w / 2, -h, w, h);
    }
    const own = Math.sqrt((w * h) / Math.PI);
    cast.face(ctx, this.face, 0, -h / 2, w, h, Number.isNaN(r0) ? own : r0, this.colour, now / 1000, this.shut);
    extra?.(ctx, w, h);
    ctx.restore();
  }
}

/** Room around the gap, px: above for hops and the marks over a head, beside for leaning and stickers. */
interface Pads {
  readonly top: number;
  readonly side: number;
  readonly bottom: number;
}

/**
 * A canvas over its host (a span or a div in the prose), larger than the host
 * by `pads`, never catching the pointer: the host does that. Sized to the host
 * every frame it is drawn, so zooming or reflowing the text just works.
 */
export class Sheet {
  readonly host: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** The host's box and the canvas's, CSS px. */
  boxW = 0;
  boxH = 0;
  w = 0;
  h = 0;
  pads: Pads = { top: 0, side: 0, bottom: 0 };
  private dpr = 1;

  constructor(host: HTMLElement, label?: string) {
    this.host = host;
    this.canvas = document.createElement('canvas');
    if (label) {
      this.canvas.setAttribute('role', 'img');
      this.canvas.setAttribute('aria-label', label);
    } else this.canvas.setAttribute('aria-hidden', 'true');
    host.append(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    this.ctx = ctx;
  }

  /** Fit to the host (pads from its size); true if anything changed. */
  fit(pads: (w: number, h: number) => Pads): boolean {
    const bw = this.host.clientWidth;
    const bh = this.host.clientHeight;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (bw === this.boxW && bh === this.boxH && dpr === this.dpr) return false;
    this.boxW = bw;
    this.boxH = bh;
    this.dpr = dpr;
    this.pads = pads(bw, bh);
    const p = this.pads;
    this.w = bw + 2 * p.side;
    this.h = bh + p.top + p.bottom;
    const c = this.canvas;
    c.style.left = `${-p.side}px`;
    c.style.top = `${-p.top}px`;
    c.style.width = `${this.w}px`;
    c.style.height = `${this.h}px`;
    c.width = Math.max(1, Math.round(this.w * dpr));
    c.height = Math.max(1, Math.round(this.h * dpr));
    return true;
  }

  /** A clean canvas in CSS px. */
  begin(): CanvasRenderingContext2D {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    return ctx;
  }

  /** A canvas point in client px. */
  client(x: number, y: number): [number, number] {
    const r = this.host.getBoundingClientRect();
    return [r.left - this.pads.side + x, r.top - this.pads.top + y];
  }
}

/** Something on the page with faces: told which faces are its own, then ticked and drawn every frame it is on screen. */
export interface Mount {
  /** How many faces it needs. */
  readonly faces: number;
  /** Its faces are `first` … `first + faces − 1` in the cast's field. */
  bind(cast: Cast, first: number): void;
  /** `t` seconds since the page started, `dt` since the last frame. `drawn`: on screen. */
  frame(t: number, dt: number, pointer: Pointer, drawn: boolean): void;
  readonly host: HTMLElement;
}
