/**
 * The reader's panel (level 0): run controls, then the sliders, buttons, numbers and plots the program declares
 * (model/panel.ts), beside the yard. Moving a slider or pressing a button is an input of the run, so the
 * economy goes on; a link replays them. Built afresh whenever the program changes.
 *
 * Made of squares, as everything here is (owner, 2026-10-21): one square holds the controls (Learn's, or Play's:
 * the run, Be a square beside Play, how they stand, the sliders, the numbers); each chart has a square of its own.
 * The squares tile the side m × n, as many across as gives the biggest squares that fit (landscape), or as fit
 * across under the yard (portrait, scrolling).
 */
import type { Program } from '../../model/ast.ts';
import type { Slider, Watch } from '../../model/panel.ts';
import { gini } from '../../model/stats.ts';
import { neffOf } from '../core/stats.ts';
import { BLOCKS } from '../../blocks/words/blocks.en.ts';
import type { Session } from '../console/session.ts';
import { NEFF } from '../core/game.ts';
import type { Recipe } from '../core/recipe.ts';
import { WORDS } from '../words.en.ts';
import { FILLS, STROKES } from '../essay/agentStyle.ts';
import { Chart, FRAME, chartHeading, drawCcdf, drawHistogram, drawLorenz, drawSeries, drawTime, drawTurnover, zoomable } from './charts.ts';
import { colourOf } from './render.ts';
import { wear, type IconName } from './icons.ts';
import { sharedUrl, track, type AnalyticsData } from '../analytics.ts';
import { simulationSummary } from '../analytics/simulation.ts';
import { ShareDialog } from './share.ts';

/** Refresh the numbers and plots this often, ms. */
const EVERY = 200;
/** Log a dragged slider into the run at most this often, ms (and once more when it is let go). */
const DRAG_EVERY = 100;
/** The slowest round pace; up to SHOWN_UP_TO rounds a second, pieces can show every trade. */
const MIN_ROUNDS = 1;
const SHOWN_UP_TO = 3;
/** Fast forward's pace, rounds a second; the slowest the animations go (Slower, past a round a second). */
const FAST = 100;
const SLOWEST = 0.25;
/** How much is shown moving (owner, 2026-10-22). */
const LEVELS = ['coins', 'pieces', 'off'] as const;
type Level = (typeof LEVELS)[number];
const LEVEL_ICON: Readonly<Record<Level, IconName>> = { coins: 'coins', pieces: 'pieces', off: 'still' };
/** The squares slider's ends, as the side of a square of squares (owner, 2026-10-22: only whole squares, 4 … 961). */
const SIDE = { min: 2, max: 31 };
/** Preferred gutter and portrait tile width, in CSS pixels; landscape fits the yard's bounds. */
const TILE = { gap: 32, min: 220 };
/** Space for the bottom axis label and the next chart's title, at the SVG's scale. */
const LABEL_GUTTER = 0.18;
type PlotKind = 'gini' | 'neff' | 'lorenz' | 'ccdf' | 'histogram';
const isTimePlot = (kind: PlotKind): kind is 'gini' | 'neff' => kind === 'gini' || kind === 'neff';
/**
 * The arrangements: a word each, what it runs (from the room, any guide put away), and how to tell it is the one
 * standing. Line up stands them by side = money, so the row is the box's width, not the yard's many times over
 * (owner, 2026-10-22); CCDF, N_eff and Lorenz are Learn's three charts, in the room (owner: "they are fun").
 */
const ARRANGE: readonly { word: string; tip: string; icon: IconName; run: string; id: string; photo?: string; is: (r: Recipe, s: Session) => boolean }[] = [
  // from the room: bars, prints and squared sides put away first (owner, 2026-10-22: bars wandered, prints piled up)
  { word: WORDS.panel.wander, tip: WORDS.panel.arrangeTip, icon: 'wander', run: 'guide off; room; wander', id: 'wander', is: (r) => r.pose === 'wander' && r.shape === 'square' && r.size === 'natural' && !r.prints },
  { word: WORDS.panel.box, tip: WORDS.panel.arrangeTip, icon: 'box', run: 'guide off; room; pose fold', id: 'box', is: (r) => r.pose === 'fold' && r.size === 'natural' && r.group === 'none' && !r.prints },
  { word: WORDS.panel.lineUp, tip: WORDS.panel.arrangeTip, icon: 'lineup', run: 'guide off; room; pose squared asc row', id: 'lineup', is: (r) => r.pose === 'row' && r.order === 'asc' && r.size === 'squared' },
  // its trades shown too: each off the loser's right end, onto the winner's (owner, 2026-10-22)
  { word: WORDS.panel.ccdf, tip: WORDS.panel.ccdfTip, icon: 'ccdf', run: 'guide off; room; ccdf; fx chart on; guide line 0.5', id: 'ccdf', photo: 'ccdf', is: (r) => r.pose === 'stack' && r.shape === 'bar' },
  { word: WORDS.panel.neff, tip: WORDS.panel.neffTip, icon: 'neff', run: 'guide off; room; neff', id: 'neff', photo: 'neff', is: (r) => r.prints },
  {
    word: WORDS.panel.lorenz,
    icon: 'lorenz',
    tip: WORDS.panel.lorenzTip,
    run: 'guide off; room; pose squared asc stack; until done; pose tower; until done; pose stairs; until done; guide lorenz; until done; guide lorenz even; until done; wait 0.6; guide lorenz gap; until done; wait 0.6; guide lorenz gauge',
    id: 'lorenz',
    photo: 'lorenz',
    is: (r, s) => r.pose === 'stairs' || r.pose === 'tower' || s.guide?.kind === 'lorenz',
  },
];

/**
 * What the panel shows, when not everything (the Story reveals controls as it gets to them): program sliders by
 * name, controls by their `data-control` word (play, step, restart, newluck, wander, box, lineup, be, share,
 * embed), and marks on sliders (where to set them).
 */
export interface Showing {
  readonly sliders: readonly string[];
  readonly controls: readonly string[];
  readonly marks?: readonly { readonly slider: string; readonly at: number }[];
  /** The program's charts: all of them, or those of these kinds (gini, lorenz, ccdf: Learn hands them over one by one). */
  readonly charts?: boolean | readonly string[];
  /** The picked square's card shows (in Learn too). */
  readonly card?: boolean;
}

/** What the panel shows of a yard looked at: its charts and numbers, none of its controls. */
const FOCUSED: Showing = { sliders: [], controls: [], charts: true, marks: [] };

