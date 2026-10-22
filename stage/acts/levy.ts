/**
 * A levy, the pot's round trip: faces flinch; each payer cuts what it pays off its longer side, toward the
 * middle; biggest first, one a step after another, the slices fly into a pile in the middle, each keeping the
 * shape it was cut in until it arrives (`pile`: each joins on the side that keeps it squarest; the finished pile
 * centred), the pile's colour the payers' mixed by amount; all in, the pile becomes one square (the pot); the
 * pot becomes a square for each receiver, sized by
 * its share, which part; a square flies to each receiver and, arrived, becomes what it joins as and joins them by
 * the single rule. Shown before (the tax's slices already off everyone), it starts with them off.
 *
 * Who pays and who receives follows the program: everyone and everyone under a levy shared equally; fewer
 * under a tax on the richest, a give to the poorest or to one at random. With nobody receiving (a tax with no
 * give: a burn) the pile fades; with nobody paying now (a pot given out later) it appears in the middle.
 *
 * In the pose's scale: each slice is what that person's drawn area loses, the pile all of them, and each
 * receiver takes in what its drawn area gains (in a log or squared pose those differ from person to person: a
 * square changes size on its way).
 *
 * Moves: the payments (j → POT), then the shares (POT → j), as the game made them.
 */
import { area, at, centreOf, cut, cutSide, joinSide, join, morph, pile, squares, GAP, type Box, type Side } from '../core/area.ts';
import { DUR, levyStep, smooth } from '../core/motion.ts';
import { POT, type Move } from '../core/transfer.ts';
import type { Act, ActOptions } from './index.ts';
import { Money, Track, type Live } from './track.ts';

export function levyAct(live: Live, moves: readonly Move[], opts: ActOptions): Act {
  const n = live.n;
  const pays = new Float64Array(n);
  const shares = new Float64Array(n);
  for (const m of moves) {
    if (m.to === POT) pays[m.from] += m.amount;
    else if (m.from === POT) shares[m.to] += m.amount;
  }
  // in the pose's scale: what each drawn area loses, and what it gains back
  const off = new Float64Array(n);
  const on = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const d = live.drawn(j);
    off[j] = live.measure(d) - live.measure(d - pays[j]);
    on[j] = live.measure(d - pays[j] + shares[j]) - live.measure(d - pays[j]);
  }
  const cx = live.right / 2;
  const cy = live.top / 2;
  const middle: Box = { x: cx, y: cy, w: 0, h: 0 };
  // who pays and who receives: everyone under a flat levy shared equally, fewer under other rules (a tax on
  // the richest, a give to the poorest, a lottery, a burn that gives nothing back)
  const order = Array.from({ length: n }, (_, j) => j)
    .filter((j) => off[j] > 0)
    .sort((a, b) => off[b] - off[a] || a - b);
  const receivers = Array.from({ length: n }, (_, j) => j).filter((j) => on[j] > 0);
  const step = levyStep(Math.max(1, order.length));
  const tMark = DUR.brace;
  // shown before (the tax's slices on everyone), the slices start off already
  const markDur = opts.lifted ? 0 : DUR.levyMark;
  const liftDur = opts.lifted ? 0 : DUR.levyLift;
  const tGather = tMark + markDur + liftDur + DUR.levyShape;
  const close = Math.max(0.06, step);
  const arrive = (k: number) => tGather + DUR.levyFly + k * step;
  // everything in, the pile becomes a square (owner, 2026-10-22: the pot is a square), then it is divided
  const tAll = order.length ? arrive(order.length - 1) + close : tGather;
  const tSplit = tAll + (order.length ? SQUARE_UP : 0) + 0.15;
  const tDeal = tSplit + DUR.split;

  // into the pile, biggest first
  const steps = pile(
    order.map((j) => off[j]),
    cx,
    cy,
  );
  // the pile's colour so far: the payers' in it, mixed by what each paid
  const blends = steps.map((_, k) => ({ of: order.slice(0, k + 1), by: order.slice(0, k + 1).map((j) => pays[j]) }));
  const payers = order.map((j, k) => {
    const box = live.box(j);
    const side = cutSide(box, middle);
    // the slice keeps the shape it was cut in all the way to the pot, and takes the pile's there
    const money = new Money(off[j], j, tMark)
      .mark(j, box, side, markDur)
      .lift(liftDur)
      .wait(DUR.levyShape, { release: true })
      .wait(arrive(k) - DUR.levyFly - tGather)
      .travel(DUR.levyFly, () => steps[k].staged, { bend: k % 2 ? 0.1 : -0.1, shaping: (u) => smooth((u - ARRIVE) / (1 - ARRIVE)) });
    if (k === 0) money.wait(close);
    else money.dock(steps[k - 1].pile, steps[k].side as Side, { dur: close, turn: false, seam: false });
    return money;
  });

  // the pile (or, with nobody paying now, the pot given out, appearing in the middle); then a square for each
  // receiver, sized by its share, which part
  const given = receivers.reduce((s, j) => s + on[j], 0);
  const heaped = order.length ? steps[order.length - 1].pile : null;
  const whole = heaped ? square(area(heaped), ...centreOf(heaped)) : square(given, cx, cy);
  const blend = order.length ? blends[order.length - 1] : undefined;
  const sizes = receivers.map((j) => (area(whole) * shares[j]) / receivers.reduce((s, r) => s + shares[r], 0));
  const packed = cellsOf(sizes, cx, cy, 0);
  const parted = cellsOf(sizes, cx, cy, GAP * 1.5);
  const heap = new Track(order.length ? arrive(0) + close : tGather);
  heap.add({
    dur: tSplit - heap.start,
    draw: (u, _l, scene) => {
      if (!order.length) {
        scene.pieces.push({ box: whole, alpha: 0.95 * smooth(u), colour: -1 });
        return;
      }
      const t = heap.start + u * (tSplit - heap.start);
      let done = 0;
      for (let k = 0; k < order.length; k++) if (t >= arrive(k) + close) done = k;
      // the whole pile squares up, keeping its area
      const box = t >= tAll && heaped ? morph(heaped, whole, smooth((t - tAll) / SQUARE_UP)) : steps[done].pile;
      scene.pieces.push({ box, alpha: 0.95, colour: -1, blend: blends[done] });
    },
  });
  heap.add({
    dur: DUR.split,
    draw: (u, _l, scene) => {
      // the pile gives way to its squares, which then part; with nobody to receive it, it fades (a burn)
      const show = smooth(u / 0.4);
      if (show < 1) scene.pieces.push({ box: whole, alpha: 0.95 * (1 - show), colour: -1, blend });
      const part = smooth((u - 0.5) / 0.5);
      packed.forEach((c, k) => {
        const [x0, y0] = centreOf(c);
        const [x1, y1] = centreOf(parted[k]);
        scene.pieces.push({ box: at(c, x0 + (x1 - x0) * part, y0 + (y1 - y0) * part), alpha: 0.95 * show, colour: -1, blend });
      });
      if (part === 0) for (const c of packed) scene.frames.push({ box: c, alpha: show, solid: true });
    },
  });

  // a square to each receiver, nearest round the middle; it joins them on the side the rule picks
  const dealt = dealCells(live, parted, receivers, cx, cy);
  const sharesOut = parted.map((c, k) => {
    const j = dealt[k];
    const rest = off[j] > 0 ? cut(live.box(j), cutSide(live.box(j), middle), off[j]).rest : live.box(j);
    const side = joinSide(rest, middle, on[j]);
    // a square all the way to its square, which it becomes part of there
    return new Money(area(c), -1, tDeal, blend)
      .from(c)
      .travel(DUR.deal, (l) => join(l.box(j), on[j], side, GAP).piece, { bend: k % 2 ? 0.1 : -0.1, shaping: (u) => smooth((u - ARRIVE) / (1 - ARRIVE)) })
      .dock(j, side, { area: on[j] })
      .merge(j);
  });
  const byPerson = new Map(Array.from(dealt, (j, k) => [j, sharesOut[k]] as const));
  const payerOf = new Map(order.map((j, k) => [j, payers[k]] as const));
  const times = moves.map((m) => {
    if (m.to === POT) {
      const p = payerOf.get(m.from);
      if (!p) return { off: tMark, on: tSplit };
      return { off: p.offAt, on: Number.isFinite(p.onAt) ? p.onAt : p.end };
    }
    const s = byPerson.get(m.to);
    return s ? { off: tSplit, on: s.onAt } : { off: tSplit, on: tDeal };
  });
  const ends = sharesOut.map((s) => s.end);
  return {
    times,
    length: Math.max(tDeal, ...ends),
    brace: pays,
    relaxAt: sharesOut.length ? Math.min(...sharesOut.map((s) => s.onAt)) : tDeal,
    // everything in the pot; the pot divided and its shares parted; everyone's share back
    // (`pot` a moment before the pot starts dividing: held there, it is whole)
    marks: { pot: tSplit - 0.02, split: tDeal, back: Math.max(tDeal, ...ends) },
    draw(t, l, scene) {
      for (const p of payers) p.draw(t, l, scene);
      heap.draw(t, l, scene);
      for (const s of sharesOut) s.draw(t, l, scene);
    },
  };
}

