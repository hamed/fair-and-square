import { describe, expect, it } from 'vitest';
import { Draws, STREAM, digest, keyOf } from '../../model/rng.ts';
import { PINNED, pinnedNow } from './fixtures.ts';

describe('counter-based draws', () => {
  it('pinned values (engine version 1)', () => {
    const d = new Draws().at(42, STREAM.coin, 7, 1);
    expect([0, 1, 2, 1000, 65535].map((i) => d.uniform(i))).toEqual([
      0.11370155051295772, 0.04778474190772186, 0.8762129628098932, 0.5563843554066322, 0.04112737465524485,
    ]);
    expect([0, 1, 2].map((i) => d.normal(i))).toEqual([-0.3422530251511586, -0.0860428476819429, -1.501869764505522]);
    expect(keyOf('0/body/1/args/coin')).toEqual({ hi: 1961432874, lo: 1519751279 });
    expect(pinnedNow().streams).toBe(PINNED.streams);
  });

  it('a draw is a pure function of its key: order and other streams change nothing', () => {
    const a = new Draws().at(5, STREAM.pair, 3, 0);
    const forward = [0, 1, 2, 3].map((i) => a.uniform(i));
    const other = new Draws().at(5, STREAM.coin, 3, 0);
    for (let i = 0; i < 100; i++) other.uniform(i);
    const backward = [3, 2, 1, 0].map((i) => a.uniform(i)).reverse();
    expect(backward).toEqual(forward);
  });

  it('every part of the key matters', () => {
    const base = new Draws().at(5, STREAM.pair, 3, 0).uniform(10, 0);
    const changed = [
      new Draws().at(6, STREAM.pair, 3, 0).uniform(10, 0),
      new Draws().at(5, STREAM.coin, 3, 0).uniform(10, 0),
      new Draws().at(5, STREAM.pair, 4, 0).uniform(10, 0),
      new Draws().at(5, STREAM.pair, 3, 1).uniform(10, 0),
      new Draws().at(5, STREAM.pair, 3, 0).uniform(11, 0),
      new Draws().at(5, STREAM.pair, 3, 0).uniform(10, 1),
    ];
    for (const value of changed) expect(value).not.toBe(base);
    expect(new Set(Object.values(STREAM).map((k) => `${k.hi}:${k.lo}`)).size).toBe(Object.keys(STREAM).length);
  });

  it('uniforms: [0, 1), 53 bits, flat', () => {
    const d = new Draws().at(9, STREAM.grow, 0, 0);
    const bins = new Float64Array(100);
    let sum = 0;
    const n = 200_000;
    for (let i = 0; i < n; i++) {
      const u = d.uniform(i);
      expect(u >= 0 && u < 1).toBe(true);
      expect(Number.isInteger(u * 2 ** 53)).toBe(true);
      bins[Math.floor(u * 100)]++;
      sum += u;
    }
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.002);
    let chi = 0;
    for (const b of bins) chi += (b - n / 100) ** 2 / (n / 100);
    expect(chi).toBeLessThan(150); // df 99: p < 0.001 above 148
  });

  it('normals: mean 0, variance 1, kurtosis 3', () => {
    const d = new Draws().at(9, STREAM.talent, 0, 0);
    let s = 0;
    let s2 = 0;
    let s4 = 0;
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      const z = d.normal(i);
      s += z;
      s2 += z * z;
      s4 += z ** 4;
    }
    expect(Math.abs(s / n)).toBeLessThan(0.02);
    expect(Math.abs(s2 / n - 1)).toBeLessThan(0.02);
    expect(Math.abs(s4 / n - 3)).toBeLessThan(0.1);
  });

  it('digest sees every bit', () => {
    expect(digest([1, 2, 3])).not.toBe(digest([1, 2, 3.0000000000000004]));
    expect(digest([1, 2, 3])).toBe(digest([1, 2, 3]));
    expect(digest([])).toMatch(/^[0-9a-f]{16}$/);
  });
});
