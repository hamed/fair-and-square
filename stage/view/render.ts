/**
 * The stage on a canvas: the yard, the 1 × 1 reference box, the bodies with
 * their faces, and (dev only) ticks. Nothing is labelled: charts are the
 * bodies' poses. Opacity shows density (resting area over drawn area): a
 * squeezed or shrunk body is darker, a stretched one paler.
 *
 * Bodies are drawn from shapes.outline, the same polygon picking and the area
 * readout use. Gait (bob and waddle) and hop height are drawn here; picking
 * adds the hop height too (Stage.lift).
 */
import { COLOR_NAMES, FILLS, STROKES, type AgentShape } from '../essay/agentStyle.ts';
import { emptyScene, type Blend, type Piece, type Poly, type Scene } from '../acts/scene.ts';
import { MONEY } from '../acts/guides.ts';
import { prints } from '../acts/prints.ts';
import type { FaceLook } from '../essay/face/face.ts';
import type { Session } from '../console/session.ts';
import { HEX, RECT, TRI, areaOf, outline } from '../core/shapes.ts';
import { BOX, YARD } from '../core/figure.ts';
import { mix as mixColours } from '../core/area.ts';
import { Faces } from './faces.ts';
import type { FaceField } from '../essay/face/field.ts';

/** Canvas backing store cap, pixels: big screens at 2× stay cheap. */
const MAX_PIXELS = 4_000_000;
const PAD = 18;

/**
 * The coin: a real one, both faces (Mongol Bank, 1000 tögrög, Karl Marx, 2019): the essay's joke, kept (owner,
 * 2026-10-21: "funny and satirical"). Loaded on the first toss; until it is in, a plain disc in the colour.
 */
let coins: [HTMLImageElement, HTMLImageElement] | null = null;
function coinFaces(): [HTMLImageElement, HTMLImageElement] | null {
  if (coins || typeof Image === 'undefined') return coins;
  const load = (name: string) => {
    const im = new Image();
    im.src = new URL(`../coin/${name}.webp`, import.meta.url).href;
    return im;
  };
  coins = [load('front'), load('back')];
  return coins;
}
/** Prints: a pause after the photo is ready (then one copy every PRINT_EVERY, acts/prints.ts). */
const PRINT_DELAY = 0.6;

/** Where the line above the yard goes: the yard's floor edges on screen (CSS px), px per unit, and the canvas's width. */
export interface Frame {
  readonly scale: number;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly width: number;
}

/**
 * Drawn above the yard and under the bodies (the title line): `draw` in the
 * frame the yard has (or would have, with a chart filling the screen), and
 * `height`, how much room it needs above the yard's top edge, which the camera
 * keeps free for it.
 */
interface Ornament {
  draw(ctx: CanvasRenderingContext2D, frame: Frame): void;
  height(frame: Frame): number;
}

export class StageView {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private faces: Faces | null = null;
  private facesFor: unknown = null;

  /** How square `i` feels as drawn now: [valence, arousal], each −1 … 1; null before its face is. */
  mood(i: number): [number, number] | null {
    const f = this.faces?.field;
    return f && i >= 0 && i < f.n ? [f.v[i], f.a[i]] : null;
  }
  /** Camera: world rectangle shown, eased. */
  private view = { x0: -0.05, y0: -0.05, x1: YARD + 0.05, y1: YARD + 0.05 };
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private cssW = 1;
  private cssH = 1;
  private readonly poly: number[] = [];
  /** When the folded photo was last finished, for printing its copies one by one. */
  private readyAt = -1;
  private readyFigure: unknown = null;
  /** A short swell (arrival, absorption) or squash (a piece leaving) per body, decaying. */
  private pop = new Float64Array(0);
  private scene: Scene | null = null;
  /** A blend's colour, worked out once per blend. */
  private readonly blends = new WeakMap<Blend, string>();
  /** This frame's colouring by a property (`show.colour`), fill and pen per square, or null; and who is ringed. */
  private tint: { fill: string[]; pen: string[] } | null = null;
  private ringed: Uint8Array = new Uint8Array(0);
  /** The title line, if any (Ornament). */
  ornament: Ornament | null = null;
  /** How far down from the canvas's top something of the page lies over it (the console's toggle, in portrait), px: the line stays below it. */
  clearTop = 0;
  /** Room kept under the yard, px (the Story's bar). */
  clearBottom = 0;
  /** The margin around the yard, px (0: the yard to the canvas's edges, as the four yards are). */
  pad = PAD;
  /** A yard in a quarter of another: its floor to the canvas's edges, no walls of its own (the big yard's cross is). */
  bare = false;
  /** The frame it was last placed in. */
  private header: Frame = { scale: 1, left: 0, top: 0, right: 0, width: 1 };
  /** Reduced motion (the reader's setting): faces hold still, glows do not pulse, coins only land. */
  reduced = false;
  /** The reader's pointer over the yard, yard units, and when it last moved (ms): faces near it look at it. */
  pointer: { x: number; y: number; at: number } | null = null;
  /** Where the yard's floor was drawn last frame, CSS px from the canvas's top-left, and px per yard unit. */
  floor = { left: 0, top: 0, right: 0, bottom: 0, scale: 1 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    this.ctx = ctx;
  }

  /**
   * The camera straight to where it is going, for this canvas: what a frame
   * drawn now would use. Screen = (ox + x · scale, oy − y · scale).
   */
  /** Where the yard's top edge is drawn, CSS px from the canvas's top. */
  get yardTop(): number {
    return this.header.top;
  }

  /** The canvas height (CSS px) at which the yard, its title line and margins fill the width: no more, no less. */
  natural = 0;

