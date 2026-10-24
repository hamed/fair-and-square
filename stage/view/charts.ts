/**
 * The panel's charts, drawn the way the essay's sandbox draws them (src/lib/widgets/sandbox: PlotFrame, TimeSeries,
 * LorenzPlot, CcdfChart; owner, 2026-10-22): one frame per plot, with titles and axis labels
 * in the surrounding unframed margins, like the words around the yard.
 *
 *   hover        an insight fades in: where the pointer is in time, what the poorest half holds, the median and the top 1 %
 *   name         its one-line description
 *   click axis   log ↔ linear (gated: a double-click does not also toggle)
 *   double-click the chart fills the window; Escape, its ✕ or another double-click gives it back (`zoomable`)
 *
 * Data in, nothing else: the panel says what to draw, each frame the numbers change.
 */
import { logAxis } from '../core/figure.ts';
import { WORDS } from '../words.en.ts';

const NS = 'http://www.w3.org/2000/svg';
const LINE = '#3d6aa8';
const GAP_TINT = 'rgba(61, 106, 168, 0.12)';

/** The plot fills its grid square. Labels overflow into the gutters between tiles. */
export const FRAME = { W: 170, H: 170, x: 0, y: 0, s: 170 } as const;
/** Between stacked strips, in viewBox units. */
const STRIP_GAP = 7;
const LABEL_GAP = 4;

export interface Axis {
  readonly lo: number;
  readonly hi: number;
  readonly log?: boolean;
  readonly label: string;
  readonly format: (v: number) => string;
  readonly ticks?: readonly number[];
  /** How far along the axis a value is, 0 … 1, when not plain linear or log (the CCDF's: the yard's own). */
  readonly along?: (v: number) => number;
  /** A click on the axis: log ↔ linear. */
  readonly toggle?: () => void;
}

/** One strip of a chart: its y axis, and what is drawn in it. */
export interface Strip {
  readonly name?: string;
  readonly y: Axis;
  readonly paint: (g: SVGGElement, x: (v: number) => number, y: (v: number) => number) => void;
  /** Its value at data x, for the hover (time charts). */
  readonly at?: (x: number) => string | null;
}

/** What hovering shows: drawn into the insight layer, given the maps, the plot box and the pointer (data x). */
export type Insight = (g: SVGGElement, x: (v: number) => number, y: (v: number) => number, pointer: number | null) => void;

const el = <K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.append(e);
  return e;
};

/** Pixel numbers kept sane: a broken economy's 1e300 must not write exponent notation into a path. */
const sane = (v: number) => (Number.isFinite(v) ? Math.max(-1000, Math.min(1200, v)) : -1000);

/** Where a value falls along an axis, 0 … 1 (log: its decade place; `along`: the axis's own). */
function fraction(a: Axis, v: number): number {
  if (a.along) return a.along(v);
  if (a.log) {
    const lo = Math.log10(a.lo);
    const hi = Math.log10(a.hi);
    return v > 0 ? (Math.log10(v) - lo) / (hi - lo || 1) : -1;
  }
  return (v - a.lo) / (a.hi - a.lo || 1);
}

/** Round ticks: about `count` of them, steps of 1, 2 or 5 a decade. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  const u = raw / p;
  const step = (u < 1.5 ? 1 : u < 3 ? 2 : u < 7 ? 5 : 10) * p;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

/** Decades between lo and hi (at most about five: every other one when crowded). */
export function logTicks(lo: number, hi: number): number[] {
  const a = Math.ceil(Math.log10(lo) - 1e-9);
  const b = Math.floor(Math.log10(hi) + 1e-9);
  const every = Math.max(1, Math.ceil((b - a + 1) / 5));
  const out: number[] = [];
  for (let k = b; k >= a; k -= every) out.unshift(10 ** k);
  return out;
}

