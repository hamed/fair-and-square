import type { Ink } from './logo.ts';

/** A quiet invitation after some time in the yard, rather than on arrival. */
export const SUPPORT_DELAY = 45;
export const SUPPORT_FONT_SHARE = 0.65;
export const HEART_MAX_SCALE = 1 / SUPPORT_FONT_SHARE;
const FADE = 1.2;
const INTERVAL = 24;
const PULSE = 1.6;
const REST_SCALE = 1.12;
const GROWTH_PULSES = 5;
const FASTER_INTERVALS = [20, 16, 12, 8, 4, 2, 1];
const MUTED = [0x95, 0x8c, 0x7b];
const RED = [0xd7, 0x7d, 0x83];

export interface SupportAppearance { readonly colour: string; readonly scale: number }
export const QUIET_HEART: SupportAppearance = { colour: '#958c7b', scale: 1 };

/** Five slow growth beats, then progressively shorter gaps, ending at one beat per second. */
function beatAt(seconds: number): { index: number; phase: number; interval: number } {
  const lastGrowth = (GROWTH_PULSES - 1) * INTERVAL;
  if (seconds < lastGrowth) return { index: Math.floor(seconds / INTERVAL), phase: seconds % INTERVAL, interval: INTERVAL };
  let start = lastGrowth;
  let index = GROWTH_PULSES - 1;
  for (const interval of FASTER_INTERVALS) {
    if (seconds < start + interval) return { index, phase: seconds - start, interval };
    start += interval;
    index++;
  }
  return { index: index + Math.floor(seconds - start), phase: (seconds - start) % 1, interval: 1 };
}

/** The peak reaches the author's font size; reduced motion stays at one quiet resting size. */
export function supportAppearance(seconds: number, reduced = false, maxScale = HEART_MAX_SCALE): SupportAppearance {
  if (seconds <= SUPPORT_DELAY) return QUIET_HEART;
  const age = seconds - SUPPORT_DELAY;
  const fade = reduced ? 1 : Math.min(1, age / FADE);
  const colour = `rgb(${MUTED.map((v, i) => Math.round(v + (RED[i] - v) * fade)).join(', ')})`;
  if (reduced) return { colour, scale: REST_SCALE };
  const cap = Math.min(HEART_MAX_SCALE, maxScale);
  const { index, phase, interval } = beatAt(Math.max(0, age - FADE));
  const firstPeak = Math.min(1.26, cap);
  const peakAt = (i: number) => firstPeak + (cap - firstPeak) * Math.min(i, GROWTH_PULSES - 1) / (GROWTH_PULSES - 1);
  const peak = peakAt(index);
  const previousRest = index === 0 ? REST_SCALE : 0.9 * peakAt(index - 1);
  // Grow with the beat, retaining the larger resting size afterwards. Short beats still have a quiet gap.
  const duration = Math.min(PULSE, 0.7 * interval);
  const grow = Math.min(1, phase / (duration / 2));
  const rest = previousRest + (0.9 * peak - previousRest) * grow * grow * (3 - 2 * grow);
  const pulse = phase < duration ? Math.sin(Math.PI * phase / duration) ** 2 : 0;
  return { colour, scale: 1 + fade * (rest + (peak - rest) * pulse - 1) };
}

/** Reserve the largest heart once, so the header and link target never pulse. */
export function supportInk(ink: Ink, heart: Ink): Ink {
  const cx = (heart.left + heart.right) / 2;
  const cy = (heart.top + heart.bottom) / 2;
  return {
    left: Math.min(ink.left, cx + (heart.left - cx) * HEART_MAX_SCALE),
    right: Math.max(ink.right, cx + (heart.right - cx) * HEART_MAX_SCALE),
    top: Math.min(ink.top, cy + (heart.top - cy) * HEART_MAX_SCALE),
    bottom: Math.max(ink.bottom, cy + (heart.bottom - cy) * HEART_MAX_SCALE),
  };
}
