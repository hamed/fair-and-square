/**
 * Deterministic math: the same bits in every browser.
 *
 * JavaScript's Math.exp, Math.log and Math.cos are only approximated, and engines approximate them differently, so
 * a simulation that calls them can drift apart between Chrome, Firefox and Safari. Everything here uses only
 * + − × ÷ (which ECMAScript fixes to IEEE 754 round-to-nearest-even), exact integer arithmetic and bit reads, so its
 * results are fixed by the inputs alone. Math.floor, Math.abs, Math.min and Math.max are exact and allowed.
 *
 * exp, log and the sin/cos kernels are ports of fdlibm (e_exp.c, e_log.c, k_sin.c, k_cos.c):
 *
 *   Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
 *   Developed at SunSoft, a Sun Microsystems, Inc. business.
 *   Permission to use, copy, modify, and distribute this software is freely granted, provided that this notice
 *   is preserved.
 *
 * sqrt is exactly rounded: Newton's iteration, then an exact integer test against the neighbouring midpoints.
 */

const buffer = new ArrayBuffer(8);
const f64 = new Float64Array(buffer);
const u32 = new Uint32Array(buffer);
const LITTLE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
const HI = LITTLE ? 1 : 0;
const LO = LITTLE ? 0 : 1;

/** The high 32 bits of a double, as a signed integer (fdlibm's __HI). */
function hiWord(x: number): number {
  f64[0] = x;
  return u32[HI] | 0;
}

/** The low 32 bits of a double, unsigned (fdlibm's __LO). */
function loWord(x: number): number {
  f64[0] = x;
  return u32[LO];
}

function fromWords(hi: number, lo: number): number {
  u32[HI] = hi >>> 0;
  u32[LO] = lo >>> 0;
  return f64[0];
}

/** 2^n for n in [−1022, 1023], exactly. */
function pow2(n: number): number {
  return fromWords((n + 1023) << 20, 0);
}

// ——— exp (fdlibm e_exp.c) ———

const HUGE = 1.0e300;
const TWOM1000 = 9.33263618503218878990e-302; // 2^-1000
const O_THRESHOLD = 7.09782712893383973096e2;
const U_THRESHOLD = -7.45133219101941108420e2;
const LN2_HI = 6.93147180369123816490e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.44269504088896338700;
const P1 = 1.66666666666666019037e-1;
const P2 = -2.77777777770155933842e-3;
const P3 = 6.61375632143793436117e-5;
const P4 = -1.65339022054652515390e-6;
const P5 = 4.13813679705723846039e-8;

export function exp(x: number): number {
  let hx = hiWord(x);
  const xsb = (hx >>> 31) & 1;
  hx &= 0x7fffffff;
  let hi = 0;
  let lo = 0;
  let k = 0;

  if (hx >= 0x40862e42) {
    // |x| >= 709.78…
    if (hx >= 0x7ff00000) {
      if (((hx & 0xfffff) | loWord(x)) !== 0) return x + x; // NaN
      return xsb === 0 ? x : 0; // exp(±inf) = inf, 0
    }
    if (x > O_THRESHOLD) return HUGE * HUGE;
    if (x < U_THRESHOLD) return TWOM1000 * TWOM1000;
  }

  if (hx > 0x3fd62e42) {
    // |x| > 0.5 ln2
    if (hx < 0x3ff0a2b2) {
      // and |x| < 1.5 ln2
      hi = xsb === 0 ? x - LN2_HI : x + LN2_HI;
      lo = xsb === 0 ? LN2_LO : -LN2_LO;
      k = 1 - xsb - xsb;
    } else {
      k = Math.trunc(INV_LN2 * x + (xsb === 0 ? 0.5 : -0.5));
      hi = x - k * LN2_HI; // exact here
      lo = k * LN2_LO;
    }
    x = hi - lo;
  } else if (hx < 0x3e300000) {
    // |x| < 2^-28
    return 1 + x;
  }

  const t = x * x;
  const c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return 1 - ((x * c) / (c - 2) - x);
  const y = 1 - (lo - (x * c) / (2 - c) - hi);
  if (k >= -1021) return fromWords(hiWord(y) + (k << 20), loWord(y));
  return fromWords(hiWord(y) + ((k + 1000) << 20), loWord(y)) * TWOM1000;
}

// ——— log (fdlibm e_log.c) ———

const TWO54 = 1.80143985094819840000e16;
const LG1 = 6.666666666666735130e-1;
const LG2 = 3.999999999940941908e-1;
const LG3 = 2.857142874366239149e-1;
const LG4 = 2.222219843214978396e-1;
const LG5 = 1.818357216161805012e-1;
const LG6 = 1.531383769920937332e-1;
const LG7 = 1.479819860511658591e-1;