/** Label at most two round values within the scale, rather than arbitrary data-dependent limits. */
function sparseTicks(axis: Axis, ticks: readonly number[]): number[] {
  let candidates = ticks;
  if (axis.log) {
    const round: number[] = [];
    for (let power = Math.floor(Math.log10(axis.lo)); power <= Math.ceil(Math.log10(axis.hi)); power++) {
      for (const multiple of [1, 2, 5]) round.push(multiple * 10 ** power);
    }
    candidates = round;
  }
  const within = candidates.filter((v) => v >= axis.lo && v <= axis.hi);
  return within.length > 1 ? [within[0], within[within.length - 1]] : within;
}

/** A number as a tick says it: whole above a thousand, else as many decimals as its size wants. */
export function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1000) return `${+(v / 1000).toPrecision(3)}k`;
  if (a >= 10 || a === 0) return String(Math.round(v));
  return String(+v.toPrecision(2));
}

export const percent = (v: number): string => `${+(100 * v).toPrecision(3)}%`;

/** Single-click actions must not fire on the way into a double-click (the sandbox's gatedClick). */
function gated(handler: () => void, ms = 280): (e: MouseEvent) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (e) => {
    clearTimeout(timer);
    if (e.detail > 1) return;
    timer = setTimeout(handler, ms);
  };
}

/** Shared heading geometry for charts and the controls frame. */
export function chartHeading(title: string, description = title): SVGSVGElement {
  const svg = el('svg', { viewBox: `0 0 ${FRAME.W} ${FRAME.H}`, class: 'chart' });
  const name = el('text', { class: 'name', x: FRAME.x, y: FRAME.y - LABEL_GAP }, svg);
  name.textContent = title;
  el('title', {}, name).textContent = description;
  return svg;
}

export class Chart {
  readonly svg: SVGSVGElement;
  /** The chart's own toggles (log axes), kept across redraws. */
  readonly state: Record<string, boolean> = {};
  private readonly name: SVGTextElement;
  private height: number = FRAME.H;
  private readonly insightLayer: SVGGElement;
  private pointer: number | null = null;
  private hovering = false;
  private last: { x: Axis; strips: readonly Strip[]; insight?: Insight } | null = null;

  constructor(title: string, description: string, aria: string) {
    this.svg = chartHeading(title, description);
    this.svg.setAttribute('role', 'img');
    this.svg.setAttribute('aria-label', aria);
    this.name = this.svg.querySelector('text')!;
    this.insightLayer = el('g', { class: 'insight' });
  }

  /** Match a stacked time tile while preserving its data and axis toggles. */
  resize(height: number): void {
    if (!Number.isFinite(height) || height <= 0 || Math.abs(this.height - height) < 0.01) return;
    this.height = height;
    this.svg.setAttribute('viewBox', `0 0 ${FRAME.W} ${height}`);
    this.again();
  }