interface SliderView {
  readonly spec: Slider;
  readonly input: HTMLInputElement;
  readonly value: HTMLOutputElement;
  dragging: boolean;
}

export class Panel {
  analyticsContext: () => 'learn' | 'play' | 'build' = () => 'play';
  preview: (session: Session) => HTMLCanvasElement | null = () => null;
  private shareDialog: ShareDialog | null = null;
  private readonly root: HTMLElement;
  private readonly main: () => Session;
  /** A yard looked at instead of the page's (Learn's three yards, one clicked), and its name. */
  private focused: Session | null = null;
  private focusName = '';
  /** What the yard looked at shows in words: its round, its richest and poorest. */
  private readonly note: HTMLElement;
  private program: Program | null = null;
  private sliders: SliderView[] = [];
  private readouts: { watch: Watch; out: HTMLElement; cell: HTMLElement; kind: string }[] = [];
  private plots: { kind: PlotKind; tile: HTMLElement; chart: Chart }[] = [];
  private timeStacks: HTMLElement[] = [];
  private rounds: number[] = [];
  private ginis: number[] = [];
  private every = 1;
  private at = -Infinity;

  private play: HTMLButtonElement | null = null;
  /** Fast forward (owner, 2026-10-22): on, the pace it had before, to go back to; off, null. */
  private fast: HTMLButtonElement | null = null;
  private fastFrom: number | null = null;
  /** What was shown moving before fast forward, to show again after it. */
  private fastShown: { trade: 'off' | 'piece' | 'toss'; tax: boolean } | null = null;
  /** How much is shown moving, and its button. */
  private level: Level = 'pieces';
  private levelButton: HTMLButtonElement | null = null;
  /** Be a square, and the yard to take away (share, embed): a row of their own, so each row fits its square. */
  private readonly people: HTMLElement;
  private readonly chartButtons: HTMLElement;
  private readonly transport: HTMLElement;
  private readonly sharing: HTMLElement;
  private readonly modelName: HTMLElement;
  private navigationRow: HTMLElement | null = null;
  /** What to show (null: everything), and what was applied last. */
  showing: Showing | null = null;
  private applied = '';
  /** Rows lent by the Story: one in place of the run controls (its way about), one after the rest (its own controls). */
  private lead: HTMLElement | null = null;
  /** The buttons glowing now (`glow button …`), as last applied. */
  private lit = '';
  private extra: HTMLElement | null = null;
  private arrange: HTMLButtonElement[] = [];
  private squares: { input: HTMLInputElement; value: HTMLOutputElement; dragging: boolean } | null = null;
  private population: HTMLElement | null = null;
  /** The rounds a second asked for (null: the session's own pace), kept through a change of N. */
  private pace: number | null = null;
  /** The square of controls, and in it: the run, the view's, the sliders, the numbers. */
  private readonly controls: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly view: HTMLElement;
  private readonly knobs: HTMLElement;
  private readonly modelActions: HTMLElement;
  private readonly numbers: HTMLElement;
  /** What a control did that only the yard shows (who you are), said to screen readers. */
  private readonly said: HTMLElement;
  /** A square's card (tapped, in Play): its own square of the panel while it is picked (session.selected). */
  private readonly card: { tile: HTMLElement; swatch: HTMLElement; rank: HTMLElement; share: HTMLElement; chart: Chart; mood: HTMLElement; traits: HTMLElement; line: HTMLElement };
  private carded = -1;
  /** How a square feels as drawn ([valence, arousal]), from the view: the card says it in words. */
  mood: ((i: number) => readonly [number, number] | null) | null = null;
  /** Everyone's money (× the average) at each round of `rounds`, for a card's chart. */
  private wealths: Float32Array[] = [];
  /** The session's traded money at each round of `rounds`; the turnover chart is how much each round adds. */
  private tradedAt: number[] = [];
  /** The effective number at each round of `rounds`, for the time chart. */
  private neffs: number[] = [];
  /** Turnover (owner, 2026-10-22: the essay's, in Play): its own square, counted in the grid in Learn too. */
  private readonly turnover: { tile: HTMLElement; chart: Chart };
  /** The yard and experiment the series are of: another, and they begin again. */
  private seen: { session: Session | null; experiment: number } = { session: null, experiment: -1 };
  private youSaid: object | null = null;

  constructor(root: HTMLElement, session: () => Session) {
    this.root = root;
    this.main = session;
    const part = (name: string) => {
      const el = document.createElement('div');
      el.className = name;
      return el;
    };
    this.controls = part('tile controls');
    this.bar = part('bar');
    this.view = part('bar view');
    this.people = part('bar people');
    this.chartButtons = part('bar chart-buttons');
    this.transport = part('transport');
    this.transport.setAttribute('role', 'group');
    this.transport.setAttribute('aria-label', 'Simulation controls');
    this.sharing = part('bar sharing');
    this.modelName = document.createElement('span');
    this.modelName.className = 'current-model';
    this.knobs = part('knobs');
    this.modelActions = part('bar model-actions');
    this.numbers = part('numbers');
    this.note = document.createElement('p');
    this.note.className = 'note';
    this.note.hidden = true;
    this.said = document.createElement('p');
    this.said.className = 'sr-only';
    this.said.setAttribute('aria-live', 'polite');
    this.card = this.makeCard();
    const turnTile = document.createElement('figure');
    turnTile.className = 'tile plot turnover';
    const turnChart = new Chart(WORDS.charts.turnover, WORDS.charts.turnoverAbout, WORDS.charts.turnover);
    turnTile.append(turnChart.svg);
    zoomable(turnTile, WORDS.charts.turnover);
    this.turnover = { tile: turnTile, chart: turnChart };
    // the squares: laid out again when the side changes size
    const side = root.parentElement ?? root;
    new ResizeObserver(() => this.layout()).observe(side);
    addEventListener('resize', () => this.layout());
  }

