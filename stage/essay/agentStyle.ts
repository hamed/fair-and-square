/**
 * The squares' colours (a pastel fill and a stroke per hue) and the shapes a face can be drawn on, from the essay.
 * Display only: the simulation never sees them, so who someone is never changes how they fare.
 *
 * Colours are validated against the warm-paper surface (#f4efe4) with the dataviz six checks: strokes carry
 * identity (all ≥ 3:1 contrast; worst all-pairs CVD ΔE 10.3, floor band — legal because shape + fill/stroke
 * pairing are strong secondary encodings). Fills are light washes of the same hue families.
 */

/** The shapes a face can be drawn on (the essay's; the stage's squares are squares). */
export type AgentShape = 'circle' | 'triangle' | 'triangleDown' | 'square' | 'pentagon' | 'hexagon' | 'heptagon' | 'octagon';

export const COLOR_NAMES = ['red', 'blue', 'green', 'violet', 'teal', 'pink'] as const;

export type ColorName = (typeof COLOR_NAMES)[number];

export const STROKES: Record<ColorName, string> = {
  red: '#9d3533',
  blue: '#284e99',
  green: '#59985b',
  violet: '#865eb1',
  teal: '#1d9999',
  pink: '#a7547e',
};

export const FILLS: Record<ColorName, string> = {
  red: '#f6beb8',
  blue: '#b7cff9',
  green: '#b4dab4',
  violet: '#d7c4f1',
  teal: '#9bdcdb',
  pink: '#f0bdd4',
};
