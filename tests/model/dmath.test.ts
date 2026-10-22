import { describe, expect, it } from 'vitest';
import { cos2pi, exp, log, pow, sqrt } from '../../model/dmath.ts';
import { PINNED, pinnedNow } from './fixtures.ts';

const view = new DataView(new ArrayBuffer(8));

/** Distance in units in the last place (both finite, same sign region). */
function ulps(a: number, b: number): number {
  if (Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b))) return 0;
  const order = (x: number) => {
    view.setFloat64(0, x);
    const bits = view.getBigInt64(0);
    return bits < 0n ? -(bits & 0x7fffffffffffffffn) : bits;
  };
  const d = order(a) - order(b);
  return Number(d < 0n ? -d : d);
}

/** A seeded stream of test inputs (not the engine's generator: tests must not depend on what they test). */
function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function randomBits(next: () => number): number {
  view.setUint32(0, Math.floor(next() * 2 ** 32));
  view.setUint32(4, Math.floor(next() * 2 ** 32));
  return view.getFloat64(0);
}

describe('deterministic math', () => {
  it('exp and log stay within one ulp of Math (fdlibm ports; V8 itself uses fdlibm)', () => {
    const next = lcg(1);
    let worst = 0;
    for (let i = 0; i < 20_000; i++) {
      const x = (next() - 0.5) * 1500;
      worst = Math.max(worst, ulps(exp(x), Math.exp(x)));
      const y = Math.abs(randomBits(next));
      if (Number.isFinite(y)) worst = Math.max(worst, ulps(log(y), Math.log(y)));
      const z = next() * 4;
      worst = Math.max(worst, ulps(log(z), Math.log(z)), ulps(exp(z - 2), Math.exp(z - 2)));
    }
    expect(worst).toBeLessThanOrEqual(1);
  });

  it('exp and log edge cases', () => {
    expect([exp(0), exp(-Infinity), exp(Infinity), exp(710), exp(-746)]).toEqual([1, 0, Infinity, Infinity, 0]);
    expect(exp(NaN)).toBeNaN();
    expect([log(1), log(0), log(Infinity)]).toEqual([0, -Infinity, Infinity]);
    expect(log(-1)).toBeNaN();
    expect(log(5e-324)).toBeCloseTo(-744.4400719213812, 12);
  });

  it('sqrt is exactly rounded: bit for bit with IEEE sqrt, subnormals and near-squares included', () => {
    const next = lcg(2);
    let mismatches = 0;
    for (let i = 0; i < 100_000; i++) {
      const x = Math.abs(randomBits(next));
      if (!Number.isFinite(x)) continue;
      if (!Object.is(sqrt(x), Math.sqrt(x))) mismatches++;
      const sub = next() * 1e-308;
      if (!Object.is(sqrt(sub), Math.sqrt(sub))) mismatches++;
      // squares nudged by a few ulps: the cases closest to a rounding boundary
      const y = 1 + next();
      view.setFloat64(0, y * y);
      view.setBigUint64(0, view.getBigUint64(0) + BigInt(Math.floor(next() * 5) - 2));
      const near = view.getFloat64(0);
      if (!Object.is(sqrt(near), Math.sqrt(near))) mismatches++;
    }
    expect(mismatches).toBe(0);
    expect([sqrt(0), sqrt(4), sqrt(Infinity)]).toEqual([0, 2, Infinity]);
    expect(Object.is(sqrt(-0), -0)).toBe(true);
    expect(sqrt(-1)).toBeNaN();
  });

  it('cos2pi agrees with cos(2πu) and is exact at the quarters', () => {
    const next = lcg(3);
    let worst = 0;
    for (let i = 0; i < 50_000; i++) {
      const u = next() * 4 - 2;
      worst = Math.max(worst, Math.abs(cos2pi(u) - Math.cos(2 * Math.PI * u)));
    }
    expect(worst).toBeLessThan(2e-15);
    expect([cos2pi(0), cos2pi(0.5), cos2pi(1), cos2pi(-0.5)]).toEqual([1, -1, 1, -1]);
    expect(Math.abs(cos2pi(0.25)) + Math.abs(cos2pi(0.75))).toBe(0);
  });

  it('pow: whole exponents by squaring, the rest via exp and log', () => {
    expect([pow(10, 2), pow(-2, 3), pow(2, -3), pow(7, 0), pow(0, 3)]).toEqual([100, -8, 0.125, 1, 0]);
    expect(pow(0, -1)).toBe(Infinity);
    expect(pow(-2, 0.5)).toBeNaN();
    const next = lcg(4);
    let worst = 0;
    for (let i = 0; i < 20_000; i++) {
      const x = next() * 100;
      const y = next() * 4 - 2;
      worst = Math.max(worst, ulps(pow(x, y), Math.pow(x, y)));
    }
    // exp(y·log x) multiplies log's rounding by |y·log x| (up to 9 here): a few ulps per unit, 13 measured
    expect(worst).toBeLessThanOrEqual(20);
  });

  it('pinned digest: these bits are what every browser must compute', () => {
    expect(pinnedNow().math).toBe(PINNED.math);
  });
});
