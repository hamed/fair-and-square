/**
 * What a key does on the page, decided here and carried out by main.ts, so it
 * can be tested without a browser. A focused button or link keeps Space and
 * Enter for itself: they press it, and its own click does the rest (review
 * 2026-10-18, N1: Space on the focused Play skipped the opening and started
 * trading, while a click unfolded the logo).
 */

/** Where the key was pressed: the console's input, the Rules drawer's blocks, a button or link, a slider, or the page itself. */
export type KeyTarget = 'console' | 'editor' | 'control' | 'slider' | 'page';
/** The opening: fonts still loading, the logo held, unfolding, or over (or never shown). */
export type OpeningState = 'waiting' | 'held' | 'unfolding' | 'none';
type KeyAction = 'native' | 'start' | 'skip' | 'toggle-console' | 'focus-console' | 'play-pause' | 'slower' | 'faster' | 'story-next' | 'story-back' | 'none';

/**
 * In the Story, Space, Enter and the arrow that points the way the words read go on; the other arrow goes back
 * (`rtl`: a right-to-left page reads leftward). A focused control keeps Space and Enter, as everywhere.
 */
export function keyAction(key: string, target: KeyTarget, opening: OpeningState, story = false, rtl = false): KeyAction {
  if (target === 'console') return key === '`' ? 'toggle-console' : 'none';
  // the blocks own their keys (typing a number, Delete, Ctrl+Z): the stage takes none of them
  if (target === 'editor') return 'none';
  const during = opening !== 'none';
  if (during && key === 'Escape') return 'skip';
  // a slider keeps its arrows (and Home, End, Page Up and Down); Space and Enter, which it has no use for, do
  // what they do on the page
  if (target === 'slider') {
    if (/^(Arrow|Page|Home|End)/.test(key)) return 'native';
    target = 'page';
  }
  if (target === 'control' && (key === ' ' || key === 'Enter')) return 'native';
  if (during && (key === ' ' || key === 'Enter')) return opening === 'held' ? 'start' : 'skip';
  if (key === '`') return 'toggle-console';
  if (key === '/') return 'focus-console';
  if (story && !during) {
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (key === ' ' || key === 'Enter' || key === forward) return 'story-next';
    if (key === backward) return 'story-back';
  }
  if (key === ' ') return 'play-pause';
  if (key === '[') return 'slower';
  if (key === ']') return 'faster';
  return 'none';
}
