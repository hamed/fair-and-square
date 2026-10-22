/**
 * Packing: rectangles in square shells from the corner (the room's fallback
 * and the `pack` pose), and the squarified treemap (`fold`). Each writes exact
 * boxes, as corners (x0, y0, x1, y1), struct-of-arrays by identity.
 * (From the retired soft-body engine, FnS_de/src, 2026-10-18.)
 */

/** A rectangle by its corners. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** One rectangle per body, struct-of-arrays, indexed by identity. */
export interface Boxes {
  readonly count: number;
  readonly x0: Float64Array;
  readonly y0: Float64Array;
  readonly x1: Float64Array;
  readonly y1: Float64Array;
}

export function createBoxes(count: number): Boxes {
  return {
    count,
    x0: new Float64Array(count),
    y0: new Float64Array(count),
    x1: new Float64Array(count),
    y1: new Float64Array(count),
  };
}

/**
 * Skyline packing of rectangles in the given order, growing square shells
 * from the origin: each takes the free spot that keeps the occupied corner
 * region smallest in the L∞ sense, ties going to the spot nearer the origin,
 * then nearer the floor. `limit` is the right wall: one wider than the room
 * left is stacked at the left edge instead.
 */
export function packRectangles(
  width: ArrayLike<number>,
  height: ArrayLike<number>,
  order: ArrayLike<number>,
  limit: number,
  out: Boxes,
): void {
  // Segment j covers [xs[j], xs[j + 1]) at height ys[j]; the last runs to infinity.
  const xs: number[] = [0];
  const ys: number[] = [0];
  for (let r = 0; r < order.length; r++) {
    const id = order[r];
    const s = width[id];
    const tall = height[id];
    let bestJ = 0;
    let bestX = 0;
    let bestY = 0;
    let bestCost = Infinity;
    let bestSum = Infinity;
    for (let j = 0; j < xs.length; j++) {
      const x = xs[j];
      const right = x + s;
      if (j > 0 && right > limit) break;
      let y = ys[j];
      for (let q = j + 1; q < xs.length && xs[q] < right; q++) if (ys[q] > y) y = ys[q];
      const top = y + tall;
      const cost = right > top ? right : top;
      const sum = x + y;
      if (cost < bestCost || (cost === bestCost && (sum < bestSum || (sum === bestSum && y < bestY)))) {
        bestJ = j;
        bestX = x;
        bestY = y;
        bestCost = cost;
        bestSum = sum;
      }
    }
    const right = bestX + s;
    const top = bestY + tall;
    out.x0[id] = bestX;
    out.x1[id] = right;
    out.y0[id] = bestY;
    out.y1[id] = top;
    raise(xs, ys, bestJ, right, top);
  }
}

/** Replaces the skyline from segment j's start up to `end` with one segment at `height`. */
function raise(xs: number[], ys: number[], j: number, end: number, height: number): void {
  let q = j;
  while (q + 1 < xs.length && xs[q + 1] < end) q++;
  const tail = !(q + 1 < xs.length && xs[q + 1] === end);
  const tailY = ys[q];
  if (tail) {
    xs.splice(j, q - j + 1, xs[j], end);
    ys.splice(j, q - j + 1, height, tailY);
  } else {
    xs.splice(j, q - j + 1, xs[j]);
    ys.splice(j, q - j + 1, height);
  }
  // Merge equal neighbours so the skyline stays short.
  for (let k = Math.max(1, j); k < Math.min(xs.length, j + 3); ) {
    if (ys[k] === ys[k - 1]) {
      xs.splice(k, 1);
      ys.splice(k, 1);
    } else {
      k++;
    }
  }
}

/**
 * Squarified treemap (Bruls, Huizing & van Wijk, 2000): partitions `box` into
 * boxes whose areas are proportional to `area`, with aspect ratios kept near
 * one. `order` must list identities by descending area. Each interior edge is
 * computed once and shared by the boxes on both sides, and the outer edges are
 * the container's own, so the partition has no gaps or overlaps even in
 * floating point.
 */