  /**
   * Keep readable square tiles with fixed gutters; time plots share a square-height stack.
   */
  private layout(): void {
    const side = this.root.parentElement;
    if (!side) return;
    // Reserve the primary model panels, but not an empty turnover/card slot.
    // The standard model keeps its Controls / Time / Lorenz / CCDF two-by-two grid.
    const primaryTimes = this.timeStacks.filter((stack) => stack.querySelector('.gini, .neff'));
    const extraTimes = this.timeStacks.filter((stack) => !primaryTimes.includes(stack) && !stack.hidden);
    const slots = [this.controls, ...primaryTimes, ...this.plots.filter((p) => !isTimePlot(p.kind)).map((p) => p.tile), ...extraTimes, ...(!this.card.tile.hidden ? [this.card.tile] : [])];
    const count = slots.length;
    const programRows = this.controls.querySelector('.program') ? 3 : 0;
    const style = getComputedStyle(this.root);
    const width = this.root.clientWidth - parseFloat(style.paddingInlineStart || '0') - parseFloat(style.paddingInlineEnd || '0');
    if (!(width > 0)) return;
    const gap = TILE.gap;
    let cols = Math.max(1, Math.min(2, count, Math.floor((width + gap) / (TILE.min + gap))));
    let tile = (width - (cols - 1) * gap) / cols;
    const landscape = this.span > 0 && typeof matchMedia === 'function' && matchMedia('(orientation: landscape) and (min-width: 720px)').matches;
    if (landscape && !this.root.closest('.drawing')) {
      // Include every inter-row gap, the toolbar, and the final axis labels in the height budget.
      const available = Math.max(1, this.span - this.transport.offsetHeight - 32);
      cols = Math.min(2, count);
      const rows = programRows + Math.ceil((count - (programRows ? 1 : 0)) / cols);
      tile = Math.min((width - (cols - 1) * gap) / cols, available / rows - gap, available / (rows * (1 + LABEL_GUTTER)));
    }
    const rowGap = Math.max(gap, tile * LABEL_GUTTER);
    this.root.style.setProperty('--row-gap', `${rowGap}px`);
    this.root.style.setProperty('--tile', `${tile}px`);
    this.root.style.setProperty('--cols', String(cols));
    this.root.style.setProperty('--panel-width', `${width}px`);
    slots.forEach((slot, index) => {
      if (programRows && index === 0) {
        slot.style.gridColumn = '1 / -1';
        slot.style.gridRow = `2 / span ${programRows}`;
      } else {
        const cell = index - (programRows ? 1 : 0);
        slot.style.gridColumn = String(cell % cols + 1);
        slot.style.gridRow = String(Math.floor(cell / cols) + 2 + programRows);
      }
    });
    const timeHeight = FRAME.W * (tile - rowGap) / (2 * tile);
    for (const p of this.plots) if (isTimePlot(p.kind)) p.chart.resize(timeHeight);
    this.turnover.chart.resize(timeHeight);
  }

  /** Each frame: rebuilt if the program changed, refreshed a few times a second. */
  update(now: number): void {
    const game = this.session().game;
    if (game.program !== this.program) this.build(game.program);
    const context = this.analyticsContext();
    this.transport.dataset.mode = context;
    this.root.dataset.mode = context;
    const caption = this.modelName.dataset.model ?? '';
    if (this.modelName.textContent !== caption) this.modelName.textContent = caption;
    if (this.play) {
      const playing = this.session().playing;
      if (this.play.dataset.state !== String(playing)) {
        this.play.dataset.state = String(playing);
        wear(this.play, playing ? 'pause' : 'play', playing ? WORDS.panel.pause : WORDS.panel.play, WORDS.panel.playTip);
      }
    }
    this.reveal();
    this.sayYou();
    this.showCard();
    // a slider the Story points at glows
    const glows = this.session().glows;
    for (const s of this.sliders) s.input.closest('label')?.classList.toggle('glow', glows.has(`slider:${s.spec.name}`));
    // and a button (`glow button share`), by its data-control
    const lit = [...glows].filter((g) => g.startsWith('button:')).join();
    if (lit !== this.lit) {
      this.lit = lit;
      for (const b of this.root.querySelectorAll<HTMLElement>('[data-control]')) b.classList.toggle('glow', glows.has(`button:${b.dataset.control}`));
    }
    if (this.root.hidden || now - this.at < EVERY) return;
    this.at = now;
    const run = game.run;
    this.views();
    for (const s of this.sliders) {
      if (s.dragging) continue;
      const v = Math.min(Math.max(run.sliders.get(s.spec.name) ?? s.spec.start, s.spec.min), s.spec.max);
      s.input.value = String(v);
      s.value.textContent = format(v, s.spec.percent);
    }
    // the Gini and everyone's money by round, thinned to about a thousand points: one experiment's only (a new
    // yard, Start again, New luck, another program begin again: review 2026-10-21, 3), whatever the panel shows
    const s = this.session();
    if (s !== this.seen.session || s.experiment !== this.seen.experiment) {
      this.seen = { session: s, experiment: s.experiment };
      this.clearSeries();
    }
    if (this.rounds[this.rounds.length - 1] !== run.round) {
      if (run.round < (this.rounds[this.rounds.length - 1] ?? 0)) this.clearSeries();
      if (run.round % this.every === 0) {
        this.rounds.push(run.round);
        this.ginis.push(gini(run.world.w));
        this.neffs.push(neffOf(run.world.w));
        this.wealths.push(Float32Array.from(run.world.w));
        this.tradedAt.push(s.traded);
        if (this.rounds.length > 1000) this.thin();
      }
    }
    if (this.focused) {
      const w = run.world.w;
      let total = run.world.pot;
      for (let i = 0; i < w.length; i++) total += w[i];
      const top = total !== 0 ? Math.max(...w) / total : 0;
      const bottom = total !== 0 ? Math.min(...w) / total : 0;
      this.note.textContent = WORDS.panel.yard.replace('{name}', this.focusName).replace('{round}', String(run.round)).replace('{top}', shareText(top)).replace('{bottom}', shareText(bottom));
    }
    if (!this.turnover.tile.hidden) drawTurnover(this.turnover.chart, this.turnoverSeries());
    // a square's card keeps up on its own (review 2026-10-21, 2: not only when the program has charts)
    if (!this.card.tile.hidden) this.fillCard();
    if (this.readouts.length || this.plots.length) {
      const out = run.outputs();
      for (const r of this.readouts) r.out.textContent = readout(run.evaluate(r.watch.path), r.watch.percent);
      for (const p of this.plots) {
        if (p.tile.hidden) continue;
        // time: the Gini, and the effective number next to it
        if (isTimePlot(p.kind)) drawTime(p.chart, { rounds: this.rounds, gini: this.ginis, neff: this.neffs, n: s.game.n }, p.kind);
        else if (p.kind === 'lorenz') drawLorenz(p.chart, out.shares, out.potShare);
        else if (p.kind === 'ccdf') drawCcdf(p.chart, out.shares);
        else drawHistogram(p.chart, out.shares);
      }
    }
  }

