import { expect, test } from '@playwright/test';

interface Result {
  pinned: Record<string, string>;
  now: Record<string, string>;
  golden: Record<string, string>;
  presets: Record<string, string>;
}

// The same AST and seed give an identical state hash in every browser (spec, Acceptance): this browser's digests
// of the math grid, the streams and every preset at round 200 equal the ones Node pinned.
test('determinism: this browser computes the bits Node pinned', async ({ page }) => {
  await page.goto('/tests/browser/hash.html');
  const result = (await page.waitForFunction(() => (window as unknown as { __determinism?: Result }).__determinism, undefined, { timeout: 60_000 })).jsonValue() as Promise<Result>;
  const r = await result;
  expect(r.now).toEqual(r.pinned);
  expect(r.presets).toEqual(r.golden);
});
