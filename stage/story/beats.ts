/**
 * The Story, beat by beat: what each beat does. One beat is one subtitle (words.en.ts, by `key`) and the console
 * lines that animate it (`run`, the stage's own script words: commands, `wait`, `until done`, `until round`,
 * `until gini`). Data only: the runner (runner.ts) knows no beat.
 *
 * - `wait`: the beat does not go on until the reader acts (moves a slider, picks, drags, presses, edits).
 * - `controls`: what the strip shows under the words for that (sliders, choices, the line's twin, buttons).
 * - `widget`: a widget the beat mounts or configures (widgets.ts), by name; the runner never looks inside.
 * - `enter`: how to build the yard this beat starts from, when the story is entered here (an act's first beat);
 *   played at once.
 * - `auto`: goes on by itself when its lines are done (a beat whose animation runs on into the next one).
 *
 * Game progress is counted (`until round`, `until gini`), never timed, so every reader sees the same run: a goal
 * stops play exactly there (play again before the next goal); play left running with no goal goes on while the
 * reader reads, as the script asks.
 */
import type { BeatKey, ChoiceKey } from './words.en.ts';

export type Wait =
  /** A slider moved (`*`: any of the beat's); `to`: and set to this value (it snaps there within SNAP). */
  | { readonly kind: 'slide'; readonly name: string; readonly to?: number }
  | { readonly kind: 'choose' }
  /** The line guide dragged. */
  | { readonly kind: 'drag' }
  /** The two players' money shared another way (the wealth slider). */
  | { readonly kind: 'split' }
  /** A widget's pick (the four yards). */
  | { readonly kind: 'pick' }
  /** One of the strip's two ways on (`controls.fork`): the next act, or past it. */
  | { readonly kind: 'fork' }
  /** A panel button pressed (Be a square: a new you). */
  | { readonly kind: 'press'; readonly name: string }
  /** The program edited (the blocks). */
  | { readonly kind: 'edit' };

interface Controls {
  /** The program's sliders, by name: the panel shows them, where they are in Play. */
  readonly sliders?: readonly string[];
  /** A mark on a slider: where to set it. */
  readonly mark?: { readonly slider: string; readonly at: number };
  readonly choices?: readonly ChoiceKey[];
  /** The line guide's twin: a range the keyboard can move. */
  readonly line?: boolean;
  /** The two players' money, shared between them by a slider in their colours, each on their side. */
  readonly wealth?: boolean;
  /** The panel's buttons the beat reveals, by their word (play, be). */
  readonly buttons?: readonly ('play' | 'be')[];
  /** The yard's program as a few plain blocks, its stake and tax numbers to nudge (the run goes on). */
  readonly program?: boolean;
  /** The panel's charts: all, or these kinds (the rest come as they are handed over: `handoff`). */
  readonly charts?: boolean | readonly string[];
  /** The whole panel, as Play has it: what the reader will have from here on. */
  readonly all?: boolean;
  /** Only this beat's controls for now (the panel's others put away while it lasts). */
  readonly only?: boolean;
  /** The picked square's card, as Play has it (you, once drawn). */
  readonly card?: boolean;
  /** Two ways on, as buttons under the words: the next act, or past it to the one after (an act to take or skip). */
  readonly fork?: boolean;
}

/** Where a beat's words go: across the yard's top (default), or its top-left quarter (the rest a widget's). */
type WordsPlace = 'top' | 'quarter';

export interface Beat {
  readonly key: BeatKey;
  readonly act: number;
  readonly run?: string;
  readonly enter?: string;
  readonly wait?: Wait;
  readonly controls?: Controls;
  readonly widget?: { readonly name: string; readonly [k: string]: unknown };
  readonly words?: WordsPlace;
  readonly auto?: boolean;
  /** A step of something slow: Next waits for it (it is never hurried). */
  readonly steady?: boolean;
  /** It goes on from the beat before (a step of the same act): Back goes to where that began. */
  readonly continues?: boolean;
  /** The reader must do it: Do it for me is never offered. */
  readonly must?: boolean;
  /** An `auto` beat met by the reader stays this many seconds before it goes on: what they did is seen to land. */
  readonly linger?: number;
}

/** A slider within this share of its range of its mark snaps to it. */
export const SNAP = 0.04;

/**
 * The story's luck. One seed for the whole yard of four: the first where, the players starting at SPLIT, one leads
 * from their 10th duel to their last (DUELS) with at least three times the other's money; and Act 2, everyone
 * trading after, reaches N_eff 3.05 after at least 12 rounds. tests/story.test.ts checks it is the first.
 */
