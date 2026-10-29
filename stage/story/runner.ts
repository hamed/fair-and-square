/**
 * The story runner: beats (beats.ts) played on a session, one at a time, at the reader's pace. Headless: the
 * strip (strip.ts) only shows what it says and forwards what the reader does.
 *
 * A beat starts by saving a checkpoint (the session's share link and its view's state), configuring its widget,
 * and starting its lines as a script. Its words show at once; it is *ready* when its lines are done, and *met*
 * when the reader has done what it waits for. Next on a beat still playing finishes it at once (the session's
 * hurry); on a ready, met beat it goes on. Back loads the previous beat's checkpoint and plays it again, to the bit.
 * An act can be entered directly: its first beat's `enter` lines build its yard, at once.
 *
 * It knows no beat: only the waits, the controls and the widget contract.
 */
import { Session, share, type ViewState } from '../console/session.ts';
import { statsOf } from '../core/stats.ts';
import { ACT_STARTS, BEATS, SNAP, linesOf, type Beat } from './beats.ts';
import { STORY, type ChoiceKey } from './words.en.ts';
import type { Widget, WidgetEvent, Widgets } from './widgets.ts';
import type { Showing } from '../view/panel.ts';
import type { AnalyticsData, AnalyticsEvent } from '../analytics.ts';

/** The page the story plays on. */
export interface StoryHost {
  session(): Session;
  setSession(s: Session): void;
  /** The story is over, or left. */
  ended(): void;
  analytics?(event: AnalyticsEvent, data: AnalyticsData): void;
}

interface Checkpoint {
  readonly hash: string;
  readonly view: ViewState;
}

/** Seconds a waiting beat waits before it offers Show me. */
const SHOW_ME_AFTER = 8;
/** Seconds a slider rests before its beat goes on by itself. */
const REST = 0.6;
/** Seconds before a beat's words show their second part (when it waits for nothing). */
const SECOND_AFTER = 1.6;
/** The script name the story's lines run under. */
const SCRIPT = 'story';
let runSequence = 0;

export class StoryRunner {
  readonly beats: readonly Beat[];
  /** The beat on stage, -1 before the first. */
  at = -1;
  /** Seconds the ready beat has waited for the reader. */
  idle = 0;
  /** Show me offered (after SHOW_ME_AFTER, or a Next that could not go on). */
  offer = false;
  /** The reader's guess, by beat. */
  readonly chosen = new Map<number, ChoiceKey>();
  /** Bumps whenever what the strip shows changes (a beat, a met wait, an offer). */
  revision = 0;
  private met = false;
  /** Slider values when the beat started, to tell a move. */
  private startValues = new Map<string, number>();
  /** Sliders moved off their mark this beat: one that starts on its mark must be tried first (owner, 2026-10-22). */
  private left = new Set<string>();
  /** The beat's sliders as last seen, and seconds they have rested: a slider beat goes on once it rests. */
  private seen = '';
  private rest = 0;
  /** Who you were when the beat started (Be a square makes a new one). */
  private youAt: unknown = null;
  private readonly checkpoints: (Checkpoint | undefined)[] = [];
  /** A scroll's step waiting for the beat to finish: on (1), back (−1), none (0). */
  private pending: 0 | 1 | -1 = 0;
  /** Seconds since the beat began; its words' second part asked for (Next). */
  private since = 0;
  private shown = false;
  /** The players' split as the beat began (a wealth wait is met once it moves). */
  private splitAt = NaN;
  private mounted: { name: string; widget: Widget } | null = null;
  /** What each widget last told the story (a pick), handed back in its config when it is shown again (Back). */
  private readonly told = new Map<string, WidgetEvent>();
  /** Show me sweeping the line: seconds into the sweep, or -1. */
  private sweep = -1;
  private sweepFrom = 0;
  private readonly host: StoryHost;
  private readonly widgets: Widgets;
  private analyticsRun = 0;
  private readonly actsSeen = new Set<number>();
  private readonly questionsSeen = new Set<string>();
  private readonly answers = new Map<string, { answer: string; attempt: number }>();
  private usedHelp = false;
  private skipped = false;
  /** Seconds since the beat's wait was met (an `auto` beat's linger). */
  private sinceMet = 0;
  /** A fork taken past an act: from that beat to the act after, so Back from there returns to the fork. */
  private leapt: { readonly from: number; readonly to: number } | null = null;
  /** The trading rate as the beat began: given back if its lines are cut short (a fast-forward's, review 2026-10-29). */
  private rateAt: number | null = null;
  private completed = false;
  /** A button's lines running (the strip's Play), not the beat's own. */

