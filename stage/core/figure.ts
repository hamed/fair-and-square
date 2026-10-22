/**
 * A recipe applied to wealth: every body's shape, size and, unless the pose
 * is free, its exact place. Pure: same wealth and recipe, same figure, to the
 * bit. Coordinates are the stage's: origin at the yard's lower-left corner,
 * y up. Total wealth is 1, so the reference box (1 × 1) holds everyone at
 * rest; it stands in the middle of the 2 × 2 yard, and charts form in it
 * (from its lower-left corner, BOX).
 *
 * Charts are poses of the same bodies, never drawn axes:
 *   bar desc stack      left-aligned bars 1/N tall, longest at the bottom: the CCDF
 *   bar stack gap 1     bars with space between: a bar chart
 *   squared fold        squares of area w², folded into one square of area Σw²;
 *                       `prints` tiles the box with it, and the copies count N_eff
 *   tmb fold            each class folded into its own square: compare the shares
 */
import { createBoxes, packRectangles, shelves, squarify } from './pack.ts';
import type { Recipe } from './recipe.ts';
import { HEX, RECT, TRI, natural } from './shapes.ts';
import { Rng } from './rng.ts';
import { GAP, spinnerSize, tile } from './area.ts';

/** The yard's side; the reference box's is 1. */
export const YARD = 2;
/** The reference box's lower-left corner (x and y): it stands in the middle of the yard. */
export const BOX = (YARD - 1) / 2;
/** Smallest resting area, as a share of an equal share: the log measure's poorest still exist. */
const SPECK = 1e-9;

export interface Figure {
  /** No places: people roam (`wander`) or stay where they are (`still`). */
  readonly free: boolean;
  readonly still: boolean;
  /** Per body: kind (shapes.ts), box size, and left/bottom target (NaN when free). */
  readonly kind: Uint8Array;
  readonly w: Float64Array;
  readonly h: Float64Array;
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** Resting area under the recipe's scale: density = rest ÷ drawn area. */
  readonly rest: Float64Array;
  readonly group: Uint8Array;
  readonly groups: number;
  /** Offsets of the folded figure's copies, drawn inside `clip`. */
  readonly prints: readonly { readonly dx: number; readonly dy: number }[];
  readonly clip: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number } | null;
  /**
   * The folded photo the prints copy, and the frame each copy sits in: the
   * photo plus a thin empty band above it, the frames tiling the 1 × 1 box in
   * whole numbers. Null without prints.
   */
  readonly photo: {
    readonly w: number;
    readonly h: number;
    readonly frameW: number;
    readonly frameH: number;
    /** Copies side by side (a small N_eff): what the last leaves of the box (> 0, filled by a piece of one more) or
     *  puts past it (< 0, cut off and thrown away). */
    readonly cut?: number;
  } | null;
  /** How far the walls must open for this figure. */
  readonly right: number;
  readonly top: number;
}

/** Identities by ascending wealth, ties by identity. */
function rankAscending(wealth: ArrayLike<number>): Int32Array {
  const order = Int32Array.from({ length: wealth.length }, (_, i) => i);
  order.sort((a, b) => wealth[a] - wealth[b] || a - b);
  return order;
}

/**
 * The scale as a function of one wealth, normalised as everyone is now: the
 * share of all the wealth there is (`wealth`), or the log measure between
 * the current poorest and richest. Money in transit is no one's: `all` is
 * all the wealth there is, when some is not in `wealth`.
 */
/**
 * The log axis the bars stand on, as shares of all the money: from a tenth of the poorest (never under a speck,
 * so the poorest is drawn too: a short bar, not none) to the richest; `along(share)` is how far along, 0 … 1. The
 * yard's bars and the panel's CCDF both use it (owner, 2026-10-22: the chart is the bars' edge).
 */
export function logAxis(shares: ArrayLike<number>): { base: number; top: number; along: (share: number) => number } {
  const n = shares.length;
  let lo = Infinity;
  let top = -Infinity;
  for (let i = 0; i < n; i++) {
    lo = Math.min(lo, shares[i]);
    top = Math.max(top, shares[i]);
  }
  lo = Math.max(lo, SPECK / Math.max(1, n));
  const base = lo / 10;
  const span = Math.log(top) - Math.log(base);
  const along = (s: number) => (span > 0 ? Math.min(1, Math.max(0, Math.log(Math.max(s, lo)) - Math.log(base)) / span) : 1);
  return { base, top, along };
}

function scaleOf(scale: Recipe['scale'], wealth: ArrayLike<number>, all?: number): (w: number) => number {
  const n = wealth.length;
  let total = 0;
  for (let i = 0; i < n; i++) total += wealth[i];
  if (all !== undefined) total = all;
  const floor = SPECK / n;
  const axis = total > 0 ? logAxis(Array.from(wealth, (w) => w / total)) : null;
  return (w) => {
    let a: number;
    if (scale === 'wealth') {
      a = w / total;
    } else {
      // x = (log w − log b) / (log w_max − log b), b a tenth of the current poorest's, w_max the richest's
      const x = axis ? axis.along(w / total) : 1;
      // log: side x/√N, so a bar 1/N tall is x² long; logarea: side √(x/N), a bar x long
      a = scale === 'log' ? (x * x) / n : x / n;
    }
    return Math.max(floor, a);
  };
}

