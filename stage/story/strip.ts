/**
 * The Story's screen: as little as can be beside Play's own. Over the yard's top: the words, large and centred,
 * and the guess when there is one (in pictures). Everything else is in the panel, where it is in Play: in place
 * of its run controls, a row to move about (back, the acts, Show me, Next); then the sliders and buttons the story
 * has revealed so far (the panel's own); last, the beat's own controls (the line's twin, the program as a few
 * blocks). A view: it shows what the runner says and forwards what the reader does. Every canvas action has a
 * control too, so a keyboard or a screen reader can do every beat.
 */
import { FILLS, STROKES } from '../essay/agentStyle.ts';
import { colourOf } from '../view/render.ts';
import type { Showing } from '../view/panel.ts';
import { ACT_STARTS } from './beats.ts';
import type { StoryRunner } from './runner.ts';
import { STORY, type ChoiceKey } from './words.en.ts';
import { programView, type ProgramView } from './program.ts';
import { wear } from '../view/icons.ts';

export class Strip {
  readonly root: HTMLElement;
  /** Over the yard's top: the words and the guess. main.ts keeps the room clear of it. */
  readonly say: HTMLElement;
  /** The panel's rows the story lends it: its way about (first), its own controls (last). */
  readonly lead: HTMLElement;
  readonly controls: HTMLDivElement;
  readonly words: HTMLParagraphElement;
  private readonly spoken: HTMLParagraphElement;
  private readonly guess: HTMLDivElement;
  private readonly back: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly show: HTMLButtonElement;
  private readonly acts: HTMLButtonElement[] = [];
  private readonly progress: HTMLSpanElement[] = [];
  private readonly runner: () => StoryRunner | null;
  private choices: HTMLButtonElement[] = [];
  private line: HTMLInputElement | null = null;
  /** The wealth slider, while shown: its input, and how to show a share on it. */
  private split: { input: HTMLInputElement; show: (f: number) => void } | null = null;
  /** The program's blocks, while shown. */
  private blocks: ProgramView | null = null;
  private built = -1;
  /** When the reader last moved one of the strip's controls (ms): until a moment after, the yard does not move it back. */
  private touched = -Infinity;
  private seen = -1;
  private text = '';
  /** Whether the words' second part was shown at the last refresh. */
  private second = true;
  private at = 0;

  constructor(root: HTMLElement, runner: () => StoryRunner | null) {
    this.root = root;
    this.runner = runner;
    root.replaceChildren();
    this.say = el('div', 'say');
    this.lead = el('div', 'storyrow');
    this.words = el('p', 'words');
    this.spoken = el('p', 'sr-only');
    this.spoken.setAttribute('aria-live', 'polite');
    this.guess = el('div', 'choices');
    this.guess.hidden = true;
    this.controls = el('div', 'controls storycontrols');
    this.controls.hidden = true;
    const nav = el('nav', 'storynav');
    nav.setAttribute('aria-label', STORY.ui.story);
    this.back = button('back', () => this.runner()?.back());
    // the arrows, well known (owner, 2026-10-22: icons where clear); their words for screen readers and on hover
    wear(this.back, 'back', STORY.ui.back);
    const list = el('ol', 'acts');
    list.setAttribute('aria-label', STORY.ui.acts);
    STORY.acts.forEach((name, a) => {
      const item = el('li', '');
      // its number, its progress; its name on hover and to a screen reader
      const b = button('act', () => this.runner()?.enterAct(a));
      const number = el('span', 'number');
      number.textContent = String(a + 1);
      const bar = el('span', 'bar');
      const fillBar = el('span', 'fill');
      bar.append(fillBar);
      b.append(number, bar);
      b.setAttribute('aria-label', name);
      b.title = name;
      item.append(b);
      list.append(item);
      this.acts.push(b);
      this.progress.push(fillBar);
    });
    this.show = button('showme', () => this.runner()?.showMe());
    this.show.textContent = STORY.ui.showMe;
    this.show.disabled = true;
    this.next = button('next', () => this.runner()?.next());
    wear(this.next, 'next', STORY.ui.next);
    nav.append(this.back, list, this.show, this.next);
    this.say.append(this.words, this.guess);
    this.lead.append(nav);
    root.append(this.say, this.spoken);
  }

  /** What the panel shows by now (the runner's). */
  reset(): void {
    this.seen = -1;
    this.built = -1;
  }

  get showing(): Showing | null {
    return this.runner()?.showing ?? null;
  }

