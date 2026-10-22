/**
 * Faces as a few path strings, computed in plain code and cached per face, so
 * a page of a hundred faces is a handful of attribute writes a frame rather
 * than a hundred components (owner, 2026-10-07: "do the calculations … in
 * vector or batches; also drawing").
 *
 * Every look maps the same pose to its own geometry through the shared neutral
 * + basis (`faceGeometry`). The features sit on the front of a head-sized
 * sphere: turning the head slides them toward the turn, narrows the far eye
 * and closes the eyes' spacing, so a flat face reads as a turned one.
 */
import type { AgentShape } from '../agentStyle';
import { boundPose, clamp, faceAnchor, faceGeometry, topEdge, wobble, type FaceGeometry, type FaceLook, type FacePose, type Marks } from './face';
import { HEAD_PITCH, HEAD_YAW } from './field';

/** A mark in its own colour: blush, sweat, a vein, gloom, sparkles … */
export interface FaceMark {
  readonly d: string;
  readonly fill: string;
  readonly stroke: string;
  readonly width: number;
  readonly opacity: number;
}

/** A face, ready to draw: paths in paint order, in the face's own frame (`transform`). */
export interface FaceDrawing {
  /** Places the face on its body: anchor, roll, size. */
  readonly transform: string;
  /** Under everything: the blush. */
  readonly under: readonly FaceMark[];
  /** Filled white: eye whites. */
  readonly white: string;
  /** Filled in the body's stroke colour (or ink): eyes, pupils, open mouths. */
  readonly ink: string;
  /** Lids: the eye openings, and what is drawn only inside them. */
  readonly clip: string;
  readonly clipped: string;
  /** Peekers' lids: the paper, then the body's own fill over it. */
  readonly lid: string;
  /** Outlines of white eyes. */
  readonly rings: string;
  /** White over the ink: glints. */
  readonly glint: string;
  /** Lines in three weights: ordinary, thin and heavy. */
  readonly lines: string;
  readonly thin: string;
  readonly heavy: string;
  readonly lineWidth: number;
  /** The ink look draws in ink, not in the body's stroke colour. */
  readonly inked: boolean;
  /** Over the features: tears, sweat, a vein, gloom. */
  readonly over: readonly FaceMark[];
  /** Over the head, in the body's own frame: the startle's "!", sparkles. */
  readonly outer: readonly FaceMark[];
}

export const WHITE = '#fffaf0';
export const INK = '#28251f';
/** The page's paper, under a peeker's lid. */
export const GROUND = '#f4efe4';
const BLUSH = 'rgb(222 92 104 / 70%)';
const TEAR = '#5b93cc';
const TEAR_FILL = '#cfe5f7';
const VEIN = '#c8463c';
const TONGUE = 'rgb(214 96 108 / 90%)';

/** The drawings' unit: a face a little wider than its radius. */
const K = 1.15;
/** The head's sphere, in that unit: features slide over it as it turns. */
const RS = 0.75;

const F = (x: number) => String(Math.round(x * 100) / 100);

// ---- the projection, for the drawing in hand: turn (radians) and unit (px)

let turnX = 0;
let turnY = 0;
let unit = 1;

/** Where a feature at (x, y), in drawing units, lands once the head has turned: px. */
function px(x: number): number {
  const f = Math.asin(clamp(x / RS, -0.97, 0.97));
  return RS * Math.sin(clamp(f + turnX, -1.5, 1.5)) * unit;
}
function py(y: number): number {
  const t = Math.asin(clamp(y / RS, -0.97, 0.97));
  return RS * Math.sin(clamp(t - turnY, -1.5, 1.5)) * unit;
}
/** How much a feature at x narrows (or widens) as the head turns; and at y. */
function sx(x: number): number {
  const f = Math.asin(clamp(x / RS, -0.97, 0.97));
  return Math.max(0.15, Math.cos(clamp(f + turnX, -1.5, 1.5)) / Math.cos(f));
}
function sy(y: number): number {
  const t = Math.asin(clamp(y / RS, -0.97, 0.97));
  return Math.max(0.15, Math.cos(clamp(t - turnY, -1.5, 1.5)) / Math.cos(t));
}
const pt = (x: number, y: number) => `${F(px(x))} ${F(py(y))}`;
/** An ellipse about a feature at (x, y), radii in drawing units, turned with the head. */
function oval(x: number, y: number, rx: number, ry: number, minX = 0, minY = 0): string {
  const cx = px(x);
  const cy = py(y);
  const a = Math.max(minX, rx * sx(x) * unit);
  const b = Math.max(minY, ry * sy(y) * unit);
  return `M${F(cx - a)} ${F(cy)}a${F(a)} ${F(b)} 0 1 0 ${F(2 * a)} 0a${F(a)} ${F(b)} 0 1 0 ${F(-2 * a)} 0Z`;
}

// ---- the looks: each fills a drawing from the shared geometry

interface Parts {
  white: string;
  ink: string;
  clip: string;
  clipped: string;
  lid: string;
  rings: string;
  glint: string;
  lines: string;
  thin: string;
  heavy: string;
  under: FaceMark[];
  over: FaceMark[];
}

