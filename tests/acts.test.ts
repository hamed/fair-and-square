import { describe, expect, it } from 'vitest';
import { Session } from '../stage/console/session.ts';
import { area, union, type Box } from '../stage/core/area.ts';
import { DUR } from '../stage/core/motion.ts';
import { emptyScene, type Scene } from '../stage/acts/scene.ts';
import type { Run } from '../stage/core/transit.ts';
import { POT } from '../stage/core/transfer.ts';
import { num, type Node, type Program } from '../model/ast.ts';
import { options as o, taxOf } from '../model/presets.ts';

const fills = (sc: Scene) => sc.pieces.filter((p) => p.alpha > 0.9);

/** Frames until `done`, at most `cap` seconds. */
function until(s: Session, done: () => boolean, cap = 10): void {
  for (let t = 0; t < cap && !done(); t += 1 / 120) s.frame(1 / 120);
}

/** What `run` draws now. */
function sceneOf(s: Session, run: Run): Scene {
  const sc = emptyScene();
  run.act!.draw(s.transit.age(run), s.live, sc);
  return sc;
}

/** Frames through all of `run`, checking `each` scene. */
function through(s: Session, run: Run, each: (sc: Scene, t: number) => void): void {
  while (s.transit.runs.includes(run)) {
    s.frame(1 / 120);
    if (s.transit.runs.includes(run)) each(sceneOf(s, run), s.transit.age(run));
  }
}