  private build(program: Program): void {
    this.program = program;
    this.clearSeries();
    const spec = this.session().game.panel;
    this.bar.replaceChildren();
    this.people.replaceChildren();
    this.chartButtons.replaceChildren();
    this.sharing.replaceChildren();
    this.modelName.dataset.model = String(simulationSummary(this.session()).sim_model).replace('stage', 'Yard sale').replaceAll('-', ' ').replace(/^./, (c) => c.toUpperCase());
    this.knobs.replaceChildren();
    this.modelActions.replaceChildren();
    this.numbers.replaceChildren();
    this.view.replaceChildren();
    this.arrange = [];
    this.sliders = [];
    this.readouts = [];
    this.plots = [];
    // the run: play and pause, one round, back to round 0
    this.applied = '\u0000';
    // the well-known ones as icons (owner, 2026-10-22), each saying its word on hover and to screen readers
    this.play = this.control(WORDS.panel.play, 'play or pause (space)', () => this.session().run(this.session().playing ? 'pause' : 'play'), 'run', this.bar, 'play');
    wear(this.play, 'play', WORDS.panel.play, WORDS.panel.playTip);
    const slower = this.control(WORDS.panel.slower, WORDS.panel.slowerTip, () => this.slower(), 'run', this.bar, 'slower');
    wear(slower, 'slower', WORDS.panel.slower, WORDS.panel.slowerTip);
    this.fast = this.control(WORDS.panel.fast, WORDS.panel.fastTip, () => this.fastForward(), 'run', this.bar, 'fast');
    wear(this.fast, 'fast', WORDS.panel.fast, WORDS.panel.fastTip);
    this.fast.setAttribute('aria-pressed', 'false');
    const step = this.control(WORDS.panel.step, 'one round', () => {
      const s = this.session();
      s.run('pause; round 1');
    }, 'run', this.bar, 'step');
    wear(step, 'step', WORDS.panel.step);
    const restart = this.control(WORDS.panel.restart, WORDS.panel.restartTip, () => this.session().run('reset'), 'run', this.bar, 'restart');
    wear(restart, 'restart', WORDS.panel.restart, WORDS.panel.restartTip);
    // new dice: everyone equal again, the same program and N
    const luck = this.control(WORDS.panel.newLuck, WORDS.panel.newLuckTip, () => this.session().run(`seed ${(Math.random() * 0xffff_ffff) >>> 0}`), 'run', this.bar, 'newluck');
    wear(luck, 'luck', WORDS.panel.newLuck, WORDS.panel.newLuckTip);
    // who you are, on the run's line (owner, 2026-10-21: in the same line as Play)
    this.control(WORDS.panel.be, WORDS.panel.beTip, () => this.session().run('be'), 'be', this.people, 'be');
    // how they stand, and the yard to take away
    for (const a of ARRANGE) {
      const b = this.control(a.word, a.tip, () => {
        const s = this.session();
        // the latest choice wins: a sequence still running (Lorenz's) stops here (recheck 2026-10-22)
        s.script = null;
        const arrange = a.id === 'ccdf' ? a.run : `fx chart off; ${a.run}`;
        const photo = a.photo ? `; until done; handoff ${a.photo}${a.photo === 'lorenz' ? '; wait 2; handoff gini' : ''}` : '';
        s.run(this.arranged() === a.id ? 'fx chart off; guide off; room' : `${a.photo ? 'pause; finish; ' : ''}${arrange}${photo}`);
      }, 'arrange', ['ccdf', 'neff', 'lorenz'].includes(a.id) ? this.chartButtons : this.view, a.id);
      wear(b, a.icon, a.word, a.tip);
      b.setAttribute('aria-pressed', 'false');
      this.arrange.push(b);
    }
    const embed = this.control(WORDS.panel.embed, WORDS.panel.embedTip, () => this.embed(embed), 'share', this.sharing, 'embed');
    wear(embed, 'embed', WORDS.panel.embed, WORDS.panel.embedTip);
    const share = this.control(WORDS.panel.share, WORDS.panel.shareTip, () => this.send(share, -1), 'share', this.sharing, 'share');
    // how much is shown moving (owner, 2026-10-22): coins, pieces, or nothing, one button that steps through them
    // (its icon the one chosen), kept through a new yard
    this.levelButton = this.control(WORDS.panel.level, '', () => this.setLevel(LEVELS[(LEVELS.indexOf(this.level) + 1) % LEVELS.length]), 'level', this.bar, 'level');
    this.showLevel();
    this.knobs.append(this.populationButtons(), this.squaresSlider());
    for (const sl of spec.sliders) this.knobs.append(this.slider(sl));
    this.knobs.hidden = !spec.sliders.length;
    for (const name of spec.buttons) this.control(name, `the program's “${name}” button`, () => this.session().press(name), 'press', this.modelActions, `press:${name}`);
    // the numbers, a line under the sliders: name and value
    for (const watch of spec.watches) {
      const cell = document.createElement('span');
      cell.className = 'number';
      const label = document.createElement('span');
      label.textContent = watch.name;
      const out = document.createElement('output');
      cell.append(label, out);
      this.numbers.append(cell);
      // the Learn chart each comes with (the Gini, or the effective number's photo); any other, with the Gini
      this.readouts.push({ watch, out, cell, kind: watch.name === NEFF ? 'neff' : 'gini' });
    }
    // Each series has its own frame; time plots share stacked grid tiles.
    const kinds: PlotKind[] = spec.plots.flatMap((kind): PlotKind[] => kind === 'gini' ? ['gini', 'neff'] : [kind]);
    const C = WORDS.charts;
    const descriptions: Record<PlotKind, readonly [string, string]> = {
      gini: [C.giniTime, C.giniAbout],
      neff: [C.neffTime, C.neffAbout],
      lorenz: [C.lorenz, C.lorenzAbout],
      ccdf: [C.ccdf, C.ccdfAbout],
      histogram: [C.histogram, C.histogramAbout],
    };
    for (const kind of kinds) {
      const tile = document.createElement('figure');
      tile.className = `tile plot ${kind}`;
      const [title, about] = descriptions[kind];
      const chart = new Chart(title, about, BLOCKS['panel.plot']?.fields?.kind?.[kind] ?? title);
      tile.append(chart.svg);
      zoomable(tile, title);
      this.plots.push({ kind, tile, chart });
    }
    this.rows();
    this.root.hidden = false;
    this.at = -Infinity;
    this.layout();
  }

