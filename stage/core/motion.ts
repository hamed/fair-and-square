/**
 * Time: easing, paths, and every duration the acts use, in one table
 * (seconds at speed 1). Pure.
 */

/** Ease in and out over [0, 1], clamped. */
export function smooth(u: number): number {
  const v = Math.min(1, Math.max(0, u));
  return v * v * (3 - 2 * v);
}

/** A change that finishes in the first part of its beat and then holds: shapes change quickly, the pauses stay. */
export function fast(u: number): number {
  return smooth(u / 0.4);
}

/** A point `e` of the way along a quadratic bow from (x0, y0) to (x1, y1), bending by `bend` of its length. */
export function bow(x0: number, y0: number, x1: number, y1: number, bend: number, e: number): [number, number] {
  const d = Math.hypot(x1 - x0, y1 - y0) || 1e-12;
  const mx = (x0 + x1) / 2 - ((y1 - y0) / d) * bend * d;
  const my = (y0 + y1) / 2 + ((x1 - x0) / d) * bend * d;
  const k = 1 - e;
  return [k * k * x0 + 2 * k * e * mx + e * e * x1, k * k * y0 + 2 * k * e * my + e * e * y1];
}

/** Every beat's length. */
export const DUR = Object.freeze({
  /** a pair looks at each other before anything is cut */
  pair: 0.15,
  /** a cut line appears */
  mark: 0.25,
  /** the piece comes off, a gap opens */
  lift: 0.22,
  /** it changes shape (quickly, then a pause) */
  reshape: 0.3,
  /** a square becomes the bar it will join as */
  bar: 0.25,
  /** the gap closes, the colour turns, the seam fades */
  dock: 0.25,
  /** one body again */
  merge: 0.3,
  /** a spinner turns and stops on the winner */
  decide: 1,
  /** the winner's own stake closes back */
  keep: 0.3,
  /** a levy: faces flinch, then everyone's cut line, lift and 2 : 1 bar */
  brace: 0.25,
  levyMark: 0.2,
  levyLift: 0.2,
  levyShape: 0.22,
  /** a levy piece's flight into the pile; pieces leave one `levyStep` apart */
  levyFly: 0.6,
  /** the pile divides, the shares fly out, everyone takes theirs in */
  split: 0.45,
  deal: 0.55,
  levyMerge: 0.55,
});

/** A flight between two people: longer for further, never long. */
export function flyTime(distance: number): number {
  return Math.min(0.6, 0.25 + 0.2 * distance);
}

/** Seconds between two pieces reaching the pile: quick, and all of them in at most 1.2 s. */
export function levyStep(n: number): number {
  return Math.min(0.08, 1.2 / Math.max(1, n));
}