  constructor(host: StoryHost, widgets: Widgets = {}, beats: readonly Beat[] = BEATS) {
    this.host = host;
    this.widgets = widgets;
    this.beats = beats;
  }

  /** The session the story plays on. */
  get session(): Session {
    return this.host.session();
  }

  get beat(): Beat | null {
    return this.beats[this.at] ?? null;
  }

  get act(): number {
    return this.beat?.act ?? 0;
  }

  /** The beat's lines are still playing. */
  get playing(): boolean {
    return this.host.session().script?.name === SCRIPT;
  }

  /** What the beat waits for has been done (or it waits for nothing). */
  get done(): boolean {
    return this.met || !this.beat?.wait;
  }

  /** Next would go on now. */
  get ready(): boolean {
    return !this.playing && this.done;
  }

  get last(): boolean {
    return this.at === this.beats.length - 1;
  }

  /** From the first beat (or any): the session goes on from where it is. */
  start(at = 0): void {
    this.analyticsRun = 0;
    this.actsSeen.clear();
    this.questionsSeen.clear();
    this.answers.clear();
    this.usedHelp = this.skipped = this.completed = false;
    this.leapt = null;
    this.go(at);
  }

  /** Into act `a` directly: its yard built at once, then its first beat. */
  enterAct(a: number, action: 'jump_act' | null = 'jump_act'): void {
    if (action) {
      this.ensureAnalytics();
      this.skipped ||= a > this.act;
      this.emit('learn_action', { action, act: this.act + 1, beat: this.beat?.key ?? '', destination_act: a + 1 });
    }
    this.leapt = null;
    const k = ACT_STARTS[Math.max(0, Math.min(ACT_STARTS.length - 1, a))];
    const enter = this.beats[k].enter;
    if (enter) {
      const s = new Session();
      s.band = this.host.session().band;
      s.runAtOnce('enter', linesOf(enter));
      this.host.setSession(s);
    }
    this.go(k);
  }

  /**
   * A beat's words may come in two parts (a line break in them, owner 2026-10-21): the second shows after
   * SECOND_AFTER seconds, or once the beat's wait is met, or when Next asks for it before going on.
   */
  get second(): boolean {
    const b = this.beat;
    if (!b || this.shown || !STORY.beats[b.key].includes('\n')) return true;
    return b.wait ? this.met : this.since >= SECOND_AFTER;
  }

  /** The tap, Space, →: finish the beat if it is playing; else go on if it is met; else offer help. */
  next(): void {
    if (this.at < 0) return this.go(0);
    if (this.playing) {
      // a slow step is not hurried: it is the point
      if (this.beat?.steady) return;
      this.host.session().hurry();
      this.touch();
      return;
    }
    // the page's own controls may have moved since the last frame (a key, then Enter at once)
    if (!this.done && this.beat) this.watch(this.beat, this.host.session());
    if (!this.done) {
      this.offer = !this.beat?.must;
      this.touch();
      return;
    }
    // the words' second part first, if it has not come yet
    if (!this.second) {
      this.shown = true;
      this.touch();
      return;
    }
    if (this.last) return this.end();
    this.go(this.at + 1);
  }

