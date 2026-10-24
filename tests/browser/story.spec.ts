/**
 * The Story in Chromium: a reader with a keyboard alone gets through Act 1 (into the Story by its tab, Space to go
 * on, the stake slider by its arrows, Enter from the slider); and the guess and the line, which a pointer does on
 * the yard, have controls in the strip.
 */
import { chromium, expect, test, type Page } from '@playwright/test';

test.skip(({ browserName }) => browserName !== 'chromium', 'reader behaviour: one browser is enough');

const beat = (page: Page) => page.evaluate(() => (window as any).fns.story()?.beat?.key ?? null);
const ready = (page: Page) => page.waitForFunction(() => !(window as any).fns.story().playing, undefined, { timeout: 30_000 });

test('Act 1 by keyboard alone', async ({ page }) => {
  await page.goto('/?opening=0');
  await page.waitForFunction(() => (window as any).fns);
  // Tab to the Story tab (a control over the drawn one), Enter
  for (let k = 0; k < 8; k++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => (document.activeElement as HTMLElement)?.dataset.go === 'story')) break;
  }
  await page.keyboard.press('Enter');
  expect(await beat(page)).toBe('yard');
  // focus goes to Next (once the panel holding it shows)
  await page.waitForFunction(() => (document.activeElement?.className ?? '').includes('next'));
  for (let guard = 0; guard < 60 && (await beat(page)) !== 'slider'; guard++) {
    await ready(page);
    await page.keyboard.press('Space');
  }
  // the stake's slider, in the panel as in Play: the keyboard is on it (moved there a frame on); moved, it goes on
  // by itself once it rests (owner, 2026-10-22)
  expect(await beat(page)).toBe('slider');
  await page.waitForFunction(() => (document.activeElement as HTMLInputElement).type === 'range');
  const beta = () => page.evaluate(() => (window as any).fns.session().game.rules.beta);
  for (let k = 0; k < 5; k++) await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => (window as any).fns.story().beat?.key === 'try');
  // tried already (off the mark), then back down to the mark at 10%: it snaps there, rests, and goes on
  await page.waitForFunction(() => (document.activeElement as HTMLInputElement).type === 'range');
  for (let k = 0; k < 120 && (await beta()) !== 0.1; k++) await page.keyboard.press('ArrowLeft');
  expect(await beta()).toBe(0.1);
  await page.waitForFunction(() => (window as any).fns.story().beat?.key !== 'try');
  for (let guard = 0; guard < 30 && (await beat(page)) !== 'trade'; guard++) {
    await ready(page);
    await page.keyboard.press('Space');
  }
  expect(await beat(page)).toBe('trade');
  // one duel between the two players (noted in the run's log; their money shared out first is gifts), the other two watching
  expect(await page.evaluate(() => (window as any).fns.session().duels)).toBe(1);
  // an announcement for screen readers, once per beat
  expect(await page.locator('#story [aria-live]').textContent()).toContain('That was one trade.');
});

test('every action on the yard has a control in the strip: the guess, the line', async ({ page }) => {
  await page.goto('/?opening=0');
  await page.waitForFunction(() => (window as any).fns);
  await page.evaluate(() => (document.querySelector('#menu [data-go="story"]') as HTMLElement).click());
  await page.evaluate(() => (window as any).fns.story().enterAct(1));
  await page.getByRole('button', { name: 'The one on the left gets much richer' }).click();
  await expect(page.getByRole('button', { name: 'The one on the left gets much richer' })).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => (window as any).fns.story().enterAct(2));
  for (let guard = 0; guard < 10 && (await beat(page)) !== 'line'; guard++) {
    await page.evaluate(() => (window as any).fns.story().next());
    await ready(page);
  }
  expect(await beat(page)).toBe('line');
  const line = page.getByRole('slider', { name: 'The line' });
  await line.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => (window as any).fns.story().done);
});

// REVIEW-2026-10-20-FULL, finding 2: arrows in the Story's own blocks are the blocks', not the story's
test('the Story’s blocks keep their keys; a number changed there moves the yard', async ({ page }) => {
  await page.goto('/?opening=0');
  await page.waitForFunction(() => (window as any).fns);
  await page.evaluate(() => (document.querySelector('#menu [data-go="story"]') as HTMLElement).click());
  await page.evaluate(() => (window as any).fns.story().enterAct(3));
  for (let guard = 0; guard < 60 && (await beat(page)) !== 'number'; guard++) {
    await page.evaluate(() => {
      const r = (window as any).fns.story();
      if (r.beat?.wait?.kind === 'pick') (document.querySelector('.yards .quarter') as HTMLElement).click();
      else if (!r.playing && !r.done) r.showMe();
      else r.next();
    });
    await ready(page);
  }
  expect(await beat(page)).toBe('number');
  const block = page.locator('.program .blocklyPath').first();
  await block.waitFor();
  await block.click({ force: true });
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowLeft']) await page.keyboard.press(key);
  await page.waitForTimeout(200);
  expect(await beat(page)).toBe('number');
  // a number in the blocks: typed, it moves its slider, and the beat is met
  const field = page.locator('.program .blocklyEditableField').first();
  await field.click({ force: true });
  const input = page.locator('.blocklyWidgetDiv input');
  await input.waitFor();
  await input.fill('20');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as any).fns.story().done, undefined, { timeout: 5_000 });
  expect(await beat(page)).toBe('number');
});

