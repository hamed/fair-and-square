/**
 * The arithmetic of areas. A quantity is the area of a box; every operation
 * here keeps area exactly, and every side is chosen by one of three rules.
 * Pure: no time, no stage. The acts (stage/acts) compose these.
 *
 *   cut      subtract   a slice of area a off one end
 *   bar      add        a strip of area a along one side (join: the two as one box)
 *   pile     sum        pieces joined one after another into one pile
 *   squares  divide     an amount into n equal squares
 *   tile     divide, with a remainder: how many whole copies of an area fill the unit box
 *   square, bar21, morph   the same area in another shape
 *
 * Sides: 0 left, 1 right, 2 below, 3 above. Coordinates: x right, y up.
 *   cutSide   a cut goes across the longer dimension, at the end facing where it goes
 *   joinSide  the smaller of the two becomes a bar along the larger's long edge (the result
 *             is squarer), facing where it comes from, unless a neighbour stands in the way
 *   squarestSide   a pile grows on whichever side keeps it squarest, the sides taking turns
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Side = 0 | 1 | 2 | 3;

/** A straight line, for cut lines and seams. */
export interface Line {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The gap a separated piece opens, yard units. */
export const GAP = 0.012;

export function area(b: Box): number {
  return b.w * b.h;
}

export function centreOf(b: Box): [number, number] {
  return [b.x + b.w / 2, b.y + b.h / 2];
}

export function opposite(side: Side): Side {
  return (side ^ 1) as Side;
}

/** The box covering both. */
export function union(a: Box, b: Box): Box {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  return { x: x0, y: y0, w: Math.max(a.x + a.w, b.x + b.w) - x0, h: Math.max(a.y + a.h, b.y + b.h) - y0 };
}

/** `b` moved `d` outward on `side`. */
export function away(b: Box, side: Side, d: number): Box {
  const dx = side === 0 ? -d : side === 1 ? d : 0;
  const dy = side === 2 ? -d : side === 3 ? d : 0;
  return { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h };
}

/** Straight between two boxes: position and sides (area is not kept; for boxes of one shape). */
export function lerp(a: Box, b: Box, e: number): Box {
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, w: a.w + (b.w - a.w) * e, h: a.h + (b.h - a.h) * e };
}