  /** Each frame: words, the guess, the beat's controls and the bar as the runner has them. */
  update(now: number): void {
    const r = this.runner();
    if (!r || !r.beat) return;
    if (r.revision !== this.seen) {
      this.seen = r.revision;
      if (this.built !== r.at) this.build(r);
      this.state(r);
    }
    // words with live values: refreshed a few times a second (screen readers hear them once, per beat)
    if (now - this.at > 400 || this.built !== r.at || r.second !== this.second) {
      this.at = now;
      // in two parts, the second when the runner says (it fades in); its place kept till then, so nothing moves.
      // A beat that asks for something: the second part takes the first's place once it is done (owner,
      // 2026-10-22: "Slide the line" gives way to what the line shows)
      const [first, then] = r.text.split('\n');
      const ink = (w: string) => `<span class="ink">${w}</span>`;
      const text =
        then === undefined
          ? ink(first)
          : r.beat.wait
            ? `<span class="swap"><span class="${r.second ? 'gone' : ''}">${ink(first)}</span><span class="then${r.second ? '' : ' later'}">${ink(then)}</span></span>`
            : ink(`${first}<span class="then${r.second ? '' : ' later'}"><br>${then}</span>`);
      if (text !== this.text) {
        this.text = text;
        this.words.innerHTML = text;
      }
      this.second = r.second;
    }
    const settled = now - this.touched > 400;
    if (this.line) {
      const g = r.session.guide;
      if (g?.kind === 'line' && settled && Number(this.line.value) !== g.f) this.line.value = String(g.f);
    }
    if (this.blocks && settled) this.blocks.refresh();
    // the wealth slider follows the yard (Do it for me, a link), unless it is being moved
    if (this.split && settled) {
      const f = r.session.split;
      if (Number.isFinite(f) && Math.abs(Number(this.split.input.value) - f) > 0.004) this.split.show(Math.round(f * 100) / 100);
    }
    this.next.classList.toggle('ready', r.ready);
  }

  /** Focus on Next: where a keyboard goes on from. */
  focus(): void {
    this.next.focus();
  }

  /** The guess (in the words' place) and the beat's own controls (in the side column). */
  private build(r: StoryRunner): void {
    // a keyboard in the story stays in it: on what a waiting beat asks for, else on Next
    const active = document.activeElement;
    const keyboard = !active || active === document.body || this.root.contains(active) || !!active.closest('#panel');
    this.built = r.at;
    this.guess.replaceChildren();
    this.controls.replaceChildren();
    this.choices = [];
    this.line = null;
    this.split = null;
    this.blocks?.dispose();
    this.blocks = null;
    const b = r.beat!;
    const c = b.controls;
    const session = r.session;
    if (c?.choices?.length) {
      // the guess in pictures: the two players as they might end up (no reading needed), each picture on its own
      // player's side, the same in the middle; the words are for screen readers
      const pairs = session.pairs;
      const [a, p] = pairs && pairs.length >= 2 ? [pairs[0], pairs[1]] : [0, 1];
      const [left, right] = session.stage.x[a] <= session.stage.x[p] ? [a, p] : [p, a];
      for (const key of c.choices) {
        const choice = button('choice', () => this.runner()?.choose(key));
        choice.dataset.key = key;
        choice.setAttribute('aria-pressed', 'false');
        choice.setAttribute('aria-label', STORY.choices[key as ChoiceKey]);
        choice.title = STORY.choices[key as ChoiceKey];
        choice.append(picture(key, left, right));
        this.guess.append(choice);
        this.choices.push(choice);
      }
    }
    this.guess.hidden = !this.choices.length;
    if (c?.line) {
      const label = el('label', 'slider line');
      const span = el('span', 'name');
      span.textContent = STORY.ui.lineControl;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '1';
      input.step = '0.01';
      input.setAttribute('aria-label', STORY.ui.lineControl);
      const g = session.guide;
      input.value = String(g?.kind === 'line' ? g.f : 0.5);
      input.addEventListener('input', () => {
        this.touched = performance.now();
        this.runner()?.line(Number(input.value));
      });
      label.append(span, input);
      this.controls.append(label);
      this.line = input;
    }
    if (c?.wealth) this.controls.append(this.wealth(r));
    if (c?.program) this.controls.append(this.program(r));
    this.controls.hidden = !this.controls.childElementCount;
    if (keyboard) {
      const w = b.wait;
      const target =
        w?.kind === 'slide' && w.name !== '*'
          ? document.querySelector<HTMLElement>(`#panel .slider[data-slider="${w.name}"] input`)
          : w?.kind === 'press'
            ? document.querySelector<HTMLElement>(`#panel [data-control="${w.name}"]`)
            : w
              ? (this.guess.querySelector<HTMLElement>('button') ?? this.controls.querySelector<HTMLElement>('input, button'))
              : null;
      // the panel shows the beat's controls on its next frame
      if (target) requestAnimationFrame(() => requestAnimationFrame(() => target.focus()));
      else if (!this.lead.contains(document.activeElement)) this.next.focus();
    }
    // screen readers hear the beat once, with where it is
    const where = STORY.ui.where.replace('{k}', String(r.at + 1)).replace('{n}', String(r.beats.length));
    this.spoken.textContent = `${r.plain} (${where})`;
  }

