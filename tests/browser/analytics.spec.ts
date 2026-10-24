import { expect, test, type Page } from '@playwright/test';
import { YARDS, shuffle } from '../../stage/story/yards.ts';
import { SEED } from '../../stage/story/beats.ts';

test.skip(({ browserName }) => browserName !== 'chromium', 'interaction coverage uses Chromium');

// No requests reach the real Umami service. Model its URL normalisation and automatic history pageviews too.
const tracker = `
window.__events = []; window.__pageviews = [];
const clean = () => window.fsUmamiBeforeSend('event', {url:location.href,referrer:document.referrer});
window.umami = {track(name,data){window.__events.push({name,data,...clean()});return Promise.resolve();}};
let last = clean().url; window.__pageviews.push(last);
for (const key of ['pushState','replaceState']) {
 const original = history[key].bind(history);
 history[key] = function(...args){original(...args); const url=clean().url;if(url!==last){last=url;window.__pageviews.push(url);}};
}
`;

test.beforeEach(async ({ context }) => {
  await context.route('https://cloud.umami.is/**', (route) => route.fulfill({ contentType: 'application/javascript', body: tracker }));
  await context.addInitScript(() => {
    (window as any).__writes = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (text: string) => { (window as any).__writes.push(text); },
    } });
  });
});

const events = (page: Page, name: string) => page.evaluate((name) => (window as any).__events.filter((e: any) => e.name === name), name);
async function open(page: Page, url = '/?opening=0') {
  await page.goto(url);
  await page.waitForFunction(() => (window as any).fns && (window as any).umami);
}
const menu = (page: Page, name: string) => page.locator(`#menu [data-go="${name}"]`).evaluate((el: HTMLElement) => el.click());
const state = (page: Page) => page.evaluate(() => {
  const s = (window as any).fns.session();
  return { hash: s.game.run.hash(), round: s.game.run.round, steps: s.game.run.steps, inputs: s.game.run.inputs.length };
});

test('campaign IDs follow engagement into About and Making Of, without escaping into outbound or share URLs', async ({ page, context }) => {
  const tags = 'utm_content=k7m2q9vd';
  await open(page, `/?opening=0&${tags}`);
  await page.locator('#panel [data-control="step"]').click();
  expect((await events(page, 'play_engaged'))[0].data.campaign_id).toBe('k7m2q9vd');
  const before = await state(page);
  await page.locator('#panel [data-control="share"]').click();
  await page.waitForFunction(() => (window as any).__writes.length === 1);
  const shared = await page.evaluate(() => (window as any).__writes[0].match(/https?:\/\/\S+$/)[0]);
  expect(new URL(shared).search).toBe('?fs_share=yard');
  expect(await state(page)).toEqual(before);
  expect((await events(page, 'share'))[0].data.campaign_id).toBe('k7m2q9vd');
  expect(await page.evaluate(() => (window as any).__pageviews)).toHaveLength(1);
  const popupPromise = context.waitForEvent('page');
  await page.locator('#menu [data-go="about"]').click();
  const about = await popupPromise;
  await about.waitForLoadState();
  expect(new URL(about.url()).searchParams.get('utm_content')).toBe('k7m2q9vd');
  await expect(about.locator('a[data-track-target="kofi"]')).toHaveAttribute('href', 'https://ko-fi.com/P5P1S2R6S');
  await about.locator('a[data-track-target="kofi"]').evaluate((a: HTMLElement) => {
    a.addEventListener('click', (e) => e.preventDefault()); a.click();
  });
  expect((await events(about, 'about_click'))[0].data).toMatchObject({ destination: 'kofi', campaign_id: 'k7m2q9vd' });
  await about.getByRole('link', { name: 'How Fair and Square was made →' }).click();
  await expect(about).toHaveURL(/making-of.html\?/);
  expect(new URL(about.url()).searchParams.get('utm_content')).toBe('k7m2q9vd');
  await about.getByRole('link', { name: 'About me', exact: true }).first().click();
  await expect(about).toHaveURL(/about.html\?/);
  await about.getByRole('link', { name: 'Back to the yard', exact: false }).click();
  await about.waitForFunction(() => (window as any).fns);
  expect(new URL(about.url()).searchParams.get('utm_content')).toBe('k7m2q9vd');
  // Back opens a fresh landing; unfold it before interacting with the simulation controls.
  await menu(about, 'play');
  await menu(about, 'play');
  await about.locator('#panel [data-control="step"]').click();
  expect((await events(about, 'play_engaged'))[0].data.campaign_id).toBe('k7m2q9vd');
  await about.close();
  await open(page, shared);
  expect((await events(page, 'shared_link_open'))[0].data).not.toHaveProperty('campaign_id');
});

