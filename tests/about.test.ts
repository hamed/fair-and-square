// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { beforeAll, describe, expect, it } from 'vitest';
import { COLOR_NAMES } from '../stage/essay/agentStyle.ts';
import { FEELINGS } from '../stage/essay/face/moments.ts';
import { Cast, temperOf } from '../stage/about/cast.ts';
import { LOGOS } from '../stage/about/logos.ts';
import { Family, Market, interval, playOut } from '../stage/about/market.ts';
import { ACTS } from '../stage/about/solo.ts';
import { passItOn } from '../stage/about/squares.ts';
import { clips } from '../stage/about/clips.ts';
import { existsSync, readdirSync } from 'node:fs';

// the pages themselves (vitest runs from the stage's root; under jsdom import.meta.url is not a file URL)
const read = (path: string) => new DOMParser().parseFromString(readFileSync(resolve(cwd(), path), 'utf8'), 'text/html');
const page = read('about.html');
const making = read('making-of.html');
/** Every page that draws squares in its prose: About, and How it was made. */
const pages = [page, making];
/** The family figure (the prototypes carry it; About no longer does, owner 2026-10-22): its words are data. */
const family = new DOMParser().parseFromString(
  `<figure class="family" data-family data-names="me|my wife|twelve|six|five" data-colours="blue|red|green|teal|violet"
    data-heights="1|0.93|0.86|0.67|0.63" data-seed="503" data-stake="0.3" data-until="0.8"
    data-won-0="I end up with {p} of the chocolate. Merit, obviously." data-won-1="My wife ends up with {p} of the chocolate. She says it was merit."
    data-won-2="The twelve-year-old ends up with {p} of the chocolate. He says it was merit." data-won-3="The six-year-old ends up with {p} of the chocolate. He says it was merit."
    data-won-4="The five-year-old ends up with {p} of the chocolate. She says it was merit." data-led="For a while, I was winning." data-count="{n} trades"
    data-play="▶ Share out the chocolate" data-pause="❚❚ Pause" data-resume="▶ Go on" data-again="↻ Again">
    <div class="photo"></div><figcaption><button type="button" class="play">▶ Share out the chocolate</button><span class="result" aria-live="polite"></span></figcaption></figure>`,
  'text/html',
).querySelector<HTMLElement>('[data-family]')!;
const list = (s: string | undefined) => (s ?? '').split('|');

