/**
 * One square in a line of text, declared in the page's HTML:
 *
 *   <span data-sq data-colour="blue" data-feel="proud" data-logo="linkedin" data-act="huff" data-size="1.5">
 *
 *   data-colour  a stage colour (agentStyle COLOR_NAMES), blue by default
 *   data-feel    a feeling word it rests at (moments.ts FEELINGS), or an everyday temperament
 *   data-logo    a sticker on its corner (logos.ts)
 *   data-act     something it keeps doing (ACTS below)
 *   data-size    its side, in ems of the text around it
 *
 * Every square watches a pointer that moves near it, looks up and brightens
 * when its line is hovered, and hops when clicked.
 */
import type { ColorName } from '../essay/agentStyle.ts';
import { drawLogo, drawSticker, isLogo, type LogoName } from './logos.ts';
import { Body, Cast, INK, PAPER, Sheet, clamp, isColour, temperOf, type Mount, type Pointer } from './cast.ts';

/** How near the pointer has to be to be watched, px. */
const REACH = 280;

/** Something a square keeps doing. One per square, made fresh for it. */
export interface Act {
  /** Room beside the square for a prop, in sides. */
  readonly room?: number;
  /** How far away the pointer still draws its eyes, px. */
  readonly reach?: number;
  /** Every frame, before the square moves: feelings, hops, a lean. */
  tick(b: Body, cast: Cast, t: number, dt: number): void;
  /** Drawn after the body, in canvas px. */
  draw?(ctx: CanvasRenderingContext2D, b: Body, t: number): void;
  /** Has the eyes for now: the pointer is not watched. */
  busy?(t: number): boolean;
}

const smooth = (u: number) => {
  const x = clamp(u, 0, 1);
  return x * x * (3 - 2 * x);
};

/** Follows the pointer anywhere on the page: the page's own face. */
function follow(): Act {
  return { reach: Infinity, tick() {} };
}

/** What a square drinks: Ko-fi's coffee, or a hot chocolate. */
type Cup = 'coffee' | 'cocoa';

const isCup = (s: string | undefined): s is Cup => s === 'coffee' || s === 'cocoa';

/** A mug of hot chocolate, `size` px, centred on the origin: paper and ink, cocoa on top, a square marshmallow. */
function drawCocoa(ctx: CanvasRenderingContext2D, size: number): void {
  const s = size;
  ctx.save();
  ctx.lineWidth = Math.max(0.8, 0.085 * s);
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.arc(0.24 * s, 0.05 * s, 0.15 * s, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(-0.36 * s, -0.3 * s, 0.6 * s, 0.68 * s, [0.04 * s, 0.04 * s, 0.14 * s, 0.14 * s]);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-0.06 * s, -0.3 * s, 0.3 * s, 0.075 * s, 0, 0, 2 * Math.PI);
  ctx.fillStyle = '#7b4a2e';
  ctx.fill();
  ctx.stroke();
  ctx.translate(-0.02 * s, -0.36 * s);
  ctx.rotate(0.35);
  ctx.lineWidth = Math.max(0.6, 0.05 * s);
  ctx.fillStyle = PAPER;
  ctx.fillRect(-0.08 * s, -0.08 * s, 0.16 * s, 0.16 * s);
  ctx.strokeRect(-0.08 * s, -0.08 * s, 0.16 * s, 0.16 * s);
  ctx.restore();
}

/**
 * Drinking: dozes, lifts the cup to its mouth, drinks with its eyes shut, and
 * wakes right up, sparkling; then slowly dozes off again (arousal relaxes in
 * seconds, the pleasure in ten). The coffee is Ko-fi's own mark. `offset`:
 * where in its cycle it starts, s; `front`: the cup held in front of its
 * corner (where the others wear a sticker), not at its side.
 */
