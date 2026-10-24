/**
 * The opening (owner, 2026-10-18): the logo, and the yard it unfolds into.
 * Built backwards from the stage: the logo's grid is the yard's reference box
 * and its sixteen squares are the stage's people in their own colours, so the
 * opening is the camera pulling back from the box to the stage's own framing,
 * "fair &" shrinking to a title outside the yard's top-left corner while
 * a square drops in after it (the lockup, logo.ts), and the big one giving back until everyone holds an equal
 * share: a 4 × 4 grid with no gutters, the stage's `fold` pose, where the game
 * goes on. The last frame is the stage's first; its faces go on living there.
 * The logo holds, alive, until the player starts (owner, 2026-10-18): the
 * rest plays from there.
 *
 * View only: it draws on the stage's canvas with the stage's camera and never
 * touches the game. Faces are the stage's engine, drawn as the stage draws them.
 * The prototype and its sheet (still logos, the mark, favicons) are in
 * prototypes/logo.
 */
import { FILLS, STROKES } from '../essay/agentStyle.ts';
import { FacePainter } from '../essay/face/draw.ts';
import { faceRadius } from '../essay/face/face.ts';
import { FaceField } from '../essay/face/field.ts';
import { temperament } from '../essay/face/moments.ts';
import type { Session } from '../console/session.ts';
import { WORDS } from '../words.en.ts';
import { drawLockupSquare, type LockupFace } from './lockup.ts';
import { paint } from './faces.ts';
import { colourOf, type Frame, type StageView } from './render.ts';
import type { Stage } from '../core/stage.ts';
import { FAIR, FOOT, GRID, LETTERS, SERIF, cells, inkOf, letter, setWord, wordmark, type Glyph, type Ink, type Lettering, type Wordmark } from './logo.ts';

// ———————————————————————————————————————————— words

const INK = '#28251f';
/** The &, the name, and the buttons that do nothing yet: a lighter ink. */
const AMP = '#958c7b';
/** The buttons that work: the essay's dark brown (app.css --accent-deep, its chapter index's colour). */
const BROWN = '#4d271c';
/** Inside the buttons: the floor's off-white (stage.css --floor). */
const FLOOR = '#fbf8f1';
/** Something to press next glows: the stage's accent gold (render.ts). */
const GLOW = '#e9b949';

/** The byline: the author's name, nothing before it, as on a cover. */
export const NAME = 'Hamed Seyed-Allaei';

/**
 * The buttons: the menu beside the logo (the first four, one to each row of
 * small boxes on the right), then About, which joins them on the line above
 * the yard, just before the name. `live`: it does something now.
 */
export const BUTTONS = [
  { id: 'story', label: WORDS.tabs.story, live: true },
  { id: 'play', label: WORDS.tabs.play, live: true },
  { id: 'rules', label: WORDS.tabs.rules, live: true },
  { id: 'finds', label: WORDS.tabs.finds, live: false },
  { id: 'about', label: WORDS.tabs.about, live: true },
] as const;
/** How many of them stand beside the logo. */
const IN_LOGO = 4;

/** The lettering, measured off the fonts once they are in. */
export interface Type {
  readonly letters: Lettering;
  readonly mark: Wordmark;
  /** The wordmark's f's outer foot and its lowest ink, from its pen, em. */
  readonly foot: number;
  readonly low: number;
  /** The name in the serif's regular weight, its ink, and its feet (the ink on the baseline: the H's outer foot, the last i's). */
  readonly name: {
    readonly glyphs: readonly Glyph[];
    readonly ink: Ink;
    readonly feet: Ink;
  };
  /** The buttons' words, and how far their letters reach above and below the baseline, all of them (em). */
  readonly buttons: readonly { readonly label: readonly Glyph[]; readonly ink: Ink }[];
  readonly up: number;
  readonly down: number;
  /** The widest button word, em. */
  readonly wide: number;
}

export function measureType(): Type {
  const mark = wordmark();
  const name = setWord(NAME, SERIF, 400);
  const buttons = BUTTONS.map((b) => {
    // the tabs in the logo's face: they are the game's character, as the wordmark is
    const label = setWord(b.label, SERIF, 400);
    return { label, ink: inkOf(label) };
  });
  return {
    letters: letter(),
    mark,
    foot: inkOf(mark.glyphs.slice(0, 1), ...FOOT).left,
    low: mark.ink.bottom,
    name: { glyphs: name, ink: inkOf(name), feet: inkOf(name, ...FOOT) },
    buttons,
    up: Math.max(...buttons.map((b) => -b.ink.top)),
    down: Math.max(...buttons.map((b) => b.ink.bottom)),
    wide: Math.max(...buttons.map((b) => b.ink.right - b.ink.left)),
  };
}

/** A run's pen and em: screen px, or world units, as the caller has it. */
interface Pen {
  x: number;
  y: number;
  em: number;
}

/** A rectangle on the canvas, CSS px: where something pressable is, for the control over it. */
export interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** A button's box: top-left and height, screen px or box units; its width and all inside follow from the height. */
interface Slot {
  readonly x: number;
  readonly y: number;
  readonly h: number;
}

/** The title's and the name's em in yard units: small, outside the yard. */
const TITLE_EM = 0.068;
const NAME_EM = 0.048;
/** The line's gap above the wall, in the title's em. */
const TITLE_GAP = 0.1;
/** The wall's outer edge outside the floor, px (render.ts strokes it 3 px wide, 1.5 px out). */
const WALL_OUT = 3;
/** A button's height on the line above the yard, yard units; and the space between the last button and the name, in button heights. */
const BUTTON_H = 0.07;
const BUTTON_NAME_GAP = 0.4;
/** A button's letters, tallest top to lowest bottom, as a share of its height, at most. */
const BUTTON_SHARE = 0.5;
/** Room the cue takes at a button's right end, with the space before it, em of the word. */
const CUE_ROOM = 0.65;
/** A button's width, in small boxes (with the gutters between them). */
const BUTTON_CELLS = 2;