  /** Draw: one shared x axis, the strips stacked over it (one strip: the whole square), and what hovering shows. */
  draw(x: Axis, strips: readonly Strip[], insight?: Insight): void {
    this.last = { x, strips, insight };
    const svg = this.svg;
    const keep = [this.name];
    svg.replaceChildren(...keep);
    const n = Math.max(1, strips.length);
    const h = (this.height - (n - 1) * STRIP_GAP) / n;
    const left = FRAME.x;
    const right = FRAME.x + FRAME.s;
    const px = (v: number) => sane(left + fraction(x, v) * FRAME.s);
    const grid = el('g', { class: 'grid' }, svg);
    const data = el('g', { class: 'data' }, svg);
    const axes = el('g', { class: 'axes' }, svg);
    const xTicks = x.ticks ?? (x.log ? logTicks(x.lo, x.hi) : niceTicks(x.lo, x.hi));
    const bottom = FRAME.y + this.height;
    strips.forEach((strip, k) => {
      const top = FRAME.y + k * (h + STRIP_GAP);
      const base = top + h;
      const py = (v: number) => sane(base - fraction(strip.y, v) * h);
      for (const t of xTicks) el('line', { x1: px(t), y1: top, x2: px(t), y2: base }, grid);
      const yTicks = strip.y.ticks ?? (strip.y.log ? logTicks(strip.y.lo, strip.y.hi) : niceTicks(strip.y.lo, strip.y.hi, n > 1 ? 2 : 4));
      for (const t of yTicks) {
        const y = py(t);
        if (y < top - 0.5 || y > base + 0.5) continue;
        el('line', { x1: left, y1: y, x2: right, y2: y }, grid);
      }
      // what the strip shows, clipped to it
      const clipId = `clip-${Math.random().toString(36).slice(2)}`;
      const clip = el('clipPath', { id: clipId }, svg);
      el('rect', { x: left - 1, y: top - 1, width: FRAME.s + 2, height: h + 2 }, clip);
      const g = el('g', { 'clip-path': `url(#${clipId})` }, data);
      strip.paint(g, px, py);
      el('rect', { class: 'frame', x: left, y: top, width: FRAME.s, height: h }, axes);
      if (n > 1 && strip.name) {
        const t = el('text', { class: 'strip', x: left + 3, y: top + 8 }, axes);
        t.textContent = strip.name;
      }
      if (n === 1) {
        const labelX = left - LABEL_GAP;
        const t = el('text', { class: 'label rotated', x: labelX, y: top + h / 2, 'text-anchor': 'middle', transform: `rotate(-90 ${labelX} ${top + h / 2})` }, axes);
        t.textContent = `${strip.y.label}${strip.y.log ? ' (log)' : ''}`;
        // Keep the upper tick within the chart's top edge; the lower tick extends below its position.
        for (const v of sparseTicks(strip.y, yTicks)) {
          const at = py(v);
          const text = strip.y.format(v);
          el('text', { class: 'tick', x: labelX, y: at, 'text-anchor': 'end', transform: `rotate(-90 ${labelX} ${at})` }, axes).textContent = text;
        }
      }
      if (strip.y.toggle) this.hit(left - 20, top, 20, h, strip.y.toggle, `${strip.name ?? strip.y.label}: log ↔ linear`);
    });
    const xl = el('text', { class: 'label', x: (left + right) / 2, y: bottom + LABEL_GAP, 'text-anchor': 'middle', 'dominant-baseline': 'hanging' }, axes);
    xl.textContent = `${x.label}${x.log ? ' (log)' : ''}`;
    let tickBounds: readonly [number, number] | null = null;
    for (const v of sparseTicks(x, xTicks).reverse()) {
      const at = px(v);
      const anchor = at < (left + right) / 2 ? 'start' : 'end';
      const text = x.format(v);
      if (Math.abs(at - (left + right) / 2) - xl.textContent.length * 2.2 < text.length * 4 + 5) continue;
      const width = text.length * 4;
      const from = anchor === 'start' ? at : at - width;
      const to = from + width;
      // The yard's shifted log mapping can place different round ticks at the same position.
      if (tickBounds && from < tickBounds[1] + 3 && to > tickBounds[0] - 3) continue;
      tickBounds = [from, to];
      el('text', { class: 'tick', x: at, y: bottom + LABEL_GAP, 'text-anchor': anchor, 'dominant-baseline': 'hanging' }, axes).textContent = text;
    }
    if (x.toggle) this.hit(left, bottom, FRAME.s, 20, x.toggle, `${x.label}: log ↔ linear`);
    // hovering: the insight, over everything; its zone the plot itself
    svg.append(this.insightLayer);
    const zone = el('rect', { class: 'hover', x: left, y: FRAME.y, width: FRAME.s, height: this.height }, svg);
    // a redraw puts a new zone under a pointer that has not moved: it keeps where it was
    zone.addEventListener('pointerenter', (e) => this.hover(true, this.dataX(e) ?? this.pointer));
    zone.addEventListener('pointerleave', () => this.hover(false, null));
    zone.addEventListener('pointermove', (e) => this.hover(true, this.dataX(e)));
    this.paintInsight();
  }