// owner, 2026-10-21: in Learn, scrolling and tapping move the story too
test('Learn moves on with a scroll or a tap on the yard, and back with a scroll up', async ({ page }) => {
  await page.goto('/?opening=0');
  await page.waitForFunction(() => (window as any).fns);
  await page.evaluate(() => (document.querySelector('#menu [data-go="story"]') as HTMLElement).click());
  const at = () => page.evaluate(() => (window as any).fns.story().at as number);
  const yard = await page.locator('#stage').boundingBox();
  await page.mouse.move(yard!.x + yard!.width / 2, yard!.y + yard!.height * 0.8);
  await ready(page);
  await page.waitForFunction(() => (window as any).fns.story().done);
  await page.mouse.wheel(0, 200);
  await page.waitForFunction(() => (window as any).fns.story().at === 1);
  await ready(page);
  await page.waitForTimeout(800);
  await page.mouse.wheel(0, -200);
  await page.waitForFunction(() => (window as any).fns.story().at === 0);
  await ready(page);
  await page.waitForFunction(() => (window as any).fns.story().done);
  await page.mouse.click(yard!.x + yard!.width / 2, yard!.y + yard!.height * 0.8);
  await page.waitForFunction(() => (window as any).fns.story().at === 1);
  expect(await at()).toBe(1);
});

