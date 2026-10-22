import { describe, expect, it } from 'vitest';
import { compile, YARD } from '../stage/core/figure.ts';
import { Game } from '../stage/core/game.ts';
import { PRESETS, parseRecipe } from '../stage/core/recipe.ts';
import { Stage } from '../stage/core/stage.ts';

function setup(n = 36, trades = 3000, recipe = '') {
  const game = new Game(n, 4);
  game.trade(trades);
  const stage = new Stage(compile(parseRecipe(recipe), game.wealth), game.wealth, 4);
  return { game, stage };
}

function run(stage: Stage, seconds: number, each?: () => void): void {
  for (let f = 0; f < seconds * 60; f++) {
    stage.step(1 / 60);
    each?.();
  }
}

const lawful = (s: Stage) => {
  const o = s.overlaps();
  return o.pairs === 0 && o.outside === 0;
};

describe('the law: bodies on the ground never overlap and never leave the walls', () => {
  for (const room of ['free', 'wander']) {
    it(`holds every frame while wealth changes in the room (${room})`, () => {
      const { game, stage } = setup(60, 0);
      stage.apply(compile(parseRecipe(room), game.wealth), game.wealth);
      let broken = 0;
      run(stage, 8, () => {
        game.trade(60);
        stage.apply(compile(parseRecipe(room), game.wealth), game.wealth, true);
        if (!lawful(stage)) broken++;
      });
      expect(broken).toBe(0);
      expect(stage.violations).toBe(0);
    });
  }

  it('holds through every preset, back to the room each time', () => {
    const { game, stage } = setup(48, 4000);
    let broken = 0;
    for (const text of [...Object.values(PRESETS), '', 'tri hex', 'log ccdf'.replace('ccdf', PRESETS.ccdf)]) {
      stage.apply(compile(parseRecipe(text), game.wealth), game.wealth);
      run(stage, 3, () => {
        if (!lawful(stage)) broken++;
      });
    }
    expect(broken).toBe(0);
  });
});

describe('the room', () => {
  const fastest = (s: Stage) => {
    let m = 0;
    for (let i = 0; i < s.n; i++) m = Math.max(m, Math.hypot(s.vx[i], s.vy[i]));
    return m;
  };

  it('starts at rest, spread across the yard', () => {
    const { stage } = setup(36, 0);
    run(stage, 0.5);
    expect(fastest(stage)).toBeLessThan(0.02);
  });

  it('after wealth changes, spreads out and comes to rest: no fidgeting', () => {
    const { game, stage } = setup(36, 0);
    game.trade(3000);
    stage.apply(compile(parseRecipe(''), game.wealth), game.wealth, true);
    run(stage, 6);
    let moving = 0;
    run(stage, 3, () => {
      if (fastest(stage) > 0.005) moving++;
    });
    expect(moving).toBe(0);
    // spread: centres reach across most of the yard, and everyone has their full size
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < stage.n; i++) {
      const c = stage.x[i] + stage.w[i] / 2;
      lo = Math.min(lo, c);
      hi = Math.max(hi, c);
      expect(stage.density(i)).toBeCloseTo(1, 6);
    }
    expect(hi - lo).toBeGreaterThan(0.7 * YARD);
    expect(lawful(stage)).toBe(true);
  });

  it('a pose undone spreads back out and rests, walls home', () => {
    const { game, stage } = setup(36, 3000);
    stage.apply(compile(parseRecipe(PRESETS.ccdf), game.wealth), game.wealth);
    stage.finish();
    stage.apply(compile(parseRecipe(''), game.wealth), game.wealth);
    run(stage, 10);
    expect(fastest(stage)).toBeLessThan(0.005);
    expect(stage.walls.right).toBe(YARD);
  });
});

