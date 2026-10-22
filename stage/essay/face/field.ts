/**
 * Every face on a stage as vectors: temperament, feeling, gaze and rhythms for
 * N faces in struct-of-arrays Float64Arrays, like the simulation's own state.
 * One `step` a frame updates them all in a single loop; `poseOf` reads one face
 * out for drawing. Nothing here draws or knows Svelte.
 */
import { STRIDE, blinkAt, clamp, noise, mouthAt, tempoOf, type Expression, type FacePose, type Marks } from './face';
import { CONTEMPT, expressTo, marksOf, postureTo, type Temperament } from './moments';

/** How hard a change in fortune lands: u = tanh(FELT · ln(after ÷ before)). */
const FELT = 2.1;

/**
 * A result, felt on a log scale (owner, 2026-10-07), −1 … 1: doubling is
 * joy (≈ 0.9), halving is despair (≈ −0.9), losing everything is −1, ±10% is a
 * little (≈ ±0.2), ±1% a shrug (≈ ±0.02), and nothing is nothing.
 */
export function felt(before: number, after: number): number {
  if (!(before > 0)) return after > 0 ? 1 : 0;
  if (!(after > 0)) return -1;
  return Math.tanh(FELT * Math.log(after / before));
}

/** Seconds for a feeling to fall most of the way (1/e) back to the temperament: moods linger, startles pass. */
const RELAX = { v: 10, a: 3, d: 6, n: 0.6, contempt: 0.8, blush: 0.6 };
/** How far a head turns and the eyes move in it, radians. */
export const HEAD_YAW = 0.6;
export const HEAD_PITCH = 0.35;
const EYE_REACH = 0.4;
/** The share of a look the head takes; the eyes do the rest, and get there first. */
const HEAD_SHARE = 0.75;
const EYE_LAG = 0.05;
const HEAD_LAG = 0.22;

const u01 = (seed: number, k: number) => (noise(seed, k) + 1) / 2;

/** One face read out of the field: what a drawing needs. Reused between reads: copy what you keep. */
interface FaceRead {
  readonly pose: FacePose;
  readonly marks: Marks;
}

export class FaceField {
  readonly n: number;
  readonly seed: Int32Array;
  /** The temperament each face rests at. */
  readonly v0: Float64Array;
  readonly a0: Float64Array;
  readonly d0: Float64Array;
  readonly smirk: Float64Array;
  readonly reactivity: Float64Array;
  readonly drift: Float64Array;
  /** The feeling now. */
  readonly v: Float64Array;
  readonly a: Float64Array;
  readonly d: Float64Array;
  readonly nov: Float64Array;
  /** The winner's look, 0 … 1, easing toward `contemptTo`; a flush easing toward `blushTo`. */
  readonly contempt: Float64Array;
  readonly contemptTo: Float64Array;
  readonly blush: Float64Array;
  readonly blushTo: Float64Array;
  /** Where each face looks, radians (+ right, + down); NaN glances about. */
  readonly aimYaw: Float64Array;
  readonly aimPitch: Float64Array;
  readonly headYaw: Float64Array;
  readonly headPitch: Float64Array;
  readonly eyeYaw: Float64Array;
  readonly eyePitch: Float64Array;
  /** The body's radius and an equal share's: rhythms slow with size (kept as `rhythm`, worked out when the size changes). */
  readonly r: Float64Array;
  readonly r0: Float64Array;
  readonly rhythm: Float64Array;
  /** The glance each face is on, and where it points: worked out once a glance. */
  private readonly glanceK: Float64Array;
  private readonly glanceYaw: Float64Array;
  private readonly glancePitch: Float64Array;
  readonly blinkClock: Float64Array;
  readonly glanceClock: Float64Array;
  readonly talkClock: Float64Array;
  /** Real seconds, for each face's slow drift of mood; and the drift now, in valence and arousal. */
  readonly moodClock: Float64Array;
  readonly swayV: Float64Array;
  readonly swayA: Float64Array;
  readonly talking: Uint8Array;
  /** Too small to read: no blinks, no glances, nothing to redraw. */
  readonly still: Uint8Array;
  private readonly x7 = [0, 0, 0, 0, 0, 0, 0];
  private readonly p6 = [0, 0, 0, 0, 0, 0];
  private readonly read = {
    pose: {
      expression: { browLift: 0, browSlope: 0, eyeOpening: 0, cheekLift: 0, mouthCurve: 0, mouthOpening: 0, smirk: 0 } as { -readonly [K in keyof Expression]: number },
      gaze: { yaw: 0, pitch: 0 },
      head: { yaw: 0, pitch: 0, roll: 0 },
      blink: 0,
      pupil: 1,
    },
    marks: {} as Marks,
  };

