/** Inequality readouts: the console's, the panel's Gini, the story's goals and words. */

export interface Stats {
  readonly total: number;
  readonly poorest: number;
  readonly richest: number;
  readonly gini: number;
  /** Participation ratio W² / Σw²: how many equal people would hold the same "spread". */
  readonly neff: number;
  /** Share held by the richest tenth (at least one person). */
  readonly top10: number;
  /** Share held by the poorer half (rounded down). */
  readonly bottom50: number;
}

export function statsOf(wealth: ArrayLike<number>): Stats {
  const n = wealth.length;
  const sorted = Float64Array.from(wealth).sort();
  let total = 0;
  let squares = 0;
  let weighted = 0;
  for (let k = 0; k < n; k++) {
    total += sorted[k];
    squares += sorted[k] * sorted[k];
    weighted += (2 * (k + 1) - n - 1) * sorted[k];
  }
  const top = Math.max(1, Math.round(n / 10));
  let topSum = 0;
  for (let k = n - top; k < n; k++) topSum += sorted[k];
  let bottomSum = 0;
  for (let k = 0; k < Math.floor(n / 2); k++) bottomSum += sorted[k];
  return {
    total,
    poorest: sorted[0],
    richest: sorted[n - 1],
    gini: n > 0 && total > 0 ? weighted / (n * total) : 0,
    neff: squares > 0 ? (total * total) / squares : 0,
    top10: total > 0 ? topSum / total : 0,
    bottom50: total > 0 ? bottomSum / total : 0,
  };
}

/** The effective number alone (W² / Σw²): no sort, nothing allocated, for a goal looked at every round. */
export function neffOf(wealth: ArrayLike<number>): number {
  let total = 0;
  let squares = 0;
  for (let k = 0; k < wealth.length; k++) {
    total += wealth[k];
    squares += wealth[k] * wealth[k];
  }
  return squares > 0 ? (total * total) / squares : 0;
}
