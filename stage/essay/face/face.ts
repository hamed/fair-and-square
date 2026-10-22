/**
 * Faces on the agents (owner, 2026-10-03 → 2026-10-07: "use manga", with a
 * choice of face in the sandbox). Pure geometry and timing, no Svelte. The
 * prototype that settled it is saved on the branch faces-history.
 *
 * Faces are display-only and the same for everyone: they react to what
 * happens (a toss, a coin caught) but never vary by costume — shape and colour
 * stay causally inert, as the essay's ending needs. A drawing receives a pose
 * (`FacePose`) and marks (`Marks`), never a feeling, an event or a person.
 */
import type { AgentShape } from '../agentStyle';

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Deterministic hash noise in [-1, 1]: a face's own pace and quirks, the same every time. */
export function noise(index: number, salt: number): number {
  let h = (index * 374761393 + salt * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  // `^` yields a signed 32-bit int; without the `>>> 0` this spans [-2, 0)
  return (((h ^ (h >>> 16)) >>> 0) / 0xffff_ffff) * 2 - 1;
}

/** Regular k-gon: circumradius factor (area = factor·R²) and rotation. */
const POLYGONS: Partial<Record<AgentShape, { sides: number; factor: number; offset: number }>> = {
  pentagon: { sides: 5, factor: 2.378, offset: -Math.PI / 2 }, // (5/2)·sin 72°
  hexagon: { sides: 6, factor: 2.598, offset: -Math.PI / 6 },
  heptagon: { sides: 7, factor: 2.736, offset: -Math.PI / 2 },
  octagon: { sides: 8, factor: 2.828, offset: -Math.PI / 8 }, // flat top, like the sign
};

/** The drawings, the essay's own first. */
export const LOOKS = ['manga', 'lids', 'dots', 'beans', 'googly', 'peek', 'brows', 'ink'] as const;
export type FaceLook = (typeof LOOKS)[number];

/** How much a fortune shows in the face as well as the body (`faceRadius`'s k). */
const FACE_K = 0.25;
/** The allometric exponent for rhythms: heart and breathing rate run near M^−0.25 (`tempoOf`'s b). */
const TEMPO_B = -0.25;
/** Movements against rhythms: stride frequency's −0.15 over the heart's −0.25. */
export const STRIDE = 0.6;

/**
 * The face's radius on a body of radius r, where r0 is the radius of an equal
 * share. When everyone has the same money the face has its normal proportions
 * (radius r0). Away from equal it grows or shrinks with the log of wealth
 * (area), times k — and never outgrows its body:
 *
 *   s = r0 · (1 + k · ln(wealth / equal)),  wealth / equal = (r / r0)²
 *
 * k = 0 gives every body the equal face. At k = 0.25 the face is gone below
 * e^−4 ≈ 1.8% of an equal share; the body is not.
 */
export function faceRadius(r: number, r0: number, k = FACE_K): number {
  if (!(r > 0) || !(r0 > 0)) return 0;
  return Math.max(0, Math.min(r, r0 * (1 + k * Math.log((r / r0) ** 2))));
}

/**
 * An animation metaphor inspired by allometry, Y = a·M^b, with wealth as the
 * body's mass (in this essay area is wealth): how fast a body's rhythms run
 * relative to an equal share's. In mammals, resting heart and breathing rate
 * scale near M^−0.25 and stride frequency near M^−0.15. Those studies do not
 * cover wealth, blinks, gaze or speech (in primates, blink rate tracks group
 * size rather than body weight — Tada et al. 2013), so this is a look, not a
 * claim. Clamped, so dust does not buzz.
 */
export function tempoOf(r: number, r0: number, b = TEMPO_B): number {
  if (!(r > 0) || !(r0 > 0)) return 4;
  return Math.min(4, Math.max(0.25, ((r / r0) ** 2) ** b));
}

/** The vertices of an equal-area shape (same math as svgShapePath), or null for a circle. */
function vertices(shape: AgentShape, r: number): [number, number][] | null {
  const area = Math.PI * r * r;
  if (shape === 'circle') return null;
  if (shape === 'square') {
    const h = Math.sqrt(area) / 2;
    return [
      [-h, -h],
      [h, -h],
      [h, h],
      [-h, h],
    ];
  }
  if (shape === 'triangle' || shape === 'triangleDown') {
    const side = Math.sqrt((4 * area) / Math.sqrt(3));
    const h = (side * Math.sqrt(3)) / 2;
    const f = shape === 'triangleDown' ? -1 : 1;
    return [
      [0, -f * (2 / 3) * h],
      [side / 2, (f * h) / 3],
      [-side / 2, (f * h) / 3],
    ];
  }
  const { sides, factor, offset } = POLYGONS[shape]!;
  const rr = Math.sqrt(area / factor);
  return Array.from({ length: sides }, (_, k) => {
    const a = ((Math.PI * 2) / sides) * k + offset;
    return [rr * Math.cos(a), rr * Math.sin(a)] as [number, number];
  });
}

/** The topmost point of the outline above horizontal offset `x` (for eyes that perch on it). */
export function topEdge(shape: AgentShape, r: number, x: number): number {
  const v = vertices(shape, r);
  if (!v) return -Math.sqrt(Math.max(0, r * r - x * x));
  let top = 0;
  for (let k = 0; k < v.length; k++) {
    const [ax, ay] = v[k];
    const [bx, by] = v[(k + 1) % v.length];
    if ((x - ax) * (x - bx) > 0 || ax === bx) continue;
    const y = ay + ((x - ax) / (bx - ax)) * (by - ay);
    top = Math.min(top, y);
  }
  return top;
}

/** Where the face's centre sits, as a fraction of r: low in an upright triangle, where it is wide. */
export function faceAnchor(shape: AgentShape): number {
  if (shape === 'triangle') return 0.24;
  if (shape === 'triangleDown') return -0.26;
  if (shape === 'pentagon' || shape === 'heptagon') return 0.05;
  return 0;
}

/**
 * 0 open … 1 shut. Everyone at their own rhythm, now and then twice. `t` is the
 * face's own clock, running at `rate`: the gaps between blinks follow that
 * clock, while a blink itself always takes 0.16 s of real time.
 */
export function blinkAt(t: number, seed: number, rate = 1): number {
  const period = 3.2 + (noise(seed, 71) + 1) * 1.9;
  const local = (t + (noise(seed, 72) + 1) * period) % period;
  const w = 0.16 * rate;
  const one = (from: number) => (local >= from && local < from + w ? Math.sin((Math.PI * (local - from)) / w) : 0);
  return Math.max(one(0), noise(seed, 73) > 0.3 ? one(0.26 * rate) : 0);
}

/** 0 shut … 1 wide: syllables while someone is speaking. */
export function mouthAt(t: number, seed: number): number {
  const a = Math.abs(Math.sin(t * 10.5 + seed));
  const b = 0.55 + 0.45 * Math.sin(t * 3.3 + seed * 2);
  return Math.min(1, a * b * 1.25);
}

/** Per-person wobble for the hand-drawn look, stable for a seed: [-1, 1]. */
export function wobble(seed: number, k: number): number {
  return noise(seed, 100 + k);
}

// ------------------------------------------------------------ the render boundary

/**
 * What a drawing is given: seven expression coordinates, plus where the eyes
 * look, the head, a blink and the pupil, and decorations as explicit
 * strengths. A drawing maps these numbers to its own geometry, and a drawing
 * without brows simply ignores the brow coordinates. Missing fields mean
 * neutral, so a still needs nothing but an expression.
 */
export interface Expression {
  /** −1 … 1; 0 is the drawing's neutral. */
  readonly browLift: number;
  /** −1 … 1; + lowers the inner ends (a glare), − raises them (worry). */
  readonly browSlope: number;
  /** −1 shut … 0 neutral … 1 wide. */
  readonly eyeOpening: number;
  /** 0 … 1: the cheek pushing up under the eyes, as in a broad smile. */
  readonly cheekLift: number;
  /** −1 … 1: the lip corners. */
  readonly mouthCurve: number;
  /** 0 … 1. */
  readonly mouthOpening: number;
  /** −1 … 1: mouth asymmetry — one lip corner up (+ the right-hand one as you look at the face). What it means is decided upstream. */
  readonly smirk: number;
}

/** The feasible range of each coordinate. The boundary clamps to it, so no setting draws an impossible face. */
const EXPRESSION_RANGE: Readonly<Record<keyof Expression, readonly [number, number]>> = {
  browLift: [-1, 1],
  browSlope: [-1, 1],
  eyeOpening: [-1, 1],
  cheekLift: [0, 1],
  mouthCurve: [-1, 1],
  mouthOpening: [0, 1],
  smirk: [-1, 1],
};

export interface FacePose {
  readonly expression: Expression;
  /** Where the eyes point inside the head, each −1 … 1. */
  readonly gaze?: { readonly yaw: number; readonly pitch: number };
  /** Each −1 … 1. */
  readonly head?: { readonly yaw: number; readonly pitch: number; readonly roll: number };
  /** 0 open … 1 shut. */
  readonly blink?: number;
  /** 1 is ordinary. */
  readonly pupil?: number;
}

/** Decorations, each an explicit strength 0 … 1 — never an emotion the drawing has to interpret. */
export interface Marks {
  /** A soft flush on the cheeks. */
  readonly blush?: number;
  /** Manga's ///. */
  readonly blushLines?: number;
  readonly sweat?: number;
  readonly vein?: number;
  readonly exclaim?: number;
  readonly gloom?: number;
  readonly sparkles?: number;
  readonly tears?: number;
}

const bound = (x: number, lo: number, hi: number) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : 0);

