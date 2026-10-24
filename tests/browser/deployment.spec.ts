import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route('https://cloud.umami.is/**', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.__events=[];window.umami={track(name,data){window.__events.push({name,data});return Promise.resolve();}};',
  }));
  await context.route('https://static.cloudflareinsights.com/**', (route) => route.abort());
  await context.addInitScript(() => {
    (window as any).__writes = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (text: string) => { (window as any).__writes.push(text); },
    } });
  });
});

test('built pages keep links, assets, anchors and campaign tags inside the deployment directory', async ({ page, baseURL }) => {
  const root = new URL(baseURL!);
  const pages = new Set(['', 'index.html', 'about.html', 'making-of.html'].map((file) => new URL(file, root).pathname));
  const local = new Set<string>();
  const missing: string[] = [];
  page.on('response', (response) => {
    if (response.url().startsWith(root.origin) && response.status() >= 400) missing.push(response.url());
  });
  for (const file of ['', 'index.html', 'about.html', 'making-of.html']) {
    await page.goto(new URL(`${file}?opening=0&utm_content=k7m2q9vd`, root).href);
    await expect(page.locator('a[data-track-nav]').first()).toBeAttached();
    const links = await page.locator('a[href], script[src], link[href], img[src], source[src], video[poster]').evaluateAll((els) =>
      els.map((el) => ({ tag: el.tagName, href: new URL(el.getAttribute('href') ?? el.getAttribute('src') ?? el.getAttribute('poster')!, location.href).href })),
    );
    for (const { tag, href } of links) {
      const url = new URL(href);
      if (url.origin !== root.origin) {
        if (tag === 'A') {
          expect(url.protocol).toBe('https:');
          expect(url.searchParams.has('utm_content')).toBe(false);
        }
        continue;
      }
      expect(url.pathname, href).toMatch(/^\/fair-and-square\//);
      // Full-size artifact links are assets, not page visits; campaign tags stay on the three pages.
      if (tag === 'A') expect(url.searchParams.get('utm_content'), href).toBe(pages.has(url.pathname) ? 'k7m2q9vd' : null);
      local.add(href);
    }
  }
  for (const href of local) {
    const url = new URL(href);
    const hash = url.hash;
    url.hash = '';
    const response = await page.request.get(url.href);
    expect(response.ok(), href).toBe(true);
    if (hash) {
      const html = await response.text();
      const found = await page.evaluate(({ html, hash }) =>
        !!new DOMParser().parseFromString(html, 'text/html').getElementById(decodeURIComponent(hash.slice(1))), { html, hash });
      expect(found, href).toBe(true);
    }
  }
  expect(missing).toEqual([]);
});

const state = (page: Page) => page.evaluate(() => {
  const run = (window as any).fns.session().game.run;
  return { hash: run.hash(), round: run.round, steps: run.steps, inputs: run.inputs.length };
});

for (const file of ['', 'index.html']) {
  test(`absolute share and embed URLs replay under the deployment directory (${file || 'directory index'})`, async ({ page, baseURL }) => {
    const entry = new URL(`${file}?opening=0&utm_content=k7m2q9vd`, baseURL);
    await page.goto(entry.href);
    await page.waitForFunction(() => (window as any).fns);
    await page.evaluate(() => (window as any).fns.run('fx off; round 3'));
    const before = await state(page);
    await page.locator('#panel [data-control="share"]').click();
    await page.locator('#panel [data-control="embed"]').click();
    const [shared, embed] = await page.evaluate(() => (window as any).__writes as string[]);
    const yard = new URL(shared.match(/https?:\/\/\S+$/)![0]);
    const frame = new URL(embed.match(/src="([^"]+)"/)![1]);
    for (const [url, source] of [[yard, 'yard'], [frame, 'embed']] as const) {
      expect(url.origin).toBe(entry.origin);
      expect(url.pathname).toBe(entry.pathname);
      expect(url.search).toBe(`?fs_share=${source}`);
      await page.goto(url.href);
      await page.waitForFunction(() => (window as any).fns && (window as any).__events?.length);
      expect(await state(page)).toEqual(before);
      expect(await page.evaluate(() => (window as any).__events.find((e: any) => e.name === 'shared_link_open').data))
        .toMatchObject({ source, status: 'loaded' });
      if (source === 'embed') await expect(page.locator('body')).toHaveClass(/embed/);
    }
  });
}