/** Between two boxes of one area, keeping it: sides interpolated geometrically, about the centre. */
export function morph(a: Box, b: Box, e: number): Box {
  const w = a.w ** (1 - e) * b.w ** e;
  const h = a.h ** (1 - e) * b.h ** e;
  const [ax, ay] = centreOf(a);
  const [bx, by] = centreOf(b);
  const cx = ax + (bx - ax) * e;
  const cy = ay + (by - ay) * e;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** `b`'s shape centred on (x, y). */
export function at(b: Box, x: number, y: number): Box {
  return { x: x - b.w / 2, y: y - b.h / 2, w: b.w, h: b.h };
}

/** A square of area `a` centred on (x, y). */
export function square(a: number, x: number, y: number): Box {
  const s = Math.sqrt(Math.max(0, a));
  return { x: x - s / 2, y: y - s / 2, w: s, h: s };
}

/** A 2 : 1 bar of area `a` about `b`'s centre, its long side along `b`'s. */
export function bar21(a: number, b: Box): Box {
  const long = Math.sqrt(2 * a);
  const short = Math.sqrt(a / 2);
  const [cx, cy] = centreOf(b);
  return b.w >= b.h ? { x: cx - long / 2, y: cy - short / 2, w: long, h: short } : { x: cx - short / 2, y: cy - long / 2, w: short, h: long };
}

/** The empty space between two boxes along the axis they face each other on (side by side: across; else up). */
export function between(a: Box, b: Box): number {
  const across = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const up = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  return Math.abs(centreOf(b)[0] - centreOf(a)[0]) >= Math.abs(centreOf(b)[1] - centreOf(a)[1]) ? across : up;
}

/**
 * How far partners' stakes lift off them, toward each other: to meet in the middle, a gap apart ("on the
 * table"), when there is room between them; a hair (GAP) when they stand close.
 */
export function onTable(a: Box, b: Box): number {
  return Math.max(GAP, (between(a, b) - GAP) / 2);
}

/** Subtract: the strip of `b` of area `a` at its `side` end, and what is left. */
export function cut(b: Box, side: Side, a: number): { piece: Box; rest: Box } {
  if (side < 2) {
    const t = Math.min(b.w, a / Math.max(b.h, 1e-12));
    return side === 1
      ? { piece: { x: b.x + b.w - t, y: b.y, w: t, h: b.h }, rest: { x: b.x, y: b.y, w: b.w - t, h: b.h } }
      : { piece: { x: b.x, y: b.y, w: t, h: b.h }, rest: { x: b.x + t, y: b.y, w: b.w - t, h: b.h } };
  }
  const t = Math.min(b.h, a / Math.max(b.w, 1e-12));
  return side === 3
    ? { piece: { x: b.x, y: b.y + b.h - t, w: b.w, h: t }, rest: { x: b.x, y: b.y, w: b.w, h: b.h - t } }
    : { piece: { x: b.x, y: b.y, w: b.w, h: t }, rest: { x: b.x, y: b.y + t, w: b.w, h: b.h - t } };
}

/** Where a piece cut off `side` meets the rest: the cut line (or, docked, the seam). */
export function seam(piece: Box, side: Side): Line {
  if (side === 1) return { x0: piece.x, y0: piece.y, x1: piece.x, y1: piece.y + piece.h };
  if (side === 0) return { x0: piece.x + piece.w, y0: piece.y, x1: piece.x + piece.w, y1: piece.y + piece.h };
  if (side === 3) return { x0: piece.x, y0: piece.y, x1: piece.x + piece.w, y1: piece.y };
  return { x0: piece.x, y0: piece.y + piece.h, x1: piece.x + piece.w, y1: piece.y + piece.h };
}

/** Add: a bar of area `a` along `side` of `host`, `gap` off it. */
export function bar(host: Box, side: Side, a: number, gap = 0): Box {
  if (side < 2) {
    const t = a / Math.max(host.h, 1e-12);
    return { x: side === 0 ? host.x - gap - t : host.x + host.w + gap, y: host.y, w: t, h: host.h };
  }
  const t = a / Math.max(host.w, 1e-12);
  return { x: host.x, y: side === 2 ? host.y - gap - t : host.y + host.h + gap, w: host.w, h: t };
}

/** A square of area `a` beside `host` on `side`, `gap` away, centred on that side. */
export function beside(host: Box, side: Side, a: number, gap = 0): Box {
  const q = Math.sqrt(Math.max(0, a));
  const [cx, cy] = centreOf(host);
  if (side === 0) return { x: host.x - gap - q, y: cy - q / 2, w: q, h: q };
  if (side === 1) return { x: host.x + host.w + gap, y: cy - q / 2, w: q, h: q };
  if (side === 2) return { x: cx - q / 2, y: host.y - gap - q, w: q, h: q };
  return { x: cx - q / 2, y: host.y + host.h + gap, w: q, h: q };
}

/**
 * Add, by the single rule: `a` joins `host` on `side` (from joinSide). The
 * smaller of the two becomes a bar along the larger's edge: a share smaller
 * than its host is a bar on the host; a bigger one stays a square, and the
 * host becomes a bar along it. Returns the square or bar the amount is drawn
 * as, the host as drawn, and the joined box.
 */
export function join(host: Box, a: number, side: Side, gap = 0): { piece: Box; host: Box; joined: Box } {
  if (a <= area(host)) {
    const piece = bar(host, side, a, gap);
    return { piece, host, joined: union(host, bar(host, side, a, 0)) };
  }
  const piece = beside(host, side, a, gap);
  const asBar = bar(piece, opposite(side), area(host), gap);
  return { piece, host: asBar, joined: union(piece, bar(piece, opposite(side), area(host), 0)) };
}

// ——— the three side rules ———

/** Cut: across the longer dimension, at the end facing `toward`. */
export function cutSide(b: Box, toward: Box): Side {
  const [ax, ay] = centreOf(b);
  const [bx, by] = centreOf(toward);
  return b.w >= b.h ? (bx < ax ? 0 : 1) : by < ay ? 2 : 3;
}

/** The long edge of `b` facing `toward` (a bar there grows the short side). */
function longEdge(b: Box, toward: Box): Side {
  const [ax, ay] = centreOf(b);
  const [bx, by] = centreOf(toward);
  return b.w >= b.h ? (by < ay ? 2 : 3) : bx < ax ? 0 : 1;
}

/**
 * Join: where `a` goes on `host`, coming from `toward`. Smaller than the host:
 * along its long edge facing `toward`, unless `toward` stands on that side
 * closer than the bar is thick (then the opposite long edge). Bigger: off the
 * end of the host's long axis facing `toward` (the host becomes the bar).
 */
export function joinSide(host: Box, toward: Box, a: number): Side {
  if (a > area(host)) return cutSide(host, toward);
  const side = longEdge(host, toward);
  const thick = side < 2 ? a / Math.max(host.h, 1e-12) : a / Math.max(host.w, 1e-12);
  const t = toward;
  const facing = side === 0 ? host.x - (t.x + t.w) : side === 1 ? t.x - (host.x + host.w) : side === 2 ? host.y - (t.y + t.h) : t.y - (host.y + host.h);
  const across = side < 2 ? Math.min(host.y + host.h, t.y + t.h) - Math.max(host.y, t.y) : Math.min(host.x + host.w, t.x + t.w) - Math.max(host.x, t.x);
  return across > 0 && facing >= 0 && facing < thick + 2 * GAP ? opposite(side) : side;
}

/** Pile: the side of `pile` a bar of area `a` joins to leave it squarest (within 10%), then the side used least. */
function squarestSide(pile: Box, a: number, used: readonly number[]): Side {
  const skew = (side: Side) => {
    const w = side < 2 ? pile.w + a / pile.h : pile.w;
    const h = side < 2 ? pile.h : pile.h + a / pile.w;
    return Math.max(w / h, h / w);
  };
  const scores = ([0, 1, 2, 3] as const).map(skew);
  const best = Math.min(...scores);
  let pick: Side | -1 = -1;
  for (const side of [1, 3, 0, 2] as const) {
    if (scores[side] > best * 1.1) continue;
    if (pick < 0 || used[side] < used[pick]) pick = side;
  }
  return pick as Side;
}

// ——— sums and divisions ———

interface PileStep {
  /** Where this piece ends up in the pile, where it waits a gap away first, on which side (-1: the first), and the pile after it. */
  bar: Box;
  staged: Box;
  side: Side | -1;
  pile: Box;
}

/** Sum: amounts (in the order given) joined one by one into a pile, the first a 2 : 1 bar; the whole pile centred on (x, y). */
export function pile(amounts: readonly number[], x: number, y: number, gap = GAP): PileStep[] {
  const steps: PileStep[] = [];
  const used = [0, 0, 0, 0];
  let p: Box | null = null;
  for (const a of amounts) {
    if (!p) {
      const first = bar21(a, { x, y, w: 1, h: 0 });
      p = first;
      steps.push({ bar: first, staged: first, side: -1, pile: first });
      continue;
    }
    const side = squarestSide(p, a, used);
    used[side]++;
    const b = bar(p, side, a, 0);
    p = union(p, b);
    steps.push({ bar: b, staged: bar(steps[steps.length - 1].pile, side, a, gap), side, pile: p });
  }
  // grown on all sides as it went: centre the finished pile
  if (!p) return steps;
  const [fx, fy] = centreOf(p);
  const shift = (b: Box): Box => ({ x: b.x + x - fx, y: b.y + y - fy, w: b.w, h: b.h });
  return steps.map((st) => ({ bar: shift(st.bar), staged: shift(st.staged), side: st.side, pile: shift(st.pile) }));
}

/**
 * Divide: n equal squares of area `a`, in rows (ceil √n to a row, the last
 * row centred), `gap` apart, the whole centred on (x, y); top row first.
 */
export function squares(n: number, a: number, x: number, y: number, gap = 0): Box[] {
  const q = Math.sqrt(Math.max(0, a));
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const step = q + gap;
  const out: Box[] = [];
  for (let r = 0; r < rows; r++) {
    const count = Math.min(cols, n - r * cols);
    const y0 = y + ((rows - 1) / 2 - r) * step - q / 2;
    for (let c = 0; c < count; c++) out.push({ x: x + (c - (count - 1) / 2) * step - q / 2, y: y0, w: q, h: q });
  }
  return out;
}

/** A tiled copy's proportions stay within 1 : TILE_ASPECT. */
const TILE_ASPECT = 2.5;

/**
 * Divide, with a remainder: copies of an area 1/N on the 1 × 1 box, in
 * `cols` × `rows` frames, each 1/cols wide and 1/rows tall, holding the copy
 * (1/cols wide, cols/N tall) and a thin empty band above it. As many whole
 * frames as fit (cols·rows ≤ N, so the bands are as thin as can be), the copy
 * within 1 : TILE_ASPECT, then the squarest copy; ties to the wider grid.
 */
export function tile(N: number): { cols: number; rows: number } {
  let best = { cols: 1, rows: Math.max(1, Math.floor(N + 1e-9)) };
  let count = 0;
  let skew = Infinity;
  for (let cols = 1; cols <= Math.ceil(Math.sqrt(N * TILE_ASPECT)) + 1; cols++) {
    const aspect = N / (cols * cols);
    if (aspect > TILE_ASPECT || aspect < 1 / TILE_ASPECT) continue;
    const rows = Math.floor(N / cols + 1e-9);
    if (rows < 1) continue;
    const k = cols * rows;
    const sk = Math.abs(Math.log(aspect));
    if (k > count || (k === count && sk <= skew + 1e-9)) {
      best = { cols, rows };
      count = k;
      skew = sk;
    }
  }
  return best;
}

/** Diameter of the spinner that decides a stake of `stake` (an area): about the stakes' size, never tiny. */
export function spinnerSize(stake: number): number {
  return Math.max(0.05, 1.3 * Math.sqrt(Math.max(0, stake)));
}

/** A weighted mean of colours, as rgb: the pile's colour is its pieces' colours mixed by amount. */
export function mix(colours: readonly (readonly [number, number, number])[], weights: readonly number[]): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let total = 0;
  colours.forEach(([cr, cg, cb], k) => {
    const w = weights[k];
    r += cr * w;
    g += cg * w;
    b += cb * w;
    total += w;
  });
  return total > 0 ? [r / total, g / total, b / total] : [0, 0, 0];
}