  /**
   * A scroll or a swipe (owner, 2026-10-21: an accidental scroll never jumps or cuts): on (`1`) or back (`-1`), but
   * only once what is playing has finished; Next, Space and → stay the skip that hurries it.
   */
  later(dir: 1 | -1): void {
    if (!this.playing) return dir > 0 ? this.next() : this.back();
    this.pending = dir;
  }

  /** ←: the beat before, played again from its checkpoint (an act's first beat entered afresh if there is none). */
  back(): void {
    // past a fork's skipped act: back to the fork
    let k = this.leapt?.to === this.at ? this.leapt.from : this.at - 1;
    // a step of something slow goes back to where that began
    while (k > 0 && this.beats[k].continues) k--;
    if (k < 0) return this.go(Math.max(0, this.at));
    const cp = this.checkpoints[k];
    if (!cp) {
      this.enterAct(this.beats[k].act, null);
      return;
    }
    this.restore(cp);
    this.go(k);
  }

  /** The next act's first beat (Skip act); past the last, the end. */
  skipAct(): void {
    this.ensureAnalytics();
    this.skipped = true;
    this.emit('learn_action', { action: 'skip_act', act: this.act + 1, beat: this.beat?.key ?? '' });
    const a = this.act + 1;
    if (a >= ACT_STARTS.length) return this.end();
    this.enterAct(a, null);
  }

  /** The story is over (or left): what it put on top comes off; the yard stays as it is. */
  end(): void {
    this.leave();
    this.host.ended();
  }

  /** Leaving: the widget goes, the beat's lines stop, the overlays come off. The yard stays. */
  leave(): void {
    this.unmount();
    const s = this.host.session();
    this.cut(s);
    // what the story held goes on (review 2026-10-21, 1): a levy held at its pot plays on, Play can trade
    s.transit.holdAt = null;
    if (s.goal?.kind === 'levy') s.goal = null;
    // Learn's coin flips stay in Learn (owner, 2026-10-22: in Play they are not practical): trades as pieces again
    s.run(`veil off; fx chart off; guide off; stakes off; taxes off; divide off; glow off; badge off; money off; speed 1${s.transit.trade === 'toss' ? '; fx trade piece' : ''}`);
    // partners named for the story go back to the room
    if (s.partners !== null) s.cancelMeeting();
    s.standing = false;
    s.band = null;
    s.recompile();
    this.at = -1;
    this.touch();
  }

  // ——— what the reader does ———

  /** A slider in the strip moved. */
  slide(name: string, value: number): void {
    const b = this.beat;
    const w = b?.wait;
    let v = value;
    // close to the mark: on it
    if (w?.kind === 'slide' && w.to !== undefined && (w.name === name || w.name === '*') && Math.abs(v - w.to) <= this.snap(name)) v = w.to;
    this.host.session().slide(name, v);
    if (w?.kind === 'slide' && (w.name === name || w.name === '*')) {
      const moved = Math.abs(v - (this.startValues.get(name) ?? v)) > 1e-9;
      if (w.to !== undefined && Math.abs(v - w.to) > this.snap(name)) this.left.add(name);
      if (w.to !== undefined ? v === w.to && this.tried(name, w.to) : moved) this.satisfy();
    }
    this.touch();
  }

  /** The wealth slider: the two players' money shared, `f` to the left one. */
  split(f: number): void {
    const s = this.host.session();
    s.run(`split ${Math.min(0.75, Math.max(0.25, f)).toFixed(3)}`);
    if (this.beat?.wait?.kind === 'split' && Math.abs(s.split - this.splitAt) > 0.01) this.satisfy();
    this.touch();
  }

  /** The reader's guess. */
  choose(key: ChoiceKey, method: 'manual' | 'assisted' = 'manual'): void {
    if (!this.beat?.controls?.choices?.includes(key)) return;
    const s = this.session;
    const pair = s.pairs;
    const [a, b] = pair && pair.length >= 2 ? [pair[0], pair[1]] : [0, 1];
    const [left, right] = s.stage.x[a] <= s.stage.x[b] ? [a, b] : [b, a];
    this.answer('prediction', key, { method, left_share: s.game.wealth[left], right_share: s.game.wealth[right] });
    this.chosen.set(this.at, key);
    this.host.session().run('face all curious; face all camera 2');
    if (this.beat.wait?.kind === 'choose') this.satisfy();
    this.touch();
  }

