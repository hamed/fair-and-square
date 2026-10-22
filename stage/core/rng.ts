/**
 * mulberry32, the master app's generator (src/lib/sim/Random.ts). Copied, not
 * imported: that file uses constructor parameter properties, which this
 * package's erasable-syntax-only build rejects. Same seed, same stream, so a
 * seeded game here replays the master's YardSaleEngine trade for trade.
 */
export class Rng {
  private readonly seed: number;
  private s: number;

  constructor(seed: number) {
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
      throw new RangeError('seed must be an unsigned 32-bit integer');
    }
    this.seed = seed;
    this.s = seed;
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let value = this.s;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  }

  reset(): void {
    this.s = this.seed;
  }

  /** The generator's whole state, for atomic commands that may roll back. */
  get state(): number {
    return this.s;
  }

  set state(value: number) {
    this.s = value >>> 0;
  }
}
