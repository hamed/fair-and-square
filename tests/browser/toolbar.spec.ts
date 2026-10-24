import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`shared controls span the side panel in every mode (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('https://cloud.umami.is/**', (route) => route.abort());
    await page.route('https://static.cloudflareinsights.com/**', (route) => route.abort());
    await page.goto('/?opening=0');
    const toolbar = page.locator('#panel .transport');
    await expect(toolbar).toBeVisible();
    const ids = await toolbar.locator('[data-control]').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.control));
    for (const mode of ['play', 'story', 'rules']) {
      if (mode !== 'play') await page.locator(`#menu [data-go=${mode}]`).click();
      await expect(toolbar).toBeVisible();
      await expect(toolbar).toHaveAttribute('data-mode', mode === 'story' ? 'learn' : mode === 'rules' ? 'build' : 'play');
      expect(await toolbar.locator('[data-control]').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.control))).toEqual(ids);
      expect(await toolbar.locator('.slider, .numbers, .program, .model-actions').count()).toBe(0);
      const geometry = await toolbar.evaluate((el) => {
        const bar = el.getBoundingClientRect();
        const panel = el.parentElement!;
        const css = getComputedStyle(panel);
        const available = panel.clientWidth - parseFloat(css.paddingInlineStart) - parseFloat(css.paddingInlineEnd);
        return { width: bar.width, available, overflow: el.scrollWidth - el.clientWidth };
      });
      expect(Math.abs(geometry.width - geometry.available)).toBeLessThanOrEqual(2);
      expect(geometry.overflow).toBeLessThanOrEqual(0);
      await expect(toolbar.locator('[data-control=be]')).toHaveText('Be born');
      if (mode === 'story') await expect(toolbar.locator('.storyrow')).toBeVisible();
      else await expect(toolbar.locator('.storyrow')).toBeHidden();
      const label = await toolbar.locator('.current-model').evaluate((el) => ({
        bottom: el.getBoundingClientRect().bottom,
        top: el.parentElement!.getBoundingClientRect().top,
        font: getComputedStyle(el).fontFamily,
      }));
      expect(label.bottom).toBeLessThan(label.top);
      expect(label.font).toContain('Gelasio');
      // The wider chart gutters can wrap the bar; keep the sharing group together on either layout.
      const embed = await toolbar.locator('[data-control=embed]').boundingBox();
      const share = await toolbar.locator('[data-control=share]').boundingBox();
      expect(share!.y).toBe(embed!.y);
      expect(share!.x).toBeGreaterThan(embed!.x);
      if (mode === 'story') await expect(toolbar.locator('[data-control=play]')).toBeDisabled();
      else await expect(toolbar.locator('[data-control=play]')).toBeEnabled();
      if (mode === 'rules') {
        await expect(page.locator('#rules')).toBeVisible();
        await expect(toolbar.locator('.storynav .next')).toBeDisabled();
        await expect(toolbar.locator('[data-control=share]')).toBeEnabled();
      }
    }
    // Starting Learn again must restore its navigation after the disabled Build state.
    await page.locator('#menu [data-go=play]').click();
    await page.locator('#menu [data-go=story]').click();
    await expect(toolbar.locator('.storynav .act').first()).toBeEnabled();
    await expect(toolbar.locator('.storynav .next')).toBeEnabled({ timeout: 10000 });
  });
}