/** Resting area per body: what the recipe's scale measures. */
export function restAreas(scale: Recipe['scale'], wealth: ArrayLike<number>, out = new Float64Array(wealth.length), all?: number): Float64Array {
  const one = scaleOf(scale, wealth, all);
  for (let i = 0; i < wealth.length; i++) out[i] = one(wealth[i]);
  return out;
}

/**
 * The area a wealth `w` is drawn at in this recipe, everyone else as they are
 * now (`wealth`, `all`): what a cut takes off and a join adds, in the pose's
 * own scale. The arithmetic is always in wealth; this is only how big it
 * looks. Equal sizes (wealth as density) draw money at its natural size.
 */
export function measureOf(recipe: Recipe, wealth: ArrayLike<number>, all?: number): (w: number) => number {
  const one = scaleOf(recipe.scale, wealth, all);
  if (recipe.size !== 'squared') return one;
  let restTotal = 0;
  for (let i = 0; i < wealth.length; i++) restTotal += one(wealth[i]);
  return (w) => (one(w) * one(w)) / restTotal;
}

/** How the room (the `free` pose) is laid out besides everyone's size. */
export interface Room {
  /** Side of the empty square kept in the middle for a levy's pot; 0 (default) keeps none. */
  readonly pot?: number;
  /** Partners side by side: order[0] with order[1], … (Game.pair). Missing: everyone alone. */
  readonly pairs?: Int32Array;
  /** The stake, as a share of the poorer partner's wealth: partners stand apart enough for both stakes between them. */
  readonly stake?: number;
  /** The model's square lattice (a yard on a lattice): each body's cell y·side + x. The lattice pose puts them there. */
  readonly cells?: { readonly cell: ArrayLike<number>; readonly side: number };
  /** Yard units kept free above the yard for words over it: the walls open up by this much, in every pose. */
  readonly headroom?: number;
  /**
   * The heights the room keeps its homes between, [low, high] (words over the yard's top, controls over its
   * bottom: the room stands clear of them, the yard's size unchanged). Charts are not moved. Missing: the whole yard.
   */
  readonly band?: readonly [number, number];
  /**
   * How many of `pairs` are partners (the first 2 × partners, in pairs); the rest watch them, in a row below.
   * Missing: everyone paired (an odd one out alone). Partners named this way stand far enough apart for both stakes
   * and the coin between them.
   */
  readonly partners?: number;
}

/**
 * `total`: all the wealth there is, when some of it is in transit and not in
 * `wealth`. `aspect`: each person's width ÷ height, which trades change (a
 * slice off the long side, a bar onto the short one); a `square` body keeps
 * its area and takes its person's proportions. Missing: squares. `room`: the
 * pot's space and any pairs, for the room only.
 */
