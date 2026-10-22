import { describe, expect, it } from 'vitest';
import { Session } from '../stage/console/session.ts';
import { compile } from '../stage/core/figure.ts';
import { Game } from '../stage/core/game.ts';
import { parseRecipe } from '../stage/core/recipe.ts';
import { Stage } from '../stage/core/stage.ts';

const sum = (a: ArrayLike<number>) => Array.from(a).reduce((x, y) => x + y, 0);

function run(s: Session, seconds: number, each?: () => void): void {
  for (let f = 0; f < seconds * 60; f++) {
    s.frame(1 / 60);
    each?.();
  }
}

describe('money in transit', () => {
  it('what the stage owes is exactly the money on its way, at every frame of play', () => {
    const s = new Session({ n: 30 });
    s.run('rule tax 0.05; play 120');
    let worst = 0;
    let flew = 0;
    let levies = 0;
    run(s, 12, () => {
      flew = Math.max(flew, s.transit.trades.length);
      if (s.transit.levy) levies++;
      worst = Math.max(worst, Math.abs(sum(s.transit.owed) - s.transit.inTransit));
    });
    expect(worst).toBeLessThan(1e-12);
    expect(flew).toBeGreaterThan(0);
    expect(levies).toBeGreaterThan(0);
    const o = s.stage.overlaps();
    expect(o.pairs + o.outside).toBe(0);
  });

  it('a levy, everyone together, through the pot: drawn as before until the cut, without it after, all taken in at the end; trading waits', () => {
    const s = new Session({ n: 25 });
    s.run('fx off; trade 2000; fx on');
    const before = s.game.wealth.slice();
    s.run('play; levy 0.5');
    const run0 = s.transit.levy!;
    // until it starts (it may wait for the room to clear the pot's spot), and until the cut: as before
    s.frame(1 / 60);
    for (let j = 0; j < 25; j++) expect(s.shown[j]).toBeCloseTo(before[j], 14);
    const trades = s.game.trades;
    let braced = false;
    let atCut: number[] | null = null;
    for (let t = 0; t < 20 && s.transit.levy; t += 1 / 60) {
      s.frame(1 / 60);
      if (s.transit.events.some((e) => e.kind === 'brace')) braced = true;
      const r = s.transit.levy;
      if (r?.act && !atCut && s.transit.age(r) > r.act.times[0].off + 0.05) atCut = Array.from(s.shown);
    }
    expect(braced).toBe(true);
    // once the slices are off: each drawn without the half it paid
    for (let j = 0; j < 25; j++) expect(atCut![j]).toBeCloseTo(before[j] * 0.5, 14);
    expect(s.game.trades).toBe(trades);
    expect(run0.moves.length).toBe(50);
    expect(Array.from(s.shown)).toEqual(Array.from(s.game.wealth));
  });

  it("a round's levy waits for the round's trades to land", () => {
    const s = new Session({ n: 10 });
    s.run('rule tax 0.1; round');
    expect(s.transit.trades.length).toBe(5);
    expect(s.transit.levy?.act).toBeNull();
    for (let t = 0; t < 4 && s.transit.trades.length; t += 1 / 60) s.frame(1 / 60);
    s.frame(1 / 60);
    expect(s.transit.levy?.act).not.toBeNull();
  });

  it('synchronous trades go in rounds: every piece of a round on one clock', () => {
    const s = new Session({ n: 30 });
    s.run('fx sync on; play');
    // the first round as soon as the rate allows it (N trades a second: a round in half a second)
    for (let f = 0; f < 60 && s.transit.trades.length === 0; f++) s.frame(1 / 60);
    const round = s.transit.trades.map((r) => s.transit.age(r));
    // pairing by rounds: everyone paired off, 15 pairs
    expect(round.length).toBe(15);
    expect(new Set(round).size).toBe(1);
    const trades = s.game.trades;
    run(s, 0.5);
    expect(s.game.trades).toBe(trades);
    run(s, 3.5);
    expect(s.game.trades).toBeGreaterThan(trades);
  });

  it('fx off: trades and levies happen at once', () => {
    const s = new Session({ n: 20 });
    s.run('fx off; trade 5; levy 0.2');
    expect(s.transit.busy).toBe(false);
    expect(Array.from(s.shown)).toEqual(Array.from(s.game.wealth));
    expect(s.run('fx trade piece')).toBe('fx trade piece, tax off, sync off');
  });
});

describe('hands and rooms', () => {
  it('lift: carried over the crowd, dropped where there is room, else back where it came from', () => {
    const game = new Game(16, 2);
    const stage = new Stage(compile(parseRecipe('still'), game.wealth), game.wealth, 2);
    const step = (k: number) => {
      for (let f = 0; f < k; f++) stage.step(1 / 60);
    };
    const home = [stage.x[0], stage.y[0]];
    expect(stage.grab(0, true)).toBe(true);
    expect(stage.air[0]).toBeGreaterThan(0);
    // over someone else: dropped there, it goes back
    stage.drag(stage.x[5] + stage.w[5] / 2, stage.y[5] + stage.h[5] / 2);
    step(10);
    stage.release();
    step(90);
    expect(stage.air[0]).toBe(0);
    expect(Math.hypot(stage.x[0] - home[0], stage.y[0] - home[1])).toBeLessThan(0.05);
    // into the empty top of the yard: it stays there
    stage.grab(0, true);
    stage.drag(1.0, 1.97 - stage.h[0] / 2);
    step(10);
    stage.release();
    step(60);
    expect(stage.air[0]).toBe(0);
    expect(Math.abs(stage.y[0] + stage.h[0] / 2 - (1.97 - stage.h[0] / 2))).toBeLessThan(0.05);
    const o = stage.overlaps();
    expect(o.pairs + o.outside).toBe(0);
  });

  it('still: nobody moves by themselves', () => {
    const game = new Game(30, 3);
    game.trade(3000);
    const stage = new Stage(compile(parseRecipe(''), game.wealth), game.wealth, 3);
    stage.apply(compile(parseRecipe('still'), game.wealth), game.wealth);
    const x = stage.x.slice();
    for (let f = 0; f < 120; f++) stage.step(1 / 60);
    let moved = 0;
    for (let i = 0; i < 30; i++) moved = Math.max(moved, Math.abs(stage.x[i] + stage.w[i] / 2 - (x[i] + stage.w[i] / 2)));
    expect(moved).toBeLessThan(1e-9);
  });

  it('commands for zoom and drag check their words', () => {
    const s = new Session({ n: 10 });
    expect(s.run('zoom chart')).toBe('zoom chart');
    expect(s.run('drag lift')).toBe('drag lift');
    expect(s.run('drag fly')).toMatch(/^error:/);
    expect(s.run('zoom far')).toMatch(/^error:/);
    expect(Session.load(s.share()).zoom).toBe('chart');
  });
});
