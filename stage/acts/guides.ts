/**
 * Guides: things drawn over the yard to teach it, from the session's state
 * rather than from a move (acts do moves). Each writes into the scene as an
 * act does; the renderer paints the scene and knows none of them.
 *
 *   stakes   both partners' equal stakes, lifted a hair off where they would be cut
 *   money    a pile filling the box, then cut where the fold divides it
 *   line     a line across the bars, which the reader drags: how many reach it
 *   lorenz   over the bodies standing as the running total: its curve, the even line, the gap between
 *   you      a card over one square: its rank and its share
 */
import { away, between, cut, cutSide, GAP, type Box, type Side } from '../core/area.ts';
import { BOX } from '../core/figure.ts';
import { smooth } from '../core/motion.ts';
import type { Scene } from './scene.ts';
import type { Live } from './track.ts';

/**
 * Each pair's stakes (β × the poorer one's wealth, both the same), cut off the
 * side facing the partner and put on the table between them (to meet in the
 * middle), `t` seconds after they first showed. The players stand the same
 * height (owner, 2026-10-22), so the two are the same slice, meeting with no gap.
 * `glow`: the poorer one's stake glows.
 */
export function stakes(live: Live, pairs: ArrayLike<number>, beta: number, t: number, glow: boolean, scene: Scene): void {
  const lift = smooth(Math.min(1, t / 0.5));
  for (let p = 0; p + 1 < pairs.length; p += 2) {
    const i = pairs[p];
    const j = pairs[p + 1];
    if (i < 0 || j < 0 || i >= live.n || j >= live.n) continue;
    const wi = live.drawn(i);
    const wj = live.drawn(j);
    const stake = beta * Math.min(wi, wj);
    // ties: the second of the pair is "the poorer"
    const poorer = wi < wj ? i : j;
    for (const [a, b] of [
      [i, j],
      [j, i],
    ]) {
      const A = live.box(a);
      const B = live.box(b);
      const area = live.measure(live.drawn(a)) - live.measure(Math.max(0, live.drawn(a) - stake));
      if (!(area > 0)) continue;
      // the side facing the partner, whatever the shape (the duel's exception to cutting across the longer side)
      const side = (B.x + B.w / 2 < A.x + A.w / 2 ? 0 : 1) as Side;
      const { piece, rest } = cut(A, side, area);
      // on the table: to meet the partner's in the middle, touching (as the toss lifts them)
      const box = away(piece, side, (between(A, B) / 2) * lift);
      scene.display.set(a, rest);
      scene.pieces.push({ box, alpha: 1, colour: a });
      if (glow && a === poorer) scene.glows.push({ box, alpha: smooth(Math.min(1, t / 0.5)), of: a });
    }
  }
}

/**
 * Each square's tax, before it is paid: what the rate takes off it (rate × its wealth), cut off the side facing
 * the middle and lifted a hair, as the levy cuts it; the same shape it will fly to the pot in. Following the rate.
 */
export function taxes(live: Live, rate: number, t: number, scene: Scene): void {
  const lift = smooth(Math.min(1, t / 0.4));
  const middle: Box = { x: live.right / 2, y: live.top / 2, w: 0, h: 0 };
  for (let i = 0; i < live.n; i++) {
    const d = live.drawn(i);
    const pay = rate * d;
    const area = live.measure(d) - live.measure(Math.max(0, d - pay));
    if (!(area > 0)) continue;
    const A = live.box(i);
    const side = cutSide(A, middle);
    const { piece, rest } = cut(A, side, area);
    scene.display.set(i, rest);
    scene.pieces.push({ box: away(piece, side, GAP * lift), alpha: 1, colour: i });
  }
}

/** The pile's colour: money no one holds yet (the stage's accent gold). */
export const MONEY = '#e9c96a';

/**
 * All the money as one pile in the 1 × 1 box. `fill`: rising from the bottom
 * over `FILL` seconds. `split`: whole, then cut along the edges between the
 * bodies' places (`places`: the fold the bodies will take), the cut drawn
 * from the top down; then the pile fades as the bodies come in.
 */