describe('the about page, as data', () => {
  it('declares only squares it can draw: kinds, colours, feelings, stickers and acts that exist', () => {
    const squares = pages.flatMap((p) => [...p.querySelectorAll<HTMLElement>('[data-sq]')]);
    expect(squares.length).toBeGreaterThan(10);
    for (const el of squares) {
      const d = el.dataset;
      // main.ts KINDS
      expect(['', 'one', 'pair', 'party']).toContain(d.sq);
      if (d.sq === 'pair' || d.sq === 'party') for (const c of list(d.colours)) expect(COLOR_NAMES).toContain(c);
      if (d.sq === 'party') {
        const n = list(d.colours).length;
        expect(list(d.heights)).toHaveLength(n);
        expect(list(d.drinks)).toHaveLength(n);
        for (const drink of list(d.drinks)) expect(['coffee', 'cocoa']).toContain(drink);
      }
      if (d.colour) expect(COLOR_NAMES).toContain(d.colour);
      if (d.feel) expect(Object.keys(FEELINGS)).toContain(d.feel);
      if (d.logo) expect(Object.keys(LOGOS)).toContain(d.logo);
      if (d.act) expect(Object.keys(ACTS)).toContain(d.act);
      if (d.size) expect(Number(d.size)).toBeGreaterThan(0);
    }
  });

  it('gives the family one name, colour, height and result line each', () => {
    const d = family.dataset;
    const names = list(d.names);
    expect(names).toHaveLength(5);
    expect(list(d.colours)).toHaveLength(5);
    for (const c of list(d.colours)) expect(COLOR_NAMES).toContain(c);
    for (const h of list(d.heights)) expect(Number(h)).toBeGreaterThan(0);
    names.forEach((_, i) => expect(d[`won-${i}`]).toContain('{p}'));
    expect(d.count).toContain('{n}');
  });

  it('his own words, then the gift, then each clip beside the formula it draws (LaTeX\'s, on disk, said in words)', () => {
    const order = [...page.querySelectorAll('main > section')].map((x) => x.id);
    expect(order).toEqual(['hello', 'gift', 'pictures', 'play', 'elsewhere']);
    expect(page.querySelector('.kicker')!.textContent).toBe('Physicist. I build models you can play with.');
    const rows = [...page.querySelectorAll<HTMLElement>('#pictures figure.row')];
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      const v = r.querySelector<HTMLVideoElement>('video[data-clip]')!;
      expect(existsSync(resolve(cwd(), 'public', v.getAttribute('poster')!))).toBe(true);
      const sources = [...v.querySelectorAll('source')].map((x) => x.getAttribute('src')!);
      expect(sources.map((x) => x.split('.').pop())).toEqual(['webm', 'mp4']);
      for (const src of sources) expect(existsSync(resolve(cwd(), 'public', src))).toBe(true);
      expect(v.hasAttribute('autoplay')).toBe(false);
      expect(v.getAttribute('aria-label')).toBeTruthy();
      // the clip first, then its formula (the one in the picture, owner 2026-10-22) and its words
      expect(r.firstElementChild).toBe(v);
      const tex = r.querySelector('figcaption img.tex')!;
      expect(existsSync(resolve(cwd(), 'public', tex.getAttribute('src')!))).toBe(true);
      expect((tex.getAttribute('alt') ?? '').length).toBeGreaterThan(20);
    }
    // every clip on the page is on disk, and nothing on disk is left unused
    const used = new Set([...page.querySelectorAll('#pictures source, #pictures video')].map((x) => (x.getAttribute('src') ?? x.getAttribute('poster'))!.replace('about/', '')));
    for (const f of readdirSync(resolve(cwd(), 'public/about')).filter((x) => /\.(mp4|webm|jpg)$/.test(x))) expect(used.has(f), f).toBe(true);
  });

  it('asks for nothing directly: no button, LinkedIn only among the links; the gift in his words, the family drinking, Ko-fi and PayPal as squares', () => {
    expect(page.querySelectorAll('a.button')).toHaveLength(0);
    expect(page.querySelector('#work')).toBeNull();
    const linkedin = [...page.querySelectorAll('a[href*="linkedin.com"]')];
    expect(linkedin).toHaveLength(1);
    expect(linkedin[0].closest('section')?.id).toBe('elsewhere');
    expect(page.querySelector('#gift')!.textContent).toContain('a small gift warms my heart');
    expect(page.querySelector('#gift [data-sq="party"]')).toBeTruthy();
    const give = [...page.querySelectorAll<HTMLAnchorElement>('#gift .give a')];
    expect(give.map((a) => a.querySelector<HTMLElement>('[data-logo]')!.dataset.logo)).toEqual(['kofi', 'paypal']);
    for (const a of give) expect(a.getAttribute('href')).toMatch(/^https:\/\//);
    // no employers named (owner, 2026-10-22), no family game, no share pitch
    expect(page.body.textContent).not.toMatch(/Zalando|Delivery Hero/);
    expect(page.querySelector('[data-family]')).toBeNull();
    expect(page.querySelector('[data-share-link]')).toBeNull();
    // the book shop has its own square, reading
    expect(page.querySelector('#elsewhere [data-act="read"]')).toBeTruthy();
  });

  it('wears the stage title: "fair&" with no space, then the live square, and the name in words', () => {
    const mark = page.querySelector('.mark a')!;
    expect(mark.textContent).toBe('fair&');
    expect(mark.querySelector('.amp')?.textContent).toBe('&');
    expect(mark.querySelector('canvas')?.getAttribute('aria-hidden')).toBe('true');
    expect(mark.getAttribute('aria-label')).toBe('Fair and Square');
  });

  it('credits with checkable links, and says when a link pays', () => {
    for (const a of page.querySelectorAll('#thanks a')) expect(a.getAttribute('href')).toMatch(/^https:\/\/(arxiv\.org|doi\.org)\//);
    expect(page.querySelector('#elsewhere a[href^="https://a.co"]')).toBeTruthy();
    expect(page.querySelector('#elsewhere .disclose')!.textContent).toBe('As an Amazon Associate I earn from qualifying purchases.');
    expect(page.querySelector('#elsewhere a[href="https://www.youtube.com/@allaei"]')).toBeTruthy();
  });

  it("opens with the game its words were written for: the youngest wins, after I led for a while", () => {
    const d = family.dataset;
    const m = new Market(5, Number(d.seed), Number(d.stake));
    let peak = 0;
    playOut(m, Number(d.until), 2000, () => (peak = Math.max(peak, m.shown[0])));
    const [winner, share] = m.top();
    expect(winner).toBe(4);
    expect(share).toBeGreaterThanOrEqual(Number(d.until));
    expect(peak).toBeGreaterThanOrEqual(0.5);
  });
});

describe('how it was made', () => {
  it('every version has its picture on disk, said in words, and what stayed and what went; the last is the game, playing', () => {
    const entries = [...making.querySelectorAll('.log > li')];
    expect(entries.length).toBe(7);
    entries.slice(0, -1).forEach((li) => {
      const img = li.querySelector('img')!;
      expect(existsSync(resolve(cwd(), 'public', img.getAttribute('src')!))).toBe(true);
      expect(img.getAttribute('alt')).toBeTruthy();
      expect(li.querySelector('.fate .kept')).toBeTruthy();
      expect(li.querySelectorAll('.fate li')).toHaveLength(2);
    });
    expect(entries[entries.length - 1].querySelector('video[data-clip]')).toBeTruthy();
    // no count of commits up front (review 2026-10-22, dialogue 6): only the defined inventory, at the end
    expect(making.querySelector('header')!.textContent).not.toMatch(/\d{3} commits/);
    // who Hamed was in Blue and Red is not the page's business (owner, 2026-10-22)
    expect(making.body.textContent).not.toMatch(/I am still/);
  });
});

describe('the clips', () => {
  it('each gets a play/pause button; paused by the reader, scrolling back does not start it again', () => {
    let seen: (entries: { target: Element; isIntersecting: boolean }[]) => void = () => {};
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
      constructor(cb: typeof seen) {
        seen = cb;
      }
      observe(): void {}
    };
    let plays = 0;
    const paused = new WeakMap<HTMLMediaElement, boolean>();
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get(this: HTMLMediaElement) { return paused.get(this) ?? true; } });
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      plays++;
      paused.set(this, false);
      this.dispatchEvent(new Event('play'));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
      paused.set(this, true);
      this.dispatchEvent(new Event('pause'));
    };
    document.body.innerHTML = '<video data-clip autoplay></video>';
    clips(document, false);
    const v = document.querySelector('video')!;
    const toggle = document.querySelector<HTMLButtonElement>('.clip-frame .clip-toggle')!;
    expect(v.hasAttribute('autoplay')).toBe(false);
    expect(toggle.getAttribute('aria-label')).toBe('Play');
    seen([{ target: v, isIntersecting: true }]);
    expect(plays).toBe(1);
    expect(toggle.getAttribute('aria-label')).toBe('Pause');
    toggle.click();
    expect(v.paused).toBe(true);
    seen([{ target: v, isIntersecting: false }]);
    seen([{ target: v, isIntersecting: true }]);
    expect(plays).toBe(1);
    toggle.click();
    expect(plays).toBe(2);
  });
});

