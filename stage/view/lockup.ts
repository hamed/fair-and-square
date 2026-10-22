/**
 * The title's square (logo.ts lockup: "fair&" and a square in place of the word "square"). It is one of the game's
 * squares, live (owner, 2026-10-21): its colour and line, the stage's face; its eyes follow the pointer, its mood
 * follows the yard's Gini (smiling while all are equal, uneasy as the gap opens, sad once a few have nearly
 * everything), and a click cheers it up. Styles: the stage draws LOCKUP; prototypes/lockup shows them all.
 */
import { FILLS, STROKES } from '../essay/agentStyle.ts';
import { Faces } from './faces.ts';

/** How the square looks: its fill (none: the paper shows), its line and how heavy (the serif's stem, or the game's). */
export interface LockupStyle {
  readonly name: string;
  readonly fill: string | null;
  readonly line: string;
  readonly heavy: boolean;
  /** Its side, in the serif's cap heights. */
  readonly size: number;
}

const INK = '#28251f';
const PAPER = '#f4efe4';

/** A few to choose from (prototypes/lockup shows them all; the owner picked the last, 2026-10-21). */
export const LOCKUP_STYLES: readonly LockupStyle[] = [
  { name: 'a blue square', fill: FILLS.blue, line: STROKES.blue, heavy: false, size: 1 },
  { name: 'teal', fill: FILLS.teal, line: STROKES.teal, heavy: false, size: 1 },
  { name: 'pink', fill: FILLS.pink, line: STROKES.pink, heavy: false, size: 1 },
  { name: 'green', fill: FILLS.green, line: STROKES.green, heavy: false, size: 1 },
  { name: 'violet', fill: FILLS.violet, line: STROKES.violet, heavy: false, size: 1 },
  { name: 'red', fill: FILLS.red, line: STROKES.red, heavy: false, size: 1 },
  { name: 'ink, the serif’s stem', fill: null, line: INK, heavy: true, size: 1 },
  { name: 'blue, the serif’s stem', fill: FILLS.blue, line: STROKES.blue, heavy: true, size: 1 },
  { name: 'blue, a little taller', fill: FILLS.blue, line: STROKES.blue, heavy: false, size: 1.2 },
];

/** The stage's (owner, 2026-10-21: the big blue, "for now"). */
export const LOCKUP = LOCKUP_STYLES[LOCKUP_STYLES.length - 1];

/** Moods along the Gini: [gini, valence, arousal]; between them, a straight blend. */
const MOODS: readonly (readonly [number, number, number])[] = [
  [0.1, 0.7, 0],
  [0.3, 0, 0.35],
  [0.6, -0.7, -0.2],
];

/** Seconds the title's face takes to follow the Gini (a person's mood relaxes slower: the title is a gauge too). */
const FOLLOW = 0.6;
/** Pointer distance (px) at which the eyes turn all the way. */
const REACH = 160;

/** The mood (valence, arousal) for a Gini. */
export function moodOf(gini: number): [number, number] {
  if (gini <= MOODS[0][0]) return [MOODS[0][1], MOODS[0][2]];
  for (let k = 1; k < MOODS.length; k++) {
    const [g0, v0, a0] = MOODS[k - 1];
    const [g1, v1, a1] = MOODS[k];
    if (gini <= g1) {
      const u = (gini - g0) / (g1 - g0);
      return [v0 + (v1 - v0) * u, a0 + (a1 - a0) * u];
    }
  }
  const last = MOODS[MOODS.length - 1];
  return [last[1], last[2]];
}

export class LockupFace {
  private readonly faces = new Faces([1], 3);
  /** Where its face was drawn last (canvas px), for its eyes to find the pointer. */
  private centre = { x: NaN, y: NaN };

  constructor() {
    const f = this.faces.field;
    f.temper(0, { v0: MOODS[0][1], a0: MOODS[0][2], d0: 0, smirk: 0, reactivity: 1, drift: 0 });
    f.look(0, 0, 0);
  }

  set reduced(on: boolean) {
    this.faces.reduced = on;
  }

  /** Each frame: the yard's Gini now, and the pointer (canvas px, or null): the face eases to its mood, eyes to it. */
  update(gini: number, dt: number, pointer: { x: number; y: number } | null = null): void {
    const f = this.faces.field;
    const [v, a] = moodOf(gini);
    f.v0[0] = v;
    f.a0[0] = a;
    if (dt > 0) {
      const k = 1 - Math.exp(-dt / FOLLOW);
      f.v[0] += (v - f.v[0]) * k;
      f.a[0] += (a - f.a[0]) * k;
    }
    const dx = pointer ? pointer.x - this.centre.x : NaN;
    const dy = pointer ? pointer.y - this.centre.y : NaN;
    const d = Math.hypot(dx, dy);
    if (d > 2) {
      const reach = Math.min(1, d / REACH);
      f.look(0, (dx / d) * reach, (0.7 * dy * reach) / d);
    } else f.look(0, 0, 0);
    f.step(dt);
  }

  /** Clicked: glad to see you. */
  cheer(): void {
    this.faces.ask(0, 'cheer', 1.5);
  }

  /** The face in a square `side` px across, centred at (cx, cy): in `pen`, on `fill`. */
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, side: number, pen: string, fill: string, now: number): void {
    this.centre = { x: cx, y: cy };
    const r = side / Math.sqrt(Math.PI);
    this.faces.draw(ctx, 0, 'manga', 'square', cx, cy, r, side, r, pen, fill, now);
  }
}

/**
 * The lockup's square at the title's pen (baseline, em), `alpha` of the way in, in `style`, its face inside if one is
 * given. `square` from the wordmark: its left edge from the pen, its side (the cap height) and the serif's stem, em.
 */
export function drawLockupSquare(
  ctx: CanvasRenderingContext2D,
  square: { readonly x: number; readonly side: number; readonly stroke: number },
  pen: { readonly x: number; readonly y: number; readonly em: number },
  alpha: number,
  face: LockupFace | null,
  style: LockupStyle = LOCKUP,
): void {
  const side = square.side * style.size * pen.em;
  const w = style.heavy ? Math.max(1, square.stroke * pen.em) : Math.max(1, Math.min(1.6, 0.07 * side));
  const x = pen.x + square.x * pen.em;
  const top = pen.y - side;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (style.fill) {
    ctx.fillStyle = style.fill;
    ctx.fillRect(x, top, side, side);
  }
  ctx.strokeStyle = style.line;
  ctx.lineWidth = w;
  ctx.lineJoin = 'miter';
  ctx.strokeRect(x + w / 2, top + w / 2, side - w, side - w);
  face?.draw(ctx, x + side / 2, top + side / 2, style.heavy ? side - 2 * w : side, style.line, style.fill ?? PAPER, performance.now());
  ctx.restore();
}