const blank = (): Parts => ({ white: '', ink: '', clip: '', clipped: '', lid: '', rings: '', glint: '', lines: '', thin: '', heavy: '', under: [], over: [] });

interface Ctx {
  readonly p: Required<FacePose>;
  readonly ch: FaceGeometry;
  readonly marks: Marks;
  readonly seed: number;
  /** The drawing unit in px (k), and whether glints are big enough to show. */
  readonly k: number;
  readonly shut: number;
  readonly dotOpen: number;
  readonly beam: boolean;
}

/** The shared mouth at height y0, scaled by w: ink when open, a line when shut. */
function mouth(c: Ctx, y0: number, w: number, out: Parts): void {
  const { ch } = c;
  const half = ch.mouthHalf * w;
  const cv = ch.mouthCurve * w;
  const o = ch.mouthOpen * 0.3 * w;
  const corner = y0 - cv;
  // a smirk lifts the right-hand corner and lets the other sag a little
  const cl = corner + 0.25 * w * ch.mouthSmirk;
  const cr = corner - w * ch.mouthSmirk;
  const upperMid = y0 + 0.5 * cv - 0.3 * o;
  const uc = 2 * upperMid - corner;
  const lc = 2 * (upperMid + o) - corner;
  if (o > 0.02) {
    const d = `M${pt(-half, cl)}Q${pt(0, uc)} ${pt(half, cr)}Q${pt(0, lc)} ${pt(-half, cl)}Z`;
    out.ink += d;
    out.lines += d;
  } else out.lines += `M${pt(-half, cl)}Q${pt(0, uc)} ${pt(half, cr)}`;
}

function lids(c: Ctx, out: Parts): void {
  const { ch, p } = c;
  // the lids look is drawn in face radii; the drawing unit is K of them
  const s = 1 / K;
  for (const side of [-1, 1]) {
    const cx = side * 0.32 * s;
    const cy = -0.12 * s;
    const rx = 0.13 * s * ch.eyeScale;
    const ry = 0.155 * s * ch.eyeScale;
    const yu = cy - ry + 2 * ry * c.shut;
    const yl = cy + ry - ry * ch.lowerLid;
    const innerLeft = side > 0;
    const slant = ch.lidSlant * s * (1 - c.shut * 0.6);
    const xl = cx - rx;
    const xr = cx + rx;
    const yLeft = Math.min(yl, yu + (innerLeft ? slant : -slant));
    const yRight = Math.min(yl, yu + (innerLeft ? -slant : slant));
    const sag = 0.25 * ry * (1 - c.shut);
    const push = 0.6 * ry * ch.lowerLid;
    if (yu >= yl - 0.01 * s) {
      // shut: one line, an arch when the cheeks are up (a smile), else a soft dip
      const mid = (yu + yl) / 2;
      out.lines += `M${pt(xl, mid)}Q${pt(cx, mid + (ch.lowerLid > 0.3 ? -0.9 : 0.5) * ry * 0.5)} ${pt(xr, mid)}`;
    } else {
      const opening = `M${pt(xl, yLeft)}Q${pt(cx, yu + sag)} ${pt(xr, yRight)}L${pt(xr, yl)}Q${pt(cx, yl - push)} ${pt(xl, yl)}Z`;
      out.white += opening;
      out.clip += opening;
      const pr = 0.072 * s * ch.pupil;
      out.clipped += oval(cx + p.gaze.yaw * (rx - pr) * 0.85, cy + p.gaze.pitch * (ry - pr) * 0.85, pr, pr);
      out.lines += `M${pt(xl, yLeft)}Q${pt(cx, yu + sag)} ${pt(xr, yRight)}`;
      if (ch.lowerLid > 0.04) out.thin += `M${pt(xl, yl)}Q${pt(cx, yl - push)} ${pt(xr, yl)}`;
    }
    if (ch.crinkle > 0.3) {
      for (const angle of [-0.45, 0, 0.45]) {
        const x0 = cx + side * (rx + 0.03 * s);
        const len = 0.07 * s * ch.crinkle;
        out.thin += `M${pt(x0, cy + 0.02 * s)}L${pt(x0 + side * len * Math.cos(angle), cy + 0.02 * s + len * Math.sin(angle))}`;
      }
    }
    const ix = side * ch.browInnerX * s;
    const ox = side * 0.46 * s;
    const iy = ch.browInnerY * s;
    const oy = ch.browOuterY * s;
    out.heavy += `M${pt(ix, iy)}Q${pt(side * 0.3 * s, Math.min(iy, oy) - 0.03 * s)} ${pt(ox, oy)}`;
  }
  mouth(c, 0.3 * s, s, out);
}

/** The shared brows, moved to sit over eyes at `eyeY`. */
function brows(c: Ctx, eyeY: number, out: Parts): void {
  const { ch } = c;
  const dy = eyeY + 0.12;
  for (const side of [-1, 1]) {
    const iy = ch.browInnerY + dy;
    const oy = ch.browOuterY + dy;
    out.lines += `M${pt(side * (ch.browInnerX - 0.01), iy)}Q${pt(side * 0.26, Math.min(iy, oy) - 0.03)} ${pt(side * 0.38, oy)}`;
  }
}

