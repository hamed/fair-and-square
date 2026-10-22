/**
 * The about page (about.html): the lockup (lockup.ts) and the squares in the prose (squares.ts), one frame loop for
 * them all; and its one button that is not a square's, Pass it on.
 */
import { setFavicon } from '../view/favicon.ts';
import type { Pointer } from './cast.ts';
import { clips } from './clips.ts';
import { Lockup } from './lockup.ts';
import { Squares, passItOn } from './squares.ts';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const squares = new Squares(document, reduced);
const mark = document.querySelector<HTMLCanvasElement>('.mark canvas');
const lockup = mark ? new Lockup(mark, reduced) : null;

const start = performance.now();
/** The pointer, client px; `at` on the page's clock (ms since start). */
const pointer: Pointer = { x: NaN, y: NaN, at: -Infinity };
addEventListener(
  'pointermove',
  (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.at = performance.now() - start;
  },
  { passive: true },
);

setFavicon();

passItOn(document);
clips(document, reduced);

let last = start;
function frame(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  const t = (now - start) / 1000;
  squares.frame(t, dt, pointer);
  lockup?.frame(dt, pointer);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