export function squarify(area: ArrayLike<number>, order: ArrayLike<number>, box: Rect, out: Boxes): void {
  const n = order.length;
  let sum = 0;
  for (let r = 0; r < n; r++) sum += area[order[r]];
  const scale = ((box.x1 - box.x0) * (box.y1 - box.y0)) / sum;
  let x0 = box.x0;
  let y0 = box.y0;
  const x1 = box.x1;
  const y1 = box.y1;
  let i = 0;
  while (i < n) {
    const w = x1 - x0;
    const h = y1 - y0;
    const side = w < h ? w : h;
    const side2 = side * side;
    let j = i;
    let rowSum = 0;
    let lo = Infinity;
    let hi = 0;
    let worst = Infinity;
    while (j < n) {
      const a = area[order[j]] * scale;
      const s = rowSum + a;
      const l = a < lo ? a : lo;
      const u = a > hi ? a : hi;
      const ratio = Math.max((side2 * u) / (s * s), (s * s) / (side2 * l));
      if (j > i && ratio > worst) break;
      rowSum = s;
      lo = l;
      hi = u;
      worst = ratio;
      j++;
    }
    const last = j === n;
    if (w >= h) {
      // A column along the left edge.
      // never past the box: what is left stays a box, however thin
      const edge = last ? x1 : Math.min(x1, x0 + rowSum / h);
      let y = y0;
      let cum = 0;
      for (let r = i; r < j; r++) {
        const id = order[r];
        // by share of the column, never past its end: no cell comes out inverted from rounding
        cum += area[id] * scale;
        const next = r === j - 1 ? y1 : Math.min(y1, Math.max(y, y0 + (y1 - y0) * (cum / rowSum)));
        out.x0[id] = x0;
        out.x1[id] = edge;
        out.y0[id] = y;
        out.y1[id] = next;
        y = next;
      }
      x0 = edge;
    } else {
      // A row along the bottom edge.
      const edge = last ? y1 : Math.min(y1, y0 + rowSum / w);
      let x = x0;
      let cum = 0;
      for (let r = i; r < j; r++) {
        const id = order[r];
        cum += area[id] * scale;
        const next = r === j - 1 ? x1 : Math.min(x1, Math.max(x, x0 + (x1 - x0) * (cum / rowSum)));
        out.x0[id] = x;
        out.x1[id] = next;
        out.y0[id] = y0;
        out.y1[id] = edge;
        x = next;
      }
      y0 = edge;
    }
    i = j;
  }
}

/**
 * Shelves (owner, 2026-10-19: "nothing is exact, visually pleasant"): bodies keep their own shapes, laid in rows
 * in `order` from the bottom, each row standing on the one below, a small even gap between neighbours. A row
 * that is nearly full is justified to the block's width, a short one (the last, usually) centred, so the block
 * reads as one rectangle. Its width is chosen so the block comes out about square. Writes x0/y0 (from the
 * block's bottom left) and returns the block's size.
 */
export function shelves(
  width: ArrayLike<number>,
  height: ArrayLike<number>,
  order: readonly number[],
  gap: number,
  out: Boxes,
): { width: number; height: number } {
  if (!order.length) return { width: 0, height: 0 };
  let widest = 0;
  let room = 0;
  for (const i of order) {
    widest = Math.max(widest, width[i]);
    room += (width[i] + gap) * (height[i] + gap);
  }
  /** The rows a block `w` wide makes, and its height. */
  const lay = (w: number) => {
    const rows: number[][] = [[]];
    let used = 0;
    for (const i of order) {
      const row = rows[rows.length - 1];
      const need = (row.length ? gap : 0) + width[i];
      if (row.length && used + need > w) {
        rows.push([i]);
        used = width[i];
      } else {
        row.push(i);
        used += need;
      }
    }
    let h = 0;
    for (const row of rows) h += Math.max(...row.map((i) => height[i]));
    return { rows, h: h + gap * (rows.length - 1) };
  };
  // about square: the width moved toward the height it makes, a few times
  let w = Math.max(widest, Math.sqrt(room));
  for (let k = 0; k < 6; k++) w = Math.max(widest, Math.sqrt(w * lay(w).h));
  const { rows, h } = lay(w);
  let y = 0;
  for (const row of rows) {
    let sum = 0;
    for (const i of row) sum += width[i];
    const natural = sum + gap * (row.length - 1);
    // nearly full: spread to the edges; short: centred with the plain gap
    const justify = row.length > 1 && natural >= 0.75 * w;
    const space = justify ? (w - sum) / (row.length - 1) : gap;
    let x = justify ? 0 : (w - natural) / 2;
    let tallest = 0;
    for (const i of row) {
      out.x0[i] = x;
      out.y0[i] = y;
      x += width[i] + space;
      tallest = Math.max(tallest, height[i]);
    }
    y += tallest + gap;
  }
  return { width: w, height: h };
}
