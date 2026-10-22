/**
 * Acts: how a set of moves is shown. Each is a composition of the area
 * arithmetic (core/area.ts), time (core/motion.ts) and pieces of money with
 * their steps (track.ts). The player (core/transit.ts) knows only this
 * contract, never an act's insides.
 *
 *   piece   a trade where people stand: the loser's slice flies to the winner
 *   toss    a trade between partners who have met: both stakes come off, a spinner
 *           decides, the winner keeps its own and takes the other's
 *   levy    everyone's slice into one pile, the pile split equally, a share to each
 */
import type { Move } from '../core/transfer.ts';
import type { Scene } from './scene.ts';
import type { Live } from './track.ts';

export type { Live } from './track.ts';

export interface Act {
  /** Act times each move's money comes off its giver and is taken in, in the order the moves were given. */
  readonly times: readonly { readonly off: number; readonly on: number }[];
  /** How long it takes. */
  readonly length: number;
  /** Faces: who flinches at the start, and what they lose (a levy). */
  readonly brace?: Float64Array;
  /** Act time faces relax again. */
  readonly relaxAt?: number;
  /** Act times of its named moments (a levy's: `pot` everything in, `split` divided, `back` dealt back). */
  readonly marks?: Readonly<Record<string, number>>;
  draw(t: number, live: Live, scene: Scene): void;
}

/** What makes an act: the stage as it is when it starts, the moves, and what it needs to know besides. */
export type MakeAct = (live: Live, moves: readonly Move[], opts: ActOptions) => Act;

export interface ActOptions {
  /** Which way a flight bows: alternate trades bow opposite ways. */
  readonly bend: number;
  /** The stakes are already on the table (shown before the act): a toss starts with them lifted. */
  readonly lifted?: boolean;
  /**
   * The two players' duel (owner, 2026-10-22): they stand the same height, each stake a full-height slice off the
   * side facing the other, the two meeting in the middle with no gap; the winner takes the loser's on that side.
   */
  readonly facing?: boolean;
  /** Bars (the CCDF's): a slice off the right end, joining the winner's right end. */
  readonly bars?: boolean;
}

export { pieceAct } from './piece.ts';
export { tossAct } from './toss.ts';
export { levyAct } from './levy.ts';