export function compile(recipe: Recipe, wealth: ArrayLike<number>, total?: number, aspect?: ArrayLike<number>, room: Room = {}): Figure {
  const n = wealth.length;
  const rest = restAreas(recipe.scale, wealth, undefined, total);
  let restTotal = 0;
  for (let i = 0; i < n; i++) restTotal += rest[i];

  const area = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    area[i] = recipe.size === 'equal' ? restTotal / n : recipe.size === 'squared' ? (rest[i] * rest[i]) / restTotal : rest[i];
  }

  const kind = new Uint8Array(n);
  const w = new Float64Array(n);
  const h = new Float64Array(n);
  const t = recipe.thickness ?? 1 / n;
  const k = recipe.shape === 'tri' ? TRI : recipe.shape === 'hex' ? HEX : RECT;
  for (let i = 0; i < n; i++) {
    kind[i] = k;
    if (recipe.shape === 'bar') {
      w[i] = area[i] / t;
      h[i] = t;
    } else if (recipe.shape === 'col') {
      w[i] = t;
      h[i] = area[i] / t;
    } else {
      [w[i], h[i]] = natural(k, area[i]);
      // side = wealth means a square: a body squared keeps no proportions of its own (the sides would not add up)
      const r = k === RECT && aspect && recipe.size !== 'squared' ? aspect[i] : 1;
      if (r !== 1 && r > 0) {
        w[i] = Math.sqrt(area[i] * r);
        h[i] = Math.sqrt(area[i] / r);
      }
    }
  }

  const ranks = rankAscending(wealth);
  const { group, groups } = groupsOf(recipe.group, ranks);
  const sequence = sequenceOf(recipe, ranks, group, groups);

  const x = new Float64Array(n).fill(NaN);
  const y = new Float64Array(n).fill(NaN);
  const prints: { dx: number; dy: number }[] = [];
  let clip: Figure['clip'] = null;
  let photo: Figure['photo'] = null;
  let right = YARD;
  let top = YARD;

  if (recipe.pose === 'wander' || recipe.pose === 'still') {
    for (let i = 0; i < n; i++) {
      right = Math.max(right, w[i]);
      top = Math.max(top, h[i]);
    }
    return { free: true, still: recipe.pose === 'still', kind, w, h, x, y, rest, group, groups, prints, clip, photo, right, top: Math.max(top, YARD + (room.headroom ?? 0)) };
  }

  if (recipe.pose === 'free') {
    const pot = room.pot ?? 0;
    const [lo, hi] = bandOf(room);
    if (room.pairs && room.pairs.length === n && room.partners !== undefined && 2 * room.partners < n - 1) watched(w, h, x, y, room.pairs, room.partners, lo, hi);
    else if (room.pairs && room.pairs.length === n) spreadPairs(w, h, x, y, pot, room.pairs, rest, room.stake ?? 0, lo, hi);
    else spreadOut(w, h, x, y, pot, undefined, lo, hi);
    // a body wider or taller than the yard (bar 0.01 free) is packed from the corner: the walls open for it
    for (let i = 0; i < n; i++) {
      right = Math.max(right, x[i] + w[i]);
      top = Math.max(top, y[i] + h[i]);
    }
    return { free: false, still: false, kind, w, h, x, y, rest, group, groups, prints, clip, photo, right, top: Math.max(top, YARD + (room.headroom ?? 0)) };
  }

  if (recipe.pose === 'stack' || recipe.pose === 'row') {
    const along = recipe.pose === 'stack' ? h : w;
    const start = recipe.pose === 'stack' ? y : x;
    const across = recipe.pose === 'stack' ? x : y;
    let mean = 0;
    for (let i = 0; i < n; i++) mean += along[i] / n;
    const gap = recipe.gap * mean;
    const groupGap = (recipe.gap + 1.5) * mean;
    // charts form in the reference box, in the middle of the yard
    let at = BOX;
    let previous = -1;
    for (const i of sequence) {
      if (previous >= 0) at += group[i] !== previous ? groupGap : gap;
      previous = group[i];
      start[i] = at;
      across[i] = BOX;
      // the next body starts where this one's far edge is computed: shared edges are bit-equal
      at = start[i] + along[i];
    }
    // longer than the box but not the yard: centred on the box, so the walls need not open
    const extent = at - BOX;
    if (extent > 1 && extent <= YARD) {
      const shift = (1 - extent) / 2;
      for (const i of sequence) start[i] += shift;
    }
  } else if (recipe.pose === 'tower' || recipe.pose === 'stairs') {
    // the running total, made of the bodies: poorest first, each a block 1/N wide and as tall as its share of
    // the box, standing on the total so far. A tower at the box's left edge (all the money, 1 high); pulled out
    // into stairs, block k at k/N, its top-right corner on the Lorenz curve
    const order = Array.from(ranks);
    let at = BOX;
    order.forEach((i, k) => {
      kind[i] = RECT;
      w[i] = 1 / n;
      h[i] = restTotal > 0 ? rest[i] / restTotal : 1 / n;
      x[i] = recipe.pose === 'tower' ? BOX : BOX + k / n;
      y[i] = at;
      at = y[i] + h[i];
    });
  } else if (recipe.pose === 'lattice') {
    // a square lattice: ⌈√N⌉ to a row, in the sequence's order from the bottom left, each body centred in its
    // cell; cells as wide as the yard allows, wider if a body needs it (then the walls open)
    // with the model's lattice, each in its own cell (neighbours there are the ones who trade); else in order
    const cells = room.cells && room.cells.cell.length === n ? room.cells : null;
    const cols = cells ? cells.side : Math.max(1, Math.ceil(Math.sqrt(n)));
    let side = 0;
    for (let i = 0; i < n; i++) side = Math.max(side, w[i], h[i]);
    const cell = Math.max(YARD / cols, side * (1 + recipe.gap) * 1.08);
    sequence.forEach((i, k) => {
      const at = cells ? cells.cell[i] : k;
      const col = at % cols;
      const row = Math.floor(at / cols);
      x[i] = col * cell + (cell - w[i]) / 2;
      y[i] = row * cell + (cell - h[i]) / 2;
    });
  } else if (recipe.pose === 'pack') {
    const boxes = createBoxes(n);
    let cursor = BOX;
    for (const g of groupOrder(sequence, group)) {
      const members = sequence.filter((i) => group[i] === g);
      // a small even gap, from the bodies' typical size
      let sum = 0;
      for (const i of members) sum += w[i] * h[i];
      const gap = (0.06 + recipe.gap) * Math.sqrt(sum / Math.max(1, members.length));
      const block = shelves(w, h, members, gap, boxes);
      for (const i of members) {
        x[i] = cursor + boxes.x0[i];
        y[i] = BOX + boxes.y0[i];
      }
      cursor += block.width + groupSpace(recipe, n, restTotal);
    }
  } else {
    // fold: each group squarified into one square of its own area, exactly, no gaps; a photo
    // to print is folded to the shape whose frames tile the box in the most whole copies
    const boxes = createBoxes(n);
    let cursor = BOX;
    let all = 0;
    for (let i = 0; i < n; i++) all += area[i];
    const printing = recipe.prints && groups === 1 && all > 0 && all < 1;
    // a small N_eff (owner, 2026-10-21: any): the nearest whole number of copies side by side, the photo as tall as
    // the box (the last past its edge, or a gap left: prints.ts cuts or fills it); else frames in whole copies
    const near = printing ? stripOf(1 / all) : 0;
    const grid = printing ? (near ? { cols: near, rows: 1 } : tile(1 / all)) : null;
    for (const g of groupOrder(sequence, group)) {
      const members = sequence.filter((i) => group[i] === g);
      members.sort((a, b) => area[b] - area[a] || a - b);
      let sum = 0;
      for (const i of members) sum += area[i];
      const side = Math.sqrt(sum);
      const pw = near ? sum : grid ? 1 / grid.cols : side;
      const ph = near ? 1 : grid ? sum * grid.cols : side;
      squarify(area, members, { x0: cursor, y0: BOX, x1: cursor + pw, y1: BOX + ph }, boxes);
      for (const i of members) {
        kind[i] = RECT;
        x[i] = boxes.x0[i];
        y[i] = boxes.y0[i];
        w[i] = boxes.x1[i] - boxes.x0[i];
        h[i] = boxes.y1[i] - boxes.y0[i];
      }
      cursor += pw + groupSpace(recipe, n, restTotal);
    }
    if (near) {
      // the photo a column as tall as the box; its copies beside it, the last past the box's edge or short of it
      clip = { x0: BOX, y0: BOX, x1: BOX + Math.max(1, near * all), y1: BOX + 1 };
      photo = { w: all, h: 1, frameW: all, frameH: 1, cut: 1 - near * all };
      for (let a = 1; a < near; a++) prints.push({ dx: a * all, dy: 0 });
    } else if (grid) {
      // the group photo, printed again and again on the 1 × 1 paper, one to a frame
      const frameW = 1 / grid.cols;
      const frameH = 1 / grid.rows;
      clip = { x0: BOX, y0: BOX, x1: BOX + 1, y1: BOX + 1 };
      photo = { w: frameW, h: all * grid.cols, frameW, frameH };
      for (let a = 0; a < grid.cols; a++) {
        for (let b = 0; b < grid.rows; b++) if (a || b) prints.push({ dx: a * frameW, dy: b * frameH });
      }
    }
  }

  for (let i = 0; i < n; i++) {
    right = Math.max(right, x[i] + w[i]);
    top = Math.max(top, y[i] + h[i]);
  }
  return { free: false, still: false, kind, w, h, x, y, rest, group, groups, prints, clip, photo, right, top: Math.max(top, YARD + (room.headroom ?? 0)) };
}

