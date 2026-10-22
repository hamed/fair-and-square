/**
 * The stage: solid bodies in a walled yard. They wander, give way to one
 * another, and walk to their places when a pose is called; one that cannot get
 * through hops over the crowd and lands on its spot.
 *
 * One law, checked every substep: bodies on the ground never overlap and never
 * leave the walls. Contacts push (heavier pushes lighter, mass = wealth); what
 * contacts leave unresolved is undone locally, body by body, back to the last
 * valid state, so a jam stops the bodies in it and nobody else. Walls that
 * cannot close any further stop. A body that cannot grow into its wealth stays
 * smaller and denser for now, which is what the drawing's opacity shows.
 *
 * Bodies in the air are exempt; they land only on a free spot. So are
 * members of a chart updating itself while they glide past one another
 * (`passing`). Poses end exact: each body snaps to its target box, and targets are disjoint by
 * construction (figure.ts), so a finished chart is the figure to the bit.
 *
 * Coordinates: yard units, origin at the lower left, y up. Headless.
 */
import { createBoxes, packRectangles } from './pack.ts';
import { YARD, type Figure } from './figure.ts';
import { FILL, areaOf, contains } from './shapes.ts';
import { Rng } from './rng.ts';

const SUBSTEP = 1 / 120;
const MAX_SUBSTEPS = 6;
/** Overlap deeper than this is overlap. Shared edges of a figure differ by an ulp at most. */
const TOL = 1e-12;
const ITERATIONS = 16;
/** Bodies closer than this share of the smaller side count as touching. */
const CONTACT = 1e-3;
/** Contact separation margin, as a share of the smaller body's smaller side. */
const SLOP = 1e-6;
/** Walking pace, yard units a second; walking to a pose is brisker. */
const WALK = 0.4;
const RUN = 0.8;
const ACCEL = 7;
/** Seconds ahead a body looks to give way. */
const LOOK = 0.8;
/** Seconds without progress before a body hops (in a pose) or picks another goal (in the room). */
const STUCK = 0.7;
/** How long a live chart's glide takes, seconds. */
const GLIDE = 0.2;
/** Longest walk to a place in a pose before hopping the rest of the way, seconds. */
const ERRAND = 3;
/** Time constant of growing and shrinking, seconds. */
const MORPH = 0.2;
/** How fast walls close, yard units a second, when nobody is in the way (they open at once). */
const WALL_SPEED = 0.8;
/** …or faster from far away: most of the remaining gap in this many seconds. */
const WALL_TIME = 0.4;
const DRAG_SPEED = 10;
/** Seconds a body waits to press again after a press of its was undone. */
const PRESS_WAIT = 0.6;
/** Close enough to snap to the exact target: about a pixel. */
const SNAP = 0.003;
/** Retry a blocked landing this often, seconds. */
const LAND_EVERY = 0.1;

export type YieldRule = 'equal' | 'mass';

interface Walls {
  right: number;
  top: number;
}

export class Stage {
  readonly n: number;
  /** Body boxes: left, bottom, width, height; polygon kind (shapes.ts). */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly w: Float64Array;
  readonly h: Float64Array;
  readonly kind: Uint8Array;
  readonly vx: Float64Array;
  readonly vy: Float64Array;
  /** Target size and kind (always), exact target box corner (poses only). */
  readonly tw: Float64Array;
  readonly th: Float64Array;
  readonly tkind: Uint8Array;
  readonly ex: Float64Array;
  readonly ey: Float64Array;
  /** Resting area, for density; mass (= wealth), for contacts. */
  readonly rest: Float64Array;
  readonly mass: Float64Array;
  readonly settled: Uint8Array;
  /** Gliding to a place that moved a little (a live chart): in place, just catching up. */
  readonly glide: Uint8Array;
  private readonly pGlide: Uint8Array;
  /** Substeps in a row a glide was undone (someone in the way): enough, and it hops. */
  private readonly blocked: Uint8Array;
  /** Where the glide started (box), and how far along it is, 0 … 1. */
  private readonly gx: Float64Array;
  private readonly gy: Float64Array;
  private readonly gw: Float64Array;
  private readonly gh: Float64Array;
  private readonly gt: Float64Array;
  /** Hop progress: 0 on the ground, (0, 1] in the air. */
  readonly air: Float64Array;
  /** Distance walked, for the gait's phase. */
  readonly stride: Float64Array;
  /** Room goals (centres) and rest timers. */
  private readonly wx: Float64Array;
  private readonly wy: Float64Array;
  private readonly idle: Float64Array;
  /** Seconds left of shoving: a body that has been stuck may walk into others for a moment ("excuse me"). */
  private readonly shove: Float64Array;
  /** Wanted to grow last substep and found no free space. */
  private readonly pressing: Uint8Array;
  /** Pressed this substep; and seconds to wait before pressing again after a press was undone. */
  private readonly pressed: Uint8Array;
  private readonly pressWait: Float64Array;
  private readonly best: Float64Array;
  /** Seconds since this body was sent to its place in the pose. */
  private readonly errand: Float64Array;
  private readonly stuck: Float64Array;
  /** Hop: start centre, and target centre. */
  private readonly hcx: Float64Array;
  private readonly hcy: Float64Array;
  private readonly tcx: Float64Array;
  private readonly tcy: Float64Array;
  private readonly hopTime: Float64Array;
  private readonly landAt: Float64Array;
  private readonly dvx: Float64Array;
  private readonly dvy: Float64Array;
  /** The last valid state, for local undo. */
  private readonly px: Float64Array;
  private readonly py: Float64Array;
  private readonly pw: Float64Array;
  private readonly ph: Float64Array;
  private readonly pk: Uint8Array;
  private readonly pAir: Float64Array;
  private readonly pSettled: Uint8Array;
  private readonly reverted: Uint8Array;
  /** Sides touching someone, from the last substep's contacts: 1 left, 2 right, 4 below, 8 above. */
  private readonly touch: Uint8Array;
  private readonly order: Int32Array;
  /** Overlapping pairs from the last full sweep, flattened. */
  private readonly pairs: number[] = [];
  /** Where each body sits in `order`. */
  private readonly pos: Int32Array;
  /** The sweep axis: low edges and extents along it (x and w, or y and h), whichever the bodies are thinner along. */
  private lo: Float64Array;
  private ext: Float64Array;
  private readonly rng: Rng;

  walls: Walls = { right: YARD, top: YARD };
  wallGoal: Walls = { right: YARD, top: YARD };
  private prevWalls: Walls = { right: YARD, top: YARD };
  posing = false;
  /** A free room where nobody moves by themselves (`still`): people stay where they are put. */
  stillRoom = false;
  /** The held body was lifted (drag mode `lift`): it floats over the crowd and lands where dropped. */
  private lifted = false;
  yieldRule: YieldRule = 'equal';
  time = 0;
  dragged = -1;
  private dragX = 0;
  private dragY = 0;
  /** Pairs (i, j) that bumped since the last frame: the faces react. */
  readonly bumps: number[] = [];
  /** Counters for the console: hops started, bodies undone, rounds that could not be repaired. */
  hops = 0;
  reverts = 0;
  violations = 0;