describe('acts: every piece keeps its area, every move its money', () => {
  it('piece: the loser is cut into the stake and the rest, the stake keeps its area all the way, and joins the winner', () => {
    const s = new Session({ n: 12 });
    s.run('fx off; trade 400; fx on');
    until(s, () => s.still, 15);
    s.run('trade 1');
    const r = s.transit.trades[0];
    const { from, to, amount } = r.moves[0];
    expect(r.style).toBe('piece');
    const loser = s.stage.w[from] * s.stage.h[from];
    let cut = false;
    let docked = false;
    through(s, r, (sc, t) => {
      for (const p of fills(sc)) expect(area(p.box)).toBeCloseTo(amount, 9);
      if (t < DUR.pair + DUR.mark) expect(sc.looks).toContainEqual([from, to]);
      if (!cut && t > DUR.pair + DUR.mark + DUR.lift / 2) {
        cut = true;
        expect(area(sc.display.get(from)!) + area(fills(sc)[0].box)).toBeCloseTo(loser, 9);
      }
      if (fills(sc)[0]?.to === to) docked = true;
    });
    expect(cut && docked).toBe(true);
    expect(Array.from(s.shown)).toEqual(Array.from(s.game.wealth));
  });

  it('toss: both stakes come off and stay, a coin lands on the winner colour, the winner keeps its own, only the loser money moves', () => {
    const s = new Session({ n: 12 });
    s.run('fx off; trade 400; fx on');
    until(s, () => s.still, 15);
    s.run('fx trade toss; round');
    until(s, () => s.transit.trades.length > 0);
    const r = s.transit.trades[0];
    const { from, to, amount } = r.moves[0];
    expect(r.style).toBe('toss');
    const W = { x: s.stage.x[to], y: s.stage.y[to], w: s.stage.w[to], h: s.stage.h[to] };
    const decide = DUR.pair + DUR.mark + DUR.lift;
    const keep = decide + DUR.decide;
    let off: Box[] | null = null;
    let stopped = false;
    let kept = false;
    through(s, r, (sc, t) => {
      for (const p of fills(sc)) expect(area(p.box)).toBeCloseTo(amount, 9);
      if (t > decide && t < keep) {
        // the stakes have not moved since they came off
        off ??= fills(sc).map((p) => p.box);
        fills(sc).forEach((p, k) => expect(p.box).toEqual(off![k]));
        expect(sc.coins).toHaveLength(1);
        // the winner is still all it was: what is drawn of it and its own stake
        const own = fills(sc).find((p) => p.colour === to)!.box;
        expect(area(sc.display.get(to)!) + area(own)).toBeCloseTo(W.w * W.h, 9);
      }
      if (!stopped && t > keep - 0.02 && t < keep) {
        stopped = true;
        // the coin has landed, the winner's colour up
        const coin = sc.coins[0];
        expect(coin.faces[0]).toBe(to);
        expect(Math.cos(coin.flip)).toBeCloseTo(1, 6);
        expect(coin.lift).toBeCloseTo(0, 6);
      }
      if (!kept && t > keep + DUR.keep && t < keep + DUR.keep + 0.05) {
        kept = true;
        // the own stake is back: one piece left, the loser's
        expect(fills(sc).filter((p) => p.colour === to)).toHaveLength(0);
        expect(fills(sc)).toHaveLength(1);
      }
    });
    expect(stopped && kept).toBe(true);
    // only the loser's stake was ever in transit
    expect(r.moves).toHaveLength(1);
    expect(from).not.toBe(to);
  });

  it('levy: slices of what each pays, kept as cut on their way, one pile of all of it, n equal cells, a share to each', () => {
    const n = 16;
    const s = new Session({ n });
    s.run('fx off; trade 1500; fx on');
    until(s, () => s.still, 15);
    s.run('levy 0.4');
    until(s, () => !!s.transit.levy?.act, 6);
    const r = s.transit.levy!;
    const pays = r.moves.filter((m) => m.from >= 0).map((m) => m.amount);
    const share = r.moves.find((m) => m.from < 0)!.amount;
    const pot = pays.reduce((a, b) => a + b, 0);
    const tShape = DUR.brace + DUR.levyMark + DUR.levyLift;
    let bars = false;
    let whole = false;
    let cells = false;
    let longest = 0;
    let body = 0;
    for (let j = 0; j < n; j++) body = Math.max(body, s.stage.w[j], s.stage.h[j]);
    through(s, r, (sc, t) => {
      for (const p of sc.pieces) longest = Math.max(longest, p.box.w, p.box.h);
      if (!bars && t > tShape + DUR.levyShape * 0.6 && t < tShape + DUR.levyShape) {
        bars = true;
        const ps = fills(sc);
        expect(ps).toHaveLength(n);
        // each the strip it was cut as: as long as one side of its square (no reshaping before the pot)
        for (const p of ps) expect(Math.max(p.box.w, p.box.h)).toBeGreaterThan(2 * Math.min(p.box.w, p.box.h));
        const got = ps.map((p) => area(p.box)).sort((a, b) => a - b);
        const want = [...pays].sort((a, b) => a - b);
        got.forEach((a, k) => expect(a).toBeCloseTo(want[k], 9));
      }
      const blended = sc.pieces.filter((p) => p.blend);
      if (!whole && blended.length === 1 && blended[0].blend!.of.length === n) {
        whole = true;
        expect(area(blended[0].box)).toBeCloseTo(pot, 9);
        expect(blended[0].blend!.of).toHaveLength(n);
      }
      if (!cells && blended.length === n) {
        cells = true;
        for (const p of blended) expect(area(p.box)).toBeCloseTo(share, 9);
      }
    });
    expect(bars && whole && cells).toBe(true);
    // nothing longer than a body, two shares, or the pile half way to square
    expect(longest).toBeLessThanOrEqual(Math.max(body, 2 * Math.sqrt(share), Math.sqrt(2 * pot)) * 1.01);
    expect(Array.from(s.shown)).toEqual(Array.from(s.game.wealth));
  });

  it('the pile takes pieces on all four sides', () => {
    const s = new Session({ n: 24 });
    s.run('fx off; trade 3000; fx on');
    until(s, () => s.still, 15);
    s.run('levy 0.3');
    until(s, () => !!s.transit.levy?.act, 6);
    const r = s.transit.levy!;
    const sides = [0, 0, 0, 0];
    let last: Box | null = null;
    through(s, r, (sc) => {
      const pile = sc.pieces.find((p) => p.blend && p.blend.of.length > 1);
      if (pile && last && (pile.box.w !== last.w || pile.box.h !== last.h)) {
        const u = union(pile.box, last);
        if (pile.box.x < last.x - 1e-12) sides[0]++;
        else if (u.x + u.w > last.x + last.w + 1e-12) sides[1]++;
        if (pile.box.y < last.y - 1e-12) sides[2]++;
        else if (u.y + u.h > last.y + last.h + 1e-12) sides[3]++;
      }
      if (pile) last = pile.box;
    });
    for (const k of sides) expect(k).toBeGreaterThanOrEqual(2);
  });

  it('acts take as long as their beats: piece, toss, levy', () => {
    const s = new Session({ n: 12 });
    s.run('trade 1');
    const p = s.transit.trades[0].act!;
    const shared = DUR.pair + DUR.mark + DUR.lift + DUR.dock + DUR.merge;
    // the flight is 0.25–0.6 s
    expect(p.length - (shared + DUR.reshape + DUR.bar)).toBeGreaterThanOrEqual(0.25 - 1e-9);
    expect(p.length - (shared + DUR.reshape + DUR.bar)).toBeLessThanOrEqual(0.6 + 1e-9);
    until(s, () => !s.transit.busy);
    s.run('fx trade toss; round');
    until(s, () => s.transit.trades.length > 0);
    const t = s.transit.trades[0].act!;
    expect(t.length - (shared + DUR.decide + DUR.keep)).toBeGreaterThanOrEqual(0.25 - 1e-9);
    until(s, () => !s.transit.busy, 10);
    s.run('fx trade piece; levy 0.2');
    until(s, () => !!s.transit.levy?.act, 6);
    const l = s.transit.levy!.act!;
    expect(l.length).toBeGreaterThan(3);
    // half a second more since the pot squares up before it is divided (owner, 2026-10-22)
    expect(l.length).toBeLessThan(5);
  });

  it('in a log pose a piece is what the loser\'s drawn area loses, and arrives as what the winner\'s gains', () => {
    const s = new Session({ n: 12 });
    s.run('fx off; trade 600; fx on; log');
    until(s, () => s.still, 15);
    const live = s.live;
    s.run('trade 1');
    const r = s.transit.trades[0];
    const { from, to, amount } = r.moves[0];
    // as drawn before the trade (the game has moved the wealth; the stage has not)
    const dL = live.drawn(from);
    const dW = live.drawn(to);
    const M = s.measure();
    const off = M(dL) - M(dL - amount);
    const on = M(dW + amount) - M(dW);
    expect(Math.abs(off - on)).toBeGreaterThan(1e-6);
    let first = NaN;
    let last = NaN;
    let previous = NaN;
    let monotone = true;
    through(s, r, (sc) => {
      const p = fills(sc)[0];
      if (!p) return;
      const a = area(p.box);
      if (Number.isNaN(first)) first = a;
      if (!Number.isNaN(previous) && (a - previous) * (on - off) < -1e-12) monotone = false;
      previous = a;
      last = a;
    });
    expect(first).toBeCloseTo(off, 9);
    expect(last).toBeCloseTo(on, 9);
    expect(monotone).toBe(true);
  });

  it('a levy\'s pile is centred in the middle, and divides into n equal squares', () => {
    const n = 13;
    const s = new Session({ n });
    s.run('fx off; trade 1500; fx on');
    until(s, () => s.still, 15);
    s.run('levy 0.3');
    until(s, () => !!s.transit.levy?.act, 6);
    const r = s.transit.levy!;
    const { right, top } = s.live;
    let centred = false;
    let squares = false;
    through(s, r, (sc) => {
      const blended = sc.pieces.filter((p) => p.blend && p.alpha > 0.9);
      if (blended.length === 1 && blended[0].blend!.of.length === n) {
        const b = blended[0].box;
        expect(b.x + b.w / 2).toBeCloseTo(right / 2, 9);
        expect(b.y + b.h / 2).toBeCloseTo(top / 2, 9);
        centred = true;
      }
      // the split, before the squares start on their way
      if (!squares && blended.length === n) {
        const a0 = area(blended[0].box);
        for (const p of blended) {
          expect(area(p.box)).toBeCloseTo(a0, 12);
          expect(p.box.w).toBeCloseTo(p.box.h, 12);
        }
        squares = true;
      }
    });
    expect(centred && squares).toBe(true);
  });
});