async function yardQuestion(page: Page) {
  await menu(page, 'story');
  await page.evaluate(() => {
    const r = (window as any).fns.story();
    r.enterAct(3);
    r.start(r.beats.findIndex((b: any) => b.key === 'four'));
  });
  for (let guard = 0; guard < 15; guard++) {
    if (await page.evaluate(() => (window as any).fns.story().beat.key === 'which')) break;
    await page.evaluate(() => (window as any).fns.story().next());
    await page.waitForTimeout(40);
  }
  await expect(page.locator('#story .words')).toHaveText('Which yard would you live in?');
}

test('first landing choice and later navigation have distinct counts and control sources', async ({ page }) => {
  await open(page, '/?opening=7.5');
  await menu(page, 'rules');
  await page.waitForFunction(() => (window as any).fns.editor());
  await menu(page, 'play');
  await menu(page, 'story');
  expect((await events(page, 'entry_choice')).map((e: any) => e.data.destination)).toEqual(['build']);
  expect((await events(page, 'navigation')).slice(0, 2).map((e: any) => [e.data.destination, e.data.source])).toEqual([
    ['play', 'menu'], ['learn', 'menu'],
  ]);
  await menu(page, 'rules');
  // Stop navigation after the capture listener records it, without opening an external tab in this test.
  await page.locator('.library-note a').evaluate((a) => a.addEventListener('click', (e) => e.preventDefault()));
  await page.locator('.library-note a').click();
  await page.locator('#byline').evaluate((a: HTMLElement) => {
    a.addEventListener('click', (e) => e.preventDefault()); a.click();
  });
  expect((await events(page, 'navigation')).slice(-2).map((e: any) => [e.data.destination, e.data.source])).toEqual([
    ['about_socials', 'library_follow'], ['about', 'byline'],
  ]);
});

for (const route of ['keyboard', 'canvas', 'escape']) {
  test(`${route} entry into Play leaves later menu choices as navigation`, async ({ page }) => {
    await open(page, '/');
    await expect(page.locator('#menu [data-go="play"]')).toBeVisible();
    if (route === 'canvas') await page.locator('#stage').click({ position: { x: 10, y: 200 } });
    else await page.keyboard.press(route === 'keyboard' ? 'Space' : 'Escape');
    expect((await events(page, 'entry_choice')).map((e: any) => e.data.destination)).toEqual(['play']);
    await page.keyboard.press('Escape');
    await page.locator('#panel [data-control="step"]').click();
    await menu(page, 'story');
    expect(await events(page, 'entry_choice')).toHaveLength(1);
    expect((await events(page, 'navigation')).map((e: any) => [e.data.destination, e.data.source])).toEqual([['learn', 'menu']]);
  });
}

test('middle-clicks track internal and outbound links once, without counting other auxiliary buttons', async ({ page }) => {
  await page.goto('/about.html?utm_content=k7m2q9vd');
  const outbound = page.locator('a[data-track-target="kofi"]');
  const internal = page.getByRole('link', { name: 'How Fair and Square was made →' });
  await expect(outbound).toBeVisible();
  for (const link of [outbound, internal]) {
    // Keep the test on this page while exercising real middle-button activation.
    await link.evaluate((el) => {
      el.addEventListener('click', (event) => event.preventDefault());
      el.addEventListener('auxclick', (event) => event.preventDefault());
    });
    await link.click({ button: 'middle' });
    await link.dispatchEvent('auxclick', { button: 2 });
    await link.dispatchEvent('auxclick', { button: 0 });
  }
  expect((await events(page, 'about_click')).map((e: any) => e.data)).toEqual([
    { page: 'about', campaign_id: 'k7m2q9vd', destination: 'kofi', category: 'payment' },
  ]);
  expect((await events(page, 'navigation')).map((e: any) => e.data.destination)).toEqual(['making_of']);
  await outbound.click();
  expect(await events(page, 'about_click')).toHaveLength(2);
  await outbound.evaluate((el) => el.setAttribute('aria-disabled', 'true'));
  await outbound.dispatchEvent('auxclick', { button: 1 });
  expect(await events(page, 'about_click')).toHaveLength(2);
});

