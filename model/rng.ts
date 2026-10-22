/**
 * Counter-based random numbers: every draw is a pure function of (seed, stream, round, occurrence, index, k), so a
 * new random block never shifts anyone else's draws and any round can be replayed on its own.
 *
 * The mix is SplitMix64's: the key's prefix is a chain of finalisers over (seed, stream, round, occurrence); a draw
 * adds (index · 2^16 + k + 1) · γ to it and finalises once, as SplitMix64 does with its counter. 64-bit words are
 * kept as two unsigned 32-bit halves, and every operation on them is exact integer arithmetic, so the bits are the
 * same in every browser. A uniform takes the top 53 bits / 2^53; a normal is Box–Muller from two uniforms, with the
 * deterministic log, sqrt and cos of dmath.ts.
 */
import { cos2pi, log, sqrt } from './dmath.ts';

/** A 64-bit stream key, as two unsigned 32-bit halves. */
export interface Key {
  readonly hi: number;
  readonly lo: number;
}

const GAMMA_HI = 0x9e3779b9;
const GAMMA_LO = 0x7f4a7c15;
const M1_HI = 0xbf58476d;
const M1_LO = 0x1ce4e5b9;
const M2_HI = 0x94d049bb;
const M2_LO = 0x133111eb;
const TWO32 = 4294967296;
const TWO21 = 2097152;
const TWO53 = 9007199254740992;

/** Result registers [hi, lo]: the 64-bit operations write here instead of allocating. */
const reg = new Uint32Array(2);

/**
 * (ah:al) · (bh:bl) mod 2^64 into reg, in 16-bit limbs (as Long.js does): every intermediate stays below 2^32, so
 * each step is exact.
 */
function mul(ah: number, al: number, bh: number, bl: number): void {
  const a48 = ah >>> 16;
  const a32 = ah & 0xffff;
  const a16 = al >>> 16;
  const a00 = al & 0xffff;
  const b48 = bh >>> 16;
  const b32 = bh & 0xffff;
  const b16 = bl >>> 16;
  const b00 = bl & 0xffff;
  let c00 = a00 * b00;
  let c16 = c00 >>> 16;
  c00 &= 0xffff;
  c16 += a16 * b00;
  let c32 = c16 >>> 16;
  c16 &= 0xffff;
  c16 += a00 * b16;
  c32 += c16 >>> 16;
  c16 &= 0xffff;
  c32 += a32 * b00;
  let c48 = c32 >>> 16;
  c32 &= 0xffff;
  c32 += a16 * b16;
  c48 += c32 >>> 16;
  c32 &= 0xffff;
  c32 += a00 * b32;
  c48 += c32 >>> 16;
  c32 &= 0xffff;
  c48 += a48 * b00 + a32 * b16 + a16 * b32 + a00 * b48;
  reg[0] = ((c48 & 0xffff) << 16) | c32;
  reg[1] = (c16 << 16) | c00;
}

/** SplitMix64's finaliser of (hi:lo) into reg. */
function fmix(hi: number, lo: number): void {
  lo = (lo ^ ((lo >>> 30) | (hi << 2))) >>> 0; // z ^= z >>> 30
  hi = (hi ^ (hi >>> 30)) >>> 0;
  mul(hi, lo, M1_HI, M1_LO);
  hi = reg[0];
  lo = reg[1];
  lo = (lo ^ ((lo >>> 27) | (hi << 5))) >>> 0; // z ^= z >>> 27
  hi = (hi ^ (hi >>> 27)) >>> 0;
  mul(hi, lo, M2_HI, M2_LO);
  hi = reg[0];
  lo = reg[1];
  reg[1] = lo ^ ((lo >>> 31) | (hi << 1)); // z ^= z >>> 31
  reg[0] = hi ^ (hi >>> 31);
}

/** Fold a whole number (< 2^53) into the chain (hi:lo): finalise (h ^ word), then add γ. Result in reg. */
function fold(hi: number, lo: number, word: number): void {
  const wh = Math.floor(word / TWO32);
  fmix((hi ^ wh) >>> 0, (lo ^ (word - wh * TWO32)) >>> 0);
  const sum = reg[1] + GAMMA_LO;
  const carry = sum >= TWO32 ? 1 : 0;
  reg[1] = sum - carry * TWO32;
  reg[0] = reg[0] + GAMMA_HI + carry;
}

