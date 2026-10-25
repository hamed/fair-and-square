// Export actual game branding and the packed-trading still, without changing any page layout.
// Run: node scripts/social-assets.mjs (uses the existing Vite and Playwright dev dependencies).
import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const server = await createServer({ server: { host: '127.0.0.1', port: 5197, strictPort: true }, logLevel: 'error' });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  await page.goto(`${origin}/about.html`, { waitUntil: 'networkidle' });
  const images = await page.evaluate(async () => {
    const { wordmark, fontsReady } = await import('/stage/view/logo.ts');
    const { LockupFace, drawLockupSquare } = await import('/stage/view/lockup.ts');
    const { setFavicon } = await import('/stage/view/favicon.ts');
    await fontsReady();
    const face = new LockupFace();
    face.reduced = true;
    face.update(0, 1);
    const mark = wordmark();
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f4efe4';
    ctx.fillRect(0, 0, 1200, 630);
    // Keep all essential content 90+ px from the canvas edges.
    const pen = { x: 94, y: 240, em: 132 };
    ctx.textBaseline = 'alphabetic';
    for (const g of mark.glyphs) {
      ctx.font = `${g.weight} ${pen.em * g.size}px ${g.family}`;
      ctx.fillStyle = g.ch === '&' ? '#958c7b' : '#28251f';
      ctx.fillText(g.ch, pen.x + g.x * pen.em, pen.y);
    }
    drawLockupSquare(ctx, mark.square, pen, 1, face);
    ctx.fillStyle = '#28251f';
    ctx.font = '500 34px Vazirmatn';
    ctx.fillText('A game about', 94, 320);
    ctx.fillText('wealth inequality.', 94, 364);
    ctx.font = '400 25px Vazirmatn';
    ctx.fillStyle = '#6b6455';
    ctx.fillText('Everyone starts equal.', 94, 440);
    ctx.fillText('Every trade is fair.', 94, 475);
    ctx.fillText('What happens next?', 94, 510);
    const packed = new Image();
    packed.src = '/about/packed.jpg';
    await packed.decode();
    // Crop only the source still's empty margin. Preserve every agent and moving stake.
    ctx.drawImage(packed, 75, 75, 455, 455, 642, 91, 448, 448);
    const preview = canvas.toDataURL('image/png');
    // The favicon is the game's own small black-and-white face.
    for (const icon of document.querySelectorAll('link[rel="icon"]')) icon.remove();
    setFavicon();
    const favicon = document.querySelector('link[rel="icon"][sizes="32x32"]').href;
    canvas.width = canvas.height = 180;
    ctx.fillStyle = '#f4efe4';
    ctx.fillRect(0, 0, 180, 180);
    // Apple's square uses the same blue square and face as the live wordmark.
    drawLockupSquare(ctx, { x: 0, side: 1, stroke: mark.square.stroke }, { x: 20, y: 160, em: 140 / 1.2 }, 1, face);
    return { 'social-preview.png': preview, 'favicon.png': favicon, 'apple-touch-icon.png': canvas.toDataURL('image/png') };
  });
  for (const [name, data] of Object.entries(images)) {
    const bytes = Buffer.from(data.split(',')[1], 'base64');
    writeFileSync(new URL(`../public/${name}`, import.meta.url), bytes);
    console.log(`${name}: ${bytes.length} bytes`);
  }
} finally {
  await browser?.close();
  await server.close();
}
