/**
 * The page: canvas, dev console, pointer. Everything that thinks lives in
 * Session (headless); this file forwards keys and pointers and draws.
 *
 *   `  or the ›_ button   toggle the console
 *   /                     focus the console
 *   space                 play / pause trading (in the Story: go on)
 *   → ←                   in the Story: go on, go back
 *   [ ]                   slower / faster (everything: walking, trades, levies)
 *   click                 a square is glad you came (and, in Play, who it is); drag pushes through the crowd;
 *                         in the Story a tap on the empty yard goes on
 *
 * Devtools: window.fns.session is the live session, window.fns.run(line) runs
 * a console line.
 */
import { Session } from './console/session.ts';
import { VOCABULARY } from './console/commands.ts';
import { parseRecipe } from './core/recipe.ts';
import { setFavicon } from './view/favicon.ts';
import { LOCKUP_LABEL, fontsReady } from './view/logo.ts';
import { LockupFace } from './view/lockup.ts';
import { WORDS } from './words.en.ts';
import { awaitFonts } from './view/fonts.ts';
import { keyAction, type KeyTarget, type OpeningState } from './view/keys.ts';
import { BUTTONS, Opening, castOf, drawHeader, headerHeight, measureType, type Box } from './view/opening.ts';
import { Panel } from './view/panel.ts';
import { StageView } from './view/render.ts';
import { RulesDrawer } from './view/rules.ts';
import { HANDLE_GRIP } from './view/render.ts';
import { StoryRunner, type StoryHost } from './story/runner.ts';
import { Strip } from './story/strip.ts';
import { YardsWidget } from './story/yards.ts';
import { SEED } from './story/beats.ts';
import { STORY } from './story/words.en.ts';
import { statsOf } from './core/stats.ts';
import { YARD } from './core/figure.ts';
import { incomingShareSource, initAnalyticsLinks, track, trackOnce } from './analytics.ts';
import { simulationSummary } from './analytics/simulation.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const hud = $<HTMLOutputElement>('hud');
const question = $<HTMLParagraphElement>('question');
const caption = $<HTMLParagraphElement>('caption');
const panel = $<HTMLElement>('console');
const log = $<HTMLPreElement>('log');
const form = $<HTMLFormElement>('prompt');
const input = $<HTMLInputElement>('cmd');
const toggle = $<HTMLButtonElement>('toggle');
const byline = $<HTMLAnchorElement>('byline');
/** Over the drawn title: its name in words, for screen readers and on hover (the drawing is "fair &" and a square). */
const lockup = $<HTMLElement>('lockup');
/** Inside the yard, top right: who built it, when a shared link says. */
const credit = $<HTMLAnchorElement>('credit');
lockup.setAttribute('aria-label', LOCKUP_LABEL);
lockup.title = LOCKUP_LABEL;
/** The face in the title's square: it follows the yard's Gini, its eyes the pointer; a click cheers it. */
const lockupFace = new LockupFace();
lockup.addEventListener('click', () => lockupFace.cheer());
/** Where the pointer is over the page, in the canvas's px (the title's eyes follow it), or null. */
let pointerAt: { x: number; y: number } | null = null;
addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  pointerAt = { x: e.clientX - r.left, y: e.clientY - r.top };
});
document.addEventListener('pointerleave', () => (pointerAt = null));
const storyRoot = $<HTMLElement>('story');
const badges = $<HTMLElement>('badges');
/** The controls over the drawn buttons, in BUTTONS' order. */
const menu = BUTTONS.map((b) => document.querySelector<HTMLElement>(`#menu [data-go="${b.id}"]`)!);
// their words (stage/words.en.ts): what a screen reader and a keyboard meet
menu.forEach((el, k) => (el.textContent = BUTTONS[k].label));

