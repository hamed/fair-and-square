/**
 * Proportions (owner, 2026-10-17): sizes are never reshaped. Each person's
 * width ÷ height changes only as their box is cut and joined, by the same
 * rules the pictures use (area.ts): a slice off across the longer dimension,
 * and the smaller of person and gain as a bar along the larger's long edge,
 * so people drift toward squares by themselves. Areas here are in wealth.
 */
import { area, cutSide, join, cut, type Box } from './area.ts';

/** Proportions never go past 1 : LIMIT; `equalize` squares everyone. */
export const LIMIT = 4;

/** A box of this aspect and area at the origin. */
function boxOf(aspect: number, a: number): Box {
  return { x: 0, y: 0, w: Math.sqrt(a * aspect), h: Math.sqrt(a / aspect) };
}

/** Within this of 1, a box is square: floating noise must not decide which edge is the longer (recheck 2026-10-22). */
const SQUARE = 1e-9;

function aspectOf(b: Box): number {
  const r = Math.min(LIMIT, Math.max(1 / LIMIT, b.w / b.h));
  return Math.abs(r - 1) < SQUARE ? 1 : r;
}

/** A point beyond the box's long end and its long edge: the direction cuts and joins face here. */
function ahead(b: Box): Box {
  return { x: b.x + 2 * b.w + 1, y: b.y + 2 * b.h + 1, w: 0, h: 0 };
}

/**
 * One of two players who stand the same height (owner, 2026-10-22): `a` of the pair's `pair`, as wide as its money,
 * as tall as an equal share (a square when they hold the same).
 */
export function levelled(a: number, pair: number): number {
  if (!(a > 0) || !(pair > 0)) return 1;
  return Math.min(LIMIT, Math.max(1 / LIMIT, a / (pair / 2)));
}

/** After losing `stake` of `a`: the slice comes off across the longer dimension. */
export function afterCut(aspect: number, a: number, stake: number): number {
  if (!(stake > 0) || !(stake < a)) return aspect;
  const b = boxOf(Math.abs(aspect - 1) < SQUARE ? 1 : aspect, a);
  return aspectOf(cut(b, cutSide(b, ahead(b)), stake).rest);
}

/** After gaining `gain` on `a`: the single join rule (area.ts). */
export function afterAttach(aspect: number, a: number, gain: number): number {
  if (!(gain > 0) || !(a > 0)) return aspect;
  const b = boxOf(Math.abs(aspect - 1) < SQUARE ? 1 : aspect, a);
  const far = ahead(b);
  // facing a point ahead on both axes: the long edge (or long end) on the far side
  const side = gain <= area(b) ? (b.w >= b.h ? 3 : 1) : cutSide(b, far);
  return aspectOf(join(b, gain, side).joined);
}