  /** One of a fork's two ways on: the next act (`on`), or past it to the act after (`skip`). */
  fork(way: 'on' | 'skip'): void {
    const b = this.beat;
    if (!b || b.wait?.kind !== 'fork') return;
    this.answer('photos', way === 'on' ? 'take' : 'skip', { method: 'manual' });
    this.satisfy();
    if (way === 'on') {
      // taken after all: Back from the act after the skipped one goes back beat by beat again
      this.leapt = null;
      if (this.last) return this.end();
      return this.go(this.at + 1);
    }
    const to = ACT_STARTS[b.act + 2];
    if (to === undefined) return this.end();
    // the yard goes on as it is: no act's yard is built, as when the reader walks there beat by beat
    this.leapt = { from: this.at, to };
    this.go(to);
  }

  /** The program was changed in its blocks (a number, or more): what a beat waiting for a change waits for. */
  edited(): void {
    const w = this.beat?.wait;
    if (w?.kind === 'edit' || (w?.kind === 'slide' && w.name === '*')) this.satisfy();
    this.touch();
  }

  /** A panel button, pressed for the reader (Show me): Play, or Be a square. */
  press(name: 'play' | 'be'): void {
    const b = this.beat;
    this.host.session().run(name);
    if (b?.wait?.kind === 'press' && b.wait.name === name) this.satisfy();
    this.touch();
  }

  /** The line's twin in the strip, or the pointer, moved the line: f of the way along. */
  line(f: number): void {
    const s = this.host.session();
    const g = s.guide;
    if (g?.kind !== 'line') return;
    g.f = Math.min(1, Math.max(0, f));
    g.moved = true;
    this.sweep = -1;
  }

  /** Show me: the reader's action, done for them. */
  showMe(): void {
    const b = this.beat;
    const w = b?.wait;
    if (!b || !w || this.done || w.kind === 'pick') return;
    this.usedHelp = true;
    this.emit('learn_action', { action: 'help', act: this.act + 1, beat: b.key });
    const s = this.host.session();
    if (w.kind === 'slide') {
      const name = w.name === '*' ? (b.controls?.sliders?.[0] ?? 'stake') : w.name;
      const now = s.game.run.sliders.get(name) ?? (name === 'tax' ? s.game.rules.tax : s.game.rules.beta);
      // a tenth of the slider's range down (or up, near its bottom)
      const spec = s.game.panel.sliders.find((x) => x.name === name);
      const step = 0.1 * (spec ? spec.max - spec.min : 0.5);
      // a mark the slider starts on: tried first (a step off it), then set there
      if (w.to !== undefined && !this.tried(name, w.to)) this.slide(name, Math.min(spec?.max ?? 1, w.to + 3 * step));
      this.slide(name, w.to ?? (now - step >= (spec?.min ?? 0) ? now - step : now + step));
    } else if (w.kind === 'choose') {
      const options = b.controls?.choices ?? [];
      if (options.length) this.choose(options[0], 'assisted');
    } else if (w.kind === 'split') {
      this.split(s.split > 0.5 ? 0.35 : 0.65);
    } else if (w.kind === 'drag') {
      const g = s.guide;
      this.sweepFrom = g?.kind === 'line' ? g.f : 0.3;
      this.sweep = 0;
    } else if (w.kind === 'press') {
      if (w.name === 'be' && !s.playing) s.run('play');
      this.press(w.name as 'play' | 'be');
    } else this.mounted?.widget.config({ ...(b.widget ?? {}), showMe: true });
    this.touch();
  }

