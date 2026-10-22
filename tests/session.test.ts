import { describe, expect, it } from 'vitest';
import { Session } from '../stage/console/session.ts';
import { formatRecipe } from '../stage/core/recipe.ts';

describe('console', () => {
  it('runs commands, presets and bare pose words', () => {
    const s = new Session({ n: 20 });
    expect(s.run('trade 500')).toMatch(/500 trades/);
    expect(s.run('ccdf')).toBe('pose: logarea bar desc stack');
    expect(s.run('wealth')).toBe('pose: bar desc stack');
    expect(s.run('log')).toBe('pose: log bar desc stack');
    expect(s.run('room')).toBe('pose: room');
    expect(s.run('log ccdf')).toBe('pose: logarea bar desc stack');
    expect(s.run('sort asc; reshape col; arrange row')).toContain('pose: logarea col asc row');
    expect(s.run('stats')).toMatch(/gini/);
    expect(s.run('help')).toMatch(/commands:/);
  });

  it('is atomic: a failing command changes nothing', () => {
    const s = new Session({ n: 20 });
    s.run('trade 300; neff');
    const before = { w: Array.from(s.game.wealth), pose: formatRecipe(s.recipe), inputs: s.game.run.inputs.length, game: s.game, stage: s.stage };
    for (const bad of ['trade -3', 'trade 1e99', 'give 0 99 0.1', 'n 1', 'n 99999', 'stak', 'bar 0', 'gap -1', 'look nope', 'rule beta 1', 'constructor', 'toString', 'preset nope', 'speed 9']) {
      expect(s.run(bad), bad).toMatch(/^error:/);
    }
    expect(Array.from(s.game.wealth)).toEqual(before.w);
    expect(formatRecipe(s.recipe)).toBe(before.pose);
    expect(s.game.run.inputs.length).toBe(before.inputs);
    expect(s.game).toBe(before.game);
    expect(s.stage).toBe(before.stage);
  });

  it('a share link reproduces the state to the bit', () => {
    const s = new Session({ n: 24, seed: 11 });
    s.run('trade 1000; give 3 5 0.01; levy 0.1; trade 700; rule tax 0.02; trade 240; quartiles fold; look dots; ask who has the most?');
    for (let f = 0; f < 30; f++) s.frame(1 / 60);
    const link = s.share();
    const t = Session.load(link);
    expect(Array.from(t.game.wealth)).toEqual(Array.from(s.game.wealth));
    expect(formatRecipe(t.recipe)).toBe(formatRecipe(s.recipe));
    expect(t.game.rules).toEqual(s.game.rules);
    expect(t.look).toBe('dots');
    expect(t.question).toBe('who has the most?');
    // an embed opens on the finished pose
    expect(t.stage.done).toBe(true);
    expect(t.share()).toBe(link);
  });

  it('played rounds replay from the step reached; no input needed', () => {
    const s = new Session({ n: 16 });
    s.run('fx off; play 600');
    for (let f = 0; f < 60; f++) s.frame(1 / 60);
    s.run('pause');
    expect(s.game.run.inputs).toHaveLength(0);
    expect(s.game.trades).toBeGreaterThan(500);
    const t = Session.load(s.share());
    expect(Array.from(t.game.wealth)).toEqual(Array.from(s.game.wealth));
  });

  it('links: old ones are refused, malformed ones throw', () => {
    expect(() => Session.load('#n=10&do=n%202')).toThrow(/old link/);
    expect(() => Session.load(`#n=10&in=${encodeURIComponent('[[1,{"kind":"trades","k":-1}]]')}`)).toThrow(/whole number/);
    expect(() => Session.load(`#n=10&in=${encodeURIComponent('[[1,{"kind":"levy","rate":2}]]')}`)).toThrow(/levy/);
    expect(() => Session.load('#n=abc')).toThrow();
    expect(() => Session.load('#pose=stak')).toThrow();
  });

  it('n and seed rebuild the room; reset forgets the inputs', () => {
    const s = new Session({ n: 10 });
    s.run('trade 100');
    s.run('n 50');
    expect(s.game.n).toBe(50);
    expect(s.stage.n).toBe(50);
    expect(s.game.run.inputs).toEqual([]);
    s.run('trade 100; reset');
    expect(s.game.run.inputs).toEqual([]);
    expect(s.game.wealth.every((w) => w === 1 / 50)).toBe(true);
  });

  it('runs scripts: typed lines with wait and until done, built-ins, stop', () => {
    const s = new Session({ n: 20 });
    expect(s.run('trade 500; ccdf; until done; wait 1; say ready; neff')).toBe('script started');
    expect(formatRecipe(s.recipe)).toBe('logarea bar desc stack');
    let t = 0;
    while (s.script && t < 30) {
      s.frame(1 / 60);
      t += 1 / 60;
    }
    expect(s.script).toBeNull();
    expect(formatRecipe(s.recipe)).toBe('squared fold prints');
    expect(s.caption).toBe('ready');

    s.run('run tour');
    expect(s.script?.name).toBe('tour');
    s.run('stop');
    expect(s.script).toBeNull();
    expect(s.run('run nope')).toMatch(/^error:/);
  });

  it('the tour runs to its end without errors', () => {
    const s = new Session({ n: 36 });
    s.run('run tour');
    let t = 0;
    while (s.script && t < 120) {
      s.frame(1 / 60);
      t += 1 / 60;
    }
    expect(s.script).toBeNull();
    expect(s.log.filter((l) => l.startsWith('error'))).toEqual([]);
    expect(s.caption).toBe('');
  });

  it('the demo runs to its end without errors, in a few minutes', () => {
    const s = new Session({ n: 36 });
    s.run('demo');
    let t = 0;
    while (s.script && t < 400) {
      s.frame(1 / 30);
      t += 1 / 30;
    }
    expect(s.script).toBeNull();
    expect(s.log.filter((l) => l.startsWith('error'))).toEqual([]);
    expect(s.caption).toBe('');
    expect(t).toBeLessThan(240);
    expect(s.game.n).toBe(200);
    console.log(`demo: ${t.toFixed(0)} s`);
  });

  it('a failing line stops its script', () => {
    const s = new Session({ n: 10 });
    s.run('wait 0; stak; ccdf');
    for (let f = 0; f < 10; f++) s.frame(1 / 60);
    expect(s.script).toBeNull();
    expect(formatRecipe(s.recipe)).toBe('');
  });

  it('a link can carry a script', () => {
    const s = Session.load('#n=12&script=ccdf%3Buntil%20done%3Bsay%20hi');
    let t = 0;
    while (s.script && t < 30) {
      s.frame(1 / 60);
      t += 1 / 60;
    }
    expect(s.caption).toBe('hi');
    expect(() => Session.load('#run=nope')).toThrow();
  });

  it('help fits the console, however narrow', () => {
    const s = new Session({ n: 4 });
    for (const columns of [120, 60, 40, 28]) {
      s.columns = columns;
      for (const line of s.run('help').split('\n')) expect(line.length).toBeLessThan(columns);
    }
  });

  it('toss mode: partners walk up to each other, face to face, then the same round is played', () => {
    const plain = new Session({ n: 10, seed: 4 });
    plain.run('fx off; round 1');
    const s = new Session({ n: 10, seed: 4 });
    expect(s.run('fx trade toss')).toMatch(/fx trade toss/);
    expect(s.run('round')).toMatch(/partners meeting/);
    expect(s.game.run.round).toBe(0);
    const order = s.game.peek()!;
    let met = false;
    for (let t = 0; t < 30 && s.game.run.round === 0; t += 1 / 60) {
      s.frame(1 / 60);
      if (s.pairs && s.stage.done) met = true;
    }
    expect(met).toBe(true);
    expect(s.game.run.round).toBe(1);
    // partners stood close, side by side, level
    const f = s.figure;
    for (let p = 0; p < 10; p += 2) {
      const i = order[p];
      const j = order[p + 1];
      expect(f.x[j] - (f.x[i] + f.w[i])).toBeCloseTo(0.03, 9);
      expect(f.y[i] + f.h[i] / 2).toBeCloseTo(f.y[j] + f.h[j] / 2, 9);
    }
    expect(Array.from(s.game.wealth)).toEqual(Array.from(plain.game.wealth));
    // when it is over, everyone goes home
    for (let t = 0; t < 10 && s.pairs; t += 1 / 60) s.frame(1 / 60);
    expect(s.pairs).toBeNull();
    expect(s.stage.overlaps().pairs).toBe(0);
    // any other trade in toss mode is shown as a piece, where they stand
    s.run('trade 1');
    expect(s.transit.trades.at(-1)!.style).toBe('piece');
    expect(s.pairs).toBeNull();
  });

  it('piece mode (the default), any size: trades where they stand, nobody walks to a partner', () => {
    for (const n of [12, 36]) {
      const s = new Session({ n });
      expect(s.transit.trade).toBe('piece');
      s.run('play');
      let flights = 0;
      for (let f = 0; f < 300; f++) {
        s.frame(1 / 60);
        expect(s.pairs).toBeNull();
        for (const r of s.transit.trades) expect(r.style).toBe('piece');
        flights += s.transit.trades.length;
      }
      expect(flights).toBeGreaterThan(0);
    }
  });

  it('playing in a small room: partners meet before every round, and the law holds', () => {
    const s = new Session({ n: 12 });
    s.run('fx trade toss; rule tax 0.05; play');
    let paired = 0;
    for (let f = 0; f < 60 * 30; f++) {
      s.frame(1 / 60);
      if (s.pairs) paired++;
    }
    expect(paired).toBeGreaterThan(60 * 20);
    expect(s.game.run.round).toBeGreaterThanOrEqual(3);
    expect(s.stage.overlaps().pairs).toBe(0);
    expect(s.stage.violations).toBe(0);
  });

  it('in a chart everyone is locked in place: trades and levies happen at once, the chart re-forms', () => {
    const s = new Session({ n: 12 });
    s.run('rule tax 0.05; ccdf; play');
    s.stage.finish();
    let flights = 0;
    let levies = 0;
    for (let f = 0; f < 120; f++) {
      s.frame(1 / 60);
      flights += s.transit.trades.length;
      if (s.transit.levy) levies++;
    }
    expect(flights + levies).toBe(0);
    expect(s.pairs).toBeNull();
    // at the trade rate (N a second: two rounds), as when not animated
    expect(s.game.run.round).toBeGreaterThanOrEqual(3);
    expect(s.game.run.round).toBeLessThanOrEqual(5);
    expect(Array.from(s.shown)).toEqual(Array.from(s.game.wealth));
    // back in the room, trades are played again
    s.run('room');
    for (let f = 0; f < 600 && !s.transit.busy; f++) s.frame(1 / 60);
    expect(s.transit.busy).toBe(true);
  });

  it('a tax keeps the pot its room in the middle; a bigger levy waits for the room to clear', () => {
    // a 20% stake: after 2000 trades a few are big and most are small, so the middle can be cleared
    const s = new Session({ n: 30, rules: { beta: 0.2, tax: 0 } });
    s.run('fx off; trade 2000; fx on; rule tax 0.05');
    s.stage.finish();
    const clear = (side: number) => {
      const st = s.stage;
      for (let i = 0; i < st.n; i++) {
        const dx = Math.abs(st.x[i] + st.w[i] / 2 - 1) - st.w[i] / 2;
        const dy = Math.abs(st.y[i] + st.h[i] / 2 - 1) - st.h[i] / 2;
        if (dx < side / 2 && dy < side / 2) return false;
      }
      return true;
    };
    expect(clear(Math.sqrt(2 * 0.05))).toBe(true);
    s.run('levy 0.4');
    const l = s.transit.levy!;
    expect(l.act).toBeNull();
    for (let t = 0; t < 10 && !l.act; t += 1 / 60) s.frame(1 / 60);
    expect(l.act).not.toBeNull();
    expect(clear(Math.sqrt(2 * 0.4))).toBe(true);
  });

  it('the camera observers colour and ring the squares; a new program clears them', () => {
    const s = new Session({ n: 12 });
    const program = {
      ast: 1,
      scripts: [
        {
          op: 'ctl.start',
          body: [
            { op: 'setup.yard', f: { space: 'free' }, args: { n: { op: 'num', v: 12 } } },
            { op: 'ctl.forever', body: [{ op: 'show.colour', f: { by: 'talent' } }, { op: 'show.outline', args: { who: { op: 'group.poorest', args: { q: { op: 'pct', v: 0.5 } } } } }] },
          ],
        },
      ],
    };
    s.run(`program ${JSON.stringify(program)}`);
    s.run('round 1');
    s.frame(1 / 60);
    expect(s.colourBy).toBe('talent');
    // everyone starts equal: the poorest half by rank, ties broken by index
    expect(Array.from(s.highlight!).reduce((a, b) => a + b, 0)).toBe(6);
    s.setProgram(s.game.program);
    expect(s.colourBy).toBe('none');
    expect(s.highlight).toBeNull();
  });

  it('arrange poses the yard, hold makes play wait, follow frames a group (everyone: nobody in particular)', () => {
    const s = new Session({ n: 12 });
    const program = (follow: Record<string, unknown>) => ({
      ast: 1,
      scripts: [
        {
          op: 'ctl.start',
          body: [
            { op: 'setup.yard', f: { space: 'free' }, args: { n: { op: 'num', v: 12 } } },
            {
              op: 'ctl.forever',
              body: [
                { op: 'show.arrange', f: { layout: 'stack', sort: 'desc' } }, { op: 'show.shape', f: { shape: 'bar' } }, { op: 'show.size', f: { scale: 'log' } },
                { op: 'show.hold', args: { seconds: { op: 'num', v: 5 } } },
                { op: 'show.zoom', args: { who: follow } },
              ],
            },
          ],
        },
      ],
    });
    s.run(`program ${JSON.stringify(program({ op: 'group.richest', args: { q: { op: 'pct', v: 0.25 } } }))}`);
    s.run('fx off; round 1');
    s.frame(1 / 60);
    expect(formatRecipe(s.recipe)).toBe('log bar desc stack');
    expect(s.held).toBeGreaterThan(4.9);
    expect(Array.from(s.follow!).reduce((a, b) => a + b, 0)).toBe(3);
    // while the view holds, play waits
    s.run('play');
    const round = s.game.run.round;
    for (let k = 0; k < 60; k++) s.frame(1 / 30);
    expect(s.game.run.round).toBe(round);
    s.run('pause');
    s.run(`program ${JSON.stringify(program({ op: 'group.all' }))}`);
    s.run('round 1');
    s.frame(1 / 60);
    expect(s.follow).toBeNull();
  });

  it('arrange, shape and scale are three blocks: each sets its own part of the pose and keeps the rest', () => {
    const s = new Session({ n: 12 });
    const run = (...blocks: unknown[]) => {
      s.run(`program ${JSON.stringify({ ast: 1, scripts: [{ op: 'ctl.start', body: [{ op: 'setup.yard', f: { space: 'free' }, args: { n: { op: 'num', v: 12 } } }, { op: 'ctl.forever', body: blocks }] }] })}`);
      s.run('fx off; round 1');
      s.frame(1 / 60);
      return formatRecipe(s.recipe);
    };
    expect(run({ op: 'show.size', f: { scale: 'side' } })).toBe('squared');
    expect(run({ op: 'show.shape', f: { shape: 'hex' } })).toBe('squared hex');
    expect(run({ op: 'show.arrange', f: { layout: 'places', sort: 'desc' } })).toBe('squared hex desc');
    expect(run({ op: 'show.arrange', f: { layout: 'pack', sort: 'asc' } })).toBe('squared hex asc pack');
  });

  it('a yard on a lattice: in their places is the model\'s lattice, each body in its cell; neighbours trade', () => {
    const s = new Session({ n: 20 });
    const lattice = {
      ast: 1,
      scripts: [
        {
          op: 'ctl.start',
          body: [
            { op: 'setup.yard', f: { space: 'lattice' }, args: { n: { op: 'num', v: 20 } } },
            {
              op: 'ctl.forever',
              body: [
                { op: 'show.arrange', f: { layout: 'places', sort: 'id' } },
                {
                  op: 'trade',
                  body: [
                    { op: 'trade.pair', args: { pair: { op: 'pair.near', args: { r: { op: 'num', v: 1 } } } } },
                    { op: 'trade.flip', args: { coin: { op: 'coin.strength', args: { s: { op: 'num', v: 0 }, b: { op: 'pct', v: 0 } } } } },
                    { op: 'trade.pay', args: { stake: { op: 'stake.share', f: { of: 'poorer' }, args: { beta: { op: 'pct', v: 0.1 } } } } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    s.run(`program ${JSON.stringify(lattice)}`);
    // a lattice yard poses its squares in their places at once
    expect(s.recipe.pose).toBe('lattice');
    s.run('fx off; round 3');
    s.frame(1 / 60);
    expect(s.recipe.pose).toBe('lattice');
    const world = s.game.run.world;
    const f = s.figure;
    const cell = (f.x[1] + f.w[1] / 2 - (f.x[0] + f.w[0] / 2)) / ((world.cell[1] % world.side) - (world.cell[0] % world.side) || 1);
    for (let i = 0; i < 20; i++) {
      const col = world.cell[i] % world.side;
      const row = Math.floor(world.cell[i] / world.side);
      expect(f.x[i] + f.w[i] / 2).toBeCloseTo((col + 0.5) * Math.abs(cell), 9);
      expect(f.y[i] + f.h[i] / 2).toBeCloseTo((row + 0.5) * Math.abs(cell), 9);
    }
  });
});