function dots(c: Ctx, withBrows: boolean, out: Parts): void {
  const { ch } = c;
  const er = (withBrows ? 0.07 : 0.085) * ch.eyeScale;
  const ex = withBrows ? 0.27 : 0.33;
  const ey = withBrows ? -0.04 : -0.1;
  for (const side of [-1, 1]) out.ink += oval(side * ex, ey, er, er * c.dotOpen, 0.9, 0.5);
  if (withBrows) brows(c, ey, out);
  mouth(c, withBrows ? 0.2 : 0.22, 0.75, out);
}

function beans(c: Ctx, out: Parts): void {
  const { ch } = c;
  for (const side of [-1, 1]) {
    const ex = side * 0.26;
    out.ink += oval(ex, -0.07, 0.068 * ch.eyeScale, 0.14 * ch.eyeScale * c.dotOpen, 0.9, 0.5);
    if (c.k >= 12 && c.dotOpen > 0.5) out.glint += oval(ex - 0.024, -0.07 - 0.06 * c.dotOpen, 0.03, 0.03);
  }
  // no mouth until there is something to say or feel
  if (Math.abs(ch.mouthCurve) > 0.03 || ch.mouthOpen > 0.08 || Math.abs(c.p.expression.smirk) > 0.15) mouth(c, 0.23, 0.6, out);
}

function googly(c: Ctx, out: Parts): void {
  const { ch, p } = c;
  const R = 0.17 * ch.eyeScale;
  const pr = 0.085 * ch.pupil;
  const open = Math.min(1, (1 - c.shut) / 0.8) * (1 - 0.6 * ch.lowerLid);
  const len = Math.max(1, Math.hypot(p.gaze.yaw, p.gaze.pitch));
  const reach = R - pr - 0.02;
  for (const side of [-1, 1]) {
    const ex = side * 0.3;
    const ball = oval(ex, -0.1, R, R * open, 0, 0.6);
    out.white += ball;
    out.rings += ball;
    if (open > 0.3) out.ink += oval(ex + (p.gaze.yaw / len) * reach, -0.1 + (p.gaze.pitch / len) * reach * open, pr, pr * Math.min(1, open * 1.4));
  }
  mouth(c, 0.24, 0.65, out);
}

function ink(c: Ctx, out: Parts): void {
  const { ch, seed } = c;
  const j = (n: number) => wobble(seed, n) * 0.02;
  const wide = c.p.expression.eyeOpening > 0.55;
  for (const [n, side] of [-1, 1].entries()) {
    const ex = side * 0.27 + wobble(seed, 20 + n) * 0.02;
    if (c.shut > 0.8) out.lines += `M${pt(ex - 0.07, -0.08)}L${pt(ex + 0.07, -0.075)}`;
    else if (wide) out.lines += oval(ex, -0.09, 0.065, 0.065);
    else if (c.beam) out.lines += `M${pt(ex - 0.08, -0.05)}Q${pt(ex, -0.2)} ${pt(ex + 0.08, -0.05)}`;
    else {
      const half = 0.095 * Math.max(0.15, c.dotOpen) * ch.eyeScale;
      out.lines += `M${pt(ex + wobble(seed, 24 + n) * 0.015, -0.095 - half)}L${pt(ex + wobble(seed, 26 + n) * 0.015, -0.095 + half)}`;
    }
  }
  if (ch.mouthOpen > 0.1) {
    const rx = ch.mouthHalf * 0.55;
    const ry = 0.025 + 0.09 * ch.mouthOpen;
    const y = 0.22 - ch.mouthCurve * 0.4;
    const d = `M${pt(-rx, y)}Q${pt(-rx, y - ry)} ${pt(0, y - ry - j(1))}Q${pt(rx, y - ry)} ${pt(rx + j(2), y)}Q${pt(rx, y + ry)} ${pt(0, y + ry)}Q${pt(-rx, y + ry + j(3))} ${pt(-rx, y)}Z`;
    out.ink += d;
    out.lines += d;
  } else {
    const bow = ch.mouthCurve * 0.85;
    const y = 0.2 - ch.mouthCurve * 0.3;
    const sm = ch.mouthSmirk;
    out.lines += `M${pt(-0.14, y + j(4) + 0.25 * sm)}C${pt(-0.05, y + bow + j(5))} ${pt(0.05, y + bow + j(6))} ${pt(0.14 + j(7), y + j(8) - sm)}`;
  }
}

/** A glaring eye: the oval cut along a slant, the lid coming down hard at the inner corner. */
function glareEye(cx: number, cy: number, rx: number, ry: number, side: number, out: Parts): void {
  const inX = cx - side * rx * 1.25;
  const outX = cx + side * rx * 1.25;
  const inY = cy - ry * 0.3;
  const outY = cy - ry * 1.15;
  const below = (x: number, y: number) => y >= inY + ((x - inX) / (outX - inX)) * (outY - inY);
  const pts: string[] = [];
  for (let k = 0; k <= 24; k++) {
    const t = (k / 24) * Math.PI * 2;
    const x = cx + rx * Math.cos(t);
    const y = cy + ry * Math.sin(t);
    if (below(x, y)) pts.push(pt(x, y));
  }
  if (pts.length > 2) out.ink += `M${pts.join('L')}Z`;
  out.heavy += `M${pt(inX, inY)}L${pt(outX, outY)}`;
}