/** A button's width for its height: two small boxes and the gutter between them, as beside the logo. */
const widthOf = (h: number) => h * (BUTTON_CELLS + ((BUTTON_CELLS - 1) * GRID.gap) / SQ[1].side);
/** The gutter between buttons for their height: the logo's, between its small boxes. */
const gutterOf = (h: number) => (h * GRID.gap) / SQ[1].side;

/** The smallest the line gets on screen, px: readable lettering, and tabs a finger can press (WCAG's 24 px targets). */
const MIN = { title: 18, name: 13, button: 24 };

/** The line above the yard, laid out: the title's and the name's pens, the tabs (standing on the wall, or not), and how far it reaches above the yard's top edge. */
interface Header {
  readonly title: Pen;
  readonly name: Pen;
  readonly buttons: readonly (Slot & { readonly w: number })[];
  /** The tabs stand on the yard's wall (it is under all of them), so they are tabs; else they are boxes. */
  readonly onWall: boolean;
  readonly height: number;
}

/** Kept clear at the canvas's sides, px, when the line has to reach past the yard. */
const EDGE = 8;

/**
 * The line above the yard, screen px. The title alone on the left, from the
 * wall's outer top-left corner (the f's outer foot on it); on the right the
 * name, its last i's foot on the outer top-right corner, and before it the
 * buttons, each a small copy of one beside the logo, as tabs: standing on the
 * wall, which is their bottom edge. Never smaller than MIN. Where that does
 * not fit on one line over the yard, it takes more lines (the tabs on the
 * wall, the title and the name above them, or each on a line of its own) and,
 * if the yard is narrower still, more width: only as much as it needs,
 * centred over the yard, within the canvas (review 2026-10-18, N3). Off the
 * wall's length, the tabs are boxes. Only a canvas too narrow for five tabs
 * of 24 px makes them smaller.
 */
export function headerAt(type: Type, f: Frame): Header {
  const te = Math.max(TITLE_EM * f.scale, MIN.title);
  const ne = Math.max(NAME_EM * f.scale, MIN.name);
  const wall = f.top - WALL_OUT;
  const left = f.left - WALL_OUT;
  const right = f.right + WALL_OUT;
  const page = Math.max(1, f.width - 2 * EDGE);
  // tabs: at least MIN.button tall, unless five of them would not fit across the canvas
  const across = (hh: number) => BUTTONS.length * widthOf(hh) + (BUTTONS.length - 1) * gutterOf(hh);
  const h = Math.min(Math.max(BUTTON_H * f.scale, MIN.button), (MIN.button * page) / across(MIN.button));
  const w = widthOf(h);
  const g = gutterOf(h);
  const tabsWidth = across(h);
  const titleWidth = (type.mark.ink.right - type.foot) * te;
  const nameWidth = (type.name.feet.right - type.name.ink.left) * ne;
  const below = Math.max(0, type.low * te, type.name.ink.bottom * ne);
  const above = Math.max(-type.mark.ink.top * te, -type.name.ink.top * ne);
  // the layouts, widest first: one line (with two tabs' height of empty space after the title); tabs on the
  // wall with the title and the name above them; then each on a line of its own
  const one = titleWidth + 2 * h + tabsWidth + BUTTON_NAME_GAP * h + nameWidth;
  const two = Math.max(tabsWidth, titleWidth + h + nameWidth);
  const three = Math.max(tabsWidth, titleWidth, nameWidth);
  const lines = one <= right - left ? 1 : two <= right - left ? 2 : two <= page ? 2 : 3;
  const need = lines === 1 ? one : lines === 2 ? two : three;
  // the band it takes: the yard's own width when it fits there; else as much as it needs, centred over the yard, on the canvas
  let bl = left;
  let br = right;
  if (need > right - left) {
    const width = Math.min(need, page);
    bl = Math.min(Math.max(EDGE, (left + right) / 2 - width / 2), f.width - EDGE - width);
    br = bl + width;
  }
  const tabs = (end: number) => {
    const out: (Slot & { w: number })[] = [];
    let x = end;
    for (let k = BUTTONS.length - 1; k >= 0; k--) {
      x -= w;
      out[k] = { x, y: wall - h, h, w };
      x -= g;
    }
    return out;
  };
  const lead = TITLE_GAP * te;
  const step = above + below + lead;
  let titleY: number;
  let nameY: number;
  let buttons: (Slot & { w: number })[];
  if (lines === 1) {
    titleY = nameY = wall - lead - below;
    buttons = tabs(br - type.name.feet.right * ne + type.name.ink.left * ne - BUTTON_NAME_GAP * h);
  } else {
    buttons = tabs(br);
    nameY = wall - h - lead - below;
    titleY = lines === 2 ? nameY : nameY - step;
  }
  const onWall = buttons[0].x >= left - 0.5 && buttons[buttons.length - 1].x + w <= right + 0.5;
  const title = { x: bl - type.foot * te, y: titleY, em: te };
  const name = { x: br - type.name.feet.right * ne, y: nameY, em: ne };
  return { title, name, buttons, onWall, height: f.top - Math.min(titleY - above, wall - h) };
}

/** How much room the line needs above the yard's top edge, px. */
export function headerHeight(type: Type, f: Frame): number {
  return headerAt(type, f).height;
}

