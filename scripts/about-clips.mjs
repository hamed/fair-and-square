// The about page's clips, recorded from the stage itself without its words (the page says them, so they translate):
// Learn's own acts, cut into loops (the coin, the bars, the box, the stairs, the tax), and the opening's logo, holding
// alive and unfolding into the yard.
// Run with the dev server on 5199:  node scripts/about-clips.mjs [name …]   (needs ffmpeg) → public/about/*.mp4|webm|jpg
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const STAGE = process.env.STAGE ?? 'http://localhost:5199/';
const OUT = new URL('../public/about/', import.meta.url).pathname;
/**
 * Learn's clips: the act, the first beat, the last (the clip ends once that beat is done, and a breath after), and the
 * band of the yard's height it shows ([top, height]; 3:2 by default, the page letterboxes others in the floor's colour).
 */
const LEARN = [
  // also recorded once (60e4250), not on the page now: { name: 'coin', act: 0, from: 'table', to: 'trade', band: [0.08, 0.84] },
  // { name: 'tax', act: 3, from: 'pay', to: 'back', band: [0.06, 0.88] }
  // the bars start spread over the room: a taller band
  { name: 'bars', act: 2, from: 'bars', to: 'few', band: [0.11, 0.85] },
  { name: 'box', act: 2, from: 'side', to: 'neff' },
  { name: 'stairs', act: 2, from: 'lineup', to: 'gini' },
];
/** The opening's: the logo holding, alive, for `hold` seconds; then the same logo unfolding into the yard. */
const OPENING = [
  // not on the page now (owner, 2026-10-22); kept here to record again: { name: 'logo', hold: 9 },
  // { name: 'unfold', hold: 1.5, unfold: true },
];
const SIDE = 600;
const HOLD = 0.9;
const VIEW = { width: 1100, height: 760 };
const only = new Set(process.argv.slice(2));
const wanted = (name) => !only.size || only.has(name);

mkdirSync(OUT, { recursive: true });
const frames = mkdtempSync(join(tmpdir(), 'about-clips-'));
const browser = await chromium.launch();

