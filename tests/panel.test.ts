// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../stage/console/session.ts';
import { STAKE_MAX, TAX_MAX, stageProgram } from '../stage/core/game.ts';
import { panelOf } from '../model/panel.ts';
import { Panel, sharedLine } from '../stage/view/panel.ts';

beforeAll(() => {
  // jsdom has neither a 2D canvas nor a ResizeObserver: a context that takes every call, an observer that never fires
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe(): void {}
    disconnect(): void {}
  };
});

function mount(s: Session) {
  const root = document.createElement('section');
  document.body.append(root);
  const panel = new Panel(root, () => s);
  panel.update(1000);
  // a control by its word
  // a control by its name: an icon's (aria-label), or its word
  const button = (text: string) => [...root.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent) === text)!;
  const knob = (name: string) => [...root.querySelectorAll('label.slider')].find((l) => l.querySelector('span')?.textContent?.toLowerCase() === name)!.querySelector('input')!;
  return { root, panel, button, knob };
}

describe('the Play panel', () => {
  it('population buttons select one count and preserve loaded non-preset counts', () => {
    const s = new Session({ n: 25 });
    const { root, panel } = mount(s);
    const group = () => root.querySelector('.population')!;
    const pressed = () => [...group().querySelectorAll<HTMLButtonElement>('[aria-pressed="true"]:not([hidden])')].map((b) => b.textContent);
    expect(pressed()).toEqual(['25']);
    for (const n of [4, 9, 10, 16, 36, 64, 100, 256]) {
      group().querySelector<HTMLButtonElement>(`button[value="${n}"]:not([data-current])`)!.click();
      panel.update(2000 + n * 1000);
      expect(s.game.n).toBe(n);
      expect(pressed()).toEqual([String(n)]);
    }
  });

  it('the stage plays the doc’s yard: stake 0–75% (10%), tax 0–75% (0), the Gini as a number; Gini, Lorenz and CCDF charts', () => {
    const spec = panelOf(stageProgram(100));
    expect(spec.sliders.map((x) => [x.name, x.min, x.max, x.start])).toEqual([
      ['stake', 0, STAKE_MAX, 0.1],
      ['tax', 0, TAX_MAX, 0],
    ]);
    expect(spec.watches.map((w) => w.name)).toEqual(['Gini', 'Effective number']);
    expect(spec.plots).toEqual(['gini', 'lorenz', 'ccdf']);
  });

  it('every control the doc lists is there, and does what it says', () => {
    const s = new Session({ n: 16 });
    const { root, panel, button, knob } = mount(s);
    for (const text of ['Play', 'Slower', 'Fast forward', 'One round', 'Start again', 'New luck', 'Wander', 'In the box', 'Line up', 'CCDF', 'Effective number', 'Lorenz', 'Be born', 'Share', 'Embed', 'Animation: Pieces']) expect(button(text), text).toBeTruthy();
    // icons where clear (owner, 2026-10-22), their word on hover and to screen readers; words where not
    for (const text of ['Play', 'Slower', 'Fast forward', 'One round', 'Start again', 'New luck', 'Wander', 'In the box', 'Line up', 'CCDF', 'Effective number', 'Lorenz', 'Embed']) {
      expect(button(text).querySelector('svg'), text).not.toBeNull();
      expect(button(text).title, text).toMatch(new RegExp(`^${text}`));
    }
    for (const text of ['Be born', 'Share']) expect(button(text).querySelector('svg')).toBeNull();
    for (const name of ['squares', 'stake', 'tax']) expect(knob(name), name).toBeTruthy();
    expect(root.querySelector('[data-knob="Speed"]')).toBeNull();
    expect(root.querySelector('.number span')?.textContent).toBe('Gini');
    // made of squares (owner, 2026-10-21): one of controls, Be born on Play's line, a square for each chart
    expect([...root.querySelectorAll<HTMLElement>('.tile')].filter((t) => !t.hidden).map((t) => t.className)).toEqual(['tile controls']);
    expect(button('Be born').closest('.transport')).toBe(button('Share').closest('.transport'));
    expect(button('Be born').parentElement).not.toBe(button('Share').parentElement);
    expect(button('Share').parentElement).toBe(button('Embed').parentElement);
    expect(knob('stake').closest('.transport')).toBeNull();
    // arrange: pressed, pressed again, back to standing
    button('In the box').click();
    expect(s.recipe.pose).toBe('fold');
    button('In the box').click();
    expect(s.recipe.pose).toBe('free');
    // owner, 2026-10-22: line up by side = money (the row as wide as the box, not the yard many times over)
    button('Line up').click();
    expect([s.recipe.pose, s.recipe.size, s.recipe.order]).toEqual(['row', 'squared', 'asc']);
    // Learn's three charts in the room; each pressed again: back to standing, its guide put away
    button('CCDF').click();
    expect([s.recipe.pose, s.recipe.shape, s.guide?.kind]).toEqual(['stack', 'bar', 'line']);
    button('Effective number').click();
    expect([s.recipe.prints, s.guide]).toEqual([true, null]);
    button('Effective number').click();
    expect([s.recipe.pose, s.recipe.prints]).toEqual(['free', false]);
    button('Lorenz').click();
    for (let t = 0; t < 30 && s.guide?.kind !== 'lorenz'; t += 1 / 30) s.frame(1 / 30);
    expect([s.recipe.pose, s.guide?.kind]).toEqual(['stairs', 'lorenz']);
    button('Lorenz').click();
    expect([s.recipe.pose, s.guide]).toEqual(['free', null]);
    // owner, 2026-10-22: after a chart, Wander is the room wandering (no bars wandering, no prints piling up)
    for (const chart of ['CCDF', 'Effective number']) {
      button(chart).click();
      for (let t = 0; t < 10; t += 1 / 30) s.frame(1 / 30);
      button('Wander').click();
      expect([s.recipe.pose, s.recipe.shape, s.recipe.size, s.recipe.prints, s.guide], chart).toEqual(['wander', 'square', 'natural', false, null]);
    }
    // recheck 2026-10-22: Lorenz cut short by another choice stays cut short
    for (const next of ['Line up', 'CCDF']) {
      button('Lorenz').click();
      for (let t = 0; t < 0.2; t += 1 / 30) s.frame(1 / 30);
      button(next).click();
      for (let t = 0; t < 60; t += 1 / 30) s.frame(1 / 30);
      expect(s.recipe.pose, next).not.toBe('stairs');
      expect(s.guide?.kind, next).not.toBe('lorenz');
    }
    // new luck: new dice, everyone equal, the same N
    const seed = s.game.seed;
    s.run('fx off; round 20');
    button('New luck').click();
    expect(s.game.seed).not.toBe(seed);
    expect(s.game.n).toBe(16);
    expect(new Set(s.game.wealth).size).toBe(1);
    // be a square: a ring and a card
    button('Be born').click();
    panel.update(2000);
    expect(s.you).not.toBeNull();
    expect(s.youText()).toMatch(/^#\d+ of 16 · /);
    // …and said to a screen reader, not only drawn on the yard (REVIEW-2026-10-20-FULL, finding 4)
    expect(root.querySelector('[aria-live]')?.textContent).toMatch(/^You are square number \d+ of 16, with \S+ of all the money\.$/);
  });

  it('who you are is said however you became a square: the button, Show me, a command (REVIEW-2026-10-21 recheck)', () => {
    const s = new Session({ n: 4 });
    const { root, panel } = mount(s);
    // the Story's Show me runs the command, not the button
    s.run('be');
    panel.update(2000);
    expect(root.querySelector('[aria-live]')?.textContent).toMatch(/^You are square number \d of 4, with \S+ of all the money\.$/);
  });

  it('the shared bar keeps unavailable actions visible and disabled while model controls stay below it', () => {
    const s = new Session({ n: 16 });
    const { root, panel } = mount(s);
    panel.showing = { sliders: [], controls: ['share'], charts: false };
    panel.update(2000);
    const bar = root.querySelector('.transport')!;
    const play = bar.querySelector<HTMLButtonElement>('[data-control=play]')!;
    const share = bar.querySelector<HTMLButtonElement>('[data-control=share]')!;
    expect(play.hidden).toBe(false);
    expect(play.disabled).toBe(true);
    expect(share.disabled).toBe(false);
    expect(bar.querySelector('.slider, .numbers, .program')).toBeNull();
    panel.showing = null;
    panel.update(3000);
    expect(play.disabled).toBe(false);
  });

  it('Pause preserves the chosen formation and the economy', () => {
    const s = new Session({ n: 16 });
    const { root, panel, button } = mount(s);
    button('In the box').click();
    s.run('play');
    const hash = s.game.run.hash();
    root.querySelector<HTMLButtonElement>('[data-control=play]')!.click();
    expect(s.playing).toBe(false);
    expect(s.recipe.pose).toBe('fold');
    panel.update(3000);
    expect(s.game.run.hash()).toBe(hash);
  });

  it('chart buttons photograph the completed formation before revealing only its chart', () => {
    const s = new Session({ n: 16 });
    const { root, panel, button } = mount(s);
    const hidden = (kind: string) => root.querySelector<HTMLElement>(`.tile.${kind}`)!.hidden;
    expect(['gini', 'lorenz', 'ccdf', 'turnover'].every(hidden)).toBe(true);
    s.run('play');
    button('CCDF').click();
    panel.update(1500);
    expect(s.playing).toBe(false);
    expect(hidden('ccdf')).toBe(true);
    expect(s.handoff).toBeNull();
    s.hurry();
    panel.update(2000);
    expect(s.handoff?.kind).toBe('ccdf');
    expect(hidden('ccdf')).toBe(false);
    expect(['gini', 'lorenz', 'turnover'].every(hidden)).toBe(true);
    button('Lorenz').click();
    s.hurry();
    panel.update(3000);
    expect([...s.charted]).toEqual(['ccdf', 'lorenz', 'gini']);
    expect(hidden('lorenz')).toBe(false);
    expect(hidden('gini')).toBe(false);
    expect(hidden('turnover')).toBe(true);
    button('Effective number').click();
    s.hurry();
    expect(s.handoff?.kind).toBe('neff');
  });

  it('squares makes a new yard and keeps the pace selected with the buttons', () => {
    const s = new Session({ n: 16 });
    const { knob, button } = mount(s);
    s.rate = 16;
    button('Slower').click();
    expect(s.rate).toBe(8);
    // owner, 2026-10-22: squares in whole squares only, 2 × 2 … 31 × 31
    const squares = knob('squares');
    expect([squares.min, squares.max, squares.step]).toEqual(['2', '31', '1']);
    squares.value = '31';
    squares.dispatchEvent(new Event('input'));
    squares.dispatchEvent(new Event('change'));
    expect(s.game.n).toBe(961);
    // the pace asked for holds through the change: still one round a second
    expect(s.rate).toBe(480);
    squares.value = '5';
    squares.dispatchEvent(new Event('input'));
    expect(squares.getAttribute('aria-valuetext')).toBe('25 squares, 5 by 5');
    squares.dispatchEvent(new Event('change'));
    expect(s.game.n).toBe(25);
  });

  it('Gini and effective number keep separate frames and round axes within one stacked tile', () => {
    const s = new Session({ n: 16 });
    const { root, panel } = mount(s);
    Object.defineProperty(root, 'clientWidth', { value: 500 });
    const before = s.traded;
    s.run('fx off; round 10; handoff gini');
    // a round of 16 trading in pairs at a 10% stake moves a few percent of everything
    const perRound = (s.traded - before) / 10;
    expect(perRound).toBeGreaterThan(0.005);
    expect(perRound).toBeLessThan(0.1);
    // the tax is not trading
    const t = s.traded;
    s.run('levy 0.2');
    expect(s.traded).toBe(t);
    panel.update(5000);
    expect(root.querySelector<HTMLElement>('.tile.turnover')!.hidden).toBe(true);
    for (const kind of ['gini', 'neff']) {
      const tile = root.querySelector<HTMLElement>(`.tile.${kind}`)!;
      expect(tile.hidden).toBe(false);
      const frames = [...tile.querySelectorAll<SVGRectElement>('.chart .frame')];
      expect(frames).toHaveLength(1);
      expect(Number(frames[0].getAttribute('height'))).toBeLessThan(Number(frames[0].getAttribute('width')) / 2);
      expect(tile.parentElement?.classList.contains('time-stack')).toBe(true);
      expect(tile.querySelectorAll('.tick')).toHaveLength(4);
      expect([...tile.querySelectorAll('.chart .label')].some((label) => label.textContent?.startsWith('Round'))).toBe(true);
    }
    // in Learn (the Story shows what it has taught), no turnover
    panel.showing = { sliders: [], controls: [], charts: true, marks: [] };
    panel.update(6000);
    expect(root.querySelector<HTMLElement>('.tile.turnover')!.hidden).toBe(true);
  });

  it('owner 2026-10-22: charts as the sandbox has them: an axis click toggles log, a double-click fills the window, Escape gives it back', async () => {
    const s = new Session({ n: 16 });
    const { root, panel } = mount(s);
    s.run('fx off; round 30; handoff ccdf');
    panel.update(5000);
    const ccdf = root.querySelector<HTMLElement>('.tile.ccdf')!;
    const label = () => [...ccdf.querySelectorAll('.chart .label')].map((x) => x.textContent).join(' | ');
    expect(label()).toContain('(log)');
    // a click on the x axis, gated against double-clicks
    const xAxis = [...ccdf.querySelectorAll<SVGRectElement>('.chart .hit')].find((r) => r.getAttribute('aria-label')!.startsWith('Money share'))!;
    xAxis.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }));
    await new Promise((r) => setTimeout(r, 320));
    expect(label()).not.toContain('Money share (log)');
    ccdf.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(ccdf.classList.contains('zoomed')).toBe(true);
    expect(root.querySelector('.tile.placeholder')).not.toBeNull();
    dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ccdf.classList.contains('zoomed')).toBe(false);
    expect(root.querySelector('.tile.placeholder')).toBeNull();
  });

  it('owner 2026-10-22: fast forward runs fast and gives the pace back; the animation level is kept through a new yard', () => {
    const s = new Session({ n: 16 });
    const { button } = mount(s);
    const pairs = 8;
    const before = s.tradeRate / pairs;
    button('Fast forward').click();
    expect(button('Fast forward').getAttribute('aria-pressed')).toBe('true');
    expect(s.tradeRate / pairs).toBe(100);
    expect(s.playing).toBe(true);
    expect(s.transit.trade).toBe('off');
    // the tax at once too (owner, 2026-10-22)
    expect(s.transit.tax).toBe(false);
    button('Fast forward').click();
    expect(button('Fast forward').getAttribute('aria-pressed')).toBe('false');
    expect(s.tradeRate / pairs).toBeCloseTo(before, 9);
    expect(s.transit.trade).toBe('piece');
    expect(s.transit.tax).toBe(true);
    // slower: half the pace, to a round a second; then the animations themselves, to a quarter
    s.rate = 8 * pairs;
    button('Slower').click();
    expect(s.tradeRate / pairs).toBeCloseTo(4, 9);
    button('Slower').click();
    button('Slower').click();
    expect(s.tradeRate / pairs).toBeCloseTo(1, 9);
    button('Slower').click();
    expect(s.speed).toBe(0.5);
    button('Slower').click();
    button('Slower').click();
    expect(s.speed).toBe(0.25);
    // one button steps through the levels, its icon and name the one chosen: pieces, off, coins, pieces …
    button('Animation: Pieces').click();
    expect([s.transit.trade, s.transit.tax]).toEqual(['off', false]);
    button('Animation: Off').click();
    expect([s.transit.trade, s.transit.tax]).toEqual(['toss', true]);
    s.run('seed 5');
    expect(s.transit.trade).toBe('toss');
    button('Animation: Coins').click();
    expect(s.transit.trade).toBe('piece');
    expect(button('Animation: Pieces').querySelector('svg')).not.toBeNull();
  });

  it('a shared yard says what it shows, in its own numbers: the richest, a square, or you', () => {
    const s = new Session({ n: 16 });
    expect(sharedLine(s, -1)).toMatch(/Everyone starts equal\..*#FairAndSquare$/);
    s.run('round 40');
    const w = s.game.run.world.w;
    const top = w.indexOf(Math.max(...w));
    const pct = (x: number) => (Math.abs(x) >= 0.1 ? `${Math.round(100 * x)}%` : `${+(100 * x).toFixed(1)}%`);
    expect(sharedLine(s, -1)).toContain(`After 40 rounds, the richest of 16 squares has ${pct(s.rankOf(top)!.share)} of the money: ${(16 * s.rankOf(top)!.share).toFixed(1)} times an equal share.`);
    const r = s.rankOf(3)!;
    expect(sharedLine(s, 3)).toContain(`square #${r.rank} of 16 has ${pct(r.share)}`);
    s.run('be 3');
    expect(sharedLine(s, 3)).toContain(`I am square #${r.rank} of 16, with ${pct(r.share)}`);
  });

  it('a button the Story points at glows (`glow button <name>`), and stops', () => {
    const s = new Session({ n: 16 });
    const { root, panel } = mount(s);
    const share = root.querySelector<HTMLElement>('[data-control=share]')!;
    const card = root.querySelector<HTMLElement>('[data-control=card-share]')!;
    expect(card).toBeTruthy();
    s.run('glow button share');
    panel.update(2000);
    expect(share.classList.contains('glow')).toBe(true);
    expect(card.classList.contains('glow')).toBe(false);
    s.run('glow off');
    panel.update(3000);
    expect(share.classList.contains('glow')).toBe(false);
  });
});
