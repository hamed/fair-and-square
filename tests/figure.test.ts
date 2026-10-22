import { describe, expect, it } from 'vitest';
import { BOX, compile, restAreas, YARD } from '../stage/core/figure.ts';
import { tile as printGrid } from '../stage/core/area.ts';
import { Game } from '../stage/core/game.ts';
import { DEFAULT_RECIPE, PRESETS, formatRecipe, parseRecipe } from '../stage/core/recipe.ts';
import { FILL, HEX, RECT, TRI, areaOf, contains, natural, outline } from '../stage/core/shapes.ts';

function unequal(n = 40, seed = 2, trades = 6000): Float64Array {
  const g = new Game(n, seed);
  g.trade(trades);
  return g.wealth;
}

/** Every pair of target boxes is disjoint (touching allowed, to an ulp). */
function disjoint(f: ReturnType<typeof compile>): boolean {
  const n = f.kind.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const ox = Math.min(f.x[i] + f.w[i], f.x[j] + f.w[j]) - Math.max(f.x[i], f.x[j]);
      const oy = Math.min(f.y[i] + f.h[i], f.y[j] + f.h[j]) - Math.max(f.y[i], f.y[j]);
      if (ox > 1e-12 && oy > 1e-12) return false;
    }
  }
  return true;
}

function polygonArea(xy: number[]): number {
  let a = 0;
  for (let k = 0; k < xy.length; k += 2) {
    const j = (k + 2) % xy.length;
    a += xy[k] * xy[j + 1] - xy[j] * xy[k + 1];
  }
  return Math.abs(a) / 2;
}

describe('shapes', () => {
  it('every kind holds exactly its area, and outline, areaOf and contains agree', () => {
    const poly: number[] = [];
    for (const kind of [RECT, TRI, HEX]) {
      for (const a of [1e-6, 0.01, 0.3, 1]) {
        const [w, h] = natural(kind, a);
        expect(areaOf(kind, w, h)).toBeCloseTo(a, 12);
        outline(kind, 0.2, 0.3, w, h, poly);
        expect(polygonArea(poly)).toBeCloseTo(a, 12);
        expect(contains(kind, 0.2, 0.3, w, h, 0.2 + w / 2, 0.3 + h / 3)).toBe(true);
        // a box corner is outside every polygon but the rectangle
        expect(contains(kind, 0.2, 0.3, w, h, 0.2 + w * 0.999, 0.3 + h * 0.999)).toBe(kind === RECT);
        expect(contains(kind, 0.2, 0.3, w, h, 0.2 + w * 1.01, 0.3 + h / 2)).toBe(false);
      }
      expect(FILL[kind]).toBeGreaterThan(0);
    }
  });
});

describe('recipes', () => {
  it('parse in any order, with or without verbs, and format back', () => {
    const a = parseRecipe('log | bar | sort desc | stack');
    const b = parseRecipe('stack desc bar log');
    expect(a).toEqual(b);
    expect(formatRecipe(a)).toBe('log bar desc stack');
    expect(parseRecipe(formatRecipe(a))).toEqual(a);
    expect(parseRecipe('bar 0.05 gap 2 prints')).toMatchObject({ shape: 'bar', thickness: 0.05, gap: 2, prints: true });
    expect(parseRecipe('square', parseRecipe('bar 0.05')).thickness).toBeNull();
    expect(formatRecipe(DEFAULT_RECIPE)).toBe('');
  });

  it('reject unknown words and bad numbers', () => {
    expect(() => parseRecipe('stak')).toThrow(/unknown op/);
    expect(() => parseRecipe('gap')).toThrow();
    expect(() => parseRecipe('gap -1')).toThrow();
    expect(() => parseRecipe('bar 0')).toThrow();
    expect(() => parseRecipe('constructor')).toThrow();
  });

  it('every preset parses', () => {
    for (const text of Object.values(PRESETS)) expect(() => parseRecipe(text)).not.toThrow();
  });
});

