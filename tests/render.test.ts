import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../stage/console/session.ts';
import { StageView } from '../stage/view/render.ts';

/**
 * The renderer against a recording canvas: no browser, no GPU. Every number
 * handed to the context must be finite and within reason, and a frame must
 * stay a bounded number of calls.
 */
let calls = 0;
let bad: string[] = [];
/** Every text drawn, in order. */
let texts: string[] = [];

function recorder(): CanvasRenderingContext2D {
  const state: Record<string, unknown> = {};
  return new Proxy(state, {
    get(target, key: string) {
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        calls++;
        if (key === 'fillText') texts.push(String(args[0]));
        for (const a of args) {
          if (typeof a === 'number' && !(Math.abs(a) < 1e6)) bad.push(`${key}(${args.join(', ')})`);
        }
        if (key === 'measureText') return { width: 10 };
        return undefined;
      };
    },
    set(target, key: string, value) {
      if (typeof value === 'number' && !Number.isFinite(value)) bad.push(`${key} = ${value}`);
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function canvas(width = 1200, height = 800): HTMLCanvasElement {
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
  g.window = { devicePixelRatio: 2 };
  g.getComputedStyle = () => ({ getPropertyValue: () => '' });
  g.Path2D = class {
    constructor(d?: string) {
      if (d !== undefined && /NaN|Infinity/.test(d)) bad.push(`Path2D(${d.slice(0, 40)})`);
    }
  };
});
afterAll(() => {
  const g = globalThis as Record<string, unknown>;
  for (const k of Object.keys(saved)) g[k] = saved[k];
});

function frames(s: Session, view: StageView, seconds: number, now: { t: number }): number {
  let most = 0;
  for (let f = 0; f < seconds * 60; f++) {
    s.frame(1 / 60);
    now.t += 1000 / 60;
    calls = 0;
    view.render(s, 1 / 60, now.t);
    most = Math.max(most, calls);
  }
  return most;
}

describe('renderer', () => {
  it('draws every state with sane numbers and bounded work', () => {
    bad = [];
    const s = new Session({ n: 36 });
    const view = new StageView(canvas());
    const now = { t: 0 };
    let most = frames(s, view, 1, now);
    s.run('rule tax 0.05; play 120');
    most = Math.max(most, frames(s, view, 4, now));
    expect(s.transit.trades.length + (s.transit.levy ? 1 : 0)).toBeGreaterThanOrEqual(0);
    s.run('pause; trade 3000; neff');
    most = Math.max(most, frames(s, view, 7, now));
    s.run('zoom chart; ccdf');
    most = Math.max(most, frames(s, view, 6, now));
    s.run('log; drag lift; still; look dots; axes on');
    most = Math.max(most, frames(s, view, 3, now));
    s.run('room; levy 0.5');
    most = Math.max(most, frames(s, view, 3, now));
    s.run('fx sync on; fx trade bet; play');
    most = Math.max(most, frames(s, view, 3, now));
    s.run('n 400; fx sync off; fx trade piece; play 400; room');
    most = Math.max(most, frames(s, view, 2, now));
    s.run('levy 0.3');
    most = Math.max(most, frames(s, view, 3, now));
    expect(bad.slice(0, 5)).toEqual([]);
    // a frame of 400 people with faces, rings and pieces stays in the low tens of thousands of calls
    expect(most).toBeLessThan(60_000);
  });

  it('a bad camera never reaches the canvas', () => {
    bad = [];
    const s = new Session({ n: 10 });
    const view = new StageView(canvas(0, 0));
    const now = { t: 0 };
    frames(s, view, 0.5, now);
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('N_eff: frames numbered 1, 2, 3, …; the count beside the box steps by one, then takes the fraction', () => {
    const s = new Session({ n: 36 });
    s.run('fx off; trade 3000; neff; finish');
    const view = new StageView(canvas());
    const now = { t: 0 };
    let sq = 0;
    for (const w of s.game.wealth) sq += w * w;
    const neff = (1 / sq).toFixed(1);
    const copies = s.figure.prints.length + 1;
    // while printing: the count beside the box is a whole number, never more than the frames landed
    const seen: string[] = [];
    for (let f = 0; f < 12 * 60; f++) {
      s.frame(1 / 60);
      now.t += 1000 / 60;
      texts = [];
      view.render(s, 1 / 60, now.t);
      if (texts.length) seen.push(texts.at(-1)!);
    }
    const steps = [...new Set(seen)];
    expect(steps.at(-1)).toBe(neff);
    const whole = steps.slice(0, -1).map(Number);
    expect(whole).toEqual(Array.from({ length: copies }, (_, k) => k + 1));
    // at the end: every frame numbered, in order, then N_eff
    expect(texts).toEqual([...Array.from({ length: copies }, (_, k) => String(k + 1)), neff]);
  });
});