  /**
   * The wealth slider (owner, 2026-10-21): the two players' money shared, 25/75 … 50/50 … 75/25; its track in their
   * colours, the left one's on the left as they stand in the yard, each as long as its share.
   */
  private wealth(r: StoryRunner): HTMLElement {
    const label = el('label', 'slider line wealth');
    const span = el('span', 'name');
    span.textContent = STORY.ui.wealthControl;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0.25';
    input.max = '0.75';
    input.step = '0.01';
    input.setAttribute('aria-label', STORY.ui.wealthControl);
    const value = document.createElement('output');
    const players = r.session.players();
    if (players) {
      input.style.setProperty('--left', STROKES[colourOf(players[0])]);
      input.style.setProperty('--right', STROKES[colourOf(players[1])]);
    }
    let sent = 0;
    const show = (f: number) => {
      input.value = String(f);
      input.style.setProperty('--at', `${(100 * (f - 0.25)) / 0.5}%`);
      value.textContent = `${Math.round(100 * f)}% · ${Math.round(100 * (1 - f))}%`;
    };
    input.addEventListener('input', () => {
      this.touched = performance.now();
      show(Number(input.value));
      if (performance.now() - sent < 120) return;
      sent = performance.now();
      this.runner()?.split(Number(input.value));
    });
    input.addEventListener('change', () => this.runner()?.split(Number(input.value)));
    show(Number.isFinite(r.session.split) ? r.session.split : 0.5);
    this.split = { input, show };
    label.append(span, input, value);
    return label;
  }

  /**
   * The yard's program in the Rules drawer's own blocks, its panel blocks left out (program.ts), loaded when first
   * shown: a number that was a slider moves it; any other change is a new program.
   */
  private program(r: StoryRunner): HTMLElement {
    const host = el('div', 'program');
    host.setAttribute('role', 'group');
    host.setAttribute('aria-label', STORY.ui.blocks.program);
    const at = this.built;
    void programView(host, () => r.session, () => {
      this.touched = performance.now();
      this.runner()?.edited();
    }).then((view) => {
      // the beat moved on while Blockly loaded: not shown after all
      if (this.built !== at) view.dispose();
      else this.blocks = view;
    });
    return host;
  }

  /** What changes within a beat: the guess made, Show me, the acts' progress, Back and Next. */
  private state(r: StoryRunner): void {
    const chosen = r.chosen.get(r.at);
    for (const c of this.choices) c.setAttribute('aria-pressed', String(c.dataset.key === chosen));
    this.show.hidden = false;
    this.show.disabled = !r.offer || r.done || r.beat?.wait?.kind === 'pick';
    const hint = r.offer && !r.done;
    this.controls.classList.toggle('hint', hint);
    this.guess.classList.toggle('hint', hint);
    this.back.disabled = r.at <= 0;
    const face = r.last ? 'play' : 'next';
    if (this.next.dataset.face !== face) {
      this.next.dataset.face = face;
      wear(this.next, face, r.last ? STORY.ui.play : STORY.ui.next);
    }
    this.next.setAttribute('aria-disabled', String(!r.done));
    this.next.disabled = !r.done;
    const act = r.act;
    this.acts.forEach((b, a) => {
      // the act's number; in the current one, the beat's too (3·4): a reference to point at a moment
      const number = b.querySelector('.number')!;
      const ref = a === act ? `${a + 1}·${r.at - ACT_STARTS[a] + 1}` : String(a + 1);
      if (number.textContent !== ref) number.textContent = ref;
      b.classList.toggle('current', a === act);
      b.setAttribute('aria-current', a === act ? 'step' : 'false');
      const from = ACT_STARTS[a];
      const to = ACT_STARTS[a + 1] ?? r.beats.length;
      const done = a < act ? 1 : a > act ? 0 : (r.at - from + 1) / (to - from);
      this.progress[a].style.inlineSize = `${Math.round(100 * done)}%`;
    });
  }
}

/** Two squares in the partners' colours, sized as a guess says they end: the left bigger, the right, or the same. */
function picture(key: string, a: number, b: number): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 56');
  svg.setAttribute('aria-hidden', 'true');
  // sides, as shares of the frame's height: the areas tell the story (big is about 4 times small)
  const [sa, sb] = key === 'left' ? [48, 24] : key === 'right' ? [24, 48] : [36, 36];
  const gap = 10;
  const x0 = (100 - sa - gap - sb) / 2;
  for (const [i, side, x] of [
    [a, sa, x0],
    [b, sb, x0 + sa + gap],
  ] as const) {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', String(x));
    r.setAttribute('y', String(52 - side));
    r.setAttribute('width', String(side));
    r.setAttribute('height', String(side));
    r.setAttribute('fill', FILLS[colourOf(i)]);
    r.setAttribute('stroke', STROKES[colourOf(i)]);
    r.setAttribute('stroke-width', '1.5');
    svg.append(r);
  }
  return svg;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function button(cls: string, click: () => void): HTMLButtonElement {
  const b = el('button', cls);
  b.type = 'button';
  b.addEventListener('click', click);
  return b;
}