const params = new URLSearchParams(location.hash.replace(/^#/, ''));
const search = new URLSearchParams(location.search);
const embed = params.get('embed') === '1' || search.get('embed') === '1';
/** A fresh visit opens with the logo (owner, 2026-10-18); a link, an embed or ?opening=0 goes straight to the stage; ?opening=7.5 starts it 7.5 s in. */
const opens = location.hash.length <= 1 && !embed && search.get('opening') !== '0';
const openAt = Math.max(0, Number(search.get('opening')) || 0);
let entryChosen = false;
function chooseEntry(destination: string): boolean {
  if (!opens || entryChosen) return false;
  entryChosen = true;
  trackOnce('entry_choice', { destination });
  return true;
}
initAnalyticsLinks((destination) => {
  if ((opening || waiting) && ['learn', 'play', 'build', 'about'].includes(destination) && chooseEntry(destination)) return true;
  const current = tab() === 'story' ? 'learn' : tab() === 'rules' ? 'build' : 'play';
  return !opening && !waiting && destination === current;
});

let session: Session;
let loadError = '';
if (location.hash.length > 1) {
  try {
    session = Session.load(location.hash);
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
    session = new Session();
  }
} else if (opens) {
  // the opening ends on sixteen equal shares folded into the box, 4 × 4: the stage starts there
  session = new Session({ n: 16, recipe: parseRecipe('fold') });
} else {
  // calm by default: everyone spread out and standing; space starts the trading
  session = new Session();
}
if (embed) {
  session.hud = false;
  document.body.classList.add('embed');
}
session.print('Fair and Square — stage and dev console. Nothing here is for readers yet.');
session.print('try: demo · play · trade 2000 · ccdf · neff · classes · quartiles · room · zoom chart · drag lift · still · fx off · help');
if (loadError) session.print(`error: link not loaded (${loadError}); fresh room instead`);
if (location.hash.length > 1 || search.has('fs_share')) trackOnce('shared_link_open', {
  source: incomingShareSource(location.search), status: loadError || location.hash.length <= 1 ? 'invalid' : 'loaded',
  ...(!loadError && location.hash.length > 1 ? simulationSummary(session) : {}),
});

const view = new StageView(canvas);
setFavicon();
// the reader's setting: faces hold still, glows and coins calm down
const still = matchMedia('(prefers-reduced-motion: reduce)');
view.reduced = still.matches;
lockupFace.reduced = still.matches;
still.addEventListener('change', () => (view.reduced = lockupFace.reduced = still.matches));

// ——— the opening, and the title it leaves outside the yard ———

let opening: Opening | null = null;
/** Waiting for the fonts before the opening can start. */
let waiting = opens;
/** Where the name was drawn last frame: the link to the about page sits over it. */
let named: Box | null = null;
/** Where the title (the lockup) was drawn last frame. */
let titled: Box | null = null;
/** Where the buttons on the line above the yard were drawn last frame. */
let buttons: Box[] = [];
// the fonts, or not: failing or late (4 s), the stage goes on without the opening, and a late title still comes in
awaitFonts(fontsReady(), 4000, {
  ready() {
    const type = measureType();
    view.ornament = {
      draw(ctx, frame) {
        const line = drawHeader(ctx, type, frame, session.playing, tab(), session.glows, lockupFace);
        titled = line.title;
        named = line.name;
        buttons = line.buttons;
      },
      height: (frame) => headerHeight(type, frame),
    };
    const who = waiting ? castOf(session) : null;
    if (who) {
      opening = new Opening(canvas, session, view, type, who);
      opening.face = lockupFace;
      // Learn asked for before the fonts were in: the unfolding lands there
      if (storyNext) opening.current = 'story';
      if (openAt > 0) opening.seek(openAt);
    }
    waiting = false;
  },
  failed() {
    if (!waiting) return;
    waiting = false;
    chooseEntry('play');
    session.print('the lettering did not load: no opening, straight to the stage');
    renderLog();
  },
});
/** Straight to the stage: Escape, or a command, during the opening. */
function skipOpening(): void {
  if (opening || waiting) chooseEntry(storyNext ? 'learn' : 'play');
  waiting = false;
  opening?.skip();
}
/** A control over something drawn: the canvas draws it, the control makes it one (focus, screen readers, a click). */
function place(el: HTMLElement, box: Box | null): void {
  el.hidden = !box;
  if (!box) return;
  const r = canvas.getBoundingClientRect();
  el.style.left = `${r.left + box.x0}px`;
  el.style.top = `${r.top + box.y0}px`;
  el.style.width = `${box.x1 - box.x0}px`;
  el.style.height = `${box.y1 - box.y0}px`;
}
// Play: beside the held logo it starts the game, while the logo unfolds it skips to the end, and on the line
// above the yard it plays and pauses the trading. About opens the about page (owner, 2026-10-22: in a new window,
// as before); Finds has nowhere to go yet.
const play = menu[BUTTONS.findIndex((b) => b.id === 'play')];
play.addEventListener('click', () => {
  if (opening) {
    if (!opening.started) opening.start();
    else skipOpening();
  } else if (drawer.isOpen) drawer.close();
  else if (mode === 'story') leaveStory();
  else { engage('play'); runLine(session.playing ? 'pause' : 'play'); }
});

/** A click, a tap, Space or Enter: the held logo starts unfolding; once it is, straight to the stage. */
function startOrSkip(): void {
  chooseEntry(storyNext ? 'learn' : 'play');
  if (opening && !opening.started) opening.start();
  else skipOpening();
}

// ——— the Story: a runner on the session, its strip over the yard ———

let mode: 'play' | 'story' = 'play';
let runner: StoryRunner | null = null;
/** Story was asked for while the logo still held or unfolded: it starts when the stage does. */
let storyNext = false;
const host: StoryHost = {
  analytics: track,
  session: () => session,
  setSession(s) {
    // the room's band (clear of the strip) goes with the story
    s.band = session.band;
    s.recompile();
    session = s;
  },
  ended: () => leaveStory(),
};
const strip = new Strip(storyRoot, () => runner);
function enterStory(): void {
  if (opening || waiting) {
    storyNext = true;
    // the unfolding lands with Learn open, not Play
    if (opening) opening.current = 'story';
    startOrSkip();
    return;
  }
  if (mode === 'story') return;
  mode = 'story';
  app.classList.add('story');
  storyRoot.hidden = false;
  drawer.close();
  runner = new StoryRunner(host, { yards: yardsWidget });
  // the panel lends the story its place: its way about where the run controls are, its own controls last
  panelView.story(strip.lead, strip.controls);
  runner.start();
  // a keyboard goes on from Next (Space or Enter), once the panel holding it is shown
  requestAnimationFrame(() => requestAnimationFrame(() => strip.focus()));
}
function leaveStory(): void {
  if (mode !== 'story') return;
  runner?.leave();
  runner = null;
  mode = 'play';
  app.classList.remove('story');
  storyRoot.hidden = true;
  // the panel is Play's own again
  panelView.story(null, null);
  panelView.showing = null;
}
const storyTab = menu[BUTTONS.findIndex((b) => b.id === 'story')];
// the tab you are in does nothing (the acts are in the strip)
storyTab.addEventListener('click', () => enterStory());
// ——— the reader's panel and the Rules drawer ———

const app = document.querySelector<HTMLElement>('.app')!;
const panelView = new Panel($('panel'), () => session);
// a square's card says how it feels, as its face shows it
panelView.mood = (i) => view.mood(i);
const drawer = new RulesDrawer($('rules'), () => session, () => app.classList.toggle('drawing', drawer.isOpen));
panelView.analyticsContext = () => tab() === 'story' ? 'learn' : tab() === 'rules' ? 'build' : 'play';
const rulesTab = menu[BUTTONS.findIndex((b) => b.id === 'rules')];
// Rules is a tab like the others: pressed, it is the one you are in (the story, if you were in it, is left)
rulesTab.addEventListener('click', () => {
  skipOpening();
  if (drawer.isOpen) return;
  leaveStory();
  void drawer.open();
});
/** The tab you are in: Rules while its drawer is open, else Play or Story. */
function tab(): 'play' | 'story' | 'rules' {
  return drawer.isOpen ? 'rules' : mode;
}
function engage(action: string): void {
  if (mode === 'play' && !drawer.isOpen && !opening && !waiting) trackOnce('play_engaged', { action });
}
document.addEventListener('click', (event) => {
  const control = event.target instanceof Element ? event.target.closest<HTMLElement>('#panel [data-control]') : null;
  const action = control?.dataset.control;
  if (action && !['share', 'card-share', 'embed'].includes(action)) engage(action.startsWith('press:') ? 'program_button' : action);
});
document.addEventListener('change', (event) => {
  if (event.target instanceof HTMLInputElement && event.target.matches('#panel input[type="range"]')) engage('slider');
});
$('rules').querySelector('.close')!.addEventListener('click', () => drawer.close());
const drawerPlay = $('rules').querySelector<HTMLButtonElement>('.play')!;
drawerPlay.addEventListener('click', () => runLine(session.playing ? 'pause' : 'play'));
/** The yard's floor, page px: where the four yards go, each a scaled copy of it. */
const yardsWidget = new YardsWidget(() => {
  const c = canvas.getBoundingClientRect();
  const f = view.floor;
  return { left: c.left + f.left, top: c.top + f.top, width: f.right - f.left, height: f.bottom - f.top };
}, SEED, (s, name) => panelView.focus(s, name));

(window as unknown as { fns: unknown }).fns = { session: () => session, run: (line: string) => runLine(line), editor: () => drawer.blocks, story: () => runner, strip: () => strip, floor: () => ({ ...view.floor }) };

// ——— console ———

const typed: string[] = [];
let cursor = 0;
let shown = -1;

// help lays itself out to the console's width: count the characters that fit
const measure = document.createElement('span');
measure.textContent = 'MMMMMMMMMM';
measure.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
log.append(measure);
function fitColumns(): void {
  const char = measure.getBoundingClientRect().width / 10 || 7;
  const inner = log.clientWidth - 24;
  if (inner > 0) session.columns = Math.max(24, Math.floor(inner / char));
}
new ResizeObserver(fitColumns).observe(log);

function renderLog(): void {
  if (session.log.length === shown && log.dataset.n === String(session.log.length)) return;
  shown = session.log.length;
  log.dataset.n = String(shown);
  log.textContent = session.log.join('\n');
  log.append(measure);
  log.scrollTop = log.scrollHeight;
}

function runLine(line: string): string {
  skipOpening();
  const out = session.run(line);
  if (/^share\b/.test(line.trim())) history.replaceState(null, '', session.share());
  shown = -1;
  renderLog();
  return out;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const line = input.value.trim();
  if (!line) return;
  if (typed[typed.length - 1] !== line) typed.push(line);
  cursor = typed.length;
  input.value = '';
  runLine(line);
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    cursor = Math.max(0, Math.min(typed.length, cursor + (e.key === 'ArrowUp' ? -1 : 1)));
    input.value = typed[cursor] ?? '';
  } else if (e.key === 'Tab') {
    e.preventDefault();
    const words = input.value.split(' ');
    const last = words[words.length - 1].toLowerCase();
    const options = [...new Set(VOCABULARY.filter((w) => w.startsWith(last)))];
    if (options.length === 1) {
      words[words.length - 1] = options[0];
      input.value = `${words.join(' ')} `;
    } else if (options.length > 1) {
      session.print(options.join('  '));
      renderLog();
    }
  } else if (e.key === 'Escape') {
    input.blur();
  }
});