  constructor(figure: Figure, mass: ArrayLike<number>, seed = 1) {
    const n = figure.kind.length;
    this.n = n;
    const f = () => new Float64Array(n);
    this.x = f();
    this.y = f();
    this.w = f();
    this.h = f();
    this.kind = new Uint8Array(n);
    this.vx = f();
    this.vy = f();
    this.tw = f();
    this.th = f();
    this.tkind = new Uint8Array(n);
    this.ex = f().fill(NaN);
    this.ey = f().fill(NaN);
    this.rest = f();
    this.mass = f();
    this.settled = new Uint8Array(n);
    this.glide = new Uint8Array(n);
    this.pGlide = new Uint8Array(n);
    this.blocked = new Uint8Array(n);
    this.gx = f();
    this.gy = f();
    this.gw = f();
    this.gh = f();
    this.gt = f();
    this.air = f();
    this.stride = f();
    this.wx = f();
    this.wy = f();
    this.idle = f();
    this.shove = f();
    this.pressing = new Uint8Array(n);
    this.pressed = new Uint8Array(n);
    this.pressWait = f();
    this.best = f().fill(Infinity);
    this.errand = f();
    this.stuck = f();
    this.hcx = f();
    this.hcy = f();
    this.tcx = f();
    this.tcy = f();
    this.hopTime = f();
    this.landAt = f();
    this.dvx = f();
    this.dvy = f();
    this.px = f();
    this.py = f();
    this.pw = f();
    this.ph = f();
    this.pk = new Uint8Array(n);
    this.pAir = f();
    this.pSettled = new Uint8Array(n);
    this.reverted = new Uint8Array(n);
    this.touch = new Uint8Array(n);
    this.order = Int32Array.from({ length: n }, (_, i) => i);
    this.pos = Int32Array.from({ length: n }, (_, i) => i);
    this.lo = this.x;
    this.ext = this.w;
    this.rng = new Rng(seed);
    this.apply(figure, mass);
    this.scatter();
    if (this.posing) this.finish();
  }

  /** Put everyone down at once, disjoint: on a grid when they fit, else packed from the corner. */
  /**
   * Everyone where they are drawn on `from` (the same people): their boxes and shapes, no speed. From there they
   * make their way to this stage's targets, so a stage built anew (Learn's Back) moves on instead of jumping.
   */
  takePlaces(from: Stage): void {
    if (from.n !== this.n) return;
    for (let i = 0; i < this.n; i++) {
      this.x[i] = from.x[i];
      this.y[i] = from.y[i];
      this.w[i] = from.w[i];
      this.h[i] = from.h[i];
      this.kind[i] = from.kind[i];
      this.vx[i] = this.vy[i] = 0;
      this.air[i] = 0;
      this.settled[i] = 0;
      this.glide[i] = 0;
    }
    this.walls = { right: Math.max(this.walls.right, from.walls.right), top: Math.max(this.walls.top, from.walls.top) };
  }

