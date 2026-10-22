/**
 * N_eff, counted: the folded photo (area Σw²) printed across the 1 × 1 box, one copy at a time, row by row, each in
 * its frame (the photo and a thin empty band above it; `tile` chose the frames so they fill the box in whole
 * copies). Each frame is numbered as it lands; the count beside the box steps 1, 2, 3, …, and a beat after the last
 * it takes on the bands too: N_eff, 6.5.
 *
 * A small N_eff (owner, 2026-10-21) prints as copies side by side, each as tall as the box, as many as the nearest
 * whole number. Then the box is made exact: the last copy past its edge is cut there and the piece thrown away; or,
 * a gap left, one more copy is printed beside the box, cut, and the piece that fits slides in, the rest thrown away.
 * The last frame counts what of a copy it holds (0.9, 0.3). Pure: the figure and the time since the photo was ready.
 */
import { BOX, type Figure } from '../core/figure.ts';
import type { Scene } from './scene.ts';

/** Seconds between two copies landing. */
export const PRINT_EVERY = 0.35;
/** Seconds the box takes to be made exact (the cut, then the piece thrown or slid in). */
const CUT = 1.8;
/** How far beside the box the one more copy is printed. */
const BESIDE = 0.08;

const smooth = (u: number) => {
  const v = Math.min(1, Math.max(0, u));
  return v * v * (3 - 2 * v);
};

export function prints(fig: Figure, elapsed: number, scene: Scene): void {
  const photo = fig.photo;
  if (!photo || !fig.clip || elapsed <= 0) return;
  // the photo itself is the first; its copies follow row by row, as a page is read from the bottom
  const copies = [{ dx: 0, dy: 0 }, ...[...fig.prints].sort((a, b) => a.dy - b.dy || a.dx - b.dx)];
  const clip = fig.clip;
  const cut = Math.abs(photo.cut ?? 0) > 1e-9 ? photo.cut! : 0;
  // the box made exact, after the last copy has landed
  const from = copies.length * PRINT_EVERY + 0.3;
  const u = cut ? Math.min(1, Math.max(0, (elapsed - from) / CUT)) : 0;
  const cutting = cut !== 0 && elapsed > from;
  const right = cutting ? BOX + 1 : clip.x1;
  scene.clip = { x: clip.x0, y: clip.y0, w: right - clip.x0, h: clip.y1 - clip.y0 };
  const neff = 1 / (photo.w * photo.h);
  const k = copies.length;
  let landed = 0;
  copies.forEach(({ dx, dy }, c) => {
    const fade = Math.min(1, Math.max(0, (elapsed - c * PRINT_EVERY) / PRINT_EVERY));
    if (fade <= 0) return;
    if (fade >= 1) landed++;
    if (c > 0) scene.ghosts.push({ dx, dy, alpha: fade });
    // the last frame, cut at the box's edge, counts what of a copy it holds
    const last = cutting && cut < 0 && c === k - 1;
    const x = clip.x0 + dx;
    const w = last ? BOX + 1 - x : photo.frameW;
    scene.frames.push({ box: { x, y: clip.y0 + dy, w, h: photo.frameH }, alpha: 0.75 * fade, solid: true, label: last && u >= 1 ? (neff - (k - 1)).toFixed(1) : String(c + 1) });
  });
  if (landed === 0) return;
  if (cutting) {
    const over = -cut;
    if (cut < 0) {
      // past the box: the cut at its edge, then the piece thrown away
      const seam = smooth(u / 0.25);
      scene.lines.push({ x0: BOX + 1, y0: clip.y0, x1: BOX + 1, y1: clip.y1, alpha: seam * (1 - smooth((u - 0.85) / 0.15)) });
      const v = smooth((u - 0.3) / 0.7);
      const last = copies[k - 1];
      const move = 0.35 * v;
      scene.ghosts.push({
        dx: last.dx + move,
        dy: last.dy - 0.9 * v * v,
        alpha: 1 - v,
        cut: { x0: BOX + 1 + move, x1: BOX + 1 + over + move },
        free: true,
      });
    } else {
      // short of it: one more copy beside the box, cut, the piece that fits slid in, the rest thrown away
      const gap = cut;
      const at = 1 + BESIDE;
      const appear = smooth(u / 0.2);
      const seam = smooth((u - 0.2) / 0.2);
      const v = smooth((u - 0.45) / 0.55);
      const x0 = BOX + at;
      if (v <= 0) {
        scene.ghosts.push({ dx: at, dy: 0, alpha: appear, free: true });
        scene.lines.push({ x0: x0 + gap, y0: clip.y0, x1: x0 + gap, y1: clip.y1, alpha: seam });
      } else {
        const slide = v * (at - k * photo.w);
        scene.ghosts.push({ dx: at - slide, dy: 0, alpha: 1, cut: { x0: x0 - slide, x1: x0 + gap - slide }, free: true });
        scene.ghosts.push({ dx: at + 0.2 * v, dy: -0.9 * v * v, alpha: 1 - v, cut: { x0: x0 + gap + 0.2 * v, x1: x0 + photo.w + 0.2 * v }, free: true });
      }
      if (u >= 1) scene.frames.push({ box: { x: BOX + 1 - gap, y: clip.y0, w: gap, h: photo.frameH }, alpha: 0.75, solid: true, label: (neff - k).toFixed(1) });
    }
  }
  // whole copies, one by one; a beat after the last (the box made exact first), N_eff
  const done = cut ? u >= 1 : elapsed >= (copies.length + 1) * PRINT_EVERY;
  scene.labels.push({ x: right, y: clip.y1, text: done ? neff.toFixed(1) : String(landed), size: 1.6 });
}