  /** Turnover by sampled round: the money traded since the sample before, a round's worth, as a percent of all of it. */
  private turnoverSeries(): { rounds: number[]; values: number[] } {
    const rounds: number[] = [];
    const values: number[] = [];
    for (let k = 1; k < this.rounds.length; k++) {
      const dr = this.rounds[k] - this.rounds[k - 1];
      if (dr > 0) {
        rounds.push(this.rounds[k]);
        values.push((100 * (this.tradedAt[k] - this.tradedAt[k - 1])) / dr);
      }
    }
    return { rounds, values };
  }

  /** The card's square: its parts, made once. */
  private makeCard(): Panel['card'] {
    const W = WORDS.panel.card;
    const tile = document.createElement('aside');
    tile.className = 'tile card';
    tile.hidden = true;
    const head = document.createElement('div');
    head.className = 'head';
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    const rank = document.createElement('strong');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'control';
    close.textContent = W.close;
    close.addEventListener('click', () => {
      this.session().selected = -1;
      this.showCard();
    });
    // the next square up or down the ranks: every card reachable from one, by keyboard too
    const step = (dir: 1 | -1) => {
      const s = this.session();
      const w = s.game.wealth;
      const order = Array.from({ length: w.length }, (_, k) => k).sort((a, b) => w[b] - w[a] || a - b);
      const at = order.indexOf(s.selected);
      if (at < 0) return;
      s.selected = order[Math.min(order.length - 1, Math.max(0, at - dir))];
      this.showCard();
    };
    const richer = document.createElement('button');
    richer.type = 'button';
    richer.className = 'control';
    richer.textContent = W.richer;
    richer.addEventListener('click', () => step(1));
    const poorer = document.createElement('button');
    poorer.type = 'button';
    poorer.className = 'control';
    poorer.textContent = W.poorer;
    poorer.addEventListener('click', () => step(-1));
    // this square sent on, with its place (the find goes with the link): Play's Share icon, in the head, so the
    // card is no taller
    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'control share';
    send.dataset.control = 'card-share';
    send.addEventListener('click', () => this.send(send, this.carded));
    wear(send, 'share', W.send, W.sendTip);
    head.append(swatch, rank, richer, poorer, send, close);
    const share = document.createElement('p');
    const chart = new Chart('', W.chart, W.chart);
    const mood = document.createElement('p');
    const traits = document.createElement('p');
    const line = document.createElement('p');
    line.className = 'line';
    tile.append(head, share, chart.svg, mood, traits, line);
    return { tile, swatch, rank, share, chart, mood, traits, line };
  }

  /** The card shows while a square is picked, in Play (not while the Story lends the panel its rows). */
  private showCard(): void {
    const s = this.session();
    const i = (!this.lead || this.showing?.card) && s.selected >= 0 && s.selected < s.game.n ? s.selected : -1;
    const hidden = i < 0;
    if (i === this.carded && hidden === this.card.tile.hidden) return;
    this.carded = i;
    if (hidden !== this.card.tile.hidden) {
      this.card.tile.hidden = hidden;
      this.layout();
    }
    if (hidden) return;
    const colour = colourOf(i);
    this.card.swatch.style.background = FILLS[colour];
    this.card.swatch.style.borderColor = STROKES[colour];
    this.card.tile.style.setProperty('--own', STROKES[colour]);
    this.fillCard();
  }

  /** The card's words and chart, as the yard is now. */
  private fillCard(): void {
    const W = WORDS.panel.card;
    const s = this.session();
    const i = this.carded;
    const r = s.rankOf(i);
    if (!r) return;
    this.card.rank.textContent = W.rank.replace('{rank}', String(r.rank)).replace('{n}', String(r.n));
    this.card.share.textContent = W.share.replace('{share}', shareText(r.share)).replace('{x}', String(+r.times.toPrecision(2)));
    const ys = this.wealths.map((w) => w[i] ?? 0);
    // a debt goes below 0, and shows (recheck 2026-10-22)
    drawSeries(this.card.chart, this.rounds, ys, W.chartAxis, STROKES[colourOf(i)]);
    const m = this.mood?.(i);
    this.card.mood.hidden = !m;
    if (m) this.card.mood.textContent = W.feels.replace('{mood}', W.moods[moodWord(m[0], m[1])]);
    // traits, when the program gives them (not everyone the same)
    const world = s.game.run.world;
    const differs = (a: Float64Array) => a.some((x) => Math.abs(x - a[0]) > 1e-12);
    const traits: string[] = [];
    if (differs(world.talent)) traits.push(W.talent.replace('{t}', world.talent[i].toFixed(2)));
    if (differs(world.thrift)) traits.push(W.thrift.replace('{p}', shareText(world.thrift[i])));
    this.card.traits.hidden = !traits.length;
    this.card.traits.textContent = traits.join(' · ');
    this.card.line.textContent = r.rank === 1 ? W.richest : r.rank === r.n ? W.poorest : W.middle;
  }

  /** The yard's height, wall to wall (CSS px, landscape): the squares end where it ends (owner, 2026-10-22). */
  private span = 0;
  fit(height: number): void {
    const h = Math.round(height);
    if (h === this.span) return;
    this.span = h;
    this.layout();
  }

  /** The yard the panel is of: the page's, or one looked at (`focus`). */
  private session(): Session {
    return this.focused ?? this.main();
  }

  /**
   * Look at another yard (Learn's three yards: owner, 2026-10-22, a click on one shows its numbers and charts), by
   * `name`; null: the page's own again.
   */
  focus(s: Session | null, name = ''): void {
    if (s === this.focused) return;
    this.focused = s;
    this.focusName = name;
    this.applied = '\u0000';
    this.at = -Infinity;
  }

  /** The square a chart of `kind` is drawn in, if the program has one. */
  tile(kind: string): HTMLElement | null {
    return this.plots.find((p) => p.kind === kind)?.tile ?? this.readouts.find((r) => r.kind === kind)?.cell ?? null;
  }

  /** Who you are, said once each time you become a square (by the button, the Story's Show me or a command). */
  private sayYou(): void {
    const s = this.session();
    // each `be` makes a new one (pressed again, said again, even on the same square)
    if (s.you === this.youSaid) return;
    this.youSaid = s.you;
    const you = s.youAre();
    this.said.textContent = you ? WORDS.panel.youSay.replace('{rank}', String(you.rank)).replace('{n}', String(you.n)).replace('{share}', you.share) : '';
  }