  scatter(): void {
    const n = this.n;
    const k = Math.ceil(Math.sqrt(n));
    const cell = YARD / k;
    let fits = true;
    for (let i = 0; i < n; i++) if (Math.max(this.tw[i], this.th[i]) > cell * 0.95) fits = false;
    for (let i = 0; i < n; i++) {
      this.w[i] = this.tw[i];
      this.h[i] = this.th[i];
      this.kind[i] = this.tkind[i];
      this.vx[i] = this.vy[i] = 0;
      this.air[i] = 0;
      this.settled[i] = 0;
      this.glide[i] = 0;
    }
    if (fits) {
      for (let i = 0; i < n; i++) {
        const room = cell - Math.max(this.w[i], this.h[i]);
        const cx = ((i % k) + 0.5) * cell + (this.rng.next() - 0.5) * 0.8 * room;
        const cy = (Math.floor(i / k) + 0.5) * cell + (this.rng.next() - 0.5) * 0.8 * room;
        this.x[i] = cx - this.w[i] / 2;
        this.y[i] = cy - this.h[i] / 2;
      }
    } else {
      const boxes = createBoxes(n);
      const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => this.w[b] * this.h[b] - this.w[a] * this.h[a] || a - b);
      let widest = 0;
      for (let i = 0; i < n; i++) widest = Math.max(widest, this.w[i]);
      packRectangles(this.w, this.h, order, Math.max(YARD, widest), boxes);
      for (let i = 0; i < n; i++) {
        this.x[i] = boxes.x0[i];
        this.y[i] = boxes.y0[i];
      }
    }
    let right = this.wallGoal.right;
    let top = this.wallGoal.top;
    for (let i = 0; i < n; i++) {
      right = Math.max(right, this.x[i] + this.w[i]);
      top = Math.max(top, this.y[i] + this.h[i]);
      this.wx[i] = this.x[i] + this.w[i] / 2;
      this.wy[i] = this.y[i] + this.h[i] / 2;
      this.idle[i] = this.rng.next() * 2;
    }
    this.walls = { right, top };
    this.save();
  }

  /**
   * New targets: sizes, kinds and (in a pose) places. Cheap enough to call
   * every frame. `live` means the same pose with new wealth (trading while
   * posed): whoever is already in place moves with the chart at once, and
   * anyone standing where the chart now reaches hops to their own place.
   * Otherwise everyone whose target moved walks (or hops) there.
   */
  apply(figure: Figure, mass: ArrayLike<number>, live = false): void {
    if (figure.kind.length !== this.n || mass.length !== this.n) throw new RangeError('figure and wealth must have one entry per body');
    const leaving = this.posing && figure.free;
    const carrying = live && this.posing && !figure.free;
    // walls open at once (that never squeezes anyone); they close in step()
    this.wallGoal = { right: Math.max(YARD, figure.right), top: Math.max(YARD, figure.top) };
    this.walls = { right: Math.max(this.walls.right, this.wallGoal.right), top: Math.max(this.walls.top, this.wallGoal.top) };
    for (let i = 0; i < this.n; i++) {
      const sized = figure.w[i] !== this.tw[i] || figure.h[i] !== this.th[i] || figure.kind[i] !== this.tkind[i];
      this.tw[i] = figure.w[i];
      this.th[i] = figure.h[i];
      this.tkind[i] = figure.kind[i];
      this.rest[i] = figure.rest[i];
      this.mass[i] = mass[i];
      if (figure.free) {
        this.ex[i] = this.ey[i] = NaN;
        if (leaving) {
          this.settled[i] = 0;
          this.glide[i] = 0;
          // anyone the pose left outside the yard, or in mid-air, comes back in with one hop
          const outside = this.x[i] + this.w[i] > this.wallGoal.right || this.y[i] + this.h[i] > this.wallGoal.top;
          if (this.air[i] > 0 || outside) this.hop(i, ...this.spot(i));
          this.wx[i] = this.x[i] + this.w[i] / 2;
          this.wy[i] = this.y[i] + this.h[i] / 2;
          this.idle[i] = 0.3 + this.rng.next() * 2;
        }
        continue;
      }
      const moved = figure.x[i] !== this.ex[i] || figure.y[i] !== this.ey[i];
      if ((moved || sized) && carrying && (this.settled[i] || this.glide[i])) {
        this.ex[i] = figure.x[i];
        this.ey[i] = figure.y[i];
        // everyone set gliding together moves on one clock: neighbours that shared an edge keep sharing it
        this.gx[i] = this.x[i];
        this.gy[i] = this.y[i];
        this.gw[i] = this.w[i];
        this.gh[i] = this.h[i];
        this.gt[i] = 0;
        this.settled[i] = 0;
        this.glide[i] = 1;
        this.errand[i] = 0;
        continue;
      }
      if (moved || sized) {
        this.glide[i] = 0;
        const far = Math.hypot(figure.x[i] - this.ex[i], figure.y[i] - this.ey[i]);
        // a big move is a new errand; a small one (a live chart) keeps the patience already spent
        if (!(far < 0.5 * Math.max(figure.w[i], figure.h[i]))) {
          this.best[i] = Infinity;
          this.stuck[i] = 0;
          this.errand[i] = 0;
        }
        this.settled[i] = 0;
        this.ex[i] = figure.x[i];
        this.ey[i] = figure.y[i];
        // a long way to go is one long hop, not a long walk
        if (!live && !(this.air[i] > 0) && i !== this.dragged && Math.hypot(this.x[i] - figure.x[i], this.y[i] - figure.y[i]) > YARD) this.hop(i);
      }
    }
    this.posing = !figure.free;
    this.stillRoom = figure.free && figure.still;
  }

  /** Everyone straight to their place in the pose, as if the walk had happened. */
  finish(): void {
    if (!this.posing) return;
    for (let i = 0; i < this.n; i++) {
      this.x[i] = this.ex[i];
      this.y[i] = this.ey[i];
      this.w[i] = this.tw[i];
      this.h[i] = this.th[i];
      this.kind[i] = this.tkind[i];
      this.vx[i] = this.vy[i] = 0;
      this.air[i] = 0;
      this.settled[i] = 1;
      this.glide[i] = 0;
    }
    this.dragged = -1;
    this.walls = { ...this.wallGoal };
    this.save();
  }

  /** In a pose and everyone in place (or gliding with a live chart). */
  get done(): boolean {
    if (!this.posing) return false;
    for (let i = 0; i < this.n; i++) if (!this.settled[i] && !this.glide[i]) return false;
    return true;
  }

  /** Take hold of body i: to push it through the crowd, or (`lift`) to carry it over everyone. */
  grab(i: number, lift = false): boolean {
    if (!(Number.isInteger(i) && i >= 0 && i < this.n) || this.air[i] > 0) return false;
    this.dragged = i;
    this.settled[i] = 0;
    this.glide[i] = 0;
    this.dragX = this.x[i] + this.w[i] / 2;
    this.dragY = this.y[i] + this.h[i] / 2;
    this.lifted = lift;
    if (lift) {
      this.hcx[i] = this.tcx[i] = this.dragX;
      this.hcy[i] = this.tcy[i] = this.dragY;
      this.air[i] = 1;
      this.hopTime[i] = 1;
      this.vx[i] = this.vy[i] = 0;
    }
    return true;
  }

  /** Where the grabbed body's centre should go; it is pushed there through the crowd, or stops. */
  drag(cx: number, cy: number): void {
    if (Number.isFinite(cx) && Number.isFinite(cy)) {
      this.dragX = cx;
      this.dragY = cy;
    }
  }

  release(): void {
    const i = this.dragged;
    this.dragged = -1;
    if (i < 0) return;
    if (this.lifted) {
      this.lifted = false;
      // down where dropped if there is room; if not, back where it was picked up
      this.clamp(i);
      if (this.blocker(i) === -1) {
        this.air[i] = 0;
        this.best[i] = Infinity;
        this.stuck[i] = 0;
        this.errand[i] = 0;
        this.idle[i] = 1;
        this.wx[i] = this.x[i] + this.w[i] / 2;
        this.wy[i] = this.y[i] + this.h[i] / 2;
      } else {
        const ox = this.hcx[i];
        const oy = this.hcy[i];
        this.hop(i, ox, oy);
      }
      return;
    }
    const speed = Math.hypot(this.vx[i], this.vy[i]);
    if (speed > 3) {
      this.vx[i] *= 3 / speed;
      this.vy[i] *= 3 / speed;
    }
    this.best[i] = Infinity;
    this.stuck[i] = 0;
    this.idle[i] = 0;
    this.wx[i] = this.x[i] + this.w[i] / 2;
    this.wy[i] = this.y[i] + this.h[i] / 2;
  }

  /** How high a body in the air is drawn above its box, yard units. Picking uses it too. */
  lift(i: number): number {
    const s = Math.min(1, this.air[i]);
    if (!(s > 0)) return 0;
    if (i === this.dragged && this.lifted) return 0.05 + 0.01 * Math.sin(this.time * 6);
    const hover = s >= 1 ? 0.5 + 0.5 * Math.sin(this.time * 9 + i) : 0;
    return (4 * s * (1 - s) + 0.25 * hover) * (0.06 + 0.25 * Math.min(1, this.hopTime[i]));
  }

  /** The body under a point: bodies in the air first (they are drawn on top), then the latest drawn. */
  pick(px: number, py: number): number {
    for (let pass = 0; pass < 2; pass++) {
      for (let i = this.n - 1; i >= 0; i--) {
        if ((this.air[i] > 0) !== (pass === 0)) continue;
        if (contains(this.kind[i], this.x[i], this.y[i] + this.lift(i), this.w[i], this.h[i], px, py)) return i;
      }
    }
    return -1;
  }

  /** Density: resting area over drawn area. 1 at rest, more when squeezed or shrunk. */
  density(i: number): number {
    return this.rest[i] / areaOf(this.kind[i], this.w[i], this.h[i]);
  }

  step(dt: number): void {
    if (!(dt > 0)) return;
    let left = Math.min(dt, MAX_SUBSTEPS * SUBSTEP);
    this.bumps.length = 0;
    this.steer(left);
    while (left > 1e-9) {
      const h = Math.min(SUBSTEP, left);
      this.substep(h);
      left -= h;
    }
  }

  /** Overlapping pairs on the ground and the deepest overlap: both must be zero, always. */
  overlaps(): { pairs: number; depth: number; outside: number } {
    let pairs = 0;
    let depth = 0;
    let outside = 0;
    this.sortOrder();
    const o = this.order;
    for (let p = 0; p < this.n; p++) {
      const i = o[p];
      if (this.air[i] > 0) continue;
      if (this.x[i] < -TOL || this.y[i] < -TOL || this.x[i] + this.w[i] > this.walls.right + TOL || this.y[i] + this.h[i] > this.walls.top + TOL) outside++;
      const ri = this.lo[i] + this.ext[i];
      for (let q = p + 1; q < this.n; q++) {
        const j = o[q];
        if (this.lo[j] >= ri) break;
        if (this.air[j] > 0) continue;
        if (this.passing(i, j)) continue;
        const d = Math.min(this.overlapX(i, j), this.overlapY(i, j));
        if (d > TOL) {
          pairs++;
          depth = Math.max(depth, d);
        }
      }
    }
    return { pairs, depth, outside };
  }

  // ——— one frame's intentions ———

  private steer(dt: number): void {
    const n = this.n;
    const { dvx, dvy } = this;
    const unit = 1 / n;
    if (!this.posing && this.stillRoom) {
      // nobody moves by themselves
      dvx.fill(0);
      dvy.fill(0);
      return;
    }
    for (let i = 0; i < n; i++) {
      dvx[i] = dvy[i] = 0;
      if (this.air[i] > 0 || this.settled[i] || this.glide[i] || i === this.dragged) continue;
      const cx = this.x[i] + this.w[i] / 2;
      const cy = this.y[i] + this.h[i] / 2;
      // the poor scurry and the rich amble, a little
      const size = areaOf(this.kind[i], this.w[i], this.h[i]) / unit;
      const speed = (this.posing ? RUN : WALK) * Math.min(1.5, Math.max(0.6, size ** -0.08));
      let gx: number;
      let gy: number;
      if (this.posing) {
        gx = this.ex[i] + this.tw[i] / 2;
        gy = this.ey[i] + this.th[i] / 2;
      } else {
        // left outside the yard by a pose: no dawdling, back inside
        const out = this.x[i] + this.w[i] > this.wallGoal.right || this.y[i] + this.h[i] > this.wallGoal.top;
        if (out && (this.idle[i] > 0 || this.wx[i] + this.w[i] / 2 > this.wallGoal.right || this.wy[i] + this.h[i] / 2 > this.wallGoal.top)) {
          this.idle[i] = 0;
          this.wander(i);
        }
        if (out) this.shove[i] = Math.max(this.shove[i], 0.2);
        if (this.idle[i] > 0) {
          this.idle[i] -= dt;
          if (this.idle[i] <= 0) this.wander(i);
          continue;
        }
        gx = this.wx[i];
        gy = this.wy[i];
      }
      const dx = gx - cx;
      const dy = gy - cy;
      const dist = Math.hypot(dx, dy);
      if (!this.posing && dist < 0.01 + 0.25 * Math.max(this.w[i], this.h[i])) {
        this.idle[i] = 0.6 + this.rng.next() * 3.5;
        continue;
      }
      if (dist > 1e-12) {
        const v = Math.min(speed, dist * 4);
        dvx[i] = (dx / dist) * v;
        dvy[i] = (dy / dist) * v;
      }
    }
    this.giveWay();
  }

  /**
   * Predicted near misses within LOOK seconds: each side steers away from the
   * closest approach, and head-on both keep to their right. Under the 'mass'
   * rule the lighter one does most of the giving way.
   */
  private giveWay(): void {
    const n = this.n;
    const { x, y, w, h, vx, vy, dvx, dvy } = this;
    const lo = new Float64Array(n);
    const reach = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      // a round-ish body's radius; a long bar looks ahead by its girth, not its length
      const r = 0.5 * Math.sqrt(w[i] * h[i]);
      // in a dense crowd look a few bodies ahead, not across the yard
      reach[i] = r + Math.min(Math.hypot(vx[i], vy[i]) * LOOK, 0.1 + 6 * r);
      lo[i] = x[i] + w[i] / 2 - reach[i];
    }
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => lo[a] - lo[b]);
    for (let p = 0; p < n; p++) {
      const i = order[p];
      if (this.air[i] > 0) continue;
      const ci = x[i] + w[i] / 2;
      const hi = ci + reach[i];
      for (let q = p + 1; q < n; q++) {
        const j = order[q];
        if (lo[j] > hi) break;
        if (this.air[j] > 0) continue;
        const pxj = x[j] + w[j] / 2 - ci;
        const pyj = y[j] + h[j] / 2 - (y[i] + h[i] / 2);
        if (Math.abs(pyj) > reach[i] + reach[j]) continue;
        const ux = vx[j] - vx[i];
        const uy = vy[j] - vy[i];
        const uu = ux * ux + uy * uy;
        if (uu < 1e-10) continue;
        const t = -(pxj * ux + pyj * uy) / uu;
        if (!(t > 0 && t < LOOK)) continue;
        const qx = pxj + ux * t;
        const qy = pyj + uy * t;
        const d = Math.hypot(qx, qy);
        const radius = 0.55 * (Math.sqrt(w[i] * h[i]) + Math.sqrt(w[j] * h[j])) + 0.01;
        if (d >= radius) continue;
        const urgency = (1 - t / LOOK) * (1 - d / radius);
        let ax: number;
        let ay: number;
        if (d > 1e-9) {
          ax = -qx / d;
          ay = -qy / d;
        } else {
          // head-on: keep right
          const s = Math.hypot(vx[i], vy[i]) || 1;
          ax = vy[i] / s;
          ay = -vx[i] / s;
        }
        const total = this.mass[i] + this.mass[j];
        const shareI = this.yieldRule === 'mass' && total > 0 ? (2 * this.mass[j]) / total : 1;
        const shareJ = this.yieldRule === 'mass' && total > 0 ? (2 * this.mass[i]) / total : 1;
        const k = 1.6 * RUN * urgency;
        if (!this.settled[i] && !this.glide[i] && i !== this.dragged) {
          dvx[i] += ax * k * shareI;
          dvy[i] += ay * k * shareI;
        }
        if (!this.settled[j] && !this.glide[j] && j !== this.dragged) {
          dvx[j] -= ax * k * shareJ;
          dvy[j] -= ay * k * shareJ;
        }
      }
    }
  }

  private wander(i: number): void {
    [this.wx[i], this.wy[i]] = this.spot(i);
    this.best[i] = Infinity;
    this.stuck[i] = 0;
  }

  // ——— one substep ———

  private save(): void {
    this.px.set(this.x);
    this.py.set(this.y);
    this.pw.set(this.w);
    this.ph.set(this.h);
    this.pk.set(this.kind);
    this.pAir.set(this.air);
    this.pSettled.set(this.settled);
    this.pGlide.set(this.glide);
    this.prevWalls = { ...this.walls };
  }

  /**
   * Sweep along the axis the bodies are thinner along: a stack of long bars
   * overlaps everywhere in x and hardly at all in y. Switches with some
   * hysteresis, and re-sorts in full when it does.
   */
  private chooseAxis(): void {
    let sw = 0;
    let sh = 0;
    for (let i = 0; i < this.n; i++) {
      sw += this.w[i];
      sh += this.h[i];
    }
    const dx = sw / this.walls.right;
    const dy = sh / this.walls.top;
    const alongX = this.lo === this.x;
    const want = alongX ? dx <= 1.5 * dy : dx < dy / 1.5;
    if (want === alongX) return;
    this.lo = want ? this.x : this.y;
    this.ext = want ? this.w : this.h;
    const lo = this.lo;
    this.order.sort((a, b) => lo[a] - lo[b]);
    for (let p = 0; p < this.n; p++) this.pos[this.order[p]] = p;
  }

  private substep(dt: number): void {
    this.chooseAxis();
    this.save();
    this.time += dt;
    // walls close only into empty space: they follow the last body out there, never push
    const walls = this.walls;
    if (walls.right > this.wallGoal.right || walls.top > this.wallGoal.top) {
      let right = this.wallGoal.right;
      let top = this.wallGoal.top;
      for (let i = 0; i < this.n; i++) {
        right = Math.max(right, this.x[i] + this.w[i]);
        top = Math.max(top, this.y[i] + this.h[i]);
      }
      const k = 1 - Math.exp(-dt / WALL_TIME);
      walls.right = Math.max(right, this.wallGoal.right, walls.right - Math.max(WALL_SPEED * dt, (walls.right - this.wallGoal.right) * k));
      walls.top = Math.max(top, this.wallGoal.top, walls.top - Math.max(WALL_SPEED * dt, (walls.top - this.wallGoal.top) * k));
    }
    const blend = 1 - Math.exp(-dt * ACCEL);
    for (let i = 0; i < this.n; i++) {
      if (this.air[i] > 0) {
        if (i === this.dragged && this.lifted) this.carry(i, dt);
        else this.fly(i, dt);
        continue;
      }
      if (this.glide[i]) {
        this.glideStep(i, dt);
        continue;
      }
      if (i === this.dragged) {
        const dx = this.dragX - (this.x[i] + this.w[i] / 2);
        const dy = this.dragY - (this.y[i] + this.h[i] / 2);
        const d = Math.hypot(dx, dy);
        const s = d > DRAG_SPEED * dt ? (DRAG_SPEED * dt) / d : 1;
        // whatever is in the way is shoved along from where it is met: a step longer than a
        // small body is wide must not pass through it
        const go = this.sweep(i, dx * s, dy * s);
        this.x[i] += dx * s * go;
        this.y[i] += dy * s * go;
        this.vx[i] = (dx * s) / dt;
        this.vy[i] = (dy * s) / dt;
      } else if (!this.settled[i]) {
        this.vx[i] += (this.dvx[i] - this.vx[i]) * blend;
        this.vy[i] += (this.dvy[i] - this.vy[i]) * blend;
        // nobody walks into someone they are touching: they slide along, or wait (or, stuck, shove)
        const t = this.shove[i] > 0 ? 0 : this.touch[i];
        this.shove[i] = Math.max(0, this.shove[i] - dt);
        if ((t & 1 && this.vx[i] < 0) || (t & 2 && this.vx[i] > 0)) this.vx[i] = 0;
        if ((t & 4 && this.vy[i] < 0) || (t & 8 && this.vy[i] > 0)) this.vy[i] = 0;
        // nor into a wall
        if ((this.x[i] <= 0 && this.vx[i] < 0) || (this.x[i] + this.w[i] >= this.walls.right && this.vx[i] > 0)) this.vx[i] = 0;
        if ((this.y[i] <= 0 && this.vy[i] < 0) || (this.y[i] + this.h[i] >= this.walls.top && this.vy[i] > 0)) this.vy[i] = 0;
        this.x[i] += this.vx[i] * dt;
        this.y[i] += this.vy[i] * dt;
        this.stride[i] += Math.hypot(this.vx[i], this.vy[i]) * dt;
      }
      this.shrink(i, dt);
      // in the room, someone with no room to grow presses the neighbours aside (contacts and the law
      // decide); a press that was undone waits a moment, so a jam does not freeze everyone in it
      this.pressed[i] = 0;
      this.pressWait[i] = Math.max(0, this.pressWait[i] - dt);
      if (this.pressing[i] && !this.posing && !this.settled[i] && this.pressWait[i] === 0) {
        this.press(i, dt);
        this.pressed[i] = 1;
      }
      if (this.posing && !this.settled[i] && i !== this.dragged) this.trySettle(i);
    }
    this.clampAll();
    // one full sweep, passes over the pairs it found, and a last sweep for pairs the pushes made
    if (this.resolve(true)) {
      this.clampAll();
      for (let k = 0; k < ITERATIONS && this.repush(); k++);
      if (this.resolve(false)) {
        this.clampAll();
        for (let k = 0; k < ITERATIONS && this.repush(); k++);
      }
    }
    this.validate();
    this.grow(dt);
    this.watchProgress(dt);
  }

  /** Grow or shrink toward the target size, about the centre; a change of kind keeps the area. Unchecked: bodies in the air. */
  private morph(i: number, dt: number): void {
    if (this.kind[i] !== this.tkind[i]) {
      const s = Math.sqrt(FILL[this.kind[i]] / FILL[this.tkind[i]]);
      this.resize(i, this.w[i] * s, this.h[i] * s);
      this.kind[i] = this.tkind[i];
    }
    const k = 1 - Math.exp(-dt / MORPH);
    this.resize(i, toward(this.w[i], this.tw[i], k), toward(this.h[i], this.th[i], k));
  }

  /**
   * Catch up with a place that moved a little: each corner moves in a straight
   * line from where the glide began to the target's, all on one clock, and
   * lands exactly. Undone if someone is in the way.
   */
  private glideStep(i: number, dt: number): void {
    this.kind[i] = this.tkind[i];
    this.vx[i] = this.vy[i] = 0;
    const u = Math.min(1, this.gt[i] + dt / GLIDE);
    this.gt[i] = u;
    if (u >= 1) {
      this.x[i] = this.ex[i];
      this.y[i] = this.ey[i];
      this.w[i] = this.tw[i];
      this.h[i] = this.th[i];
      this.glide[i] = 0;
      this.settled[i] = 1;
      return;
    }
    const x0 = this.gx[i] + (this.ex[i] - this.gx[i]) * u;
    const x1 = this.gx[i] + this.gw[i] + (this.ex[i] + this.tw[i] - this.gx[i] - this.gw[i]) * u;
    const y0 = this.gy[i] + (this.ey[i] - this.gy[i]) * u;
    const y1 = this.gy[i] + this.gh[i] + (this.ey[i] + this.th[i] - this.gy[i] - this.gh[i]) * u;
    this.x[i] = x0;
    this.y[i] = y0;
    this.w[i] = x1 - x0;
    this.h[i] = y1 - y0;
  }

  /** The lifted body follows the hand, over everyone, inside the walls. */
  private carry(i: number, dt: number): void {
    this.morph(i, dt);
    this.x[i] = Math.min(Math.max(0, this.dragX - this.w[i] / 2), Math.max(0, this.walls.right - this.w[i]));
    this.y[i] = Math.min(Math.max(0, this.dragY - this.h[i] / 2), Math.max(0, this.walls.top - this.h[i]));
  }

  /** The shrinking half of morph: always safe, the new box lies inside the old one. */
  private shrink(i: number, dt: number): void {
    if (this.kind[i] !== this.tkind[i] && FILL[this.kind[i]] < FILL[this.tkind[i]]) {
      const s = Math.sqrt(FILL[this.kind[i]] / FILL[this.tkind[i]]);
      this.resize(i, this.w[i] * s, this.h[i] * s);
      this.kind[i] = this.tkind[i];
    }
    const k = 1 - Math.exp(-dt / MORPH);
    this.resize(i, Math.min(this.w[i], toward(this.w[i], this.tw[i], k)), Math.min(this.h[i], toward(this.h[i], this.th[i], k)));
  }

  /**
   * The growing half: into free space only. A body that has no room stays
   * smaller, so denser, and grows when the crowd around it moves. Growth
   * never pushes anyone; that keeps the law cheap to keep.
   */
  private grow(dt: number): void {
    const k = 1 - Math.exp(-dt / MORPH);
    let widest = 0;
    for (let i = 0; i < this.n; i++) widest = Math.max(widest, this.ext[i]);
    for (let i = 0; i < this.n; i++) {
      if (this.air[i] > 0 || this.settled[i] || this.glide[i]) continue;
      let kind = this.kind[i];
      let w = this.w[i];
      let h = this.h[i];
      if (kind !== this.tkind[i]) {
        const s = Math.sqrt(FILL[kind] / FILL[this.tkind[i]]);
        w *= s;
        h *= s;
        kind = this.tkind[i];
      }
      w = Math.max(w, toward(w, this.tw[i], k));
      h = Math.max(h, toward(h, this.th[i], k));
      this.pressing[i] = 0;
      if (w === this.w[i] && h === this.h[i] && kind === this.kind[i]) continue;
      this.pressing[i] = 1;
      // the whole step, else half of it, else nothing this time; about the centre,
      // else away from whoever it touches (keeping one edge or corner where it is)
      grown: for (const f of [1, 0.5]) {
        const gw = this.w[i] * (w / this.w[i]) ** f;
        const gh = this.h[i] * (h / this.h[i]) ** f;
        if (gw > this.walls.right || gh > this.walls.top) continue;
        for (const [ax, ay] of ANCHORS) {
          let x = this.x[i] + (this.w[i] - gw) * ax;
          let y = this.y[i] + (this.h[i] - gh) * ay;
          x = Math.min(Math.max(0, x), this.walls.right - gw);
          y = Math.min(Math.max(0, y), this.walls.top - gh);
          if (this.occupied(i, x, y, gw, gh, widest)) continue;
          this.x[i] = x;
          this.y[i] = y;
          this.w[i] = gw;
          this.h[i] = gh;
          if (f === 1) this.kind[i] = kind;
          // the next body's check must see this one where it now is
          this.reorder(i);
          widest = Math.max(widest, this.ext[i]);
          this.pressing[i] = 0;
          break grown;
        }
      }
    }
  }

  /** Grow about the centre regardless of neighbours: what overlaps is pushed or undone. */
  private press(i: number, dt: number): void {
    const k = 1 - Math.exp(-dt / MORPH);
    const w = Math.max(this.w[i], toward(this.w[i], this.tw[i], k));
    const h = Math.max(this.h[i], toward(this.h[i], this.th[i], k));
    if (w > this.walls.right || h > this.walls.top) return;
    this.resize(i, w, h);
    this.clamp(i);
  }

  /** Does any other body on the ground overlap this box? Uses the sweep order of this substep. */
  private occupied(i: number, x0: number, y0: number, w: number, h: number, widest: number): boolean {
    const o = this.order;
    const x1 = x0 + w;
    const y1 = y0 + h;
    const alongX = this.lo === this.x;
    const a0 = alongX ? x0 : y0;
    const a1 = alongX ? x1 : y1;
    // first candidate: low edge ≥ a0 − widest
    let lo = 0;
    let hi = o.length;
    const from = a0 - widest;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.lo[o[mid]] < from) lo = mid + 1;
      else hi = mid;
    }
    for (let p = lo; p < o.length; p++) {
      const j = o[p];
      if (this.lo[j] >= a1 - TOL) break;
      if (j === i || this.air[j] > 0) continue;
      const ox = Math.min(x1, this.x[j] + this.w[j]) - Math.max(x0, this.x[j]);
      const oy = Math.min(y1, this.y[j] + this.h[j]) - Math.max(y0, this.y[j]);
      if (ox > TOL && oy > TOL) return true;
    }
    return false;
  }

  private resize(i: number, w: number, h: number): void {
    this.x[i] += (this.w[i] - w) / 2;
    this.y[i] += (this.h[i] - h) / 2;
    this.w[i] = w;
    this.h[i] = h;
  }

  /** Close to the target, slow, near the right size: take the exact box. Validation undoes it if the spot is taken. */
  private trySettle(i: number): void {
    const d = Math.hypot(this.x[i] - this.ex[i], this.y[i] - this.ey[i]);
    if (d > SNAP) return;
    if (Math.abs(this.w[i] / this.tw[i] - 1) > 0.03 || Math.abs(this.h[i] / this.th[i] - 1) > 0.03) return;
    this.x[i] = this.ex[i];
    this.y[i] = this.ey[i];
    this.w[i] = this.tw[i];
    this.h[i] = this.th[i];
    this.kind[i] = this.tkind[i];
    this.vx[i] = this.vy[i] = 0;
    this.settled[i] = 1;
  }

  /** Into the air, from where the body stands toward (cx, cy): its target in a pose, or a spot in the room. */
  private hop(i: number, cx = this.ex[i] + this.tw[i] / 2, cy = this.ey[i] + this.th[i] / 2): void {
    this.hcx[i] = this.x[i] + this.w[i] / 2;
    this.hcy[i] = this.y[i] + this.h[i] / 2;
    this.tcx[i] = cx;
    this.tcy[i] = cy;
    this.air[i] = 1e-6;
    this.hopTime[i] = Math.min(1.3, 0.18 + 0.5 * Math.hypot(cx - this.hcx[i], cy - this.hcy[i]));
    this.landAt[i] = 0;
    this.settled[i] = 0;
    this.glide[i] = 0;
    this.vx[i] = this.vy[i] = 0;
    this.hops++;
  }

  /** The emptiest of a few random spots in the room for this body at the size it is becoming, as a centre. */
  private spot(i: number): [number, number] {
    const right = this.wallGoal.right;
    const top = this.wallGoal.top;
    const w = this.tw[i];
    const h = this.th[i];
    let best: [number, number] = [w / 2, h / 2];
    let least = Infinity;
    for (let k = 0; k < 16 && least > 0; k++) {
      const cx = w / 2 + this.rng.next() * Math.max(0, right - w);
      const cy = h / 2 + this.rng.next() * Math.max(0, top - h);
      let crowd = 0;
      for (let j = 0; j < this.n; j++) {
        if (j === i || this.air[j] > 0) continue;
        const ox = Math.min(cx + w / 2, this.x[j] + this.w[j]) - Math.max(cx - w / 2, this.x[j]);
        const oy = Math.min(cy + h / 2, this.y[j] + this.h[j]) - Math.max(cy - h / 2, this.y[j]);
        if (ox > 0 && oy > 0) crowd += ox * oy;
      }
      if (crowd < least) {
        least = crowd;
        best = [cx, cy];
      }
    }
    return best;
  }

  private fly(i: number, dt: number): void {
    const s = Math.min(1, this.air[i] + dt / this.hopTime[i]);
    this.air[i] = s;
    if (this.posing) {
      // the target may move under a live chart: follow it
      this.tcx[i] = this.ex[i] + this.tw[i] / 2;
      this.tcy[i] = this.ey[i] + this.th[i] / 2;
    }
    this.morph(i, dt);
    const e = s * s * (3 - 2 * s);
    this.x[i] = this.hcx[i] + (this.tcx[i] - this.hcx[i]) * e - this.w[i] / 2;
    this.y[i] = this.hcy[i] + (this.tcy[i] - this.hcy[i]) * e - this.h[i] / 2;
    if (s < 1 || this.time < this.landAt[i]) return;
    // hovering over the spot: try to land now and then
    this.landAt[i] = this.time + LAND_EVERY;
    if (this.posing) {
      this.x[i] = this.ex[i];
      this.y[i] = this.ey[i];
      this.w[i] = this.tw[i];
      this.h[i] = this.th[i];
      this.kind[i] = this.tkind[i];
    }
    this.clamp(i);
    const blocker = this.blocker(i);
    if (blocker !== -1) {
      // in the room the crowd makes space under a hovering body (spread); after a
      // while it tries elsewhere. In a pose the spot is this body's own: whoever
      // stands on it is shooed off to their own place
      if (!this.posing) {
        this.stuck[i] += LAND_EVERY;
        if (this.stuck[i] > 2) {
          this.stuck[i] = 0;
          this.hop(i, ...this.spot(i));
        }
      } else if (blocker >= 0 && !this.settled[blocker] && !this.glide[blocker] && blocker !== this.dragged) this.hop(blocker);
      return;
    }
    this.air[i] = 0;
    this.vx[i] = this.vy[i] = 0;
    this.settled[i] = this.posing ? 1 : 0;
    this.best[i] = Infinity;
    this.stuck[i] = 0;
    if (!this.posing) {
      this.wx[i] = this.x[i] + this.w[i] / 2;
      this.wy[i] = this.y[i] + this.h[i] / 2;
      this.idle[i] = 0.5;
    }
  }

  /** Who is on body i's box: -1 nobody, -2 a wall, else the first body on the ground found there. */
  private blocker(i: number): number {
    const { x, y, w, h } = this;
    if (x[i] < -TOL || y[i] < -TOL || x[i] + w[i] > this.walls.right + TOL || y[i] + h[i] > this.walls.top + TOL) return -2;
    for (let j = 0; j < this.n; j++) {
      if (j === i || this.air[j] > 0) continue;
      if (this.overlapX(i, j) > TOL && this.overlapY(i, j) > TOL) return j;
    }
    return -1;
  }

  private clamp(i: number): void {
    if (this.x[i] + this.w[i] > this.walls.right) this.x[i] = this.walls.right - this.w[i];
    if (this.y[i] + this.h[i] > this.walls.top) this.y[i] = this.walls.top - this.h[i];
    if (this.x[i] < 0) this.x[i] = 0;
    if (this.y[i] < 0) this.y[i] = 0;
  }

  private clampAll(): void {
    for (let i = 0; i < this.n; i++) if (!(this.air[i] > 0) && !this.settled[i]) this.clamp(i);
  }

  /**
   * Which way to separate a pair: the axis on which they were apart at the
   * start of the substep (the side they met on), else the shallower overlap.
   * Choosing by depth alone flips at corners and never settles a crowd.
   */
  private alongX(i: number, j: number, ox: number, oy: number): boolean {
    const { px, py, pw, ph } = this;
    const pox = Math.min(px[i] + pw[i], px[j] + pw[j]) - Math.max(px[i], px[j]);
    const poy = Math.min(py[i] + ph[i], py[j] + ph[j]) - Math.max(py[i], py[j]);
    if (pox <= TOL && poy > TOL) return true;
    if (poy <= TOL && pox > TOL) return false;
    if (pox <= TOL && poy <= TOL) return pox < poy;
    return ox < oy;
  }

  /** 1 if i is on the low side of j along this axis: as they were at the start of the substep if apart then, else by centres. */
  private side(lo: Float64Array, size: Float64Array, plo: Float64Array, psize: Float64Array, i: number, j: number): 1 | -1 {
    if (plo[i] + psize[i] <= plo[j] + TOL) return 1;
    if (plo[j] + psize[j] <= plo[i] + TOL) return -1;
    return lo[i] + size[i] / 2 < lo[j] + size[j] / 2 ? 1 : -1;
  }

  /**
   * Two members of a chart that is updating itself (one gliding, the other
   * gliding or in place) may slide past each other for the length of a glide,
   * as bars do in a bar-chart race: both ends are exact figures, disjoint, and
   * the glide takes GLIDE seconds. Everyone else keeps the law with everyone.
   */
  private passing(i: number, j: number): boolean {
    return (this.glide[i] === 1 && (this.glide[j] === 1 || this.settled[j] === 1)) || (this.glide[j] === 1 && this.settled[i] === 1);
  }

  private overlapX(i: number, j: number): number {
    return Math.min(this.x[i] + this.w[i], this.x[j] + this.w[j]) - Math.max(this.x[i], this.x[j]);
  }

  private overlapY(i: number, j: number): number {
    return Math.min(this.y[i] + this.h[i], this.y[j] + this.h[j]) - Math.max(this.y[i], this.y[j]);
  }

  /**
   * Share of a push a body takes: 0 when it holds its place (in place in a
   * pose, or held), else 1. Positions split evenly so a growing speck can make
   * room between giants; wealth weighs in on momentum instead (resolve).
   */
  private movable(i: number): number {
    return this.settled[i] || this.glide[i] || i === this.dragged ? 0 : 1;
  }

  /** Insertion sort by low edge on the sweep axis: nearly sorted from the last substep, so linear. */
  private sortOrder(): void {
    const o = this.order;
    const x = this.lo;
    for (let p = 1; p < o.length; p++) {
      const id = o[p];
      const v = x[id];
      let q = p - 1;
      while (q >= 0 && x[o[q]] > v) {
        o[q + 1] = o[q];
        q--;
      }
      o[q + 1] = id;
    }
    for (let p = 0; p < o.length; p++) this.pos[o[p]] = p;
  }

  /** Body i moved a little: slide it to its place in `order`. */
  private reorder(i: number): void {
    const o = this.order;
    const x = this.lo;
    let p = this.pos[i];
    while (p > 0 && x[o[p - 1]] > x[i]) {
      o[p] = o[p - 1];
      this.pos[o[p]] = p;
      p--;
    }
    while (p < o.length - 1 && x[o[p + 1]] < x[i]) {
      o[p] = o[p + 1];
      this.pos[o[p]] = p;
      p++;
    }
    o[p] = i;
    this.pos[i] = p;
  }

  /**
   * A full sweep: notes who touches whom (for walking, next substep) and
   * pushes every overlapping pair apart, remembering the pairs. Returns
   * whether anything overlapped.
   */
  private resolve(first: boolean): boolean {
    this.sortOrder();
    const o = this.order;
    const { x, y, w, h } = this;
    if (first) this.touch.fill(0);
    this.pairs.length = 0;
    for (let p = 0; p < this.n; p++) {
      const i = o[p];
      if (this.air[i] > 0) continue;
      const near = first ? CONTACT * Math.min(w[i], h[i]) : 0;
      const end = this.lo[i] + this.ext[i] + near;
      for (let q = p + 1; q < this.n; q++) {
        const j = o[q];
        if (this.lo[j] >= end) break;
        if (this.air[j] > 0) continue;
        const ox = this.overlapX(i, j);
        const oy = this.overlapY(i, j);
        if (first) {
          const g = CONTACT * Math.min(w[i], h[i], w[j], h[j]);
          if (ox > -g && oy > -g) {
            // touching (or overlapping): the side is the axis of least overlap
            if (ox < oy) {
              const left = x[i] + w[i] / 2 < x[j] + w[j] / 2;
              this.touch[i] |= left ? 2 : 1;
              this.touch[j] |= left ? 1 : 2;
            } else {
              const below = y[i] + h[i] / 2 < y[j] + h[j] / 2;
              this.touch[i] |= below ? 8 : 4;
              this.touch[j] |= below ? 4 : 8;
            }
          }
        }
        if (ox <= TOL || oy <= TOL || this.passing(i, j)) continue;
        if (first && this.bumps.length < 64 && Math.min(ox, oy) > 0.05 * Math.min(w[i], h[i], w[j], h[j])) this.bumps.push(i, j);
        this.pairs.push(i, j);
        this.push(i, j, ox, oy);
      }
    }
    return this.pairs.length > 0;
  }

  /** Another pass over the pairs the last sweep found overlapping. Returns whether any still overlap. */
  private repush(): boolean {
    let any = false;
    const pairs = this.pairs;
    for (let k = 0; k < pairs.length; k += 2) {
      const i = pairs[k];
      const j = pairs[k + 1];
      const ox = this.overlapX(i, j);
      const oy = this.overlapY(i, j);
      if (ox <= TOL || oy <= TOL || this.passing(i, j)) continue;
      any = true;
      this.push(i, j, ox, oy);
      if (!this.settled[i]) this.clamp(i);
      if (!this.settled[j]) this.clamp(j);
    }
    return any;
  }

  /** Push one overlapping pair apart along the side they met on; movable bodies split it, walls hand their share over. */
  /**
   * Body i is about to move by (mx, my) on the ground. Every grounded body its
   * path meets, nearest first, is moved along with it from the moment they
   * meet, and shoves on whatever its own path meets the same way: a chain is
   * pushed, nothing small is passed through. A body that cannot move, or a
   * wall, stops the chain, and everything behind it stops where it meets it.
   * Returns the share of the move i may make; contacts then settle the rest.
   */
  private sweep(i: number, mx: number, my: number): number {
    if (mx === 0 && my === 0) return 1;
    return this.chain(i, mx, my, new Set([i]), false);
  }

  /** The share of (mx, my) body k gets to move, moving what it meets (see sweep); `pushed`: k is not the held body (walls stop it). */
  private chain(k: number, mx: number, my: number, seen: Set<number>, pushed: boolean): number {
    const { x, y, w, h } = this;
    const span = (a0: number, a1: number, b0: number, b1: number, m: number): [number, number] => {
      if (m > 0) return [(b0 - a1) / m, (b1 - a0) / m];
      if (m < 0) return [(b1 - a0) / m, (b0 - a1) / m];
      return a1 > b0 && a0 < b1 ? [-Infinity, Infinity] : [Infinity, -Infinity];
    };
    let go = 1;
    if (pushed) {
      // a wall: as far as the room left
      if (mx > 0) go = Math.min(go, Math.max(0, (this.walls.right - x[k] - w[k]) / mx));
      if (mx < 0) go = Math.min(go, Math.max(0, x[k] / -mx));
      if (my > 0) go = Math.min(go, Math.max(0, (this.walls.top - y[k] - h[k]) / my));
      if (my < 0) go = Math.min(go, Math.max(0, y[k] / -my));
    }
    // what k's path meets (already overlapping is left to the contacts), nearest first
    const hits: { j: number; enter: number }[] = [];
    for (let j = 0; j < this.n; j++) {
      if (seen.has(j) || this.air[j] > 0) continue;
      const [tx0, tx1] = span(x[k], x[k] + w[k], x[j], x[j] + w[j], mx);
      const [ty0, ty1] = span(y[k], y[k] + h[k], y[j], y[j] + h[j], my);
      const enter = Math.max(tx0, ty0);
      const exit = Math.min(tx1, ty1);
      if (enter >= 0 && enter < 1 && enter < exit) hits.push({ j, enter });
    }
    hits.sort((a, b) => a.enter - b.enter || a.j - b.j);
    for (const { j, enter } of hits) {
      // stopped before it gets there
      if (enter >= go) break;
      if (this.movable(j) === 0) {
        go = enter;
        break;
      }
      seen.add(j);
      // from the meeting on, j goes as far as k still goes, as far as its own way allows
      const rest = go - enter;
      const share = this.chain(j, rest * mx, rest * my, seen, true);
      x[j] += share * rest * mx;
      y[j] += share * rest * my;
      go = Math.min(go, enter + share * rest);
    }
    return go;
  }

  private push(i: number, j: number, ox: number, oy: number): void {
    const { x, y, w, h, vx, vy } = this;
    const wi = this.movable(i);
    const wj = this.movable(j);
    if (wi + wj === 0) return;
    const si = wi / (wi + wj);
    const sj = wj / (wi + wj);
    // separate a hair past touching, so a stack ends with gaps instead of ulp-deep overlaps
    const slop = SLOP * Math.min(w[i], h[i], w[j], h[j]) + 4 * TOL;
    if (this.alongX(i, j, ox, oy)) {
      const left = this.side(x, w, this.px, this.pw, i, j);
      // edge to edge from the side they met on: a speck inside a giant needs more than its own width
      const depth = left > 0 ? x[i] + w[i] - x[j] : x[j] + w[j] - x[i];
      // i moves by -left·a, j by +left·b; a wall takes what one side cannot move and hands it to the other
      const roomI = left > 0 ? x[i] : this.walls.right - x[i] - w[i];
      const roomJ = left > 0 ? this.walls.right - x[j] - w[j] : x[j];
      const [a, b] = split(depth + slop, si, sj, roomI, roomJ);
      x[i] -= left * a;
      x[j] += left * b;
      // inelastic along the normal: approach speed shared by mass (wealth)
      if ((vx[i] - vx[j]) * left > 0) {
        const shared = wi === 0 ? vx[i] : wj === 0 ? vx[j] : (vx[i] * this.mass[i] + vx[j] * this.mass[j]) / (this.mass[i] + this.mass[j]);
        vx[i] = vx[j] = shared;
      }
    } else {
      const below = this.side(y, h, this.py, this.ph, i, j);
      const depth = below > 0 ? y[i] + h[i] - y[j] : y[j] + h[j] - y[i];
      const roomI = below > 0 ? y[i] : this.walls.top - y[i] - h[i];
      const roomJ = below > 0 ? this.walls.top - y[j] - h[j] : y[j];
      const [a, b] = split(depth + slop, si, sj, roomI, roomJ);
      y[i] -= below * a;
      y[j] += below * b;
      if ((vy[i] - vy[j]) * below > 0) {
        const shared = wi === 0 ? vy[i] : wj === 0 ? vy[j] : (vy[i] * this.mass[i] + vy[j] * this.mass[j]) / (this.mass[i] + this.mass[j]);
        vy[i] = vy[j] = shared;
      }
    }
  }

  /**
   * The law. Any body still overlapping, or outside the walls, goes back to
   * where it was at the start of the substep (when everything was valid), with
   * its velocity cleared; that can expose an overlap with a body that moved
   * into its old place, which goes back too, and so on. Bodies that are fine
   * keep their move. If undone bodies still sit outside, the walls closed on
   * them: the walls go back.
   */
  private validate(): void {
    this.reverted.fill(0);
    for (let round = 0; round <= this.n + 1; round++) {
      const offenders = this.offenders();
      if (offenders.length === 0) return;
      let progress = false;
      for (const i of offenders) {
        if (this.reverted[i]) continue;
        this.revert(i);
        progress = true;
      }
      if (!progress) {
        if (this.walls.right !== this.prevWalls.right || this.walls.top !== this.prevWalls.top) {
          this.walls = { ...this.prevWalls };
          continue;
        }
        this.violations++;
        return;
      }
    }
  }

  private offenders(): number[] {
    const out: number[] = [];
    this.sortOrder();
    const o = this.order;
    const { right, top } = this.walls;
    for (let p = 0; p < this.n; p++) {
      const i = o[p];
      if (this.air[i] > 0) continue;
      if (this.x[i] < -TOL || this.y[i] < -TOL || this.x[i] + this.w[i] > right + TOL || this.y[i] + this.h[i] > top + TOL) out.push(i);
      const ri = this.lo[i] + this.ext[i];
      for (let q = p + 1; q < this.n; q++) {
        const j = o[q];
        if (this.lo[j] >= ri) break;
        if (this.air[j] > 0) continue;
        if (this.overlapX(i, j) > TOL && this.overlapY(i, j) > TOL && !this.passing(i, j)) out.push(i, j);
      }
    }
    return out;
  }

  private revert(i: number): void {
    this.x[i] = this.px[i];
    this.y[i] = this.py[i];
    this.w[i] = this.pw[i];
    this.h[i] = this.ph[i];
    this.kind[i] = this.pk[i];
    this.air[i] = this.pAir[i];
    this.settled[i] = this.pSettled[i];
    this.glide[i] = this.pGlide[i];
    this.vx[i] = this.vy[i] = 0;
    this.reverted[i] = 1;
    this.reverts++;
    if (this.pressed[i]) this.pressWait[i] = PRESS_WAIT;
  }

  /** Patience: in a pose, no progress for STUCK seconds means hop; in the room, pick another goal. */
  private watchProgress(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.glide[i]) {
        // a blocked glide: the one crossing others (a bar changing rank) hops over at once;
        // those shifting by about their own thickness wait for it, and hop only if it lasts
        this.blocked[i] = this.reverted[i] ? Math.min(255, this.blocked[i] + 1) : 0;
        const trip = Math.hypot(this.ex[i] - this.gx[i], this.ey[i] - this.gy[i]);
        const crossing = trip > 1.5 * Math.min(this.tw[i], this.th[i]);
        if ((crossing && this.blocked[i] >= 2) || this.blocked[i] >= 12) {
          this.blocked[i] = 0;
          this.hop(i);
        }
        continue;
      }
      if (this.air[i] > 0 || this.settled[i] || i === this.dragged) continue;
      if (!this.posing && this.stillRoom) continue;
      if (!this.posing && this.idle[i] > 0) continue;
      const cx = this.x[i] + this.w[i] / 2;
      const cy = this.y[i] + this.h[i] / 2;
      const d = this.posing
        ? Math.hypot(cx - (this.ex[i] + this.tw[i] / 2), cy - (this.ey[i] + this.th[i] / 2))
        : Math.hypot(cx - this.wx[i], cy - this.wy[i]);
      // a pose waits for nobody for long: whoever is still walking after ERRAND seconds hops
      if (this.posing && (this.errand[i] += dt) > ERRAND) {
        this.errand[i] = 0;
        this.hop(i);
        continue;
      }
      if (d < this.best[i] * 0.98 - 1e-4) {
        this.best[i] = d;
        this.stuck[i] = 0;
        continue;
      }
      this.stuck[i] += dt;
      if (this.stuck[i] < (this.posing ? STUCK : 2 * STUCK)) continue;
      this.stuck[i] = 0;
      this.best[i] = Infinity;
      if (this.posing) this.hop(i);
      else {
        // try somewhere else, and this time say excuse me
        this.wander(i);
        this.shove[i] = 1;
      }
    }
  }
}

/**
 * Shares of a separation `depth` for two bodies with weights si + sj = 1 (an
 * immovable body has weight 0), when each can move at most `roomI`/`roomJ`
 * before a wall: what one cannot take, the other does.
 */
function split(depth: number, si: number, sj: number, roomI: number, roomJ: number): [number, number] {
  const ri = Math.max(0, roomI);
  const rj = Math.max(0, roomJ);
  let a = depth * si;
  let b = depth * sj;
  if (a > ri) {
    if (sj > 0) b += a - ri;
    a = ri;
  }
  if (b > rj) {
    if (si > 0) a = Math.min(ri, a + b - rj);
    b = rj;
  }
  return [a, b];
}

/** Where growth may start from: the centre first, then edges, then corners (share of the growth on the low side). */
const ANCHORS: readonly (readonly [number, number])[] = [
  [0.5, 0.5],
  [0, 0.5],
  [1, 0.5],
  [0.5, 0],
  [0.5, 1],
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];

/** One morph step from `from` toward `to`, geometric, snapping when within a billionth. */
function toward(from: number, to: number, k: number): number {
  if (from === to) return to;
  const next = from * (to / from) ** k;
  return Math.abs(next - to) <= 1e-9 * to ? to : next;
}
