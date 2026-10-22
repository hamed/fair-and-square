/**
 * Faces on the bodies, from the essay's own face engine
 * (src/lib/widgets/shared/face): its temperaments, its feelings and its
 * drawings. Nothing here draws a character; it only decides what each person
 * feels and where they look, and puts the engine's paths on a canvas.
 *
 *   wealth changes   → FaceField.react (felt on a log scale)
 *   bumps            → a small startle
 *   walking          → looks where it goes; standing → glances about
 *   in the air       → looks down at where it will land
 *
 * The engine draws SVG paths (FaceElement); this paints the same layers in
 * the same order with Path2D, so faces sit in the canvas's z-order.
 */
import { GROUND, WHITE, FacePainter, type FaceDrawing, type FaceMark } from '../essay/face/draw.ts';
import { faceRadius, type FaceLook } from '../essay/face/face.ts';
import { FaceField } from '../essay/face/field.ts';
import { FEELINGS, temperament } from '../essay/face/moments.ts';
import type { AgentShape } from '../essay/agentStyle.ts';
import type { Stage } from '../core/stage.ts';

interface Paths {
  readonly transform: readonly [string, number[]][];
  readonly parts: Map<string, Path2D>;
}

export class Faces {
  readonly field: FaceField;
  private readonly painters: FacePainter[];
  private readonly seen: Float64Array;
  /** Face size relative to normal: a flinch shrinks it for a moment. Eased toward `scaleTo`. */
  readonly scale: Float64Array;
  readonly scaleTo: Float64Array;
  /** Seconds each face keeps looking at the reader (a `face … camera` request, a cheer). */
  private readonly hold: Float64Array;
  /** Seconds each face keeps a flush it was asked for. */
  private readonly flush: Float64Array;
  /** Reduced motion: faces hold still (no blinks, no glances, no sway). */
  reduced = false;

  /** `field`: faces already living (the opening's), to go on with instead of new ones. */
  constructor(wealth: ArrayLike<number>, seed = 1, field?: FaceField) {
    const n = wealth.length;
    if (field && field.n === n) this.field = field;
    else {
      this.field = new FaceField(n, seed);
      for (let i = 0; i < n; i++) this.field.temper(i, temperament(i * 13 + 5 + seed * 7919));
    }
    this.painters = Array.from({ length: n }, () => new FacePainter());
    this.seen = Float64Array.from(wealth);
    this.scale = new Float64Array(n).fill(1);
    this.scaleTo = new Float64Array(n).fill(1);
    this.hold = new Float64Array(n);
    this.flush = new Float64Array(n);
  }

  /**
   * Face `i` asked to: look at the reader (`camera`), cheer (a burst of joy, looking at you), rest (back to
   * its temperament), or feel a feeling word (moments.ts FEELINGS, a push that fades; `shy` also flushes).
   */
  ask(i: number, what: string, seconds: number): void {
    const f = this.field;
    if (i < 0 || i >= f.n) return;
    if (what === 'camera') this.hold[i] = Math.max(this.hold[i], seconds);
    else if (what === 'cheer') {
      f.feel(i, 0.9, 0.45, 0.15);
      this.hold[i] = Math.max(this.hold[i], Math.min(seconds, 1.5));
    } else if (what === 'rest') {
      f.rest(i);
      this.hold[i] = 0;
      this.flush[i] = 0;
      f.blushTo[i] = 0;
    } else {
      const e = FEELINGS[what];
      if (!e) return;
      f.feel(i, 1.6 * e.v, 1.6 * e.a, 1.6 * e.d);
      if (e.n > 0) f.startle(i, e.n);
      if (e.blush) {
        f.blushTo[i] = e.blush;
        this.flush[i] = seconds;
      }
    }
  }

  get n(): number {
    return this.field.n;
  }

