/**
 * Three yards, as a story widget: the yard divided into four (its own cross of walls, `divide`), three of the
 * quarters a yard each (the fourth, top left, is the words'). Each is the yard as the story has it (its squares
 * standing in the room, trading, the tax going through the pot), only smaller, drawn bare (no walls of its own:
 * the big yard's are its walls), with rules of its own (a stake and a tax): the two extremes and one between.
 * Their rules are hidden; their places are shuffled. Phases (the beat's config):
 *
 *   show   they appear, trading
 *   hop    an outline jumps from square to square across them: you will be one of these
 *
 * A click on a yard (any phase before the choice) shows its numbers and charts in the panel (`look`, owner
 * 2026-10-22); clicked again, the panel is the page's again. In the pick phase the click is also the choice.
 *   pick   each is a button: the reader picks the one they would live in (`picked`); never chosen for them
 *   grow   the chosen one grows to fill the yard and becomes the story's yard (its session, adopted); the rest fade
 *
 * Each yard is a Session and a StageView of its own: the same stage, smaller.
 */
import { Session, share } from '../console/session.ts';
import { parseRecipe } from '../core/recipe.ts';
import { StageView } from '../view/render.ts';
import { STORY } from './words.en.ts';
import type { Widget, WidgetContext } from './widgets.ts';
import { simulationSummary } from '../analytics/simulation.ts';

/**
 * The yards' rules: very unequal, between, very equal; dramatic, so each shows what it is within seconds (owner,
 * 2026-10-21). At 16 squares, played as the story shows them (trades flying, the tax through the pot, speed 2), their
 * Ginis 5 s in ≈ 0.47, 0.21, 0.06 and 30 s in ≈ 0.72, 0.35, 0.10: never out of order, from the first rounds.
 */
export const YARDS: readonly { readonly beta: number; readonly tax: number }[] = [
  { beta: 0.5, tax: 0 },
  { beta: 0.3, tax: 0.01 },
  { beta: 0.1, tax: 0.1 },
];

/** The quarters they stand in (0 top left, 1 top right, 2 bottom left, 3 bottom right): all but the words'. */
const SLOTS = [1, 2, 3];

/** Squares in each yard (owner: four is too few to tell a yard's shape at a glance). */
export const SQUARES = 16;
/** Each yard's dice, by its rules (not its place): seeds whose Ginis are near their rules' typical ones as they play. */
const YARD_SEEDS = [102, 101, 103];
/** Seconds the outline stays on one square while it hops. */
const HOP_EVERY = 0.45;
/** Seconds between a yard's words being told again (its shares move as it trades). */
const SAY_EVERY = 1;

/** Yard `k` of YARDS (by its rules), from equal, playing as the big yard shows it (trades where they stand, the tax's pot), a little quicker. */
export function yardSession(k: number): Session {
  const rules = YARDS[k];
  const session = new Session({ n: SQUARES, seed: YARD_SEEDS[k], recipe: parseRecipe('free') });
  session.run(`rule beta ${rules.beta}; rule tax ${rules.tax}; fx trade piece; fx tax on; speed 2; play`);
  session.stage.finish();
  session.hud = false;
  return session;
}

/** Yard `k` in words, as a reader sees it: its squares' shares of the money, richest first. Nothing of its rules. */
export function describeYard(k: number, wealth: ArrayLike<number>): string {
  const shares = Array.from(wealth).sort((a, b) => b - a).map(share).join(', ');
  return STORY.ui.yardSays.replace('{k}', String(k)).replace('{shares}', shares);
}

/** Where the yards go: a rectangle of the page, CSS px. */
export type Area = () => { left: number; top: number; width: number; height: number } | null;
/** A yard looked at (its session and name), or none. */
export type Look = (session: Session | null, name: string) => void;

interface Yard {
  readonly rules: (typeof YARDS)[number];
  readonly session: Session;
  readonly view: StageView;
  readonly el: HTMLButtonElement;
}

export class YardsWidget implements Widget {
  private readonly area: Area;
  private readonly seed: number;
  private readonly look: Look;
  /** The yard looked at, or −1. */
  private looked = -1;
  private root: HTMLElement | null = null;
  private yards: Yard[] = [];
  private ctx: WidgetContext | null = null;
  private phase = '';
  private clock = 0;
  private hopAt = 0;
  private sayAt = 0;
  private chosen = -1;
  private reduced = false;

  /** `seed`: the story's, for the shuffle (the same places for every reader); `look`: where a clicked yard shows. */
  constructor(area: Area, seed = 1, look: Look = () => {}) {
    this.area = area;
    this.seed = seed;
    this.look = look;
  }

  mount(ctx: WidgetContext, config: Readonly<Record<string, unknown>>): void {
    this.ctx = ctx;
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const root = document.createElement('div');
    root.className = 'yards';
    // in the page's own layer, so the strip's words and dock stay over them
    (document.querySelector('.app') ?? document.body).append(root);
    this.root = root;
    this.chosen = -1;
    this.yards = shuffle(YARDS, this.seed).map((rules, k) => {
      const session = yardSession(YARDS.indexOf(rules));
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'quarter';
      el.setAttribute('aria-label', describeYard(k + 1, session.game.wealth));
      el.tabIndex = -1;
      const canvas = document.createElement('canvas');
      el.append(canvas);
      el.addEventListener('click', () => {
        if (this.phase === 'grow') return;
        this.lookAt(this.looked === k && this.phase !== 'pick' ? -1 : k);
        this.pick(k);
      });
      root.append(el);
      const view = new StageView(canvas);
      view.reduced = this.reduced;
      // a quarter of the big yard: its floor to the edges, the big yard's walls around it
      view.pad = 0;
      view.bare = true;
      return { rules, session, view, el };
    });
    this.config(config);
  }