function manga(c: Ctx, out: Parts): void {
  const { ch, p, marks } = c;
  const x = p.expression;
  const mc = x.mouthCurve;
  const mo = ch.mouthOpen;
  const shock = x.eyeOpening > 0.85;
  const big = x.eyeOpening > 0.45;
  const lidded = x.eyeOpening < -0.25;
  // a laugh squeezes the eyes shut, cheeks up; a lidded face that is only talking keeps its lids
  const squeeze = mo > 0.55 && x.eyeOpening < -0.3 && x.cheekLift > 0.3;
  const glare = x.browSlope > 0.4;
  const tears = marks.tears ?? 0;
  for (const side of [-1, 1]) {
    const ex = side * 0.3;
    const ey = -0.08;
    if (p.blink > 0.6 || x.eyeOpening < -0.8) {
      // shut: a calm arc when the cheeks are up, a line otherwise
      out.lines += `M${pt(ex - 0.1, ey)}Q${pt(ex, ey + (x.cheekLift > 0.3 ? -0.07 : 0.035))} ${pt(ex + 0.1, ey)}`;
    } else if (squeeze) {
      // > <
      out.lines += `M${pt(ex + side * 0.08, ey - 0.08)}L${pt(ex - side * 0.06, ey)}L${pt(ex + side * 0.08, ey + 0.08)}`;
    } else if (c.beam) {
      // ^ ^
      out.lines += `M${pt(ex - 0.11, ey + 0.04)}Q${pt(ex, ey - 0.13)} ${pt(ex + 0.11, ey + 0.04)}`;
    } else if (tears > 0.4) {
      // T T, and the stream
      out.over.push({ d: `M${pt(ex, ey + 0.02)}L${pt(ex, 0.34)}`, fill: 'none', stroke: TEAR, width: Math.max(1.4, 0.075 * c.k), opacity: 0.75 * tears });
      out.lines += `M${pt(ex - 0.12, ey - 0.03)}L${pt(ex + 0.12, ey - 0.03)}M${pt(ex, ey - 0.03)}L${pt(ex, ey + 0.04)}`;
    } else if (shock) {
      // ◎
      const ring = oval(ex, ey, 0.13, 0.13);
      out.white += ring;
      out.rings += ring;
      out.ink += oval(ex, ey, 0.04, 0.04);
    } else {
      const rx = big ? 0.095 : 0.075;
      const ry = (big ? 0.125 : 0.1) * Math.max(0.15, 1 - p.blink) * (1 - 0.45 * ch.lowerLid);
      if (glare) {
        // anger first: a glare wins over heavy lids
        glareEye(ex, ey, rx, ry, side, out);
      } else if (lidded) {
        // a heavy lid: the oval cut flat across the top — sleepy, bored, contempt
        const cut = ey - ry * 0.15;
        const sl = ch.lidSlant * 1.5;
        const a = rx * sx(ex) * unit;
        const b = ry * sy(ey) * unit;
        const cx = px(ex);
        const cy = py(cut);
        out.ink += `M${F(cx - a)} ${F(cy)}A${F(a)} ${F(b)} 0 0 0 ${F(cx + a)} ${F(cy)}Z`;
        out.lines += `M${pt(ex - rx * 1.25, cut + side * sl)}L${pt(ex + rx * 1.25, cut - side * sl)}`;
      } else {
        out.ink += oval(ex, ey, rx, ry);
        if (c.k >= 14) out.glint += oval(ex - 0.3 * rx, ey - 0.35 * ry, 0.32 * rx, 0.32 * rx);
      }
    }
    if (Math.abs(x.browSlope) > 0.25 || x.browLift > 0.45) {
      // brows only when they have something to say: down at the inner end for anger, up for worry, arched for surprise
      const lift = 0.09 * Math.max(0, x.browLift);
      const tilt = 0.07 * x.browSlope;
      const by = ey - 0.2 - lift;
      out.lines += `M${pt(ex - side * 0.08, by + tilt)}Q${pt(ex + side * 0.03, by - 0.03 - (x.browLift > 0.45 ? 0.03 : 0))} ${pt(ex + side * 0.14, by - 0.4 * tilt)}`;
    }
  }
  if (mo > 0.25 && Math.abs(mc) < 0.25) {
    // O
    out.ink += oval(0, 0.21, 0.045 + 0.03 * mo, 0.05 + 0.06 * mo);
  } else if (mo > 0.45 && mc >= 0.2) {
    // D: a laugh, with a tongue
    const w = 0.1 + 0.05 * mo;
    const h = 0.1 + 0.12 * mo;
    out.ink += `M${pt(-w, 0.15)}L${pt(w, 0.15)}Q${pt(w, 0.15 + h)} ${pt(0, 0.15 + h)}Q${pt(-w, 0.15 + h)} ${pt(-w, 0.15)}Z`;
    out.over.push({ d: oval(0, 0.15 + h * 0.72, w * 0.5, h * 0.22), fill: TONGUE, stroke: 'none', width: 0, opacity: 1 });
  } else if (mo > 0.12 && mc >= -0.2) {
    // ▽
    const mw = 0.08 + 0.06 * mo;
    const mh = 0.03 + 0.14 * mo;
    out.ink += `M${pt(-mw, 0.15)}L${pt(mw, 0.15)}L${pt(0, 0.15 + mh)}Z`;
  } else if (mo > 0.12) {
    // □: a shout
    const h = 0.06 + 0.12 * mo;
    out.ink += `M${pt(-0.06, 0.16)}L${pt(0.06, 0.16)}L${pt(0.1, 0.16 + h)}L${pt(-0.1, 0.16 + h)}Z`;
  } else if (Math.abs(x.smirk) > 0.35) {
    // a smirk: one corner hooks up; when the mouth also turns down, the other end sags — a sneer
    const sd = Math.sign(x.smirk);
    const hook = 0.05 + 0.05 * Math.abs(x.smirk);
    const sag = 0.1 * Math.max(0, -mc);
    out.lines += `M${pt(-sd * 0.12, 0.2 + sag)}L${pt(sd * 0.03, 0.2)}Q${pt(sd * 0.1, 0.2)} ${pt(sd * 0.13, 0.2 - hook)}`;
  } else if (mc > 0.45) {
    // ‿ wide
    out.lines += `M${pt(-0.15, 0.17)}Q${pt(0, 0.31)} ${pt(0.15, 0.17)}`;
  } else if (mc > 0.15) {
    // ‿
    out.lines += `M${pt(-0.1, 0.19)}Q${pt(0, 0.26)} ${pt(0.1, 0.19)}`;
  } else if (mc < -0.45) {
    // ～
    const amp = 0.02 + 0.03 * Math.min(1, -mc);
    out.lines += `M${pt(-0.12, 0.23)}Q${pt(-0.09, 0.23 - 2 * amp)} ${pt(-0.06, 0.23)}Q${pt(-0.03, 0.23 + 2 * amp)} ${pt(0, 0.23)}Q${pt(0.03, 0.23 - 2 * amp)} ${pt(0.06, 0.23)}Q${pt(0.09, 0.23 + 2 * amp)} ${pt(0.12, 0.23)}`;
  } else if (mc < -0.15) {
    // ︵
    out.lines += `M${pt(-0.09, 0.24)}Q${pt(0, 0.17)} ${pt(0.09, 0.24)}`;
  } else {
    // ω
    out.lines += `M${pt(-0.11, 0.15)}Q${pt(-0.11, 0.21)} ${pt(-0.055, 0.21)}Q${pt(0, 0.21)} ${pt(0, 0.15)}Q${pt(0, 0.21)} ${pt(0.055, 0.21)}Q${pt(0.11, 0.21)} ${pt(0.11, 0.15)}`;
  }
  mangaMarks(c, out);
}