  /**
   * Feelings and looks for this frame. `pointer`: where the reader's pointer is (yard units), while it moves:
   * faces near it turn to look at it.
   */
  update(dt: number, stage: Stage, wealth: ArrayLike<number>, looks: readonly (readonly [number, number])[] = [], debt?: ArrayLike<boolean>, pointer?: { x: number; y: number } | null): void {
    const f = this.field;
    for (let i = 0; i < f.n; i++) {
      if (debt?.[i]) {
        // in debt: sad and small-spirited, felt steadily (a fortune measured on a log scale has no meaning here)
        f.feel(i, -1.5 * dt, 0, -0.8 * dt);
        this.seen[i] = wealth[i];
        f.glance(i);
        continue;
      }
      // a fortune felt once it has moved by a tenth of a percent, not every coin
      const before = this.seen[i];
      if (Math.abs(wealth[i] - before) > 1e-3 * before) {
        // what is seen happening is felt: a piece leaving, a piece arriving, the levy's beat
        f.react(i, before, wealth[i], FEEL);
        this.seen[i] = wealth[i];
      }
      const speed = Math.hypot(stage.vx[i], stage.vy[i]);
      if (this.flush[i] > 0) {
        this.flush[i] -= dt;
        if (this.flush[i] <= 0) f.blushTo[i] = 0;
      }
      if (this.hold[i] > 0) {
        // asked to look at the reader: (0, 0) is straight out of the screen
        this.hold[i] -= dt;
        f.look(i, 0, 0);
      } else if (stage.air[i] > 0) f.look(i, 0, 0.6);
      else if (speed > 0.05) f.look(i, (0.9 * stage.vx[i]) / speed, (-0.5 * stage.vy[i]) / speed);
      else f.glance(i);
    }
    // faces near the reader's pointer follow it (a toddler's finger, a mouse): the nearer, the surer
    if (pointer && !this.reduced) {
      for (let i = 0; i < f.n; i++) {
        if (this.hold[i] > 0 || stage.air[i] > 0) continue;
        const dx = pointer.x - (stage.x[i] + stage.w[i] / 2);
        const dy = pointer.y - (stage.y[i] + stage.h[i] / 2);
        const d = Math.hypot(dx, dy);
        if (d > POINTER_REACH || d < 1e-6) continue;
        f.look(i, (0.9 * dx) / Math.max(d, 0.15), (-0.5 * dy) / Math.max(d, 0.15));
      }
    }
    // partners in a trade look at each other (+ yaw right, + pitch down on screen)
    for (const [i, j] of looks) {
      const dx = stage.x[j] + stage.w[j] / 2 - (stage.x[i] + stage.w[i] / 2);
      const dy = stage.y[j] + stage.h[j] / 2 - (stage.y[i] + stage.h[i] / 2);
      const d = Math.hypot(dx, dy) || 1;
      f.look(i, (0.9 * dx) / d, (-0.5 * dy) / d);
    }
    const ease = 1 - Math.exp(-dt / 0.12);
    for (let i = 0; i < f.n; i++) this.scale[i] += (this.scaleTo[i] - this.scale[i]) * ease;
    const b = stage.bumps;
    for (let k = 0; k + 1 < b.length; k += 2) {
      f.startle(b[k], 0.35);
      f.startle(b[k + 1], 0.35);
    }
    f.step(dt);
  }

  /**
   * Face `i` at (cx, cy) px on a body of `r` px (equal-area radius), `short`
   * px across its narrow side; `r0` is an equal share's radius in px.
   */
  /**
   * Something is about to be taken from face `i` (a levy): it flinches, and
   * feels the loss now, from `before` to `after` (worry, or anger in the
   * dominant: FaceField.react). The drawn wealth catching up later is not felt twice.
   */
  brace(i: number, before: number, after: number): void {
    this.field.react(i, before, after, FEEL);
    this.field.startle(i, 0.25);
    this.seen[i] = after;
    this.scaleTo[i] = 0.8;
  }

  /** Back to normal size. */
  relax(i: number): void {
    this.scaleTo[i] = 1;
  }

  draw(ctx: CanvasRenderingContext2D, i: number, look: FaceLook, shape: AgentShape, cx: number, cy: number, r: number, short: number, r0: number, pen: string, fill: string, now: number): void {
    const f = this.field;
    // never smaller than a face that fits (owner, 2026-10-21: the small square lost its face); too small for one,
    // two dots for eyes, as the logo's smallest have; smaller still, nothing
    const fits = 0.45 * short;
    const s = Math.round(Math.min(Math.max(faceRadius(r, r0), FACE_FLOOR * short), fits) * this.scale[i] * 4) / 4;
    f.size(i, r, r0);
    f.still[i] = s < 7 ? 1 : 0;
    if (s < DOTS_MIN) return;
    if (s < FACE_MIN) {
      // two dots for eyes and a short mouth that bends with the mood: a face, however small
      const k = 1.15 * s;
      const curve = f.poseOf(i, this.reduced).pose.expression?.mouthCurve ?? 0;
      ctx.fillStyle = pen;
      for (const e of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(cx + e * 0.3 * k, cy - 0.12 * k, Math.max(0.7, 0.085 * k), 0, Math.PI * 2);
        ctx.fill();
      }
      if (s >= 2.5) {
        // wide enough and bent enough to read at a few pixels: a smile, a flat line, a frown
        const bend = Math.max(-1, Math.min(1, 2 * curve));
        ctx.strokeStyle = pen;
        ctx.lineWidth = Math.max(0.8, 0.08 * k);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 0.24 * k, cy + (0.2 - 0.08 * bend) * k);
        ctx.quadraticCurveTo(cx, cy + (0.2 + 0.3 * bend) * k, cx + 0.24 * k, cy + (0.2 - 0.08 * bend) * k);
        ctx.stroke();
      }
      return;
    }
    const read = f.poseOf(i, this.reduced);
    const d = this.painters[i].paint(look, shape, Math.max(0.6, Math.min(r, short / Math.sqrt(Math.PI))), s, read.pose, read.marks, f.seed[i], now);
    if (d) paint(ctx, d, cx, cy, pen, fill);
  }
}