  /** Each frame: a ready beat that waits counts up to Show me; an auto beat goes on; the line sweeps; the widget ticks. */
  frame(dt: number): void {
    const b = this.beat;
    if (!b) return;
    // a scroll asked for while the beat played: now that it has finished
    if (this.pending && !this.playing) {
      const dir = this.pending;
      this.pending = 0;
      return dir > 0 ? this.next() : this.back();
    }
    const s = this.host.session();
    this.mounted?.widget.frame?.(dt);
    if (this.sweep >= 0) {
      this.sweep += dt;
      const u = Math.min(1, this.sweep / 1.6);
      const g = s.guide;
      if (g?.kind === 'line') {
        g.f = this.sweepFrom + (0.92 - this.sweepFrom) * (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
        g.moved = true;
      }
      if (u >= 1) this.sweep = -1;
    }
    if (b.wait?.kind === 'drag' && !this.met && s.guide?.kind === 'line' && s.guide.moved) this.satisfy();
    if (!this.met) this.watch(b, s);
    this.since += dt;
    if (this.met) this.sinceMet += dt;
    if (this.playing) return;
    // a slider beat goes on once its slider rests, not while it is dragged through the mark (owner, 2026-10-22)
    if (b.wait?.kind === 'slide') {
      const now = this.knobs(b)
        .map((name) => s.game.run.sliders.get(name) ?? '')
        .join(' ');
      this.rest = now === this.seen ? this.rest + dt : 0;
      this.seen = now;
    }
    if (b.auto && this.done && !this.last && (b.wait?.kind !== 'slide' || this.rest >= REST) && (!this.met || this.sinceMet >= (b.linger ?? 0))) {
      this.go(this.at + 1);
      return;
    }
    if (!this.done) {
      this.idle += dt;
      if (!this.offer && this.idle >= SHOW_ME_AFTER && !b.must) {
        this.offer = true;
        this.touch();
      }
    }
  }

  /** The beat's words, its {values} filled in from the yard (HTML: **new words** in <strong>). */
  get text(): string {
    const b = this.beat;
    if (!b) return '';
    return fill(STORY.beats[b.key], this.host.session());
  }

  /**
   * What the panel shows by now: every slider, button and chart the story has revealed so far (each stays, as
   * the reader learns it), and the beat's mark; from a beat that reveals all, the whole panel, as Play has it (null).
   */
  get showing(): Showing | null {
    const sliders = new Set<string>();
    const controls = new Set<string>();
    let charts: boolean | Set<string> = new Set<string>(this.host.session().charted);
    // a beat that shows only its own: the rest put away while it lasts
    if (this.beat?.controls?.only) return { sliders: [...(this.beat.controls.sliders ?? [])], controls: [...(this.beat.controls.buttons ?? [])], charts: false, marks: [] };
    for (let k = 0; k <= this.at && k < this.beats.length; k++) {
      const c = this.beats[k].controls;
      if (!c) continue;
      if (c.all) return null;
      for (const s of c.sliders ?? []) sliders.add(s);
      for (const b of c.buttons ?? []) controls.add(b);
      if (c.charts === true) charts = true;
      else if (c.charts && charts !== true) for (const k of c.charts) charts.add(k);
    }
    const mark = this.beat?.controls?.mark;
    return { sliders: [...sliders], controls: [...controls], charts: charts === true ? true : [...charts], marks: mark ? [mark] : [], ...(this.beat?.controls?.card ? { card: true } : {}) };
  }

  /** The beat's words as plain text (for screen readers and tests). */
  get plain(): string {
    return this.text.replace(/<\/?strong>/g, '');
  }

  /** How near its mark slider `name` snaps onto it: a share of its range. */
  private snap(name: string): number {
    const spec = this.host.session().game.panel.sliders.find((x) => x.name === name);
    return SNAP * (spec ? spec.max - spec.min : 1);
  }

  /** The sliders a beat's slide wait is about. */
  private knobs(b: Beat): string[] {
    const w = b.wait;
    if (w?.kind !== 'slide') return [];
    if (w.name !== '*') return [w.name];
    return [...(b.controls?.sliders ?? []), ...(b.controls?.program ? ['stake', 'tax'] : [])];
  }

  /**
   * The reader acts on the page's own controls too (the panel's sliders, its Be a square): moved past where
   * the beat began, or onto the mark (a slider near it is put on it), the wait is met; a new you, likewise.
   */
  private watch(b: Beat, s: Session): void {
    const w = b.wait;
    if (w?.kind === 'press' && w.name === 'be' && s.you && s.you !== this.youAt) {
      this.satisfy();
      return;
    }
    if (w?.kind !== 'slide') return;
    for (const name of this.knobs(b)) {
      const v = s.game.run.sliders.get(name);
      if (v === undefined) continue;
      if (w.to !== undefined) {
        if (Math.abs(v - w.to) > this.snap(name)) this.left.add(name);
        else if (v !== w.to) s.slide(name, w.to);
        if ((s.game.run.sliders.get(name) ?? v) === w.to && this.tried(name, w.to)) this.satisfy();
      } else if (Math.abs(v - (this.startValues.get(name) ?? v)) > 1e-9) this.satisfy();
    }
  }

  // ——— internals ———

  /** Slider `name` is at its mark `to` by the reader's hand: it started elsewhere, or has been off it this beat. */
  private tried(name: string, to: number): boolean {
    return this.left.has(name) || Math.abs((this.startValues.get(name) ?? to) - to) > 1e-9;
  }

  private go(k: number): void {
    const b = this.beats[k];
    if (!b) return;
    this.cut(this.host.session());
    this.pending = 0;
    this.since = 0;
    this.shown = false;
    const s = this.host.session();
    // the beat starts here: kept, so Back can play it again exactly
    this.checkpoints[k] = { hash: s.share(), view: s.viewState() };
    this.at = k;
    this.ensureAnalytics();
    if (!this.actsSeen.has(b.act)) {
      this.actsSeen.add(b.act);
      this.emit('learn_progress', { act: b.act + 1 });
    }
    const question = b.wait?.kind === 'choose' ? 'prediction' : b.wait?.kind === 'pick' ? 'yard' : b.wait?.kind === 'fork' ? 'photos' : '';
    if (question && !this.questionsSeen.has(question)) {
      this.questionsSeen.add(question);
      this.emit('learn_choice_shown', { question });
    }
    if (b.key === 'open' && !this.completed) {
      this.completed = true;
      this.emit('learn_complete', { skipped: this.skipped, assisted: this.usedHelp });
    }
    this.met = false;
    this.sinceMet = 0;
    this.offer = false;
    this.idle = 0;
    this.sweep = -1;
    this.startValues = new Map([...s.game.run.sliders.entries()]);
    this.left = new Set();
    this.seen = '';
    this.rest = 0;
    this.splitAt = s.split;
    this.youAt = s.you;
    this.rateAt = s.rate;
    const knobs = [...(b.controls?.sliders ?? []), ...(b.controls?.program ? ['stake', 'tax'] : [])];
    for (const name of knobs) if (!this.startValues.has(name)) this.startValues.set(name, name === 'tax' ? s.game.rules.tax : s.game.rules.beta);
    // the widget first: it may hand the story another session, which the lines then play on
    if (b.widget) this.mountOrConfig(b.widget);
    else this.unmount();
    const lines = linesOf(b.run);
    const now = this.host.session();
    if (now.script?.name === SCRIPT) now.script = null;
    if (lines.length) now.start(SCRIPT, lines);
    this.touch();
  }

  /** The beat's lines, if still playing, stop here; a trading rate they set for a while goes back to the beat's start. */
  private cut(s: Session): void {
    if (s.script?.name !== SCRIPT) return;
    s.script = null;
    s.rate = this.rateAt;
  }

  private restore(cp: Checkpoint): void {
    const s = Session.load(cp.hash);
    s.applyViewState(cp.view);
    // the yard as it was a moment ago: everyone goes from where they stand to the beat's places, nobody jumps
    s.stage.takePlaces(this.host.session().stage);
    this.host.setSession(s);
  }

  private mountOrConfig(beat: NonNullable<Beat['widget']>): void {
    const { name } = beat;
    const told = this.told.get(name);
    const spec = told ? { ...beat, told } : beat;
    if (this.mounted?.name === name) {
      this.mounted.widget.config(spec);
      return;
    }
    this.unmount();
    const widget = this.widgets[name];
    if (!widget) return;
    this.mounted = { name, widget };
    widget.mount(
      {
        session: () => this.host.session(),
        setSession: (s) => this.host.setSession(s),
        emit: (e) => this.event(e),
      },
      spec,
    );
  }

  private unmount(): void {
    this.mounted?.widget.cleanup();
    this.mounted = null;
  }

  private event(e: WidgetEvent): void {
    if (this.mounted) this.told.set(this.mounted.name, e);
    const w = this.beat?.wait;
    if (e.kind === 'picked' && w?.kind === 'pick') this.answer('yard', String(e.analytics?.yard_id ?? `position_${e.index}`), { ...e.analytics, method: 'manual' });
    if ((e.kind === 'picked' && w?.kind === 'pick') || (e.kind === 'edited' && w?.kind === 'edit')) this.satisfy();
    this.touch();
  }

  private satisfy(): void {
    if (this.met) return;
    this.met = true;
    this.sinceMet = 0;
    this.offer = false;
    this.touch();
  }

  private ensureAnalytics(): void {
    if (this.analyticsRun) return;
    this.analyticsRun = ++runSequence;
    this.emit('learn_start');
  }

  private emit(event: AnalyticsEvent, data: AnalyticsData = {}): void {
    this.host.analytics?.(event, { ...data, run: this.analyticsRun });
  }

  private answer(question: string, answer: string, data: AnalyticsData): void {
    const previous = this.answers.get(question);
    if (previous?.answer === answer) return;
    const attempt = (previous?.attempt ?? 0) + 1;
    this.answers.set(question, { answer, attempt });
    this.emit('learn_choice', { ...data, question, answer, attempt });
  }

  private touch(): void {
    this.revision++;
  }
}

/** Words with their {values} from the yard; **bold** as <strong>; anything else escaped. */
export function fill(words: string, s: Session): string {
  const t = statsOf(s.game.wealth);
  const rules = s.game.rules;
  const w = s.game.wealth;
  let total = 0;
  let top = 0;
  for (let i = 0; i < w.length; i++) {
    total += w[i];
    if (w[i] > w[top]) top = i;
  }
  // the two players (the partners named, else the first two): the richer one's money over the poorer one's
  const pair = s.pairs;
  const [a, b] = pair && pair.length >= 2 ? [pair[0], pair[1]] : [0, 1];
  const hi = Math.max(w[a] ?? 0, w[b] ?? 0);
  const lo = Math.min(w[a] ?? 0, w[b] ?? 0);
  const ratio = lo > 0 ? hi / lo : Infinity;
  // 100 after a loss at the stake, then after a win: the poorer one's money, if it stays the poorer
  const money = (x: number) => String(+x.toFixed(1));
  const values: Record<string, string> = {
    gini: t.gini.toFixed(2),
    // the Gini measured is the gap's share of the triangle: one square with everything fills all but its own step
    ginimax: ((s.game.n - 1) / Math.max(1, s.game.n)).toFixed(2),
    neff: t.neff >= 10 ? t.neff.toFixed(0) : t.neff.toFixed(1),
    n: String(s.game.n),
    stake: share(rules.beta),
    tax: share(rules.tax),
    ratio: Number.isFinite(ratio) ? (ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(1)) : '∞',
    top: share(total > 0 ? w[top] / total : 0),
    lose: money(100 * (1 - rules.beta)),
    back: money(100 * (1 - rules.beta) * (1 + rules.beta)),
  };
  const escaped = words.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  return escaped.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