/**
 * The name under the logo, box units: across the whole box, its H's outer
 * foot on the box's left edge and its last i's on the right, as "fair&" spans
 * it above; its tallest letters half a gutter below the box, as "fair" stands
 * half a gutter above. (One word to a box was tried: "Hamed" is a quarter wider
 * than "Seyed" and "Allaei", and evening them out cramped one and loosened the
 * others.)
 */
function nameInLogo(type: Type): Pen {
  const feet = type.name.feet;
  const em = 1 / (feet.right - feet.left);
  return { x: -feet.left * em, y: 1 + GRID.gap * LETTERS.lift - type.name.ink.top * em, em };
}

/**
 * The menu beside the logo, box units: buttons on the logo's grid, one to each
 * row of small boxes on the right (the column's three, then the corner's
 * block), one gutter out as the boxes are a gutter apart, as tall as a small box.
 */
function menuInLogo(): Slot[] {
  const x = 1 + GRID.gap;
  return Array.from({ length: IN_LOGO }, (_, k) => ({ x, y: SQ[k < 3 ? 1 + k : 7].y, h: SQ[1].side }));
}

/** How far right the menu reaches, box units. */
function menuRight(): number {
  return 1 + GRID.gap + widthOf(SQ[1].side);
}

/** An ink box for a pen in screen px, a little padded, for the link over it. */
function boxOf(ink: Ink, pen: Pen): Box {
  const pad = Math.max(2, 0.15 * pen.em);
  return { x0: pen.x + ink.left * pen.em - pad, y0: pen.y + ink.top * pen.em - pad, x1: pen.x + ink.right * pen.em + pad, y1: pen.y + ink.bottom * pen.em + pad };
}

function glyph(ctx: CanvasRenderingContext2D, g: Glyph, x: number, y: number, em: number, colour: string, alpha = 1): void {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = colour;
  ctx.font = `${g.weight} ${em * g.size}px ${g.family}`;
  ctx.fillText(g.ch, x, y);
  ctx.globalAlpha = 1;
}

/** A run of glyphs at a pen, screen px. */
function run(ctx: CanvasRenderingContext2D, glyphs: readonly Glyph[], pen: Pen, colour: (k: number) => string): void {
  glyphs.forEach((g, k) => glyph(ctx, g, pen.x + g.x * pen.em, pen.y, pen.em, colour(k)));
}

/** The same lettering size for every menu button and for the cover-copy ceiling. */
function buttonEm(type: Type, h: number): number {
  const tall = type.up + type.down;
  return Math.min((BUTTON_SHARE * h) / tall, (widthOf(h) - h) / (type.wide - tall + CUE_ROOM));
}

/**
 * Button k at `slot` (screen px), framed as the squares are (their inset
 * outline, in proportion), on the floor's off-white. As a tab (`tab` 1) it has
 * no bottom line, the yard's wall being its bottom edge; `open`, the wall
 * under it is cut too, so it opens into the yard (the one you are on). Its word is about half
 * its height (as large as the widest word, About, allows), with the same
 * margin left, above and below; at its right end, a
 * margin in, a cue that says "press": a play triangle (a pause while the game
 * plays), a chevron for the rest. The ones that work in the essay's dark brown,
 * the rest in the lighter ink. Returns its box.
 */
