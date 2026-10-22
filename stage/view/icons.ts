/**
 * The game's icons: square, as everything in it is (square ends, mitred corners), drawn in the current text colour
 * on a 16 × 16 grid. Used where an icon is clear (owner, 2026-10-22): the well-known ones (play, pause, a round,
 * again, new luck, share, embed, back, next, fast forward) and the arrangements, each drawn as the squares stand.
 * A control wearing one says its word to screen readers and on hover (`wear`). No characters: these are things.
 */
export type IconName =
  | 'play'
  | 'pause'
  | 'step'
  | 'restart'
  | 'luck'
  | 'fast'
  | 'slower'
  | 'share'
  | 'embed'
  | 'back'
  | 'next'
  | 'wander'
  | 'box'
  | 'lineup'
  | 'ccdf'
  | 'neff'
  | 'lorenz'
  | 'coins'
  | 'pieces'
  | 'still';

/** Two squares standing apart, as the animation icons have them: their trade between them. */
const PAIR = '<rect x="1" y="9" width="5" height="5"/><rect x="10" y="9" width="5" height="5"/>';
/** A piece flying from one to the other, a short trail behind it. */
const FLIGHT = '<rect class="f" x="7" y="3" width="2.6" height="2.6"/><path class="dash" d="M3.5 8 6.5 5"/>';

/** Each icon: SVG children on the 16 × 16 grid ('f': filled, 'soft': lightly filled, 'dash': dashed, else stroked). */
export const SHAPES: Readonly<Record<IconName, string>> = {
  play: '<path class="f" d="M4 2.5 13.5 8 4 13.5Z"/>',
  pause: '<rect class="f" x="3.5" y="2.5" width="3" height="11"/><rect class="f" x="9.5" y="2.5" width="3" height="11"/>',
  step: '<path class="f" d="M3 2.5 10.5 8 3 13.5Z"/><rect class="f" x="11.5" y="2.5" width="2" height="11"/>',
  // round again: a square loop, its arrow back to the start
  restart: '<path d="M13 8v5H3V3h6.5"/><path class="f" d="M9 0.5 13.2 3 9 5.5Z"/>',
  // a die, five round dots (owner, 2026-10-22)
  luck: '<rect x="1.5" y="1.5" width="13" height="13"/><circle class="f" cx="4.8" cy="4.8" r="1.35"/><circle class="f" cx="11.2" cy="4.8" r="1.35"/><circle class="f" cx="8" cy="8" r="1.35"/><circle class="f" cx="4.8" cy="11.2" r="1.35"/><circle class="f" cx="11.2" cy="11.2" r="1.35"/>',
  fast: '<path class="f" d="M1.5 3 8 8l-6.5 5Z"/><path class="f" d="M8 3l6.5 5L8 13Z"/>',
  // slower: fast forward's one triangle, less
  slower: '<path class="f" d="M2 3l6.5 5L2 13Z"/><rect class="f" x="10" y="7" width="4.8" height="2"/>',
  share: '<path d="M12 9.5v4H2.5V4H7"/><path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5"/>',
  embed: '<path d="M5 4 1.5 8 5 12M11 4l3.5 4-3.5 4M9.3 3 6.7 13"/>',
  back: '<path d="M10.5 2.5 5 8l5.5 5.5"/>',
  next: '<path d="M5.5 2.5 11 8l-5.5 5.5"/>',
  // the room: squares standing about
  wander: '<rect x="1.5" y="2" width="4" height="4"/><rect x="9.5" y="1.5" width="5" height="5"/><rect x="3" y="9.5" width="4.5" height="4.5"/><rect x="11" y="10.5" width="3" height="3"/>',
  // the box, and squares of three sizes packed in it
  box: '<rect x="1" y="1" width="14" height="14"/><rect class="soft" x="2.5" y="5.5" width="8" height="8"/><rect class="soft" x="10.5" y="10" width="3.5" height="3.5"/><rect class="soft" x="2.5" y="2" width="3" height="3"/>',
  // in a row, smallest first, side by side on one floor
  lineup: '<rect x="1" y="11" width="3" height="3"/><rect x="4" y="9.5" width="4.5" height="4.5"/><rect x="8.5" y="8" width="6" height="6"/>',
  // the CCDF: bars from one wall, the longest at the bottom
  ccdf: '<rect x="2" y="11.5" width="12" height="2.5"/><rect x="2" y="9" width="9" height="2.5"/><rect x="2" y="6.5" width="6" height="2.5"/><rect x="2" y="4" width="3.5" height="2.5"/>',
  // the effective number: how many copies, a stack of three
  neff: '<rect x="5.5" y="0.5" width="9.5" height="9.5"/><rect x="3.25" y="2.75" width="9.5" height="9.5"/><rect class="soft" x="1" y="5" width="9.5" height="9.5"/>',
  // the Lorenz curve: its axes, the even line, the curve bowing under it
  lorenz: '<path d="M1.5 1.5v13h13"/><path class="dash" d="M1.5 14.5 14.5 1.5"/><path d="M1.5 14.5C9 14.2 13 10.5 14.5 1.5"/>',
  // how much is shown moving: a coin between two squares; a piece flying between them; the flight struck out
  coins: `${PAIR}<circle cx="8" cy="4.5" r="3"/><path class="f" d="M7.3 3.2h1.4v2.6H7.3Z"/>`,
  pieces: `${PAIR}${FLIGHT}`,
  still: `${PAIR}${FLIGHT}<path d="M1 1 15 15"/>`,
};

const NS = 'http://www.w3.org/2000/svg';

/** An icon, sized by the text around it, aria-hidden: the control it is on names itself (`wear`). */
export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `icon icon-${name}`);
  svg.innerHTML = SHAPES[name];
  return svg;
}

/** A control showing its icon alone: its word for screen readers (aria-label); on hover, its word over a few more. */
export function wear(el: HTMLElement, name: IconName, word: string, tip = ''): void {
  el.replaceChildren(icon(name));
  el.setAttribute('aria-label', word);
  el.title = tip ? `${word}\n${tip}` : word;
  el.classList.add('iconic');
}