/** The natural logarithm. */
export function log(x: number): number {
  let hx = hiWord(x);
  const lx = loWord(x);
  let k = 0;
  if (hx < 0x00100000) {
    // x < 2^-1022
    if (((hx & 0x7fffffff) | lx) === 0) return -Infinity; // log(±0)
    if (hx < 0) return NaN; // log(negative)
    k -= 54;
    x *= TWO54; // subnormal: scale up
    hx = hiWord(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  let i = (hx + 0x95f64) & 0x100000;
  x = fromWords(hx | (i ^ 0x3ff00000), loWord(x)); // normalise x or x/2
  k += i >> 20;
  const f = x - 1;
  if ((0x000fffff & (2 + hx)) < 3) {
    // |f| < 2^-20
    if (f === 0) return k === 0 ? 0 : k * LN2_HI + k * LN2_LO;
    const r = f * f * (0.5 - 0.33333333333333333 * f);
    return k === 0 ? f - r : k * LN2_HI - (r - k * LN2_LO - f);
  }
  const s = f / (2 + f);
  const z = s * s;
  i = hx - 0x6147a;
  const w = z * z;
  const j = 0x6b851 - hx;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  i |= j;
  const r = t2 + t1;
  if (i > 0) {
    const hfsq = 0.5 * f * f;
    return k === 0 ? f - (hfsq - s * (hfsq + r)) : k * LN2_HI - (hfsq - (s * (hfsq + r) + k * LN2_LO) - f);
  }
  return k === 0 ? f - s * (f - r) : k * LN2_HI - (s * (f - r) - k * LN2_LO - f);
}

// ——— sin and cos kernels on [−π/4, π/4] (fdlibm k_sin.c, k_cos.c) ———

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

function kernelSin(x: number): number {
  const ix = hiWord(x) & 0x7fffffff;
  if (ix < 0x3e400000) return x; // |x| < 2^-27
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return x + v * (S1 + z * r);
}

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.08757232129817482790e-9;
const C6 = -1.13596475577881948265e-11;

function kernelCos(x: number): number {
  const ix = hiWord(x) & 0x7fffffff;
  if (ix < 0x3e400000) return 1; // |x| < 2^-27
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3fd33333) return 1 - (0.5 * z - z * r); // |x| < 0.3
  const qx = ix > 0x3fe90000 ? 0.28125 : fromWords(ix - 0x00200000, 0); // x/4, truncated
  const hz = 0.5 * z - qx;
  const a = 1 - qx;
  return a - (hz - z * r);
}

const TWO_PI = 6.283185307179586;

/**
 * cos(2πu) for u in turns, |u| < 2^50: the turn is reduced exactly to the nearest quarter, so only the last
 * eighth of a turn is ever multiplied by 2π.
 */
export function cos2pi(u: number): number {
  if (!Number.isFinite(u)) return NaN;
  const q = Math.floor(u * 4 + 0.5);
  const x = (u - q * 0.25) * TWO_PI; // u − q/4 is exact; |x| ≤ π/4
  switch (q & 3) {
    case 0:
      return kernelCos(x);
    case 1:
      return -kernelSin(x);
    case 2:
      return -kernelCos(x);
    default:
      return kernelSin(x);
  }
}

// ——— sqrt, exactly rounded ———

const TWO52 = 4503599627370496;
const LIMB = 16777216; // 2^24
const PER_LIMB = 1 / LIMB; // exact: a power of two
const DBL_MIN = 2.2250738585072014e-308;

/**
 * The sign of A² − B for A = 2·mant + s (s = ±1) and B given by its base-2^24 limbs at positions 2, 3, 4, exactly.
 * A can exceed 2^53, where doubles hold only even integers, so it is built limb by limb from mant (< 2^53). Every
 * product and partial sum stays below 2^53, and floor(v · 2^-24) is exact for whole v.
 */
function compareSquare(mant: number, s: number, b2: number, b3: number, b4: number): number {
  const high = Math.floor(mant * PER_LIMB);
  let a2 = Math.floor(high * PER_LIMB);
  let a1 = 2 * (high - a2 * LIMB);
  let a0 = 2 * (mant - high * LIMB) + s;
  a2 *= 2;
  let up = Math.floor(a0 * PER_LIMB);
  a0 -= up * LIMB;
  a1 += up;
  up = Math.floor(a1 * PER_LIMB);
  a1 -= up * LIMB;
  a2 += up;
  const c0 = a0 * a0;
  let c1 = 2 * a0 * a1;
  let c2 = 2 * a0 * a2 + a1 * a1;
  let c3 = 2 * a1 * a2;
  let c4 = a2 * a2;
  let carry = Math.floor(c0 * PER_LIMB);
  const r0 = c0 - carry * LIMB;
  c1 += carry;
  carry = Math.floor(c1 * PER_LIMB);
  c1 -= carry * LIMB;
  c2 += carry;
  carry = Math.floor(c2 * PER_LIMB);
  c2 -= carry * LIMB;
  c3 += carry;
  carry = Math.floor(c3 * PER_LIMB);
  c3 -= carry * LIMB;
  c4 += carry;
  if (c4 !== b4) return c4 > b4 ? 1 : -1;
  if (c3 !== b3) return c3 > b3 ? 1 : -1;
  if (c2 !== b2) return c2 > b2 ? 1 : -1;
  return c1 + r0 > 0 ? 1 : 0; // A² is odd, B even: never equal
}

/** The square root, exactly rounded (as IEEE 754 requires and WASM's f64.sqrt gives). */
export function sqrt(x: number): number {
  if (!(x > 0)) return x === 0 ? x : NaN; // ±0, negatives, NaN
  if (x === Infinity) return x;
  let shift = 0;
  if (x < DBL_MIN) {
    x *= TWO54 * TWO54; // 2^108, exact for subnormals
    shift = -54;
  }
  const hx = hiWord(x);
  let e = ((hx >>> 20) & 0x7ff) - 1023;
  let m = fromWords((hx & 0x000fffff) | 0x3ff00000, loWord(x)); // [1, 2)
  if (e & 1) {
    m *= 2; // [2, 4)
    e -= 1;
  }
  // sqrt(m) in [1, 2): Newton from a chord (5.5 % off at worst; four steps reach the last bit), then round exactly
  let y = (m + 2) / 3;
  for (let i = 0; i < 4; i++) y = 0.5 * (y + m / y);
  let mant = y * TWO52; // a whole number: y has 53 significant bits in [1, 2]
  // the answer is the mant with (2·mant − 1)² < K·2^54 < (2·mant + 1)², K = m·2^52 (m has at most 53 bits).
  // K·2^54 = (m·2^58)·2^48: its limbs sit at positions 2, 3, 4.
  const b = m * TWO52 * 64;
  const b34 = Math.floor(b * PER_LIMB);
  const b4 = Math.floor(b34 * PER_LIMB);
  const b3 = b34 - b4 * LIMB;
  const b2 = b - b34 * LIMB;
  while (compareSquare(mant, 1, b2, b3, b4) < 0) mant += 1;
  while (compareSquare(mant, -1, b2, b3, b4) > 0) mant -= 1;
  return (mant / TWO52) * pow2(e / 2 + shift);
}

// ——— pow ———

/** x^y: by repeated squaring for whole y up to 1024, else exp(y·log x). Non-real results are NaN. */
export function pow(x: number, y: number): number {
  if (y === 0) return 1;
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  if (Number.isInteger(y) && Math.abs(y) <= 1024) {
    let n = Math.abs(y);
    let r = 1;
    let b = x;
    while (n > 0) {
      if (n % 2 === 1) r *= b;
      b *= b;
      n = Math.floor(n / 2);
    }
    return y < 0 ? 1 / r : r;
  }
  if (x < 0) {
    if (!Number.isInteger(y)) return NaN;
    // a whole exponent past 1024: the sign by parity, the size from |x| (review MB8). Above 2^53 every whole
    // double is even.
    const size = pow(-x, y);
    return Math.abs(y) < 2 ** 53 && y % 2 !== 0 ? -size : size;
  }
  if (x === 0) return y > 0 ? 0 : Infinity;
  return exp(y * log(x));
}

/** tanh x from exp: odd, saturating to ±1 (|x| past 20 is ±1 in doubles). */
export function tanh(x: number): number {
  if (Number.isNaN(x)) return NaN;
  const a = Math.abs(x);
  if (a > 20) return x > 0 ? 1 : -1;
  const e = exp(-2 * a);
  const t = (1 - e) / (1 + e);
  return x < 0 ? -t : t;
}

/** artanh y = ½ log((1 + y) / (1 − y)) for |y| < 1; ±∞ at ±1, NaN beyond. */
export function atanh(y: number): number {
  if (!(Math.abs(y) <= 1)) return NaN;
  if (y === 1) return Infinity;
  if (y === -1) return -Infinity;
  return 0.5 * log((1 + y) / (1 - y));
}