/** Manga's marks, over the face: the /// of a flush, gloom, a drop of sweat, a vein. */
function mangaMarks(c: Ctx, out: Parts): void {
  const { marks, k } = c;
  const lw = Math.min(4, Math.max(1.1, 0.075 * k));
  const hatch = marks.blushLines ?? 0;
  if (hatch > 0.02) {
    let d = '';
    for (const side of [-1, 1]) for (const j of [-1, 0, 1]) {
      const cx = side * 0.36 + j * 0.05;
      d += `M${pt(cx - 0.02, 0.14)}L${pt(cx + 0.02, 0.06)}`;
    }
    out.over.push({ d, fill: 'none', stroke: BLUSH, width: Math.max(1, lw * 0.8), opacity: hatch });
  }
  const gloom = marks.gloom ?? 0;
  if (gloom > 0.02) {
    let d = '';
    for (const x of [-0.16, -0.04, 0.08, 0.2]) d += `M${pt(x, -0.52)}L${pt(x, -0.3 - Math.abs(x) * 0.3)}`;
    out.over.push({ d, fill: 'none', stroke: '', width: Math.max(0.8, lw * 0.6), opacity: 0.4 * gloom });
  }
  const sweat = marks.sweat ?? 0;
  if (sweat > 0.02) {
    const dx = 0.46;
    const dy = -0.36;
    out.over.push({
      d: `M${pt(dx, dy - 0.13)}C${pt(dx + 0.03, dy - 0.06)} ${pt(dx + 0.07, dy - 0.02)} ${pt(dx + 0.07, dy + 0.02)}Q${pt(dx + 0.07, dy + 0.09)} ${pt(dx, dy + 0.09)}Q${pt(dx - 0.07, dy + 0.09)} ${pt(dx - 0.07, dy + 0.02)}C${pt(dx - 0.07, dy - 0.02)} ${pt(dx - 0.03, dy - 0.06)} ${pt(dx, dy - 0.13)}Z`,
      fill: TEAR_FILL,
      stroke: TEAR,
      width: Math.max(0.9, lw * 0.7),
      opacity: sweat,
    });
  }
  const vein = marks.vein ?? 0;
  if (vein > 0.02) {
    // 💢 the anger vein, up on the other temple
    const vx = -0.44;
    const vy = -0.4;
    let d = '';
    for (const a of [-1, 1]) for (const b of [-1, 1]) d += `M${pt(vx + a * 0.03, vy + b * 0.1)}Q${pt(vx + a * 0.02, vy + b * 0.02)} ${pt(vx + a * 0.1, vy + b * 0.03)}`;
    out.over.push({ d, fill: 'none', stroke: VEIN, width: Math.max(1.1, lw * 0.9), opacity: vein });
  }
}