  /** The Story's rows: `lead` where the run controls are (they hide), `extra` at the end; nulls give them back. */
  story(lead: HTMLElement | null, extra: HTMLElement | null): void {
    if (lead === this.lead && extra === this.extra) return;
    this.lead = lead;
    if (lead) this.navigationRow = lead;
    this.extra = extra;
    this.rows();
    this.applied = '\u0000';
  }

  /** The squares: the controls (the Story's rows in it when it lends them), a square's card, then the charts. */
  private rows(): void {
    this.transport.replaceChildren(...[this.modelName, this.bar, this.view, this.chartButtons, this.people, this.sharing, this.navigationRow].filter((x): x is HTMLElement => !!x));
    const title = chartHeading(WORDS.panel.controlsTitle);
    title.classList.add('control-title');
    title.setAttribute('role', 'heading');
    title.setAttribute('aria-level', '2');
    title.setAttribute('aria-label', WORDS.panel.controlsTitle);
    const body = document.createElement('div');
    body.className = 'controls-body';
    body.append(...[this.modelActions, this.knobs, this.numbers, this.note, this.extra].filter((x): x is HTMLElement => !!x));
    this.controls.replaceChildren(title, body);
    const times = [...this.plots.filter((p) => isTimePlot(p.kind)).map((p) => p.tile), this.turnover.tile];
    this.timeStacks = [];
    for (let i = 0; i < times.length; i += 2) {
      const stack = document.createElement('div');
      stack.className = 'time-stack';
      stack.append(...times.slice(i, i + 2));
      stack.hidden = [...stack.children].every((tile) => (tile as HTMLElement).hidden);
      this.timeStacks.push(stack);
    }
    this.root.replaceChildren(this.transport, this.controls, this.card.tile, ...this.timeStacks, ...this.plots.filter((p) => !isTimePlot(p.kind)).map((p) => p.tile), this.said);
  }

