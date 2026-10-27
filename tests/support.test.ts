import { describe, expect, it } from 'vitest';
import { HEART_MAX_SCALE, QUIET_HEART, supportAppearance, supportInk } from '../stage/view/support.ts';

describe('the support heart', () => {
  it('starts quietly and fades to a redder heart after 45 seconds', () => {
    for (const age of [0, 20, 44.9, 45]) expect(supportAppearance(age)).toEqual(QUIET_HEART);
    const fading = supportAppearance(45.6);
    expect(fading.scale).toBeGreaterThan(1);
    expect(fading.scale).toBeLessThan(1.12);
    expect(supportAppearance(49).colour).toBe('rgb(215, 125, 131)');
  });

  it('grows on each of five slow beats until its peak matches the name font on desktop and mobile', () => {
    for (const cap of [1.3, HEART_MAX_SCALE]) {
      let previousPeak = 1;
      let previousRest = 1;
      for (let i = 0; i < 5; i++) {
        const peak = supportAppearance(47 + 24 * i, false, cap).scale;
        const rest = supportAppearance(49 + 24 * i, false, cap).scale;
        expect(peak).toBeGreaterThan(previousPeak);
        expect(rest).toBeGreaterThan(previousRest);
        expect(peak).toBeLessThanOrEqual(cap);
        previousPeak = peak;
        previousRest = rest;
      }
      expect(previousPeak).toBeCloseTo(cap);
    }
  });

  it('keeps slow quiet gaps during growth, then accelerates to distinct one-second beats', () => {
    for (const age of [49, 55, 65, 69]) expect(supportAppearance(age)).toEqual(supportAppearance(49));
    const starts = [162.2, 178.2, 190.2, 198.2, 202.2, 204.2, 205.2];
    const intervals = [16, 12, 8, 4, 2, 1, 1];
    for (let i = 0; i < starts.length; i++) {
      const peak = supportAppearance(starts[i] + Math.min(1.6, 0.7 * intervals[i]) / 2);
      expect(peak.scale).toBeCloseTo(HEART_MAX_SCALE);
    }
    for (const age of [205.55, 206.55, 207.55, 1000.55]) expect(supportAppearance(age).scale).toBeCloseTo(HEART_MAX_SCALE);
    expect(supportAppearance(205.95).scale).toBeCloseTo(0.9 * HEART_MAX_SCALE);
  });

  it('does not jump in size when another beat or a faster interval begins', () => {
    for (const age of [46.2, 70.2, 94.2, 118.2, 142.2, 162.2, 178.2, 190.2, 198.2, 202.2, 204.2, 205.2]) {
      expect(supportAppearance(age - 1e-6).scale).toBeCloseTo(supportAppearance(age + 1e-6).scale, 5);
    }
  });

  it('keeps the heart still for reduced motion', () => {
    for (const age of [45.01, 46.2, 47, 49, 71, 95, 143, 205.55, 1000]) expect(supportAppearance(age, true)).toEqual({ colour: 'rgb(215, 125, 131)', scale: 1.12 });
  });

  it('reserves every animated heart size inside one fixed link box', () => {
    const ink = { left: 0, right: 5, top: -0.8, bottom: 0.2 };
    const heart = { left: 4, right: 5, top: -0.7, bottom: 0.2 };
    const reserved = supportInk(ink, heart);
    for (const age of [0, 45.6, 47, 71, 95, 119, 143, 163, 191, 203, 205.55, 1000.55]) {
      const { scale } = supportAppearance(age);
      expect(4.5 - scale / 2).toBeGreaterThanOrEqual(reserved.left - 1e-12);
      expect(4.5 + scale / 2).toBeLessThanOrEqual(reserved.right + 1e-12);
      expect(-0.25 - 0.45 * scale).toBeGreaterThanOrEqual(reserved.top - 1e-12);
      expect(-0.25 + 0.45 * scale).toBeLessThanOrEqual(reserved.bottom + 1e-12);
    }
  });
});