function sip(cup: Cup = 'coffee', offset = 6.5, front = false): Act {
  const PERIOD = 8.5;
  const LIFT = [1.2, 1.8];
  const DRINK = [1.8, 2.9];
  const DOWN = [2.9, 3.4];
  let lastCycle = -1;
  let woke = false;
  /** Reduced motion: the cup stays down. */
  let still = false;
  const phase = (t: number) => (t + offset) % PERIOD;
  /** 0 down … 1 at the mouth. */
  const raised = (t: number) => {
    const p = phase(t);
    if (still || p < LIFT[0] || p > DOWN[1]) return 0;
    if (p < LIFT[1]) return smooth((p - LIFT[0]) / (LIFT[1] - LIFT[0]));
    if (p < DOWN[0]) return 1;
    return 1 - smooth((p - DOWN[0]) / (DOWN[1] - DOWN[0]));
  };
  return {
    // a cup at its side needs room beside it, or it lands on the next word
    room: front ? 0 : 0.45,
    busy: (t) => raised(t) > 0,
    tick(b, cast, t) {
      still = cast.reduced;
      if (still) return;
      const cycle = Math.floor((t + offset) / PERIOD);
      if (cycle !== lastCycle) {
        lastCycle = cycle;
        woke = false;
      }
      const p = phase(t);
      b.shut = p >= DRINK[0] && p < DRINK[1];
      if (raised(t) > 0) cast.lookToward(b.face, 1, 0.35);
      if (!woke && p >= DOWN[1]) {
        woke = true;
        cast.field.startle(b.face, 0.7);
        cast.field.feel(b.face, 0.9, 1.6, 0.2);
        b.hop(0.22 * b.side);
      }
    },
    draw(ctx, b, t) {
      const size = (front ? 0.5 : 0.52) * b.side;
      // down: at its side, about where a hand would be (or in front of its corner); raised: over the side of its mouth
      const fx = b.x;
      const fy = b.y - b.lift;
      const restX = fx + b.w / 2 + (front ? -0.06 : 0.16) * b.side;
      const restY = fy - (front ? 0.2 : 0.26) * b.side;
      const up = raised(t);
      const mouthX = fx + 0.38 * b.w;
      const mouthY = fy - 0.38 * b.h;
      const x = restX + (mouthX - restX) * up;
      const y = restY + (mouthY - restY) * up - Math.sin(Math.PI * up) * 0.15 * b.side;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.65 * up);
      if (cup === 'coffee') drawLogo(ctx, 'kofi', 0, 0, size, INK);
      else drawCocoa(ctx, size);
      ctx.restore();
      // steam: two wisps rising and fading, out of step; none while motion is reduced (review 2026-10-22, 4)
      if (up > 0 || still) return;
      ctx.save();
      ctx.strokeStyle = INK;
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(0.8, 0.04 * b.side);
      for (let k = 0; k < 2; k++) {
        const u = (t * 0.55 + k * 0.5 + offset) % 1;
        const x0 = x - size * 0.18 + k * size * 0.26;
        const y0 = y - size * 0.3 - u * size * 0.5;
        const len = size * 0.45;
        ctx.globalAlpha = 0.45 * Math.sin(Math.PI * u);
        ctx.beginPath();
        for (let s = 0; s <= 8; s++) {
          const v = s / 8;
          const px = x0 + Math.sin(v * 5 + t * 3 + k * 2) * size * 0.07;
          const py = y0 - v * len;
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

/** Dances in bursts: a hop on every beat, leaning one way and the other. */
function dance(): Act {
  const BEAT = 0.46;
  const ON = 3.7;
  const OFF = 2.4;
  let beat = -1;
  return {
    tick(b, cast, t) {
      if (cast.reduced) return;
      const p = t % (ON + OFF);
      if (p >= ON) {
        b.tiltTo = 0;
        return;
      }
      const k = Math.floor(p / BEAT);
      if (k === beat) return;
      beat = k;
      b.tiltTo = (k % 2 ? 1 : -1) * 0.16;
      b.hop(0.14 * b.side);
      cast.field.feel(b.face, 0.04, 0.08);
    },
  };
}

/** Huffs now and then: a start, a stamp and a shake. */
function huff(): Act {
  let next = 2 + Math.random() * 2;
  return {
    tick(b, cast, t) {
      if (cast.reduced || t < next) return;
      next = t + 3 + Math.random() * 2.5;
      cast.field.startle(b.face, 0.45);
      cast.field.feel(b.face, -0.35, 0.45, 0.25);
      b.hop(0.07 * b.side);
      b.shake = 0.45;
    },
  };
}

/** Poses now and then, head on one side, and the flash goes off. */
function flash(): Act {
  const PERIOD = 5.5;
  const POSE = [0.4, 2.1];
  const FLASH = 1.1;
  let fired = -1;
  let still = false;
  return {
    tick(b, cast, t) {
      still = cast.reduced;
      if (still) return;
      const p = (t + 4) % PERIOD;
      b.tiltTo = p > POSE[0] && p < POSE[1] ? -0.15 : 0;
      const cycle = Math.floor((t + 4) / PERIOD);
      if (p >= FLASH && fired !== cycle) {
        fired = cycle;
        cast.field.feel(b.face, 0.35, 0.3);
      }
      if (p > POSE[0] && p < POSE[1]) cast.field.look(b.face, 0, 0);
    },
    busy: (t) => {
      const p = (t + 4) % PERIOD;
      return p > POSE[0] && p < POSE[1];
    },
    draw(ctx, b, t) {
      // no flash while motion is reduced (review 2026-10-22, 4)
      const since = ((t + 4) % PERIOD) - FLASH;
      if (still || since < 0 || since > 0.45) return;
      const a = 1 - since / 0.45;
      const r = b.side * (0.7 + 0.5 * (1 - a));
      const g = ctx.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, r);
      g.addColorStop(0, `rgba(255, 253, 245, ${0.95 * a})`);
      g.addColorStop(1, 'rgba(255, 253, 245, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(b.cx - r, b.cy - r, 2 * r, 2 * r);
    },
  };
}

/**
 * Reads: an open book held low in front, eyes down on it; now and then a page turns, and every so often it looks
 * up at you, pleased. With motion reduced, it just reads.
 */
function read(): Act {
  const PAGE = 4.2;
  const FLIP = 0.55;
  const UP = [9, 10.6];
  const CYCLE = 12;
  let still = false;
  return {
    reach: 0,
    busy: () => true,
    tick(b, cast, t) {
      still = cast.reduced;
      const p = t % CYCLE;
      const up = !still && p > UP[0] && p < UP[1];
      cast.lookToward(b.face, 0, up ? -0.1 : 0.85);
      if (!still && Math.abs(p - UP[0]) < 0.02) cast.field.feel(b.face, 0.25, 0.15);
    },
    draw(ctx, b, t) {
      const s = b.side;
      const w = 0.86 * s;
      const h = 0.34 * s;
      const cx = b.x;
      const cy = b.y - b.lift - 0.26 * s;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.04);
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(0.8, 0.04 * s);
      ctx.strokeStyle = INK;
      // the cover, a little larger, behind the pages
      ctx.fillStyle = '#4d271c';
      ctx.beginPath();
      ctx.moveTo(0, -0.38 * h);
      ctx.lineTo(-0.54 * w, -0.5 * h);
      ctx.lineTo(-0.54 * w, 0.6 * h);
      ctx.lineTo(0, 0.5 * h);
      ctx.lineTo(0.54 * w, 0.6 * h);
      ctx.lineTo(0.54 * w, -0.5 * h);
      ctx.closePath();
      ctx.fill();
      // the two pages, the spine sunk a little
      const page = (dir: 1 | -1, reach = 1) => {
        ctx.beginPath();
        ctx.moveTo(0, -0.42 * h);
        ctx.quadraticCurveTo(dir * 0.25 * w * reach, -0.58 * h, dir * 0.5 * w * reach, -0.5 * h);
        ctx.lineTo(dir * 0.5 * w * reach, 0.5 * h);
        ctx.quadraticCurveTo(dir * 0.25 * w * reach, 0.42 * h, 0, 0.45 * h);
        ctx.closePath();
        ctx.fillStyle = PAPER;
        ctx.fill();
        ctx.stroke();
      };
      page(-1);
      page(1);
      // lines of print
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = Math.max(0.5, 0.025 * s);
      for (const dir of [-1, 1])
        for (let k = 0; k < 3; k++) {
          const y = (-0.2 + 0.22 * k) * h;
          ctx.beginPath();
          ctx.moveTo(dir * 0.1 * w, y);
          ctx.lineTo(dir * (k === 2 ? 0.3 : 0.4) * w, y);
          ctx.stroke();
        }
      ctx.globalAlpha = 1;
      ctx.lineWidth = Math.max(0.8, 0.04 * s);
      // a page turning, right to left
      const since = t % PAGE;
      if (!still && since < FLIP) page(1, Math.cos((Math.PI * since) / FLIP));
      ctx.restore();
    },
  };
}

export const ACTS: Readonly<Record<string, () => Act>> = { follow, sip: () => sip(), dance, huff, flash, read };

export class Solo implements Mount {
  readonly faces = 1;
  readonly host: HTMLElement;
  private readonly sheet: Sheet;
  private readonly act: Act | null;
  private readonly logo: LogoName | null;
  private readonly size: number;
  private readonly feel: string | undefined;
  private readonly colour: ColorName;
  private body: Body | null = null;
  private cast: Cast | null = null;

  constructor(host: HTMLElement) {
    this.host = host;
    const d = host.dataset;
    this.act = d.act && ACTS[d.act] ? ACTS[d.act]() : null;
    this.logo = isLogo(d.logo) ? d.logo : null;
    this.size = clamp(Number(d.size) || 1, 0.3, 6);
    this.feel = d.feel;
    host.style.width = `${this.size * (1 + (this.act?.room ?? 0))}em`;
    host.style.height = `${this.size}em`;
    this.sheet = new Sheet(host, host.getAttribute('aria-label') ?? undefined);
    this.colour = isColour(d.colour) ? d.colour : 'blue';
  }

  bind(cast: Cast, first: number): void {
    this.cast = cast;
    cast.field.temper(first, temperOf(this.feel, first * 13 + 5));
    this.body = new Body(first, this.colour, 10);
    const b = this.body;
    // its line hovered: it looks up, a little startled and pleased; clicked, it hops
    const line = this.host.closest('li') ?? this.host;
    line.addEventListener('pointerenter', () => {
      cast.field.startle(b.face, 0.3);
      cast.field.feel(b.face, 0.3, 0.3);
    });
    this.host.addEventListener('click', () => {
      if (cast.reduced) return;
      b.hop(0.55 * b.side);
      cast.field.feel(b.face, 0.35, 0.35);
    });
  }

  frame(t: number, dt: number, pointer: Pointer, drawn: boolean): void {
    const b = this.body;
    const cast = this.cast;
    if (!b || !cast) return;
    const sheet = this.sheet;
    sheet.fit((_w, h) => ({ top: Math.max(14, 0.95 * h), side: Math.max(10, 0.45 * h), bottom: Math.max(4, 0.2 * h) }));
    b.side = sheet.boxH;
    b.x = sheet.pads.side + b.side / 2;
    b.y = sheet.pads.top + sheet.boxH;
    this.act?.tick(b, cast, t, dt);
    if (!this.act?.busy?.(t)) {
      const [x, y] = sheet.client(b.cx, b.cy);
      if (!cast.watch(b.face, x, y, b.side, pointer, t * 1000, this.act?.reach ?? REACH)) cast.field.glance(b.face);
    }
    b.step(dt);
    if (!drawn) return;
    const ctx = sheet.begin();
    const logo = this.logo;
    b.draw(ctx, cast, t * 1000, NaN, logo ? (c, w, h) => drawSticker(c, logo, w / 2 - 0.04 * b.side, -0.18 * h, 0.48 * b.side, -0.14) : undefined);
    this.act?.draw?.(ctx, b, t);
  }
}

/**
 * A few squares in a row, sized by height, each drinking its own drink at its
 * own moment, the cups held in front:
 *
 *   <span data-sq="party" data-colours="blue|red|…" data-heights="1|0.93|…" data-drinks="coffee|cocoa|…" data-size="1.3">
 *
 * data-size is the tallest one's side, in ems.
 */
export class Party implements Mount {
  readonly faces: number;
  readonly host: HTMLElement;
  private readonly sheet: Sheet;
  private readonly colours: ColorName[];
  private readonly heights: number[];
  private readonly acts: Act[];
  private bodies: Body[] = [];
  private cast: Cast | null = null;

  constructor(host: HTMLElement) {
    this.host = host;
    const d = host.dataset;
    const list = (v: string | undefined) => (v ?? '').split('|').map((x) => x.trim());
    const colours = list(d.colours);
    this.faces = Math.max(1, colours.length);
    this.colours = colours.map((c, i) => (isColour(c) ? c : (['blue', 'red', 'green', 'teal', 'violet', 'pink'] as const)[i % 6]));
    const h = list(d.heights).map(Number);
    this.heights = this.colours.map((_, i) => clamp(h[i] || 1, 0.2, 1));
    const drinks = list(d.drinks);
    // out of step: nobody drinks at the same moment as the one beside them
    this.acts = this.colours.map((_, i) => sip(isCup(drinks[i]) ? drinks[i] : 'coffee', 6.5 + i * 1.9 + (i % 2) * 0.7, true));
    const size = clamp(Number(d.size) || 1, 0.3, 6);
    host.style.width = `${size * (this.heights.reduce((a, b) => a + b, 0) + GAP * (this.faces - 1))}em`;
    host.style.height = `${size}em`;
    this.sheet = new Sheet(host, host.getAttribute('aria-label') ?? undefined);
  }

  bind(cast: Cast, first: number): void {
    this.cast = cast;
    this.bodies = this.colours.map((c, i) => {
      cast.field.temper(first + i, temperOf(i === 0 ? 'calm' : undefined, (first + i) * 19 + 3));
      return new Body(first + i, c, 10);
    });
    this.host.addEventListener('click', () => {
      if (cast.reduced) return;
      for (const b of this.bodies) b.hop((0.3 + 0.3 * Math.random()) * b.side);
    });
  }

  frame(t: number, dt: number, pointer: Pointer, drawn: boolean): void {
    const cast = this.cast;
    if (!cast) return;
    const sheet = this.sheet;
    sheet.fit((_w, h) => ({ top: Math.max(14, 1.05 * h), side: Math.max(8, 0.45 * h), bottom: Math.max(4, 0.2 * h) }));
    const unit = sheet.boxH;
    let x = sheet.pads.side;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      b.side = unit * this.heights[i];
      b.x = x + b.side / 2;
      b.y = sheet.pads.top + sheet.boxH;
      x += b.side + GAP * unit;
      const act = this.acts[i];
      act.tick(b, cast, t, dt);
      if (!act.busy?.(t)) {
        const [cx, cy] = sheet.client(b.cx, b.cy);
        if (!cast.watch(b.face, cx, cy, b.side, pointer, t * 1000, 220)) cast.field.glance(b.face);
      }
      b.step(dt);
    }
    if (!drawn) return;
    const ctx = sheet.begin();
    for (let i = 0; i < this.bodies.length; i++) {
      this.bodies[i].draw(ctx, cast, t * 1000);
      this.acts[i].draw?.(ctx, this.bodies[i], t);
    }
  }
}

/** Between squares in a party, in the tallest one's sides: room for a cup. */
const GAP = 0.3;