  config(config: Readonly<Record<string, unknown>>): void {
    const phase = String(config.phase ?? this.phase);
    if (config.showMe) return;
    if (phase !== 'grow') {
      // back before the choice: nothing chosen, nothing grown
      this.chosen = -1;
      this.root?.classList.remove('grown');
      for (const y of this.yards) y.el.classList.remove('chosen', 'growing');
    } else if (this.chosen < 0) {
      // shown again at the choice (Back): the reader's pick, remembered
      const told = config.told as { kind?: string; index?: number } | undefined;
      if (told?.kind === 'picked' && typeof told.index === 'number') this.chosen = told.index;
    }
    this.phase = phase;
    this.root?.setAttribute('data-phase', phase);
    // each a button: to look at before the choice, to choose at it
    for (const y of this.yards) {
      y.el.tabIndex = phase === 'grow' ? -1 : 0;
      y.el.disabled = false;
    }
    if (phase !== 'hop') for (const y of this.yards) y.session.highlight = null;
    if (phase === 'grow') {
      this.lookAt(-1);
      this.grow();
    }
  }

  /** Yard `k` looked at (its numbers and charts in the panel), or none (−1). */
  private lookAt(k: number): void {
    this.looked = k;
    this.yards.forEach((y, j) => y.el.classList.toggle('looked', j === k));
    const y = this.yards[k];
    this.look(y ? y.session : null, y ? STORY.ui.yardName.replace('{k}', String(k + 1)) : '');
  }

  frame(dt: number): void {
    const area = this.area();
    if (!this.root || !area) return;
    this.clock += dt;
    // the big yard's quarters, inside its cross of walls (3 px, centred on the middle)
    const half = 1.5;
    const w = Math.max(20, area.width / 2 - half);
    const h = Math.max(20, area.height / 2 - half);
    const now = performance.now();
    this.yards.forEach((y, k) => {
      if (!(this.phase === 'grow' && k === this.chosen)) {
        const q = SLOTS[k];
        y.el.style.left = `${area.left + (q % 2) * (w + 2 * half)}px`;
        y.el.style.top = `${area.top + Math.floor(q / 2) * (h + 2 * half)}px`;
        y.el.style.width = `${w}px`;
        y.el.style.height = `${h}px`;
      }
      y.session.frame(dt);
      y.view.render(y.session, dt, now);
    });
    if (this.clock >= this.sayAt) {
      // what each yard shows, in words, as it goes on trading
      this.sayAt = this.clock + SAY_EVERY;
      this.yards.forEach((y, k) => y.el.setAttribute('aria-label', describeYard(k + 1, y.session.game.wealth)));
    }
    if (this.phase === 'hop' && this.clock >= this.hopAt) {
      // the outline jumps: a square somewhere, in some yard
      this.hopAt = this.clock + HOP_EVERY;
      for (const y of this.yards) y.session.highlight = null;
      const y = this.yards[Math.floor(Math.random() * this.yards.length)];
      const ring = new Uint8Array(y.session.game.n);
      ring[Math.floor(Math.random() * ring.length)] = 1;
      y.session.highlight = ring;
    }
  }

  cleanup(): void {
    this.lookAt(-1);
    this.root?.remove();
    this.root = null;
    this.yards = [];
    this.ctx = null;
    this.phase = '';
  }

  private pick(k: number): void {
    if (this.phase !== 'pick' || this.chosen >= 0) return;
    this.chosen = k;
    this.yards.forEach((y, j) => y.el.classList.toggle('chosen', j === k));
    const yard = this.yards[k];
    this.ctx?.emit({ kind: 'picked', index: k, ...yard.rules, analytics: {
      ...simulationSummary(yard.session), yard_id: `stake_${yard.rules.beta}_tax_${yard.rules.tax}`,
      stake: yard.rules.beta, tax: yard.rules.tax, position: k + 1,
    } });
  }

  /** The chosen yard fills the big one and becomes the story's yard; the others fade. */
  private grow(): void {
    const ctx = this.ctx;
    if (this.chosen < 0) return;
    this.yards.forEach((y, j) => y.el.classList.toggle('chosen', j === this.chosen));
    const y = this.yards[this.chosen];
    if (!ctx || !y) return;
    const adopted = Session.load(y.session.share());
    adopted.run('fx trade off; fx tax off; pause');
    ctx.setSession(adopted);
    const area = this.area();
    if (area) {
      // from its square to the whole area, then gone: the big yard underneath is the same yard
      y.el.classList.add('growing');
      y.el.style.left = `${area.left}px`;
      y.el.style.top = `${area.top}px`;
      y.el.style.width = `${area.width}px`;
      y.el.style.height = `${area.height}px`;
    }
    this.root?.classList.add('grown');
  }
}

/** The four in an order fixed by `seed`: the equal yard is not always in the same corner. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let x = (seed * 2654435761) >>> 0 || 1;
  for (let k = out.length - 1; k > 0; k--) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    const j = (x >>> 0) % (k + 1);
    [out[k], out[j]] = [out[j], out[k]];
  }
  return out;
}