function setConsole(open: boolean): void {
  panel.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  if (open) input.focus();
}
toggle.addEventListener('click', () => setConsole(panel.hidden));
// a click anywhere on the console types into it (unless text is being selected to copy)
panel.addEventListener('mouseup', () => {
  if (!window.getSelection()?.toString()) input.focus();
});
/** Where a key was pressed, and how far the opening has got, for keyAction. */
function keyTarget(t: EventTarget | null): KeyTarget {
  if (t === input) return 'console';
  // the Rules drawer, the Story's own blocks, and Blockly's pop-ups: their keys are theirs
  if (t instanceof Element && t.closest('#rules, .program, .blocklyWidgetDiv, .blocklyDropDownDiv')) return 'editor';
  if (t instanceof HTMLInputElement && t.type === 'range') return 'slider';
  return t instanceof Element && t.closest('button, a[href], a[aria-disabled], select, textarea, input') ? 'control' : 'page';
}
function openingState(): OpeningState {
  if (waiting) return 'waiting';
  if (!opening) return 'none';
  return opening.started ? 'unfolding' : 'held';
}
window.addEventListener('keydown', (e) => {
  // a key something on the page has already used (Blockly's own navigation) is not the page's too
  if (e.defaultPrevented) return;
  // Native disclosure activation and reading/scrolling keep their keys, without starting or advancing the game.
  if (e.target instanceof Element && e.target.closest('#game-info')) return;
  const action = keyAction(e.key, keyTarget(e.target), openingState(), mode === 'story', document.documentElement.dir === 'rtl');
  // a focused button or link presses itself (its own click does the rest)
  if (action === 'native' || action === 'none') return;
  e.preventDefault();
  if (action === 'start') startOrSkip();
  else if (action === 'skip') skipOpening();
  else if (action === 'toggle-console') setConsole(panel.hidden);
  else if (action === 'focus-console') setConsole(true);
  else if (action === 'play-pause') { engage('keyboard_play'); runLine(session.playing ? 'pause' : 'play'); }
  else if (action === 'story-next') runner?.next();
  else if (action === 'story-back') runner?.back();
  else {
    // slow motion, to watch (or teach) the beats one by one
    const next = action === 'slower' ? session.speed / 2 : session.speed * 2;
    runLine(`speed ${Math.min(4, Math.max(1 / 16, next))}`);
  }
});
// the console is a developer's: closed unless asked for (` or the ›_ button, or ?console=1)
setConsole(!embed && search.get('console') === '1');

