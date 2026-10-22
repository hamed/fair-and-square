// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../stage/console/session.ts';
import { Panel } from '../stage/view/panel.ts';
import { withN } from '../stage/core/game.ts';
import { preset } from '../model/presets.ts';

beforeAll(() => {
  // jsdom has neither a 2D canvas nor a ResizeObserver: a context that takes every call, an observer that never fires
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe(): void {}
    disconnect(): void {}
  };
});

describe('owner, 2026-10-21: a square’s card', () => {
  it('a square picked in Play has a card of its own: its rank and share, Close; none in Learn or About', () => {
    const s = new Session({ n: 4 });
    s.run('give 0 1 0.1');
    const root = document.createElement('section');
    document.body.append(root);
    const panel = new Panel(root, () => s);
    panel.update(1000);
    const card = root.querySelector<HTMLElement>('.tile.card')!;
    expect(card.hidden).toBe(true);
    s.selected = 1;
    panel.update(2000);
    expect(card.hidden).toBe(false);
    expect(card.querySelector('strong')!.textContent).toBe('#1 of 4');
    expect(card.textContent).toContain('of all the money');
    expect(card.textContent).toContain('richest');
    // Richer and Poorer: the next card up or down the ranks (a keyboard reaches every square)
    const press = (word: string) => [...card.querySelectorAll('button')].find((b) => b.textContent === word)!.click();
    press('Poorer');
    expect(card.querySelector('strong')!.textContent).toBe('#2 of 4');
    press('Richer');
    expect(s.selected).toBe(1);
    // Close lets it go
    press('Close');
    expect(s.selected).toBe(-1);
    expect(card.hidden).toBe(true);
    // in Learn (the Story lends the panel its rows), no card
    s.selected = 1;
    panel.story(document.createElement('div'), document.createElement('div'));
    panel.update(3000);
    expect(card.hidden).toBe(true);
  });
});

describe('review 2026-10-21: a square’s card stays true', () => {
  const mount = (s: Session) => {
    const root = document.createElement('section');
    document.body.append(root);
    const panel = new Panel(root, () => s);
    panel.update(1000);
    return { root, panel, card: root.querySelector<HTMLElement>('.tile.card')! };
  };

  it('2: keeps up as the square’s money changes, with no charts or numbers in the program', () => {
    const s = new Session({ n: 4, program: withN(preset('yard-sale').program, 4) });
    const { panel, card } = mount(s);
    s.selected = 0;
    panel.update(2000);
    expect(card.textContent).toContain('25%');
    s.run('give 1 0 0.2');
    panel.update(3000);
    expect(card.textContent).toContain('45%');
  });

  it('4: shares of all the money, the pot’s included and a debt negative; × the average as the charts measure it', () => {
    const s = new Session({ n: 4 });
    s.run('give 1 0 0.2');
    const r = s.rankOf(0)!;
    expect(r.share).toBeCloseTo(0.45, 9);
    expect(r.times).toBeCloseTo(1.8, 9);
    const w = s.game.run.world;
    expect(r.times).toBeCloseTo(w.w[0], 9);
    // with debt: some negative, and every share (the pot's too) adds up to all the money
    const d = new Session({ n: 10, seed: 1, program: withN(preset('debt').program, 10) });
    d.run('fx off; round 30');
    const shares = Array.from({ length: 10 }, (_, i) => d.rankOf(i)!.share);
    expect(shares.some((x) => x < 0)).toBe(true);
    const world = d.game.run.world;
    const total = world.pot + world.w.reduce((a, b) => a + b, 0);
    expect(shares.reduce((a, b) => a + b, 0) + world.pot / total).toBeCloseTo(1, 9);
  });

  it('3: a new experiment begins its charts again, even past the round the last one was sampled at', () => {
    const s = new Session({ n: 8 });
    const { panel } = mount(s);
    s.run('fx off; round 20');
    panel.update(2000);
    s.run('seed 2; fx off; round 30');
    panel.update(3000);
    const rounds = (panel as unknown as { rounds: number[] }).rounds;
    expect(rounds[0]).toBe(30);
    s.run('reset; fx off; round 40');
    panel.update(4000);
    expect((panel as unknown as { rounds: number[] }).rounds).toEqual([40]);
  });

  it('7: Be a square opens its card, no pointer needed', () => {
    const s = new Session({ n: 4 });
    const { panel, card } = mount(s);
    s.run('be 2');
    panel.update(2000);
    expect(s.selected).toBe(2);
    expect(card.hidden).toBe(false);
  });
});