  constructor(n: number, seed = 1) {
    this.n = n;
    const f = () => new Float64Array(n);
    this.seed = Int32Array.from({ length: n }, (_, i) => i * 7 + 3 + seed * 1009);
    this.v0 = f();
    this.a0 = f();
    this.d0 = f();
    this.smirk = f().fill(0.3);
    this.reactivity = f().fill(1);
    this.drift = f();
    this.v = f();
    this.a = f();
    this.d = f();
    this.nov = f();
    this.contempt = f();
    this.contemptTo = f();
    this.blush = f();
    this.blushTo = f();
    this.aimYaw = f().fill(NaN);
    this.aimPitch = f().fill(NaN);
    this.headYaw = f();
    this.headPitch = f();
    this.eyeYaw = f();
    this.eyePitch = f();
    this.r = f().fill(1);
    this.r0 = f().fill(1);
    this.rhythm = f().fill(1);
    this.glanceK = f().fill(NaN);
    this.glanceYaw = f();
    this.glancePitch = f();
    this.blinkClock = f();
    this.glanceClock = f();
    this.talkClock = f();
    this.moodClock = Float64Array.from({ length: n }, (_, i) => u01(this.seed[i], 13) * 100);
    this.swayV = f();
    this.swayA = f();
    this.talking = new Uint8Array(n);
    this.still = new Uint8Array(n);
  }

  /** Face `i` rests at `t`, and is there now. */
  temper(i: number, t: Temperament): void {
    this.v0[i] = this.v[i] = t.v0;
    this.a0[i] = this.a[i] = t.a0;
    this.d0[i] = this.d[i] = t.d0;
    this.smirk[i] = t.smirk;
    this.reactivity[i] = t.reactivity;
    this.drift[i] = t.drift;
  }

  /** Feelings back to the temperament at once: everyone, or face `i`. */
  rest(i?: number): void {
    const from = i ?? 0;
    const to = i === undefined ? this.n : i + 1;
    for (let k = from; k < to; k++) {
      this.v[k] = this.v0[k];
      this.a[k] = this.a0[k];
      this.d[k] = this.d0[k];
      this.nov[k] = 0;
    }
  }

  /**
   * A result lands on face `i`: valence by how it felt, arousal by how big it
   * was, and dominance with it — except that the dominant hardly lose theirs,
   * so a loss turns them angry where it makes others sad.
   */
  react(i: number, before: number, after: number, gain = 1): void {
    const u = felt(before, after) * gain;
    if (u === 0) return;
    this.v[i] = clamp(this.v[i] + u * this.reactivity[i], -1, 1);
    this.a[i] = clamp(this.a[i] + 0.8 * Math.abs(u), -1, 1);
    this.d[i] = clamp(this.d[i] + 0.5 * u * (1 - Math.max(0, this.d0[i])), -1, 1);
  }

  /** Results for many at once: face `slots[k]` went from `prev[k]` to `next[k]` (a negative slot is skipped). */
  reactAll(slots: ArrayLike<number>, prev: ArrayLike<number>, next: ArrayLike<number>, gain = 1): void {
    for (let k = 0; k < slots.length; k++) {
      const i = slots[k];
      if (i >= 0 && prev[k] !== next[k]) this.react(i, prev[k], next[k], gain);
    }
  }

  /** A feeling pushed onto face `i`, so much valence, arousal and dominance: it fades as any other does. */
  feel(i: number, dv: number, da: number, dd = 0): void {
    this.v[i] = clamp(this.v[i] + dv * this.reactivity[i], -1, 1);
    this.a[i] = clamp(this.a[i] + da, -1, 1);
    this.d[i] = clamp(this.d[i] + dd, -1, 1);
  }

  /** Something unexpected, of `size` 0 … 1. */
  startle(i: number, size = 1): void {
    this.nov[i] = Math.max(this.nov[i], size);
  }

  /** Face `i` looks toward (yaw, pitch), radians: + right, + down. (0, 0) is the reader. */
  look(i: number, yaw: number, pitch: number): void {
    this.aimYaw[i] = yaw;
    this.aimPitch[i] = pitch;
  }

  /** Face `i`'s eyes are free: it glances about, at its own pace. */
  glance(i: number): void {
    this.aimYaw[i] = NaN;
    this.aimPitch[i] = NaN;
  }