  /**
   * Only what `showing` asks for (all when null): the rest hidden, rows with nothing left hidden, the charts too;
   * a slider's mark as a tick on its track. Applied when it changes.
   */
  private reveal(): void {
    // a yard looked at: its numbers and charts, none of its controls (its rules stay hidden)
    const show = this.focused ? FOCUSED : this.showing;
    const key = (this.focused ? 'focus ' : '') + (show ? JSON.stringify(show) : [...this.session().charted].join(','));
    if (key === this.applied) return;
    this.applied = key;
    for (const el of this.root.querySelectorAll<HTMLButtonElement>('[data-control]')) {
      const common = this.transport.contains(el) && !el.dataset.control?.startsWith('press:');
      el.hidden = !common && !!show && !show.controls.includes(el.dataset.control!);
      el.disabled = common && !!show && !show.controls.includes(el.dataset.control!);
    }
    if (this.navigationRow) {
      this.navigationRow.hidden = !this.lead;
      for (const b of this.navigationRow.querySelectorAll<HTMLButtonElement>('button')) {
        if (!this.lead) b.disabled = true;
        else if (b.classList.contains('act')) b.disabled = false;
      }
      this.navigationRow.classList.toggle('inactive', !this.lead);
    }
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-knob]')) el.hidden = !!show;
    for (const s of this.sliders) {
      const label = s.input.closest('label')!;
      label.hidden = !!show && !show.sliders.includes(s.spec.name);
      const mark = show?.marks?.find((m) => m.slider === s.spec.name);
      label.querySelector('.notch')?.remove();
      if (mark && s.spec.max > s.spec.min) {
        // where to set it: a notch over the track (the thumb's centre runs a thumb's width short of the ends)
        const notch = document.createElement('span');
        notch.className = 'notch';
        const u = (mark.at - s.spec.min) / (s.spec.max - s.spec.min);
        notch.style.insetInlineStart = `calc(${(100 * u).toFixed(3)}% + ${(7 * (1 - 2 * u)).toFixed(2)}px)`;
        notch.title = format(mark.at, s.spec.percent);
        s.input.parentElement!.append(notch);
      }
    }
    for (const row of [this.bar, this.view, this.chartButtons, this.people, this.knobs, this.modelActions]) row.hidden = ![...row.children].some((c) => !(c as HTMLElement).hidden);
    const shows = (kind: string) => {
      const includes = (charts: readonly string[]) => charts.includes(kind) || (kind === 'neff' && charts.includes('gini'));
      return show ? show.charts === true || (Array.isArray(show.charts) && includes(show.charts)) : this.session().charted.has(kind) || (kind === 'neff' && this.session().charted.has('gini'));
    };
    for (const r of this.readouts) r.cell.hidden = !!show && !shows(r.kind);
    this.numbers.hidden = this.readouts.every((r) => r.cell.hidden);
    for (const p of this.plots) p.tile.hidden = !shows(p.kind);
    // Play's own (Learn does not teach it), and not while a yard is only looked at
    this.turnover.tile.hidden = !!show || !this.session().charted.has('turnover');
    for (const stack of this.timeStacks) stack.hidden = [...stack.children].every((tile) => (tile as HTMLElement).hidden);
    this.note.hidden = !this.focused;
    this.controls.hidden = [this.modelActions, this.knobs, this.numbers, this.note].every((r) => r.hidden) && (!this.extra || this.extra.hidden);
    this.root.hidden = false;
    // squares shown or hidden: the grid fits them again
    this.layout();
  }

  /** A button in the bar (or `row`): its word, what it does on hover; `id`, the word `showing` names it by. */
  private control(text: string, tip: string, click: () => void, kind = 'run', row = this.bar, id = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `control ${kind}`;
    b.title = tip;
    if (id) b.dataset.control = id;
    b.textContent = text;
    b.addEventListener('click', click);
    row.append(b);
    return b;
  }

  /** This yard's link, as it is now (the address bar follows). */
  private link(source: 'yard' | 'square' | 'embed'): string {
    const hash = this.session().share();
    history.replaceState(null, '', hash);
    return sharedUrl(`${location.origin}${location.pathname}`, hash, source);
  }

  /** A fixed snapshot and replay link, with copying kept separate from the optional support link. */
  private send(b: HTMLButtonElement, i: number): void {
    this.share(b, i < 0 ? 'yard' : 'square', i);
  }

  private embed(b: HTMLButtonElement): void {
    this.share(b, 'embed', -1);
  }

  private share(b: HTMLButtonElement, source: 'yard' | 'square' | 'embed', i: number): void {
    const session = this.session();
    const data: AnalyticsData = { source, context: this.analyticsContext(), method: 'clipboard', ...simulationSummary(session) };
    const caption = sharedLine(session, i);
    const url = this.link(source);
    let preview: HTMLCanvasElement | null = null;
    try { preview = this.preview(session); } catch { /* sharing works without a preview */ }
    this.shareDialog ??= new ShareDialog();
    this.shareDialog.open({
      kind: source === 'embed' ? 'embed' : 'share', url, caption, preview,
      onCopy: (outcome, mode) => track('share', { ...data, ...(mode ? { embed_mode: mode } : {}), outcome }),
    }, b);
  }

  /** Which arrangement the yard stands in now (its id), if one of ARRANGE. */
  private arranged(): string {
    const s = this.session();
    return ARRANGE.find((a) => a.is(s.recipe, s))?.id ?? '';
  }

  /** The view's own controls, as the session has them now (a command may have changed them). */
  private views(): void {
    const s = this.session();
    const now = this.arranged();
    this.arrange.forEach((b, k) => b.setAttribute('aria-pressed', String(ARRANGE[k].id === now)));
    if (this.population) {
      const current = this.population.querySelector<HTMLButtonElement>('[data-current]')!;
      current.hidden = [...this.population.querySelectorAll<HTMLButtonElement>('button:not([data-current])')].some((b) => Number(b.value) === s.game.n);
      current.value = String(s.game.n);
      current.textContent = String(s.game.n);
      for (const b of this.population.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(Number(b.value) === s.game.n));
    }
    if (this.squares && !this.squares.dragging) {
      this.squares.input.value = String(Math.min(SIDE.max, Math.max(SIDE.min, Math.round(Math.sqrt(s.game.n)))));
      this.squares.input.setAttribute('aria-valuetext', squaresSaid(s.game.n));
      this.squares.value.textContent = String(s.game.n);
    }
  }

  private setPace(rounds: number): void {
    const s = this.session();
    s.rate = rounds * Math.max(1, Math.floor(s.game.n / 2));
    // pieces: slow enough to watch, every trade shown; faster, they happen at once and the yard follows. Coins and
    // off are the reader's choice, kept whatever the pace
    if (this.level !== 'pieces') return;
    // the tax too: shown when slow, at once when fast (owner, 2026-10-22)
    const slow = rounds <= SHOWN_UP_TO;
    const style = slow ? 'piece' : 'off';
    if (s.transit.trade !== style) s.run(`fx trade ${style}`);
    if (s.transit.tax !== slow) s.run(`fx tax ${slow ? 'on' : 'off'}`);
  }

  /** Slower: half the pace, down to a round a second; then the animations themselves, down to a quarter. */
  private slower(): void {
    const s = this.session();
    const pairs = Math.max(1, Math.floor(s.game.n / 2));
    // fast forward on: back to the pace it had
    if (this.fastFrom !== null) {
      this.fastForward();
      return;
    }
    const rounds = s.tradeRate / pairs;
    if (rounds > MIN_ROUNDS + 1e-9) {
      this.pace = Math.max(MIN_ROUNDS, rounds / 2);
      this.setPace(this.pace);
    } else s.run(`speed ${Math.max(SLOWEST, s.speed / 2)}`);
  }

  /** Fast forward: a hundred rounds a second, trades at once; again, the pace it had. */
  private fastForward(): void {
    const s = this.session();
    const pairs = Math.max(1, Math.floor(s.game.n / 2));
    if (this.fastFrom === null) {
      this.fastFrom = s.tradeRate / pairs;
      this.fastShown = { trade: s.transit.trade, tax: s.transit.tax };
      // every trade and the tax at once, the animations at their own speed
      s.run('speed 1; fx trade off; fx tax off');
      this.setPace(FAST);
      if (!s.playing) s.run('play');
    } else {
      const back = this.fastFrom;
      this.fastFrom = null;
      // what was shown before, shown again
      if (this.fastShown) s.run(`fx trade ${this.fastShown.trade}; fx tax ${this.fastShown.tax ? 'on' : 'off'}`);
      this.fastShown = null;
      this.setPace(back);
      this.pace = back;
    }
    this.fast?.setAttribute('aria-pressed', String(this.fastFrom !== null));
  }

  /** How much is shown moving: coins (partners meet, a coin decides), pieces, or nothing. */
  private setLevel(level: Level): void {
    this.level = level;
    const s = this.session();
    s.run(level === 'coins' ? 'fx trade toss; fx tax on' : level === 'off' ? 'fx trade off; fx tax off' : 'fx trade piece; fx tax on');
    if (level === 'pieces') this.setPace(s.tradeRate / Math.max(1, Math.floor(s.game.n / 2)));
    this.showLevel();
  }

  /** The level button: the chosen level's icon; its name and what pressing does, said and on hover. */
  private showLevel(): void {
    const b = this.levelButton;
    if (!b) return;
    const next = LEVELS[(LEVELS.indexOf(this.level) + 1) % LEVELS.length];
    const words = WORDS.panel.levels;
    wear(b, LEVEL_ICON[this.level], `${WORDS.panel.level}: ${words[this.level]}`, `${WORDS.panel.levelTips[this.level]}\n${WORDS.panel.levelNext.replace('{next}', words[next])}`);
  }

  private populationButtons(): HTMLElement {
    const group = document.createElement('div');
    group.className = 'population';
    group.dataset.knob = 'population';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', WORDS.panel.squares);
    const label = document.createElement('span');
    label.textContent = WORDS.panel.squares;
    group.append(label);
    for (const n of [4, 9, 10, 16, 36, 64, 100, 256, null]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.value = String(n ?? this.session().game.n);
      button.textContent = button.value;
      if (n === null) button.dataset.current = '';
      button.addEventListener('click', () => {
        const count = Number(button.value);
        if (count !== this.session().game.n) this.session().run(`n ${count}`);
        if (this.pace !== null) this.setPace(this.pace);
        this.views();
      });
      group.append(button);
    }
    this.population = group;
    return group;
  }

  /** How many squares, a whole square of them each step (4, 9, 16, … 961); a new yard when let go (everyone equal). */
  private squaresSlider(): HTMLElement {
    const { label, input, value } = this.knob(WORDS.panel.squares);
    // a step a whole square: 2 × 2, 3 × 3, … (the box holds them as a square of squares)
    input.min = String(SIDE.min);
    input.max = String(SIDE.max);
    input.step = '1';
    const view = { input, value, dragging: false };
    input.addEventListener('input', () => {
      view.dragging = true;
      value.textContent = String(Number(input.value) ** 2);
      input.setAttribute('aria-valuetext', squaresSaid(Number(input.value) ** 2));
    });
    input.addEventListener('change', () => {
      view.dragging = false;
      const n = Number(input.value) ** 2;
      const s = this.session();
      if (n !== s.game.n) s.run(`n ${n}`);
      if (this.pace !== null) this.setPace(this.pace);
    });
    this.squares = view;
    return label;
  }

  /** A slider of the view's (not the program's): name, a 0 … 1 track, its value. */
  private knob(name: string): { label: HTMLLabelElement; input: HTMLInputElement; value: HTMLOutputElement } {
    const label = document.createElement('label');
    label.className = 'slider';
    label.dataset.knob = name;
    const span = document.createElement('span');
    span.textContent = name;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '1';
    input.step = '0.001';
    input.setAttribute('aria-label', name);
    const value = document.createElement('output');
    label.append(span, input, value);
    return { label, input, value };
  }

  private slider(spec: Slider): HTMLElement {
    const label = document.createElement('label');
    label.className = 'slider';
    // the program's own, by name (the view's squares slider has none)
    label.dataset.slider = spec.name;
    const name = document.createElement('span');
    // the stage's own sliders by their words; any other program's by its name
    name.textContent = SLIDER_WORDS[spec.name] ?? spec.name;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(roundStep((spec.max - spec.min) / 200));
    input.value = String(spec.start);
    const value = document.createElement('output');
    value.textContent = format(spec.start, spec.percent);
    const view: SliderView = { spec, input, value, dragging: false };
    let sent = -Infinity;
    const send = (force: boolean) => {
      const now = performance.now();
      const v = Number(input.value);
      // nothing to send if the run already has it (compared with the run, not with what was sent: a restart
      // puts the run back without telling the slider)
      const has = this.session().game.run.sliders.get(spec.name) ?? spec.start;
      if ((!force && now - sent < DRAG_EVERY) || v === has) return;
      sent = now;
      this.session().slide(spec.name, v);
    };
    input.addEventListener('input', () => {
      view.dragging = true;
      value.textContent = format(Number(input.value), spec.percent);
      send(false);
    });
    input.addEventListener('change', () => {
      view.dragging = false;
      send(true);
    });
    // the track: the input, and a notch where a mark asks (showing.marks)
    const track = document.createElement('span');
    track.className = 'track';
    track.append(input);
    label.append(name, track, value);
    this.sliders.push(view);
    return label;
  }

  private clearSeries(): void {
    this.rounds = [];
    this.ginis = [];
    this.neffs = [];
    this.wealths = [];
    this.tradedAt = [];
    this.every = 1;
  }

  private thin(): void {
    this.every *= 2;
    const keep = this.rounds.map((r, i) => (r % this.every === 0 ? i : -1)).filter((i) => i >= 0);
    this.rounds = keep.map((i) => this.rounds[i]);
    this.ginis = keep.map((i) => this.ginis[i]);
    this.neffs = keep.map((i) => this.neffs[i]);
    this.wealths = keep.map((i) => this.wealths[i]);
    this.tradedAt = keep.map((i) => this.tradedAt[i]);
  }
}