describe('poses', () => {
  it('bodies walk most of the way themselves, then land exactly on the figure', () => {
    const { game, stage } = setup(36, 3000);
    const fig = compile(parseRecipe(PRESETS.ccdf), game.wealth);
    stage.apply(fig, game.wealth);
    const dist = () => {
      let d = 0;
      for (let i = 0; i < stage.n; i++) d += Math.hypot(stage.x[i] - fig.x[i], stage.y[i] - fig.y[i]);
      return d / stage.n;
    };
    const start = dist();
    run(stage, 1.5);
    // no freeze-then-teleport: by 1.5 s the crowd has covered over a third of the way
    expect(dist()).toBeLessThan(0.66 * start);
    let t = 0;
    while (!stage.done && t < 20) {
      run(stage, 0.5);
      t += 0.5;
    }
    expect(stage.done).toBe(true);
    for (let i = 0; i < stage.n; i++) {
      expect(stage.x[i]).toBe(fig.x[i]);
      expect(stage.y[i]).toBe(fig.y[i]);
      expect(stage.w[i]).toBe(fig.w[i]);
      expect(stage.h[i]).toBe(fig.h[i]);
    }
  });

  it('a live chart stays formed while wealth changes, and is exact once it stops', () => {
    const { game, stage } = setup(36, 3000);
    const recipe = parseRecipe(PRESETS.ccdf);
    stage.apply(compile(recipe, game.wealth), game.wealth);
    stage.finish();
    let broken = 0;
    let worst = 0;
    let frame = 0;
    // a round a second, recompiled 20 times a second, as the session plays it
    run(stage, 6, () => {
      if (++frame % 3 === 0) {
        game.trade(2);
        stage.apply(compile(recipe, game.wealth), game.wealth, true);
      }
      if (!lawful(stage)) broken++;
      let away = 0;
      for (let i = 0; i < stage.n; i++) if (!stage.settled[i] && !stage.glide[i]) away++;
      worst = Math.max(worst, away);
    });
    expect(broken).toBe(0);
    expect(worst).toBeLessThanOrEqual(3);
    run(stage, 3);
    expect(stage.done).toBe(true);
    const fig = compile(recipe, game.wealth);
    for (let i = 0; i < stage.n; i++) {
      expect(stage.x[i]).toBe(fig.x[i]);
      expect(stage.y[i]).toBe(fig.y[i]);
      expect(stage.w[i]).toBe(fig.w[i]);
    }
  });

  it('finish() commits the figure at once, and it is lawful', () => {
    const { game, stage } = setup(80, 8000);
    stage.apply(compile(parseRecipe(PRESETS.neff), game.wealth), game.wealth);
    stage.finish();
    expect(stage.done).toBe(true);
    expect(lawful(stage)).toBe(true);
  });

  it('back in the room, the walls close to the yard again', () => {
    const { game, stage } = setup(30, 30 * 300);
    stage.apply(compile(parseRecipe('bar desc stack'), game.wealth), game.wealth);
    stage.finish();
    expect(stage.walls.right).toBeGreaterThan(YARD);
    stage.apply(compile(parseRecipe(''), game.wealth), game.wealth);
    run(stage, 30);
    expect(stage.walls.right).toBe(YARD);
    expect(lawful(stage)).toBe(true);
  });

  it('a jam stops the bodies in it, not the room', () => {
    const { game, stage } = setup(36, 0);
    stage.apply(compile(parseRecipe('wander'), game.wealth), game.wealth);
    // shove one body hard into the bottom-left corner, through whoever is there
    stage.grab(20);
    stage.drag(-5, -5);
    const start = Float64Array.from(stage.x);
    const startY = Float64Array.from(stage.y);
    const before = stage.reverts;
    run(stage, 3);
    expect(stage.reverts).toBeGreaterThan(before);
    let moved = 0;
    for (let i = 0; i < stage.n; i++) if (Math.hypot(stage.x[i] - start[i], stage.y[i] - startY[i]) > 0.02) moved++;
    expect(moved).toBeGreaterThan(stage.n / 2);
    expect(lawful(stage)).toBe(true);
    stage.release();
  });
});

describe('hands', () => {
  it('a dragged body pushes the crowd, or stops; it never passes through', () => {
    const { stage } = setup(36, 0);
    const i = 0;
    expect(stage.grab(i)).toBe(true);
    let broken = 0;
    // drag along the bottom row to the far wall and into the corner
    for (const [x, y] of [
      [1.9, 0.1],
      [1.9, 1.9],
      [0.1, 1.9],
    ]) {
      stage.drag(x, y);
      run(stage, 2, () => {
        if (!lawful(stage)) broken++;
      });
    }
    stage.release();
    expect(broken).toBe(0);
    expect(stage.dragged).toBe(-1);
  });

  it('pick finds what is drawn: the polygon, lifted if in the air', () => {
    const { game, stage } = setup(16, 0, 'tri');
    stage.apply(compile(parseRecipe('tri'), game.wealth), game.wealth);
    run(stage, 0.5);
    for (let i = 0; i < stage.n; i++) {
      if (stage.air[i] > 0) continue;
      const cx = stage.x[i] + stage.w[i] / 2;
      expect(stage.pick(cx, stage.y[i] + stage.h[i] / 3)).toBe(i);
      // the triangle's upper corners are empty
      const corner = stage.pick(stage.x[i] + stage.w[i] * 0.02, stage.y[i] + stage.h[i] * 0.98);
      expect(corner).not.toBe(i);
    }
  });
});

describe('speed', () => {
  it('a thousand bodies step in a few milliseconds', () => {
    const { game, stage } = setup(1000, 0);
    run(stage, 0.5);
    const t0 = performance.now();
    run(stage, 0.5);
    const perFrame = (performance.now() - t0) / 30;
    expect(perFrame).toBeLessThan(25);
    stage.apply(compile(parseRecipe(PRESETS.ccdf), game.wealth), game.wealth);
    run(stage, 1);
    expect(lawful(stage)).toBe(true);
  });
});
