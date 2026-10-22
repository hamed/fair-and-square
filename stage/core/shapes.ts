/**
 * Body outlines. A body is an axis-aligned box (left, bottom, width, height),
 * and its kind says which polygon fills the box. Area is wealth, so every
 * kind's area is a fixed share of its box (`FILL`), and `natural` sizes a box
 * so the polygon has exactly the requested area.
 *
 * Rendering, picking and the area readout all go through `outline` and
 * `contains`, so what is drawn is what is hit is what is counted.
 */

export const RECT = 0;
export const TRI = 1;
export const HEX = 2;
export type Kind = typeof RECT | typeof TRI | typeof HEX;

/** Polygon area ÷ box area, by kind. */
export const FILL: readonly number[] = [1, 0.5, 0.75];

export function areaOf(kind: number, w: number, h: number): number {
  return FILL[kind] * w * h;
}

/** Box width and height of a `kind` body of area `a` in its natural proportions. */
export function natural(kind: number, a: number): [number, number] {
  if (kind === TRI) {
    // equilateral, point up
    const side = Math.sqrt((4 * a) / Math.sqrt(3));
    return [side, (side * Math.sqrt(3)) / 2];
  }
  if (kind === HEX) {
    // regular, flat top
    const r = Math.sqrt((2 * a) / (3 * Math.sqrt(3)));
    return [2 * r, Math.sqrt(3) * r];
  }
  const s = Math.sqrt(a);
  return [s, s];
}

/** The polygon's vertices, counter-clockwise from the lower left, into `out` as x, y pairs. Returns the vertex count. */
export function outline(kind: number, x: number, y: number, w: number, h: number, out: number[]): number {
  out.length = 0;
  if (kind === TRI) {
    out.push(x, y, x + w, y, x + w / 2, y + h);
  } else if (kind === HEX) {
    out.push(x + w / 4, y, x + (3 * w) / 4, y, x + w, y + h / 2, x + (3 * w) / 4, y + h, x + w / 4, y + h, x, y + h / 2);
  } else {
    out.push(x, y, x + w, y, x + w, y + h, x, y + h);
  }
  return out.length / 2;
}

/** Is (px, py) inside the polygon `outline` draws? Edges count as inside. */
export function contains(kind: number, x: number, y: number, w: number, h: number, px: number, py: number): boolean {
  if (!(px >= x && px <= x + w && py >= y && py <= y + h)) return false;
  if (kind === RECT) return true;
  const u = Math.abs(px - (x + w / 2)) / (w / 2);
  const v = (py - y) / h;
  if (kind === TRI) return u <= 1 - v;
  return u <= 1 - Math.abs(2 * v - 1) / 2;
}
