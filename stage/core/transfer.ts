/**
 * Money changing hands, and what the stage owes the game while it shows it.
 *
 * The game moves wealth at once; every change of hands is a move (from, to,
 * amount), a levy's through the shared pot (POT). The stage shows a move as
 * a transfer: the giver is drawn with the money until it comes off (`offAt`),
 * the taker without it until it is taken in (`onAt`). So what is drawn is
 * wealth − owed, and `owed` follows from the open transfers alone:
 *
 *   owed[i] = Σ (to i, not yet on) amount − Σ (from i, not yet off) amount
 *
 * Money no person holds (cut off and not yet taken in, or in the pot) is in
 * transit; drawn + in transit = all the wealth at every moment (tested).
 */

/** The shared pot a levy passes through: a holder that owns no game wealth. */
export const POT = -1;

export interface Move {
  readonly from: number;
  readonly to: number;
  readonly amount: number;
  /** The giver's proportions once it is off, the taker's once it is on (decided when the game moved it; NaN: unchanged). */
  readonly offShape?: number;
  readonly onShape?: number;
}

export interface Transfer extends Move {
  /** Absolute times; Infinity until the act that shows it starts. */
  offAt: number;
  onAt: number;
  off: boolean;
  on: boolean;
}

/** A transfer crossing one of its two moments: money leaving a holder, or arriving. */
export interface MoneyEvent {
  readonly kind: 'off' | 'on';
  readonly holder: number;
  /** Where it goes to (off) or came from (on): POT for a levy's. */
  readonly other: number;
  readonly amount: number;
  /** The holder's proportions from now (NaN: unchanged). */
  readonly shape: number;
}

export class Ledger {
  readonly owed: Float64Array;
  private open: Transfer[] = [];

  constructor(n: number) {
    this.owed = new Float64Array(n);
  }

  /** Moves the game has made, to be shown: until each comes off and on, everyone is drawn as before. */
  add(moves: readonly Move[]): Transfer[] {
    const ts = moves.map((m) => ({ ...m, offAt: Infinity, onAt: Infinity, off: false, on: false }));
    for (const t of ts) {
      if (t.from >= 0) this.owed[t.from] -= t.amount;
      if (t.to >= 0) this.owed[t.to] += t.amount;
      this.open.push(t);
    }
    return ts;
  }

  /** Every crossing up to `now`, each once, in time order per transfer (off before on). */
  advance(now: number, out: MoneyEvent[]): boolean {
    let changed = false;
    for (const t of this.open) {
      if (!t.off && now >= t.offAt) {
        t.off = true;
        if (t.from >= 0) this.owed[t.from] += t.amount;
        out.push({ kind: 'off', holder: t.from, other: t.to, amount: t.amount, shape: t.offShape ?? NaN });
        changed = true;
      }
      if (!t.on && t.off && now >= t.onAt) {
        t.on = true;
        if (t.to >= 0) this.owed[t.to] -= t.amount;
        out.push({ kind: 'on', holder: t.to, other: t.from, amount: t.amount, shape: t.onShape ?? NaN });
        changed = true;
      }
    }
    if (changed) tidy(this.owed);
    return changed;
  }

  /** Forget transfers that are over (an act ended: every one of its moves is off and on). */
  close(ts: readonly Transfer[]): void {
    const gone = new Set(ts);
    this.open = this.open.filter((t) => !gone.has(t));
  }

  /** Money no person holds now. */
  get inTransit(): number {
    let m = 0;
    for (const t of this.open) {
      if (t.from >= 0 && t.off) m += t.amount;
      if (t.to >= 0 && t.on) m -= t.amount;
    }
    return m;
  }

  clear(): void {
    this.open = [];
    this.owed.fill(0);
  }
}

/** Rounding dust from adding and taking back the same amounts. */
function tidy(owed: Float64Array): void {
  for (let i = 0; i < owed.length; i++) if (Math.abs(owed[i]) < 1e-15) owed[i] = 0;
}