function drawButton(ctx: CanvasRenderingContext2D, type: Type, k: number, slot: Slot, alpha = 1, playing = false, tab = 0, open = false, glow = false): Box {
  const b = BUTTONS[k];
  const colour = b.live ? BROWN : AMP;
  const h = slot.h;
  const w = widthOf(h);
  if (glow) {
    // something to press next: a soft gold light around it
    ctx.save();
    ctx.globalAlpha = alpha * (0.75 + 0.25 * Math.sin(performance.now() / 260));
    ctx.shadowColor = GLOW;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = GLOW;
    ctx.lineWidth = 3;
    ctx.strokeRect(slot.x - 2, slot.y - 2, w + 4, h + 2);
    ctx.restore();
  }
  const edge = Math.max(1, (h * Math.min(0.25 * GRID.gap, 0.08 * SQ[1].side)) / SQ[1].side);
  // half the height, unless the widest word and its cue would not fit between the margins: the same size in every button
  const tall = type.up + type.down;
  const em = buttonEm(type, h);
  const pad = (h - tall * em) / 2;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = FLOOR;
  ctx.fillRect(slot.x, slot.y, w, h);
  if (open && tab >= 1) ctx.fillRect(slot.x + edge, slot.y + h - 0.5, w - 2 * edge, WALL_OUT + 1);
  ctx.strokeStyle = colour;
  ctx.lineWidth = edge;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  const fl = slot.x + edge / 2;
  const fr = slot.x + w - edge / 2;
  const ft = slot.y + edge / 2;
  const fb = slot.y + h;
  ctx.beginPath();
  ctx.moveTo(fl, fb);
  ctx.lineTo(fl, ft);
  ctx.lineTo(fr, ft);
  ctx.lineTo(fr, fb);
  ctx.stroke();
  if (tab < 1) {
    // the bottom line, which a tab gives to the wall
    ctx.globalAlpha = alpha * (1 - tab);
    ctx.beginPath();
    ctx.moveTo(slot.x, fb - edge / 2);
    ctx.lineTo(slot.x + w, fb - edge / 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const word = type.buttons[k];
  const pen = { x: slot.x + pad - word.ink.left * em, y: slot.y + pad + type.up * em, em };
  word.label.forEach((g) => glyph(ctx, g, pen.x + g.x * em, pen.y, em, colour, alpha));
  cue(ctx, b.id === 'play' ? (playing ? 'pause' : 'play') : 'go', slot.x + w - pad, pen, colour, Math.max(1.25, edge), alpha);
  return { x0: slot.x, y0: slot.y, x1: slot.x + w, y1: slot.y + h };
}

/**
 * The line above the yard, for StageView's ornament: the lockup ("fair &" and its square, its face the
 * yard's mood) alone on the left; the buttons, then the name, on the right. Lettered left to right
 * whatever the canvas was left in, and leaving it as it was (review
 * 2026-10-18, finding 5: the axes' end alignment broke the spacing). Returns
 * where the title, the name and each button are, for the controls over them.
 */
export function drawHeader(ctx: CanvasRenderingContext2D, type: Type, f: Frame, playing = false, current: 'play' | 'story' | 'rules' = 'play', glows: ReadonlySet<string> = new Set(), face: LockupFace | null = null): { title: Box; name: Box; buttons: Box[] } {
  const h = headerAt(type, f);
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  run(ctx, type.mark.glyphs, h.title, (k) => (k === 4 ? AMP : INK));
  drawLockupSquare(ctx, type.mark.square, h.title, 1, face);
  // tabs on the wall, the one you are in (Play, Story or Rules) open into the yard; off the wall's length, boxes
  const buttons = h.buttons.map((slot, k) => drawButton(ctx, type, k, slot, 1, playing && current === 'play', h.onWall ? 1 : 0, h.onWall && BUTTONS[k].id === current, glows.has(`tab:${BUTTONS[k].id}`)));
  run(ctx, type.name.glyphs, h.name, () => AMP);
  ctx.restore();
  return { title: boxOf(type.mark.ink, h.title), name: boxOf(type.name.ink, h.name), buttons };
}

// ———————————————————————————————————————————— geometry (the opening's world: the yard, 2 × 2, y down; the box at [0.5, 1.5]²)

const N = 16;
const YARD = 2;
const BOX = 0.5;
const SQ = cells(GRID);
/** An equal share's side: area 1/16. The fair start has no gutters: sixteen of these tile the box, as their wealth sums to one. */
const SHARE = 1 / 4;
const BIG = 0;

interface Rect {
  x: number;
  y: number;
  side: number;
}

const logoRect = (k: number): Rect => ({ x: BOX + SQ[k].x, y: BOX + SQ[k].y, side: SQ[k].side });
const fairRect = (k: number): Rect => ({ x: BOX + FAIR[k][1] * SHARE, y: BOX + FAIR[k][0] * SHARE, side: SHARE });

/**
 * Who plays which square: the person the stage's fold pose puts in each square's
 * fair cell, so the opening ends exactly where the stage begins. Null unless
 * the stage holds sixteen people folded into a 4 × 4 grid of equal squares.
 */
export function castOf(s: Session): Int32Array | null {
  const st = s.stage;
  if (st.n !== N) return null;
  const at = new Map<string, number>();
  for (let p = 0; p < N; p++) {
    if (Math.abs(st.w[p] - SHARE) > 1e-6 || Math.abs(st.h[p] - SHARE) > 1e-6) return null;
    const col = (st.x[p] - BOX) / SHARE;
    const row = (YARD - st.y[p] - st.h[p] - BOX) / SHARE;
    if (Math.abs(col - Math.round(col)) > 1e-6 || Math.abs(row - Math.round(row)) > 1e-6) return null;
    at.set(`${Math.round(row)},${Math.round(col)}`, p);
  }
  const who = new Int32Array(N);
  for (let k = 0; k < N; k++) {
    const p = at.get(`${FAIR[k][0]},${FAIR[k][1]}`);
    if (p === undefined) return null;
    who[k] = p;
  }
  return who;
}

/** How far a small face leans toward the big one, in its square's sides: mostly up, as the flat faces' head turn alone is too subtle. */
const LEAN = 0.14;
function leanOf(k: number): [number, number] {
  if (k === BIG) return [0, 0];
  const b = SQ[BIG];
  const c = SQ[k];
  const dx = b.x + b.side / 2 - (c.x + c.side / 2);
  const dy = b.y + b.side / 2 - (c.y + c.side / 2);
  const d = Math.hypot(dx, dy);
  return [(0.25 * LEAN * dx) / d, (LEAN * dy) / d];
}

// ———————————————————————————————————————————— time

/** Beats, seconds: the logo, the pull-back, the title, the box, giving back, the fair start. */
const T = { zoom: 2.6, type: 4.6, fair: 6.6, square: 9.0, end: 11.0 };
/** How long the opening runs once started, from its own clock's zero. */
export const OPENING_END = T.end;
/** The eight who move into the big one's freed cells, farthest first, so no one hops over someone already home. */
const MOVERS = [7, 8, 9, 10, 11, 12, 13, 14].sort((a, b) => FAIR[a][0] + FAIR[a][1] - (FAIR[b][0] + FAIR[b][1]) || a - b);

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const prog = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const smooth = (u: number) => u * u * (3 - 2 * u);
const inOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);

/** When mover m takes off; the last has lifted clear of the corner a third of the way into its hop. */
const takeoff = (m: number) => T.fair + 0.55 + 0.11 * m;
const CLEAR = takeoff(MOVERS.length - 1) + 0.3;
/** The smallest square, which keeps the corner the rest of the tail leaves. */
const LAST = 15;

/**
 * The fair beat for square k: how far along, 0 … 1. The smallest square grows
 * into its corner only once the tail standing there has left it (review
 * 2026-10-18, finding 3: it grew through squares still on the ground).
 */
function fairU(k: number, t: number): number {
  if (k === BIG) return inOut(prog(t, T.fair, T.fair + 0.9));
  if (k === LAST) return smooth(prog(t, CLEAR, CLEAR + 0.9));
  const m = MOVERS.indexOf(k);
  if (m < 0) return smooth(prog(t, T.fair + 0.3, T.fair + 1.4));
  return prog(t, takeoff(m), takeoff(m) + 0.95);
}

interface Body extends Rect {
  lift: number;
  /** 0 the logo's look (solid, outlined, leaning faces), 1 the stage's. */
  stage: number;
  /** Faces between their logo size and the stage's. */
  toLaw: number;
  dx: number;
  dy: number;
}

function bodyAt(k: number, t: number): Body {
  let r = logoRect(k);
  let lift = 0;
  let dx = 0;
  let dy = 0;
  const uf = fairU(k, t);
  if (uf > 0) {
    const a = logoRect(k);
    const b = fairRect(k);
    if (k === BIG) r = { x: a.x, y: a.y, side: lerp(a.side, b.side, uf) };
    else {
      const e = inOut(uf);
      const side = Math.sqrt(lerp(a.side ** 2, b.side ** 2, e));
      const cx = lerp(a.x + a.side / 2, b.x + b.side / 2, e);
      const cy = lerp(a.y + a.side / 2, b.y + b.side / 2, e);
      r = { x: cx - side / 2, y: cy - side / 2, side };
      // the eight hop over the crowd; the rest only close the gutters
      if (MOVERS.includes(k)) lift = Math.min(0.16, 0.25 * Math.hypot(b.x - a.x, b.y - a.y)) * Math.sin(Math.PI * uf);
      if (uf < 1) {
        dx = b.x - a.x;
        dy = b.y - a.y;
      }
    }
  }
  return { ...r, lift, stage: smooth(prog(t, T.fair, T.fair + 0.7)), toLaw: uf, dx, dy };
}

/** Every square at opening time t, the opening's world units: what is drawn, for checking it. */
export function bodiesAt(t: number): { x: number; y: number; side: number; lift: number }[] {
  return Array.from({ length: N }, (_, k) => {
    const b = bodyAt(k, t);
    return { x: b.x, y: b.y, side: b.side, lift: b.lift };
  });
}

// ———————————————————————————————————————————— camera (the opening's: screen = o + world × scale, world y down)

interface Cam {
  scale: number;
  ox: number;
  oy: number;
}

/** A world rectangle centred in the canvas less `pad` all round, or `top` above. */
function fit(x0: number, y0: number, x1: number, y1: number, w: number, h: number, pad: number, top = pad): Cam {
  const aw = Math.max(1, w - 2 * pad);
  const ah = Math.max(1, h - pad - top);
  const scale = Math.min(aw / (x1 - x0), ah / (y1 - y0));
  return { scale, ox: pad + (aw - (x1 - x0) * scale) / 2 - x0 * scale, oy: top + (ah - (y1 - y0) * scale) / 2 - y0 * scale };
}

/** Between two cameras: the world point at the canvas centre glides, the zoom is geometric. */
function between(a: Cam, b: Cam, u: number, w: number, h: number): Cam {
  const scale = a.scale * (b.scale / a.scale) ** u;
  const wx = lerp((w / 2 - a.ox) / a.scale, (w / 2 - b.ox) / b.scale, u);
  const wy = lerp((h / 2 - a.oy) / a.scale, (h / 2 - b.oy) / b.scale, u);
  return { scale, ox: w / 2 - wx * scale, oy: h / 2 - wy * scale };
}

// ———————————————————————————————————————————— faces

const K = 1.15;
/** The manga eye's half-width, in face radii × K: the big one's eye is the i's dot. */
const EYE = 0.075;
/** A small square's face in the logo, in its sides: an equal share's proportions at every level, so the tail is self-similar. */
const LOGO_FACE = 1 / Math.sqrt(Math.PI);
/** Below this radius (px) a face is two dots for eyes; below DOT_MIN, nothing. */
const FULL_FACE = 9;
const DOT_MIN = 2.5;
/** How the small faces turn to the big one: the head a little sideways, all the way up. */
const TOWARD = { yaw: 0.6, pitch: 1.1 };

/** Stable noise in [0, 1). */
const hash = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** A cue that says "press": a play triangle, a pause, or a chevron; its right edge at `right`, centred on the pen's x-height. */
function cue(ctx: CanvasRenderingContext2D, kind: 'play' | 'pause' | 'go', right: number, pen: Pen, colour: string, lw: number, alpha: number): void {
  const mid = pen.y - 0.25 * pen.em;
  const half = 0.22 * pen.em;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  if (kind === 'pause') {
    const bar = 0.45 * half;
    ctx.fillStyle = colour;
    ctx.fillRect(right - 1.6 * half, mid - half, bar, 2 * half);
    ctx.fillRect(right - bar, mid - half, bar, 2 * half);
  } else if (kind === 'play') {
    ctx.moveTo(right, mid);
    ctx.lineTo(right - 1.6 * half, mid - half);
    ctx.lineTo(right - 1.6 * half, mid + half);
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
  } else {
    ctx.moveTo(right - half - lw / 2, mid - half);
    ctx.lineTo(right - lw / 2, mid);
    ctx.lineTo(right - half - lw / 2, mid + half);
    ctx.strokeStyle = colour;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ———————————————————————————————————————————— the opening

export class Opening {
  /** The faces, by person: the stage goes on with them (StageView.adopt). */
  readonly field: FaceField;
  done = false;
  /** The player has started: the logo unfolds. Until then it holds, alive. */
  started = false;
  /** The tab the unfolding lands in, open into the yard: Play, or the one asked for from the logo (Learn). */
  current: 'play' | 'story' | 'rules' = 'play';
  /** The face in the title's square (the page's: it follows the yard's Gini). */
  face: LockupFace | null = null;
  /** Where the name was last drawn, for the link over it. */
  byline: Box | null = null;
  /** Where each button was last drawn (null when it is not there), for the controls over them. */
  controls: (Box | null)[] = BUTTONS.map(() => null);
  /** The held cover's full graphic, including its menu column; the HTML copy shares these edges in portrait. */
  coverBounds: Box | null = null;
  /** The actual menu lettering size, also the upper limit for the cover's HTML words. */
  get buttonFontSize(): number {
    const box = this.controls[0];
    return box ? buttonEm(this.type, box.y1 - box.y0) : 0;
  }
  private readonly ctx: CanvasRenderingContext2D;
  private readonly session: Session;
  /** The stage it was made for: only that one goes on with its faces. */
  private readonly stage: Stage;
  private readonly view: StageView;
  private readonly type: Type;
  /** Square k is played by person who[k]. */
  private readonly who: Int32Array;
  private readonly painters: FacePainter[];
  private readonly colours: { paper: string; floor: string; wall: string; faint: string };
  /** The opening's time (held at 0 until the start), and the faces' own clock. */
  private t = 0;
  private stepped = 0;
  private clock = 0;
  private readonly fired = new Set<string>();

  constructor(canvas: HTMLCanvasElement, session: Session, view: StageView, type: Type, who: Int32Array) {
    this.ctx = canvas.getContext('2d')!;
    this.session = session;
    this.stage = session.stage;
    this.view = view;
    this.type = type;
    this.who = who;
    this.painters = Array.from({ length: N }, () => new FacePainter());
    const css = getComputedStyle(canvas);
    const v = (name: string, or: string) => css.getPropertyValue(name).trim() || or;
    this.colours = { paper: v('--paper', '#f4efe4'), floor: v('--floor', '#fbf8f1'), wall: v('--wall', '#5b5547'), faint: v('--faint', '#b9b09c') };
    // the stage's faces (its seed, its temperaments), in the logo's moods for now
    const f = new FaceField(N, session.game.seed);
    for (let k = 0; k < N; k++) {
      const p = who[k];
      if (k === BIG) f.temper(p, { v0: -0.3, a0: -0.4, d0: 1, smirk: 1, reactivity: 1, drift: 0 });
      else f.temper(p, { v0: -0.34 - 0.12 * hash(k, 1), a0: -0.08 + 0.1 * hash(k, 2), d0: -0.12 * hash(k, 3), smirk: 0, reactivity: 1, drift: 0.03 });
    }
    f.contempt[who[BIG]] = f.contemptTo[who[BIG]] = 1;
    this.field = f;
    this.looks(0);
    f.settle();
  }

  /**
   * Straight to the stage, with the faces it would have had at the end: their
   * own temperaments, the big one's contempt let go (review 2026-10-18,
   * finding 2: skipped early, they kept the logo's moods for good).
   */
  skip(): void {
    this.restore();
    this.done = true;
  }

  /** Whether `s` still holds the stage this opening was made for (a command may have rebuilt it: finding 4). */
  belongsTo(s: Session): boolean {
    return s.stage === this.stage;
  }

  /** Everyone back to the temperament the stage gives them; the big one's contempt let go. */
  private restore(): void {
    const f = this.field;
    const seed = this.session.game.seed;
    f.contemptTo[this.who[BIG]] = 0;
    for (let k = 0; k < N; k++) {
      const p = this.who[k];
      const tm = temperament(p * 13 + 5 + seed * 7919);
      f.v0[p] = tm.v0;
      f.a0[p] = tm.a0;
      f.d0[p] = tm.d0;
      f.smirk[p] = tm.smirk;
      f.reactivity[p] = tm.reactivity;
      f.drift[p] = tm.drift;
    }
  }

  /** The player starts the game: the logo unfolds into the yard. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.t = this.stepped = T.zoom;
    // the reader asked for less motion: no unfolding, the yard at once (as a second press of Play gives it)
    if (this.view.reduced) this.skip();
  }

  /** Started and `at` seconds into the opening (for checking a beat: ?opening=7.5). */
  seek(at: number): void {
    this.start();
    if (at > T.zoom) this.frame(at - T.zoom);
  }

  frame(dt: number): void {
    if (this.done) return;
    this.clock += dt;
    if (!this.started) {
      // the logo holds, alive: blinks, moods drifting a little, heads moving about their gaze
      this.looks(0);
      this.field.step(dt);
      this.draw();
      return;
    }
    const t = Math.min(T.end, this.t + dt);
    const step = 1 / 60;
    while (this.stepped + step <= t + 1e-9) {
      const now = this.stepped + step;
      this.events(now);
      this.looks(now);
      this.field.step(step);
      this.stepped = now;
    }
    this.t = t;
    this.draw();
    if (t >= T.end) this.done = true;
  }

  private once(key: string, at: number, now: number, act: () => void): void {
    if (now >= at && !this.fired.has(key)) {
      this.fired.add(key);
      act();
    }
  }

  private events(now: number): void {
    const f = this.field;
    // the big one gives back: contempt gone, a dominant's loss is anger; the rest take it as joy,
    // and everyone heads back to the temperament the stage gives them
    this.once('fair', T.fair, now, () => {
      for (let k = 0; k < N; k++) {
        const p = this.who[k];
        if (SQ[k].share === 1 / N && k !== BIG) f.feel(p, 0.7, 0.2, 0.2);
        else f.react(p, SQ[k].share, 1 / N, k === BIG ? 1 : 0.6);
      }
      this.restore();
    });
    this.once('square', T.square, now, () => {
      for (let k = 0; k < N; k++) f.startle(this.who[k], 0.15);
    });
  }

  /** Where everyone looks (yaw + right, pitch + down): the big one at us, the rest up at him; then at us; then about. */
  private looks(now: number): void {
    const f = this.field;
    const bodies = Array.from({ length: N }, (_, k) => bodyAt(k, now));
    const big = bodies[BIG];
    for (let k = 0; k < N; k++) {
      const p = this.who[k];
      const b = bodies[k];
      if (b.dx || b.dy) {
        const d = Math.hypot(b.dx, b.dy);
        f.look(p, b.dx / d, (0.6 * b.dy) / d);
      } else if (now < T.fair + 0.4) {
        // a slow drift about the gaze, each at its own pace, so the held logo is never a still
        // (none for a reader who asked for less motion: the gaze holds)
        const sway = (a: number) => (this.view.reduced ? 0 : Math.sin(this.clock * (0.3 + 0.25 * hash(k, a)) + 6.28 * hash(k, a + 1)));
        if (k === BIG) f.look(p, 0.06 * sway(8), 0.04 * sway(10));
        else {
          const dx = big.x + big.side / 2 - (b.x + b.side / 2);
          const dy = big.y + big.side / 2 - (b.y + b.side / 2);
          const d = Math.hypot(dx, dy);
          f.look(p, (TOWARD.yaw * dx) / d + 0.12 * sway(8), (TOWARD.pitch * dy) / d + 0.08 * sway(10));
        }
      } else if (now < T.square + 0.8) f.look(p, 0, 0);
      else f.glance(p);
    }
  }

  private draw(): void {
    const { ctx, type, t } = this;
    // the stage's own camera for this canvas, turned to the opening's world (y down)
    const st = this.view.settle(this.session);
    ctx.save();
    ctx.textAlign = 'left';
    const yardCam: Cam = { scale: st.scale, ox: st.ox, oy: st.oy - YARD * st.scale };
    const m = 0.12;
    const nm = nameInLogo(type);
    const logoCam = fit(BOX - m, BOX + type.letters.top - m, BOX + menuRight() + m, BOX + nm.y + type.name.ink.bottom * nm.em + m, st.w, st.h, 18, Math.max(18, st.clear));
    const cam = between(logoCam, yardCam, inOut(prog(t, T.zoom, T.zoom + 2)), st.w, st.h);
    const X = (x: number) => cam.ox + x * cam.scale;
    const Y = (y: number) => cam.oy + y * cam.scale;
    const c = this.colours;
    ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    ctx.fillStyle = c.paper;
    ctx.fillRect(0, 0, st.w, st.h);
    // the yard and the dashed reference box come in as the camera pulls back (as render.ts draws them)
    const yard = smooth(prog(t, T.zoom + 0.2, T.zoom + 1.6));
    if (yard > 0) {
      ctx.globalAlpha = yard;
      ctx.fillStyle = c.floor;
      ctx.fillRect(X(0), Y(0), YARD * cam.scale, YARD * cam.scale);
      ctx.strokeStyle = c.wall;
      ctx.lineWidth = 3;
      ctx.strokeRect(X(0) - 1.5, Y(0) - 1.5, YARD * cam.scale + 3, YARD * cam.scale + 3);
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = c.faint;
      ctx.lineWidth = 1;
      ctx.strokeRect(X(BOX), Y(BOX), cam.scale, cam.scale);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    this.words(cam, yardCam, st.header);
    this.coverBounds = { x0: X(BOX), y0: Y(BOX + type.letters.top), x1: X(BOX + menuRight()), y1: this.byline?.y1 ?? Y(BOX + 1) };
    const bodies = Array.from({ length: N }, (_, k) => bodyAt(k, t));
    const order = [...bodies.keys()].sort((a, b) => bodies[a].lift - bodies[b].lift);
    const r0 = (SHARE / Math.sqrt(Math.PI)) * cam.scale;
    for (const k of order) this.body(cam, k, bodies[k], r0);
    ctx.restore();
  }

  private words(cam: Cam, yardCam: Cam, frame: Frame): void {
    const { ctx, type, t } = this;
    const L = type.letters;
    const W = type.mark;
    ctx.textBaseline = 'alphabetic';
    const done = t >= T.type + 0.12 * 5 + 0.3 && t >= T.zoom + 2;
    if (done) {
      // the line as the stage will draw it
      const line = drawHeader(ctx, type, frame, false, this.current, new Set(), this.face);
      this.byline = line.name;
      this.controls = line.buttons;
      return;
    }
    // the line's places, in the opening's world
    const h = headerAt(type, frame);
    const world = (p: Pen): Pen => ({ x: (p.x - yardCam.ox) / yardCam.scale, y: (p.y - yardCam.oy) / yardCam.scale, em: p.em / yardCam.scale });
    const title = world(h.title);
    const move = inOut(prog(t, T.zoom + 0.35, T.zoom + 2));
    const screen = (x: number, y: number, em: number): Pen => ({ x: cam.ox + x * cam.scale, y: cam.oy + y * cam.scale, em: em * cam.scale });
    // "fair" moves as one run (its origin glides, its em zooms, its letters ease to the wordmark's spacing); "&" on its own
    const ox = lerp(BOX + L.fair.x, title.x, move);
    const oy = lerp(BOX + L.fair.y, title.y, move);
    const em = L.fair.em * (title.em / L.fair.em) ** move;
    L.fair.glyphs.forEach((g, k) => {
      const p = screen(ox + lerp(g.x, W.glyphs[k].x, move) * em, oy, em);
      glyph(ctx, g, p.x, p.y, p.em, INK);
    });
    const ax = lerp(BOX + L.amp.x, title.x + W.glyphs[4].x * title.em, move);
    const aem = L.amp.em * (title.em / L.amp.em) ** move;
    const a = screen(ax, oy, aem);
    glyph(ctx, L.amp.glyphs[0], a.x, a.y, a.em, AMP);
    // then the square, in place of the word: it drops into place
    const fade = smooth(prog(t, T.type, T.type + 0.12 * 5 + 0.3));
    if (fade > 0) drawLockupSquare(ctx, type.mark.square, screen(title.x, title.y - (1 - fade) * 0.25 * title.em, title.em), fade, this.face);
    // the name, from under the logo to the line's far end
    const from = nameInLogo(type);
    const to = world(h.name);
    const n = screen(lerp(BOX + from.x, to.x, move), lerp(BOX + from.y, to.y, move), from.em * (to.em / from.em) ** move);
    run(ctx, type.name.glyphs, n, () => AMP);
    this.byline = boxOf(type.name.ink, n);
    // the buttons, from beside the logo to the line, each a scaled copy of itself; About comes in by the name
    const logo = menuInLogo();
    this.controls = h.buttons.map((to, k) => {
      const end = { x: (to.x - yardCam.ox) / yardCam.scale, y: (to.y - yardCam.oy) / yardCam.scale, h: to.h / yardCam.scale };
      const at = (x: number, y: number, hh: number): Slot => ({ x: cam.ox + x * cam.scale, y: cam.oy + y * cam.scale, h: hh * cam.scale });
      if (k >= IN_LOGO) {
        const a = smooth(prog(move, 0.6, 1));
        if (a <= 0) return null;
        const box = drawButton(ctx, type, k, at(end.x, end.y, end.h), a, false, h.onWall ? 1 : 0);
        return a < 0.5 ? null : box;
      }
      const from = logo[k];
      return drawButton(ctx, type, k, at(lerp(BOX + from.x, end.x, move), lerp(BOX + from.y, end.y, move), from.h * (end.h / from.h) ** move), 1, false, h.onWall ? move : 0, h.onWall && BUTTONS[k].id === this.current);
    });
  }

  private body(cam: Cam, k: number, b: Body, r0: number): void {
    const { ctx } = this;
    const p = this.who[k];
    const name = colourOf(p);
    const fill = FILLS[name];
    const pen = STROKES[name];
    const side = b.side * cam.scale;
    const cx = cam.ox + (b.x + b.side / 2) * cam.scale;
    const cy = cam.oy + (b.y + b.side / 2 - b.lift) * cam.scale;
    if (b.lift > 0.002) {
      ctx.fillStyle = 'rgba(40, 37, 31, 0.16)';
      ctx.beginPath();
      ctx.ellipse(cx, cam.oy + (b.y + b.side) * cam.scale, side * 0.45, Math.max(0.6, side * 0.12), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // the logo's solid squares with an inset outline give way to the stage's: 82% fill, a 1.25 px pen on the edge
    ctx.globalAlpha = lerp(1, 0.82, b.stage);
    ctx.fillStyle = fill;
    ctx.fillRect(cx - side / 2, cy - side / 2, side, side);
    ctx.globalAlpha = 1;
    const inset = Math.min(0.25 * GRID.gap, 0.08 * b.side) * cam.scale * (1 - b.stage);
    if (inset > 0.05) {
      ctx.strokeStyle = pen;
      ctx.lineWidth = inset;
      ctx.strokeRect(cx - side / 2 + inset / 2, cy - side / 2 + inset / 2, side - inset, side - inset);
    }
    if (b.stage > 0 && side > 1.2) {
      ctx.globalAlpha = b.stage;
      ctx.strokeStyle = pen;
      ctx.lineWidth = Math.min(1.25, 0.25 * side);
      ctx.lineJoin = 'round';
      ctx.strokeRect(cx - side / 2, cy - side / 2, side, side);
      ctx.globalAlpha = 1;
    }
    // faces: the logo's sizes (the big eye the i's dot, the rest self-similar), then the stage's (faces.ts)
    const r = side / Math.sqrt(Math.PI);
    const law = Math.round(Math.min(faceRadius(r, r0), 0.45 * side) * 4) / 4;
    const logo = k === BIG ? (this.type.letters.dot * cam.scale) / (2 * EYE * K) : LOGO_FACE * side;
    const s = lerp(logo, law, smooth(b.toLaw));
    const [lx, ly] = leanOf(k);
    const keep = 1 - b.stage;
    const fx = cx + lx * side * keep;
    const fy = cy + ly * side * keep;
    const f = this.field;
    f.size(p, r, r0);
    if (s < DOT_MIN) return;
    if (s < FULL_FACE) {
      const kk = K * s;
      ctx.fillStyle = pen;
      for (const e of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(fx + e * 0.3 * kk, fy - 0.08 * kk, Math.max(0.6, EYE * kk), 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    f.still[p] = s < 7 ? 1 : 0;
    const read = f.poseOf(p, this.view.reduced);
    const d = this.painters[p].paint('manga', 'square', r, s, read.pose, read.marks, f.seed[p], this.clock);
    if (d) paint(ctx, d, fx, fy, pen, fill);
  }
}
