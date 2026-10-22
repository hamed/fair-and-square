/**
 * Regressions for REVIEW-2026-10-18.md and its recheck, one per finding,
 * each from the review's own reproduction.
 */
import { describe, expect, it } from 'vitest';
import { Session } from '../stage/console/session.ts';
import { area } from '../stage/core/area.ts';
import { compile } from '../stage/core/figure.ts';
import { parseRecipe } from '../stage/core/recipe.ts';
import { areaOf } from '../stage/core/shapes.ts';
import { Stage } from '../stage/core/stage.ts';
import { emptyScene, type Scene } from '../stage/acts/scene.ts';

/** Everything drawn: each body (as the scene overrides it, or its own shape) and every solid piece. */
function drawnArea(s: Session, scene: Scene): number {
  const st = s.stage;
  let total = 0;
  for (let i = 0; i < st.n; i++) {
    const d = scene.display.get(i);
    total += d ? area(d) : areaOf(st.kind[i], st.w[i], st.h[i]);
  }
  for (const p of scene.pieces) if (p.alpha > 0.9) total += area(p.box);
  return total;
}

function frames(s: Session, seconds: number, each?: (scene: Scene) => void): void {
  for (let f = 0; f < seconds * 120; f++) {
    s.frame(1 / 120);
    const scene = emptyScene();
    s.transit.draw(s.live, scene);
    each?.(scene);
  }
}

