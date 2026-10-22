/**
 * Real wealth distributions for `alloc.country`, as published group shares. Each agent gets the slice of the
 * Lorenz curve through these points that its rank covers, so groups come out equal inside and exact in total
 * at any N (an agent whose rank straddles two groups gets some of each).
 */

interface Country {
  readonly source: string;
  /** Groups poorest first: the population share and the net worth each holds (any unit). */
  readonly groups: readonly (readonly [population: number, worth: number])[];
}

export const COUNTRIES: Readonly<Record<string, Country>> = {
  us: {
    source:
      'Federal Reserve Board, Distributional Financial Accounts, net worth by wealth percentile group, 2026 Q2 ' +
      '(dfa-networth-levels.csv, millions of dollars; downloaded 2026-10-19)',
    groups: [
      [0.5, 4278038], // bottom 50 %
      [0.4, 53425884], // 50th–90th
      [0.09, 67634079], // 90th–99th
      [0.009, 32445932], // 99th–99.9th
      [0.001, 27867091], // top 0.1 %
    ],
  },
};

/** The Lorenz curve through a country's groups: the share of wealth held by the poorest fraction x. */
export function lorenzOf(country: Country): (x: number) => number {
  const total = country.groups.reduce((s, [, worth]) => s + worth, 0);
  const xs = [0];
  const ys = [0];
  for (const [population, worth] of country.groups) {
    xs.push(xs[xs.length - 1] + population);
    ys.push(ys[ys.length - 1] + worth / total);
  }
  xs[xs.length - 1] = 1;
  ys[ys.length - 1] = 1;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let i = 1;
    while (xs[i] < x) i++;
    return ys[i - 1] + ((ys[i] - ys[i - 1]) * (x - xs[i - 1])) / (xs[i] - xs[i - 1]);
  };
}