/** N_eff up to this prints as copies side by side, each as tall as the box. */
const STRIP_MOST = 6;

/** Copies side by side for N_eff `neff`: the nearest whole number (at least 1); 0 past STRIP_MOST (frames then). */
export function stripOf(neff: number): number {
  return neff > 0 && neff < STRIP_MOST + 0.5 ? Math.max(1, Math.round(neff)) : 0;
}

/** Share of the yard the bodies plus their even margins cover when spread out. */
const SPREAD = 0.62;
/** Room around a pot, and between partners and their stakes. */
const CLEARANCE = 0.05;

/**
 * Side of the empty square a levy of `rate` needs in the middle of the room:
 * its pot (area `rate` of the total 1, never longer than a 2 : 1 bar of it)
 * with room around it for the pieces coming in and going out.
 */
export function potRoom(rate: number): number {
  return rate > 0 ? Math.sqrt(2 * Math.min(1, rate)) + 2 * CLEARANCE : 0;
}

/**
 * Homes spread evenly over the yard: everyone starts on a jittered grid by
 * identity (so homes stay put as wealth changes), and overlapping boxes, each
 * inflated by a margin that would fill SPREAD of the yard, are pushed apart
 * until none overlap. If that cannot be done with margins, without; if not
 * even that, packed from the corner. The result is always disjoint.
 *
 * `drawn` (pairs): each box's height that is drawn (the rest is room kept
 * above it); the boxes go in justified rows, evenly spaced, the row count
 * chosen so the drawn parts stand furthest apart, the pot's square kept
 * clear. If no row count fits, they spread out as people do.
 */