describe('levies the program makes: fewer payers, fewer receivers, a burn', () => {
  /** A room of 16, unequal from the start, whose round is this tax and give (no trade). */
  const room = (tau: Node, r: Node | null): Session => {
    const program: Program = {
      ast: 1,
      scripts: [
        {
          op: 'ctl.start',
          body: [
            { op: 'setup.yard', f: { space: 'free' }, args: { n: num(16) } },
            { op: 'setup.start', args: { with: { op: 'alloc.classes', args: { q: { op: 'pct', v: 0.25 }, s: { op: 'pct', v: 0.6 } } } } },
            { op: 'ctl.forever', body: [taxOf(tau, r ?? undefined)] },
          ],
        },
      ],
    };
    const s = new Session({ program });
    until(s, () => s.still, 15);
    return s;
  };

  const play = (s: Session) => {
    s.run('round');
    until(s, () => !!s.transit.levy?.act, 6);
    const r = s.transit.levy!;
    // drawn + in transit = all the wealth, plus what this levy keeps in the pot (a burn): Σ owed − in transit
    // stays at (shares − payments) through the act
    const kept = r.moves.reduce((k, m) => k + (m.from === POT ? m.amount : 0) - (m.to === POT ? m.amount : 0), 0);
    let worst = 0;
    const counts: number[] = [];
    through(s, r, (sc) => {
      worst = Math.max(worst, Math.abs(s.transit.owed.reduce((a, b) => a + b, 0) - s.transit.inTransit - kept));
      counts.push(sc.pieces.filter((p) => p.blend && p.colour === -1).length);
    });
    until(s, () => !s.transit.busy, 6);
    return { r, worst, cells: Math.max(...counts) };
  };

  it('to the poorest quarter: four squares, each its share of the pile, nobody else touched', () => {
    const s = room(o.wealthTax(0.3), o.poorest(0.25));
    const { r, worst, cells } = play(s);
    const receivers = r.moves.filter((m) => m.from === POT);
    expect(receivers).toHaveLength(4);
    expect(cells).toBeGreaterThanOrEqual(4);
    expect(worst).toBeLessThan(1e-12);
    expect(Array.from(s.shown)).toEqual(Array.from(s.game.wealth));
  });

  it('a lottery: one square, the whole pile', () => {
    const s = room(o.flatTax(0.05), o.lottery());
    const { r, worst } = play(s);
    expect(r.moves.filter((m) => m.from === POT)).toHaveLength(1);
    expect(worst).toBeLessThan(1e-12);
    expect(Array.from(s.shown)).toEqual(Array.from(s.game.wealth));
  });

  it('a tax from the richest only, and a burn (no give): payers only, the pile fades, nothing lost from the books', () => {
    const richest = room({ op: 'take.wealth', args: { rate: { op: 'pct', v: 0.2 }, from: { op: 'group.richest', args: { q: { op: 'pct', v: 0.25 } } } } }, null);
    const { r, worst } = play(richest);
    expect(r.moves.filter((m) => m.to === POT)).toHaveLength(4);
    expect(r.moves.filter((m) => m.from === POT)).toHaveLength(0);
    expect(worst).toBeLessThan(1e-12);
    expect(Array.from(richest.shown)).toEqual(Array.from(richest.game.wealth));
    expect(richest.game.wealth.reduce((a, b) => a + b, 0)).toBeLessThan(1);
  });
});

