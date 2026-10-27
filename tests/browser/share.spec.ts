import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route('https://cloud.umami.is/**', (route) => route.abort());
  await context.route('https://static.cloudflareinsights.com/**', (route) => route.abort());
  await context.addInitScript(() => {
    (window as any).__writes = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (text: string) => { (window as any).__writes.push(text); },
    } });
  });
});

async function open(page: Page) {
  await page.goto('/?opening=0');
  await page.waitForFunction(() => (window as any).fns);
  await page.evaluate(() => (window as any).fns.run('fx off; rule beta 0.3; round 7'));
}

const dialog = (page: Page) => page.locator('.share-dialog');
const writes = (page: Page) => page.evaluate(() => (window as any).__writes as string[]);
const iframeUrl = (page: Page, code: string) => page.evaluate((code) => new DOMParser().parseFromString(code, 'text/html').querySelector('iframe')!.src, code);

test('Share copies a fixed snapshot once, then offers coffee alongside Copy', async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() => (window as any).fns.session().game.run.hash());
  await page.locator('#panel [data-control="share"]').click();
  const box = dialog(page);
  await expect(box).toBeVisible();
  await expect(box.locator('canvas.share-face')).toHaveCount(0);
  await expect(box.locator('.share-support')).not.toBeVisible();
  expect(await writes(page)).toEqual([]);
  const value = await box.locator('[data-share-value]').inputValue();
  const image = await box.locator('.share-preview').evaluate((el) => {
    const canvas = el as HTMLCanvasElement;
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const colours = new Set<number>();
    for (let i = 0; i < pixels.length; i += 128) colours.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
    return { width: canvas.width, height: canvas.height, colours: colours.size, data: canvas.toDataURL() };
  });
  expect(image.width).toBeGreaterThan(0);
  expect(image.height).toBeGreaterThan(0);
  expect(image.colours).toBeGreaterThan(2);
  // The captured link/preview do not chase the simulation while the dialog is open.
  await page.evaluate(() => (window as any).fns.run('round 3'));
  await expect(box.locator('[data-share-value]')).toHaveValue(value);
  expect(await box.locator('.share-preview').evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL())).toBe(image.data);
  expect(await page.evaluate((url) => {
    const s = (window as any).fns.session();
    return s.constructor.load(new URL(url).hash).game.run.hash();
  }, value)).toBe(before);
  await box.locator('[data-share-copy]').click();
  await expect(box.locator('[data-share-copy]')).toHaveText('Copied ✓');
  await expect(box.locator('canvas.share-face')).toHaveCount(0);
  expect(await writes(page)).toEqual([value]);
  const support = box.locator('.share-support');
  await expect(support).toHaveText('Buy me a coffee');
  await expect(support).toHaveAttribute('href', 'https://ko-fi.com/P5P1S2R6S');
  await expect(support).toHaveAttribute('target', '_blank');
  await expect(support).toHaveAttribute('rel', /noopener/);
  await box.locator('[data-share-close]').click();
  await page.locator('#panel [data-control="share"]').click();
  await expect(box.locator('.share-support')).not.toBeVisible();
  await expect(box.locator('[data-share-copy]')).toHaveText('Copy');
});

test('Embed toggles live/frozen code without changing the shared economy or requiring another copy step', async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() => (window as any).fns.session().game.run.hash());
  await page.locator('#panel [data-control="embed"]').click();
  const box = dialog(page);
  await expect(box.locator('[data-share-mode="live"]')).toHaveAttribute('aria-pressed', 'true');
  const live = await iframeUrl(page, await box.locator('[data-share-value]').inputValue());
  const liveParams = new URLSearchParams(new URL(live).hash.slice(1));
  expect(liveParams.get('embed')).toBe('1');
  expect(liveParams.get('play')).toBe('auto');
  await box.locator('[data-share-copy]').click();
  await expect(box.locator('.share-support')).toBeVisible();
  await box.locator('[data-share-mode="frozen"]').click();
  await expect(box.locator('[data-share-mode="frozen"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(box.locator('.share-support')).not.toBeVisible();
  await expect(box.locator('[data-share-copy]')).toHaveText('Copy');
  const frozenCode = await box.locator('[data-share-value]').inputValue();
  const frozen = await iframeUrl(page, frozenCode);
  expect(new URLSearchParams(new URL(frozen).hash.slice(1)).has('play')).toBe(false);
  const loaded = await page.evaluate(({ live, frozen }) => {
    const s = (window as any).fns.session();
    const load = (url: string) => {
      const copy = s.constructor.load(new URL(url).hash);
      return { state: copy.game.run.hash(), playing: copy.playing };
    };
    return { live: load(live), frozen: load(frozen), original: s.game.run.hash(), playing: s.playing };
  }, { live, frozen });
  expect(loaded).toEqual({ live: { state: before, playing: true }, frozen: { state: before, playing: false }, original: before, playing: false });
  await box.locator('[data-share-copy]').click();
  await expect(box.locator('[data-share-copy]')).toHaveText('Copied ✓');
  expect((await writes(page)).at(-1)).toBe(frozenCode);
});