describe('figures', () => {
  const wealth = unequal();
  const n = wealth.length;

  it('linear ccdf: bars 1/N tall, left-aligned, richest at the bottom, rows sharing edges to the bit', () => {
    const f = compile(parseRecipe('bar desc stack'), wealth);
    const rows = Array.from({ length: n }, (_, i) => i).sort((a, b) => f.y[a] - f.y[b]);
    for (let k = 0; k < n; k++) {
      const i = rows[k];
      expect(f.x[i]).toBe(BOX);
      expect(f.h[i]).toBe(1 / n);
      expect(f.w[i] * f.h[i]).toBeCloseTo(wealth[i], 14);
      if (k > 0) {
        const below = rows[k - 1];
        expect(f.y[i]).toBe(f.y[below] + f.h[below]);
        expect(f.w[i]).toBeLessThanOrEqual(f.w[below]);
      }
    }
    expect(f.y[rows[n - 1]] + f.h[rows[n - 1]]).toBeCloseTo(BOX + 1, 12);
    expect(disjoint(f)).toBe(true);
  });

  it('ccdf (log): the longest bar is exactly 1, and the poorest is drawn too (the axis starts a decade below it)', () => {
    const f = compile(parseRecipe(PRESETS.ccdf), wealth);
    expect(Math.max(...f.w)).toBeCloseTo(1, 12);
    // x = log 10 / (log w_max − log w_min + log 10), a bar x long: a true log scale (owner, 2026-10-22)
    const lo = Math.min(...wealth);
    const hi = Math.max(...wealth);
    const x = Math.log(10) / (Math.log(hi) - Math.log(lo / 10));
    expect(Math.min(...f.w)).toBeCloseTo(x, 9);
    expect(Math.min(...f.w)).toBeGreaterThan(1e-3);
    const rest = restAreas('logarea', wealth);
    expect(Math.max(...rest)).toBeCloseTo(1 / n, 14);
  });

  it('neff: squared areas fold into one photo of area Σw²; its frames tile the box in whole copies', () => {
    const f = compile(parseRecipe(PRESETS.neff), wealth);
    let squares = 0;
    let folded = 0;
    for (let i = 0; i < n; i++) {
      squares += wealth[i] * wealth[i];
      folded += f.w[i] * f.h[i];
      // inside the photo
      expect(f.x[i] + f.w[i]).toBeLessThanOrEqual(BOX + f.photo!.w + 1e-12);
      expect(f.y[i] + f.h[i]).toBeLessThanOrEqual(BOX + f.photo!.h + 1e-12);
    }
    expect(folded).toBeCloseTo(squares, 12);
    expect(disjoint(f)).toBe(true);
    const p = f.photo!;
    expect(p.w * p.h).toBeCloseTo(squares, 12);
    // the photo fits its frame, a thin band above it; the frames tile the unit box
    expect(p.w).toBe(p.frameW);
    expect(p.h).toBeLessThanOrEqual(p.frameH + 1e-12);
    const copies = f.prints.length + 1;
    expect(copies * p.frameW * p.frameH).toBeCloseTo(1, 12);
    // as many whole copies as N_eff allows (with the photo kept within 1 : 2.5)
    const neff = 1 / squares;
    expect(copies).toBeLessThanOrEqual(neff + 1e-9);
    expect(Math.max(p.w / p.h, p.h / p.w)).toBeLessThanOrEqual(2.5 + 1e-9);
  });

  it('print grids: 6.5 copies print as 3 × 2, and whole numbers as many as they are', () => {
    expect(printGrid(6.5)).toEqual({ cols: 3, rows: 2 });
    expect(printGrid(6)).toEqual({ cols: 3, rows: 2 });
    expect(printGrid(4.2)).toEqual({ cols: 2, rows: 2 });
    expect(printGrid(9.9)).toEqual({ cols: 3, rows: 3 });
    expect(printGrid(1.3)).toEqual({ cols: 1, rows: 1 });
    for (let N = 1; N < 40; N += 0.37) {
      const { cols, rows } = printGrid(N);
      expect(cols * rows).toBeLessThanOrEqual(N + 1e-9);
      // never fewer than two thirds of the whole copies there are room for (past the first few)
      if (N > 4) expect(cols * rows).toBeGreaterThanOrEqual((2 / 3) * Math.floor(N));
    }
  });

  it('class folds: each group a square of its own share, side by side', () => {
    const f = compile(parseRecipe(PRESETS.classes), wealth);
    expect(f.groups).toBe(3);
    const share = [0, 0, 0];
    const area = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      share[f.group[i]] += wealth[i];
      area[f.group[i]] += f.w[i] * f.h[i];
    }
    for (let g = 0; g < 3; g++) expect(area[g]).toBeCloseTo(share[g], 12);
    expect(disjoint(f)).toBe(true);
  });

  it('median with odd N leaves the median person alone in the middle', () => {
    const odd = unequal(41, 5);
    const f = compile(parseRecipe('median fold'), odd);
    expect(f.groups).toBe(3);
    expect(Array.from(f.group).filter((g) => g === 1)).toHaveLength(1);
  });

  it('every pose of every preset is disjoint and fits inside its walls', () => {
    for (const [name, text] of Object.entries(PRESETS)) {
      for (const extra of ['', ' tri', ' hex', ' log', ' squared', ' quartiles']) {
        const f = compile(parseRecipe(text + extra), wealth);
        if (f.free) continue;
        expect(disjoint(f), `${name}${extra}`).toBe(true);
        for (let i = 0; i < n; i++) {
          expect(f.x[i]).toBeGreaterThanOrEqual(0);
          expect(f.y[i]).toBeGreaterThanOrEqual(0);
          expect(f.x[i] + f.w[i]).toBeLessThanOrEqual(f.right);
          expect(f.y[i] + f.h[i]).toBeLessThanOrEqual(f.top);
        }
        expect(f.right).toBeGreaterThanOrEqual(YARD);
      }
    }
  });

  it('is a pure function of wealth and recipe', () => {
    const r = parseRecipe('quartiles shuffle hex pack');
    expect(compile(r, wealth)).toEqual(compile(r, wealth.slice()));
  });

  it('equal resize puts wealth into density: the drawn areas are equal, the rest areas are not', () => {
    const f = compile(parseRecipe('equal'), wealth);
    const areas = new Set(Array.from(f.w, (w, i) => +(w * f.h[i]).toPrecision(12)));
    expect(areas.size).toBe(1);
    expect(f.rest[0]).toBeCloseTo(wealth[0], 14);
  });
});

describe('the lattice (owner, 2026-10-19)', () => {
  it('⌈√N⌉ to a row, in sort order, each body centred in an equal cell, nobody overlapping', () => {
    const g = new Game(10, 3);
    g.round(50);
    const f = compile(parseRecipe('lattice asc'), g.wealth);
    const n = 10;
    const cols = 4;
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => g.wealth[a] - g.wealth[b] || a - b);
    const cx = (i: number) => f.x[i] + f.w[i] / 2;
    const cy = (i: number) => f.y[i] + f.h[i] / 2;
    const cell = cx(order[1]) - cx(order[0]);
    expect(cell).toBeGreaterThanOrEqual(YARD / cols - 1e-12);
    order.forEach((i, k) => {
      expect(cx(i)).toBeCloseTo(((k % cols) + 0.5) * cell, 12);
      expect(cy(i)).toBeCloseTo((Math.floor(k / cols) + 0.5) * cell, 12);
      expect(Math.max(f.w[i], f.h[i])).toBeLessThan(cell);
    });
    expect(f.free).toBe(false);
  });
});
