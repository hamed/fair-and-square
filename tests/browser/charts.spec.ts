import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1920, height: 1080 }, { width: 1440, height: 900 },
  { width: 1366, height: 768 }, { width: 1280, height: 720 }, { width: 390, height: 844 },
]) {
  test(`chart frames, stacked time plots and outside labels align (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/?opening=0');
    await page.waitForFunction(() => (window as any).fns);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const initialControls = await page.locator('.tile.controls').boundingBox();
    await page.evaluate(() => (window as any).fns.run('fx off; round 40; handoff gini; handoff lorenz; handoff ccdf'));
    for (const kind of ['gini', 'neff', 'lorenz', 'ccdf']) {
      await expect(page.locator(`.tile.${kind} .frame`)).toBeVisible();
    }
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const control = box('.tile.controls');
      const upper = box('.tile.gini .frame');
      const lower = box('.tile.neff .frame');
      const square = box('.tile.lorenz .frame');
      const stack = box('.time-stack');
      const frames = [...document.querySelectorAll('.tile.plot:not([hidden])')];
      const root = document.querySelector<HTMLElement>('.readerpanel')!;
      const side = document.querySelector<HTMLElement>('.side')!;
      const canvas = box('#stage');
      const floor = (window as any).fns.floor();
      return {
        widths: [upper.width, lower.width, square.width].map((width) => Math.abs(width - control.width)),
        squareHeight: Math.abs(square.height - control.height),
        top: Math.abs(upper.top - stack.top),
        bottom: Math.abs(lower.bottom - stack.bottom),
        stackHeight: Math.abs(stack.height - control.height),
        gap: lower.top - upper.bottom,
        upperYTicksInside: frames.every((tile) => {
          const frame = tile.querySelector('.frame')!.getBoundingClientRect();
          return [...tile.querySelectorAll<SVGTextElement>('.tick[transform]')].every((tick) => tick.getBoundingClientRect().top >= frame.top - 1);
        }),
        arbitraryBoundary: frames.some((tile) => [...tile.querySelectorAll('.tick')].some((tick) => tick.textContent === '6.25%')),
        overflow: Math.max(root.scrollHeight - root.clientHeight, side.scrollHeight - side.clientHeight),
        lastBottom: Math.max(...frames.map((tile) => tile.querySelector('.frame')!.getBoundingClientRect().bottom)),
        yardBottom: canvas.top + floor.bottom + 3,
      };
    });
    for (const difference of [...geometry.widths, geometry.squareHeight, geometry.top, geometry.bottom, geometry.stackHeight]) {
      expect(difference).toBeLessThan(1);
    }
    expect(geometry.gap).toBeGreaterThan(20);
    expect(geometry.upperYTicksInside).toBe(true);
    expect(geometry.arbitraryBoundary).toBe(false);
    const revealedControls = await page.locator('.tile.controls').boundingBox();
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(initialControls![key] - revealedControls![key])).toBeLessThan(1);
    }
    if (viewport.width >= 720) {
      expect(geometry.overflow).toBe(0);
      expect(geometry.lastBottom).toBeLessThanOrEqual(geometry.yardBottom + 1);
      expect(geometry.lastBottom).toBeLessThan(viewport.height);
    }
  });
}

test('the primary grid uses the panel width and returns to the same layout after resizing', async ({ page }) => {
  await page.setViewportSize({ width: 1812, height: 975 });
  await page.goto('/?opening=0');
  await page.waitForFunction(() => (window as any).fns);
  await page.evaluate(() => (window as any).fns.run('fx off; round 40; handoff gini; handoff lorenz; handoff ccdf'));
  await expect(page.locator('.tile.ccdf .frame')).toBeVisible();
  const measure = () => page.evaluate(() => {
    const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    const controls = box('.tile.controls');
    const bar = box('.transport');
    const root = document.querySelector<HTMLElement>('.readerpanel')!;
    const side = document.querySelector<HTMLElement>('.side')!;
    return {
      cols: getComputedStyle(root).getPropertyValue('--cols'),
      width: controls.width, height: controls.height,
      left: controls.left, top: controls.top,
      coverage: controls.width / bar.width,
      overflow: Math.max(root.scrollHeight - root.clientHeight, side.scrollHeight - side.clientHeight),
    };
  });
  await expect.poll(async () => (await measure()).cols).toBe('2');
  const before = await measure();
  for (const viewport of [{ width: 1605, height: 965 }, { width: 1440, height: 900 }, { width: 1812, height: 975 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => {
      const m = await measure();
      return m.cols === '2' && m.coverage > 0.35 && m.overflow === 0 && Math.abs(m.width - m.height) < 1;
    }).toBe(true);
  }
  await expect.poll(async () => Math.abs((await measure()).width - before.width)).toBeLessThan(1);
  await expect.poll(async () => Math.abs((await measure()).top - before.top)).toBeLessThan(1);
  await expect.poll(async () => Math.abs((await measure()).left - before.left)).toBeLessThan(1);
});

test('Learn keeps the Controls heading above the expanded blocks without enlarging it', async ({ page }) => {
  for (const viewport of [
    { width: 1920, height: 1080 }, { width: 1440, height: 900 },
    { width: 1280, height: 720 }, { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/?opening=0');
    await page.waitForFunction(() => (window as any).fns);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.control-title')).toBeVisible();
    const normalTitle = (await page.locator('.control-title .name').boundingBox())!;
    await page.locator('#menu [data-go="story"]').click();
    await page.evaluate(() => (window as any).fns.story().enterAct(3));
    for (const key of ['blocks', 'number']) {
      await page.evaluate((key) => {
        const r = (window as any).fns.story();
        r.start(r.beats.findIndex((b: { key: string }) => b.key === key));
      }, key);
      await expect(page.locator('.program .blocklyPath').first()).toBeVisible();
      await expect.poll(async () => {
        const title = (await page.locator('.control-title .name').boundingBox())!;
        const toolbar = (await page.locator('.transport').boundingBox())!;
        const controls = (await page.locator('.tile.controls').boundingBox())!;
        return title.height <= normalTitle.height + 1
          && title.y >= toolbar.y + toolbar.height + 4
          // SVG text bounds include the font's descender space below its baseline.
          && title.y + title.height <= controls.y + 5;
      }).toBe(true);
    }
  }
});
