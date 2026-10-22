import { describe, expect, it } from 'vitest';
import { createBoxes, packRectangles, shelves, squarify, type Boxes } from '../stage/core/pack.ts';
import { Rng } from '../stage/core/rng.ts';

const areaOf = (b: Boxes, i: number) => (b.x1[i] - b.x0[i]) * (b.y1[i] - b.y0[i]);

function overlap(b: Boxes): number {
  let total = 0;
  for (let i = 0; i < b.count; i++) {
    for (let j = i + 1; j < b.count; j++) {
      const ox = Math.min(b.x1[i], b.x1[j]) - Math.max(b.x0[i], b.x0[j]);
      const oy = Math.min(b.y1[i], b.y1[j]) - Math.max(b.y0[i], b.y0[j]);
      if (ox > 0 && oy > 0) total += ox * oy;
    }
  }
  return total;
}

const descending = (w: ArrayLike<number>) => Int32Array.from({ length: w.length }, (_, i) => i).sort((a, b) => w[b] - w[a] || a - b);

describe('squarified treemap', () => {
  it('partitions the container exactly in proportion', () => {
    const rng = new Rng(3);
    const n = 500;
    const weights = Float64Array.from({ length: n }, () => 0.001 + rng.next() ** 4 * 50);
    const boxes = createBoxes(n);
    squarify(weights, descending(weights), { x0: 0, y0: 0, x1: 37, y1: 11 }, boxes);
    expect(overlap(boxes)).toBe(0);
    let sum = 0;
    let weight = 0;
    for (let i = 0; i < n; i++) {
      weight += weights[i];
      sum += areaOf(boxes, i);
      expect(boxes.x0[i]).toBeGreaterThanOrEqual(0);
      expect(boxes.y1[i]).toBeLessThanOrEqual(11);
    }
    expect(sum).toBeCloseTo(37 * 11, 9);
    for (let i = 0; i < n; i++) expect(areaOf(boxes, i) / ((weights[i] / weight) * 37 * 11)).toBeCloseTo(1, 6);
  });

  it('never turns a cell inside out, however small its share (rounding at the thin end)', () => {
    const rng = new Rng(5);
    const n = 200;
    const weights = Float64Array.from({ length: n }, () => (rng.next() ** 30) ** 2 + 1e-20);
    const boxes = createBoxes(n);
    squarify(weights, descending(weights), { x0: 0, y0: 0, x1: 0.25, y1: 0.23 }, boxes);
    for (let i = 0; i < n; i++) {
      expect(boxes.x1[i]).toBeGreaterThanOrEqual(boxes.x0[i]);
      expect(boxes.y1[i]).toBeGreaterThanOrEqual(boxes.y0[i]);
      expect(boxes.x1[i]).toBeLessThanOrEqual(0.25);
      expect(boxes.y1[i]).toBeLessThanOrEqual(0.23);
    }
  });

  it('keeps equal items square', () => {
    const boxes = createBoxes(16);
    squarify(new Float64Array(16).fill(1), Int32Array.from({ length: 16 }, (_, i) => i), { x0: 0, y0: 0, x1: 4, y1: 4 }, boxes);
    for (let i = 0; i < 16; i++) {
      expect(boxes.x1[i] - boxes.x0[i]).toBeCloseTo(1, 12);
      expect(boxes.y1[i] - boxes.y0[i]).toBeCloseTo(1, 12);
    }
  });
});

describe('shell packing', () => {
  it('packs rectangles without overlap, inside the limit where they fit', () => {
    const rng = new Rng(7);
    const n = 120;
    const w = Float64Array.from({ length: n }, () => 0.02 + rng.next() * 0.2);
    const h = Float64Array.from({ length: n }, () => 0.02 + rng.next() * 0.2);
    const boxes = createBoxes(n);
    packRectangles(w, h, descending(w), 2, boxes);
    expect(overlap(boxes)).toBe(0);
    for (let i = 0; i < n; i++) {
      expect(boxes.x0[i]).toBeGreaterThanOrEqual(0);
      expect(boxes.y0[i]).toBeGreaterThanOrEqual(0);
      expect(boxes.x1[i]).toBeLessThanOrEqual(2 + 1e-12);
      expect(boxes.x1[i] - boxes.x0[i]).toBeCloseTo(w[i], 14);
    }
  });
});

describe('shelves (owner, 2026-10-19: "visually pleasant")', () => {
  it('real shapes, no overlaps, an even gap at least, a block about square', () => {
    // sizes as a yard sale leaves them: a few big, many small
    const n = 40;
    const side = Array.from({ length: n }, (_, i) => 0.05 + 0.4 * Math.exp(-i / 8));
    const w = Float64Array.from(side);
    const h = Float64Array.from(side, (s, i) => s * (i % 3 === 0 ? 1.2 : 1));
    const order = Array.from({ length: n }, (_, i) => i);
    const gap = 0.01;
    const boxes = createBoxes(n);
    const block = shelves(w, h, order, gap, boxes);
    for (let a = 0; a < n; a++) {
      expect(boxes.x0[a]).toBeGreaterThanOrEqual(-1e-12);
      expect(boxes.x0[a] + w[a]).toBeLessThanOrEqual(block.width + 1e-12);
      for (let b = a + 1; b < n; b++) {
        const apart =
          boxes.x0[a] + w[a] + gap <= boxes.x0[b] + 1e-12 ||
          boxes.x0[b] + w[b] + gap <= boxes.x0[a] + 1e-12 ||
          boxes.y0[a] + h[a] + gap <= boxes.y0[b] + 1e-12 ||
          boxes.y0[b] + h[b] + gap <= boxes.y0[a] + 1e-12;
        expect(apart, `${a} and ${b}`).toBe(true);
      }
    }
    expect(block.height / block.width).toBeGreaterThan(0.75);
    expect(block.height / block.width).toBeLessThan(1.35);
    // the first (biggest) row stands on the bottom and reaches both edges
    expect(boxes.y0[0]).toBe(0);
    expect(boxes.x0[0]).toBe(0);
  });
});