export function money(mode: 'fill' | 'split', t: number, places: readonly Box[], scene: Scene): void {
  const h = mode === 'fill' ? smooth(Math.min(1, t / FILL)) : 1;
  const fade = mode === 'split' ? 1 - smooth(Math.min(1, Math.max(0, (t - SPLIT_FADE) / 0.6))) : 1;
  if (fade <= 0.001) return;
  scene.pieces.push({ box: { x: BOX, y: BOX, w: 1, h: Math.max(1e-6, h) }, alpha: fade, colour: 0, fill: MONEY });
  if (mode !== 'split') return;
  const reach = smooth(Math.min(1, t / SPLIT_CUT));
  const top = BOX + 1;
  // the edges inside the box: each place's right and top edges that are not on the box's own edges
  for (const b of places) {
    if (b.x + b.w < BOX + 1 - 1e-9) {
      const y1 = Math.min(top, b.y + b.h);
      const y0 = Math.max(b.y, top - (top - b.y) * reach);
      if (y1 > y0) scene.lines.push({ x0: b.x + b.w, y0, x1: b.x + b.w, y1, alpha: fade });
    }
    if (b.y + b.h < top - 1e-9) {
      const x0 = b.x;
      const x1 = b.x + b.w * reach;
      scene.lines.push({ x0, y0: b.y + b.h, x1, y1: b.y + b.h, alpha: fade * reach });
    }
  }
}

/** Seconds: the pile fills; the cut goes down; the pile starts to fade as the squares come in. */
export const FILL = 1.4;
const SPLIT_CUT = 0.6;
export const SPLIT_FADE = 0.8;

/**
 * A line at `x` across the bars, from the floor to above the tallest: the
 * number by its top is how many bodies reach it (their right edge at or past it).
 */
export function line(live: Live, x: number, scene: Scene): number {
  let reach = 0;
  let top = BOX + 1;
  for (let i = 0; i < live.n; i++) {
    const b = live.box(i);
    if (b.x + b.w >= x - 1e-9) reach++;
    top = Math.max(top, b.y + b.h);
  }
  scene.handles.push({ x, y0: Math.max(0, BOX - 0.15), y1: top + 0.08, label: String(reach), alpha: 1 });
  return reach;
}

/**
 * The running total's lines over the bodies standing as its blocks (the `stairs` pose): the curve through each
 * block's top-right corner (`curve`), the line everyone equal would make (`even`), and the area between them
 * (`gap`), whose share of the triangle under the even line is the Gini. Each 0 … 1, as it comes in.
 */
export function lorenz(wealth: ArrayLike<number>, curve: number, even: number, gap: number, scene: Scene, steps: { readonly tri: number; readonly lift: number; readonly label: number } = { tri: 0, lift: 0, label: 0 }): void {
  const n = wealth.length;
  if (!n) return;
  const order = Array.from({ length: n }, (_, k) => k).sort((a, b) => wealth[a] - wealth[b] || a - b);
  let total = 0;
  for (let k = 0; k < n; k++) total += Math.max(0, wealth[k]);
  if (!(total > 0)) return;
  const points: number[] = [BOX, BOX];
  let c = 0;
  let under = 0;
  for (let k = 0; k < n; k++) {
    const was = c;
    c += Math.max(0, wealth[order[k]]) / total;
    under += (was + c) / (2 * n);
    points.push(BOX + (k + 1) / n, BOX + c);
  }
  // the Gini: the gap's share of the triangle under the even line
  const gini = Math.max(0, 1 - 2 * under);
  if (even > 0) {
    // the even line, made of ghosts: everyone's equal share, a square each, step by step up the diagonal (owner,
    // 2026-10-21: faint, so they are not taken for the squares)
    for (let k = 0; k < n; k++) {
      const x = BOX + k / n;
      const y = BOX + k / n;
      const e = 1 / n;
      scene.polys.push({ pts: [x, y, x + e, y, x + e, y + e, x, y + e], fill: 'ghost', stroke: 'faint', dash: true, alpha: even });
    }
    scene.polys.push({ pts: [BOX, BOX, BOX + 1, BOX + 1], open: true, stroke: 'ink', dash: true, alpha: even });
  }
  const gapPts = [...points, BOX, BOX];
  // the gauge: the triangle folded into a bar beside the box, the gap into a bar of the same width over it, from
  // the bottom; their heights' ratio is the Gini (owner, 2026-10-21)
  // in steps (owner, 2026-10-22): `tri`, `lift`, `label` seconds since each began (0: not yet)
  const shade = smooth(steps.tri / 0.6);
  const fold = smooth((steps.tri - 0.8) / 1);
  const lift = smooth(steps.lift / 1);
  const bar = (h: number) => [GAUGE.x, BOX, GAUGE.x + GAUGE.w, BOX, GAUGE.x + GAUGE.w, BOX + h, GAUGE.x, BOX + h];
  if (steps.tri > 0) {
    const triangle = [BOX, BOX, BOX + 1, BOX, BOX + 1, BOX + 1];
    scene.polys.push({ pts: morph(triangle, bar(1), fold), fill: 'triangle', stroke: 'faint', alpha: 0.9 * shade });
  }
  if (gap > 0) scene.polys.push({ pts: lift > 0 ? morph(gapPts, bar(gini), lift) : gapPts, fill: 'gap', alpha: lift > 0 ? 0.75 : 0.42 * gap });
  if (steps.label > 0) {
    // centred on the bars (owner, 2026-10-22): 0 under them, 1 over them, the Gini over its own line; large
    const mid = GAUGE.x + GAUGE.w / 2;
    scene.labels.push({ x: mid, y: BOX - 0.01, text: '0.00', size: 1.7, centre: true });
    scene.labels.push({ x: mid, y: BOX + 1, text: '1.00', size: 1.7, centre: true, above: true });
    scene.labels.push({ x: mid, y: BOX + gini, text: gini.toFixed(2), size: 2, centre: true, above: true });
  }
  if (curve > 0) scene.polys.push({ pts: points, open: true, stroke: 'ink', alpha: curve });
}