/** Clamp a pose to what can be drawn: every coordinate, the gaze, the head, the blink, the pupil. */
export function boundPose(pose: FacePose): Required<FacePose> {
  const x = pose.expression;
  const expression = Object.fromEntries(
    (Object.keys(EXPRESSION_RANGE) as (keyof Expression)[]).map((k) => [k, bound(x[k], ...EXPRESSION_RANGE[k])]),
  ) as unknown as Expression;
  return {
    expression,
    gaze: { yaw: bound(pose.gaze?.yaw ?? 0, -1, 1), pitch: bound(pose.gaze?.pitch ?? 0, -1, 1) },
    head: { yaw: bound(pose.head?.yaw ?? 0, -1, 1), pitch: bound(pose.head?.pitch ?? 0, -1, 1), roll: bound(pose.head?.roll ?? 0, -1, 1) },
    blink: bound(pose.blink ?? 0, 0, 1),
    pupil: bound(pose.pupil ?? 1, 0.6, 1.5),
  };
}

/** The drawings' shared geometry, in face units (1 = the face's radius; y grows downward). */
export interface FaceGeometry {
  readonly browInnerY: number;
  readonly browOuterY: number;
  readonly browInnerX: number;
  readonly eyeScale: number;
  /** 0 open … 1 shut. */
  readonly upperLid: number;
  /** 0 down … up toward the middle. */
  readonly lowerLid: number;
  /** + inner corner lower (a glare), − higher (worry). */
  readonly lidSlant: number;
  readonly pupil: number;
  /** Crow's feet. */
  readonly crinkle: number;
  readonly mouthHalf: number;
  /** Lip corners, + up. */
  readonly mouthCurve: number;
  readonly mouthOpen: number;
  /** One corner up, in face units: + lifts the right-hand corner. */
  readonly mouthSmirk: number;
}

