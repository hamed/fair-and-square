/**
 * The about page's lockup, as the stage draws its title (view/lockup.ts, view/logo.ts wordmark): "fair&" is the
 * page's own text in the serif; then the game's square in place of the word, live, on a canvas of its own. Its
 * eyes follow the pointer, a click cheers it up, and it is glad: here, everyone is still equal.
 */
import { LOCKUP, LockupFace, drawLockupSquare } from '../view/lockup.ts';
import { fontsReady, wordmark } from '../view/logo.ts';
import type { Pointer } from './cast.ts';

export class Lockup {
  private readonly face = new LockupFace();
  private readonly ctx: CanvasRenderingContext2D | null;
  /** The square as the wordmark has it: its side (the serif's cap height) and stem, em; null until the font is in. */
  private square: { readonly side: number; readonly stroke: number } | null = null;
  private em = 0;
  private side = 0;
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, reduced: boolean) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.face.reduced = reduced;
    canvas.closest('a')?.addEventListener('pointerenter', () => this.face.cheer());
    void fontsReady().then(() => this.fit());
  }

  /** Sized to the serif as set here: the cap height × the stage's style, standing on the baseline. */
  fit(): void {
    const m = wordmark();
    this.square = { side: m.square.side, stroke: m.square.stroke };
    this.em = parseFloat(getComputedStyle(this.canvas).fontSize) || 16;
    this.side = m.square.side * LOCKUP.size * this.em;
    const dpr = devicePixelRatio || 1;
    this.canvas.style.inlineSize = this.canvas.style.blockSize = `${this.side}px`;
    this.canvas.width = this.canvas.height = Math.round(this.side * dpr);
  }

  /** Each frame: `dt` seconds since the last; the pointer, client px. */
  frame(dt: number, pointer: Pointer): void {
    const ctx = this.ctx;
    if (!ctx || !this.square) return;
    const r = this.canvas.getBoundingClientRect();
    const at = Number.isFinite(pointer.x) ? { x: pointer.x - r.left, y: pointer.y - r.top } : null;
    this.face.update(0, dt, at);
    const dpr = this.canvas.width / this.side;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.side, this.side);
    drawLockupSquare(ctx, { x: 0, side: this.square.side, stroke: this.square.stroke }, { x: 0, y: this.side, em: this.em }, 1, this.face);
  }
}
