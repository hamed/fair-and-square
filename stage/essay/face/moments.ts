/**
 * Feelings to faces: a point in a continuous affect space, drawn through one
 * FACS-inspired mapping, and the temperaments people rest at. Pure, no Svelte.
 *
 * Every point and temperament here is authored and tuned by eye (owner,
 * 2026-10-07): drawing conventions readers recognise, not claims about what
 * anyone feels. See notes/research/affect-interpretation.md.
 */
import { clamp, noise, type Marks } from './face';

interface Affect {
  /** Valence, unpleasant −1 … pleasant 1. */
  readonly v: number;
  /** Arousal, deactivated −1 … activated 1. */
  readonly a: number;
  /** Dominance, submissive −1 … dominant 1. */
  readonly d: number;
  /** Novelty, 0 … 1: something unexpected, just now. */
  readonly n: number;
}

const unit = (x: number) => clamp(x, 0, 1);
/** 0 below lo, 1 above hi, linear between. */
const ramp = (x: number, lo: number, hi: number) => unit((x - lo) / (hi - lo));
/** Perceptual easing: spends more of the range near zero. */
const ease = (x: number, p = 0.7) => Math.sign(x) * Math.abs(x) ** p;

const POSITIVE_THRESHOLD = 0.15;
/** Valence this close to zero moves nothing, so a face at rest does not flicker into frowns. */
const NEUTRAL_BAND = 0.08;

/**
 * Affect → the expression, written into `out` from `at` in the order browLift, browSlope, eyeOpening, cheekLift,
 * mouthCurve, mouthOpening, smirk: FACS-inspired synergies — both brow ends up for surprise, the inner
 * ends up for grief, lowered and knit for anger, the cheek lifting with a broad
 * smile. Positive valence shows above a threshold, negative soon after a small
 * neutral band. Allocates nothing: a field calls it for every face, every frame.
 */
export function expressTo(v: number, a: number, d: number, n: number, out: { [k: number]: number }, at = 0): void {
  const ap = (a + 1) / 2;
  const apos = Math.max(0, a);
  const dp = Math.max(0, d);
  const dn = Math.max(0, -d);
  const plus = Math.max(0, v - POSITIVE_THRESHOLD) / (1 - POSITIVE_THRESHOLD);
  const minus = Math.max(0, -v - NEUTRAL_BAND) / (1 - NEUTRAL_BAND);
  const au1 = unit(n + minus * dn * 1.1);
  const au2 = unit(n + minus * dn * apos * 0.6);
  const au4 = unit(minus * (0.4 + 0.6 * dp));
  const au5 = unit(n + minus * dn * apos * 0.8);
  const au6 = unit(plus ** 1.2 * (0.55 + 0.45 * ap));
  const au7 = unit(minus * dp * 0.9 + 0.2 * minus);
  const au12 = unit(plus);
  const au15 = unit(minus * (0.6 + 0.4 * dn));
  const au20 = unit(minus * dn * apos);
  // cold superiority — dominant and unstirred: one corner rises and the lids drop. We draw contempt
  // this way when displeased; very pleased it is pride, which smiles with both corners instead.
  const lofty = ramp(d, 0.3, 0.75) * (1 - ramp(a, 0.25, 0.7));
  out[at] = clamp(0.45 * (au1 + au2) + 0.25 * au1 - 0.45 * au4, -1, 1);
  out[at + 1] = clamp(0.8 * au4 - 1.1 * Math.max(0, au1 - au2), -1, 1);
  // arousal opens the eyes (sleepy lids below zero), the startle and fear widen them, a glare narrows them
  out[at + 2] = clamp((a < 0 ? 0.49 : 0.33) * a - 0.3 * au7 + 0.9 * au5 - 0.35 * lofty, -1, 1);
  out[at + 3] = au6;
  out[at + 4] = ease(au12 - au15);
  out[at + 5] = unit(0.5 * apos ** 1.4 + 0.6 * n + 0.3 * au20);
  out[at + 6] = lofty * (1 - ramp(Math.abs(v + 0.1), 0.45, 0.8));
}

/**
 * The body around the face, written into `out` from `at`: head yaw, pitch
 * (+ chin up), roll, the eyes' yaw and pitch (+ down), and the pupil.
 * Dominance lifts the chin; the submissive look away and down, and tilt.
 */