/** Seconds the full pot takes to become a square. */
const SQUARE_UP = 0.5;

/** The share of a flight after which a piece changes shape: it arrives as it left, then fits where it lands. */
const ARRIVE = 0.82;

/** Squares of these areas in rows round (x, y), each centred in a cell as wide as the largest. */
function cellsOf(areas: readonly number[], x: number, y: number, gap: number): Box[] {
  const n = areas.length;
  if (!n) return [];
  const big = Math.sqrt(Math.max(...areas, 0));
  const grid = squares(n, big * big, x, y, gap);
  return grid.map((cell, k) => square(areas[k], ...centreOf(cell)));
}

/** A square of area `a` centred on (x, y). */
function square(a: number, x: number, y: number): Box {
  const q = Math.sqrt(Math.max(0, a));
  return { x: x - q / 2, y: y - q / 2, w: q, h: q };
}

/** Which receiver each square goes to: both in angular order round the middle, the best of every rotation. */
function dealCells(live: Live, cells: Box[], receivers: readonly number[], cx: number, cy: number): Int32Array {
  const n = cells.length;
  const angle = (x: number, y: number) => Math.atan2(y - cy, x - cx);
  const cellOrder = cells.map((c, k) => ({ k, a: angle(...centreOf(c)) })).sort((p, q) => p.a - q.a || p.k - q.k);
  const people = receivers.map((j) => ({ j, a: angle(...centreOf(live.box(j))) })).sort((p, q) => p.a - q.a || p.j - q.j);
  const turn = (a: number, b: number) => {
    const d = Math.abs(a - b) % (2 * Math.PI);
    return d > Math.PI ? 2 * Math.PI - d : d;
  };
  let best = 0;
  let bestCost = Infinity;
  for (let c = 0; c < n; c++) {
    let cost = 0;
    for (let r = 0; r < n && cost < bestCost; r++) cost += turn(cellOrder[(c + r) % n].a, people[r].a);
    if (cost < bestCost) {
      bestCost = cost;
      best = c;
    }
  }
  const out = new Int32Array(n);
  for (let r = 0; r < n; r++) out[cellOrder[(best + r) % n].k] = people[r].j;
  return out;
}
