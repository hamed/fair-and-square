/**
 * Fixed workloads whose digests are pinned: the Node tests check them here, and the browser test checks that
 * Chromium, Firefox and WebKit compute the same bits.
 */
import { cos2pi, exp, log, pow, sqrt } from '../../model/dmath.ts';
import { Run } from '../../model/engine.ts';
import { PRESETS } from '../../model/presets.ts';
import { Draws, STREAM, digest } from '../../model/rng.ts';

/** Every deterministic math function over a fixed grid of inputs, wide and narrow ranges, subnormals included. */
export function* mathGrid(): Generator<number> {
  for (let i = 0; i < 4000; i++) {
    const t = i / 4000;
    yield exp(((t - 0.5) * 1400) / 10);
    yield exp(t * 2 - 1);
    yield log(1e-300 * 10 ** (t * 600));
    yield log(0.5 + t);
    yield sqrt(t * 1e6 + 1e-310 * i);
    yield cos2pi(t * 3 - 1);
    yield pow(0.1 + t * 9, 0.37 + t);
    yield pow(-1.5, (i % 9) - 4);
  }
}

/** A hundred draws from each built-in stream (seed 1, round 0), cycling k through 0, 1, 2. */
export function streamSample(): number[] {
  const all: number[] = [];
  // the ten streams of engine version 1, by name: streams added later must not move this sample
  const names = ['pair', 'coin', 'split', 'grow', 'give', 'move', 'start', 'talent', 'thrift', 'place'] as const;
  for (const key of names.map((name) => STREAM[name])) {
    const draws = new Draws().at(1, key, 0, 0);
    for (let i = 0; i < 100; i++) all.push(draws.uniform(i, i % 3));
  }
  return all;
}

/** Digests at engine version 1. A change here changes outputs: bump the engine version (spec, Determinism). */
export const PINNED = {
  math: '864f7e52141e2852',
  streams: 'a1a2644ab1382067',
} as const;

export const pinnedNow = () => ({ math: digest(mathGrid()), streams: digest(streamSample()) });

/** Every preset from seed 1, its state hash after 200 rounds. */
export function presetHashes(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of PRESETS) {
    const run = new Run(p.program, 1);
    run.rounds(200);
    out[p.id] = run.hash();
  }
  return out;
}

/** The preset hashes at engine version 1. A change means some output changed: bump ENGINE_VERSION. */
export const GOLDEN: Readonly<Record<string, string>> = {
  'yard-sale': 'f5458df2205426f2',
  'fixed-stake': '49bab36d6da5e4b7',
  'theft-fraud': '1ace0e1ffe2aec8b',
  saving: 'f692aa73e3c2fd8b',
  'mixed-saving': '4a4a207db23e7b89',
  'tilt-to-poor': '40b9bb96391bfcf6',
  'wealth-tax': '9a4a5e6ae8871ab4',
  advantage: 'fcc3e7ac779a7e08',
  debt: '1b918b8267ac1cdc',
  growth: '7d5e88b81dd03816',
  'trickle-up': '2e858c12efd19968', // re-pinned 2026-10-19 (review MB6, weights scaled by their largest), before v1 was ever committed
  local: 'e9fde9a60752b570',
  merit: 'f3e80fabd54a3465', // re-pinned 2026-10-19: the strength coin (tanh) replaced coin.talent's straight line
  floor: 'ce06cab92deb04fd',
  'income-tax': 'ead91f7073a6c723',
};
