/**
 * Regressions for REVIEW-2026-10-20-FULL.md, one per finding, each from the review's own reproduction where it gave
 * one. (Finding 2 is the browser's: tests/browser/story.spec.ts; the Be-a-square announcement is in panel.test.ts;
 * reduced motion in the opening is in opening-review.test.ts.)
 */
import { describe, expect, it } from 'vitest';
import { num, type Node, type Program } from '../model/ast.ts';
import { Run } from '../model/engine.ts';
import { options, program, statementOf, taxOf, tradeOf } from '../model/presets.ts';
import { Session } from '../stage/console/session.ts';
import { HURRY_TRADES } from '../stage/console/session.ts';
import { formatRecipe } from '../stage/core/recipe.ts';
import { statsOf } from '../stage/core/stats.ts';
import { emptyScene } from '../stage/acts/scene.ts';
import { lorenz } from '../stage/acts/guides.ts';
import { fill } from '../stage/story/runner.ts';
import { describeYard } from '../stage/story/yards.ts';
import { STORY } from '../stage/story/words.en.ts';

const pct = (v: number): Node => ({ op: 'pct', v });
const cmp = (op: string, a: Node, b: Node): Node => ({ op: 'op.cmp', f: { op }, args: { a, b } });
const round: Node = { op: 'val.global', f: { name: 'round' } };

