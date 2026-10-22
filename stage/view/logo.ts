/**
 * The logo as a picture of the yard's reference box (area 1, all the wealth
 * there is): sixteen people, one with most of it, the rest a fractal tail.
 * Everything here is in box units (the box is [0, 1]², x right, y down), so the
 * logo and the stage share one geometry: zoom out and the logo is the box.
 *
 * The grid is n × n cells for n = 4, 3, 2 and then 1. At each level one person
 * takes the (n−1)² block and 2(n−1) people stand along its right and bottom
 * edges; the corner left over holds the next level. Sixteen squares in all:
 * 7 + 5 + 3 + 1 = 16 = 4², the odd numbers summing to a square. With the gaps
 * closed, each level-1 cell is exactly an equal share (1/16), so the logo
 * unfolds into the fair start, a 4 × 4 grid, by the big one giving back eight
 * cells and the eight smallest taking them.
 */

interface Cell {
  /** Top-left corner and side, box units. */
  readonly x: number;
  readonly y: number;
  readonly side: number;
  /** Wealth, total 1 (exact when the gaps are closed). */
  readonly share: number;
  /** 0 for the outer gnomon, 1, 2 …; the last corner is one level deeper. */
  readonly level: number;
}

interface GridOptions {
  /** Gutter at the outer level, box units. */
  readonly gap: number;
  /** Each level's gutter, relative to the one outside it. */
  readonly shrink: number;
  /** Cells per side at each level. */
  readonly levels: readonly number[];
}

export const GRID: GridOptions = { gap: 0.022, shrink: 0.5, levels: [4, 3, 2] };

/** The squares, the big one first, then each level's right column (top down) and bottom row (left to right), then the last corner. */
export function cells(o: GridOptions = GRID): Cell[] {
  const out: Cell[] = [];
  let ox = 0;
  let oy = 0;
  let size = 1;
  let g = o.gap;
  let wealth = 1;
  o.levels.forEach((n, level) => {
    const c = (size - (n - 1) * g) / n;
    const share = wealth / (n * n);
    const step = c + g;
    const m = n - 1;
    out.push({ x: ox, y: oy, side: m * c + (m - 1) * g, share: share * m * m, level });
    for (let k = 0; k < m; k++) out.push({ x: ox + m * step, y: oy + k * step, side: c, share, level });
    for (let k = 0; k < m; k++) out.push({ x: ox + k * step, y: oy + m * step, side: c, share, level });
    ox += m * step;
    oy += m * step;
    size = c;
    wealth = share;
    g *= o.shrink;
  });
  out.push({ x: ox, y: oy, side: size, share: wealth, level: o.levels.length });
  return out;
}

/**
 * Where each square goes in the fair 4 × 4 start, as [row, col]: the outer
 * ring stays, the big one keeps its corner cell, the smallest takes the
 * opposite corner, and the next level's gnomon fills the big one's freed
 * 3 × 3 the way it sat in its own corner (main in the middle, its column on
 * the right, its row along the bottom); the last three take what is left.
 */
export const FAIR: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 3], [1, 3], [2, 3],
  [3, 0], [3, 1], [3, 2],
  [1, 1],
  [0, 2], [1, 2],
  [2, 0], [2, 1],
  [2, 2],
  [0, 1],
  [1, 0],
  [3, 3],
];

// ———————————————————————————————————————————— type, measured off the fonts

export const SERIF = 'Gelasio';
/** The face of everything people read: Learn's words, the panel, labels and numbers (owner, 2026-10-21). */
export const SANS = 'Vazirmatn';

