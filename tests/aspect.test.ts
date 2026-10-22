import { describe, expect, it } from 'vitest';
import { Session } from '../stage/console/session.ts';
import { LIMIT, afterAttach, afterCut } from '../stage/core/aspect.ts';

const dims = (aspect: number, area: number) => [Math.sqrt(area * aspect), Math.sqrt(area / aspect)];

describe('proportions in trades', () => {
  it('a cut shortens the long side, an attachment lengthens the short side, area exact', () => {
    // 2 : 1 body of area 2 loses 0.5: width 2 → 1.5, height stays 1
    const cut = afterCut(2, 2, 0.5);
    const [w, h] = dims(cut, 1.5);
    expect(w).toBeCloseTo(1.5, 12);
    expect(h).toBeCloseTo(1, 12);
    // the same body gains 0.5: height 1 → 1.25, width stays 2
    const grown = afterAttach(2, 2, 0.5);
    const [w2, h2] = dims(grown, 2.5);
    expect(w2).toBeCloseTo(2, 12);
    expect(h2).toBeCloseTo(1.25, 12);
    // tall bodies the same way round
    expect(afterCut(0.5, 2, 0.5)).toBeCloseTo(1 / afterCut(2, 2, 0.5), 12);
  });

  it('both moves pull toward square, and proportions stay within 1 : LIMIT', () => {
    expect(Math.abs(Math.log(afterCut(1.5, 1, 0.1)))).toBeLessThan(Math.log(1.5));
    expect(Math.abs(Math.log(afterAttach(1.5, 1, 0.1)))).toBeLessThan(Math.log(1.5));
    const s = new Session({ n: 30 });
    s.run('trade 30000');
    for (const a of s.aspect) {
      expect(a).toBeLessThanOrEqual(LIMIT);
      expect(a).toBeGreaterThanOrEqual(1 / LIMIT);
    }
    s.run('equalize');
    expect(s.aspect.every((a) => a === 1)).toBe(true);
  });

  it('played trades end in the same shapes as instant ones, so links replay them', () => {
    const played = new Session({ n: 10 });
    for (let k = 0; k < 6; k++) {
      played.run('trade 1');
      for (let t = 0; t < 6 && played.transit.busy; t += 1 / 60) played.frame(1 / 60);
    }
    const instant = new Session({ n: 10 });
    instant.run('fx off; trade 6');
    for (let i = 0; i < 10; i++) expect(played.aspect[i]).toBeCloseTo(instant.aspect[i], 12);
    const linked = Session.load(played.share());
    for (let i = 0; i < 10; i++) expect(linked.aspect[i]).toBeCloseTo(played.aspect[i], 12);
  });

  it('a body drawn after a played trade has the cut shape: no reshaping', () => {
    const s = new Session({ n: 8 });
    s.run('trade 1');
    const i = s.transit.trades[0].moves[0].from;
    for (let t = 0; t < 4 && s.transit.busy; t += 1 / 60) s.frame(1 / 60);
    for (let t = 0; t < 2; t += 1 / 60) s.frame(1 / 60);
    expect(s.stage.w[i] / s.stage.h[i]).toBeCloseTo(s.aspect[i], 6);
    expect(s.stage.w[i] * s.stage.h[i]).toBeCloseTo(s.game.wealth[i], 9);
  });

  it('while playing, every trade is played: no size changes unseen', () => {
    const s = new Session({ n: 20 });
    s.run('play 60');
    const seen = new Set<object>();
    for (let f = 0; f < 600; f++) {
      s.frame(1 / 60);
      for (const r of s.transit.trades) seen.add(r);
    }
    expect(s.game.trades).toBeGreaterThan(20);
    expect(seen.size).toBe(s.game.trades);
  });

  it('a levy grows everyone by attaching their share along the long edge, not by swelling', () => {
    const s = new Session({ n: 12 });
    s.run('trade 600');
    for (let t = 0; t < 8 && !s.still; t += 1 / 60) s.frame(1 / 60);
    const aspect = Float64Array.from(s.aspect);
    const before = Float64Array.from(s.game.wealth);
    s.run('levy 0.3');
    for (let t = 0; t < 10 && s.transit.busy; t += 1 / 60) s.frame(1 / 60);
    const share = (0.3 * before.reduce((a, b) => a + b, 0)) / 12;
    // cut like a trade's slice, then the share attached
    for (let j = 0; j < 12; j++) expect(s.aspect[j]).toBeCloseTo(afterAttach(afterCut(aspect[j], before[j], 0.3 * before[j]), before[j] * 0.7, share), 9);
    // played or instant, the same shapes
    const instant = new Session({ n: 12 });
    instant.run('fx off; trade 600; levy 0.3');
    for (let j = 0; j < 12; j++) expect(instant.aspect[j]).toBeCloseTo(s.aspect[j], 9);
    for (let t = 0; t < 3; t += 1 / 60) s.frame(1 / 60);
    for (let j = 0; j < 12; j++) expect(s.stage.w[j] / s.stage.h[j]).toBeCloseTo(s.aspect[j], 5);
  });

  it('a big levy in an unequal room leaves no one stretched: the smaller attaches to the larger', () => {
    const s = new Session({ n: 16 });
    s.run('fx off; trade 3000; equalize; levy 0.5');
    for (const a of s.aspect) {
      expect(a).toBeLessThanOrEqual(2.01);
      expect(a).toBeGreaterThanOrEqual(1 / 2.01);
    }
  });
});