export const SEED = 5;
/** Act 1 leaves the players unequal before their first trade: the left one with this share of the two's money. */
export const SPLIT = 0.4;

/** The two players' duels before the other two jump in, and the duel from which one leads. */
export const DUELS = 31;
export const LEAD_FROM = 10;

/** The yard of four: two play (0 and 1), two watch. */
const four = (beta: number) => `n 4; seed ${SEED}; rule beta ${beta}; rule tax 0`;
/** Everyone out of sight, nothing playing, nothing on top: where an act built from scratch starts. */
const clean = 'veil on; pause; fx chart off; guide off; stakes off; taxes off; divide off; glow off; badge off; be off; money off; meet off; speed 1; look manga; zoom yard';

/** The tax the story sets (big enough to see a square's share go), and where the tax slider starts for trying it. */
const TAX = 0.05;
const TAX_START = 0.15;
/** Trades and the tax shown, beat by beat, as fast as is still worth watching. */
const shown = 'fx trade piece; fx tax on';
/** `k` duels between the players, each shown whole, one after another. */
const duels = (k: number) => Array.from({ length: k }, () => 'duel 0 1; until done').join('; ');
/** N_eff where Act 2's watched trading stops. */
export const NEFF_ACT2 = 3.05;
/**
 * N_eff where Act 2's fast-forward stops: one of the four holds about four fifths of the money, the yard-sale's
 * end in sight (review 2026-10-29: the story never showed it). The photo's, a little lower, comes after a little
 * more trading in the box.
 */
export const NEFF_LAPSE = 1.5;
export const NEFF_PHOTO = 1.45;
/** The fast-forward's pace, trades a second: with four squares, fifty rounds a second. */
const LAPSE_RATE = 100;
/** The yard as the players' duels leave it (DUELS of them), then everyone trading as Act 2 has them, fast-forward and all. */
const unequal = `${four(0.1)}; meet 0 1; split ${SPLIT}; duel 0 1 ${DUELS}; meet off; room; play; until round 7; play; until neff ${NEFF_ACT2}; play; until neff ${NEFF_LAPSE}`;