  size(i: number, r: number, r0: number): void {
    if (r === this.r[i] && r0 === this.r0[i]) return;
    this.r[i] = r;
    this.r0[i] = r0;
    this.rhythm[i] = tempoOf(r, r0);
  }

  /** Where free eyes go now — here and there, and about a third of the time at the reader — into glanceYaw/Pitch. */
  private glanceAim(i: number): void {
    const s = this.seed[i];
    const k = Math.floor(this.glanceClock[i] / (1.3 + 1.9 * u01(s, 11)));
    if (k === this.glanceK[i]) return;
    this.glanceK[i] = k;
    const h = s * 131 + k;
    const amp = u01(h, 3) < 0.35 ? 0 : 0.25 + 0.55 * u01(s, 12);
    this.glanceYaw[i] = noise(h, 4) * amp;
    this.glancePitch[i] = amp ? 0.05 + noise(h, 5) * 0.3 * amp : 0;
  }

  /**
   * A face's mood drifting a little, −1 … 1: two slow waves of its own, so no
   * two faces in a room move together and none twitches (redrawing only now and then).
   */
  private sway(i: number, k: number): number {
    const s = this.seed[i];
    const t = this.moodClock[i];
    return 0.5 * (Math.sin(t / (6 + 7 * u01(s, 20 + k)) + 6.3 * u01(s, 30 + k)) + Math.sin(t / (11 + 9 * u01(s, 40 + k)) + 6.3 * u01(s, 50 + k)));
  }

  /** Everyone, `dt` seconds on: feelings relax, eyes and heads follow, rhythms tick. */
  step(dt: number): void {
    if (!(dt > 0)) return;
    const kv = Math.exp(-dt / RELAX.v);
    const ka = Math.exp(-dt / RELAX.a);
    const kd = Math.exp(-dt / RELAX.d);
    const kn = Math.exp(-dt / RELAX.n);
    const kc = 1 - Math.exp(-dt / RELAX.contempt);
    const kb = 1 - Math.exp(-dt / RELAX.blush);
    const ke = 1 - Math.exp(-dt / EYE_LAG);
    const kh = 1 - Math.exp(-dt / HEAD_LAG);
    for (let i = 0; i < this.n; i++) {
      this.v[i] = this.v0[i] + (this.v[i] - this.v0[i]) * kv;
      this.a[i] = this.a0[i] + (this.a[i] - this.a0[i]) * ka;
      this.d[i] = this.d0[i] + (this.d[i] - this.d0[i]) * kd;
      this.moodClock[i] += dt;
      if (this.drift[i]) {
        this.swayV[i] = 1.4 * this.drift[i] * this.sway(i, 0);
        this.swayA[i] = this.drift[i] * this.sway(i, 1);
      }
      this.nov[i] *= kn;
      this.contempt[i] += (this.contemptTo[i] - this.contempt[i]) * kc;
      this.blush[i] += (this.blushTo[i] - this.blush[i]) * kb;
      const rhythm = this.rhythm[i];
      const stride = rhythm ** STRIDE;
      this.blinkClock[i] += dt * rhythm;
      this.glanceClock[i] += dt * stride;
      if (this.talking[i]) this.talkClock[i] += dt * stride;
      let yaw = this.aimYaw[i];
      let pitch = this.aimPitch[i];
      if (this.still[i]) yaw = pitch = 0;
      else if (Number.isNaN(yaw)) {
        this.glanceAim(i);
        yaw = this.glanceYaw[i];
        pitch = this.glancePitch[i];
      }
      const hy = clamp(HEAD_SHARE * yaw, -HEAD_YAW, HEAD_YAW);
      const hp = clamp(HEAD_SHARE * pitch, -HEAD_PITCH, HEAD_PITCH);
      this.headYaw[i] += (hy - this.headYaw[i]) * kh;
      this.headPitch[i] += (hp - this.headPitch[i]) * kh;
      this.eyeYaw[i] += (clamp(yaw - hy, -EYE_REACH, EYE_REACH) - this.eyeYaw[i]) * ke;
      this.eyePitch[i] += (clamp(pitch - hp, -EYE_REACH, EYE_REACH) - this.eyePitch[i]) * ke;
    }
  }

