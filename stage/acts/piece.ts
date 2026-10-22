/**
 * A trade where people stand (the default): the two look at each other; the
 * loser's stake is cut off its longer side, toward the winner, becomes a
 * square, flies on a bow, becomes the bar it joins as, and joins the winner
 * on the side that leaves it squarer. Bars (`bars`) lose it off their right end and take it on there.
 *
 * In the pose's scale: the slice is what the loser's drawn area loses, the
 * bar what the winner's gains (in a log or squared pose the two differ); the
 * piece changes size on the way.
 */
import { away, centreOf, cutSide, join, joinSide, square, GAP } from '../core/area.ts';
import { DUR, flyTime } from '../core/motion.ts';
import type { Move } from '../core/transfer.ts';
import type { Act, ActOptions } from './index.ts';
import { Money, type Live } from './track.ts';

/** What the giver's drawn area loses and the taker's gains, for a move of `amount` (in wealth). */
export function areasOf(live: Live, from: number, to: number, amount: number): { off: number; on: number } {
  const g = live.drawn(from);
  const t = live.drawn(to);
  return { off: live.measure(g) - live.measure(g - amount), on: live.measure(t + amount) - live.measure(t) };
}

export function pieceAct(live: Live, moves: readonly Move[], opts: ActOptions): Act {
  const m = moves[0];
  const { off, on } = areasOf(live, m.from, m.to, m.amount);
  const L = live.box(m.from);
  const W = live.box(m.to);
  // bars (the CCDF's): off the loser's right end, onto the winner's (owner, 2026-10-22); else the single rule
  const side = opts.bars ? 1 : cutSide(L, W);
  const winSide = opts.bars ? 1 : joinSide(W, L, on);
  const [lx, ly] = centreOf(L);
  const [wx, wy] = centreOf(W);
  // where it will become a bar: beside the winner, a gap away
  const barAt = (l: Live) => join(l.box(m.to), on, winSide, GAP).piece;
  const money = new Money(off, m.from, DUR.pair)
    .mark(m.from, L, side)
    .lift()
    .reshape((mm) => away(square(off, ...centreOf(mm.box!)), side, GAP), { release: true })
    .travel(flyTime(Math.hypot(wx - lx, wy - ly)), (l) => square(on, ...centreOf(barAt(l))), { bend: opts.bend, trail: true, shaping: (u) => u })
    .reshape((_mm, l) => barAt(l), { dur: DUR.bar })
    .dock(m.to, winSide, { area: on })
    .merge(m.to);
  // the pair look at each other until the cut
  const looking = DUR.pair + DUR.mark;
  return {
    times: [{ off: money.offAt, on: money.onAt }],
    length: money.end,
    draw(t, l, scene) {
      if (t < looking) scene.looks.push([m.from, m.to], [m.to, m.from]);
      money.draw(t, l, scene);
    },
  };
}
