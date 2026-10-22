/** REVIEW-2026-10-19-MODEL-BLOCKS-RECHECK-2: the stage's findings N2, N7, N9, each a reproduction. */
import { describe, expect, it } from 'vitest';
import { Session } from '../stage/console/session.ts';
import { formatRecipe } from '../stage/core/recipe.ts';

const num = (v: number) => ({ op: 'num', v });
const program = (n: number, ...round: unknown[]) =>
  JSON.stringify({ ast: 1, scripts: [{ op: 'ctl.start', body: [{ op: 'setup.yard', f: { space: 'free' }, args: { n: num(n) } }, { op: 'ctl.forever', body: round }] }] });

describe('N2: a pause block stops play', () => {
  it('play stops at the pause; growth and rounds stay; Play goes on deliberately', () => {
    const s = new Session({ n: 10 });
    s.run(`program ${program(10, { op: 'grow', args: { mu: num(0.01), sigma: num(0) } }, { op: 'ctl.pause' })}`);
    s.run('fx off; play 1000');
    for (let k = 0; k < 5; k++) s.frame(0.05);
    expect(s.playing).toBe(false);
    const round = s.game.run.round;
    const total = s.game.run.world.total;
    for (let k = 0; k < 10; k++) s.frame(0.05);
    expect(s.game.run.round).toBe(round);
    expect(s.game.run.world.total).toBe(total);
    s.run('play');
    for (let k = 0; k < 5; k++) s.frame(0.05);
    expect(s.game.run.round).toBe(round + 1);
    expect(s.playing).toBe(false);
  });
});

describe('N7: a hold stops a batch of rounds where it is asked', () => {
  it('fast play, effects off: one round, then the hold', () => {
    const s = new Session({ n: 4 });
    s.run(`program ${program(4, { op: 'show.hold', args: { seconds: num(3) } })}`);
    s.run('fx off; play 1000');
    s.frame(0.05);
    expect(s.game.run.round).toBe(1);
    expect(s.held).toBeGreaterThan(2.9);
  });
});

describe('N9: queued camera requests belong to their moment', () => {
  it('a failed command does not replay old requests', () => {
    const s = new Session({ n: 10 });
    s.run(`program ${program(10, { op: 'show.arrange', f: { layout: 'stack', sort: 'desc' } }, { op: 'show.shape', f: { shape: 'bar' } })}`);
    s.run('fx off; round 1');
    s.frame(1 / 60);
    s.run('room');
    expect(s.run('look bad')).toMatch(/^error:/);
    s.frame(1 / 60);
    expect(formatRecipe(s.recipe)).toBe('');
  });

  it('a new program drops the old one’s requests', () => {
    const s = new Session({ n: 10 });
    s.run(`program ${program(10, { op: 'show.colour', f: { by: 'talent' } })}`);
    s.run('fx off; round 1');
    s.run(`program ${program(10)}`);
    s.frame(1 / 60);
    expect(s.colourBy).toBe('none');
  });
});

/** REVIEW-2026-10-19-MODEL-BLOCKS-RECHECK-3: the same, with partners meeting before each round (fx trade toss). */
describe('recheck 3: pause and hold with partners meeting', () => {
  const trade = {
    op: 'trade',
    body: [
      { op: 'trade.pair', args: { pair: { op: 'pair.match', args: { within: { op: 'group.all' } } } } },
      { op: 'trade.flip', args: { coin: { op: 'coin.strength', args: { s: { op: 'num', v: 0 }, b: { op: 'pct', v: 0 } } } } },
      { op: 'trade.pay', args: { stake: { op: 'stake.share', f: { of: 'poorer' }, args: { beta: { op: 'pct', v: 0.1 } } } } },
    ],
  };
  const frames = (s: Session, seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 30) s.frame(1 / 30);
  };

  it('N2: a pause stops play; nothing changes until Play', () => {
    const s = new Session({ n: 4 });
    s.run(`program ${program(4, trade, { op: 'ctl.pause' })}`);
    const start = s.game.run.hash();
    s.run('fx trade toss; play 1000');
    frames(s, 6);
    // the pause comes after round 1's trade, before the round is counted
    expect(s.game.run.status).toBe('paused');
    expect(s.game.run.hash()).not.toBe(start);
    expect(s.game.run.round).toBe(0);
    expect(s.playing).toBe(false);
    const hash = s.game.run.hash();
    frames(s, 20);
    expect(s.game.run.hash()).toBe(hash);
    s.run('play');
    frames(s, 8);
    expect(s.game.run.round).toBe(1);
    expect(s.game.run.status).toBe('paused');
    expect(s.playing).toBe(false);
  });

  it('N7: a hold holds: no meeting nor round until it has run out', () => {
    const s = new Session({ n: 4 });
    s.run(`program ${program(4, trade, { op: 'show.hold', args: { seconds: num(30) } })}`);
    s.run('fx trade toss; play 1000');
    frames(s, 6);
    expect(s.game.run.round).toBe(1);
    expect(s.held).toBeGreaterThan(20);
    frames(s, 20);
    expect(s.game.run.round).toBe(1);
    expect(s.held).toBeLessThan(10);
    frames(s, 16);
    expect(s.game.run.round).toBeGreaterThanOrEqual(2);
  });
});
