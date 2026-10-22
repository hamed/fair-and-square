/**
 * Measures of a wealth vector, deterministic: sorts break ties by index, sums run in index order (Gini's in
 * sorted order). Shares are of the total W = Σw + pot, so they sum to 1 − pot share; with debt they can be negative.
 */
import { sqrt } from './dmath.ts';

/** Agents sorted by wealth, poorest first; ties by index. */
export function sortedOrder(w: Float64Array, into?: Int32Array): Int32Array {
  const n = w.length;
  const order = into && into.length === n ? into : new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => w[a] - w[b] || a - b);
  return order;
}

export interface Measures {
  readonly n: number;
  /** W = Σw + pot, in units of the current mean (≈ N). */
  readonly total: number;
  readonly potShare: number;
  readonly gini: number;
  /** 1 / Σ s², s = w/W. */
  readonly neff: number;
  /** Share of the richest ⌈N/100⌉. */
  readonly top1: number;
  /** Share of the poorest ⌊N/2⌋. */
  readonly bottom50: number;
  /** The richest agent's share. */
  readonly topOne: number;
  readonly min: number;
  readonly median: number;
  readonly max: number;
}

export function measure(w: Float64Array, pot: number, order: Int32Array = sortedOrder(w)): Measures {
  const n = w.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += w[i];
  const total = sum + pot;
  let squares = 0;
  for (let i = 0; i < n; i++) {
    const s = w[i] / total;
    squares += s * s;
  }
  let weighted = 0;
  for (let k = 0; k < n; k++) weighted += (2 * k - n + 1) * w[order[k]];
  const top = Math.max(1, Math.ceil(n / 100));
  let topSum = 0;
  for (let k = n - top; k < n; k++) topSum += w[order[k]];
  let bottomSum = 0;
  for (let k = 0; k < Math.floor(n / 2); k++) bottomSum += w[order[k]];
  const mid = n >> 1;
  return {
    n,
    total,
    potShare: pot / total,
    gini: sum !== 0 ? weighted / (n * sum) : 0,
    neff: squares > 0 ? 1 / squares : 0,
    top1: topSum / total,
    bottom50: bottomSum / total,
    topOne: w[order[n - 1]] / total,
    min: w[order[0]],
    median: n % 2 === 1 ? w[order[mid]] : (w[order[mid - 1]] + w[order[mid]]) / 2,
    max: w[order[n - 1]],
  };
}

/** Gini alone (the acceptance runs need it every round). */
export function gini(w: Float64Array, order: Int32Array = sortedOrder(w)): number {
  const n = w.length;
  let sum = 0;
  let weighted = 0;
  for (let i = 0; i < n; i++) sum += w[i];
  for (let k = 0; k < n; k++) weighted += (2 * k - n + 1) * w[order[k]];
  return sum !== 0 ? weighted / (n * sum) : 0;
}

/** The stats block's measures (spec update, 2026-10-19), of a property over a group. */
export const STATS = ['gini', 'neff', 'share', 'fraction', 'palma', 'rankcorr', 'mean', 'median', 'min', 'max'] as const;
export type Stat = (typeof STATS)[number];

/**
 * A measure of `v` (one value per member, in index order). `all` is the property's sum over everyone (the share's
 * denominator), `n` how many squares there are (the fraction's); `w` the members' wealth (rank correlation's other
 * side). An empty group gives NaN, except its fraction, 0.
 */
export function statOf(stat: Stat, v: Float64Array, all: number, w: Float64Array, n = v.length): number {
  const m = v.length;
  if (stat === 'fraction') return n > 0 ? m / n : NaN;
  if (m === 0) return NaN;
  let sum = 0;
  for (let i = 0; i < m; i++) sum += v[i];
  switch (stat) {
    case 'share':
      return all !== 0 ? sum / all : NaN;
    case 'mean':
      return sum / m;
    case 'neff': {
      let squares = 0;
      for (let i = 0; i < m; i++) squares += (v[i] / sum) * (v[i] / sum);
      return squares > 0 ? 1 / squares : 0;
    }
    case 'rankcorr':
      return pearson(ranks(v), ranks(w));
  }
  const order = sortedOrder(v);
  switch (stat) {
    case 'gini':
      return gini(v, order);
    case 'min':
      return v[order[0]];
    case 'max':
      return v[order[m - 1]];
    case 'median': {
      const mid = m >> 1;
      return m % 2 === 1 ? v[order[mid]] : (v[order[mid - 1]] + v[order[mid]]) / 2;
    }
    default: {
      // Palma: the top 10 %'s sum over the bottom 40 %'s
      const top = Math.max(1, Math.ceil(m / 10));
      const bottom = Math.max(1, Math.floor((m * 4) / 10));
      let hi = 0;
      let lo = 0;
      for (let k = m - top; k < m; k++) hi += v[order[k]];
      for (let k = 0; k < bottom; k++) lo += v[order[k]];
      return lo !== 0 ? hi / lo : NaN;
    }
  }
}

/** Ranks 0 … m−1, ties sharing their average rank. */
function ranks(v: Float64Array): Float64Array {
  const order = sortedOrder(v);
  const out = new Float64Array(v.length);
  for (let a = 0; a < order.length; ) {
    let b = a;
    while (b + 1 < order.length && v[order[b + 1]] === v[order[a]]) b++;
    for (let k = a; k <= b; k++) out[order[k]] = (a + b) / 2;
    a = b + 1;
  }
  return out;
}

/** Pearson's correlation; 0 when either side does not vary. */
function pearson(x: Float64Array, y: Float64Array): number {
  const m = x.length;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < m; i++) {
    mx += x[i];
    my += y[i];
  }
  mx /= m;
  my /= m;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < m; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) * (x[i] - mx);
    syy += (y[i] - my) * (y[i] - my);
  }
  return sxx > 0 && syy > 0 ? sxy / sqrt(sxx * syy) : 0;
}