/** Peekers sit on the outline itself, in the body's own frame: they skip the face's anchor. */
function peek(c: Ctx, shape: AgentShape, r: number, out: Parts): void {
  const { ch, p } = c;
  const k = c.k;
  const R = 0.2 * k * ch.eyeScale;
  const pr = 0.1 * k * ch.pupil;
  const len = Math.max(1, Math.hypot(p.gaze.yaw, p.gaze.pitch));
  for (const side of [-1, 1]) {
    const ex = px(side * 0.3);
    const ey = topEdge(shape, r, ex) + 0.05 * k;
    const w = R * sx(side * 0.3);
    if (c.beam || c.shut > 0.9) {
      out.lines += `M${F(ex - w * 0.8)} ${F(ey + R * 0.15)}Q${F(ex)} ${F(ey + (c.beam ? -R * 1.1 : R * 0.3))} ${F(ex + w * 0.8)} ${F(ey + R * 0.15)}`;
      continue;
    }
    const ball = `M${F(ex - w)} ${F(ey)}a${F(w)} ${F(R)} 0 1 0 ${F(2 * w)} 0a${F(w)} ${F(R)} 0 1 0 ${F(-2 * w)} 0Z`;
    out.white += ball;
    out.rings += ball;
    const reach = R - pr - 0.02 * k;
    const qx = ex + (p.gaze.yaw / len) * reach * (w / R);
    const qy = ey + (p.gaze.pitch / len) * reach;
    out.ink += `M${F(qx - pr)} ${F(qy)}a${F(pr)} ${F(pr)} 0 1 0 ${F(2 * pr)} 0a${F(pr)} ${F(pr)} 0 1 0 ${F(-2 * pr)} 0Z`;
    if (c.shut > 0.05) {
      // a lid over the top of the round eye, shut to `shut` of its height
      const cy = -R + 2 * R * Math.min(0.95, c.shut);
      const half = Math.sqrt(Math.max(0, R * R - cy * cy)) * (w / R);
      const segment = `M${F(ex - half)} ${F(ey + cy)}A${F(w)} ${F(R)} 0 ${cy > 0 ? 1 : 0} 1 ${F(ex + half)} ${F(ey + cy)}Z`;
      out.lid += segment;
      out.rings += segment;
    }
  }
}

/** How often a drifting mood may redraw a face, seconds: about fifteen times a second. */
const MOOD_GAP = 0.066;

const LOOK_ID: Record<FaceLook, number> = { manga: 1, lids: 2, dots: 3, beans: 4, googly: 5, peek: 6, brows: 7, ink: 8 };
const PUPILS: ReadonlySet<FaceLook> = new Set(['lids', 'googly', 'peek']);

/**
 * One face's painter: it remembers what it last drew and redraws only when the
 * pose has moved enough to show. The same drawing comes back while nothing
 * visible changed, so a face at rest costs nothing downstream.
 */
export class FacePainter {
  private key = NaN;
  private motion = NaN;
  private built = -Infinity;
  /** The last paint held back a change of mood (MOOD_GAP): ask again next frame. */
  stale = false;
  private parts: Parts | null = null;
  private outerKey = '';
  private outer: readonly FaceMark[] = [];
  private drawn: FaceDrawing | null = null;