describe('review 2026-10-18', () => {
  it('1: a cut never draws area that is not wealth: rectangles are cut, triangles and hexagons trade at once', () => {
    for (const shape of ['', 'bar 0.2', 'tri', 'hex']) {
      const s = new Session({ n: 2, seed: 1 });
      s.run(`${shape}; finish; trade 1`);
      if (shape === 'tri' || shape === 'hex') {
        // no slice of a bounding box: shown at once
        expect(s.transit.busy).toBe(false);
        continue;
      }
      expect(s.transit.busy).toBe(true);
      let worst = 0;
      frames(s, 0.5, (scene) => (worst = Math.max(worst, Math.abs(drawnArea(s, scene) - 1))));
      expect(worst).toBeLessThan(0.02);
    }
  });

  it('2: trades that share a person take turns: never two cuts of one body at once, nothing drawn twice', () => {
    const s = new Session({ n: 2, seed: 1 });
    s.run('play 10');
    let worst = 0;
    let shown = 0;
    frames(s, 6, (scene) => {
      const started = s.transit.trades.filter((r) => r.act);
      expect(started.length).toBeLessThanOrEqual(1);
      if (started.length) shown++;
      worst = Math.max(worst, drawnArea(s, scene) - 1);
    });
    expect(shown).toBeGreaterThan(0);
    expect(worst).toBeLessThan(0.02);
  });

  it('3: a free room of bodies wider than the yard opens its walls, at once and as a change of pose', () => {
    const wealth = Float64Array.of(0.1, 0.2, 0.3, 0.4);
    const figure = compile(parseRecipe('bar 0.01 free'), wealth);
    for (let i = 0; i < 4; i++) {
      expect(figure.x[i] + figure.w[i]).toBeLessThanOrEqual(figure.right + 1e-12);
      expect(figure.y[i] + figure.h[i]).toBeLessThanOrEqual(figure.top + 1e-12);
    }
    const stage = new Stage(figure, wealth);
    expect(stage.overlaps().outside).toBe(0);
    const equal = Float64Array.of(0.25, 0.25, 0.25, 0.25);
    const moving = new Stage(compile(parseRecipe(''), equal), equal);
    moving.apply(figure, wealth);
    for (let t = 0; t < 20 && !moving.done; t += 1 / 60) moving.step(1 / 60);
    expect(moving.done).toBe(true);
    expect(moving.overlaps().outside).toBe(0);
  });

  it('4: a share link gives back the proportions too: equalize, scales, and played trades', () => {
    for (const line of ['fx off; trade 20; equalize', 'fx off; log; trade 20; wealth', 'fx off; trade 9; equalize; squared; trade 7']) {
      const s = new Session({ n: 4 });
      s.run(line);
      const restored = Session.load(s.share());
      for (let i = 0; i < 4; i++) expect(restored.aspect[i]).toBeCloseTo(s.aspect[i], 12);
    }
    // played, in a log room: the same shapes once everything has landed
    const s = new Session({ n: 6 });
    s.run('log; play');
    frames(s, 6);
    s.run('pause');
    for (let f = 0; f < 600 && s.transit.busy; f++) s.frame(1 / 60);
    expect(s.transit.busy).toBe(false);
    const restored = Session.load(s.share());
    for (let i = 0; i < 6; i++) expect(restored.aspect[i]).toBeCloseTo(s.aspect[i], 12);
  });

  it('5: reset drops a round still waiting for its partners', () => {
    const s = new Session({ n: 4 });
    s.run('fx trade toss; round; reset');
    expect(s.queued).toBe(0);
    for (let f = 0; f < 600; f++) s.frame(1 / 60);
    expect(s.game.trades).toBe(0);
    expect(s.game.run.round).toBe(0);
    expect(s.playing).toBe(false);
  });

  it('6: `until done` waits for a round still to be played', () => {
    const s = new Session({ n: 4 });
    s.run('fx trade toss; round; until done; say done');
    s.frame(1 / 60);
    expect(s.caption).toBe('');
    for (let f = 0; f < 60 * 15 && s.script; f++) s.frame(1 / 60);
    expect(s.caption).toBe('done');
    expect(s.game.trades).toBe(2);
    expect(s.transit.busy).toBe(false);
  });

  it('7: playback keeps to the rate asked for, in every mode', () => {
    for (const mode of ['', 'fx trade toss', 'fx sync on']) {
      const zero = new Session({ n: 4 });
      zero.run(`${mode}; play 0`);
      for (let f = 0; f < 120; f++) zero.frame(1 / 60);
      expect(zero.game.trades).toBe(0);
      // two trades a second for five seconds: ten, give or take the last round
      const slow = new Session({ n: 4 });
      slow.run(`${mode}; play 2`);
      for (let f = 0; f < 300; f++) slow.frame(1 / 60);
      expect(slow.game.trades).toBeLessThanOrEqual(12);
    }
  });

  it('8: a long run\'s link loads (it stores the step reached, not the commands)', () => {
    const s = new Session({ n: 20 });
    s.run('fx off; rule beta 0; round 100000; round 1');
    expect(s.game.run.round).toBe(100001);
    const t = Session.load(s.share());
    expect(t.game.run.round).toBe(100001);
    expect(Array.from(t.game.wealth)).toEqual(Array.from(s.game.wealth));
  });

  it('9: a link tells the default play rate from an explicit one', () => {
    for (const [line, rate] of [
      ['play', null],
      ['play 1', 1],
      ['play 0', 0],
      ['play 7.5', 7.5],
    ] as const) {
      const s = new Session({ n: 4 });
      s.run(`fx off; ${line}`);
      const restored = Session.load(s.share());
      expect(restored.playing).toBe(true);
      expect(restored.rate).toBe(rate);
    }
  });

  it('10: a body pushed by the hand shoves a small one along instead of passing through it', () => {
    const wealth = Float64Array.of(1e-6, 1e-6, 0.999998);
    const stage = new Stage(compile(parseRecipe('still'), wealth), wealth);
    // the two small ones side by side, clear of the big one
    for (const [i, cx] of [
      [0, 0.1],
      [1, 0.11],
    ] as const) {
      stage.x[i] = cx - stage.w[i] / 2;
      stage.y[i] = 1.5 - stage.h[i] / 2;
    }
    expect(stage.grab(0)).toBe(true);
    stage.drag(0.13, 1.5);
    stage.step(1 / 120);
    // the second is still ahead of the first: shoved, not passed
    expect(stage.x[1]).toBeGreaterThanOrEqual(stage.x[0] + stage.w[0] - 1e-9);
    expect(stage.air[0] + stage.air[1]).toBe(0);
  });
});