  /** The pointer's x as data, from a pointer event over the plot. */
  private dataX(e: PointerEvent): number | null {
    const x = this.last?.x;
    const r = this.svg.getBoundingClientRect();
    const side = Math.min(r.width, r.height * FRAME.W / this.height);
    if (!x || !(side > 0)) return null;
    const ox = r.left + (r.width - side) / 2;
    const f = Math.max(0, Math.min(1, (((e.clientX - ox) / side) * FRAME.W - FRAME.x) / FRAME.s));
    if (x.log) return 10 ** (Math.log10(x.lo) + f * (Math.log10(x.hi) - Math.log10(x.lo)));
    return x.lo + f * (x.hi - x.lo);
  }

  private hover(on: boolean, pointer: number | null): void {
    this.hovering = on;
    this.pointer = pointer;
    this.paintInsight();
  }

  private paintInsight(): void {
    const g = this.insightLayer;
    g.replaceChildren();
    g.classList.toggle('on', this.hovering);
    const last = this.last;
    if (!this.hovering || !last) return;
    const n = Math.max(1, last.strips.length);
    const h = (this.height - (n - 1) * STRIP_GAP) / n;
    const px = (v: number) => sane(FRAME.x + fraction(last.x, v) * FRAME.s);
    // a time chart: a hairline where the pointer is, each strip's value there
    if (this.pointer !== null && last.strips.some((s) => s.at)) {
      const at = px(this.pointer);
      el('line', { class: 'hair', x1: at, y1: FRAME.y, x2: at, y2: FRAME.y + this.height }, g);
      last.strips.forEach((s, k) => {
        const text = s.at?.(this.pointer!);
        if (!text) return;
        // at the strip's foot, clear of its name at the top
        const base = FRAME.y + k * (h + STRIP_GAP) + h;
        const t = el('text', { class: 'value', x: at > FRAME.x + FRAME.s - 40 ? at - 3 : at + 3, y: base - 3, 'text-anchor': at > FRAME.x + FRAME.s - 40 ? 'end' : 'start' }, g);
        t.textContent = text;
      });
    }
    if (last.insight) {
      const strip = last.strips[0];
      const py = (v: number) => sane(FRAME.y + h - fraction(strip.y, v) * h);
      last.insight(g, px, py, this.pointer);
    }
  }

  /** A clickable zone (an axis), focusable, gated against double-clicks. */
  private hit(x: number, y: number, w: number, h: number, act: () => void, label: string): void {
    const r = el('rect', { class: 'hit', x, y, width: w, height: h, role: 'button', tabindex: 0, 'aria-label': label }, this.svg);
    el('title', {}, r).textContent = label;
    r.addEventListener('click', gated(act));
    r.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      act();
    });
  }

  /** How to draw it again from its own data (set by drawTime, drawCcdf, …): a toggle changed its axes. */
  again: () => void = () => {
    const l = this.last;
    if (l) this.draw(l.x, l.strips, l.insight);
  };
}

// ——— the panel's charts ———