describe('owner, 2026-10-22: trades between bars (the CCDF)', () => {
  it('the slice comes off the loser’s right end and joins the winner’s right end, their height kept', async () => {
    const { pieceAct } = await import('../stage/acts/piece.ts');
    const boxes: Box[] = [
      { x: 0.5, y: 0.5, w: 0.8, h: 0.1 },
      { x: 0.5, y: 0.6, w: 0.4, h: 0.1 },
    ];
    const live = { n: 2, box: (i: number) => boxes[i], right: 2, top: 2, drawn: (i: number) => boxes[i].w * boxes[i].h, measure: (w: number) => w };
    const act = pieceAct(live, [{ from: 0, to: 1, amount: 0.01 }], { bend: 0, bars: true });
    // as it is cut: the slice at the loser's right end, as tall as the bar
    const cut = emptyScene();
    act.draw(DUR.pair + DUR.mark + DUR.lift * 0.5, live, cut);
    const slice = cut.pieces[0].box;
    expect(slice.h).toBeCloseTo(0.1, 12);
    expect(slice.x).toBeGreaterThan(0.5 + 0.8 - 0.1 - 1e-9);
    // as it docks: on the winner's right end, as tall as its bar
    let docked: Box | null = null;
    for (let t = 0; t < act.length; t += 0.01) {
      const sc = emptyScene();
      act.draw(t, live, sc);
      const p = sc.pieces[0]?.box;
      if (p && Math.abs(p.h - 0.1) < 1e-9 && p.y > 0.55) docked = p;
    }
    expect(docked).not.toBeNull();
    expect(docked!.x).toBeGreaterThan(0.5 + 0.4 - 1e-9);
  });
});