/** Ink bounds in em, from the pen at (0, baseline); y down. */
export interface Ink {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

const EM = 400;
let scratch: CanvasRenderingContext2D | null = null;

function pad(): CanvasRenderingContext2D {
  if (scratch) return scratch;
  const c = document.createElement('canvas');
  // wide enough for the longest run measured (the byline is about 9 em)
  c.width = EM * 14;
  c.height = EM * 2;
  scratch = c.getContext('2d', { willReadFrequently: true })!;
  return scratch;
}

/**
 * The ink of `glyphs` (each at its own pen x, em) between y0 and y1 (em, y
 * down from the baseline), at half coverage: the outline's own edge.
 */
export function inkOf(glyphs: readonly Glyph[], y0 = -1.2, y1 = 0.5): Ink {
  const ctx = pad();
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const ox = EM * 0.6;
  const base = EM * 1.3;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'alphabetic';
  for (const g of glyphs) {
    ctx.font = `${g.weight} ${EM * g.size}px ${g.family}`;
    ctx.fillText(g.ch, ox + g.x * EM, base);
  }
  const top = Math.max(0, Math.floor(base + y0 * EM));
  const bottom = Math.min(H, Math.ceil(base + y1 * EM));
  const data = ctx.getImageData(0, top, W, bottom - top).data;
  let l = Infinity;
  let r = -Infinity;
  let t = Infinity;
  let b = -Infinity;
  for (let y = 0; y < bottom - top; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] < 128) continue;
      if (x < l) l = x;
      if (x > r) r = x;
      if (y < t) t = y;
      if (y > b) b = y;
    }
  }
  return { left: (l - ox) / EM, right: (r + 1 - ox) / EM, top: (t + top - base) / EM, bottom: (b + 1 + top - base) / EM };
}

export interface Glyph {
  readonly ch: string;
  /** Pen x, em of the run's size. */
  readonly x: number;
  readonly family: string;
  readonly weight: number;
  /** Relative to the run's em (the square Q is set a little larger). */
  readonly size: number;
}

/** A word, letter by letter, kerned by the font and tracked by `tracking` em. */
export function setWord(word: string, family: string, weight: number, tracking = 0, from = 0): Glyph[] {
  const ctx = pad();
  ctx.font = `${weight} ${EM}px ${family}`;
  return [...word].map((ch, i) => ({ ch, x: from + ctx.measureText(word.slice(0, i)).width / EM + i * tracking, family, weight, size: 1 }));
}

export function advance(text: string, family: string, weight: number): number {
  const ctx = pad();
  ctx.font = `${weight} ${EM}px ${family}`;
  return ctx.measureText(text).width / EM;
}

// ———————————————————————————————————————————— the logo's words

interface Placed {
  readonly glyphs: readonly Glyph[];
  /** Pen origin of the run and its em, box units. */
  readonly x: number;
  readonly y: number;
  readonly em: number;
}

export interface Lettering {
  readonly fair: Placed;
  readonly amp: Placed;
  /** The i's dot: its width, box units (the big face's eye). */
  readonly dot: number;
  /** Ink top of the lettering, box units (negative: above the box). */
  readonly top: number;
}

interface LetterOptions {
  readonly weight: number;
  readonly tracking: number;
  /** Baseline above the box, in outer gutters. */
  readonly lift: number;
  /** Which part of the r meets the big square's right edge: its foot serif or its outermost ink. */
  readonly rEdge: 'foot' | 'ink';
  /** The & as a fraction of the column's width. */
  readonly ampScale: number;
}

export const LETTERS: LetterOptions = { weight: 700, tracking: 0.04, lift: 0.5, rEdge: 'ink', ampScale: 1 };

/** The feet: ink in a thin band on the baseline. */
export const FOOT: [number, number] = [-0.045, 0.02];

/**
 * "fair" spans the big square: the f's outer foot on its left edge (the
 * box's top-left corner), the r's right edge on its right edge. "&" spans the
 * column of small squares. Both stand `lift` gutters above the box.
 */
export function letter(grid: GridOptions = GRID, o: LetterOptions = LETTERS): Lettering {
  const sq = cells(grid);
  const big = sq[0];
  const column = sq[1];
  const word = setWord('fair', SERIF, o.weight, o.tracking);
  const foot = inkOf(word.slice(0, 1), ...FOOT).left;
  const right = o.rEdge === 'foot' ? inkOf(word.slice(3), ...FOOT).right : inkOf(word.slice(3)).right;
  const em = big.side / (right - foot);
  const y = -grid.gap * o.lift;
  const fair: Placed = { glyphs: word, x: big.x - foot * em, y, em };

  const amp = setWord('&', SERIF, o.weight);
  const ai = inkOf(amp);
  const aem = (column.side * o.ampScale) / (ai.right - ai.left);
  const centre = column.x + column.side / 2;
  const ampPlaced: Placed = { glyphs: amp, x: centre - ((ai.left + ai.right) / 2) * aem, y, em: aem };

  // the i's dot: the ink of the i above its stem
  const iGlyph = word.slice(2, 3);
  const xh = inkOf(setWord('x', SERIF, o.weight)).top;
  const dot = inkOf(iGlyph, -1.2, xh - 0.03);
  const top = Math.min(y + inkOf(word).top * em, y + ai.top * aem);
  return { fair, amp: ampPlaced, dot: (dot.right - dot.left) * em, top };
}