  /**
   * The face of radius `s` on a body of radius `r`, or null when it is too
   * small to read (dust has no face). `seed` steadies the ink look's hand.
   */
  paint(look: FaceLook, shape: AgentShape, r: number, s: number, pose: FacePose, marks: Marks, seed: number, now = Infinity): FaceDrawing | null {
    if (!(s * K >= 4)) {
      this.drawn = null;
      this.key = NaN;
      return null;
    }
    const live = boundPose(pose);
    const peekLook = look === 'peek';
    // features are drawn at the size in eighth-octave steps; a scale makes up the rest
    const sb = peekLook ? s : 2 ** (Math.round(Math.log2(s) * 8) / 8);
    const k = sb * K;
    const pupils = PUPILS.has(look);
    // what is drawn snaps to steps this size can show: a feeling that drifts, a turning head or a blink
    // redraws the paths only now and then, and a cheap slide carries the fine part of a turn
    const p = snapped(live, k, pupils);
    const m = snappedMarks(marks);
    const key = keyOf(look, shape, peekLook ? r : 0, sb, p, m);
    // a blink or a turn redraws at once; a mood that merely drifts at most every MOOD_GAP seconds
    const motion = (Math.round(p.blink * 4) * 1000 + Math.round(p.head.yaw * 8) * 31 + Math.round(p.head.pitch * 8)) * 7 + Math.round(p.gaze.yaw * 16) * 3 + Math.round(p.gaze.pitch * 16) + sb * 1e6;
    const due = motion !== this.motion || !(now - this.built < MOOD_GAP);
    this.stale = !!this.parts && key !== this.key && !due;
    if (!this.parts || (key !== this.key && due)) {
      this.key = key;
      this.motion = motion;
      this.built = now;
      this.parts = drawParts(look, shape, r, k, p, m, seed);
    }
    const transform = peekLook ? '' : placement(shape, r, s, sb, k, live, p, pupils);
    const parts = this.parts;
    // manga's "!" and sparkles sit over the head, in the body's frame: their own key
    const exclaim = look === 'manga' ? Math.round((marks.exclaim ?? 0) * 10) : 0;
    const sparkles = look === 'manga' ? Math.round((marks.sparkles ?? 0) * 10) : 0;
    // placed on the body's top edge, so the shape is part of where they go
    const outerKey = exclaim || sparkles ? `${exclaim}|${sparkles}|${shape}|${Math.round(r * 2)}|${Math.round(s * 2)}` : '';
    if (outerKey !== this.outerKey) {
      this.outerKey = outerKey;
      this.outer = outerKey ? outerMarks(shape, r, s, marks) : [];
    }
    const drawn = this.drawn;
    if (drawn && drawn.transform === transform && drawn.outer === this.outer && drawn.ink === parts.ink && drawn.lines === parts.lines && drawn.white === parts.white && drawn.over === parts.over) {
      return drawn;
    }
    const lineWidth = look === 'lids' ? Math.min(4, Math.max(1.2, 0.06 * sb)) : Math.min(4, Math.max(1.1, 0.075 * k)) * (look === 'ink' ? 1.15 : 1);
    this.drawn = {
      transform,
      under: parts.under,
      white: parts.white,
      ink: parts.ink,
      clip: parts.clip,
      clipped: parts.clipped,
      lid: parts.lid,
      rings: parts.rings,
      glint: parts.glint,
      lines: parts.lines,
      thin: parts.thin,
      heavy: parts.heavy,
      lineWidth,
      inked: look === 'ink',
      over: parts.over,
      outer: this.outer,
    };
    return this.drawn;
  }
}

/**
 * Where the face sits on its body: the anchor, the roll, the size step's scale,
 * the fine part of a head turn the snapped paths leave out, and — in looks
 * without pupils — the eyes' part of a look, as a small slide of the whole face
 * (owner, 2026-10-07). In quarter pixels and whole degrees.
 */
function placement(shape: AgentShape, r: number, s: number, sb: number, k: number, live: Required<FacePose>, drawn: Required<FacePose>, pupils: boolean): string {
  const zoom = s / sb;
  const anchor = faceAnchor(shape) * r;
  const turnX = RS * (live.head.yaw - drawn.head.yaw) * HEAD_YAW;
  const turnY = -RS * (live.head.pitch - drawn.head.pitch) * HEAD_PITCH;
  const gx = (pupils ? 0 : live.gaze.yaw * 0.1) + turnX;
  const gy = (pupils ? 0 : live.gaze.pitch * 0.07) + turnY;
  return `translate(0 ${F(anchor)}) rotate(${Math.round(live.head.roll * 14)}) scale(${(Math.round(zoom * 500) / 500).toString()}) translate(${Math.round(gx * k * 4) / 4} ${Math.round(gy * k * 4) / 4})`;
}

const snap = (x: number, steps: number) => Math.round(x * steps) / steps;

/** The pose as it will be drawn: each coordinate in steps a face of `k` px can show. */
function snapped(p: Required<FacePose>, k: number, pupils: boolean): Required<FacePose> {
  // about one step a pixel of feature travel; never coarser than eighths
  const q = Math.max(8, Math.min(40, Math.round(k / 2)));
  const x = p.expression;
  return {
    expression: {
      browLift: snap(x.browLift, q),
      browSlope: snap(x.browSlope, q),
      eyeOpening: snap(x.eyeOpening, q),
      cheekLift: snap(x.cheekLift, q),
      mouthCurve: snap(x.mouthCurve, q),
      mouthOpening: snap(x.mouthOpening, q),
      smirk: snap(x.smirk, q),
    },
    gaze: pupils ? { yaw: snap(p.gaze.yaw, 16), pitch: snap(p.gaze.pitch, 16) } : { yaw: 0, pitch: 0 },
    head: { yaw: snap(p.head.yaw, 8), pitch: snap(p.head.pitch, 8), roll: p.head.roll },
    blink: snap(p.blink, 4),
    pupil: snap(p.pupil, 10),
  };
}