describe('the family on the page', () => {
  beforeAll(() => {
    // no canvas in jsdom: nothing is drawn here, only played and said
    HTMLCanvasElement.prototype.getContext = (() => ({})) as unknown as HTMLCanvasElement['getContext'];
  });

  it('plays to the end when motion is reduced, and says who won in the page’s own words', () => {
    document.body.innerHTML = family.outerHTML;
    const el = document.querySelector<HTMLElement>('[data-family]')!;
    const f = new Family(el);
    f.bind(new Cast(f.faces, true), 0);
    const button = el.querySelector('button')!;
    expect(button.textContent).toBe(el.dataset.play);
    button.click();
    const said = el.querySelector('.result')!.textContent ?? '';
    expect(said).toMatch(/^The five-year-old ends up with 8\d% of the chocolate\./);
    expect(said).toContain(el.dataset.led);
    expect(button.textContent).toBe(el.dataset.again);
  });
});

describe('the parts', () => {
  it('holds a feeling word as a temperament, and anything else as an everyday one', () => {
    const t = temperOf('annoyed', 1);
    expect(t.v0).toBeLessThan(0);
    expect(t.d0).toBeGreaterThan(0);
    expect(temperOf('nonsense', 7)).toEqual(temperOf(undefined, 7));
  });

  it('trades slowly at first, then quicker, never quicker than the floor', () => {
    expect(interval(0)).toBeCloseTo(0.9);
    for (let k = 1; k < 200; k++) expect(interval(k)).toBeLessThanOrEqual(interval(k - 1));
    expect(interval(1000)).toBe(0.075);
  });

  it('keeps every jelly bean: what is in the air is off its loser and not yet on its winner', () => {
    const m = new Market(5, 3, 0.3);
    const f = m.trade(0, 0.5, 0.5)!;
    const sum = () => m.shown.reduce((a, b) => a + b, 0);
    m.advance(0.6, () => {});
    expect(sum()).toBeCloseTo(1 - f.amount, 12);
    m.advance(1.1, () => {});
    expect(sum()).toBeCloseTo(1, 12);
    expect(m.flights).toHaveLength(0);
  });
});