test('prediction choices distinguish revisions and assistance, with the displayed wealth shares', async ({ page }) => {
  await open(page);
  await menu(page, 'story');
  await page.evaluate(() => (window as any).fns.story().enterAct(1));
  await page.getByRole('button', { name: 'The one on the left gets much richer' }).click();
  await page.getByRole('button', { name: 'The one on the left gets much richer' }).click();
  await page.getByRole('button', { name: 'The one on the right gets much richer' }).click();
  let choices = await events(page, 'learn_choice');
  expect(choices.map((e: any) => [e.data.question, e.data.answer, e.data.attempt, e.data.method])).toEqual([
    ['prediction', 'left', 1, 'manual'], ['prediction', 'right', 2, 'manual'],
  ]);
  expect(choices[0].data.left_share + choices[0].data.right_share).toBeCloseTo(0.5);
  await page.evaluate(() => {
    const r = (window as any).fns.story();
    r.next(); r.back(); r.choose('right');
  });
  expect(await events(page, 'learn_choice')).toHaveLength(2);
  await page.evaluate(() => {
    const r = (window as any).fns.story();
    r.start(r.beats.findIndex((b: any) => b.key === 'guess')); r.showMe();
  });
  choices = await events(page, 'learn_choice');
  expect(choices[2].data).toMatchObject({ question: 'prediction', attempt: 1, method: 'assisted' });
  expect(await events(page, 'play_engaged')).toHaveLength(0);
});