// ——— pointer ———

let holding = false;
let sliding = false;
/** Taps on each square in a row, for a giggle on the second. */
let tapped = -1;
let tappedAt = 0;
canvas.addEventListener('pointerdown', (e) => {
  if (opening || waiting) {
    startOrSkip();
    return;
  }
  const [x, y] = view.toWorld(e.clientX, e.clientY);
  // a line the reader drags (the Story's): its grip or anywhere along it
  if (session.handleAt(x, (HANDLE_GRIP + 6) / Math.max(1, view.floor.scale))) {
    sliding = true;
    canvas.setPointerCapture(e.pointerId);
    session.dragHandle(x);
    return;
  }
  const i = session.stage.pick(x, y);
  session.selected = i;
  // in Learn, a tap anywhere on the yard goes on, a swipe up or down goes on or back (decided as the finger lifts)
  if (mode === 'story') swipe = { x: e.clientX, y: e.clientY, id: e.pointerId };
  if (i < 0) return;
  // a square is glad you came; tapped again soon, it giggles
  const again = i === tapped && e.timeStamp - tappedAt < 1500;
  tapped = i;
  tappedAt = e.timeStamp;
  session.ask([i], again ? 'amused' : 'cheer', 1.5);
  if (mode === 'story') return;
  engage('square');
  if (!embed) runLine(`who ${i}`);
  if (session.drag !== 'off' && session.stage.grab(i, session.drag === 'lift')) {
    holding = true;
    canvas.setPointerCapture(e.pointerId);
  }
});
canvas.addEventListener('pointermove', (e) => {
  const [x, y] = view.toWorld(e.clientX, e.clientY);
  view.pointer = { x, y, at: e.timeStamp };
  if (sliding) {
    session.dragHandle(x);
    return;
  }
  if (!holding) {
    canvas.style.cursor = session.handleAt(x, (HANDLE_GRIP + 6) / Math.max(1, view.floor.scale)) ? 'ew-resize' : '';
    return;
  }
  session.stage.drag(x, y);
});
const drop = () => {
  sliding = false;
  swipe = null;
  if (!holding) return;
  holding = false;
  session.stage.release();
};
/** Where a finger came down on the yard in Learn: lifted, a tap or a swipe. */
let swipe: { x: number; y: number; id: number } | null = null;
/** A swipe: this far (px), mostly up or down. */
const SWIPE = 40;
canvas.addEventListener('pointerup', (e) => {
  const s = swipe;
  if (s && s.id === e.pointerId && mode === 'story') {
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    // a swipe is a scroll: it never cuts what is playing; a tap is a press of Next
    if (Math.abs(dy) > SWIPE && Math.abs(dy) > 1.5 * Math.abs(dx)) runner?.later(dy < 0 ? 1 : -1);
    else if (Math.hypot(dx, dy) < SWIPE / 2) runner?.next();
  }
  drop();
});
canvas.addEventListener('pointercancel', drop);
// in Learn, scrolling goes on (down) or back (up): a step per flick, however many wheel events it makes, and only
// once what is playing has finished (never cut); not over what scrolls itself (the panel, the blocks, the console)
let wheel = 0;
let wheelUntil = 0;
window.addEventListener(
  'wheel',
  (e) => {
    if (mode !== 'story' || !runner) return;
    if (e.target instanceof Element && e.target.closest('#side, #rules, .program, .blocklyWidgetDiv')) return;
    const now = performance.now();
    if (now < wheelUntil) return;
    wheel += e.deltaMode === 1 ? 16 * e.deltaY : e.deltaY;
    if (Math.abs(wheel) < 60) return;
    runner.later(wheel > 0 ? 1 : -1);
    wheel = 0;
    wheelUntil = now + 700;
  },
  { passive: true },
);
canvas.addEventListener('pointerleave', () => (view.pointer = null));