describe('REVIEW-2026-10-20-FULL', () => {
  it('1 · a goal that cannot be reached: Next gives it up within one budget, and the script goes on', () => {
    // stake 0: nothing moves, so the effective number never falls to 3.05
    const s = new Session({ n: 4, seed: 7 });
    s.run('fx off; rule beta 0');
    // what hurrying asks the game for, counted, not played (as the review's instrumented run did)
    let asked = 0;
    s.game.round = (k = 1) => {
      asked += k * Math.floor(s.game.n / 2);
      return 0;
    };
    s.start('t', ['play', 'until neff 3.05', 'speed 2']);
    s.hurry();
    expect(asked).toBeLessThanOrEqual(HURRY_TRADES);
    // the reader has the page back: the goal let go, the lines after it run
    expect(s.script).toBeNull();
    expect(s.goal).toBeNull();
    expect(s.speed).toBe(2);
    expect(s.log.join('\n')).toMatch(/not reached/);
  });

  it('1 · …and for real: an unreachable goal returns in well under a second', () => {
    const s = new Session({ n: 4, seed: 7 });
    s.run('fx off; rule beta 0');
    s.start('t', ['play', 'until neff 3.05', 'until gini 0.5', 'speed 2']);
    const t0 = performance.now();
    s.hurry();
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(s.script).toBeNull();
    expect(s.speed).toBe(2);
  });

  it('3 · the Gini the story names is the one it measures: at most (N−1)/N, the gap’s share of the triangle', () => {
    const s = new Session({ n: 4, seed: 7 });
    // one square has everything: the largest Gini four squares can have
    s.run('fx off');
    for (let k = 1; k < 4; k++) s.game.give(k, 0, 1);
    expect(statsOf(s.game.wealth).gini).toBeCloseTo(0.75, 6);
    expect(fill('{ginimax}', s)).toBe('0.75');
    // the words say so, not "1"
    expect(STORY.beats.gini).toContain('{ginimax}');
    expect(STORY.beats.gini).not.toMatch(/\b1 when one/);
    // the gap drawn (between the stairs and the straight line) over the triangle under that line is the Gini
    for (const w of [[0.1, 0.2, 0.3, 0.4], [0.7, 0.1, 0.1, 0.1], [1e-9, 1e-9, 1e-9, 1]]) {
      const scene = emptyScene();
      lorenz(w, 0, 0, 1, scene);
      const pts = scene.polys[0].pts;
      let area = 0;
      for (let k = 0; k + 3 < pts.length; k += 2) area += pts[k] * pts[k + 3] - pts[k + 2] * pts[k + 1];
      expect(Math.abs(area) / 2 / 0.5).toBeCloseTo(statsOf(Float64Array.from(w)).gini, 9);
    }
  });

  it('4 · each yard says what it shows: its squares’ shares, richest first (its rules stay hidden)', () => {
    const said = describeYard(2, Float64Array.from([0.1, 0.6, 0.05, 0.25]));
    expect(said).toBe(STORY.ui.yardSays.replace('{k}', '2').replace('{shares}', '60%, 25%, 10%, 5%'));
    expect(said).not.toMatch(/tax|stake/i);
  });

  it('5 · growth under a trade still showing: what is drawn adds up to all the money there is', () => {
    const s = new Session({ seed: 6, program: program({ n: 2, then: [statementOf.grow(0, 3)] }) });
    s.run('round');
    s.frame(1 / 60);
    const shown = [...s.shown].reduce((a, b) => a + b, 0);
    expect(shown).toBeCloseTo(1, 9);
  });

  it('6 · a “when” script runs its stack each time its condition turns true', () => {
    const when = (c: Node): Node => ({ op: 'show.when', args: { c }, body: [{ op: 'panel.print', f: { name: 'x' }, args: { value: num(123) } }] });
    const base = program({ n: 4 });
    const printed = (p: Program, rounds: number) => {
      const run = new Run(p, 1);
      const seen: number[] = [];
      run.onView = (op, _f, _m, v) => {
        if (op === 'panel.print') seen.push(run.round * 1000 + (v ?? 0));
      };
      run.rounds(rounds);
      return seen;
    };
    // round ≥ 1: true from round 1 on, run once
    expect(printed({ ...base, scripts: [...base.scripts, when(cmp('ge', round, num(1)))] }, 3)).toEqual([1123]);
    // round = 1 or round = 3: turns true twice
    const twice: Node = { op: 'op.logic', f: { op: 'or' }, args: { a: cmp('eq', round, num(1)), b: cmp('eq', round, num(3)) } };
    expect(printed({ ...base, scripts: [...base.scripts, when(twice)] }, 4)).toEqual([1123, 3123]);
  });

  it('7 · a statistic is the statement’s start, whichever pair reads it first', () => {
    // the review's: four agents at 0.5, 0.5, 1.5, 1.5; the underdog's bonus, for a pair of the rich only, is the
    // poorest's wealth — as the trade began (0.5), not after the first pair has paid (0.45)
    const bonus: Node = {
      op: 'op.if',
      args: {
        c: cmp('gt', { op: 'val.prop', f: { prop: 'wealth', who: 'poorer' } }, num(1)),
        a: { op: 'stat.of', f: { stat: 'min', prop: 'wealth' }, args: { over: { op: 'group.all' } } },
        b: num(0),
      },
    };
    const start: Node = { op: 'setup.start', args: { with: { op: 'alloc.classes', args: { q: pct(0.5), s: pct(0.75) } } } };
    const p = program({ n: 4, setup: [start], coin: { op: 'coin.strength', args: { s: num(0), b: bonus } } });
    const run = new Run(p, 622);
    expect([...run.world.w]).toEqual([0.5, 0.5, 1.5, 1.5]);
    expect([...run.peekPairs()!]).toEqual([0, 1, 3, 2]);
    run.rounds(1);
    const w = [...run.world.w];
    [0.55, 0.45, 1.65, 1.35].forEach((x, k) => expect(w[k]).toBeCloseTo(x, 12));
  });

  it('8 · a link opens on the view it was shared with, not on an older request of its program', () => {
    const arrange: Node = { op: 'show.arrange', f: { layout: 'stack', sort: 'desc' } };
    const base = program({ n: 4 });
    const trade = base.scripts[0].body![1].body![0];
    const p: Program = { ...base, scripts: [{ ...base.scripts[0], body: [base.scripts[0].body![0], { op: 'ctl.forever', body: [{ ...trade, body: [...trade.body!, arrange] }] }] }] };
    const s = new Session({ seed: 1, program: p });
    s.run('fx off; round');
    s.frame(1 / 60);
    expect(formatRecipe(s.recipe)).toMatch(/stack/);
    s.run('room');
    const posed = formatRecipe(s.recipe);
    const t = Session.load(s.share());
    expect(formatRecipe(t.recipe)).toBe(posed);
    t.frame(1 / 60);
    expect(formatRecipe(t.recipe)).toBe(posed);
  });

  it('9 · a command that fails changes nothing, the squares’ proportions included', () => {
    const s = new Session({ n: 4, seed: 1 });
    s.run('fx off; trade 20; equalize; trade 20');
    const aspect = [...s.aspect];
    const ahead = [...s.ahead];
    expect(aspect.some((a) => Math.abs(a - 1) > 1e-3)).toBe(true);
    expect(s.run('look bad')).toMatch(/^error:/);
    expect([...s.aspect]).toEqual(aspect);
    expect([...s.ahead]).toEqual(ahead);
  });

  // REVIEW-2026-10-21-FULL-RECHECK
  it('recheck 5 · growth followed by another trade or a tax: what is drawn still adds up', () => {
    const tax = taxOf(options.wealthTax(0.1), options.equally());
    for (const n of [2, 4])
      for (const then of [[statementOf.grow(0, 3), tradeOf()], [statementOf.grow(0, 3), tax], [tax, statementOf.grow(0, 3), tradeOf()]]) {
        const s = new Session({ seed: 6, program: program({ n, then }) });
        s.run('round');
        s.frame(1 / 60);
        expect([...s.shown].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
      }
  });

  it('recheck 6 · a “when” script: true at setup reaches a listener attached after; checked on the last step too', () => {
    const print: Node = { op: 'panel.print', f: { name: 'x' }, args: { value: num(123) } };
    const when = (c: Node): Node => ({ op: 'show.when', args: { c }, body: [print] });
    const base = program({ n: 4 });
    // round ≥ 0: true from the start; told once, to whoever listens, however late
    const early = new Run({ ...base, scripts: [...base.scripts, when(cmp('ge', round, num(0)))] }, 1);
    const seen: string[] = [];
    early.onView = (op) => seen.push(op);
    early.rounds(3);
    expect(seen).toEqual(['panel.print']);
    // a program that ends after one step (a flat 0.1 from each of four, kept): the pot is 0.4 when it ends
    const pot: Node = { op: 'val.global', f: { name: 'pot' } };
    const yard = base.scripts[0].body![0];
    const finite: Program = { ...base, scripts: [{ op: 'ctl.start', body: [yard, taxOf(options.flatTax(0.1))] }, when(cmp('ge', pot, num(0.1)))] };
    const last = new Run(finite, 1);
    const told: string[] = [];
    last.onView = (op) => told.push(op);
    expect(last.step()).toBe('end');
    expect(last.world.pot).toBeCloseTo(0.4, 12);
    expect(told).toEqual(['panel.print']);
  });

  // REVIEW-2026-10-21-FULL-RECHECK-2
  it('recheck-2 · a trade right after growth cuts the body as it has grown, frame after frame', () => {
    const s = new Session({ seed: 6, program: program({ n: 2, then: [statementOf.grow(0, 3), tradeOf()] }) });
    s.run('round');
    // every frame for 1.5 s at 120 Hz: each body drawn (the act's override, else the stage's box) against the body
    // the stage has; never more than the money being cut off it smaller
    for (let k = 0; k < 180; k++) {
      s.frame(1 / 120);
      const scene = emptyScene();
      s.transit.draw(s.live, scene);
      const st = s.stage;
      for (let i = 0; i < st.n; i++) {
        const shown = scene.display.get(i);
        if (!shown) continue;
        const under = st.w[i] * st.h[i];
        const pieces = scene.pieces.reduce((a, p) => a + p.box.w * p.box.h, 0);
        expect(shown.w * shown.h, `frame ${k}, body ${i}`).toBeGreaterThan(0.9 * under - pieces);
      }
    }
  });

  // REVIEW-2026-10-21-FULL-RECHECK-3: a repeat is the same experiment, a new one changes only what it says
  it('recheck-3 · Start again, New luck and Squares keep the sliders as the reader set them', () => {
    const s = new Session({ n: 16, seed: 3 });
    s.run('fx off; rule beta 0.3; rule tax 0.02; round 20');
    const first = [...s.game.wealth];
    // Start again: the same dice, the same settings: the same run
    s.run('reset; round 20');
    expect(s.game.rules).toEqual({ beta: 0.3, tax: 0.02 });
    expect([...s.game.wealth]).toEqual(first);
    // New luck, and a new number of squares: new dice or a new crowd, the same settings
    s.run('seed 5');
    expect(s.game.rules).toEqual({ beta: 0.3, tax: 0.02 });
    s.run('n 30');
    expect(s.game.rules).toEqual({ beta: 0.3, tax: 0.02 });
    // and a link carries them
    expect(Session.load(s.share()).game.rules).toEqual({ beta: 0.3, tax: 0.02 });
  });
});

describe('owner, 2026-10-21: a place for whoever built the yard', () => {
  it('a link may say who built it (and where they are): carried by a share; nothing otherwise; only web addresses', () => {
    expect(new Session().credit).toBeNull();
    const s = Session.load('#n=16&seed=3&by=Ada%20Lovelace&by-url=https%3A%2F%2Fexample.org%2Fada');
    expect(s.credit).toEqual({ by: 'Ada Lovelace', url: 'https://example.org/ada' });
    expect(Session.load(s.share()).credit).toEqual(s.credit);
    expect(Session.load('#n=16&by=Ada&by-url=javascript%3Aalert(1)').credit).toEqual({ by: 'Ada', url: '' });
    expect(Session.load('#n=16&by=' + 'x'.repeat(200)).credit!.by.length).toBeLessThanOrEqual(60);
  });
});

describe('owner, 2026-10-21: the Gini as a gauge', () => {
  it('the triangle folds into a bar as tall as the box, the gap into a bar over it from the bottom: their ratio is the Gini', () => {
    for (const w of [[0.1, 0.2, 0.3, 0.4], [0.7, 0.1, 0.1, 0.1]]) {
      const scene = emptyScene();
      lorenz(w, 1, 1, 1, scene, { tri: 10, lift: 10, label: 10 });
      const height = (fill: string) => {
        const p = scene.polys.find((x) => x.fill === fill)!;
        const ys = p.pts.filter((_, k) => k % 2 === 1);
        return Math.max(...ys) - Math.min(...ys);
      };
      // bars: square corners, the box's floor and one height (not a slanted strip)
      for (const fill of ['triangle', 'gap']) {
        const ys = new Set(scene.polys.find((x) => x.fill === fill)!.pts.filter((_, k) => k % 2 === 1).map((y) => y.toFixed(9)));
        expect(ys.size).toBe(2);
      }
      const g = statsOf(Float64Array.from(w)).gini;
      expect(height('triangle')).toBeCloseTo(1, 9);
      expect(height('gap') / height('triangle')).toBeCloseTo(g, 9);
      expect(scene.labels.map((l) => l.text)).toEqual(['0.00', '1.00', g.toFixed(2)]);
      // the even line made of ghosts, one equal share each
      expect(scene.polys.filter((x) => x.fill === 'ghost')).toHaveLength(w.length);
    }
  });
});