function spreadOut(w: Float64Array, h: Float64Array, x: Float64Array, y: Float64Array, pot: number, drawn?: Float64Array, lo = 0, hi = YARD): void {
  const n = w.length;
  let area = 0;
  let sides = 0;
  let longest = 0;
  for (let i = 0; i < n; i++) {
    area += w[i] * h[i];
    sides += w[i] + h[i];
    longest = Math.max(longest, w[i], h[i]);
  }
  // the pot's square no bigger than leaves everyone room around it
  pot = Math.max(0, Math.min(pot, YARD - 2 * longest - 1e-6));
  const cx = new Float64Array(n);
  const cy = new Float64Array(n);
  if (drawn && rowCentres(w, h, drawn, pot, cx, cy, lo, hi)) {
    // in their cells: only the pot's spot may still push someone
    if (relax(w, h, cx, cy, 0, pot, 300, lo, hi)) {
      for (let i = 0; i < n; i++) {
        x[i] = cx[i] - w[i] / 2;
        y[i] = cy[i] - h[i] / 2;
      }
      return;
    }
  }
  {
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const cw = YARD / cols;
    const ch = (hi - lo) / rows;
    for (let i = 0; i < n; i++) {
      cx[i] = ((i % cols) + 0.5 + 0.3 * jitter(i, 1)) * cw;
      cy[i] = lo + (Math.floor(i / cols) + 0.5 + 0.3 * jitter(i, 2)) * ch;
    }
    if (pot > 0) {
      // homes moved out along their rays from the middle: the grid squeezed into the ring around the pot
      const c = YARD / 2;
      const half = Math.min(pot / 2, c);
      for (let i = 0; i < n; i++) {
        const dx = cx[i] - c;
        const dy = cy[i] - c;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (!(d > 0)) continue;
        const k = (half + (d * (c - half)) / c) / d;
        cx[i] = c + dx * k;
        cy[i] = c + dy * k;
      }
    }
  }
  // n·m² + m·Σ(w + h) + Σ w·h = spread · yard
  const margin = (spread: number) => {
    const spare = spread * YARD * (hi - lo) - area - pot * pot;
    return spare > 0 ? (-sides + Math.sqrt(sides * sides + 4 * n * spare)) / (2 * n) : 0;
  };
  // with margins for a while (they may not all fit), then without, continuing from there, then
  // without the pot's spot
  if (!relax(w, h, cx, cy, margin(SPREAD), pot, 80, lo, hi) && !relax(w, h, cx, cy, 0, pot, 300, lo, hi) && !(pot > 0 && relax(w, h, cx, cy, 0, 0, 300, lo, hi)) && !(hi - lo < YARD && relax(w, h, cx, cy, 0, pot, 300))) {
    const boxes = createBoxes(n);
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => w[b] * h[b] - w[a] * h[a] || a - b);
    let widest = 0;
    for (let i = 0; i < n; i++) widest = Math.max(widest, w[i]);
    packRectangles(w, h, order, Math.max(YARD, widest), boxes);
    for (let i = 0; i < n; i++) {
      x[i] = boxes.x0[i];
      y[i] = boxes.y0[i];
    }
    return;
  }
  for (let i = 0; i < n; i++) {
    x[i] = cx[i] - w[i] / 2;
    y[i] = cy[i] - h[i] / 2;
  }
}

/**
 * Centres for boxes in justified rows: in order, split into rows of about
 * equal width; each row as tall as it needs with the drawn parts (`drawn`
 * tall, at the bottom of each box) level; spare width shared evenly between
 * the boxes of a row. Spare height shared evenly between rows, a row that
 * crosses the pot's square split around it; or (an even number of rows)
 * half the rows below the pot's square and half above. Of all of these, the
 * one whose drawn parts stand furthest apart, across and up. False if none fits.
 */