test('missing or denied clipboard never reveals support and a single retry can still copy', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }); });
  await page.locator('#panel [data-control="share"]').click();
  const box = dialog(page);
  await box.locator('[data-share-copy]').click();
  await expect(box.locator('.share-support')).not.toBeVisible();
  await expect(box.locator('[data-share-copy]')).toHaveText('Copy');
  await expect(box.locator('[data-share-value]')).toHaveAttribute('readonly', '');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } });
  });
  await box.locator('[data-share-copy]').click();
  await expect(box.locator('.share-support')).not.toBeVisible();
  await page.evaluate(() => { navigator.clipboard.writeText = async (text) => { (window as any).__writes.push(text); }; });
  await box.locator('[data-share-copy]').click();
  await expect(box.locator('[data-share-copy]')).toHaveText('Copied ✓');
  expect(await writes(page)).toHaveLength(1);
  await expect(box.locator('.share-support')).toBeVisible();
  await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('denied again')); });
  await box.locator('[data-share-copy]').click();
  await expect(box.locator('.share-support')).not.toBeVisible();
});

test('a slow copy never delays closing or reveals support in a later dialog', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { navigator.clipboard.writeText = () => new Promise<void>((resolve) => { (window as any).__finishCopy = resolve; }); });
  await page.locator('#panel [data-control="share"]').click();
  const box = dialog(page);
  await box.locator('[data-share-copy]').click();
  await expect(box.locator('.share-support')).not.toBeVisible();
  await box.locator('[data-share-close]').click();
  await expect(box).not.toBeVisible();
  await page.locator('#panel [data-control="embed"]').click();
  await page.evaluate(() => (window as any).__finishCopy());
  await expect(box.locator('.share-support')).not.toBeVisible();
  await expect(box.locator('[data-share-copy]')).toHaveText('Copy');
});

test('Learn keeps its beat and pace while dialog keys and scrolling belong to the dialog', async ({ page }) => {
  await open(page);
  await page.locator('#menu [data-go="story"]').click();
  await page.evaluate(() => {
    const story = (window as any).fns.story();
    story.enterAct(3);
    story.start(story.beats.findIndex((beat: any) => beat.key === 'open'));
    (window as any).fns.session().run('pause; fx off');
  });
  const share = page.locator('#panel [data-control="share"]');
  await expect(share).toBeEnabled();
  await share.click();
  const box = dialog(page);
  await box.locator('[data-share-value]').focus();
  const state = () => page.evaluate(() => {
    const fns = (window as any).fns;
    const session = fns.session();
    return { beat: fns.story()?.beat.key, speed: session.speed, rate: session.rate, playing: session.playing, console: document.getElementById('console')!.hidden };
  });
  const before = await state();
  expect(before.beat).toBe('open');
  for (const key of ['ArrowLeft', 'ArrowRight', '[', ']', '/', '`']) {
    await page.keyboard.press(key);
    expect(await state(), key).toEqual(before);
  }
  await box.locator('[data-share-value]').hover();
  await page.mouse.wheel(0, 600);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await state()).toEqual(before);
  await page.keyboard.press('Escape');
  await expect(box).not.toBeVisible();
  expect(await state()).toEqual(before);
});

test('a preview capture failure never holds up the dialog or copying', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, image: CanvasImageSource, ...args: number[]) {
      if (image instanceof HTMLCanvasElement && image.id === 'stage' && this.canvas.width <= 360) {
        (window as any).__previewFailures = ((window as any).__previewFailures ?? 0) + 1;
        throw new Error('preview unavailable');
      }
      Reflect.apply(drawImage, this, [image, ...args]);
    };
  });
  await page.locator('#panel [data-control="share"]').click();
  const box = dialog(page);
  await expect(box).toBeVisible();
  expect(await page.evaluate(() => (window as any).__previewFailures)).toBeGreaterThan(0);
  await expect(box.locator('.share-preview')).toHaveCount(0);
  await expect(box.locator('.share-support')).not.toBeVisible();
  const value = await box.locator('[data-share-value]').inputValue();
  await box.locator('[data-share-copy]').click();
  await expect(box.locator('[data-share-copy]')).toHaveText('Copied ✓');
  expect(await writes(page)).toEqual([value]);
  await expect(box.locator('.share-support')).toBeVisible();
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 700 }, { width: 320, height: 700 }]) {
  test(`dialog fits ${viewport.width}px, preserves game keys, and closes by click or Escape`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);
    const opener = page.locator('#panel [data-control="share"]');
    await opener.click();
    const box = dialog(page);
    const rect = await box.boundingBox();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.y).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewport.width);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(viewport.height);
    await expect(box.locator('[data-share-copy]')).toBeFocused();
    await expect(box.locator('canvas.share-face')).toHaveCount(0);
    await expect(box.locator('.share-support')).not.toBeVisible();
    await box.locator('[data-share-value]').focus();
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => (window as any).fns.session().playing)).toBe(false);
    await page.keyboard.press('Escape');
    await expect(box).not.toBeVisible();
    await expect(opener).toBeFocused();
    await opener.click();
    await page.mouse.click(2, 2);
    await expect(box).not.toBeVisible();
    expect(await writes(page)).toEqual([]);
    await opener.click();
    await box.locator('[data-share-copy]').click();
    const support = box.locator('.share-support');
    await expect(support).toHaveText('Buy me a coffee');
    await expect(support).toBeVisible();
    await expect(box.locator('canvas.share-face')).toHaveCount(0);
    const copied = await box.locator('[data-share-copy]').boundingBox();
    const coffee = await support.boundingBox();
    expect(coffee!.x).toBeGreaterThanOrEqual(copied!.x + copied!.width);
    expect(Math.abs(coffee!.y + coffee!.height / 2 - copied!.y - copied!.height / 2)).toBeLessThanOrEqual(1);
    expect(coffee!.x + coffee!.width).toBeLessThanOrEqual(viewport.width);
    expect(await box.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  });
}