// ———————————————————————————————————————————— the lockup: fair & ▢

/**
 * The title's name for everyone who does not see it drawn ("Fair and Square", in words). The lockup and this stay
 * in English in every language, Farsi included (owner, 2026-10-21): they are a name, not words to translate.
 */
export const LOCKUP_LABEL = 'Fair and Square';

export interface Wordmark {
  /** "fair&", in em of the serif. */
  readonly glyphs: readonly Glyph[];
  /** The square drawn in place of the word "square": from the pen, em; it stands on the baseline. */
  readonly square: { readonly x: number; readonly side: number; readonly stroke: number };
  readonly width: number;
  readonly ink: Ink;
}

/**
 * The lockup (owner, 2026-10-21): "fair&" in the serif with no space, then a square in place of the word "square"
 * (a "Q": one of the game's squares, live; lockup.ts draws it), as tall as the serif's capitals, standing on the
 * baseline. `stroke` is the serif's stem, for a style that wants its weight.
 */
export function wordmark(weight = LETTERS.weight): Wordmark {
  const cap = -inkOf(setWord('H', SERIF, weight)).top;
  // the serif's stem: the l's at mid x-height (between its serifs)
  const l = inkOf(setWord('l', SERIF, weight), -0.3, -0.26);
  const stroke = l.right - l.left;
  const glyphs = setWord('fair&', SERIF, weight);
  // a hair after the &, as letters stand
  const x = advance('fair&', SERIF, weight) + 0.05;
  const words = inkOf(glyphs);
  const ink = { left: words.left, right: x + cap, top: Math.min(words.top, -cap), bottom: Math.max(words.bottom, 0) };
  return { glyphs, square: { x, side: cap, stroke }, width: x + cap, ink };
}

/** Fonts in, before any measuring. */
export async function fontsReady(): Promise<void> {
  await Promise.all([
    document.fonts.load(`700 40px ${SERIF}`),
    document.fonts.load(`400 40px ${SERIF}`),
    ...[400, 500, 600, 700].map((w) => document.fonts.load(`${w} 40px ${SANS}`)),
  ]);
}

// ———————————————————————————————————————————— the mark on whole pixels (favicons)

interface PixelCell {
  readonly x: number;
  readonly y: number;
  readonly side: number;
  /** Which square of the logo it is (0 the big one), so colours and looks match. */
  readonly who: number;
}

/**
 * The grid fitted to whole pixels for a mark of `P` px: whole-pixel gutters
 * (2 px from 48 px up, else 1 px inside and out), every edge on the pixel
 * grid, every square square. Each level is n × n as in `cells`; a level whose
 * cells would be under 2 px gives way to the next smaller n, and when none
 * fits, the corner stays one square: the tail ends where the pixels do.
 */
export function pixelCells(P: number, levels: readonly number[] = [...GRID.levels]): { cells: PixelCell[]; size: number; offset: number } {
  const out: PixelCell[] = [];
  let who = 0;
  const outer = P >= 48 ? 2 : 1;
  const c1 = Math.floor((P - (levels[0] - 1) * outer) / levels[0]);
  const size = levels[0] * c1 + (levels[0] - 1) * outer;
  const offset = Math.floor((P - size) / 2);
  let x = offset;
  let y = offset;
  let S = size;
  let g = outer;
  for (let k = 0; k < levels.length; k++) {
    const n = levels[k];
    const c = Math.floor((S - (n - 1) * g) / n);
    if (c < 2) continue;
    const main = (n - 1) * c + (n - 2) * g;
    out.push({ x, y, side: main, who: who++ });
    for (let j = 0; j < n - 1; j++) out.push({ x: x + main + g, y: y + j * (c + g), side: c, who: who++ });
    for (let j = 0; j < n - 1; j++) out.push({ x: x + j * (c + g), y: y + main + g, side: c, who: who++ });
    x += main + g;
    y += main + g;
    S -= main + g;
    g = 1;
  }
  out.push({ x, y, side: S, who: who++ });
  return { cells: out, size, offset };
}