function rowCentres(w: Float64Array, h: Float64Array, drawn: Float64Array, pot: number, cx: Float64Array, cy: Float64Array, lo = 0, hi = YARD): boolean {
  const n = w.length;
  const c = YARD / 2;
  let total = 0;
  for (let i = 0; i < n; i++) total += w[i];
  const row = new Int32Array(n);
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  let best = -Infinity;
  /** Boxes `part` justified across [x0, x1]: the gap between them (Infinity if none). */
  const justify = (part: number[], x0: number, x1: number): number => {
    if (!part.length) return Infinity;
    let width = 0;
    for (const i of part) width += w[i];
    const g = (x1 - x0 - width) / (part.length + 1);
    let x = x0 + g;
    for (const i of part) {
      px[i] = x + w[i] / 2;
      x += w[i] + g;
    }
    return g;
  };
  for (let rows = 1; rows <= n; rows++) {
    const target = total / rows;
    let cum = 0;
    for (let i = 0; i < n; i++) {
      row[i] = Math.min(rows - 1, Math.floor((cum + w[i] / 2) / target));
      cum += w[i];
    }
    const body = new Float64Array(rows);
    const tall = new Float64Array(rows);
    const members: number[][] = Array.from({ length: rows }, () => []);
    for (let i = 0; i < n; i++) {
      body[row[i]] = Math.max(body[row[i]], drawn[i]);
      members[row[i]].push(i);
    }
    if (members.some((m) => m.length === 0)) continue;
    for (let i = 0; i < n; i++) tall[row[i]] = Math.max(tall[row[i]], (body[row[i]] - drawn[i]) / 2 + h[i]);
    let sum = 0;
    for (let r = 0; r < rows; r++) sum += tall[r];
    if (sum > hi - lo) break;
    // where each row starts, and the gaps between rows: shared evenly, or around the pot
    const layouts: { at: number[]; gap: number }[] = [];
    {
      const g = (hi - lo - sum) / (rows + 1);
      const at: number[] = [];
      let y = lo + g;
      for (let r = 0; r < rows; r++) {
        at.push(y);
        y += tall[r] + g;
      }
      layouts.push({ at, gap: g });
    }
    if (pot > 0 && rows % 2 === 0 && lo === 0 && hi === YARD) {
      const half = rows / 2;
      let low = 0;
      let high = 0;
      for (let r = 0; r < rows; r++) (r < half ? (low += tall[r]) : (high += tall[r]));
      const gl = (c - pot / 2 - low) / half;
      const gu = (YARD - c - pot / 2 - high) / half;
      if (gl >= 0 && gu >= 0) {
        const at: number[] = [];
        let y = gl;
        for (let r = 0; r < half; r++) {
          at.push(y);
          y += tall[r] + gl;
        }
        y = c + pot / 2;
        for (let r = half; r < rows; r++) {
          at.push(y);
          y += tall[r] + gu;
        }
        layouts.push({ at, gap: Math.min(gl, gu) });
      }
    }
    for (const { at, gap: vgap } of layouts) {
      let across = Infinity;
      for (let r = 0; r < rows && across >= PARTNERS; r++) {
        const m = members[r];
        for (const i of m) py[i] = at[r] + (body[r] - drawn[i]) / 2 + h[i] / 2;
        if (!(pot > 0 && at[r] < c + pot / 2 && at[r] + tall[r] > c - pot / 2)) {
          across = Math.min(across, justify(m, 0, YARD));
          continue;
        }
        // crossing the pot's square: the cut into left and right that leaves the most room
        let bestK = -1;
        let bestG = -Infinity;
        for (let k = 0; k <= m.length; k++) {
          const g = Math.min(justify(m.slice(0, k), 0, c - pot / 2), justify(m.slice(k), c + pot / 2, YARD));
          if (g > bestG) {
            bestG = g;
            bestK = k;
          }
        }
        justify(m.slice(0, bestK), 0, c - pot / 2);
        justify(m.slice(bestK), c + pot / 2, YARD);
        across = Math.min(across, bestG);
      }
      if (!(across >= PARTNERS)) continue;
      // up: the gap between rows and the room kept above the lower row's bodies
      let up = Infinity;
      for (let r = 0; r + 1 < rows; r++) up = Math.min(up, vgap + tall[r] - body[r]);
      const score = Math.min(across, up);
      if (score > best) {
        best = score;
        cx.set(px);
        cy.set(py);
      }
    }
  }
  return best > -Infinity;
}

/** Between partners: close, face to face. */
const PARTNERS = 0.03;

/**
 * The room in pairs: partners close, side by side, centres level, with room
 * just above them for the spinner that decides their toss; the pairs (and
 * anyone left over) spread out like people, homes by pair, so new partners
 * move.
 */
function spreadPairs(w: Float64Array, h: Float64Array, x: Float64Array, y: Float64Array, pot: number, order: Int32Array, rest: Float64Array, stake: number, lo = 0, hi = YARD): void {
  const n = w.length;
  const units = Math.ceil(n / 2);
  const uw = new Float64Array(units);
  const uh = new Float64Array(units);
  const ux = new Float64Array(units);
  const uy = new Float64Array(units);
  const tall = new Float64Array(units);
  for (let u = 0; u < units; u++) {
    const i = order[2 * u];
    const j = 2 * u + 1 < n ? order[2 * u + 1] : -1;
    if (j < 0) {
      uw[u] = w[i];
      uh[u] = tall[u] = h[i];
      continue;
    }
    // the spinner above them, sized to their stake, clear of a stake cut off the top (a tall
    // body cuts across its height, at the end toward its partner, who is level: the top)
    const s = stake * Math.min(rest[i], rest[j]);
    const dial = s > 0 ? spinnerSize(s) : 0;
    const top = Math.max(h[i] > w[i] ? s / w[i] : 0, h[j] > w[j] ? s / w[j] : 0);
    tall[u] = Math.max(h[i], h[j]);
    uw[u] = Math.max(w[i] + PARTNERS + w[j], dial);
    uh[u] = tall[u] + (dial > 0 ? top + dial + PARTNERS : 0);
  }
  spreadOut(uw, uh, ux, uy, pot, tall, lo, hi);
  for (let u = 0; u < units; u++) {
    const i = order[2 * u];
    const j = 2 * u + 1 < n ? order[2 * u + 1] : -1;
    const pair = j < 0 ? w[i] : w[i] + PARTNERS + w[j];
    const left = ux[u] + (uw[u] - pair) / 2;
    x[i] = left;
    y[i] = uy[u] + (tall[u] - h[i]) / 2;
    if (j < 0) continue;
    x[j] = left + w[i] + PARTNERS;
    y[j] = uy[u] + (tall[u] - h[j]) / 2;
  }
}

/** How far named partners' stakes stand off them, on the table between them, yard units. */
const TABLE = 0.09;

/** The room's heights: the band asked for, within the yard and at least a third of it; else the whole yard. */
function bandOf(room: Room): [number, number] {
  const b = room.band;
  if (!b) return [0, YARD];
  const lo = Math.max(0, Math.min(YARD, b[0]));
  const hi = Math.max(0, Math.min(YARD, b[1]));
  return hi - lo >= YARD / 3 ? [lo, hi] : [0, YARD];
}