  settle(s: Session): { scale: number; ox: number; oy: number; dpr: number; w: number; h: number; header: Frame; clear: number } {
    this.resize();
    this.camera(s, 0);
    return { scale: this.scale, ox: this.ox, oy: this.oy, dpr: this.canvas.width / this.cssW, w: this.cssW, h: this.cssH, header: this.header, clear: this.clearTop };
  }

  /** Go on with these faces (the opening's), so nobody's face jumps when the stage takes over. */
  adopt(field: FaceField, s: Session): void {
    this.faces = new Faces(s.game.wealth, s.game.seed, field);
    this.facesFor = s.stage;
  }

  /** Screen (client) point to world. */
  toWorld(clientX: number, clientY: number): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    return [(clientX - rect.left - this.ox) / this.scale, -(clientY - rect.top - this.oy) / this.scale];
  }

  render(s: Session, dt: number, now: number): void {
    this.resize();
    const { ctx } = this;
    const stage = s.stage;
    const game = s.game;
    if (this.facesFor !== stage) {
      // the same people on a stage built anew (Back, a command): their faces go on, moods and all
      this.faces = new Faces(game.wealth, game.seed, this.faces?.field.n === game.n ? this.faces.field : undefined);
      this.facesFor = stage;
    }
    const faces = this.faces!;
    const scene = emptyScene();
    this.scene = scene;
    s.transit.draw(s.live, scene);
    this.prints(s, now, scene);
    s.extras(scene);
    // partners who have met face each other; anyone named to watch them (`meet i j`) looks at the nearer of the first pair
    const pairs = s.pairs;
    if (pairs && pairs.length === stage.n) {
      const met = s.partners === null ? pairs.length : 2 * s.partners;
      for (let p = 0; p + 1 < met; p += 2) this.scene.looks.push([pairs[p], pairs[p + 1]], [pairs[p + 1], pairs[p]]);
      if (s.partners !== null && met >= 2) {
        const [a, b] = [pairs[0], pairs[1]];
        const centre = (k: number) => stage.x[k] + stage.w[k] / 2;
        for (let q = met; q < pairs.length; q++) {
          const i = pairs[q];
          this.scene.looks.push([i, Math.abs(centre(a) - centre(i)) <= Math.abs(centre(b) - centre(i)) ? a : b]);
        }
      }
    }
    const debt = Array.from(s.game.wealth, (w) => w < 0);
    if (this.pop.length !== stage.n) this.pop = new Float64Array(stage.n);
    // what faces were asked to do (`face`, a tap on a square, `be`)
    faces.reduced = this.reduced;
    for (const a of s.faceAsks.splice(0)) {
      for (const i of a.who) {
        if (a.what === 'hop' || a.what === 'cheer') this.pop[i] = Math.max(this.pop[i] ?? 0, this.reduced ? 0.3 : 1.4);
        if (a.what !== 'hop') faces.ask(i, a.what, a.seconds);
      }
    }
    const pointer = this.pointer && now - this.pointer.at < POINTER_HOLD ? this.pointer : null;
    faces.update(dt, stage, s.shown, this.scene.looks, debt, pointer);
    const decay = Math.exp(-dt / 0.18);
    for (let i = 0; i < stage.n; i++) this.pop[i] *= decay;
    for (const e of s.transit.events) {
      // a trade's money landing swells its taker, leaving squashes its giver (a levy's go through the pot)
      if (e.kind === 'on' && e.holder >= 0 && e.other >= 0) this.pop[e.holder] = 1;
      else if (e.kind === 'off' && e.holder >= 0 && e.other >= 0) this.pop[e.holder] = -0.6;
      else if (e.kind === 'brace') {
        // everyone flinches before the levy is cut: worry, or anger in the dominant
        for (let j = 0; j < stage.n; j++) faces.brace(j, s.shown[j], s.shown[j] - e.pays[j]);
      } else if (e.kind === 'relax') {
        for (let j = 0; j < stage.n; j++) faces.relax(j);
        this.pop.fill(0.7);
      }
    }
    this.camera(s, dt);

    const css = getComputedStyle(this.canvas);
    const paper = css.getPropertyValue('--paper').trim() || '#f4efe4';
    const floor = css.getPropertyValue('--floor').trim() || '#fbf8f1';
    const wall = css.getPropertyValue('--wall').trim() || '#5b5547';
    const faint = css.getPropertyValue('--faint').trim() || '#b9b09c';
    const dpr = this.canvas.width / this.cssW;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = this.bare ? floor : paper;
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    // the yard and its walls
    const { right, top } = stage.walls;
    const [ax, ay] = this.px(0, 0);
    const [bx, by] = this.px(right, top);
    this.floor = { left: ax, top: by, right: bx, bottom: ay, scale: this.scale };
    ctx.fillStyle = floor;
    ctx.fillRect(ax, by, bx - ax, ay - by);
    ctx.strokeStyle = wall;
    ctx.lineWidth = 3;
    if (!this.bare) ctx.strokeRect(ax - 1.5, by - 1.5, bx - ax + 3, ay - by + 3);
    // the reference box: area 1, all the wealth there is, in the middle of the yard
    const [qx, qy] = this.px(BOX, BOX);
    const [rx, ry] = this.px(BOX + 1, BOX + 1);
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = faint;
    ctx.lineWidth = 1;
    ctx.strokeRect(qx, ry, rx - qx, qy - ry);
    ctx.setLineDash([]);
    if (s.axes) this.ticks(right, top, faint);
    if (this.ornament) {
      ctx.save();
      this.ornament.draw(ctx, this.header);
      ctx.restore();
    }

    // printed copies under everyone; frames and counts over everyone (the photo's own too)
    this.ghosts(s, scene);

    const look: FaceLook | null = s.look === 'off' ? null : s.look;
    const n = stage.n;
    const r0 = Math.sqrt(1 / n / Math.PI) * this.scale;
    this.mark(s);
    const veil = Math.min(1, Math.max(0, s.veil));
    if (veil <= 0) {
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < n; i++) {
          const flying = stage.air[i] > 0;
          if (flying !== (pass === 1)) continue;
          this.body(s, i, faces, look, r0, now);
        }
        if (pass === 0) this.drawScene(scene, now);
      }
    } else {
      // fading out (or in): everyone drawn, then the floor over them as much as the veil says; what the scene
      // draws (the pile) stays clear of it
      if (veil < 1) for (let i = 0; i < n; i++) this.body(s, i, faces, look, r0, now);
      ctx.globalAlpha = veil;
      ctx.fillStyle = floor;
      ctx.fillRect(ax, by, bx - ax, ay - by);
      ctx.globalAlpha = 1;
      // the box, unless the yard is divided into quarters (each a yard of its own, one the words')
      if (!s.divide) {
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = faint;
        ctx.lineWidth = 1;
        ctx.strokeRect(qx, ry, rx - qx, qy - ry);
        ctx.setLineDash([]);
      }
      this.drawScene(scene, now);
    }
    if (s.divide) {
      // four quarters, divided by walls like the yard's own (over whatever the floor holds)
      const [mx, my] = this.px(right / 2, top / 2);
      ctx.strokeStyle = wall;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(mx, by);
      ctx.lineTo(mx, ay);
      ctx.moveTo(ax, my);
      ctx.lineTo(bx, my);
      ctx.stroke();
    }
    this.overlay(scene);
  }

  /**
   * What the acts draw (acts/scene.ts): pieces of money, then divisions, cut
   * lines and seams, and spinners on top.
   */
  private drawScene(scene: Scene, now = 0): void {
    const { ctx } = this;
    ctx.save();
    for (const p of scene.pieces) this.piece(p);
    for (const p of scene.polys) this.polygon(p);
    // glows: a soft gold light around something to look at, breathing unless motion is reduced
    for (const g of scene.glows) {
      const [x, y] = this.px(g.box.x, g.box.y + g.box.h);
      const w = g.box.w * this.scale;
      const h = g.box.h * this.scale;
      if (!sane(x, y, w, h)) continue;
      const breath = this.reduced ? 1 : 0.7 + 0.3 * Math.sin(now / 260);
      const pad = 3;
      // a square's light is its own colour (owner, 2026-10-21); gold is for things to do
      const colour = g.of === undefined ? GLOW : STROKES[colourOf(g.of)];
      ctx.globalAlpha = g.alpha * breath;
      ctx.shadowColor = colour;
      ctx.shadowBlur = 16;
      ctx.strokeStyle = colour;
      ctx.lineWidth = 3;
      ctx.strokeRect(x - pad, y - pad, w + 2 * pad, h + 2 * pad);
      ctx.shadowBlur = 0;
    }
    // lit edges: the square's own line, thick, blinking
    for (const e of scene.edges) {
      const [x0, y0] = this.px(e.x0, e.y0);
      const [x1, y1] = this.px(e.x1, e.y1);
      if (!sane(x0, y0, x1, y1)) continue;
      const colour = STROKES[colourOf(e.of)];
      ctx.globalAlpha = e.alpha * (this.reduced ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(now / 320)));
      ctx.shadowColor = colour;
      ctx.shadowBlur = 8;
      ctx.strokeStyle = colour;
      ctx.lineWidth = 5;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'round';
    for (const o of scene.frames) {
      if (o.label !== undefined) continue;
      const [x, y] = this.px(o.box.x, o.box.y + o.box.h);
      const w = o.box.w * this.scale;
      const h = o.box.h * this.scale;
      if (!sane(x, y, w, h)) continue;
      ctx.globalAlpha = 0.85 * o.alpha;
      ctx.strokeStyle = '#28251f';
      ctx.lineWidth = 1;
      ctx.setLineDash(o.solid ? [] : [3, 2]);
      ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
    }
    ctx.setLineDash([]);
    for (const l of scene.lines) {
      if (l.alpha <= 0.01) continue;
      const [x0, y0] = this.px(l.x0, l.y0);
      const [x1, y1] = this.px(l.x1, l.y1);
      if (!sane(x0, y0, x1, y1)) continue;
      ctx.globalAlpha = 0.9 * l.alpha;
      ctx.strokeStyle = '#28251f';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    // a toss's coin: tossed up, flipping (its face narrowing to its edge and widening on the other side), its
    // shadow on the ground. The real coin, both faces (Marx's head one side): each side wears one partner's colour,
    // so the outcome reads off the colour that lands
    const faces = coinFaces();
    for (const c of scene.coins) {
      if (c.alpha <= 0.01) continue;
      const lift = this.reduced ? 0 : c.lift;
      const flip = this.reduced ? 0 : c.flip;
      const [x, y] = this.px(c.x, c.y + lift);
      const [, gy] = this.px(c.x, c.y);
      const r = (c.size / 2) * this.scale;
      if (!sane(x, y, r)) continue;
      const cos = Math.cos(flip);
      const face = c.faces[cos >= 0 ? 0 : 1];
      const across = Math.max(0.08, Math.abs(cos));
      ctx.globalAlpha = c.alpha * 0.18 * (1 - Math.min(0.7, lift / Math.max(1e-9, 2 * c.size)));
      ctx.fillStyle = '#28251f';
      ctx.beginPath();
      ctx.ellipse(x, gy + r * 0.9, r * 0.8, r * 0.2, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.globalAlpha = c.alpha;
      const photo = faces?.[cos >= 0 ? 0 : 1];
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(x, y, r * across, r, 0, 0, 2 * Math.PI);
      ctx.clip();
      ctx.fillStyle = FILLS[colourOf(face)];
      if (photo?.complete && photo.naturalWidth > 0) {
        // the metal painted in the partner's colour, its relief (the head, the lettering) kept
        ctx.drawImage(photo, x - r * across, y - r, 2 * r * across, 2 * r);
        ctx.globalCompositeOperation = 'color';
      }
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      ctx.restore();
      ctx.globalAlpha = c.alpha;
      ctx.strokeStyle = STROKES[colourOf(face)];
      ctx.lineWidth = Math.max(1.25, 0.08 * r);
      ctx.beginPath();
      ctx.ellipse(x, y, r * across, r, 0, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A polygon from a guide: filled with a person's colour or a tint, and or outlined. */
  private polygon(p: Poly): void {
    if (p.alpha <= 0.01 || p.pts.length < 4) return;
    const { ctx } = this;
    ctx.beginPath();
    for (let k = 0; k + 1 < p.pts.length; k += 2) {
      const [x, y] = this.px(p.pts[k], p.pts[k + 1]);
      if (!sane(x, y)) return;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    if (!p.open) ctx.closePath();
    if (p.fill !== undefined && !p.open) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.fill === 'money' ? MONEY : p.fill === 'gap' ? GAP_TINT : p.fill === 'triangle' ? TRIANGLE_TINT : p.fill === 'ghost' ? GHOST_TINT : FILLS[colourOf(p.fill)];
      ctx.fill();
    }
    if (p.stroke) {
      ctx.globalAlpha = p.alpha;
      ctx.strokeStyle = p.stroke === 'ink' ? '#28251f' : '#b9b09c';
      ctx.lineWidth = p.width ?? (p.stroke === 'ink' ? 2 : 0.75);
      ctx.lineJoin = 'round';
      ctx.setLineDash(p.dash ? [6, 5] : []);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
  }

  /** A blend's colour as '#rrggbb': its people's fills mixed by weight. */
  private blendOf(b: Blend): string {
    let c = this.blends.get(b);
    if (c) return c;
    const rgb = (f: string) => [1, 3, 5].map((k) => parseInt(f.slice(k, k + 2), 16)) as [number, number, number];
    const h = (v: number) => Math.round(v).toString(16).padStart(2, '0');
    c = `#${mixColours(b.of.map((i) => rgb(FILLS[colourOf(i)])), b.by).map(h).join('')}`;
    this.blends.set(b, c);
    return c;
  }

  /** A piece of money: one colour, or a blend, turning toward its host's as it joins. */
  private piece(p: Piece): void {
    const { ctx } = this;
    const [x, y] = this.px(p.box.x, p.box.y + p.box.h);
    const w = Math.max(1, p.box.w * this.scale);
    const h = Math.max(1, p.box.h * this.scale);
    if (!sane(x, y, w, h)) return;
    ctx.globalAlpha = p.alpha;
    if (p.blend) {
      const own = this.blendOf(p.blend);
      ctx.fillStyle = p.to !== undefined && p.turn ? mix(own, FILLS[colourOf(p.to)], p.turn) : own;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#5b5547';
    } else if (p.fill) {
      ctx.fillStyle = p.fill;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#b8902f';
    } else {
      const from = FILLS[colourOf(p.colour)];
      ctx.fillStyle = p.to !== undefined && p.turn ? mix(from, FILLS[colourOf(p.to)], p.turn) : from;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = STROKES[colourOf(p.to !== undefined && (p.turn ?? 0) > 0.5 ? p.to : p.colour)];
    }
    ctx.globalAlpha = Math.min(1, p.alpha + 0.05);
    ctx.lineWidth = 0.75;
    ctx.strokeRect(x, y, w, h);
    ctx.globalAlpha = 1;
  }

  /** This frame's colouring and rings, from the session's camera state. */
  private mark(s: Session): void {
    const n = s.game.n;
    if (s.guide?.kind === 'envelope') {
      // the chart in the bars: the bars plain, one colour and a faint line, so their outline reads (guides.ts)
      this.tint = { fill: new Array<string>(n).fill(PLAIN_FILL), pen: new Array<string>(n).fill(PLAIN_PEN) };
    } else if (s.colourBy === 'none') this.tint = null;
    else {
      const u = shade(s, s.colourBy);
      const fill: string[] = [];
      const pen: string[] = [];
      for (let k = 0; k < n; k++) {
        const c = between(RAMP_LOW, RAMP_HIGH, u[k]);
        fill.push(hex(c));
        pen.push(hex(between(c, INK_RGB, 0.45)));
      }
      this.tint = { fill, pen };
    }
    this.ringed = s.highlight && s.highlight.length === n ? s.highlight : new Uint8Array(n);
  }

  private body(s: Session, i: number, faces: Faces, look: FaceLook | null, r0: number, now: number): void {
    const { ctx } = this;
    const st = s.stage;
    // a body in a beat (a slice cut away, a bar attached) is drawn as the beat has it
    const shown = this.scene?.display.get(i);
    const x = shown ? shown.x : st.x[i];
    const w = shown ? shown.w : st.w[i];
    const h = shown ? shown.h : st.h[i];
    const lift = st.lift(i);
    const y = shown ? shown.y : st.y[i] + lift;
    const k = shown ? RECT : st.kind[i];
    const colour = colourOf(i);
    // in debt: a hole, outline only, its line heavier the deeper (against the debt limit)
    const owes = s.game.wealth[i] < 0;
    const depth = owes ? Math.min(1, -s.game.wealth[i] / Math.max(1e-12, debtLimit(s))) : 0;
    const fill = this.tint ? this.tint.fill[i] : FILLS[colour];
    const pen = this.tint ? this.tint.pen[i] : STROKES[colour];
    // thrift: the share kept out of play, a solid core
    const core = owes ? 0 : (s.game.run.world.thrift[i] ?? 0);
    const wpx = w * this.scale;
    const hpx = h * this.scale;
    if (wpx < 0.05 && hpx < 0.05) return;
    if (!sane(x * this.scale, y * this.scale, wpx, hpx)) return;

    // gait: a bob and a waddle while walking, nothing while standing
    const speed = Math.hypot(st.vx[i], st.vy[i]);
    // only a real walk shows a gait: drifting into place does not waddle
    const walking = Math.min(1, Math.max(0, (speed - 0.08) / 0.2)) * (lift > 0 ? 0 : 1);
    const phase = (st.stride[i] / Math.max(0.02, 0.9 * Math.max(w, h))) * Math.PI * 2;
    const bob = walking * Math.abs(Math.sin(phase)) * 0.05 * Math.min(w, h);
    const tilt = walking * Math.sin(phase) * 0.04;

    if (lift > 0) {
      // the shadow stays on the ground
      const [sx, sy] = this.px(x + w / 2, st.y[i]);
      ctx.fillStyle = 'rgba(40, 37, 31, 0.16)';
      ctx.beginPath();
      ctx.ellipse(sx, sy, Math.max(1, wpx * 0.45), Math.max(0.6, Math.min(wpx, hpx) * 0.12), 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const [cx, cy] = this.px(x + w / 2, y + h / 2 + bob);
    ctx.save();
    ctx.translate(cx, cy);
    if (tilt) ctx.rotate(tilt);
    const swell = 1 + 0.07 * (this.pop[i] ?? 0);
    if (swell !== 1) ctx.scale(swell, swell);
    const n = outline(k, -w / 2, -h / 2, w, h, this.poly);
    const trace = () => {
      ctx.beginPath();
      for (let v = 0; v < n; v++) {
        const px = this.poly[2 * v] * this.scale;
        const py = -this.poly[2 * v + 1] * this.scale;
        if (v === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };
    if (!owes) {
      // density shows as opacity: 1 at rest
      const rho = st.density(i);
      const alpha = Math.min(1, Math.max(0.12, 0.82 * rho ** 0.4));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      trace();
      ctx.fill();
      if (core > 0) {
        // the core's area is λ of the body's: the same outline, scaled by √λ about the centre
        ctx.save();
        ctx.scale(Math.sqrt(Math.min(1, core)), Math.sqrt(Math.min(1, core)));
        ctx.fillStyle = pen;
        ctx.globalAlpha = alpha * 0.55;
        trace();
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    trace();
    ctx.lineJoin = 'round';
    if (owes) {
      ctx.strokeStyle = pen;
      ctx.lineWidth = 1 + 2 * depth;
      ctx.stroke();
    } else if (Math.min(wpx, hpx) > 1.2) {
      ctx.strokeStyle = pen;
      ctx.lineWidth = i === s.selected ? 2.5 : Math.min(1.25, 0.25 * Math.min(wpx, hpx));
      ctx.stroke();
    }
    if (this.ringed[i]) {
      // ringed in its own colour, heavier
      ctx.strokeStyle = pen;
      ctx.lineWidth = 3.5;
      ctx.stroke();
    }
    ctx.restore();

    if (!look) return;
    const shape: AgentShape = k === TRI ? 'triangle' : k === HEX ? 'hexagon' : 'square';
    // a triangle's face sits at its centroid, a third of the way up
    const fy = k === TRI ? y + h / 3 + bob : y + h / 2 + bob;
    const [fx, fpy] = this.px(x + w / 2, fy);
    const r = Math.sqrt(areaOf(k, w, h) / Math.PI) * this.scale;
    ctx.save();
    if (tilt) {
      ctx.translate(cx, cy);
      ctx.rotate(tilt);
      ctx.translate(-cx, -cy);
    }
    faces.draw(ctx, i, look, shape, fx, fpy, r, Math.min(wpx, hpx), r0, pen, fill, now / 1000);
    ctx.restore();
  }

  /** The prints (acts/prints.ts), once the folded photo is ready: copies, frames and counts into the scene. */
  private prints(s: Session, now: number, scene: Scene): void {
    const fig = s.figure;
    if (!s.stage.posing || !fig.clip || !fig.photo || !s.stage.done) {
      this.readyAt = -1;
      return;
    }
    // a live chart's figure changes every few frames; only a new pose starts the printing over
    if (this.readyAt < 0 || this.readyFigure !== s.recipe) {
      this.readyAt = now;
      this.readyFigure = s.recipe;
    }
    // counted one by one when the pose stands still; while trading, the chart changes every few
    // frames: all of it at once, and the count as it is now
    prints(fig, s.playing ? Infinity : (now - this.readyAt) / 1000 - PRINT_DELAY, scene);
  }

  /** Every body copied at each ghost's offset, inside the scene's clip: under everyone. */
  private ghosts(s: Session, scene: Scene): void {
    if (!scene.ghosts.length || !scene.clip) return;
    const fig = s.figure;
    const { ctx } = this;
    const c = scene.clip;
    const [ax, ay] = this.px(c.x, c.y);
    const [bx, by] = this.px(c.x + c.w, c.y + c.h);
    for (const g of scene.ghosts) {
      if (g.alpha <= 0.01) continue;
      ctx.save();
      // in the photo's clip, or (a piece on its way in or out) anywhere; only its piece, if cut
      if (!g.free) {
        ctx.beginPath();
        ctx.rect(ax, by, bx - ax, ay - by);
        ctx.clip();
      }
      if (g.cut) {
        const [cx0] = this.px(g.cut.x0, 0);
        const [cx1] = this.px(g.cut.x1, 0);
        ctx.beginPath();
        ctx.rect(cx0, 0, cx1 - cx0, this.cssH);
        ctx.clip();
      }
      for (let i = 0; i < fig.kind.length; i++) {
        const colour = colourOf(i);
        ctx.fillStyle = FILLS[colour];
        ctx.strokeStyle = STROKES[colour];
        ctx.lineWidth = 0.6;
        const [x0, y1] = this.px(fig.x[i] + g.dx, fig.y[i] + g.dy);
        const [x1, y0] = this.px(fig.x[i] + g.dx + fig.w[i], fig.y[i] + g.dy + fig.h[i]);
        ctx.globalAlpha = 0.28 * g.alpha;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        ctx.globalAlpha = 0.45 * g.alpha;
        ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      }
      ctx.restore();
    }
  }

  /** Numbered frames and labels: over everyone. */
  private overlay(scene: Scene): void {
    this.handles(scene);
    this.tags(scene);
    const framed = scene.frames.filter((f) => f.label !== undefined);
    if (!framed.length && !scene.labels.length) return;
    const { ctx } = this;
    const ink = getComputedStyle(this.canvas).getPropertyValue('--ink').trim() || '#28251f';
    const first = framed[0]?.box;
    const label = Math.max(9, Math.min(16, first ? Math.min(first.w, first.h) * this.scale * 0.22 : 12));
    ctx.save();
    ctx.font = `${label}px ui-monospace, monospace`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'start';
    for (const f of framed) {
      const [qx, qy] = this.px(f.box.x, f.box.y + f.box.h);
      const [rx, ry] = this.px(f.box.x + f.box.w, f.box.y);
      ctx.globalAlpha = f.alpha;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.25;
      ctx.strokeRect(qx + 0.5, qy + 0.5, rx - qx - 1, ry - qy - 1);
      ctx.fillStyle = ink;
      if (rx - qx > label * 1.2 && ry - qy > label * 1.1) ctx.fillText(f.label!, qx + 3, qy + 3);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = ink;
    ctx.textBaseline = 'bottom';
    for (const l of scene.labels) {
      const size = Math.round(label * (l.size ?? 1));
      ctx.font = `${size}px ui-monospace, monospace`;
      const [tx, ty] = this.px(l.x, l.y);
      ctx.textAlign = l.centre ? 'center' : 'start';
      ctx.fillText(l.text, l.centre ? tx : tx + 6, l.above ? ty - 4 : ty + size);
    }
    ctx.textAlign = 'start';
    ctx.restore();
  }

  /** A line the reader drags: ink, a round grip at its top, and its number above the grip. */
  private handles(scene: Scene): void {
    const { ctx } = this;
    for (const h of scene.handles) {
      const [x, y0] = this.px(h.x, h.y0);
      const [, y1] = this.px(h.x, h.y1);
      if (!sane(x, y0, y1)) continue;
      ctx.save();
      ctx.globalAlpha = h.alpha;
      ctx.strokeStyle = '#28251f';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
      // the grip: a square, the game's shape
      const grip = HANDLE_GRIP;
      ctx.fillStyle = GLOW;
      ctx.fillRect(x - grip, y1 - grip, 2 * grip, 2 * grip);
      ctx.strokeRect(x - grip, y1 - grip, 2 * grip, 2 * grip);
      // the grip's arrows: it moves left and right
      ctx.fillStyle = '#28251f';
      for (const d of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x + d * grip * 0.75, y1);
        ctx.lineTo(x + d * grip * 0.3, y1 - grip * 0.35);
        ctx.lineTo(x + d * grip * 0.3, y1 + grip * 0.35);
        ctx.closePath();
        ctx.fill();
      }
      const size = Math.round(Math.max(18, Math.min(34, 0.09 * this.scale)));
      ctx.font = `700 ${size}px 'Vazirmatn', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(h.label, x, y1 - grip - 4);
      ctx.restore();
    }
  }

  /** Cards over everyone: a word or number on the floor's colour, framed, centred over (x, y). */
  private tags(scene: Scene): void {
    const { ctx } = this;
    for (const t of scene.tags) {
      const [x, y] = this.px(t.x, t.y);
      if (!sane(x, y)) continue;
      const size = Math.round(Math.max(13, Math.min(20, 0.05 * this.scale)));
      ctx.save();
      ctx.globalAlpha = t.alpha;
      ctx.font = `600 ${size}px 'Vazirmatn', system-ui, sans-serif`;
      const w = ctx.measureText(t.text).width + size;
      const h = size * 1.6;
      // kept on the canvas
      const left = Math.min(Math.max(4, x - w / 2), this.cssW - w - 4);
      const top = Math.max(4, y - h);
      ctx.fillStyle = '#fbf8f1';
      ctx.strokeStyle = '#28251f';
      ctx.lineWidth = 1.5;
      // a square-cornered card, the game's shape
      ctx.fillRect(left, top, w, h);
      ctx.strokeRect(left, top, w, h);
      ctx.fillStyle = '#28251f';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.text, left + w / 2, top + h / 2 + 1);
      ctx.restore();
    }
  }

  private ticks(right: number, top: number, colour: string): void {
    const { ctx } = this;
    const step = niceStep(Math.max(right, top) / 6);
    ctx.fillStyle = colour;
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    for (let k = 0; k * step <= right + 1e-9; k++) {
      const [x, y] = this.px(k * step, 0);
      ctx.fillRect(x - 0.5, y + 3, 1, 4);
      ctx.fillText(String(+(k * step).toFixed(6)), x, y + 17);
    }
    ctx.textAlign = 'end';
    for (let k = 1; k * step <= top + 1e-9; k++) {
      const [x, y] = this.px(0, k * step);
      ctx.fillRect(x - 7, y - 0.5, 4, 1);
      ctx.fillText(String(+(k * step).toFixed(6)), x - 10, y + 3);
    }
  }

  /** Ease the camera toward the walls (and anything outside them). */
  /** What the camera frames, with its margin: the yard and everyone in it, or the formed chart. */
  private framing(s: Session, chart: boolean): { x0: number; y0: number; x1: number; y1: number } {
    const st = s.stage;
    let x0 = 0;
    let y0 = 0;
    let x1 = Math.max(YARD, st.walls.right);
    let y1 = Math.max(YARD, st.walls.top);
    if (chart) {
      // the formed chart fills the screen
      x0 = y0 = Infinity;
      x1 = y1 = -Infinity;
      for (let i = 0; i < st.n; i++) {
        x0 = Math.min(x0, st.ex[i]);
        y0 = Math.min(y0, st.ey[i]);
        x1 = Math.max(x1, st.ex[i] + st.tw[i]);
        y1 = Math.max(y1, st.ey[i] + st.th[i]);
      }
      const clip = s.figure.clip;
      if (clip && s.figure.photo) {
        x0 = Math.min(x0, clip.x0);
        y0 = Math.min(y0, clip.y0);
        x1 = Math.max(x1, clip.x1 + 0.25);
        y1 = Math.max(y1, clip.y1);
      }
    }
    // otherwise the yard as its walls are: a square stepping or hopping past them (partners meeting, a cheer) is
    // drawn past them, the yard keeps its size (owner, 2026-10-22: "the yard changes size")
    // a little air around it, unless the yard is to fill its canvas (pad 0: the four yards, wall to wall)
    const m = this.bare ? 0 : this.pad > 0 ? 0.04 * Math.max(x1 - x0, y1 - y0) : 0.006 * Math.max(x1 - x0, y1 - y0);
    return { x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m };
  }

  /** A world rectangle centred in the canvas less its margins: px per unit and the origin's place. */
  private fit(v: { x0: number; y0: number; x1: number; y1: number }, top: number, bottom: number, left: number): { scale: number; ox: number; oy: number } {
    const availW = Math.max(1, this.cssW - left - this.pad);
    const availH = Math.max(1, this.cssH - top - bottom);
    const scale = Math.min(availW / (v.x1 - v.x0), availH / (v.y1 - v.y0));
    // centred in the space left by the hud, the title line and the ticks
    return { scale, ox: left + (availW - (v.x1 - v.x0) * scale) / 2 - v.x0 * scale, oy: top + availH - (availH - (v.y1 - v.y0) * scale) / 2 + v.y0 * scale };
  }

  private camera(s: Session, dt: number): void {
    const st = s.stage;
    const chart = s.zoom === 'chart' && st.done && s.recipe.pose !== 'free';
    const followed = s.follow ? this.around(s, s.follow) : null;
    const target = followed ?? this.framing(s, chart);
    // a chart or a followed group fills what the title line leaves, the line placed as for the whole yard
    const close = chart || !!followed;
    const k = dt > 0 ? 1 - Math.exp(-dt * 4) : 1;
    const v = this.view;
    v.x0 += (target.x0 - v.x0) * k;
    v.y0 += (target.y0 - v.y0) * k;
    v.x1 += (target.x1 - v.x1) * k;
    v.y1 += (target.y1 - v.y1) * k;
    const bottom = (s.axes ? 26 : this.pad) + this.clearBottom;
    const left = s.axes ? 34 : this.pad;
    // the title line goes where the yard's top edge is, or would be with a chart filling the screen
    // (review 2026-10-18, N2), and the camera keeps room for it above that edge
    const top0 = s.hud ? 28 : this.pad;
    let top = top0;
    const yard = close ? this.framing(s, false) : v;
    for (let pass = 0; pass < 5; pass++) {
      const f = this.fit(yard, top, bottom, left);
      this.header = { scale: f.scale, left: f.ox, top: f.oy - st.walls.top * f.scale, right: f.ox + st.walls.right * f.scale, width: this.cssW };
      const need = this.ornament ? this.ornament.height(this.header) + Math.max(4, this.clearTop) : 0;
      if (this.header.top >= need - 0.01) break;
      // a little over, so the next pass lands on or past it
      top += need - this.header.top + 0.05;
    }
    // the yard at the width's scale, room for its title line above its wall, the margin below: what a portrait
    // page gives the canvas
    const wide = Math.max(1, this.cssW - left - this.pad) / (yard.x1 - yard.x0);
    const line = this.ornament ? this.ornament.height(this.header) + Math.max(4, this.clearTop) : 0;
    this.natural = Math.max(top0, line - (yard.y1 - st.walls.top) * wide) + (yard.y1 - yard.y0) * wide + bottom;
    // a chart fills what is left under the line
    const f = this.fit(v, close && this.ornament ? Math.max(top, this.header.top) : top, bottom, left);
    this.scale = f.scale;
    this.ox = f.ox;
    this.oy = f.oy;
  }

  /** A box around a group (`show.zoom`), padded, never smaller than a sixth of the yard; null if empty. */
  private around(s: Session, members: Uint8Array): { x0: number; y0: number; x1: number; y1: number } | null {
    const st = s.stage;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < st.n && i < members.length; i++) {
      if (!members[i]) continue;
      x0 = Math.min(x0, st.x[i]);
      y0 = Math.min(y0, st.y[i]);
      x1 = Math.max(x1, st.x[i] + st.w[i]);
      y1 = Math.max(y1, st.y[i] + st.h[i]);
    }
    if (!(x1 > x0)) return null;
    const side = Math.max(st.walls.right, st.walls.top) / 6;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const hw = Math.max(side, (x1 - x0) * 1.3) / 2;
    const hh = Math.max(side, (y1 - y0) * 1.3) / 2;
    return { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh };
  }

  private px(x: number, y: number): [number, number] {
    return [this.ox + x * this.scale, this.oy - y * this.scale];
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w * h * dpr * dpr > MAX_PIXELS) dpr = Math.sqrt(MAX_PIXELS / (w * h));
    const bw = Math.max(1, Math.round(w * dpr));
    const bh = Math.max(1, Math.round(h * dpr));
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }
    this.cssW = w;
    this.cssH = h;
  }
}

/** How long faces keep looking at a pointer that has stopped, ms. */
const POINTER_HOLD = 1800;
/** A glow's light: the stage's accent gold. */
const GLOW = '#e9b949';
/** Bars made plain under a chart's outline (`guide envelope`). */
const PLAIN_FILL = '#e9e1cf';
const PLAIN_PEN = '#cfc5b0';
/** The whole triangle under the even line (the Gini's denominator): a cool grey wash. */
const TRIANGLE_TINT = 'rgba(122, 114, 98, 0.22)';
/** Ghosts (equal shares, for the even line): a faint wash. */
const GHOST_TINT = 'rgba(40, 37, 31, 0.05)';
/** The gap between the even line and the running total (the Gini's area): a warm, see-through tint. */
const GAP_TINT = '#d98c5f';
/** The radius of a drag line's grip, px: big enough for a finger. */
export const HANDLE_GRIP = 13;

/** A sequential ramp for colouring by a property: pale sand to deep blue. */
const RAMP_LOW = [0xef, 0xe6, 0xcf];
const RAMP_HIGH = [0x2f, 0x4f, 0x86];
const INK_RGB = [0x28, 0x25, 0x1f];
const hex = (c: readonly number[]) => `#${c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;
const between = (a: readonly number[], b: readonly number[], u: number) => a.map((x, k) => x + (b[k] - x) * u);

/** Each square's value of a property for colouring, as a position in [0, 1] (ranks for wealth and rank). */
function shade(s: Session, by: string): Float64Array {
  const world = s.game.run.world;
  const n = s.game.n;
  const out = new Float64Array(n);
  if (by === 'wealth' || by === 'rank') {
    const w = s.game.wealth;
    if (by === 'rank') {
      const order = Array.from({ length: n }, (_, k) => k).sort((a, b) => w[a] - w[b]);
      order.forEach((k, r) => (out[k] = n > 1 ? r / (n - 1) : 0.5));
      return out;
    }
    // wealth on a log scale, from the poorest to the richest; debtors at the pale end
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k < n; k++) if (w[k] > 0) {
      lo = Math.min(lo, Math.log(w[k]));
      hi = Math.max(hi, Math.log(w[k]));
    }
    for (let k = 0; k < n; k++) out[k] = w[k] > 0 && hi > lo ? (Math.log(w[k]) - lo) / (hi - lo) : w[k] > 0 ? 0.5 : 0;
    return out;
  }
  const v = by === 'talent' ? world.talent : by === 'thrift' ? world.thrift : world.gain;
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < n; k++) {
    lo = Math.min(lo, v[k]);
    hi = Math.max(hi, v[k]);
  }
  // a property everyone shares sits in the middle of the ramp
  for (let k = 0; k < n; k++) out[k] = hi > lo ? (v[k] - lo) / (hi - lo) : 0.5;
  return out;
}

/** The debt limit as a share of all the wealth (the floor a debtor's share can reach). */
function debtLimit(s: Session): number {
  const world = s.game.run.world;
  let total = world.pot;
  for (let k = 0; k < world.n; k++) total += world.w[k];
  return world.debt / total;
}

/** Two #rrggbb colours mixed, u of the way from a to b. */
function mix(a: string, b: string, u: number): string {
  const p = (c: string, k: number) => parseInt(c.slice(1 + 2 * k, 3 + 2 * k), 16);
  const ch = (k: number) => Math.round(p(a, k) + (p(b, k) - p(a, k)) * u);
  return `rgb(${ch(0)} ${ch(1)} ${ch(2)})`;
}

/**
 * Pixel values worth drawing: finite and within a million pixels. A bad value
 * draws nothing rather than asking the GPU for an absurd path.
 */
function sane(...v: number[]): boolean {
  for (const x of v) if (!(Math.abs(x) < 1e6)) return false;
  return true;
}

/** A person's colour: hashed, so neighbours on the starting grid differ. */
/** Person i's colour (fill and stroke by name), the same for life. */
/** Square `i`'s colour, by its index. */
export function colourOf(i: number): (typeof COLOR_NAMES)[number] {
  return COLOR_NAMES[(Math.imul(i + 1, 2654435761) >>> 0) % COLOR_NAMES.length];
}

function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const r = raw / p;
  return (r > 5 ? 10 : r > 2 ? 5 : r > 1 ? 2 : 1) * p;
}