/** The gauge's bars beside the box: their left edge and width (the yard is 2 wide, the box ends at 1.5). */
export const GAUGE = { x: BOX + 1 + 0.12, w: 0.24 };

/** Points each polygon is walked round with while it morphs (enough that a corner stays a corner). */
const MORPH_POINTS = 96;

/** Polygon `a` turned `u` of the way into polygon `b`: both walked round at the same pace, point for point. */
function morph(a: readonly number[], b: readonly number[], u: number): number[] {
  if (u <= 0) return [...a];
  if (u >= 1) return [...b];
  const m = MORPH_POINTS;
  const pa = resample(a, m);
  const pb = resample(b, m);
  return pa.map((v, k) => v + (pb[k] - v) * u);
}

/** `m` points evenly round closed polygon `pts`. */
function resample(pts: readonly number[], m: number): number[] {
  const n = pts.length / 2;
  const len: number[] = [0];
  for (let k = 0; k < n; k++) {
    const [x0, y0, x1, y1] = [pts[2 * k], pts[2 * k + 1], pts[(2 * k + 2) % pts.length], pts[(2 * k + 3) % pts.length]];
    len.push(len[k] + Math.hypot(x1 - x0, y1 - y0));
  }
  const total = len[n] || 1;
  const out: number[] = [];
  let k = 0;
  for (let j = 0; j < m; j++) {
    const at = (j / m) * total;
    while (k < n - 1 && len[k + 1] < at) k++;
    const seg = len[k + 1] - len[k] || 1;
    const u = (at - len[k]) / seg;
    const [x0, y0, x1, y1] = [pts[2 * k], pts[2 * k + 1], pts[(2 * k + 2) % pts.length], pts[(2 * k + 3) % pts.length]];
    out.push(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u);
  }
  return out;
}

/** A card over body `i`: `text` (its rank and share), its bottom a little above the body's top. */
export function you(live: Live, i: number, text: string, t: number, scene: Scene): void {
  if (i < 0 || i >= live.n) return;
  const b = live.box(i);
  scene.tags.push({ x: b.x + b.w / 2, y: b.y + b.h + 0.03, text, alpha: smooth(Math.min(1, t / 0.4)) });
  scene.glows.push({ box: b, alpha: 0.6 + 0.4 * Math.cos(t * 3) ** 2, of: i });
}

/**
 * The chart in the bars (the CCDF, midway between the people and the chart: owner, 2026-10-21): the step along the
 * bars' far ends, from the top bar to the bottom one, drawn strong (the bars themselves made plain: render.ts).
 */
export function envelope(live: Live, t: number, scene: Scene): void {
  const bars = Array.from({ length: live.n }, (_, i) => live.box(i)).sort((a, b) => b.y - a.y);
  if (!bars.length) return;
  const left = Math.min(...bars.map((b) => b.x));
  const pts = [left, bars[0].y + bars[0].h];
  for (const b of bars) pts.push(b.x + b.w, b.y + b.h, b.x + b.w, b.y);
  pts.push(left, bars[bars.length - 1].y);
  scene.polys.push({ pts, open: true, stroke: 'ink', width: 3, alpha: smooth(Math.min(1, t / 0.6)) });
}
