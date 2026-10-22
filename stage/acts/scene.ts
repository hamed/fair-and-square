/**
 * What an act draws, as plain data in yard units (x, y the lower-left corner,
 * y up). The renderer only paints these; it knows no act.
 */
import type { Box, Line } from '../core/area.ts';

/** Several people's colours mixed by weight (a pile's): one object per mix, so a painter can cache it. */
export interface Blend {
  readonly of: readonly number[];
  readonly by: readonly number[];
}

/** A piece of money: one person's colour, or a blend (a pile's), turning toward its host's as it joins. */
export interface Piece {
  box: Box;
  alpha: number;
  colour: number;
  /** A colour of its own (CSS) instead of a person's: money no one holds yet. */
  fill?: string;
  blend?: Blend;
  /** Colour it is turning toward (a docked piece takes its host's), and how far. */
  to?: number;
  turn?: number;
}

export interface Scene {
  /** Bodies drawn as another box for now (a slice cut away, a bar attached). */
  display: Map<number, Box>;
  pieces: Piece[];
  /** Cut lines and seams. */
  lines: (Line & { alpha: number })[];
  /** Outlines: dashed, or solid (a division), with a number in the corner if `label`. */
  frames: { box: Box; alpha: number; solid?: boolean; label?: string }[];
  /** Words at (x, y), their top there (`above`: their bottom); from x on, or centred on it (`centre`); `size` as a share of the default. */
  labels: { x: number; y: number; text: string; size?: number; centre?: boolean; above?: boolean }[];
  /**
   * A coin of diameter `size` about (x, y), raised `lift` above it, turned `flip` radians about its
   * upright axis: face 0 (person `faces[0]`'s colour) shows while cos(flip) > 0, face 1 otherwise.
   */
  coins: { x: number; y: number; size: number; flip: number; lift: number; faces: [number, number]; alpha: number }[];
  /** A soft light around a box (something to look at). */
  /** Soft lights round a box: in its square's own colour (`of`, a person), else the gold of something to do. */
  glows: { box: Box; alpha: number; of?: number }[];
  /** Edges lit, blinking, in their square's own colour (`of`): a side that is its money. */
  edges: { x0: number; y0: number; x1: number; y1: number; alpha: number; of: number }[];
  /** Polygons (x0, y0, x1, y1, …): filled with a person's colour or a tint, and or stroked. */
  polys: Poly[];
  /** A line across the yard at `x` from y0 to y1 that the reader can drag, with a number by its top. */
  handles: { x: number; y0: number; y1: number; label: string; alpha: number }[];
  /** A word or number on a small card over everyone, its bottom centre at (x, y). */
  tags: { x: number; y: number; text: string; alpha: number }[];
  /** Every body copied at an offset, inside `clip` (a print). */
  /**
   * Copies of the photo, `dx`, `dy` from it: only the part between `cut.x0` and `cut.x1` (world x, as drawn) if cut;
   * `free`: drawn outside the photo's clip (a piece on its way in, or thrown away).
   */
  ghosts: { dx: number; dy: number; alpha: number; cut?: { x0: number; x1: number }; free?: boolean }[];
  clip: Box | null;
  /** Who looks at whom for now: [i, j]. */
  looks: [number, number][];
}

/** A polygon in yard units. `fill`: a person's colour (their index), or a tint; `stroke`: its outline's ink. */
export interface Poly {
  pts: number[];
  /** A person's colour, money's, the Gini's gap, the full triangle's grey, or a ghost's faint wash. */
  fill?: number | 'money' | 'gap' | 'triangle' | 'ghost';
  stroke?: 'ink' | 'faint';
  /** The line's width, px (default: ink 2, faint 0.75). */
  width?: number;
  dash?: boolean;
  /** Not closed: a line through the points. */
  open?: boolean;
  alpha: number;
}

export function emptyScene(): Scene {
  return { display: new Map(), pieces: [], lines: [], frames: [], labels: [], coins: [], glows: [], edges: [], polys: [], handles: [], tags: [], ghosts: [], clip: null, looks: [] };
}