/**
 * A drawing's neutral plus an authored basis × the expression, for an
 * expression already inside its range (`boundPose`). Neutral is awake (the
 * upper lid just touches the iris) with a faint upturn of the mouth, so a face
 * at rest reads relaxed rather than sleepy or cross. Mouth width is derived: a
 * smile widens it, an open neutral mouth rounds it.
 */
export function faceGeometry(x: Expression, pupil = 1): FaceGeometry {
  const o = x.eyeOpening;
  return {
    browInnerY: -0.4 - 0.18 * x.browLift + 0.1 * x.browSlope,
    browOuterY: -0.4 - 0.18 * x.browLift - 0.05 * x.browSlope,
    browInnerX: 0.15 - 0.05 * Math.max(0, x.browSlope),
    eyeScale: 1 + 0.5 * Math.max(0, o - 0.5),
    upperLid: o < 0 ? 0.15 + 0.8 * -o : 0.15 * (1 - Math.min(1, 2 * o)),
    lowerLid: 0.5 * x.cheekLift,
    lidSlant: 0.06 * x.browSlope,
    pupil,
    crinkle: bound((x.cheekLift - 0.4) / 0.5, 0, 1),
    mouthHalf: 0.17 + 0.05 * Math.max(0, x.mouthCurve) + 0.03 * Math.max(0, -x.mouthCurve) - 0.04 * x.mouthOpening * (1 - Math.abs(x.mouthCurve)),
    mouthCurve: 0.11 * x.mouthCurve + 0.008,
    mouthOpen: x.mouthOpening,
    mouthSmirk: 0.07 * x.smirk,
  };
}