/** Reactions are amplified a little so small trades still show on a face. */
const FEEL = 2.5;
/** A face is never less than this share of its square's width across (radius over side): a poor square's face shrinks, it never vanishes. */
const FACE_FLOOR = 0.32;
/** The smallest face drawn whole (radius, px: smaller, its eyes would not show), and the smallest that is two dots. */
const FACE_MIN = 6;
const DOTS_MIN = 1.5;
/** How near the pointer a face must be to follow it, yard units. */
const POINTER_REACH = 0.7;

const cache = new WeakMap<FaceDrawing, Paths>();

function pathsOf(d: FaceDrawing): Paths {
  let p = cache.get(d);
  if (p) return p;
  const transform: [string, number[]][] = [];
  for (const m of d.transform.matchAll(/(translate|rotate|scale)\(([^)]*)\)/g)) {
    transform.push([m[1], m[2].trim().split(/[\s,]+/).map(Number)]);
  }
  const parts = new Map<string, Path2D>();
  for (const key of ['white', 'clip', 'clipped', 'ink', 'lid', 'rings', 'glint', 'lines', 'thin', 'heavy'] as const) {
    if (d[key]) parts.set(key, new Path2D(d[key]));
  }
  p = { transform, parts };
  cache.set(d, p);
  return p;
}

/** FaceElement's layers, in its order, on a canvas. */
export function paint(ctx: CanvasRenderingContext2D, d: FaceDrawing, cx: number, cy: number, stroke: string, fill: string): void {
  const { transform, parts } = pathsOf(d);
  const pen = d.inked ? '#28251f' : stroke;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.save();
  for (const [op, v] of transform) {
    if (op === 'translate') ctx.translate(v[0] ?? 0, v[1] ?? 0);
    else if (op === 'rotate') ctx.rotate(((v[0] ?? 0) * Math.PI) / 180);
    else ctx.scale(v[0] ?? 1, v[1] ?? v[0] ?? 1);
  }
  marks(ctx, d.under, pen);
  const fillPart = (key: string, colour: string, alpha = 1) => {
    const p = parts.get(key);
    if (!p) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colour;
    ctx.fill(p);
    ctx.globalAlpha = 1;
  };
  const strokePart = (key: string, width: number) => {
    const p = parts.get(key);
    if (!p) return;
    ctx.strokeStyle = pen;
    ctx.lineWidth = width;
    ctx.stroke(p);
  };
  fillPart('white', WHITE);
  const clip = parts.get('clip');
  if (clip && parts.has('clipped')) {
    ctx.save();
    ctx.clip(clip);
    fillPart('clipped', pen);
    ctx.restore();
  }
  fillPart('ink', pen);
  fillPart('lid', GROUND);
  fillPart('lid', fill, 0.9);
  strokePart('rings', d.lineWidth * 0.85);
  fillPart('glint', WHITE);
  strokePart('lines', d.lineWidth);
  strokePart('thin', d.lineWidth * 0.7);
  strokePart('heavy', d.lineWidth * 1.3);
  marks(ctx, d.over, pen);
  ctx.restore();
  marks(ctx, d.outer, pen);
  ctx.restore();
}

function marks(ctx: CanvasRenderingContext2D, list: readonly FaceMark[], pen: string): void {
  for (const m of list) {
    const p = new Path2D(m.d);
    ctx.globalAlpha = m.opacity;
    if (m.fill && m.fill !== 'none') {
      ctx.fillStyle = m.fill;
      ctx.fill(p);
    }
    if (m.stroke !== 'none' && m.width > 0) {
      ctx.strokeStyle = m.stroke || pen;
      ctx.lineWidth = m.width;
      ctx.stroke(p);
    }
    ctx.globalAlpha = 1;
  }
}
