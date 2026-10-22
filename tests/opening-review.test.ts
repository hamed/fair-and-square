/**
 * Regressions for REVIEW-2026-10-18-OPENING.md and its recheck, one per
 * finding, each from the review's own reproduction.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Session } from '../stage/console/session.ts';
import { parseRecipe } from '../stage/core/recipe.ts';
import { temperament } from '../stage/essay/face/moments.ts';
import type { Glyph, Ink } from '../stage/view/logo.ts';
import { awaitFonts } from '../stage/view/fonts.ts';
import { keyAction } from '../stage/view/keys.ts';
import { BUTTONS, NAME, OPENING_END, Opening, bodiesAt, castOf, drawHeader, headerAt, headerHeight, type Type } from '../stage/view/opening.ts';
import { StageView, type Frame } from '../stage/view/render.ts';

// ———————————————————————————————————————— a canvas without a browser

/** What each fillText saw: its text and the context's alignment then. */
let texts: { text: string; align: string }[] = [];

function recorder(): CanvasRenderingContext2D {
  const state: Record<string, unknown> = { textAlign: 'start' };
  const stack: Record<string, unknown>[] = [];
  return new Proxy(state, {
    get(target, key: string) {
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        if (key === 'fillText') texts.push({ text: String(args[0]), align: String(target.textAlign) });
        if (key === 'save') stack.push({ ...target });
        if (key === 'restore') Object.assign(target, stack.pop() ?? {});
        if (key === 'measureText') return { width: 10 };
        if (key === 'getImageData') return { data: new Uint8ClampedArray(4) };
        return undefined;
      };
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function canvas(width = 800, height = 800): HTMLCanvasElement {
  const ctx = recorder();
  return {
    width: 0,
    height: 0,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0 }),
  } as unknown as HTMLCanvasElement;
}

const saved: Record<string, unknown> = {};
beforeAll(() => {
  const g = globalThis as Record<string, unknown>;
  for (const k of ['window', 'getComputedStyle', 'Path2D']) saved[k] = g[k];
  g.window = { devicePixelRatio: 1 };
  g.getComputedStyle = () => ({ getPropertyValue: () => '' });
  g.Path2D = class {};
});
afterAll(() => {
  const g = globalThis as Record<string, unknown>;
  for (const k of Object.keys(saved)) g[k] = saved[k];
});

// ———————————————————————————————————————— lettering without fonts: a plausible stand-in

function run(text: string, family = 'Gelasio', weight = 400): { glyphs: Glyph[]; ink: Ink } {
  const glyphs = [...text].map((ch, k) => ({ ch, x: 0.5 * k, family, weight, size: 1 }));
  return { glyphs, ink: { left: 0.02, right: 0.5 * text.length - 0.02, top: -0.77, bottom: 0.23 } };
}

function fakeType(): Type {
  const fair = run('fair', 'Gelasio', 700);
  const amp = run('&', 'Gelasio', 700);
  const mark = run('fair & ', 'Gelasio', 700);
  const name = run(NAME);
  const buttons = BUTTONS.map((b) => {
    const r = run(b.label);
    return { label: r.glyphs, ink: r.ink };
  });
  return {
    letters: { fair: { glyphs: fair.glyphs, x: 0, y: -0.011, em: 0.385 }, amp: { glyphs: amp.glyphs, x: 0.77, y: -0.011, em: 0.3 }, dot: 0.07, top: -0.31 },
    mark: { glyphs: mark.glyphs, square: { x: 3.2, side: 0.7, stroke: 0.09 }, width: 3.9, ink: { left: 0, right: 3.9, top: -0.75, bottom: 0.02 } },
    foot: 0.02,
    low: 0.02,
    name: { glyphs: name.glyphs, ink: name.ink, feet: name.ink },
    buttons,
    up: 0.77,
    down: 0.23,
    wide: Math.max(...buttons.map((b) => b.ink.right - b.ink.left)),
  };
}

function opening(s: Session, c = canvas()): Opening {
  const view = new StageView(c);
  return new Opening(c, s, view, fakeType(), castOf(s)!);
}

const fresh = () => new Session({ n: 16, recipe: parseRecipe('fold') });

/** The yard as a phone or a desk shows it, with room kept for the line above it (as main.ts sets it up); `commands` shape it first. */
function frameAt(width: number, height = width, commands = '', clear = 0): Frame {
  const view = new StageView(canvas(width, height));
  view.clearTop = clear;
  const type = fakeType();
  view.ornament = { draw: () => {}, height: (f) => headerHeight(type, f) };
  const s = fresh();
  if (commands) s.run(commands);
  return view.settle(s).header;
}

describe('opening review 2026-10-18', () => {
  it('1: fonts that fail, or never come, give way to the stage; fonts that come late still bring the title', async () => {
    vi.useFakeTimers();
    try {
      const failed = { ready: vi.fn(), failed: vi.fn() };
      awaitFonts(Promise.reject(new Error('blocked')), 4000, failed);
      await vi.advanceTimersByTimeAsync(0);
      expect(failed.failed).toHaveBeenCalledTimes(1);
      expect(failed.ready).not.toHaveBeenCalled();

      let arrive = () => {};
      const slow = { ready: vi.fn(), failed: vi.fn() };
      awaitFonts(new Promise<void>((r) => (arrive = r)), 4000, slow);
      await vi.advanceTimersByTimeAsync(4000);
      expect(slow.failed).toHaveBeenCalledTimes(1);
      arrive();
      await vi.advanceTimersByTimeAsync(0);
      expect(slow.ready).toHaveBeenCalledTimes(1);
      expect(slow.failed).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('2: skipped at any point, the stage gets the faces it would have had at the end, not the logo’s', () => {
    const s = fresh();
    const natural = opening(s);
    natural.start();
    natural.frame(OPENING_END);
    for (const at of [0, 1, 4.5, 7]) {
      const op = opening(s);
      if (at > 0) op.seek(at);
      op.skip();
      for (let p = 0; p < 16; p++) {
        const t = temperament(p * 13 + 5 + s.game.seed * 7919);
        expect(op.field.d0[p]).toBeCloseTo(t.d0, 12);
        expect(op.field.drift[p]).toBeCloseTo(t.drift, 12);
        expect(op.field.contemptTo[p]).toBe(0);
        expect(op.field.d0[p]).toBeCloseTo(natural.field.d0[p], 12);
      }
    }
  });

  it('3: while the big one gives back, no two squares on the ground overlap; only those in the air pass over', () => {
    let worst = 0;
    for (let t = 6; t <= OPENING_END; t += 1 / 120) {
      const b = bodiesAt(t);
      for (let i = 0; i < b.length; i++)
        for (let j = i + 1; j < b.length; j++) {
          if (b[i].lift > 0 || b[j].lift > 0) continue;
          const w = Math.min(b[i].x + b[i].side, b[j].x + b[j].side) - Math.max(b[i].x, b[j].x);
          const h = Math.min(b[i].y + b[i].side, b[j].y + b[j].side) - Math.max(b[i].y, b[j].y);
          if (w > 1e-9 && h > 1e-9) worst = Math.max(worst, w * h);
        }
    }
    expect(worst).toBe(0);
  });

  it('4: a command that rebuilds the stage during the opening keeps the opening’s faces out of it', () => {
    const s = fresh();
    const op = opening(s);
    expect(op.belongsTo(s)).toBe(true);
    s.run('seed 2');
    expect(op.belongsTo(s)).toBe(false);
    // the same count, rebuilt: new people's faces, not these
    const t = fresh();
    const again = opening(t);
    t.run('n 16');
    expect(again.belongsTo(t)).toBe(false);
    // a reset keeps the people (and their dice): their faces may go on
    const u = fresh();
    const kept = opening(u);
    u.run('reset');
    expect(kept.belongsTo(u)).toBe(true);
  });

  it('5: the line above the yard is lettered left to right whatever alignment the canvas was left in', () => {
    const c = canvas();
    const ctx = c.getContext('2d')!;
    ctx.textAlign = 'end';
    texts = [];
    drawHeader(ctx, fakeType(), frameAt(800), false);
    expect(texts.length).toBeGreaterThan(0);
    expect(new Set(texts.map((t) => t.align))).toEqual(new Set(['left']));
    expect(ctx.textAlign).toBe('end');
  });

  it('N1: Space or Enter on a focused button does what the button does; on the page it starts, skips, plays', () => {
    for (const opening of ['waiting', 'held', 'unfolding', 'none'] as const) {
      expect(keyAction(' ', 'control', opening)).toBe('native');
      expect(keyAction('Enter', 'control', opening)).toBe('native');
    }
    expect(keyAction(' ', 'page', 'held')).toBe('start');
    expect(keyAction('Enter', 'page', 'held')).toBe('start');
    expect(keyAction(' ', 'page', 'unfolding')).toBe('skip');
    expect(keyAction('Escape', 'page', 'held')).toBe('skip');
    expect(keyAction('Escape', 'control', 'unfolding')).toBe('skip');
    expect(keyAction(' ', 'page', 'none')).toBe('play-pause');
    expect(keyAction(' ', 'console', 'held')).toBe('none');
    expect(keyAction('`', 'console', 'none')).toBe('toggle-console');
  });

  it('N2: a chart filling the screen leaves the line where it was, in view, and fills the space below it', () => {
    const s = fresh();
    s.run('fx off; trade 500');
    const view = new StageView(canvas(800, 800));
    const seen: Frame[] = [];
    view.ornament = { draw: (_ctx, f) => void seen.push(f), height: () => 40 };
    const settle = (seconds: number) => {
      for (let k = 0; k < seconds * 60; k++) {
        s.frame(1 / 60);
        view.render(s, 1 / 60, k * 16);
      }
    };
    settle(2);
    const yard = seen.at(-1)!;
    const yardScale = view.settle(s).scale;
    s.run('zoom chart; finish');
    settle(3);
    const chart = seen.at(-1)!;
    expect(chart.top).toBeCloseTo(yard.top, 1);
    expect(chart.left).toBeCloseTo(yard.left, 1);
    expect(chart.right).toBeCloseTo(yard.right, 1);
    expect(chart.top).toBeGreaterThanOrEqual(40);
    // the chart itself is zoomed in, under the line
    expect(view.settle(s).scale).toBeGreaterThan(1.3 * yardScale);
  });

  it('N3: on a phone, a short canvas or a narrow yard, the tabs stay pressable (24 px) and the lettering readable, nothing overlapping or off screen', () => {
    const cases: [number, number, string][] = [
      [320, 320, ''],
      [390, 390, ''],
      [840, 840, ''],
      [1200, 1200, ''],
      // a short canvas, and a tall figure that leaves the yard narrow on screen (the recheck's reproductions)
      [320, 180, ''],
      [320, 400, 'col .01 free; finish'],
      [390, 300, 'col .01 free; finish'],
      [840, 500, 'col .01 free; finish'],
    ];
    for (const [width, height, commands] of cases) {
      // in portrait the console's toggle lies over the canvas's top-right corner: the line keeps below it
      const clear = width < 720 ? 30 : 0;
      const f = frameAt(width, height, commands, clear);
      const h = headerAt(fakeType(), f);
      const boxes = h.buttons.map((b) => ({ x0: b.x, x1: b.x + b.w, y0: b.y, y1: b.y + b.h }));
      for (const b of boxes) {
        expect(b.y1 - b.y0).toBeGreaterThanOrEqual(24);
        expect(b.x0).toBeGreaterThanOrEqual(0);
        expect(b.x1).toBeLessThanOrEqual(width);
        expect(b.y0).toBeGreaterThanOrEqual(clear);
      }
      expect(h.title.em).toBeGreaterThanOrEqual(18);
      expect(h.name.em).toBeGreaterThanOrEqual(13);
      // the title and the name: their ink on screen, apart from each other and from every tab
      const type = fakeType();
      const ink = (pen: { x: number; y: number; em: number }, i: Ink) => ({ x0: pen.x + i.left * pen.em, x1: pen.x + i.right * pen.em, y0: pen.y + i.top * pen.em, y1: pen.y + i.bottom * pen.em });
      const words = [ink(h.title, type.mark.ink), ink(h.name, type.name.ink)];
      const all = [...words, ...boxes];
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) {
          const a = all[i];
          const b = all[j];
          const apart = a.x1 <= b.x0 + 1e-6 || b.x1 <= a.x0 + 1e-6 || a.y1 <= b.y0 + 1e-6 || b.y1 <= a.y0 + 1e-6;
          expect(apart, `${width}px: ${i} and ${j}`).toBe(true);
        }
      for (const w of words) {
        expect(w.x0).toBeGreaterThanOrEqual(0);
        expect(w.x1).toBeLessThanOrEqual(width);
        expect(w.y0).toBeGreaterThanOrEqual(clear);
      }
    }
  });
});

describe('REVIEW-2026-10-20-FULL, finding 10: the reader’s reduced motion reaches the opening', () => {
  it('held, the logo’s gazes hold still; started, the yard is there at once', () => {
    const s = fresh();
    const c = canvas();
    const view = new StageView(c);
    view.reduced = true;
    const o = new Opening(c, s, view, fakeType(), castOf(s)!);
    const looks: string[][] = [];
    const look = vi.spyOn(o.field, 'look');
    for (let k = 0; k < 4; k++) {
      look.mockClear();
      o.frame(0.7);
      looks.push(look.mock.calls.map((call) => call.join(',')));
    }
    // the same gaze, frame after frame: no drift about it
    for (const l of looks) expect(l).toEqual(looks[0]);
    o.start();
    expect(o.done).toBe(true);
  });
});

describe('owner, 2026-10-21: Learn pressed on the logo', () => {
  it('the unfolding lands with Learn open into the yard, never Play', () => {
    // an open tab is a strip of floor over the wall under it (WALL_OUT + 1 tall): every one drawn, recorded
    const opened: { x: number; y: number }[] = [];
    const base = recorder();
    const ctx = new Proxy(base, {
      get: (t, k) => (k === 'fillRect' ? (x: number, y: number, _w: number, h: number) => (h === 4 ? opened.push({ x, y }) : undefined) : Reflect.get(t, k)),
      set: (t, k, v) => Reflect.set(t, k, v),
    });
    const c = { width: 0, height: 0, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 800, right: 800, bottom: 800, x: 0, y: 0 }) } as unknown as HTMLCanvasElement;
    const s = fresh();
    const o = new Opening(c, s, new StageView(c), fakeType(), castOf(s)!);
    o.current = 'story';
    o.start();
    for (let t = 0; t < OPENING_END + 1 && !o.done; t += 1 / 60) o.frame(1 / 60);
    expect(o.done).toBe(true);
    expect(opened.length).toBeGreaterThan(0);
    const learn = o.controls[BUTTONS.findIndex((b) => b.id === 'story')]!;
    for (const r of opened) expect(r.x > learn.x0 && r.x < learn.x1, `open at x ${r.x.toFixed(1)}`).toBe(true);
  });
});

describe('owner, 2026-10-21: the lockup', () => {
  it('its face follows the Gini: smiling, uneasy, sad, within a second or two; its name in words, English', async () => {
    const { LockupFace, moodOf } = await import('../stage/view/lockup.ts');
    const { LOCKUP_LABEL } = await import('../stage/view/logo.ts');
    expect(LOCKUP_LABEL).toBe('Fair and Square');
    const [happy] = moodOf(0);
    const [uneasy, aroused] = moodOf(0.3);
    const [sad] = moodOf(0.8);
    expect(happy).toBeGreaterThan(0.5);
    expect(Math.abs(uneasy)).toBeLessThan(0.1);
    expect(aroused).toBeGreaterThan(0.2);
    expect(sad).toBeLessThan(-0.5);
    const face = new LockupFace();
    const mouth = () => (face as unknown as { faces: { field: { poseOf(i: number, r: boolean): { pose: { expression?: { mouthCurve: number } } } } } }).faces.field.poseOf(0, false).pose.expression?.mouthCurve ?? 0;
    for (let k = 0; k < 120; k++) face.update(0, 1 / 60);
    expect(mouth()).toBeGreaterThan(0.3);
    for (let k = 0; k < 120; k++) face.update(0.8, 1 / 60);
    expect(mouth()).toBeLessThan(-0.2);
  });
});