// owner, 2026-10-21: "the block sidebar oscillates badly: the right side and the Next button vibrate". It takes
// real scrollbars (headless hides them): one comes and goes, and the blocks refit to each width in turn
test('the blocks square holds still: Next and the blocks do not move', async ({ baseURL }) => {
  const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  for (const [width, height] of [
    [1366, 768],
    [1600, 900],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(`${baseURL}/?opening=0`);
    await page.waitForFunction(() => (window as any).fns);
    await page.evaluate(() => (document.querySelector('#menu [data-go="story"]') as HTMLElement).click());
    await page.evaluate(() => (window as any).fns.story().enterAct(3));
    for (let guard = 0; guard < 60 && (await beat(page)) !== 'number'; guard++) {
      await page.evaluate(() => {
        const r = (window as any).fns.story();
        if (r.beat?.wait?.kind === 'pick') (document.querySelector('.yards .quarter') as HTMLElement).click();
        else if (!r.playing && !r.done) r.showMe();
        else r.next();
      });
      await ready(page);
    }
    expect(await beat(page)).toBe('number');
    await page.locator('.program .blocklyPath').first().waitFor();
    await page.waitForTimeout(800);
    const boxes: string[] = await page.evaluate(
      () =>
        new Promise((done) => {
          const seen: string[] = [];
          const look = () => {
            const next = document.querySelector('.storynav .next')!.getBoundingClientRect();
            const host = document.querySelector('.program')!.getBoundingClientRect();
            seen.push([next.x, host.width, host.height].map((v) => v.toFixed(1)).join(' '));
            if (seen.length < 60) requestAnimationFrame(look);
            else done(seen);
          };
          requestAnimationFrame(look);
        }),
    );
    expect(new Set(boxes).size, `${width}×${height}: ${[...new Set(boxes)].join(' | ')}`).toBe(1);
    await page.close();
  }
  await browser.close();
});

// owner, 2026-10-21: "the yard scale must not change in different tabs. that is the most important thing we have"
for (const [width, height] of [
  [1440, 900],
  [390, 844],
]) {
  test(`the yard is the same size in Play, Learn and Build (${width}×${height})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/?opening=0');
    await page.waitForFunction(() => (window as any).fns);
    const floor = async () => {
      await page.waitForTimeout(700);
      return page.evaluate(() => {
        const f = (window as any).fns.floor();
        return [f.left, f.top, f.right, f.bottom].map((v: number) => Math.round(v)).join(' ');
      });
    };
    const play = await floor();
    await page.evaluate(() => (document.querySelector('#menu [data-go="story"]') as HTMLElement).click());
    const learn = await floor();
    await page.evaluate(() => (document.querySelector('#menu [data-go="rules"]') as HTMLElement).click());
    await page.waitForFunction(() => !document.querySelector('#rules')!.hasAttribute('hidden'));
    const build = await floor();
    expect([learn, build]).toEqual([play, play]);
  });
}

// owner, 2026-10-22: About as before, the about page in a new window
test('About opens the about page in a new window; the stage stays as it was', async ({ page, context }) => {
  await page.goto('/?opening=0');
  await page.waitForFunction(() => (window as any).fns);
  const n = await page.evaluate(() => (window as any).fns.session().game.n);
  const [about] = await Promise.all([context.waitForEvent('page'), page.click('#menu [data-go="about"]')]);
  await about.waitForLoadState();
  expect(about.url()).toMatch(/about\.html$/);
  expect(await page.evaluate(() => (window as any).fns.session().game.n)).toBe(n);
});

// owner, 2026-10-22: in the three yards, a click on one shows its numbers and charts in the panel
test('three yards: a yard clicked shows its numbers and charts; clicked again, the page’s own', async ({ page }) => {
  await page.goto('/?opening=0');
  await page.waitForFunction(() => (window as any).fns);
  await page.evaluate(() => (document.querySelector('#menu [data-go="story"]') as HTMLElement).click());
  await page.evaluate(() => (window as any).fns.story().enterAct(3));
  for (let g = 0; g < 80 && (await beat(page)) !== 'four'; g++) {
    await ready(page);
    await page.evaluate(() => {
      const r = (window as any).fns.story();
      if (!r.done) r.showMe();
      else r.next();
    });
  }
  expect(await beat(page)).toBe('four');
  await page.waitForTimeout(800);
  await page.locator('.yards .quarter').nth(1).click();
  await expect(page.locator('#panel .note')).toBeVisible();
  await expect(page.locator('#panel .note')).toContainText('Yard 2');
  await expect(page.locator('#panel .tile.plot.lorenz')).toBeVisible();
  await page.locator('.yards .quarter').nth(1).click();
  await expect(page.locator('#panel .note')).toBeHidden();
});

// owner, 2026-10-22: the yard changed size while partners met and tossed
test('the yard keeps its size while partners meet and toss, a hundred of them', async ({ page }) => {
  await page.goto('/?opening=0');
  await page.waitForFunction(() => (window as any).fns);
  const floor = () => page.evaluate(() => {
    const f = (window as any).fns.floor();
    return [f.left, f.top, f.right, f.bottom].map((v: number) => Math.round(v)).join(' ');
  });
  const start = await floor();
  await page.evaluate(() => (window as any).fns.run('n 100; fx trade toss; play'));
  const seen = new Set<string>();
  for (let k = 0; k < 40; k++) {
    seen.add(await floor());
    await page.waitForTimeout(200);
  }
  expect([...seen]).toEqual([start]);
});

// owner, 2026-10-22: the panel's squares line up with the yard from top to bottom; the controls fit their square
for (const [width, height] of [
  [1440, 900],
  [1366, 768],
  [1280, 720],
]) {
  test(`the visible panel squares fit beside the yard, the controls whole in theirs (${width}×${height})`, async ({ baseURL }) => {
    const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(`${baseURL}/?opening=0`);
    await page.waitForFunction(() => (window as any).fns);
    await page.waitForTimeout(1000);
    const m = await page.evaluate(() => {
      const c = document.querySelector('#stage')!.getBoundingClientRect();
      const f = (window as any).fns.floor();
      const tiles = [...document.querySelectorAll<HTMLElement>('#panel .tile')].filter((t) => !t.hidden).map((t) => t.getBoundingClientRect());
      const controls = document.querySelector<HTMLElement>('#panel .tile.controls')!;
      return {
        top: [c.top + f.top - 3, Math.min(...tiles.map((r) => r.top))],
        bottom: [c.top + f.bottom + 3, Math.max(...tiles.map((r) => r.bottom))],
        overflow: controls.scrollHeight - controls.clientHeight,
      };
    });
    expect(Math.abs(m.top[0] - m.top[1])).toBeLessThanOrEqual(1);
    expect(m.bottom[1]).toBeLessThanOrEqual(m.bottom[0] + 1);
    expect(m.overflow).toBeLessThanOrEqual(0);
    await browser.close();
  });
}

// owner, 2026-10-22: the charts as the essay's sandbox has them
test('charts: hover shows an insight, an axis click toggles log, a double-click fills the window and Escape gives it back', async ({ page }) => {
  await page.goto('/?opening=0');
  await page.waitForFunction(() => (window as any).fns);
  await page.evaluate(() => (window as any).fns.run('fx off; round 40; handoff lorenz; wait 2; handoff ccdf'));
  await page.waitForTimeout(600);
  const lorenz = page.locator('#panel .tile.lorenz .chart');
  const box = (await lorenz.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#panel .tile.lorenz .insight.on text')).toContainText('poorest half holds');
  // the CCDF's people axis: linear, then log
  const label = page.locator('#panel .tile.ccdf .chart .label').first();
  await expect(label).not.toContainText('(log)');
  await page.locator('#panel .tile.ccdf .chart .hit').first().click();
  await expect(label).toContainText('(log)');
  // bigger, and back
  const ccdf = page.locator('#panel .tile.ccdf');
  await ccdf.dblclick();
  await expect(ccdf).toHaveClass(/zoomed/);
  await page.keyboard.press('Escape');
  await expect(ccdf).not.toHaveClass(/zoomed/);
});