export const BEATS: readonly Beat[] = [
  // ——— Act 1: two squares (and two watching) ———
  { key: 'yard', act: 0, run: `${clean}; until done; fx trade toss; fx tax off; ${four(0.25)}; pose fold; finish` },
  { key: 'money', act: 0, run: 'money fill; until done' },
  { key: 'split', act: 0, run: 'money split; until done; room; until done' },
  // they blush, shy, and smile with their eyes (^_^)
  { key: 'hi', act: 0, run: 'face all camera 4; face all shy 3; face all glad; wait 1.2' },
  { key: 'fair', act: 0, run: 'meet 0 1; face 0 glad; face 1 glad; face 2 curious; face 3 curious; until done' },
  // their money need not be the same (owner, 2026-10-21): a slider in their colours shares it; its area, then its
  // side, is the money; then they are left unequal, so "a share of what the poorer one has" means something
  { key: 'bigger', act: 0, controls: { wealth: true } },
  { key: 'uneven', act: 0, run: `split ${SPLIT}; until done` },
  { key: 'table', act: 0, run: 'stakes on; wait 0.6' },
  { key: 'stake', act: 0, run: 'glow stake poorer; wait 0.6' },
  // moved: on to the next beat, once the slider rests; left at the mark: on again (owner, 2026-10-22)
  { key: 'slider', act: 0, run: 'glow slider stake', controls: { sliders: ['stake'] }, wait: { kind: 'slide', name: 'stake' }, auto: true },
  // try it and leave it at the mark, one beat (owner, 2026-10-22): the size of the stake as it moves, no number said
  { key: 'try', act: 0, run: 'glow slider off', controls: { sliders: ['stake'], mark: { slider: 'stake', at: 0.1 } }, wait: { kind: 'slide', name: 'stake', to: 0.1 }, auto: true },
  { key: 'coin', act: 0, run: 'glow off; speed 0.8; duel 0 1; stakes off; wait 1.75', auto: true },
  { key: 'takes', act: 0, run: 'until done; speed 1' },
  { key: 'trade', act: 0, run: 'face all camera 2; wait 0.8' },

  // ——— Act 2: many squares ———
  {
    key: 'guess',
    act: 1,
    enter: `${clean}; fx trade toss; fx tax off; ${four(0.1)}; room; meet 0 1; split ${SPLIT}; duel 0 1; finish; veil off`,
    controls: { choices: ['left', 'same', 'right'] },
    wait: { kind: 'choose' },
    // picked, on by itself after a moment (review 2026-10-29: a pick that changed nothing on screen was clicked again)
    auto: true,
    linger: 1.2,
  },
  // a few whole trades, coin and all, quicker each time
  { key: 'see', act: 1, run: `speed 1; ${duels(3)}; speed 1.5; ${duels(3)}` },
  // then on, quicker, to the DUELS the luck was chosen for (Act 1's one, Let's see's six, these twelve, the rest): one
  // leads from the LEAD_FROM-th to the last
  { key: 'honest', act: 1, run: `speed 2; ${duels(6)}; speed 3; ${duels(6)}; speed 4; ${duels(DUELS - 1 - 6 - 12)}` },
  // what the duels did, in the players' own numbers (review 2026-10-29: the guess was never answered)
  { key: 'gap', act: 1, run: 'speed 1; face richest cheer 2' },
  { key: 'invite', act: 1, run: 'meet off; face 2 cheer; face 3 cheer; room; until done' },
  { key: 'pairs', act: 1, run: 'meet; until done' },
  { key: 'together', act: 1, run: 'round; until done' },
  { key: 'rounds', act: 1, run: 'speed 1.5; play; until round +3; speed 1' },
  { key: 'stand', act: 1, run: 'until done; fx trade piece; room; until done; play; until round +3' },
  { key: 'keep', act: 1, run: `speed 2; play; until round +4; speed 3; play; until neff ${NEFF_ACT2}; speed 1` },
  // the end in sight (review 2026-10-29): rounds counted, trades at once, until one holds about four fifths
  { key: 'lapse', act: 1, run: `until done; fx trade off; badge round on; play ${LAPSE_RATE}; until neff ${NEFF_LAPSE}; play auto; pause; fx trade piece` },
  { key: 'most', act: 1, run: 'face richest cheer 3' },
  // why, in numbers: the poorer one's stake is a share of its own money, so a loss and a win leave it lower
  { key: 'why', act: 1 },
  // the photos are a choice (review 2026-10-29: Act 3 lost most readers): take them, or go on to the tax
  { key: 'photo', act: 1, run: 'until done; badge off; face all camera 4; wait 1', controls: { fork: true }, wait: { kind: 'fork' }, must: true },

  // ——— Act 3: photos ———
  { key: 'bars', act: 2, enter: `${clean}; fx trade off; fx tax off; ${unequal}; finish; veil off`, run: 'fx trade off; logarea bar; until done' },
  { key: 'stack', act: 2, run: 'desc stack; until done' },
  { key: 'line', act: 2, run: 'guide line 0.35', controls: { line: true }, wait: { kind: 'drag' } },
  // the chart in the bars: plain bars, their outline strong (the CCDF); then it goes to its square in the panel
  { key: 'few', act: 2, run: 'guide line 0.7; wait 1.2; guide envelope; wait 1.6; handoff ccdf; wait 1.2' },
  { key: 'box', act: 2, run: 'guide off; pose fold; until done' },
  // trading in the box, shown, until the reader moves on (owner, 2026-10-21): each trade flying where they stand,
  // the box re-packing as each lands; the photo then counts whatever N_eff it comes to (prints.ts)
  { key: 'still', act: 2, run: `${shown}; fx chart on; speed 1; play` },
  // side = money: every square's bottom edge lit, its side (owner: a highlight on the bottom edge of each)
  { key: 'side', act: 2, run: 'pause; until done; fx chart off; squared still; until done; glow edge bottom' },
  // big to small: the order the pile takes next, so little moves; the edges side by side, the box's bottom edge
  { key: 'edge', act: 2, run: 'pose squared desc row; until done' },
  { key: 'pack', act: 2, run: 'glow edge off; pose squared fold; until done' },
  // the photo counted, then taken to the panel as its number, photographed (owner, 2026-10-22)
  { key: 'neff', act: 2, run: 'neff; until done; wait 1.5; handoff neff; wait 1.5' },
  // the running total, made of the squares, each as big as its side says (side = money, as they already are):
  // sorted straight into a stack, poorest at the bottom (all of it is the box's height); then squeezed to one
  // width (their heights kept) and pulled out into stairs
  // side = money again: each one's left edge lit, its side, in its own colour
  { key: 'lineup', act: 2, run: 'pose squared asc stack; until done; glow edge left' },
  // a beat each, its words saying what it does (owner, 2026-10-22: the words did not match the action)
  { key: 'tower', act: 2, run: 'glow edge off; pose tower; until done' },
  { key: 'stairs', act: 2, run: 'pose stairs; until done' },
  { key: 'curve', act: 2, run: 'guide lorenz; until done' },
  // the even line as ghost squares; then the curve goes to its square in the panel
  { key: 'even', act: 2, run: 'guide lorenz even; until done; wait 1.2; handoff lorenz; wait 1.2' },
  // the gap shaded; the gauge (the triangle and the gap folded into bars beside the box); then to the panel
  // the Gini in steps, each with its action (owner, 2026-10-22): the triangle's area, the gap's, their ratio
  { key: 'triangle', act: 2, run: 'guide lorenz triangle; until done' },
  { key: 'between', act: 2, run: 'guide lorenz gap; until done; wait 0.6; guide lorenz lift; until done' },
  { key: 'gini', act: 2, run: 'guide lorenz label; until done; wait 1; handoff gini; wait 1.2' },

  // ——— Act 4: tax, the veil, and blocks ———
  { key: 'again', act: 3, enter: `${clean}; fx trade off; fx tax off; ${unequal}; pose fold; play; until neff ${NEFF_PHOTO}; finish; veil off`, run: `guide off; veil off; room; until done; ${shown}; speed 2; play`, controls: { charts: true } },
  // the tax, as the stake was taught: what it is, its slider, try it, set it
  // what each square would pay shows on it, cut and lifted as the stake was, following the slider: the rule seen
  { key: 'tax', act: 3, run: `pause; until done; speed 1; ${shown}; rule tax ${TAX_START}; taxes on; until done` },
  { key: 'taxslider', act: 3, run: 'glow slider tax', controls: { sliders: ['tax'] }, wait: { kind: 'slide', name: 'tax' }, auto: true },
  { key: 'taxtry', act: 3, run: 'glow slider off', controls: { sliders: ['tax'], mark: { slider: 'tax', at: TAX } }, wait: { kind: 'slide', name: 'tax', to: TAX }, auto: true },
  // one round of tax, slowly, a step at a time, each held until Next (levy.ts, its slices already off: all in the
  // pot by 1.46 s, the pot in equal shares by 1.91, then dealt back)
  { key: 'pay', act: 3, run: 'until done', steady: true },
  // each step plays to its moment of the levy and holds there (`until levy`); the words come first, then the step
  { key: 'pot', act: 3, run: 'speed 0.5; levy; until levy pot', steady: true, continues: true },
  { key: 'share', act: 3, run: 'wait 0.8; until levy split', steady: true, continues: true },
  { key: 'back', act: 3, run: 'wait 0.5; until levy back; speed 1', steady: true, continues: true },
  { key: 'going', act: 3, run: `${shown}; speed 2; play; until round +6` },
  { key: 'four', act: 3, run: 'veil on; divide on', widget: { name: 'yards', phase: 'show' }, words: 'quarter' },
  { key: 'veil', act: 3, widget: { name: 'yards', phase: 'hop' }, words: 'quarter' },
  // the reader chooses: nobody does it for them; chosen, on at once (owner, 2026-10-22)
  { key: 'which', act: 3, widget: { name: 'yards', phase: 'pick' }, wait: { kind: 'pick' }, words: 'quarter', must: true, auto: true },
  // the chosen yard grows into the yard; then chance picks who you are in it, and your card shows (owner, 2026-10-22)
  { key: 'lottery', act: 3, widget: { name: 'yards', phase: 'grow' }, run: 'divide off; veil off; wait 1.2; room; until done; lottery; until done; glow button card-share', controls: { card: true } },
  // a few plain blocks, not the editor: its numbers are the run's own sliders, so a change goes on from here
  { key: 'blocks', act: 3, run: `${shown}; speed 2; play`, controls: { program: true, only: true } },
  { key: 'number', act: 3, controls: { program: true, only: true }, wait: { kind: 'slide', name: '*' } },
  // the panel as Play has it: what the reader has from here on; at the end, the way to pass it on and the way to
  // who made it light too (docs/brand.md: peak-end)
  { key: 'open', act: 3, run: 'speed 1; glow tab play; glow tab rules; glow button share; glow tab about; face all cheer 3', controls: { all: true } },
];

/** Each act's first beat. */
export const ACT_STARTS: readonly number[] = BEATS.reduce<number[]>((starts, b, k) => (k === 0 || b.act !== BEATS[k - 1].act ? [...starts, k] : starts), []);

/** A beat's lines, one command each. */
export function linesOf(text: string | undefined): string[] {
  return (text ?? '')
    .split(/[;\n]/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}