/** Every frame the browser paints on `page`, with its time, while `run` goes; then the frames and what `run` gave. */
async function record(page, run) {
  const cdp = await page.context().newCDPSession(page);
  const shots = [];
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const file = join(frames, `${String(record.n++).padStart(6, '0')}.jpg`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    shots.push({ file, t: metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1, maxWidth: 2200, maxHeight: 1520 });
  const out = await run();
  await cdp.send('Page.stopScreencast');
  return { shots, out };
}
record.n = 0;

/** One clip from `shots` between times a and b, cropped to `box` (CSS px), as mp4, webm and its last frame. */
function encode(name, shots, [a, b], box) {
  const own = shots.filter((s) => s.t >= a && s.t <= b);
  if (own.length < 2) throw new Error(`${name}: ${own.length} frames`);
  const width = Number(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width', '-of', 'csv=p=0', own[0].file]).toString().trim());
  const dpr = width / VIEW.width;
  const list = own.map((s, k) => `file '${s.file}'\nduration ${((own[k + 1]?.t ?? b) - s.t).toFixed(4)}`).join('\n');
  const concat = join(frames, `${name}.txt`);
  writeFileSync(concat, `ffconcat version 1.0\n${list}\nfile '${own[own.length - 1].file}'\n`);
  const crop = `crop=${Math.round(box.w * dpr)}:${Math.round(box.h * dpr)}:${Math.round(box.x * dpr)}:${Math.round(box.y * dpr)}`;
  const vf = `${crop},scale=${SIDE}:-2:flags=lanczos,fps=30,format=yuv420p`;
  const run = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', concat, '-vf', vf, '-an', ...args]);
  run(['-c:v', 'libx264', '-crf', '24', '-preset', 'slow', '-movflags', '+faststart', join(OUT, `${name}.mp4`)]);
  run(['-c:v', 'libvpx-vp9', '-crf', '36', '-b:v', '0', join(OUT, `${name}.webm`)]);
  // the still, for reduced motion and before it plays: the clip's last frame
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', own[own.length - 1].file, '-vf', `${crop},scale=${SIDE}:-2:flags=lanczos`, '-q:v', '4', join(OUT, `${name}.jpg`)]);
  console.log(`${name}: ${own.length} frames, ${(b - a).toFixed(1)} s`);
}

// ——— Learn's acts
const learn = LEARN.filter((c) => wanted(c.name));
if (learn.length) {
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2 });
  await page.goto(`${STAGE}?opening=0`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.click('#menu [data-go="story"]').catch(() => page.click('text=Learn'));
  await page.waitForTimeout(800);
  await page.addStyleTag({ content: '.strip .words, .strip .choices { visibility: hidden !important; }' });
  const yard = await page.evaluate(() => {
    const c = document.querySelector('canvas').getBoundingClientRect();
    const f = window.fns.floor();
    return { x: c.left + f.left, y: c.top + f.top, w: f.right - f.left, h: f.bottom - f.top };
  });
  // Next, as a reader would press it: once a beat is done, after a breath; a beat that asks, done for them
  const { shots, out } = await record(page, () =>
    page.evaluate(
      async ({ clips, hold }) => {
        const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const now = () => Date.now() / 1000;
        const marks = {};
        let act = -1;
        let r = null;
        const until = async (key) => {
          for (let k = 0; k < 3000 && r.beat?.key !== key; k++) {
            if (r.ready) {
              await sleep(hold * 1000);
              r.next();
              await sleep(60);
            } else {
              if (r.beat?.wait && r.since > 1.2) r.showMe();
              await sleep(50);
            }
          }
        };
        const settle = async () => {
          for (let k = 0; k < 600 && !r.ready; k++) {
            if (r.beat?.wait && r.since > 1.2) r.showMe();
            await sleep(50);
          }
        };
        for (const c of clips) {
          if (c.act !== act) {
            act = c.act;
            window.fns.story().enterAct(act);
            await sleep(1500);
            r = window.fns.story();
          }
          await until(c.from);
          const start = now();
          await until(c.to);
          await settle();
          await sleep(hold * 1500);
          marks[c.name] = [start, now()];
        }
        return marks;
      },
      { clips: learn, hold: HOLD },
    ),
  );
  for (const c of learn) {
    const [top, tall] = c.band ?? [0.17, 0.66];
    encode(c.name, shots, out[c.name], { x: yard.x, y: yard.y + top * yard.h, w: yard.w, h: tall * yard.h });
  }
  await page.close();
}

// ——— the opening's logo: the stage on a fresh visit holds it alive until it is started
for (const c of OPENING.filter((x) => wanted(x.name))) {
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2 });
  await page.goto(STAGE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  // the logo alone: the first block of drawn columns from the left (the menu and the console's button stand apart)
  const logo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const r = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    const { width: W, height: H } = canvas;
    const px = ctx.getImageData(0, 0, W, H).data;
    const at = (x, y) => (y * W + x) * 4;
    const [p0, p1, p2] = [px[0], px[1], px[2]];
    const inked = (x, y) => Math.abs(px[at(x, y)] - p0) + Math.abs(px[at(x, y) + 1] - p1) + Math.abs(px[at(x, y) + 2] - p2) > 24;
    const cols = Array.from({ length: W }, (_, x) => {
      for (let y = 0; y < H; y += 2) if (inked(x, y)) return true;
      return false;
    });
    const s = W / r.width;
    const x0 = cols.indexOf(true);
    let x1 = x0;
    let gap = 0;
    for (let x = x0; x < W; x++) {
      if (cols[x]) {
        x1 = x;
        gap = 0;
      } else if (++gap > 5 * s) break;
    }
    let y0 = H;
    let y1 = 0;
    for (let y = 0; y < H; y++)
      for (let x = x0; x <= x1; x += 2)
        if (inked(x, y)) {
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
          break;
        }
    // a margin all round, but only a hair on the right: the menu stands just past it
    const m = 18;
    return { x: r.left + x0 / s - m, y: r.top + y0 / s - m, w: (x1 - x0) / s + m + 2, h: (y1 - y0) / s + 2 * m };
  });
  const { shots, out } = await record(page, async () => {
    const a = Date.now() / 1000;
    await page.waitForTimeout(c.hold * 1000);
    if (!c.unfold) return [a, Date.now() / 1000];
    const start = Date.now() / 1000;
    await page.keyboard.press('Space');
    await page.waitForTimeout(9500);
    return [start - 0.5, Date.now() / 1000];
  });
  let box = logo;
  if (c.unfold) {
    // from the logo to the yard it becomes: both in the frame
    const yard = await page.evaluate(() => {
      const r = document.querySelector('canvas').getBoundingClientRect();
      const f = window.fns.floor();
      return { x: r.left + f.left, y: r.top + f.top, w: f.right - f.left, h: f.bottom - f.top };
    });
    const x0 = Math.min(logo.x, yard.x - 8);
    const y0 = Math.min(logo.y, yard.y - 8);
    box = { x: x0, y: y0, w: Math.max(logo.x + logo.w, yard.x + yard.w + 8) - x0, h: Math.max(logo.y + logo.h, yard.y + yard.h + 8) - y0 };
  }
  encode(c.name, shots, out, box);
  await page.close();
}

await browser.close();
rmSync(frames, { recursive: true, force: true });