/** The last chart flown to its square (the session's handoff count). */
let flown = 0;
/**
 * A chart taught in the yard goes to its square in the panel (owner, 2026-10-21): a picture of it, cut from the
 * canvas, shrinks and flies there; the square, hidden meanwhile, shows as it lands. In Learn only.
 */
/** A handoff's print: its white border, CSS px (stage.css .flight.print). */
const PRINT_BORDER = 6;
function flyHandoff(): void {
  const h = session.handoff;
  if (!h || h.id === flown) return;
  const tile = mode === 'story' ? panelView.tile(h.kind) : null;
  if (!tile) {
    flown = h.id;
    return;
  }
  // its square shows on the panel's next frame
  if (tile.hidden) return;
  flown = h.id;
  const r = canvas.getBoundingClientRect();
  const f = view.floor;
  const sx = f.left + h.box.x * f.scale;
  const sy = f.bottom - (h.box.y + h.box.h) * f.scale;
  const sw = h.box.w * f.scale;
  const sh = h.box.h * f.scale;
  if (!(sw > 4 && sh > 4)) return;
  const ratio = canvas.width / Math.max(1, canvas.clientWidth);
  const shot = document.createElement('canvas');
  shot.width = Math.round(sw * ratio);
  shot.height = Math.round(sh * ratio);
  shot.getContext('2d')?.drawImage(canvas, sx * ratio, sy * ratio, sw * ratio, sh * ratio, 0, 0, shot.width, shot.height);
  // a photograph (owner, 2026-10-22): the flash on the yard, the print in its white border, then to its square
  const left = r.left + sx - PRINT_BORDER;
  const top = r.top + sy - PRINT_BORDER;
  const pw = sw + 2 * PRINT_BORDER;
  const ph = sh + 2 * PRINT_BORDER;
  shot.className = 'flight print';
  // border-box (stage.css): the print's size takes its border in
  Object.assign(shot.style, { left: `${left}px`, top: `${top}px`, width: `${pw}px`, height: `${ph}px` });
  if (!view.reduced) {
    const flash = document.createElement('div');
    flash.className = 'flash';
    Object.assign(flash.style, { left: `${left}px`, top: `${top}px`, width: `${pw}px`, height: `${ph}px` });
    document.body.append(flash);
    flash.animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: 450, easing: 'ease-out', fill: 'forwards' }).onfinish = () => flash.remove();
  }
  document.body.append(shot);
  const to = tile.getBoundingClientRect();
  const k = Math.min(to.width / pw, to.height / ph);
  const dx = to.left + (to.width - pw * k) / 2 - left;
  const dy = to.top + (to.height - ph * k) / 2 - top;
  tile.classList.add('arriving');
  const flight = shot.animate(
    [
      { transform: 'none', opacity: 0, offset: 0 },
      { transform: 'rotate(-2deg)', opacity: 1, offset: 0.25 },
      { transform: 'rotate(-2deg)', opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(${k})`, opacity: 0.6, offset: 1 },
    ],
    { duration: view.reduced ? 1 : 1800, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'forwards' },
  );
  flight.onfinish = () => {
    shot.remove();
    tile.classList.remove('arriving');
  };
}

/** The yard's corner for whoever built a shared yard: its words, its link, inside the floor's top right. */
function placeCredit(): void {
  const c = session.credit;
  credit.hidden = !c || !!opening;
  if (!c || opening) return;
  const text = WORDS.credit.replace('{by}', c.by);
  if (credit.textContent !== text) credit.textContent = text;
  if (c.url) credit.href = c.url;
  else credit.removeAttribute('href');
  const r = canvas.getBoundingClientRect();
  const f = view.floor;
  credit.style.left = `${r.left + f.right - credit.offsetWidth - 10}px`;
  credit.style.top = `${r.top + f.top + 8}px`;
}

// ——— frame ———

let last = performance.now();
let fps = 60;
let hudAt = 0;
/** How far down the canvas the console's toggle reaches, where it lies over it (portrait): the title line keeps below it. */
function toggleOver(): number {
  if (toggle.hidden || getComputedStyle(toggle).display === 'none') return 0;
  const t = toggle.getBoundingClientRect();
  const c = canvas.getBoundingClientRect();
  const over = t.right > c.left && t.left < c.right && t.bottom > c.top && t.top < c.bottom;
  return over ? t.bottom - c.top + 4 : 0;
}

function frame(now: number): void {
  view.clearTop = toggleOver();
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  if (dt > 0) fps += (1 / dt - fps) * 0.05;
  if (opening || waiting) {
    // the opening has the canvas; the stage waits, folded in the box, and takes over with its faces
    if (opening) {
      lockupFace.update(0, dt, pointerAt);
      opening.frame(dt);
      place(byline, opening.byline);
      place(lockup, null);
      menu.forEach((el, k) => place(el, opening?.controls[k] ?? null));
      if (opening.done) {
        chooseEntry(storyNext ? 'learn' : 'play');
        // its faces go on only in the stage it was made for: a command may have rebuilt it meanwhile
        if (opening.belongsTo(session)) view.adopt(opening.field, session);
        opening = null;
        if (storyNext) {
          storyNext = false;
          enterStory();
        }
      }
    }
    hud.hidden = question.hidden = caption.hidden = true;
    badges.hidden = true;
    renderLog();
    requestAnimationFrame(frame);
    return;
  }
  runner?.frame(dt);
  session.frame(dt);
  lockupFace.update(statsOf(session.game.wealth).gini, dt, pointerAt);
  view.render(session, dt, now);
  placeStory(now);
  // the panel's top lines up with the yard's
  const yardTop = `${Math.round(view.yardTop - 3)}px`; // the wall's outer edge (a 3 px line)
  if (app.style.getPropertyValue('--yard-top') !== yardTop) app.style.setProperty('--yard-top', yardTop);
  // a portrait page: the yard at the top, as tall as it needs, everything else under it (stage.css)
  const yardH = `${Math.ceil(view.natural)}px`;
  if (app.style.getPropertyValue('--yard-h') !== yardH) app.style.setProperty('--yard-h', yardH);
  // the panel's squares end where the yard ends (its walls, 3 px, outside the floor)
  panelView.fit(view.floor.bottom + 3 - (view.yardTop - 3));
  panelView.update(now);
  drawer.update();
  const playing = session.playing ? '❚❚ Pause' : '▶ Play';
  if (drawerPlay.textContent !== playing) drawerPlay.textContent = playing;
  place(byline, named);
  place(lockup, titled);
  placeCredit();
  flyHandoff();
  menu.forEach((el, k) => place(el, buttons[k] ?? null));
  // Play's name says what it will do, as its cue does (in the Story it goes to Play)
  const label = mode === 'play' && session.playing ? WORDS.panel.pause : WORDS.tabs.play;
  if (play.textContent !== label) play.textContent = label;
  for (const el of menu) {
    const current = el.dataset.go === tab();
    if ((el.getAttribute('aria-current') === 'page') !== current) {
      if (current) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    }
  }
  if (session.question) {
    question.hidden = false;
    question.textContent = session.question;
  } else question.hidden = true;
  caption.hidden = !session.caption;
  if (caption.textContent !== session.caption) caption.textContent = session.caption;
  hud.hidden = !session.hud;
  if (session.hud && now - hudAt > 250) {
    hudAt = now;
    const o = session.stage.overlaps();
    const where = session.stage.posing ? (session.stage.done ? 'in place' : 'moving') : 'wandering';
    const script = session.script ? ` · script ${session.script.name}` : '';
    const pace = session.speed !== 1 ? ` · speed ${+session.speed.toFixed(4)} ([ ])` : '';
    hud.textContent = `n ${session.game.n} · trades ${session.game.trades}${session.playing ? ' ▸' : ''} · ${where}${script}${pace} · overlaps ${o.pairs} · ${Math.round(fps)} fps`;
  }
  renderLog();
  requestAnimationFrame(frame);
}
renderLog();
requestAnimationFrame(frame);

/**
 * The Story's screen: the words (and the guess) over the yard's top; the rest is in the panel, as in Play (it
 * shows what the story has revealed so far). The room keeps its squares under the words (the session's band).
 * The badges (a console command's, not the story's) in the floor's top-left corner, under the words.
 */
function placeStory(now: number): void {
  const c = canvas.getBoundingClientRect();
  const f = view.floor;
  let top = 0;
  if (mode === 'story' && runner) {
    strip.update(now);
    panelView.showing = strip.showing;
    const say = strip.say.style;
    const quarter = runner.beat?.words === 'quarter';
    // the words in the yard's top-left quarter (the rest is the widget's), or across its top
    say.left = `${c.left + f.left}px`;
    say.top = `${c.top + f.top}px`;
    say.width = `${Math.max(120, (f.right - f.left) / (quarter ? 2 : 1))}px`;
    say.height = quarter ? `${(f.bottom - f.top) / 2}px` : '';
    strip.say.classList.toggle('quarter', quarter);
    const words = strip.say.getBoundingClientRect();
    const scale = Math.max(1, f.scale);
    top = words.height > 0 && !quarter ? words.bottom - (c.top + f.top) + 6 : 0;
    const want: [number, number] = [0, Math.round((YARD - top / scale) * 50) / 50];
    const band = session.band;
    if (!band || Math.abs(band[0] - want[0]) > 0.03 || Math.abs(band[1] - want[1]) > 0.03) {
      session.band = want;
      session.recompile();
    }
  }
  const b = session.badges;
  badges.hidden = !(b.round || b.gini || b.trades);
  if (!badges.hidden) {
    badges.style.left = `${c.left + f.left + 10}px`;
    badges.style.top = `${c.top + f.top + top + 4}px`;
    const parts: string[] = [];
    if (b.trades) parts.push(`${STORY.ui.trades} ${session.game.trades + session.gifts}`);
    if (b.round) parts.push(`${STORY.ui.round} ${session.game.run.round}`);
    if (b.gini) parts.push(`${STORY.ui.gini} ${statsOf(session.game.wealth).gini.toFixed(2)}`);
    const text = parts.join(' · ');
    if (badges.textContent !== text) badges.textContent = text;
  }
}