/** A stream's key from its name: a built-in stream's name, or the AST path of a random block. */
export function keyOf(name: string): Key {
  fold(0, 0, name.length);
  for (let i = 0; i < name.length; i++) fold(reg[0], reg[1], name.charCodeAt(i));
  return { hi: reg[0], lo: reg[1] };
}

/**
 * The draws of one stream in one statement's run: `at` sets the prefix, then `uniform(index, k)` and
 * `normal(index, k)` are pure functions of it. Reused, never allocated per draw.
 */
export class Draws {
  private hi = 0;
  private lo = 0;

  /** Key the draws to (seed, stream, round, occurrence): seed an unsigned 32-bit integer, the rest whole numbers. */
  at(seed: number, stream: Key, round: number, occurrence = 0): this {
    fold(0, 0, seed);
    fold(reg[0] ^ stream.hi, reg[1] ^ stream.lo, 0);
    fold(reg[0], reg[1], round);
    fold(reg[0], reg[1], occurrence);
    this.hi = reg[0];
    this.lo = reg[1];
    return this;
  }

  /** Uniform on [0, 1): 53 bits. `index` < 2^32 (an agent, a pair, a step), `k` < 2^16 − 1 (which draw of it). */
  uniform(index: number, k = 0): number {
    // state = prefix + counter · γ, counter = index · 2^16 + k + 1
    mul(index >>> 16, (((index & 0xffff) << 16) | (k + 1)) >>> 0, GAMMA_HI, GAMMA_LO);
    let lo = reg[1] + this.lo;
    const carry = lo >= TWO32 ? 1 : 0;
    lo -= carry * TWO32;
    let hi = (reg[0] + this.hi + carry) >>> 0;
    // finalise, inline: this is the hot path
    lo = (lo ^ ((lo >>> 30) | (hi << 2))) >>> 0;
    hi = (hi ^ (hi >>> 30)) >>> 0;
    mul(hi, lo, M1_HI, M1_LO);
    hi = reg[0];
    lo = reg[1];
    lo = (lo ^ ((lo >>> 27) | (hi << 5))) >>> 0;
    hi = (hi ^ (hi >>> 27)) >>> 0;
    mul(hi, lo, M2_HI, M2_LO);
    hi = reg[0];
    lo = reg[1];
    lo = (lo ^ ((lo >>> 31) | (hi << 1))) >>> 0;
    hi = (hi ^ (hi >>> 31)) >>> 0;
    return (hi * TWO21 + (lo >>> 11)) / TWO53;
  }

  /** Standard normal by Box–Muller from draws k and k + 1 of this index. */
  normal(index: number, k = 0): number {
    const u1 = this.uniform(index, k);
    const u2 = this.uniform(index, k + 1);
    return sqrt(-2 * log(1 - u1)) * cos2pi(u2);
  }

  /** A whole number in [0, n), from one uniform. */
  below(n: number, index: number, k = 0): number {
    return Math.floor(this.uniform(index, k) * n);
  }
}

/** The spec's streams, with setup split by trait so adding one never moves another. */
export const STREAM = {
  pair: keyOf('pair'),
  coin: keyOf('coin'),
  split: keyOf('split'),
  grow: keyOf('grow'),
  give: keyOf('give'),
  move: keyOf('move'),
  start: keyOf('setup.start'),
  talent: keyOf('setup.talent'),
  thrift: keyOf('setup.thrift'),
  place: keyOf('setup.place'),
  // the console's one-off trades: their own streams, so they move no program draw
  consolePair: keyOf('console.pair'),
  consoleCoin: keyOf('console.coin'),
  consoleSplit: keyOf('console.split'),
} as const;

/** A 64-bit digest of numbers' exact bits, for "the same state, bit for bit" across runs and browsers: 16 hex digits. */
export function digest(values: Iterable<number>): string {
  const view = new DataView(new ArrayBuffer(8));
  let hi = 0;
  let lo = 0;
  for (const v of values) {
    view.setFloat64(0, v, true);
    fold(hi ^ view.getUint32(4, true), lo ^ view.getUint32(0, true), 0);
    hi = reg[0];
    lo = reg[1];
  }
  return hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0');
}