describe('the review of 2026-10-22, fixed', () => {
  const button = () => {
    document.body.innerHTML = '<p><button type="button" data-share-link="./" data-text="A line." data-copied="Link copied">Pass it on</button></p>';
    passItOn(document);
    return document.querySelector('button')!;
  };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  const nav = navigator as unknown as { share?: unknown; clipboard?: unknown };

  it('3: Pass it on falls back from a failed share sheet to the clipboard, line and link together', async () => {
    const copied: string[] = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: () => Promise.reject(new Error('no')) });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t: string) => (copied.push(t), Promise.resolve()) } });
    const b = button();
    b.click();
    await settle();
    await settle();
    expect(copied).toHaveLength(1);
    expect(copied[0]).toMatch(/^A line\. http/);
    expect(b.textContent).toBe('Link copied');
  });

  it('3: a cancelled share sheet stays quiet; with no clipboard either, the link is shown, selected', async () => {
    const copied: string[] = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: () => Promise.reject(new DOMException('cancel', 'AbortError')) });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t: string) => (copied.push(t), Promise.resolve()) } });
    button().click();
    await settle();
    expect(copied).toHaveLength(0);
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } });
    button().click();
    await settle();
    await settle();
    const box = document.querySelector<HTMLInputElement>('input.link')!;
    expect(box).toBeTruthy();
    expect(box.value).toMatch(/^http/);
    delete nav.share;
  });

  it('4: with motion reduced, the camera does not flash', () => {
    const act = ACTS.flash();
    const b = { cx: 10, cy: 10, side: 20, tiltTo: 0, face: 0 } as unknown as Parameters<typeof act.tick>[0];
    let drawn = 0;
    const ctx = new Proxy({}, { get: (_t, k) => (k === 'createRadialGradient' ? () => ((drawn++), { addColorStop() {} }) : () => undefined), set: () => true }) as CanvasRenderingContext2D;
    // t = 2.8 s: 0.2 s into the flash
    act.tick(b, { reduced: true } as Cast, 2.8, 0.016);
    act.draw!(ctx, b, 2.8);
    expect(drawn).toBe(0);
    const moving = ACTS.flash();
    moving.tick(b, { reduced: false, field: { feel() {}, look() {} } } as unknown as Cast, 2.8, 0.016);
    moving.draw!(ctx, b, 2.8);
    expect(drawn).toBe(1);
  });
});