/** A polyline path through (x, y) pairs, gaps where a value is not finite. */
function path(xs: readonly number[], ys: readonly number[], px: (v: number) => number, py: (v: number) => number): string {
  let d = '';
  let pen = false;
  for (let k = 0; k < xs.length; k++) {
    if (!Number.isFinite(ys[k])) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${px(xs[k]).toFixed(1)} ${py(ys[k]).toFixed(1)}`;
    pen = true;
  }
  return d;
}

/** The value of a series at round r (the last sampled at or before it). */
function valueAt(rounds: readonly number[], values: readonly number[], r: number): number | null {
  let k = -1;
  for (let i = 0; i < rounds.length && rounds[i] <= r; i++) k = i;
  return k >= 0 ? values[k] : null;
}

/** The round axis every time chart shares: 0 (or 1, log) to the last round, at least 10; click it: log ↔ linear. */
function roundAxis(chart: Chart, last: number): Axis {
  const log = !!chart.state.roundLog;
  return { lo: log ? 1 : 0, hi: Math.max(10, last), log, label: WORDS.charts.round, format: compact, toggle: () => ((chart.state.roundLog = !log), chart.again()) };
}

/** One time series per frame. Click the round axis: log ↔ linear; hover: the value at that round. */
export function drawTime(chart: Chart, data: { rounds: readonly number[]; gini: readonly number[]; neff: readonly number[]; n: number }, measure: 'gini' | 'neff' = 'gini'): void {
  chart.again = () => drawTime(chart, data, measure);
  const W = WORDS.charts;
  const x = roundAxis(chart, data.rounds.at(-1) ?? 10);
  const values = measure === 'gini' ? data.gini : data.neff;
  const y: Axis = measure === 'gini'
    ? { lo: 0, hi: 1, label: W.gini, format: compact, ticks: [0, 0.5, 1] }
    : { lo: 1, hi: Math.max(2, data.n), label: W.peopleCount, format: compact, ticks: [1, Math.max(2, data.n)] };
  const strips: Strip[] = [
    {
      y,
      paint: (g, px, py) => el('path', { class: 'line', d: path(data.rounds, values, px, py), stroke: LINE }, g),
      at: (r) => fmt(valueAt(data.rounds, values, r), (v) => v.toFixed(measure === 'gini' ? 2 : 1)),
    },
  ];
  chart.draw(x, strips);
}

/** Turnover (Play's): how much of all the money the trades move each round, by round; hover: its value there. */
export function drawTurnover(chart: Chart, t: { rounds: readonly number[]; values: readonly number[] }): void {
  chart.again = () => drawTurnover(chart, t);
  const top = Math.max(1, ...t.values) * 1.1;
  chart.draw(roundAxis(chart, t.rounds.at(-1) ?? 10), [
    {
      // turnoverSeries already supplies percentage points, unlike the fraction-valued Lorenz and CCDF.
      y: { lo: 0, hi: top, label: WORDS.charts.moved, format: (v) => `${compact(v)}%` },
      paint: (g, px, py) => el('path', { class: 'line', d: path(t.rounds, t.values, px, py), stroke: LINE }, g),
      at: (r) => fmt(valueAt(t.rounds, t.values, r), (v) => `${v.toFixed(1)}%`),
    },
  ]);
}

const fmt = (v: number | null, f: (v: number) => string): string | null => (v === null || !Number.isFinite(v) ? null : f(v));

/** The Lorenz curve: square, the even diagonal, the gap shaded; hovering, what the poorest half holds. */
export function drawLorenz(chart: Chart, shares: Float64Array, potShare: number): void {
  chart.again = () => drawLorenz(chart, shares, potShare);
  const W = WORDS.charts;
  const sorted = Float64Array.from(shares).sort();
  const total = 1 - potShare || 1;
  const xs = [0];
  const ys = [0];
  let sum = 0;
  let low = 0;
  sorted.forEach((s, i) => {
    sum += s / total;
    low = Math.min(low, sum);
    xs.push((i + 1) / sorted.length);
    ys.push(sum);
  });
  const half = valueAt(xs, ys, 0.5) ?? 0;
  const lo = low < 0 ? Math.floor(low * 10) / 10 : 0;
  const x: Axis = { lo: 0, hi: 1, label: W.people, format: percent, ticks: [0, 0.5, 1] };
  const y: Axis = { lo, hi: 1, label: W.wealthShare, format: percent, ticks: lo < 0 ? [lo, 0, 0.5, 1] : [0, 0.5, 1] };
  chart.draw(
    x,
    [
      {
        y,
        paint: (g, px, py) => {
          el('path', { class: 'gap', d: `${path(xs, ys, px, py)}L${px(1)} ${py(1)}L${px(0)} ${py(0)}Z`, fill: GAP_TINT }, g);
          el('line', { class: 'even', x1: px(0), y1: py(0), x2: px(1), y2: py(1) }, g);
          el('path', { class: 'line', d: path(xs, ys, px, py), stroke: LINE }, g);
        },
      },
    ],
    (g, px, py) => {
      el('line', { class: 'mark', x1: px(0.5), y1: py(lo), x2: px(0.5), y2: py(half) }, g);
      el('circle', { class: 'dot', cx: px(0.5), cy: py(half), r: 2.4 }, g);
      el('text', { class: 'value', x: px(0.5), y: py(half) - 6, 'text-anchor': 'middle' }, g).textContent = W.poorestHalf.replace('{p}', percent(Math.max(0, half)));
    },
  );
}

/**
 * How many have at least (the CCDF): across, each one's share on the yard's own log axis (figure.ts logAxis, so the
 * chart is the bars' edge), click it for linear; up, the share of people, click it for log. Hovering: where the
 * median is, and where the top 1 % begins.
 */
export function drawCcdf(chart: Chart, shares: Float64Array): void {
  chart.again = () => drawCcdf(chart, shares);
  const W = WORDS.charts;
  const n = shares.length;
  const values = Array.from(shares)
    .filter((v) => v > 0)
    .sort((a, b) => b - a);
  if (!values.length) return;
  const axis = logAxis(shares);
  const xLinear = !!chart.state.xLinear;
  const yLog = !!chart.state.yLog;
  const x: Axis = xLinear
    ? { lo: 0, hi: axis.top, label: W.share, format: percent, ticks: niceTicks(0, axis.top, 3), toggle: () => ((chart.state.xLinear = false), chart.again()) }
    : { lo: axis.base, hi: axis.top, log: true, along: axis.along, label: W.share, format: percent, ticks: logTicks(axis.base, axis.top), toggle: () => ((chart.state.xLinear = true), chart.again()) };
  const floor = 1 / Math.max(2, n);
  const y: Axis = yLog
    ? { lo: floor, hi: 1, log: true, label: W.atLeast, format: percent, toggle: () => ((chart.state.yLog = false), chart.again()) }
    : { lo: 0, hi: 1, label: W.atLeast, format: percent, ticks: [0, 0.25, 0.5, 0.75, 1], toggle: () => ((chart.state.yLog = true), chart.again()) };
  const median = values[Math.floor((values.length - 1) / 2)];
  const top1 = values[Math.max(0, Math.ceil(0.01 * n) - 1)];
  chart.draw(
    x,
    [
      {
        y,
        paint: (g, px, py) => {
          // from 0 past the richest, up a step at each one, to everyone left of the poorest
          const yv = (v: number) => py(yLog ? Math.max(floor, v) : v);
          let d = `M${px(values[0]).toFixed(1)} ${yv(0).toFixed(1)}`;
          values.forEach((v, k) => {
            d += `L${px(v).toFixed(1)} ${yv(k / n).toFixed(1)}L${px(v).toFixed(1)} ${yv((k + 1) / n).toFixed(1)}`;
          });
          d += `L${FRAME.x} ${yv(values.length / n).toFixed(1)}`;
          el('path', { class: 'line', d, stroke: LINE }, g);
        },
      },
    ],
    (g, px) => {
      for (const [v, word, row] of [
        [median, W.median, 22],
        [top1, W.top1, 12],
      ] as const) {
        el('line', { class: 'mark', x1: px(v), y1: FRAME.y + row + 2, x2: px(v), y2: FRAME.y + FRAME.s }, g);
        const t = el('text', { class: 'value', x: px(v), y: FRAME.y + row, 'text-anchor': px(v) > FRAME.x + FRAME.s - 30 ? 'end' : px(v) < FRAME.x + 30 ? 'start' : 'middle' }, g);
        t.textContent = word.replace('{p}', percent(v));
      }
    },
  );
}

/** A histogram of shares (× the average): bars; hovering, the median and the mean. */
export function drawHistogram(chart: Chart, shares: Float64Array): void {
  const W = WORDS.charts;
  const n = shares.length;
  const values = Array.from(shares, (s) => s * n).sort((a, b) => a - b);
  const top = Math.max(1, values.at(-1) ?? 1);
  const low = Math.min(0, values[0] ?? 0);
  const bins = Math.max(5, Math.min(30, Math.round(Math.sqrt(n))));
  const width = (top - low) / bins;
  const counts = new Array<number>(bins).fill(0);
  for (const v of values) counts[Math.min(bins - 1, Math.floor((v - low) / width))]++;
  const most = Math.max(1, ...counts);
  const median = values[Math.floor((n - 1) / 2)] ?? 0;
  chart.draw(
    { lo: low, hi: top, label: W.average, format: compact },
    [
      {
        y: { lo: 0, hi: most, label: W.peopleCount, format: compact },
        paint: (g, px, py) => {
          counts.forEach((c, k) => {
            if (!c) return;
            const x0 = px(low + k * width);
            const x1 = px(low + (k + 1) * width);
            el('rect', { class: 'bar', x: x0 + 0.3, y: py(c), width: Math.max(0.5, x1 - x0 - 0.6), height: py(0) - py(c) }, g);
          });
        },
      },
    ],
    (g, px) => {
      for (const [v, word, row] of [
        [median, W.median, 10],
        [1, W.mean, 20],
      ] as const) {
        el('line', { class: 'mark', x1: px(v), y1: FRAME.y + row + 2, x2: px(v), y2: FRAME.y + FRAME.s }, g);
        el('text', { class: 'value', x: px(v), y: FRAME.y + row, 'text-anchor': 'middle' }, g).textContent = word.replace('{p}', compact(v));
      }
    },
  );
}

/** One series by round (a square's card): in `colour`, its range signed (a debt shows), a zero line when it crosses. */
export function drawSeries(chart: Chart, rounds: readonly number[], values: readonly number[], label: string, colour: string): void {
  const lo = Math.min(0, ...values) * 1.1;
  const hi = Math.max(1, ...values) * 1.1;
  chart.draw({ lo: 0, hi: Math.max(10, rounds.at(-1) ?? 10), label: WORDS.charts.round, format: compact }, [
    {
      y: { lo, hi, label, format: compact },
      paint: (g, px, py) => {
        if (lo < 0) el('line', { class: 'zero', x1: px(0), y1: py(0), x2: FRAME.x + FRAME.s, y2: py(0) }, g);
        el('path', { class: 'line', d: path(rounds, values, px, py), stroke: colour }, g);
      },
    },
  ]);
}

/**
 * A chart's square that fills the window on a double-click, Enter or its ✕ (and Escape) giving it back; a
 * placeholder keeps its place in the grid meanwhile.
 */
export function zoomable(tile: HTMLElement, word: string): void {
  tile.tabIndex = 0;
  tile.title = WORDS.charts.zoomTip;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'unzoom';
  close.textContent = '✕';
  close.setAttribute('aria-label', WORDS.charts.unzoom);
  close.hidden = true;
  tile.append(close);
  let holder: HTMLElement | null = null;
  const toggle = () => {
    const on = !tile.classList.contains('zoomed');
    if (on) {
      holder = document.createElement('div');
      holder.className = 'tile placeholder';
      tile.before(holder);
    } else {
      holder?.remove();
      holder = null;
    }
    tile.classList.toggle('zoomed', on);
    close.hidden = !on;
    tile.setAttribute('aria-label', on ? `${word}, ${WORDS.charts.zoomed}` : word);
    if (on) close.focus();
  };
  tile.addEventListener('dblclick', (e) => {
    e.preventDefault();
    toggle();
  });
  tile.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tile.classList.contains('zoomed')) toggle();
    else if (e.key === 'Enter' && e.target === tile) toggle();
  });
  close.addEventListener('click', () => toggle());
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tile.classList.contains('zoomed')) toggle();
  });
}