for (const width of [1440, 390]) {
  test(`yard choice is manual, equally highlighted, and revisable (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await open(page);
    await yardQuestion(page);
    await page.evaluate(() => {
      const r = (window as any).fns.story();
      r.showMe(); r.next();
    });
    await expect(page.locator('.yards[data-phase="pick"] .quarter')).toHaveCount(3);
    await expect(page.locator('.storynav .showme')).toBeVisible();
    await expect(page.locator('.storynav .showme')).toBeDisabled();
    expect(await page.evaluate(() => (window as any).fns.story().beat.key)).toBe('which');
    expect(await events(page, 'learn_choice')).toHaveLength(0);
    const outlines = await page.locator('.yards .quarter').evaluateAll((els) => els.map((el) => {
      const s = getComputedStyle(el); return [s.outlineWidth, s.outlineStyle, s.outlineColor];
    }));
    expect(outlines[0][0]).toBe('2px');
    expect(outlines[0][1]).toBe('solid');
    expect(outlines[1]).toEqual(outlines[0]); expect(outlines[2]).toEqual(outlines[0]);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `test-results/yard-choice-${width}.png` });
    const quarters = page.locator('.yards .quarter');
    await quarters.nth(1).focus();
    expect(await quarters.nth(1).evaluate((el) => getComputedStyle(el).outlineWidth)).toBe('4px');
    await page.keyboard.press('Enter');
    const first = (await events(page, 'learn_choice'))[0].data;
    const rules = shuffle(YARDS, SEED)[1];
    expect(first).toMatchObject({ question: 'yard', answer: `stake_${rules.beta}_tax_${rules.tax}`,
      yard_id: `stake_${rules.beta}_tax_${rules.tax}`, stake: rules.beta, tax: rules.tax, position: 2,
      sim_stake: rules.beta, sim_tax: rules.tax, sim_n: 16, method: 'manual', attempt: 1 });
    await page.waitForFunction(() => (window as any).fns.story().beat.key === 'lottery');
    await page.evaluate(() => (window as any).fns.story().back());
    await expect(page.locator('.yards[data-phase="pick"] .quarter').first()).toBeVisible();
    await page.locator('.yards .quarter').nth(0).click();
    const choices = await events(page, 'learn_choice');
    expect(choices).toHaveLength(2);
    expect(choices[1].data).toMatchObject({ attempt: 2, position: 1, method: 'manual', stake: shuffle(YARDS, SEED)[0].beta });
    expect((await events(page, 'learn_choice_shown')).filter((e: any) => e.data.question === 'yard')).toHaveLength(1);
    expect((await events(page, 'learn_action')).filter((e: any) => e.data.action === 'help')).toHaveLength(0);
  });
}

test('About tracks each social, book, payment and research destination; prose pages retain pageviews', async ({ page }) => {
  await page.goto('/about.html');
  await page.waitForFunction(() => (window as any).umami);
  const targets = await page.locator('a[data-track-target]').evaluateAll((links) => {
    const seen = new Set<string>();
    return links.filter((a) => {
      const key = (a as HTMLElement).dataset.trackTarget!;
      if (seen.has(key)) return false; seen.add(key); return true;
    }).map((a) => ({ target: (a as HTMLElement).dataset.trackTarget!, href: (a as HTMLAnchorElement).href }));
  });
  for (const { target } of targets) {
    await page.locator(`a[data-track-target="${target}"]`).first().evaluate((a: HTMLElement) => {
      a.addEventListener('click', (e) => e.preventDefault()); a.click();
    });
  }
  const clicks = await events(page, 'about_click');
  for (const destination of ['x', 'linkedin', 'instagram', 'tiktok', 'youtube', 'github'])
    expect(clicks.find((e: any) => e.data.destination === destination)?.data.category).toBe('social');
  for (const destination of ['kofi', 'paypal'])
    expect(clicks.find((e: any) => e.data.destination === destination)?.data.category).toBe('payment');
  expect(clicks.find((e: any) => e.data.destination === 'amazon_books')?.data.category).toBe('books');
  expect(clicks.some((e: any) => e.data.category === 'research')).toBe(true);
  await page.locator('a[href="making-of.html"]').click();
  await expect(page).toHaveURL(/making-of.html$/);
  await page.waitForFunction(() => (window as any).__pageviews?.length);
  expect(await page.evaluate(() => (window as any).__pageviews)).toEqual(['/making-of.html']);
});

test('clipboard yard, square and embed shares preserve replay and do not add pageviews', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).fns.run('fx off; rule beta 0.3; rule tax 0.01; round 7'));
  const before = await state(page);
  await page.locator('#panel [data-control="share"]').click();
  await page.waitForFunction(() => (window as any).__writes.length === 1);
  const text = await page.evaluate(() => (window as any).__writes[0]);
  const url = new URL(text.match(/https?:\/\/\S+$/)![0]);
  expect(url.search).toBe('?fs_share=yard');
  expect(url.hash).toBe(new URL(page.url()).hash);
  expect(await state(page)).toEqual(before);
  expect(await page.evaluate(() => (window as any).__pageviews)).toEqual(['/?opening=0']);
  await page.locator('#panel [data-control="embed"]').click();
  await page.waitForFunction(() => (window as any).__writes.length === 2);
  const embed = await page.evaluate(() => (window as any).__writes[1]);
  expect(embed).toContain('?fs_share=embed#');
  expect(embed).toContain('&embed=1');
  await page.evaluate(() => { (window as any).fns.session().selected = 0; });
  await page.locator('#panel [data-control="card-share"]').click();
  await page.waitForFunction(() => (window as any).__writes.length === 3);
  const shares = await events(page, 'share');
  expect(shares.map((e: any) => [e.data.source, e.data.outcome])).toEqual([
    ['yard', 'attempt'], ['yard', 'copied'], ['embed', 'attempt'], ['embed', 'copied'], ['square', 'attempt'], ['square', 'copied'],
  ]);
  expect(shares[0].data).toMatchObject({ context: 'play', sim_stake: 0.3, sim_tax: 0.01, sim_round: 7 });
  for (const e of shares) {
    expect(e.url).toBe('/?opening=0');
    expect(Object.keys(e.data).length).toBeLessThanOrEqual(50);
    expect(JSON.stringify(e.data)).not.toMatch(/#|scripts|inputs|https:/);
  }
  // New and old untagged links replay exactly, while attribution is recorded once per document.
  for (const source of ['yard', 'unknown']) {
    await open(page, `${url.pathname}${source === 'yard' ? url.search : ''}${url.hash}`);
    expect(await state(page)).toEqual(before);
    expect((await events(page, 'shared_link_open')).map((e: any) => [e.data.source, e.data.status])).toEqual([[source, 'loaded']]);
    expect((await events(page, 'shared_link_open'))[0].data.sim_stake).toBe(0.3);
    expect(await page.evaluate(() => (window as any).__pageviews)).toEqual(['/']);
    await page.locator('#panel [data-control="share"]').click();
    expect(await events(page, 'shared_link_open')).toHaveLength(1);
  }
  const iframeUrl = embed.match(/src="([^"]+)"/)![1];
  await open(page, iframeUrl);
  await expect(page.locator('body')).toHaveClass(/embed/);
  expect((await events(page, 'shared_link_open'))[0].data).toMatchObject({ source: 'embed', status: 'loaded' });
  expect(await state(page)).toEqual(before);
});

test('share outcomes distinguish clipboard failure and native handoff, cancellation and failure', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('denied')); });
  await page.locator('#panel [data-control="share"]').click();
  await expect.poll(async () => (await events(page, 'share')).length).toBe(2);
  expect((await events(page, 'share'))[1].data).toMatchObject({ method: 'clipboard', outcome: 'failed' });
  for (const result of ['handed_off', 'cancelled', 'failed']) {
    await page.evaluate((result) => {
      const media = window.matchMedia.bind(window);
      window.matchMedia = (query) => query === '(pointer: coarse)' ? { matches: true } as MediaQueryList : media(query);
      navigator.share = async () => {
        if (result === 'cancelled') throw new DOMException('cancelled', 'AbortError');
        if (result === 'failed') throw new Error('failed');
      };
    }, result);
    await page.locator('#panel [data-control="share"]').click();
    await expect.poll(async () => (await events(page, 'share')).at(-1).data.outcome).toBe(result);
    expect((await events(page, 'share')).at(-1).data.method).toBe('native');
  }
});

test('invalid incoming links omit simulation summaries and do not fragment page URLs', async ({ page }) => {
  await open(page, '/?fs_share=square#n=not-a-number');
  const incoming = await events(page, 'shared_link_open');
  expect(incoming).toHaveLength(1);
  expect(incoming[0].data).toEqual({ page: 'main', source: 'square', status: 'invalid' });
  expect(incoming[0].url).toBe('/');
  expect(await events(page, 'play_engaged')).toHaveLength(0);
});

test('Play engagement and valid manual Build edits count once, excluding scripts and Library loads', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).fns.run('fx off; round 4'));
  expect(await events(page, 'play_engaged')).toHaveLength(0);
  await page.locator('#panel [data-control="step"]').click();
  await page.locator('#panel [data-control="restart"]').click();
  expect(await events(page, 'play_engaged')).toHaveLength(1);
  await menu(page, 'rules');
  await page.waitForFunction(() => (window as any).fns.editor());
  await page.waitForTimeout(400);
  expect(await events(page, 'build_edited')).toHaveLength(0);
  await page.evaluate(() => {
    const ws = (window as any).fns.editor().workspace;
    const invalid = ws.newBlock('val.prop');
    invalid.setFieldValue('winner', 'who'); invalid.initSvg(); invalid.render();
    ws.getAllBlocks(false).find((b: any) => b.type === 'tax.take').getInput('tau').connection.connect(invalid.outputConnection);
  });
  await expect(page.locator('#rules .status')).toContainText('to fix');
  expect(await events(page, 'build_edited')).toHaveLength(0);
  await page.selectOption('#rules select', 'wealth-tax');
  await page.waitForTimeout(500);
  expect((await events(page, 'model_selected'))[0].data.model).toBe('wealth-tax');
  expect(await events(page, 'build_edited')).toHaveLength(0);
  for (const n of [40, 50]) {
    await page.evaluate((n) => {
      const ws = (window as any).fns.editor().workspace;
      ws.getAllBlocks(false).find((b: any) => b.type === 'setup.yard').getInputTargetBlock('n').setFieldValue(n, 'v');
    }, n);
    await page.waitForTimeout(500);
  }
  expect(await events(page, 'build_edited')).toHaveLength(1);
});

test('Library selection during editor loading and shared-model restoration are not manual edits', async ({ page }) => {
  await page.route('**/blocks/editor.ts**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue();
  });
  await open(page);
  await menu(page, 'rules');
  await expect(page.locator('#rules .status')).toContainText('loading');
  await page.selectOption('#rules select', 'wealth-tax');
  await page.waitForFunction(() => (window as any).fns.session().game.n === 100);
  expect(await events(page, 'build_edited')).toHaveLength(0);
  expect(await events(page, 'model_selected')).toHaveLength(1);
  const hash = await page.evaluate(() => (window as any).fns.session().share());
  await open(page, `/?fs_share=yard${hash}`);
  await menu(page, 'rules');
  await page.waitForFunction(() => (window as any).fns.editor());
  await page.waitForTimeout(500);
  expect(await events(page, 'build_edited')).toHaveLength(0);
  expect(await events(page, 'model_selected')).toHaveLength(0);
  expect((await events(page, 'shared_link_open'))[0].data.sim_model).toBe('wealth-tax');
});

test('yard identity follows its rules across shuffled positions, and its widget ignores assistance', async ({ page }) => {
  await open(page);
  const picked = await page.evaluate(async () => {
    const { YardsWidget } = await import('/stage/story/yards.ts' as string);
    const results: any[] = [];
    for (const seed of [1, 2, 5, 7]) {
      for (let position = 1; position <= 3; position++) {
        const widget = new YardsWidget(() => null, seed);
        const session = (window as any).fns.session();
        widget.mount({ session: () => session, setSession() {}, emit: (e: any) => results.push({ seed, position, ...e.analytics }) }, { phase: 'pick' });
        const count = results.length;
        widget.config({ phase: 'pick', showMe: true });
        if (results.length !== count) throw new Error('yard chosen by assistance');
        (document.querySelectorAll('.yards .quarter')[position - 1] as HTMLElement).click();
        widget.cleanup();
      }
    }
    return results;
  });
  expect(picked).toHaveLength(12);
  for (const result of picked) {
    const rule = shuffle(YARDS, result.seed)[result.position - 1];
    expect(result).toMatchObject({ yard_id: `stake_${rule.beta}_tax_${rule.tax}`, stake: rule.beta, tax: rule.tax,
      sim_stake: rule.beta, sim_tax: rule.tax, sim_n: 16, sim_neff: 16, sim_gini: 0 });
  }
});

test.describe('touch selection', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('a yard can be chosen by tapping', async ({ page }) => {
    await open(page);
    await yardQuestion(page);
    await page.locator('.yards .quarter').nth(2).tap();
    expect((await events(page, 'learn_choice'))[0].data).toMatchObject({ position: 3, method: 'manual', attempt: 1 });
  });
});

test('missing or late analytics never blocks use and buffered events are sent after script loading', async ({ page, context }) => {
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  await context.route('https://cloud.umami.is/**', async (route) => {
    await delayed;
    await route.fulfill({ contentType: 'application/javascript', body: tracker });
  });
  await page.goto('/?opening=0', { waitUntil: 'commit' });
  await page.waitForFunction(() => (window as any).fns);
  await menu(page, 'story');
  await page.evaluate(() => { const r = (window as any).fns.story(); r.enterAct(1); r.choose('left'); });
  expect(await page.evaluate(() => typeof (window as any).umami)).toBe('undefined');
  release();
  await page.waitForFunction(() => (window as any).__events?.some((e: any) => e.name === 'learn_choice'));
  expect((await events(page, 'learn_choice'))[0].data.answer).toBe('left');
  await context.route('https://cloud.umami.is/**', (route) => route.abort());
  await page.goto('/?opening=0');
  await page.waitForFunction(() => (window as any).fns);
  await page.locator('#panel [data-control="step"]').click();
  expect((await state(page)).round).toBe(1);
});