export function postureTo(v: number, a: number, d: number, n: number, blush: number, out: { [k: number]: number }, at = 0): void {
  const apos = Math.max(0, a);
  const dp = Math.max(0, d);
  const dn = Math.max(0, -d);
  // how far the head and eyes move: wider when aroused or dominant
  const reach = Math.max(0.2, 1 + 0.25 * a + 0.5 * d);
  const avert = unit(0.8 * dn ** 0.8);
  const gazeYaw = -0.75 * avert;
  const headYaw = clamp((0.45 * gazeYaw - 0.45 * dn * (0.5 + blush) * Math.sign(avert)) * reach, -1, 1);
  const headPitch = clamp(0.7 * d * reach, -1, 1);
  out[at] = headYaw;
  out[at + 1] = headPitch;
  out[at + 2] = clamp(0.25 * dn * reach, -1, 1);
  // the eyes counter-rotate: what is drawn is the gaze minus the head
  out[at + 3] = clamp(gazeYaw * reach - headYaw, -1, 1);
  out[at + 4] = clamp(0.6 * dn * (1 - apos) - 0.1 * dp + 0.5 * headPitch, -1, 1);
  out[at + 5] = 1 + 0.2 * a + 0.2 * n;
  void v;
}

/** Shame and embarrassment flush (submissive, moderately aroused). */
function embarrassment(e: Affect): number {
  const dn = Math.max(0, -e.d);
  return unit(1.4 * dn * Math.exp(-(((e.a - 0.2) / 0.3) ** 2)) * (0.3 + 0.7 * Math.max(0, -e.v)));
}

/**
 * The marks a feeling raises, each fading in over its own region. Never tears:
 * sadness and boredom share these coordinates, so any rule here would make
 * boredom cry. Tears are an accent a scene supplies, if it ever wants one.
 */
export function marksOf(e: Affect): Marks {
  return {
    sweat: ramp(e.a, 0.2, 0.7) * ramp(-e.d, 0.1, 0.5),
    vein: ramp(-e.v, 0.3, 0.6) * ramp(e.a, 0.2, 0.5) * ramp(e.d, -0.1, 0.2),
    exclaim: ramp(e.n, 0.3, 0.7),
    gloom: ramp(-e.v, 0.3, 0.7) * ramp(-e.a, 0, 0.4),
    sparkles: ramp(e.v, 0.5, 0.85),
    blushLines: ramp(embarrassment(e), 0.2, 0.55),
    blush: unit(embarrassment(e) + 0.3 * Math.max(0, e.v) * Math.max(0, e.a)),
    tears: 0,
  };
}

/** Where someone rests, and how they take what happens. */
export interface Temperament {
  /** The feeling they come back to. */
  readonly v0: number;
  readonly a0: number;
  readonly d0: number;
  /** How much of the cold-superiority smirk shows: 0 none … 1 all of it. */
  readonly smirk: number;
  /** How hard results land: 1 ordinary. */
  readonly reactivity: number;
  /** How restless the mood is, for the room's small drifts: 0 still. */
  readonly drift: number;
}

/** The winner's face, at its fullest: very contemptuous (owner, 2026-10-07). */
export const CONTEMPT: Affect = { v: -0.3, a: -0.4, d: 1, n: 0 };

/**
 * What each of the script's feeling words (script/grammar.ts `FEELINGS`) does
 * to a face as its line is said: a small push on valence, arousal and
 * dominance, a start of novelty, a flush — subtle, and fading as any feeling
 * does, so a line colours the face without taking it over.
 */
export const FEELINGS: Readonly<Record<string, Affect & { readonly blush?: number }>> = {
  glad: { v: 0.35, a: 0.15, d: 0, n: 0 },
  proud: { v: 0.25, a: 0.05, d: 0.35, n: 0 },
  smug: { v: 0.15, a: -0.15, d: 0.4, n: 0 },
  amused: { v: 0.3, a: 0.25, d: 0.05, n: 0 },
  calm: { v: 0.1, a: -0.3, d: 0.05, n: 0 },
  sure: { v: 0.05, a: 0.05, d: 0.35, n: 0 },
  curious: { v: 0.1, a: 0.2, d: -0.05, n: 0.35 },
  surprised: { v: 0, a: 0.35, d: -0.15, n: 0.7 },
  worried: { v: -0.3, a: 0.25, d: -0.3, n: 0 },
  annoyed: { v: -0.3, a: 0.2, d: 0.25, n: 0 },
  sad: { v: -0.4, a: -0.2, d: -0.25, n: 0 },
  shy: { v: 0.1, a: 0.1, d: -0.35, n: 0, blush: 0.6 },
  tired: { v: -0.15, a: -0.4, d: -0.1, n: 0 },
};

/** Anyone else: a seeded, subtle temperament — the room is not an army of robots. */
export function temperament(seed: number): Temperament {
  const u = (k: number) => (noise(seed, 200 + k) + 1) / 2;
  return {
    v0: -0.1 + 0.35 * u(0),
    a0: -0.35 + 0.5 * u(1),
    d0: -0.3 + 0.6 * u(2),
    smirk: 0.2 + 0.4 * u(3),
    reactivity: 0.6 + 0.6 * u(4),
    drift: 0.04 + 0.05 * u(5),
  };
}

