import { expect, test } from '@playwright/test';

test('the story and its artifacts are available without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('/making-of.html');
  await expect(page.getByRole('heading', { name: 'How Fair and Square was made' })).toBeVisible();
  await expect(page.locator('.log > li')).toHaveCount(7);
  await expect(page.locator('.discovery')).toContainText('The agents themselves became the charts.');
  await expect(page.locator('.born-section')).toContainText('John Rawls');
  await expect(page.locator('.afterword')).toContainText('The Evolution of Trust');
  const image = page.locator('.born-demo img');
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.locator('[data-open-yard]')).toBeHidden();
  await expect(page.getByRole('link', { name: 'Or open the yard in a full window →' })).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await context.close();
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`Making-of artifacts fit and the actual game opens only on request (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/making-of.html?utm_content=k7m2q9vd');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.log > li')).toHaveCount(7);
    await expect(page.locator('iframe')).toHaveCount(0);

    // Check the whole article, including late lazy images and the paired transformation clips.
    for (const artifact of await page.locator('.artifact').all()) {
      await artifact.scrollIntoViewIfNeeded();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
    for (const video of await page.locator('video[data-clip]').all()) {
      await video.scrollIntoViewIfNeeded();
      await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    }
    await expect(page.locator('iframe')).toHaveCount(0);

    const launch = page.locator('[data-open-yard]');
    await launch.focus();
    await expect(launch).toBeFocused();
    await launch.press('Enter');
    await expect(launch).toHaveAttribute('aria-expanded', 'true');
    const gameUrl = new URL((await page.locator('.live-yard').getAttribute('src'))!, page.url());
    expect(gameUrl.pathname).toBe('/');
    expect(gameUrl.searchParams.get('opening')).toBe('0');
    expect(gameUrl.searchParams.get('embed')).toBe('1');
    expect(gameUrl.searchParams.get('utm_content')).toBe('k7m2q9vd');
    await expect(page.locator('[data-yard-demo] .yard-view > img')).toHaveCount(0);
    const game = page.frameLocator('.live-yard');
    const born = game.locator('[data-control="be"]');
    await expect(born).toBeVisible();
    await expect(born).toBeEnabled();
    await born.focus();
    await born.press('Enter');
    await expect.poll(async () => {
      const frame = await page.locator('.live-yard').elementHandle();
      const content = await frame!.contentFrame();
      return content!.evaluate(() => {
        const s = (window as any).fns.session();
        return !!s.you && s.you.i >= 0 && s.you.i < s.game.n && s.selected === s.you.i;
      });
    }).toBe(true);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

    await launch.focus();
    await launch.press('Enter');
    await expect(launch).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.locator('[data-yard-demo] .yard-view > img')).toBeVisible();
  });
}
