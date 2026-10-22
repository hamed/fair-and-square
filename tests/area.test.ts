import { describe, expect, it } from 'vitest';
import { area, bar21, cut, cutSide, join, joinSide, mix, morph, pile, square, squares, tile, union, type Box, type Side } from '../stage/core/area.ts';

const skew = (b: Box) => Math.max(b.w / b.h, b.h / b.w);
const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });

describe('the arithmetic of areas', () => {
  it('cut subtracts exactly: the piece is the amount, piece and rest make the box', () => {
    const b = box(0.2, 0.3, 0.5, 0.2);
    for (const side of [0, 1, 2, 3] as Side[]) {
      const { piece, rest } = cut(b, side, 0.03);
      expect(area(piece)).toBeCloseTo(0.03, 15);
      expect(area(piece) + area(rest)).toBeCloseTo(area(b), 15);
      const u = union(piece, rest);
      for (const k of ['x', 'y', 'w', 'h'] as const) expect(u[k]).toBeCloseTo(b[k], 15);
    }
  });

  it('a cut goes across the longer dimension, at the end facing where the piece goes', () => {
    const wide = box(0, 0, 0.4, 0.2);
    expect(cutSide(wide, box(1, 0, 0.1, 0.1))).toBe(1);
    expect(cutSide(wide, box(-1, 0, 0.1, 0.1))).toBe(0);
    const tall = box(0, 0, 0.2, 0.4);
    expect(cutSide(tall, box(0, 1, 0.1, 0.1))).toBe(3);
    expect(cutSide(tall, box(0, -1, 0.1, 0.1))).toBe(2);
    // the long side shortens: the rest is squarer
    expect(skew(cut(wide, 1, 0.01).rest)).toBeLessThan(skew(wide));
  });

  it('join adds exactly by one rule: the smaller becomes a bar along the larger', () => {
    const host = box(0, 0, 0.4, 0.2);
    // smaller: a bar on the host's long edge, which leaves it squarer than the short edge would
    const small = join(host, 0.02, joinSide(host, box(0.1, 1, 0.1, 0.1), 0.02));
    expect(area(small.piece)).toBeCloseTo(0.02, 15);
    expect(area(small.joined)).toBeCloseTo(area(host) + 0.02, 15);
    expect(small.piece.w).toBeCloseTo(host.w, 15);
    expect(skew(small.joined)).toBeLessThan(skew(join(host, 0.02, 1).joined));
    // bigger: the amount stays a square, the host becomes a bar along it
    const big = join(host, 0.2, joinSide(host, box(1, 0, 0.1, 0.1), 0.2));
    expect(big.piece.w).toBeCloseTo(big.piece.h, 15);
    expect(area(big.host)).toBeCloseTo(area(host), 15);
    expect(area(big.joined)).toBeCloseTo(area(host) + 0.2, 15);
  });

  it('a join turns to the far long edge when the other one is too close', () => {
    const host = box(0, 0, 0.2, 0.4);
    const near = box(0.21, 0, 0.2, 0.4);
    expect(joinSide(host, near, 0.04)).toBe(0);
    const far = box(0.6, 0, 0.2, 0.4);
    expect(joinSide(host, far, 0.04)).toBe(1);
  });

  it('pile sums: each piece joins whole, the pile is all of them, and every side takes pieces', () => {
    const amounts = Array.from({ length: 24 }, (_, k) => 0.05 / (k + 1));
    const steps = pile(amounts, 1, 1);
    let sum = 0;
    steps.forEach((s, k) => {
      sum += amounts[k];
      expect(area(s.bar)).toBeCloseTo(amounts[k], 14);
      expect(area(s.pile)).toBeCloseTo(sum, 14);
    });
    const last = steps[steps.length - 1].pile;
    expect(skew(last)).toBeLessThan(2);
    // the finished pile is centred where it was asked to be
    expect(last.x + last.w / 2).toBeCloseTo(1, 12);
    expect(last.y + last.h / 2).toBeCloseTo(1, 12);
    for (const side of [0, 1, 2, 3]) expect(steps.filter((s) => s.side === side).length).toBeGreaterThanOrEqual(3);
  });

  it('squares divide into n equal squares, centred, apart by the gap', () => {
    for (const n of [1, 2, 5, 12, 37]) {
      const cells = squares(n, 0.004, 1, 1, 0.01);
      expect(cells).toHaveLength(n);
      for (const c of cells) {
        expect(area(c)).toBeCloseTo(0.004, 14);
        expect(c.w).toBeCloseTo(c.h, 14);
      }
      const u = cells.reduce((p, c) => union(p, c));
      expect(u.x + u.w / 2).toBeCloseTo(1, 12);
      expect(u.y + u.h / 2).toBeCloseTo(1, 12);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = cells[i];
          const b = cells[j];
          const apart = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
          expect(apart).toBeGreaterThanOrEqual(0.01 - 1e-12);
        }
      }
    }
  });

  it('tile divides with a remainder: whole copies, as many as fit', () => {
    expect(tile(6.5)).toEqual({ cols: 3, rows: 2 });
    expect(tile(4.2)).toEqual({ cols: 2, rows: 2 });
    expect(tile(1.3)).toEqual({ cols: 1, rows: 1 });
    for (let N = 1; N < 40; N += 0.37) {
      const { cols, rows } = tile(N);
      expect(cols * rows).toBeLessThanOrEqual(N + 1e-9);
    }
  });

  it('reshaping keeps the area: square, 2 : 1 bar, and every step of a morph', () => {
    expect(area(square(0.03, 1, 1))).toBeCloseTo(0.03, 15);
    const b = bar21(0.03, box(0, 0, 1, 0));
    expect(area(b)).toBeCloseTo(0.03, 15);
    expect(b.w / b.h).toBeCloseTo(2, 12);
    const from = box(0, 0, 0.3, 0.1);
    const to = box(1, 1, 0.05, 0.6);
    for (let e = 0; e <= 1; e += 0.1) expect(area(morph(from, to, e))).toBeCloseTo(0.03, 14);
  });

  it('mix: a weighted mean of colours', () => {
    expect(mix([[0, 0, 0], [200, 100, 50]], [3, 1])).toEqual([50, 25, 12.5]);
  });
});