describe('review 2026-10-18, recheck', () => {
  const total = (s: Session) => [...s.shown].reduce((a, b) => a + b, 0) + s.transit.inTransit;
  const sameShapes = (s: Session) => {
    const restored = Session.load(s.share());
    for (let i = 0; i < s.game.n; i++) expect(restored.aspect[i]).toBeCloseTo(s.aspect[i], 12);
  };
  const drain = (s: Session) => {
    for (let f = 0; f < 1200 && s.transit.busy; f++) s.frame(1 / 60);
    expect(s.transit.busy).toBe(false);
  };

  it('R1: a change made at once never spends money a showing trade still owes: all drawn stays all there is', () => {
    for (const line of ['trade 1; give 0 1 .6', 'trade 1; fx trade off; trade 100', 'trade 1; trade 50; give 1 0 .9']) {
      const s = new Session({ n: 2, seed: 1 });
      s.run(line);
      expect(total(s)).toBeCloseTo(1, 12);
      for (let f = 0; f < 120; f++) {
        s.frame(1 / 60);
        expect(total(s)).toBeCloseTo(1, 12);
      }
    }
  });

  it('R2: turning into triangles or hexagons lands what is showing: nothing drawn twice', () => {
    for (const shape of ['tri', 'hex']) {
      const s = new Session({ n: 2, seed: 1 });
      s.run(`trade 1; ${shape}; finish`);
      expect(s.transit.busy).toBe(false);
      let worst = 0;
      frames(s, 3, (scene) => (worst = Math.max(worst, Math.abs(drawnArea(s, scene) - 1))));
      expect(worst).toBeLessThan(0.02);
    }
  });

  it('R3: shapes land in the order the money moved, and are not lost when effects go off', () => {
    for (const line of ['trade 1; trade 20', 'trade 1; give 0 1 .1', 'trade 2; equalize; trade 3']) {
      const s = new Session({ n: 4 });
      s.run(line);
      drain(s);
      sameShapes(s);
    }
    for (const line of ['trade 1; fx off', 'trade 1; fx off; trade 5']) {
      const s = new Session({ n: 4 });
      s.run(line);
      for (let f = 0; f < 10; f++) s.frame(1 / 60);
      sameShapes(s);
    }
    // interrupted between its money coming off and going on
    const s = new Session({ n: 4 });
    s.run('trade 1');
    for (let f = 0; f < 50; f++) s.frame(1 / 60);
    s.run('trade 30');
    drain(s);
    sameShapes(s);
  });

  it('R4: a round asked for still happens when its partners can no longer meet, and `until done` ends', () => {
    for (const change of ['ccdf', 'tri', 'fx trade piece']) {
      const s = new Session({ n: 4 });
      s.run(`fx trade toss; round; ${change}; until done; say done`);
      for (let f = 0; f < 60 * 20 && s.script; f++) s.frame(1 / 60);
      expect(s.caption).toBe('done');
      expect(s.game.trades).toBe(2);
      expect(s.queued).toBe(0);
    }
  });

  it('R5: a pushed body shoves the next one in its own way along too: a chain, nothing passed through', () => {
    const wealth = Float64Array.of(1e-6, 1e-4, 1e-6, 0.999898);
    const stage = new Stage(compile(parseRecipe('still'), wealth), wealth);
    for (const [i, cx, cy] of [
      [0, 0.1, 1.5],
      [1, 0.12, 1.5],
      [2, 0.14, 1.503],
    ] as const) {
      stage.x[i] = cx - stage.w[i] / 2;
      stage.y[i] = cy - stage.h[i] / 2;
    }
    expect(stage.grab(0)).toBe(true);
    stage.drag(0.18, 1.5);
    stage.step(1 / 120);
    // in order along the push: 0, then 1, then 2 (which overlaps 1's height)
    expect(stage.x[1]).toBeGreaterThanOrEqual(stage.x[0] + stage.w[0] - 1e-9);
    expect(stage.x[2]).toBeGreaterThanOrEqual(stage.x[1] + stage.w[1] - 1e-9);
    expect(stage.air[0] + stage.air[1] + stage.air[2]).toBe(0);
  });
});