  /** Heads, eyes and the eased looks straight to where they are going: a settled stage, or reduced motion. */
  settle(): void {
    for (let i = 0; i < this.n; i++) {
      let yaw = this.aimYaw[i];
      let pitch = this.aimPitch[i];
      if (Number.isNaN(yaw)) [yaw, pitch] = [0, 0];
      this.headYaw[i] = clamp(HEAD_SHARE * yaw, -HEAD_YAW, HEAD_YAW);
      this.headPitch[i] = clamp(HEAD_SHARE * pitch, -HEAD_PITCH, HEAD_PITCH);
      this.eyeYaw[i] = clamp(yaw - this.headYaw[i], -EYE_REACH, EYE_REACH);
      this.eyePitch[i] = clamp(pitch - this.headPitch[i], -EYE_REACH, EYE_REACH);
      this.contempt[i] = this.contemptTo[i];
      this.blush[i] = this.blushTo[i];
    }
  }

  /**
   * A fingerprint of everything face `i` would show, rounded to well below a
   * pixel: unchanged, the face need not be read or drawn again. Springs creep
   * toward their targets forever; rounded, they stop.
   */
  signature(i: number, reduced = false): number {
    let h = 2166136261;
    const mix = (x: number) => {
      h = Math.imul(h ^ Math.round(x), 16777619);
    };
    // a face too small to read changes only with a big swing of feeling
    const fine = this.still[i] ? 8 : 200;
    mix((this.v[i] + this.swayV[i]) * fine);
    mix((this.a[i] + this.swayA[i]) * fine);
    mix(this.d[i] * fine);
    mix(this.nov[i] * 50);
    mix(this.contempt[i] * 50);
    mix(this.blush[i] * 50);
    mix(this.headYaw[i] * 120);
    mix(this.headPitch[i] * 120);
    mix(this.eyeYaw[i] * 120);
    mix(this.eyePitch[i] * 120);
    if (!reduced && !this.still[i]) mix(blinkAt(this.blinkClock[i], this.seed[i], this.rhythm[i]) * 20);
    if (!reduced && this.talking[i]) mix(mouthAt(this.talkClock[i], this.seed[i]) * 20);
    mix(this.r[i] * 4);
    mix(this.r0[i] * 4);
    return h;
  }

  /**
   * Face `i` as a drawing receives it: the feeling (pulled toward the
   * winner's contempt as far as `contempt` says) through the expression and
   * the posture, the look, a blink and a talking mouth. Under reduced motion
   * nothing blinks or talks. The result is reused by the next read.
   */
  poseOf(i: number, reduced = false): FaceRead {
    const c = this.contempt[i];
    // a little drift of mood, for the room's not-quite-alike faces
    const vNow = this.v[i] + this.swayV[i];
    const aNow = this.a[i] + this.swayA[i];
    const v = vNow + (CONTEMPT.v - vNow) * c;
    const a = aNow + (CONTEMPT.a - aNow) * c;
    const d = this.d[i] + (CONTEMPT.d - this.d[i]) * c;
    const n = this.nov[i];
    const x = this.x7;
    expressTo(v, a, d, n, x);
    const marks = marksOf({ v, a, d, n });
    const blush = Math.max(marks.blush ?? 0, this.blush[i]);
    const p = this.p6;
    postureTo(v, a, d, n, blush, p);
    const out = this.read.pose;
    const e = out.expression;
    e.browLift = x[0];
    e.browSlope = x[1];
    e.eyeOpening = x[2];
    e.cheekLift = x[3];
    e.mouthCurve = x[4];
    e.mouthOpening = x[5];
    e.smirk = x[6] * (this.smirk[i] + (1 - this.smirk[i]) * c);
    const rhythm = this.rhythm[i];
    if (!reduced && this.talking[i]) e.mouthOpening = Math.max(e.mouthOpening, 0.8 * mouthAt(this.talkClock[i], this.seed[i]));
    out.head.yaw = clamp(this.headYaw[i] / HEAD_YAW + p[0], -1, 1);
    // looking down lowers the chin; dominance lifts it
    out.head.pitch = clamp(p[1] - this.headPitch[i] / HEAD_PITCH, -1, 1);
    out.head.roll = p[2];
    out.gaze.yaw = clamp(this.eyeYaw[i] / EYE_REACH + p[3], -1, 1);
    out.gaze.pitch = clamp(this.eyePitch[i] / EYE_REACH + p[4], -1, 1);
    out.blink = reduced || this.still[i] ? 0 : blinkAt(this.blinkClock[i], this.seed[i], rhythm);
    out.pupil = p[5];
    this.read.marks = { ...marks, blush };
    return this.read;
  }
}