/**
 * Partners named (Room.partners) in the middle of the band, a table apart (their stakes meet on it, each TABLE
 * from its own; the coin above); everyone else in a row along the band's bottom, watching. Rows are justified
 * across the yard.
 */
function watched(w: Float64Array, h: Float64Array, x: Float64Array, y: Float64Array, order: Int32Array, partners: number, lo: number, hi: number): void {
  const margin = 0.04;
  const watchers = Array.from(order.slice(2 * partners));
  let wTall = 0;
  let wWide = 0;
  for (const i of watchers) {
    wTall = Math.max(wTall, h[i]);
    wWide += w[i];
  }
  const wGap = (YARD - wWide) / (watchers.length + 1);
  let wx = wGap;
  for (const i of watchers) {
    x[i] = wx;
    y[i] = lo + margin + (wTall - h[i]) / 2;
    wx += w[i] + wGap;
  }
  // the pairs: apart by both stakes (cut across, at the slider's most or a third, whichever is more) and a coin
  const units: { i: number; j: number; apart: number; wide: number }[] = [];
  let pTall = 0;
  let pWide = 0;
  for (let k = 0; k < partners; k++) {
    const i = order[2 * k];
    const j = order[2 * k + 1];
    // a table between them: each stake lifts TABLE off its own and meets the other's in the middle, a hair apart
    const apart = 2 * TABLE + GAP;
    units.push({ i, j, apart, wide: w[i] + apart + w[j] });
    pTall = Math.max(pTall, h[i], h[j]);
    pWide += w[i] + apart + w[j];
  }
  const pGap = (YARD - pWide) / (units.length + 1);
  const floor = watchers.length ? lo + margin + wTall + margin : lo;
  // a little below the middle of what is left: under the words, with room above them for the coin
  const centre = Math.max(floor + pTall / 2, Math.min(hi - margin - pTall / 2, floor + 0.4 * (hi - floor)));
  let px = pGap;
  for (const u of units) {
    x[u.i] = px;
    y[u.i] = centre - h[u.i] / 2;
    x[u.j] = px + w[u.i] + u.apart;
    y[u.j] = centre - h[u.j] / 2;
    px += u.wide + pGap;
  }
}

/**
 * Push boxes (inflated by `m`, walls keeping m/2) apart until none overlap,
 * and off the pot's square (side `pot`) in the middle. Returns whether the
 * plain boxes ended disjoint, inside the yard and off the pot.
 */
function relax(w: Float64Array, h: Float64Array, cx: Float64Array, cy: Float64Array, m: number, pot: number, rounds: number, lo = 0, hi = YARD): boolean {
  const n = w.length;
  const order = Array.from({ length: n }, (_, i) => i);
  const clampAll = () => {
    for (let i = 0; i < n; i++) {
      const ax = Math.min(w[i] / 2 + m / 2, YARD / 2);
      const ay = Math.min(h[i] / 2 + m / 2, (hi - lo) / 2);
      cx[i] = Math.min(Math.max(cx[i], ax), YARD - ax);
      cy[i] = Math.min(Math.max(cy[i], lo + ay), hi - ay);
    }
  };
  const left = (i: number) => cx[i] - w[i] / 2;
  // insertion sort by left edge: nearly sorted from the round before
  const sortOrder = () => {
    for (let p = 1; p < n; p++) {
      const id = order[p];
      const v = left(id);
      let q = p - 1;
      while (q >= 0 && left(order[q]) > v) {
        order[q + 1] = order[q];
        q--;
      }
      order[q + 1] = id;
    }
  };
  // the pot's spot in the middle stays empty: anyone on it is pushed off the nearest way
  const keepOut = () => {
    let pushed = false;
    if (!(pot > 0)) return false;
    const half = pot / 2;
    for (let i = 0; i < n; i++) {
      const px = w[i] / 2 + m / 2 + half - Math.abs(cx[i] - YARD / 2);
      const py = h[i] / 2 + m / 2 + half - Math.abs(cy[i] - YARD / 2);
      if (px <= 1e-12 || py <= 1e-12) continue;
      pushed = true;
      if (px < py) cx[i] += (cx[i] >= YARD / 2 ? 1 : -1) * (px + 1e-9);
      else cy[i] += (cy[i] >= YARD / 2 ? 1 : -1) * (py + 1e-9);
    }
    return pushed;
  };
  clampAll();
  order.sort((a, b) => left(a) - left(b));
  for (let round = 0; round < rounds; round++) {
    sortOrder();
    let moved = false;
    for (let p = 0; p < n; p++) {
      const i = order[p];
      const reach = cx[i] + w[i] / 2 + m;
      for (let q = p + 1; q < n; q++) {
        const j = order[q];
        if (cx[j] - w[j] / 2 >= reach) break;
        const px = (w[i] + w[j]) / 2 + m - Math.abs(cx[j] - cx[i]);
        const py = (h[i] + h[j]) / 2 + m - Math.abs(cy[j] - cy[i]);
        if (px <= 1e-12 || py <= 1e-12) continue;
        moved = true;
        // half each, a hair past touching
        if (px < py) {
          const d = (cx[j] >= cx[i] ? 1 : -1) * (px / 2 + 1e-9);
          cx[i] -= d;
          cx[j] += d;
        } else {
          const d = (cy[j] >= cy[i] ? 1 : -1) * (py / 2 + 1e-9);
          cy[i] -= d;
          cy[j] += d;
        }
      }
    }
    if (keepOut()) moved = true;
    clampAll();
    if (!moved) break;
  }
  sortOrder();
  const half = pot / 2;
  for (let p = 0; p < n; p++) {
    const i = order[p];
    if (cx[i] - w[i] / 2 < 0 || cy[i] - h[i] / 2 < lo - 1e-12 || cx[i] + w[i] / 2 > YARD || cy[i] + h[i] / 2 > hi + 1e-12) return false;
    if (half > 0 && w[i] / 2 + half - Math.abs(cx[i] - YARD / 2) > 1e-12 && h[i] / 2 + half - Math.abs(cy[i] - YARD / 2) > 1e-12) return false;
    const end = cx[i] + w[i] / 2;
    for (let q = p + 1; q < n; q++) {
      const j = order[q];
      if (left(j) >= end) break;
      const ox = Math.min(end, cx[j] + w[j] / 2) - Math.max(left(i), left(j));
      const oy = Math.min(cy[i] + h[i] / 2, cy[j] + h[j] / 2) - Math.max(cy[i] - h[i] / 2, cy[j] - h[j] / 2);
      if (ox > 1e-12 && oy > 1e-12) return false;
    }
  }
  return true;
}