describe('recheck 2026-10-22', () => {
  it('a rejected command keeps the experiment, and what was measured', () => {
    const s = new Session({ n: 8 });
    s.run('fx off; round 20');
    const e = s.experiment;
    expect(s.run('look bad')).toMatch(/error|unknown|look/i);
    expect(s.experiment).toBe(e);
  });

  it('near-square proportions replay the same: floating noise does not pick the longer edge', () => {
    const s = new Session({ n: 2, seed: 1 });
    s.run('fx off; meet 0 1; duel 0 1 3; split .3; duel 0 1 2; round');
    const t = Session.load(s.share());
    expect(Array.from(t.aspect)).toEqual(Array.from(s.aspect));
  });
});

describe('owner, 2026-10-22: a yard looked at', () => {
  it('the panel shows another yard’s numbers and charts, never its controls; then the page’s own again', () => {
    const page = new Session({ n: 16 });
    const other = new Session({ n: 16, seed: 9 });
    other.run('rule beta 0.5; fx off; round 40');
    const root = document.createElement('section');
    document.body.append(root);
    const panel = new Panel(root, () => page);
    panel.showing = { sliders: ['stake'], controls: [], charts: [], marks: [] };
    panel.update(1000);
    panel.focus(other, 'Yard 2');
    panel.update(2000);
    const note = root.querySelector<HTMLElement>('.note')!;
    expect(note.hidden).toBe(false);
    expect(note.textContent).toMatch(/^Yard 2, round 40: the richest has/);
    // its charts, and none of its sliders (its rules stay hidden)
    expect([...root.querySelectorAll<HTMLElement>('.tile.plot:not(.turnover)')].every((t) => !t.hidden)).toBe(true);
    expect([...root.querySelectorAll<HTMLElement>('label.slider')].every((l) => l.hidden)).toBe(true);
    panel.focus(null);
    panel.update(3000);
    expect(note.hidden).toBe(true);
    expect([...root.querySelectorAll<HTMLElement>('.tile.plot')].every((t) => t.hidden)).toBe(true);
  });
});

describe('owner + review, 2026-10-22: the CCDF chart is the bars’ edge', () => {
  it('each square’s bar is as long as the chart puts it, on one log axis of shares, even past the speck floor', async () => {
    const { logAxis } = await import('../stage/core/figure.ts');
    for (const rounds of [200, 5000]) {
      const s = new Session({ n: 36, seed: 1 });
      s.run(`fx off; round ${rounds}; pose ccdf`);
      s.stage.finish();
      const w = s.game.wealth;
      const total = Array.from(w).reduce((a, b) => a + b, 0);
      const axis = logAxis(Array.from(w, (x) => x / total));
      const f = s.figure;
      for (let i = 0; i < 36; i++) expect(f.w[i], `${rounds}: ${i}`).toBeCloseTo(axis.along(w[i] / total), 6);
    }
  });
});

describe('owner, 2026-10-22: Play', () => {
  it('a formation keeps following the money after a new crowd (it went straight and stayed)', () => {
    const s = new Session({ n: 16 });
    const run = (line: string, seconds: number) => {
      s.run(line);
      for (let t = 0; t < seconds; t += 1 / 30) s.frame(1 / 30);
    };
    // as Play's Lorenz button, then Play, Pause, a new number of squares, Play
    run('guide off; room; pose squared asc stack; until done; pose tower; until done; pose stairs; until done; guide lorenz; until done; guide lorenz gauge', 15);
    run('play', 6);
    run('pause', 0.5);
    run('n 25', 3);
    run('play', 6);
    expect(s.game.run.round).toBeGreaterThan(3);
    const h = Array.from(s.figure.h);
    expect(Math.max(...h) - Math.min(...h)).toBeGreaterThan(1e-3);
  });

  it('another arrangement while trading: what flies lands, and trading waits until everyone is in place', () => {
    const s = new Session({ n: 16 });
    s.run('ccdf; play');
    for (let t = 0; t < 6; t += 1 / 30) s.frame(1 / 30);
    for (const next of ['room', 'wander']) {
      const round = s.game.run.round;
      s.run(next);
      expect(s.transit.busy).toBe(false);
      s.frame(1 / 30);
      s.frame(1 / 30);
      expect(s.game.run.round, next).toBe(round);
      for (let t = 0; t < 8; t += 1 / 30) s.frame(1 / 30);
      expect(s.game.run.round, next).toBeGreaterThan(round);
    }
  });
});