/** The stage's own sliders' words (a program's slider is named in lower case). */
const SLIDER_WORDS: Readonly<Record<string, string>> = { stake: WORDS.panel.stake, tax: WORDS.panel.tax };

/** A slider's step: 1, 2 or 5 times a power of ten, so round values sit on it. */
function roundStep(raw: number): number {
  if (!(raw > 0)) return 0.01;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit < 1.5 ? 1 : unit < 3 ? 2 : unit < 7 ? 5 : 10) * power;
}

const format = (v: number, percent: boolean) => (percent ? `${+(v * 100).toPrecision(3)} %` : String(+v.toPrecision(3)));

/** A watched number: as a slider's value, a dash when it has no value. */
const readout = (v: number, percent: boolean) => (Number.isFinite(v) ? format(v, percent) : '—');

/** A share as the card says it: whole percents, or a decimal under 10% (a debt's negative). */
function shareText(x: number): string {
  return Math.abs(x) >= 0.1 ? `${Math.round(100 * x)}%` : `${+(100 * x).toFixed(1)}%`;
}

/**
 * What a shared yard says ahead of its link: square `i`'s place (yours, if you are it), or with -1 the richest's
 * share; at round 0, that all start equal. Only the yard's own numbers (docs/brand.md: nothing invented).
 */
export function sharedLine(s: Session, i: number): string {
  const W = WORDS.panel.said;
  const round = s.game.run.round;
  const tag = ` ${W.tag}`;
  if (round <= 0) return W.start + tag;
  const fill = (t: string, r: { rank: number; n: number; share: number }) =>
    t.replace('{rounds}', round === 1 ? W.round : W.rounds.replace('{k}', String(round))).replace('{rank}', String(r.rank)).replace('{n}', String(r.n)).replace('{share}', shareText(r.share)).replace('{top}', shareText(r.share));
  const w = s.game.run.world.w;
  let top = 0;
  for (let j = 1; j < w.length; j++) if (w[j] > w[top]) top = j;
  const r = s.rankOf(i >= 0 ? i : top);
  if (!r) return W.start + tag;
  return fill(i < 0 ? W.yard : s.you?.i === i ? W.you : W.square, r) + tag;
}

/** A mood in a word, from valence and arousal. */
function moodWord(v: number, a: number): 'glad' | 'excited' | 'calm' | 'tense' | 'low' {
  if (v > 0.25) return a > 0.35 ? 'excited' : 'glad';
  if (v < -0.25) return a > 0.2 ? 'tense' : 'low';
  return 'calm';
}

/** The Squares slider as a screen reader says it: the count, not the side it steps by (review 2026-10-22). */
function squaresSaid(n: number): string {
  const k = Math.round(Math.sqrt(n));
  return (k * k === n ? WORDS.panel.squaresSaid : WORDS.panel.squaresCount).replace('{n}', String(n)).replace(/\{k\}/g, String(k));
}