/** Deterministic noise in [-1, 1] per identity. */
function jitter(i: number, salt: number): number {
  let v = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b);
  v = Math.imul(v ^ (v >>> 15), 0x2c1b3c6d);
  v ^= v >>> 13;
  return ((v >>> 0) / 0xffff_ffff) * 2 - 1;
}

/** Space between groups that are packed or folded side by side. */
function groupSpace(recipe: Recipe, n: number, total: number): number {
  return (recipe.gap + 1) * 0.35 * Math.sqrt(total / n);
}

/** Group index per body, from its wealth rank. Groups run poorest (0) to richest. */
function groupsOf(kind: Recipe['group'], ranks: Int32Array): { group: Uint8Array; groups: number } {
  const n = ranks.length;
  const group = new Uint8Array(n);
  if (kind === 'none') return { group, groups: 1 };
  let groups: number;
  for (let r = 0; r < n; r++) {
    const i = ranks[r];
    if (kind === 'median') {
      // odd N: the median person stands alone between the halves
      group[i] = n % 2 === 0 ? (r < n / 2 ? 0 : 1) : r < (n - 1) / 2 ? 0 : r === (n - 1) / 2 ? 1 : 2;
    } else if (kind === 'tmb') {
      // bottom half, middle forty percent, top tenth (at least one person)
      const bottom = Math.floor(n / 2);
      const top = Math.max(1, Math.round(n / 10));
      group[i] = r < bottom ? 0 : r >= n - top ? 2 : 1;
    } else {
      const g = kind === 'quartiles' ? 4 : 10;
      group[i] = Math.min(g - 1, Math.floor((g * r) / n));
    }
  }
  if (kind === 'median') groups = n % 2 === 0 ? 2 : 3;
  else if (kind === 'tmb') groups = 3;
  else groups = kind === 'quartiles' ? 4 : 10;
  return { group, groups };
}

/** Groups in the order the sequence meets them: left to right when packed or folded. */
function groupOrder(sequence: readonly number[], group: Uint8Array): number[] {
  const seen: number[] = [];
  for (const i of sequence) if (!seen.includes(group[i])) seen.push(group[i]);
  return seen;
}

/** Bodies in pose order: groups first (richest first when sorted descending), then the sort inside each. */
function sequenceOf(recipe: Recipe, ranks: Int32Array, group: Uint8Array, groups: number): number[] {
  const n = ranks.length;
  let order: number[];
  if (recipe.order === 'asc') order = Array.from(ranks);
  else if (recipe.order === 'desc') order = Array.from(ranks).reverse();
  else if (recipe.order === 'shuffle') {
    // a fixed shuffle: the same every frame, so a live chart does not reshuffle
    order = Array.from({ length: n }, (_, i) => i);
    const rng = new Rng(0x5eed);
    for (let k = n - 1; k > 0; k--) {
      const j = Math.floor(rng.next() * (k + 1));
      [order[k], order[j]] = [order[j], order[k]];
    }
  } else order = Array.from({ length: n }, (_, i) => i);
  if (groups === 1) return order;
  const out: number[] = [];
  for (let k = 0; k < groups; k++) {
    const g = recipe.order === 'desc' ? groups - 1 - k : k;
    for (const i of order) if (group[i] === g) out.push(i);
  }
  return out;
}
