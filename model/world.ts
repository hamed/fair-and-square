/**
 * The state: N agents and one pot, as struct-of-arrays Float64Arrays (the essay's core law, and the layout a
 * future WASM core would share). Wealth is in units of the current mean W̄ = W/N, so expressions read it directly;
 * only grow changes W, and it renormalises (see compile.ts), keeping W/W₀ in `total`.
 *
 * Space is a torus of side G = ⌈√(N / 0.6)⌉ (about 60 % occupied); each agent holds one cell.
 */
import type { Global } from './catalogue.ts';
import { measure, sortedOrder, type Measures } from './stats.ts';

export const MIN_N = 2;
export const MAX_N = 2000;
/** Share of the torus's cells that are occupied (owner, 2026-10-18: torus; ~60 % leaves `move` room). */
const OCCUPANCY = 0.6;
/** Thrift stays below 1: an agent with λ = 1 would never put anything in play. */
export const MAX_THRIFT = 1 - 2 ** -20;

export class World {
  readonly n: number;
  /** Wealth wₖ, in units of the current mean. */
  readonly w: Float64Array;
  readonly talent: Float64Array;
  /** Thrift λₖ ∈ [0, 1): the share kept out of play. */
  readonly thrift: Float64Array;
  /** Wealth at the start of this round (for gains). */
  readonly start: Float64Array;
  /** Wealth gained in this round's trades. */
  readonly gain: Float64Array;
  /** The torus's side G. */
  readonly side: number;
  /** Each agent's cell, y·G + x. */
  readonly cell: Int32Array;
  /** Each cell's agent, or −1. */
  readonly occupant: Int32Array;
  /** The pot P, in units of the current mean. */
  pot = 0;
  /** W / W₀. */
  total = 1;
  /** The debt limit D in units of the current mean (set at round 0 in units of the starting mean). */
  debt = 0;
  /** Rounds completed. */
  round = 0;

  constructor(n: number) {
    this.n = n;
    this.w = new Float64Array(n).fill(1);
    this.talent = new Float64Array(n);
    this.thrift = new Float64Array(n);
    this.start = new Float64Array(n).fill(1);
    this.gain = new Float64Array(n);
    this.side = Math.ceil(Math.sqrt(n / OCCUPANCY));
    this.cell = new Int32Array(n);
    this.occupant = new Int32Array(this.side * this.side).fill(-1);
  }

  /** In-play wealth uₖ = (1 − λₖ)(wₖ + D): all a trade can see. */
  inplay(k: number): number {
    return (1 - this.thrift[k]) * (this.w[k] + this.debt);
  }
}

/**
 * Ranks and globals as they were when a statement started: taken lazily on first read, dropped when the next
 * statement starts. (A trade that reads them takes it before its first transfer: compile.ts.)
 */
export class Snapshot {
  private readonly world: World;
  private readonly order: Int32Array;
  /** Each agent's position in the sorted order, 0 = poorest. */
  readonly position: Int32Array;
  private sorted = false;
  private measures: Measures | null = null;

  constructor(world: World) {
    this.world = world;
    this.order = new Int32Array(world.n);
    this.position = new Int32Array(world.n);
  }

  reset(): void {
    this.sorted = false;
    this.measures = null;
  }

  /** Take it now (before anything moves). */
  take(): void {
    this.sort();
    this.measures ??= measure(this.world.w, this.world.pot, this.order);
  }

  /** Agents, poorest first. */
  sortedAgents(): Int32Array {
    this.sort();
    return this.order;
  }

  /** Rank in [0, 1]: 0 the poorest, 1 the richest. */
  rank(k: number): number {
    this.sort();
    return this.position[k] / (this.world.n - 1);
  }

  /** The agent's position among the sorted, 0 = poorest. */
  positionOf(k: number): number {
    this.sort();
    return this.position[k];
  }

  global(name: Global): number {
    const world = this.world;
    switch (name) {
      case 'n':
        return world.n;
      case 'round':
        return world.round;
      case 'total':
        return world.total;
      case 'pot':
        return world.pot;
    }
    this.take();
    const m = this.measures!;
    switch (name) {
      case 'median':
        return m.median;
      case 'min':
        return m.min;
      case 'max':
        return m.max;
      case 'gini':
        return m.gini;
      case 'neff':
        return m.neff;
      case 'top1':
        return m.top1;
      case 'bottom50':
        return m.bottom50;
    }
  }

  private sort(): void {
    if (this.sorted) return;
    sortedOrder(this.world.w, this.order);
    for (let k = 0; k < this.order.length; k++) this.position[this.order[k]] = k;
    this.sorted = true;
  }
}