/** Marks in fifths: they fade in and out in a few steps, each a redraw. */
function snappedMarks(m: Marks): Marks {
  return {
    blush: snap(m.blush ?? 0, 5),
    blushLines: snap(m.blushLines ?? 0, 5),
    sweat: snap(m.sweat ?? 0, 5),
    vein: snap(m.vein ?? 0, 5),
    gloom: snap(m.gloom ?? 0, 5),
    tears: snap(m.tears ?? 0, 5),
    exclaim: m.exclaim ?? 0,
    sparkles: m.sparkles ?? 0,
  };
}

/** Everything a drawing shows, already snapped (`snapped`): two faces with one key look the same. */
function keyOf(look: FaceLook, shape: AgentShape, r: number, sb: number, p: Required<FacePose>, marks: Marks): number {
  let h = 2166136261;
  const mix = (x: number) => {
    h = Math.imul(h ^ (x | 0), 16777619);
  };
  mix(LOOK_ID[look]);
  mix(shape.length * 31 + shape.charCodeAt(0) + (shape === 'triangleDown' ? 7 : 0));
  mix(Math.round(sb * 64));
  mix(Math.round(r * 4));
  const x = p.expression;
  for (const v of [x.browLift, x.browSlope, x.eyeOpening, x.cheekLift, x.mouthCurve, x.mouthOpening, x.smirk, p.head.yaw, p.head.pitch, p.gaze.yaw, p.gaze.pitch, p.blink, p.pupil])
    mix(Math.round(v * 1000));
  for (const v of [marks.blush, marks.blushLines, marks.sweat, marks.vein, marks.gloom, marks.tears]) mix(Math.round((v ?? 0) * 1000));
  return h;
}

function drawParts(look: FaceLook, shape: AgentShape, r: number, k: number, p: Required<FacePose>, marks: Marks, seed: number): Parts {
  const ch = faceGeometry(p.expression, p.pupil);
  const shut = Math.max(ch.upperLid, p.blink);
  turnX = p.head.yaw * HEAD_YAW;
  turnY = p.head.pitch * HEAD_PITCH;
  unit = k;
  const c: Ctx = {
    p,
    ch,
    marks,
    seed,
    k,
    shut,
    dotOpen: Math.min(1, (1 - shut) / 0.75) * (1 - 0.8 * ch.lowerLid),
    beam: ch.crinkle > 0.45,
  };
  const out = blank();
  const blush = marks.blush ?? 0;
  if (blush > 0.02 && look !== 'peek') {
    // the blush is autonomic: every look shows it
    out.under.push({ d: oval(-0.36 / K, 0.11 / K, 0.11 / K, 0.05 / K) + oval(0.36 / K, 0.11 / K, 0.11 / K, 0.05 / K), fill: BLUSH, stroke: 'none', width: 0, opacity: 0.6 * blush });
  }
  if (look === 'lids') lids(c, out);
  else if (look === 'dots') dots(c, false, out);
  else if (look === 'brows') dots(c, true, out);
  else if (look === 'beans') beans(c, out);
  else if (look === 'googly') googly(c, out);
  else if (look === 'ink') ink(c, out);
  else if (look === 'peek') peek(c, shape, r, out);
  else manga(c, out);
  return out;
}

/** Manga's marks over the head, in the body's frame: "!" for the unexpected, sparkles for joy. */
function outerMarks(shape: AgentShape, r: number, s: number, marks: Marks): FaceMark[] {
  const out: FaceMark[] = [];
  const top = topEdge(shape, r, 0);
  const exclaim = marks.exclaim ?? 0;
  if (exclaim > 0.02) {
    const x = 0.5 * r;
    const y = top - 0.12 * s;
    const dot = Math.max(1.2, 0.04 * s);
    out.push({ d: `M${F(x)} ${F(y - 0.36 * s)}L${F(x - 0.01 * s)} ${F(y - 0.12 * s)}`, fill: 'none', stroke: INK, width: Math.max(2, 0.07 * s), opacity: exclaim });
    out.push({ d: `M${F(x - 0.012 * s - dot)} ${F(y - 0.02 * s)}a${F(dot)} ${F(dot)} 0 1 0 ${F(2 * dot)} 0a${F(dot)} ${F(dot)} 0 1 0 ${F(-2 * dot)} 0Z`, fill: INK, stroke: 'none', width: 0, opacity: exclaim });
  }
  const sparkles = marks.sparkles ?? 0;
  if (sparkles > 0.02) {
    // never gold: gold is the money's
    let d = '';
    for (const [x0, y0, sr] of [[-0.66, 0.18, 0.13], [0.72, 0.3, 0.1], [0.42, -0.12, 0.08]]) {
      const R = sr * s;
      const cx = x0 * r;
      const cy = top + y0 * r;
      d += `M${F(cx)} ${F(cy - R)}Q${F(cx)} ${F(cy)} ${F(cx + R)} ${F(cy)}Q${F(cx)} ${F(cy)} ${F(cx)} ${F(cy + R)}Q${F(cx)} ${F(cy)} ${F(cx - R)} ${F(cy)}Q${F(cx)} ${F(cy)} ${F(cx)} ${F(cy - R)}Z`;
    }
    out.push({ d, fill: WHITE, stroke: '', width: Math.max(0.8, 0.012 * r), opacity: sparkles });
  }
  return out;
}
