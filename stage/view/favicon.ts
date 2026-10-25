/**
 * The tab's icon (owner, 2026-10-18): one square, black on white, with a
 * normal face (open eyes, a soft smile). At 16 px a feeling with more to it
 * does not survive. The face is the engine's own, drawn 16× larger with its
 * lines in proportion and reduced to whole pixels; not in proportion to the
 * square: it shrinks as √P, so the smaller the icon, the more of it is face.
 */
import { FacePainter } from '../essay/face/draw.ts';
import { FaceField } from '../essay/face/field.ts';
import { paint } from './faces.ts';

/** Supersampling for the 1-bit reduction, and the coverage that makes a pixel ink. */
const SUPER = 16;
const BIT = 0.4;

/** The face's radius for a P px square: 0.62 of the side at 48 px, more of it below. */
const faceFor = (P: number) => 0.62 * 48 * Math.sqrt(P / 48);
/** Clear pixels between the features and the square's edge. */
const marginFor = (P: number) => Math.max(2, Math.round(P / 8));

function normalPose() {
  const f = new FaceField(1, 1);
  f.temper(0, { v0: 0.5, a0: -0.2, d0: 0.1, smirk: 0, reactivity: 1, drift: 0 });
  f.look(0, 0, 0);
  f.settle();
  const read = f.poseOf(0, true);
  return { pose: structuredClone(read.pose), seed: f.seed[0] };
}

/** The face drawn SUPER× larger with its lines in proportion, reduced to whole pixels at BIT coverage. */
function raster(P: number, s: number): Uint8Array {
  const H = P * SUPER;
  const hi = document.createElement('canvas');
  hi.width = hi.height = H;
  const ctx = hi.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, H, H);
  const { pose, seed } = normalPose();
  const sh = s * SUPER;
  // the engine caps its lines at 4 px: draw small, scale up, and they stay in proportion
  const base = Math.min(sh, 46);
  const z = sh / base;
  const d = new FacePainter().paint('manga', 'square', H / Math.sqrt(Math.PI) / z, base, pose, {}, seed);
  if (d) {
    ctx.translate(H / 2, H / 2);
    ctx.scale(z, z);
    paint(ctx, d, 0, 0, '#000', '#fff');
  }
  const data = ctx.getImageData(0, 0, H, H).data;
  const bits = new Uint8Array(P * P);
  for (let y = 0; y < P; y++)
    for (let x = 0; x < P; x++) {
      let dark = 0;
      for (let v = 0; v < SUPER; v++) for (let u = 0; u < SUPER; u++) dark += 255 - data[((y * SUPER + v) * H + x * SUPER + u) * 4];
      bits[y * P + x] = dark / (255 * SUPER * SUPER) >= BIT ? 1 : 0;
    }
  return bits;
}

function inkBox(bits: Uint8Array, P: number): [number, number, number, number] {
  let x0 = P;
  let y0 = P;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < P; y++)
    for (let x = 0; x < P; x++)
      if (bits[y * P + x]) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  return [x0, y0, x1, y1];
}

/** The icon, P px: a white square with a 1 px black edge, the face in black, centred by its ink. */
function faviconURL(P: number): string {
  const room = P - 2 * marginFor(P);
  let s = faceFor(P);
  let bits = raster(P, s);
  for (let k = 0; k < 4; k++) {
    const [x0, y0, x1, y1] = inkBox(bits, P);
    const span = Math.max(x1 - x0 + 1, y1 - y0 + 1);
    if (span <= room) break;
    s *= (room - 0.5) / span;
    bits = raster(P, s);
  }
  const [x0, y0, x1, y1] = inkBox(bits, P);
  const dx = Math.round((P - 1 - x1 - x0) / 2);
  const dy = Math.round((P - 1 - y1 - y0) / 2);
  const c = document.createElement('canvas');
  c.width = c.height = P;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, P, P);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, P, 1);
  ctx.fillRect(0, P - 1, P, 1);
  ctx.fillRect(0, 0, 1, P);
  ctx.fillRect(P - 1, 0, 1, P);
  for (let y = 0; y < P; y++)
    for (let x = 0; x < P; x++) {
      const X = x + dx;
      const Y = y + dy;
      if (bits[y * P + x] && X > 0 && Y > 0 && X < P - 1 && Y < P - 1) ctx.fillRect(X, Y, 1, 1);
    }
  return c.toDataURL('image/png');
}

/** The page's icons, 16 and 32 px. */
export function setFavicon(): void {
  for (const P of [16, 32]) {
    const link = document.querySelector<HTMLLinkElement>(`link[rel="icon"][sizes="${P}x${P}"]`) ?? document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.setAttribute('sizes', `${P}x${P}`);
    link.href = faviconURL(P);
    document.head.append(link);
  }
}
