/**
 * The console's words: every command (`COMMANDS`, each a usage, its help, and what it does to a session), the
 * checks their arguments pass before anything changes, and the vocabulary the prompt completes from. A command
 * reads and changes a session through its public face only; session.ts runs it as one transaction.
 */
import { LOOKS, type FaceLook } from '../essay/face/face.ts';
import { FEELINGS } from '../essay/face/moments.ts';
import { readProgram } from '../../model/ast.ts';
import { GAUGE } from '../acts/guides.ts';
import { BOX } from '../core/figure.ts';
import { MAX_TRADES } from '../core/game.ts';
import { PRESETS, RECIPE_WORDS, formatRecipe, parseRecipe } from '../core/recipe.ts';
import type { YieldRule } from '../core/stage.ts';
import { statsOf } from '../core/stats.ts';
import { SCRIPTS } from './scripts.ts';
import type { Session } from './session.ts';

interface Command {
  readonly usage: string;
  readonly help: string;
  run(s: Session, args: string[]): string;
}

/**
 * `text` wrapped to `width` characters at spaces. Its leading spaces are kept;
 * later lines start with `indent` spaces. A word longer than a line is broken.
 */
function wrap(text: string, width: number, indent: number): string {
  if (text.length <= width) return text;
  const lead = /^\s*/.exec(text)![0];
  return hang(lead, text.slice(lead.length), width, indent);
}

/** `prefix` as given (a padded usage column), then `text` wrapped beside it, later lines indented by `indent`. */
function hang(prefix: string, text: string, width: number, indent: number): string {
  const room = Math.max(8, width - indent);
  const lines: string[] = [];
  let line = prefix;
  let first = true;
  for (let word of text.split(/\s+/).filter(Boolean)) {
    for (;;) {
      const limit = first ? width : indent + room;
      const gap = line.length > (first ? prefix.length : indent) ? 1 : 0;
      if (line.length + gap + word.length <= limit) {
        line += (gap ? ' ' : '') + word;
        break;
      }
      if (line.length > (first ? prefix.length : indent)) {
        lines.push(line);
        line = ' '.repeat(indent);
        first = false;
        continue;
      }
      // a word longer than the line: break it
      const take = Math.max(1, limit - line.length);
      lines.push(line + word.slice(0, take));
      word = word.slice(take);
      line = ' '.repeat(indent);
      first = false;
    }
  }
  lines.push(line);
  return lines.join('\n');
}

/** Preset names inside a recipe stand for their words: "squared ccdf" is "squared log bar desc stack". */
export function expandPresets(text: string): string {
  return text
    .split(/\s+/)
    .map((w) => (Object.hasOwn(PRESETS, w.toLowerCase()) ? PRESETS[w.toLowerCase()] : w))
    .join(' ');
}

// ——— argument checks: all throw before anything changes ———

function count(arg: string | undefined, name: string, lo: number, hi: number): number {
  if (arg === undefined || !/^\d+$/.test(arg)) throw new RangeError(`${name} must be a whole number`);
  const v = Number(arg);
  if (v < lo || v > hi) throw new RangeError(`${name} must be in [${lo}, ${hi}]`);
  return v;
}

function real(arg: string | undefined, name: string, lo: number, hi: number): number {
  const v = arg === undefined ? NaN : Number(arg);
  if (!(v >= lo && v <= hi)) throw new RangeError(`${name} must be a number in [${lo}, ${hi}]`);
  return v;
}

function onOff(arg: string | undefined, current: boolean): boolean {
  if (arg === undefined) return !current;
  if (arg === 'on') return true;
  if (arg === 'off') return false;
  throw new RangeError('expected on or off');
}

export function checkLook(v: string): FaceLook | 'off' {
  if (v === 'off' || (LOOKS as readonly string[]).includes(v)) return v as FaceLook | 'off';
  throw new RangeError(`look: ${LOOKS.join(', ')}, off`);
}

export function checkZoom(v: string): 'yard' | 'chart' {
  if (v === 'yard' || v === 'chart') return v;
  throw new RangeError('zoom: chart or yard');
}

export function checkYield(v: string): YieldRule {
  if (v === 'equal' || v === 'mass') return v;
  throw new RangeError('yield: equal or mass');
}

export function checkRate(v: number): number {
  if (!(v >= 0 && v <= 1e6)) throw new RangeError('rate must be in [0, 1000000] trades a second');
  return v;
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const fmt = (x: number) => (Math.abs(x) >= 0.01 || x === 0 ? x.toFixed(4) : x.toExponential(2));


export const COMMANDS: Readonly<Record<string, Command>> = {
  help: {
    usage: 'help [command]',
    help: 'list commands, or explain one',
    run(s, [name]) {
      const width = Math.max(24, s.columns - 1);
      if (name) {
        if (Object.hasOwn(COMMANDS, name)) return wrap(`${COMMANDS[name].usage} — ${COMMANDS[name].help}`, width, 2);
        if (Object.hasOwn(PRESETS, name)) return `${name} = ${PRESETS[name] || '(the room)'}`;
        if (name === 'pose' || name === 'recipe') return RECIPE_HELP;
        throw new Error(`no help for "${name}"`);
      }
      // wide: usage and help side by side; narrow: help under its usage
      const column = Math.min(28, Object.values(COMMANDS).reduce((m, c) => Math.max(m, c.usage.length <= 28 ? c.usage.length : 0), 0) + 2);
      const wide = width >= column + 30;
      // (a usage too long for its column gets its help on the next line, as when narrow)
      const lines = Object.values(COMMANDS).map((c) =>
        wide && c.usage.length <= column ? hang(`  ${c.usage.padEnd(column)} `, c.help, width, column + 3) : `${wrap(`  ${c.usage}`, width, 4)}\n${hang('      ', c.help, width, 6)}`,
      );
      const block = (text: string) => text.split('\n').map((l) => wrap(l, width, 4)).join('\n');
      return ['commands:', ...lines, '', block(RECIPE_HELP), '', wrap(`presets: ${Object.keys(PRESETS).join(', ')}`, width, 2), '', block(SCRIPT_HELP)].join('\n');
    },
  },
  n: {
    usage: 'n <count>',
    help: 'a new population of <count> (2 to 2000), everyone equal, the sliders kept',
    run(s, [arg]) {
      const n = count(arg, 'count', 2, 2000);
      s.rebuild(n, s.game.seed);
      return `${n} people, each with 1/${n}`;
    },
  },
  seed: {
    usage: 'seed <number>',
    help: 'new dice (everyone equal again, the sliders kept)',
    run(s, [arg]) {
      const seed = count(arg, 'seed', 0, 0xffff_ffff);
      s.rebuild(s.game.n, seed);
      return `seed ${seed}`;
    },
  },
  reset: {
    usage: 'reset',
    help: 'everyone equal, dice back to the seed, the sliders kept',
    run(s) {
      s.restart();
      s.cancelMeeting();
      s.equalize();
      s.recompile();
      return 'equal again';
    },
  },
  trade: {
    usage: 'trade [k]',
    help: 'k trades now, by the program\'s trade block, pairs drawn one after another (default N)',
    run(s, [arg]) {
      const k = arg === undefined ? s.game.n : count(arg, 'trades', 0, MAX_TRADES);
      // a few trades are worth watching one by one; many are a jump
      if (k <= 8) s.animated(() => s.game.trade(k));
      else s.game.trade(k);
      s.recompile();
      return `${k} trades (total ${s.game.trades})`;
    },
  },
  round: {
    usage: 'round [k]',
    help: 'k rounds of the program (default 1)',
    run(s, [arg]) {
      const k = arg === undefined ? 1 : count(arg, 'rounds', 0, Math.floor(MAX_TRADES / Math.max(1, Math.floor(s.game.n / 2))));
      if (k === 1 && s.meets && s.plays && s.game.n > 1) {
        // partners walk up to each other first; the round is played (and recorded) when they have
        s.queued++;
        return 'partners meeting, then 1 round';
      }
      // one round is worth watching beat by beat; many are a jump
      if (k <= 1) s.animated(() => s.game.round(k), true);
      else s.game.round(k);
      s.recompile();
      return `${k} round${k === 1 ? '' : 's'} (trades ${s.game.trades})`;
    },
  },
  levy: {
    usage: 'levy [rate]',
    help: "everyone pays <rate> of their wealth (the program's tax rate if none), the pot is shared equally",
    run(s, [arg]) {
      const rate = arg === undefined ? s.game.rules.tax : real(arg, 'rate', 0, 1);
      s.game.levy(rate);
      s.recompile();
      return 'levied and shared';
    },
  },
  give: {
    usage: 'give <from> <to> <amount>',
    help: 'a gift; amount is a share of all wealth (0.01 = 1%)',
    run(s, [a, b, c]) {
      const from = count(a, 'from', 0, s.game.n - 1);
      const to = count(b, 'to', 0, s.game.n - 1);
      const amount = real(c, 'amount', 0, 1);
      const moved = s.game.give(from, to, amount);
      s.recompile();
      return `${from} gave ${to} ${fmt(moved)}`;
    },
  },
  play: {
    usage: 'play [rate]',
    help: 'trade continuously, <rate> trades a second (default N)',
    run(s, [arg]) {
      if (arg !== undefined) s.rate = checkRate(Number(arg));
      s.playing = true;
      return `playing, ${s.tradeRate} trades/s`;
    },
  },
  pause: {
    usage: 'pause',
    help: 'stop trading (the room keeps moving)',
    run(s) {
      s.playing = false;
      return 'paused';
    },
  },
  rule: {
    usage: 'rule [beta|tax|yield] [value]',
    help: 'the rules: beta and tax move the program\'s stake and tax sliders (the run goes on); yield: who gives way',
    run(s, [name, value]) {
      if (name === undefined) {
        const r = s.game.rules;
        return `beta ${r.beta} (stake: share of the poorer's wealth)\ntax ${r.tax} (levy per round)\nyield ${s.stage.yieldRule} (who gives way)`;
      }
      if (name === 'beta' || name === 'tax') {
        const v = real(value, name, 0, name === 'beta' ? 0.999 : 1);
        s.game.setRules({ [name]: v });
        // a tax keeps the pot's spot in the room
        if (name === 'tax') s.recompile();
      } else if (name === 'yield') s.stage.yieldRule = checkYield(value ?? '');
      else throw new RangeError('rules: beta, tax, yield (pairing is the program\'s: Rules)');
      return `${name} ${value}`;
    },
  },
  program: {
    usage: 'program [json]',
    help: 'the program the yard plays, as text (what the Rules drawer\'s blocks say), or load one: round 0, same seed',
    run(s, words) {
      if (!words.length) return JSON.stringify(s.game.program);
      s.setProgram(readProgram(JSON.parse(words.join(' '))));
      return `program loaded: ${s.game.n} people, round 0`;
    },
  },
  pose: {
    usage: 'pose [words]',
    help: 'a fresh recipe from defaults (bare words edit the current one)',
    run(s, words) {
      if (words.length === 0) return `pose: ${formatRecipe(s.recipe) || 'room'}`;
      return s.pose(parseRecipe(expandPresets(words.join(' '))));
    },
  },
  presets: {
    usage: 'presets',
    help: 'named recipes',
    run() {
      return Object.entries(PRESETS)
        .map(([k, v]) => `  ${k.padEnd(10)} ${v || '(the room)'}`)
        .join('\n');
    },
  },
  finish: {
    usage: 'finish',
    help: 'everyone straight to their place',
    run(s) {
      s.stage.finish();
      return s.stage.posing ? 'done' : 'nothing to finish in the room';
    },
  },
  scatter: {
    usage: 'scatter',
    help: 'put everyone back on the grid',
    run(s) {
      s.stage.scatter();
      if (s.stage.posing) s.stage.finish();
      return 'scattered';
    },
  },
  look: {
    usage: 'look <face>|off',
    help: `faces from the essay's engine: ${LOOKS.join(', ')}`,
    run(s, [arg]) {
      s.look = checkLook(arg ?? '');
      return `look ${s.look}`;
    },
  },
  speed: {
    usage: 'speed <x>',
    help: 'time scale, 0 to 4 (keys [ and ] halve and double it): slow motion to watch the beats',
    run(s, [arg]) {
      s.speed = real(arg, 'speed', 0, 4);
      return `speed ${s.speed}`;
    },
  },
  axes: {
    usage: 'axes [on|off]',
    help: 'dev ticks on the yard (readers never see these)',
    run(s, [arg]) {
      s.axes = onOff(arg, s.axes);
      return `axes ${s.axes ? 'on' : 'off'}`;
    },
  },
  hud: {
    usage: 'hud [on|off]',
    help: 'dev readout in the corner',
    run(s, [arg]) {
      s.hud = onOff(arg, s.hud);
      return `hud ${s.hud ? 'on' : 'off'}`;
    },
  },
  who: {
    usage: 'who [i]',
    help: 'one person: wealth, rank, size, density, state',
    run(s, [arg]) {
      const i = arg === undefined ? s.selected : count(arg, 'person', 0, s.game.n - 1);
      if (i < 0) throw new Error('click someone, or: who <i>');
      s.selected = i;
      const w = s.game.wealth[i];
      let rank = 1;
      for (let j = 0; j < s.game.n; j++) if (s.game.wealth[j] > w) rank++;
      const st = s.stage;
      const state = st.air[i] > 0 ? 'in the air' : st.settled[i] ? 'in place' : i === st.dragged ? 'held' : 'walking';
      return `#${i}: wealth ${fmt(w)} (${(w * s.game.n).toFixed(3)}× equal), rank ${rank}/${s.game.n}, box ${fmt(st.w[i])}×${fmt(st.h[i])}, density ${st.density(i).toFixed(2)}, ${state}`;
    },
  },
  fx: {
    usage: 'fx [on|off] | fx trade off|piece|toss | fx tax|sync|chart on|off',
    help: 'animate trades and levies. piece (the default): trades where people stand, the loser\'s slice flies to the winner. toss (for demos): before each round partners walk up to each other, both stakes come off, a spinner picks the winner, who keeps its own and takes the other. tax: levies through a shared pot. sync: streamed trades in rounds. In a chart everyone is locked in place: trades and levies happen at once and the chart re-forms; chart on: shown there too, the chart re-forming as each lands',
    run(s, [a, b]) {
      const t = s.transit;
      const say = () => `fx trade ${t.trade}, tax ${t.tax ? 'on' : 'off'}, sync ${t.sync ? 'on' : 'off'}${t.chart ? ', chart on' : ''}`;
      if (a === undefined) return say();
      if (a === 'trade') {
        if (b !== 'off' && b !== 'toss' && b !== 'piece') throw new RangeError('fx trade off, piece or toss');
        t.trade = b;
        s.pinned.trade = true;
      } else if (a === 'tax') {
        t.tax = onOff(b, t.tax);
        s.pinned.tax = true;
      }
      else if (a === 'sync') t.sync = onOff(b, t.sync);
      else if (a === 'chart') t.chart = onOff(b, t.chart);
      else {
        const v = onOff(a, t.trade !== 'off' || t.tax);
        t.trade = v ? 'piece' : 'off';
        s.pinned = { trade: true, tax: true };
        t.tax = v;
      }
      // nothing shown any more: what is showing lands now, shapes and all
      if (t.trade === 'off' && !t.tax) s.finishTransit();
      // with or without the pot's spot
      s.recompile();
      return say();
    },
  },
  zoom: {
    usage: 'zoom [chart|yard]',
    help: 'chart: once a pose is formed, it fills the screen; yard: always the whole yard',
    run(s, [arg]) {
      s.zoom = arg === undefined ? (s.zoom === 'yard' ? 'chart' : 'yard') : checkZoom(arg);
      return `zoom ${s.zoom}`;
    },
  },
  drag: {
    usage: 'drag [push|lift|off]',
    help: 'push: a held person shoves through the crowd; lift: carried over everyone, dropped where there is room; off',
    run(s, [arg]) {
      if (arg !== 'push' && arg !== 'lift' && arg !== 'off') throw new RangeError('drag: push, lift or off');
      s.drag = arg;
      return `drag ${arg}`;
    },
  },
  equalize: {
    usage: 'equalize',
    help: 'everyone square again (trades leave people a little oblong)',
    run(s) {
      // through the log, so a link redoes it at the same point
      s.game.input({ kind: 'note', text: 'equalize' });
      s.recompile();
      return 'everyone square';
    },
  },
  veil: {
    usage: 'veil [on|off|<0..1>]',
    help: 'fade everyone out (on), back in (off), or part of the way',
    run(s, [arg]) {
      const v = arg === undefined ? (s.veilTo > 0 ? 0 : 1) : arg === 'on' ? 1 : arg === 'off' ? 0 : real(arg, 'veil', 0, 1);
      s.veilTo = v;
      return `veil ${v}`;
    },
  },
  money: {
    usage: 'money fill|split|off',
    help: 'all the money as one pile in the box: it fills up; then it is cut where the pose divides it, and the squares come in',
    run(s, [arg]) {
      if (arg === 'off') s.money = null;
      else if (arg === 'fill' || arg === 'split') s.money = { mode: arg, t: 0 };
      else throw new RangeError('money fill, split or off');
      return `money ${arg}`;
    },
  },
  taxes: {
    usage: 'taxes [on|off]',
    help: "everyone's tax this round (the tax rate × their money), cut and lifted toward the middle, following the rate; a levy then starts with them off",
    run(s, [arg]) {
      s.taxes = onOff(arg, !!s.taxes) ? (s.taxes ?? { t: 0 }) : null;
      return `taxes ${s.taxes ? 'on' : 'off'}`;
    },
  },
  divide: {
    usage: 'divide [on|off]',
    help: "the yard in four quarters, a cross of walls (the yard's own line): for yards shown in them",
    run(s, [arg]) {
      s.divide = onOff(arg, s.divide);
      return `divide ${s.divide ? 'on' : 'off'}`;
    },
  },
  stakes: {
    usage: 'stakes [on|off]',
    help: "the next round's stakes on each pair: the same for both, a share of the poorer one's money (follows the stake)",
    run(s, [arg]) {
      s.stakes = onOff(arg, !!s.stakes) ? (s.stakes ?? { t: 0 }) : null;
      return `stakes ${s.stakes ? 'on' : 'off'}`;
    },
  },
  glow: {
    usage: 'glow <stake poorer|body i|edge bottom|edge left|slider name|tab name|you> | glow <kind> off | glow off',
    help: "something to look at glows: a stake, a square, every square's bottom edge, a slider, a tab",
    run(s, [kind, name]) {
      if (kind === 'off' || kind === undefined) {
        s.glows.clear();
        return 'no glow';
      }
      if (!['stake', 'body', 'edge', 'slider', 'tab', 'button'].includes(kind)) throw new RangeError('glow stake, body, edge, slider, tab or button');
      if (name === undefined) throw new RangeError(`glow ${kind} <which>`);
      if (name === 'off') {
        for (const g of [...s.glows]) if (g.startsWith(`${kind}:`)) s.glows.delete(g);
        return `no ${kind} glows`;
      }
      if (kind === 'body') count(name, 'body', 0, s.game.n - 1);
      if (kind === 'stake' && name !== 'poorer') throw new RangeError('glow stake poorer');
      if (kind === 'edge' && name !== 'bottom' && name !== 'left') throw new RangeError('glow edge bottom|left');
      s.glows.add(`${kind}:${name}`);
      return `glow ${kind} ${name}`;
    },
  },
  guide: {
    usage: 'guide line [f] | guide lorenz [even|gap|triangle|lift|label|gauge] | guide envelope | guide off',
    help: "line: a line across the bars that the reader drags, f of the way to the longest (how many reach it); lorenz: over the bodies posed as stairs, the running total's curve; even: the line if all were equal; gap: the area between (the Gini)",
    run(s, [kind, arg]) {
      if (kind === 'off' || kind === undefined) {
        s.guide = null;
        return 'no guide';
      }
      if (kind === 'line') {
        const f = arg === undefined ? 0.5 : real(arg, 'f', 0, 1);
        s.guide = { kind: 'line', f, moved: false };
        return `line at ${f}`;
      }
      if (kind === 'lorenz') {
        const g = s.guide?.kind === 'lorenz' ? s.guide : { kind: 'lorenz' as const, t: 0, even: 0, gap: 0, tri: 0, lift: 0, label: 0 };
        // each step from now, with the ones it stands on (the Gini's bars in steps: owner, 2026-10-22); gauge: all
        const now = Math.max(g.t, 1e-9);
        const at = (v: number) => (v > 0 ? v : now);
        if (arg === 'even') g.even = at(g.even);
        else if (arg === 'gap') {
          g.even = at(g.even);
          g.gap = now;
        } else if (arg === 'triangle') {
          g.even = at(g.even);
          g.tri = now;
        } else if (arg === 'lift') {
          g.even = at(g.even);
          g.tri = at(g.tri);
          g.gap = at(g.gap);
          g.lift = now;
        } else if (arg === 'label') {
          g.label = now;
        } else if (arg === 'gauge') {
          g.even = at(g.even);
          g.gap = at(g.gap);
          g.tri = now;
          g.lift = now + 2;
          g.label = now + 3;
        } else if (arg !== undefined) throw new RangeError('guide lorenz [even|gap|triangle|lift|label|gauge]');
        s.guide = g;
        return `lorenz${arg ? ` ${arg}` : ''}`;
      }
      if (kind === 'envelope') {
        s.guide = { kind: 'envelope', t: 0 };
        return 'envelope';
      }
      throw new RangeError('guide line, lorenz, envelope or off');
    },
  },
  handoff: {
    usage: 'handoff ccdf|lorenz|gini|neff',
    help: "a chart taught in the yard goes to its square in the panel, photographed: the bars' outline (ccdf), the stairs' curve (lorenz), the gauge (gini), the photo's copies (neff, to its number)",
    run(s, [kind]) {
      if (kind !== 'ccdf' && kind !== 'lorenz' && kind !== 'gini' && kind !== 'neff') throw new RangeError('handoff ccdf, lorenz, gini or neff');
      let box = { x: BOX, y: BOX, w: 1, h: 1 };
      if (kind === 'ccdf') {
        const live = s.live;
        const boxes = Array.from({ length: live.n }, (_, i) => live.box(i));
        const x0 = Math.min(...boxes.map((b) => b.x));
        const y0 = Math.min(...boxes.map((b) => b.y));
        box = { x: x0, y: y0, w: Math.max(...boxes.map((b) => b.x + b.w)) - x0, h: Math.max(...boxes.map((b) => b.y + b.h)) - y0 };
      } else if (kind === 'gini') box = { x: GAUGE.x - 0.03, y: BOX - 0.08, w: GAUGE.w + 0.06, h: 1.22 };
      s.handoff = { kind, box, id: (s.handoff?.id ?? 0) + 1 };
      s.charted.add(kind);
      return `handoff ${kind}`;
    },
  },
  badge: {
    usage: 'badge round|gini|trades [on|off] | badge off',
    help: "readouts in the yard's corner: the round, the Gini, the trades so far",
    run(s, [kind, arg]) {
      if (kind === 'off') {
        s.badges = { round: false, gini: false, trades: false };
        return 'no badges';
      }
      if (kind !== 'round' && kind !== 'gini' && kind !== 'trades') throw new RangeError('badge round, gini, trades or off');
      s.badges = { ...s.badges, [kind]: onOff(arg, s.badges[kind]) };
      return `badge ${kind} ${s.badges[kind] ? 'on' : 'off'}`;
    },
  },
  lottery: {
    usage: 'lottery',
    help: 'who you are, drawn: a ring hops from square to square, slower and slower, and stops on you (a card with your rank and share)',
    run(s) {
      s.startDraw();
      return 'drawing…';
    },
  },
  be: {
    usage: 'be [i|off]',
    help: 'be one of the squares (at random, or i): a ring, and a card with your rank and share',
    run(s, [arg]) {
      if (arg === 'off') {
        s.you = null;
        return 'nobody';
      }
      const i = arg === undefined ? Math.floor(Math.random() * s.game.n) : count(arg, 'square', 0, s.game.n - 1);
      s.you = { i, t: 0 };
      // picked too: its card opens, a way in without a pointer (review 2026-10-21, 7)
      s.selected = i;
      s.ask([i], 'cheer');
      return `you are #${i}: ${s.youText()}`;
    },
  },
  face: {
    usage: 'face <all|richest|poorest|you|i> <camera|cheer|hop|rest|feeling> [seconds]',
    help: `faces asked to look at you (camera), cheer, hop, rest, or feel: ${Object.keys(FEELINGS).join(', ')}`,
    run(s, [who, what, secs]) {
      const n = s.game.n;
      const w = s.game.wealth;
      let members: number[];
      if (who === 'all') members = Array.from({ length: n }, (_, k) => k);
      else if (who === 'richest' || who === 'poorest') {
        let best = 0;
        for (let k = 1; k < n; k++) if (who === 'richest' ? w[k] > w[best] : w[k] < w[best]) best = k;
        members = [best];
      } else if (who === 'you') {
        if (!s.you) throw new Error('be someone first');
        members = [s.you.i];
      } else members = [count(who, 'square', 0, n - 1)];
      if (!what || !(['camera', 'cheer', 'hop', 'rest'].includes(what) || Object.hasOwn(FEELINGS, what))) throw new RangeError(`face … camera, cheer, hop, rest or ${Object.keys(FEELINGS).join(', ')}`);
      const seconds = secs === undefined ? 2.5 : real(secs, 'seconds', 0, 60);
      s.ask(members, what, seconds);
      return `${who}: ${what}`;
    },
  },
  meet: {
    usage: 'meet [i j …] | meet off',
    help: "the next round's partners walk up to each other and stand together (toss mode) until a round is played; or partners named, in pairs, apart enough for their stakes, the rest watching (duel)",
    run(s, args) {
      if (args[0] === 'off') {
        // everyone goes home: no partners standing, nobody watching
        s.cancelMeeting();
        s.standing = false;
        s.recompile();
        return 'everyone home';
      }
      if (args.length) {
        if (args.length % 2) throw new RangeError('meet: partners in pairs');
        const named = args.map((a) => count(a, 'square', 0, s.game.n - 1));
        if (new Set(named).size !== named.length) throw new RangeError('meet: each square once');
        if (s.locked) throw new Error('partners meet in the room');
        s.name(named);
        s.recompile();
        return `partners ${named.join(' ')}; the rest watch`;
      }
      if (!s.meets || s.locked || s.game.n < 2 || !s.game.meets) throw new Error('partners meet in toss mode (fx trade toss), in the room, with random pairs');
      s.partners = null;
      s.pairs = s.game.peek();
      s.standing = true;
      s.recompile();
      return 'partners meeting';
    },
  },
  split: {
    usage: 'split <f>',
    help: "the two players' money shared: f (0.05 to 0.95) to the one on the left, the rest to the other (a gift between them)",
    run(s, [arg]) {
      const f = real(arg, 'f', 0.05, 0.95);
      s.splitPlayers(f);
      return `split ${f}`;
    },
  },
  duel: {
    usage: 'duel <i> <j> [k]',
    help: "k fair trades between i and j alone (default 1): a coin from the dice, the program's stake (β × the poorer one's), each a gift in the log; one is shown as a toss",
    run(s, [a, b, c]) {
      const i = count(a, 'square', 0, s.game.n - 1);
      const j = count(b, 'square', 0, s.game.n - 1);
      if (i === j) throw new RangeError('duel: two squares');
      const k = c === undefined ? 1 : count(c, 'duels', 0, 100_000);
      if (k === 1) s.duel(i, j);
      else {
        // many are a jump: at once
        const plays = s.transit.trade;
        s.transit.trade = 'off';
        try {
          for (let d = 0; d < k; d++) s.duel(i, j);
        } finally {
          s.transit.trade = plays;
        }
      }
      s.recompile();
      return `${k} duel${k === 1 ? '' : 's'} (${s.gifts} so far)`;
    },
  },
  band: {
    usage: 'band <low> <high> | band off',
    help: 'the heights the room keeps its homes between (yard units), clear of words and controls over the yard; charts stay where they are',
    run(s, [a, b]) {
      if (a === 'off') s.band = null;
      else {
        const lo = real(a, 'low', 0, 2);
        const hi = real(b, 'high', 0, 2);
        if (!(hi - lo >= 2 / 3)) throw new RangeError('band: at least a third of the yard');
        s.band = [lo, hi];
      }
      s.recompile();
      return s.band ? `band ${s.band[0]} ${s.band[1]}` : 'band off';
    },
  },
  headroom: {
    usage: 'headroom <h>',
    help: 'keep h yard units free above the room, for words over the yard (0 to 3): the walls open up by it',
    run(s, [arg]) {
      s.headroom = real(arg, 'headroom', 0, 3);
      s.recompile();
      return `headroom ${s.headroom}`;
    },
  },
  say: {
    usage: 'say [text]',
    help: 'a line on the stage, for tutorials (empty clears)',
    run(s, words) {
      s.caption = words.join(' ').slice(0, 280);
      return '';
    },
  },
  run: {
    usage: 'run <script>',
    help: `run a script: ${Object.keys(SCRIPTS).join(', ')} (or type lines with wait / until done)`,
    run(s, [name]) {
      if (!name || !Object.hasOwn(SCRIPTS, name)) throw new Error(`scripts: ${Object.keys(SCRIPTS).join(', ')}`);
      s.start(name, SCRIPTS[name].split('\n'));
      return `running ${name} (stop to stop)`;
    },
  },
  demo: {
    usage: 'demo',
    help: 'run the demo: every important function in about three minutes (stop to stop)',
    run(s) {
      s.start('demo', SCRIPTS.demo.split('\n'));
      return 'running demo (stop to stop)';
    },
  },
  scripts: {
    usage: 'scripts [name]',
    help: 'list the scripts, or show one',
    run(_s, [name]) {
      if (name === undefined) return `scripts: ${Object.keys(SCRIPTS).join(', ')}`;
      if (!Object.hasOwn(SCRIPTS, name)) throw new Error(`no script "${name}"`);
      return SCRIPTS[name].trim();
    },
  },
  stop: {
    usage: 'stop',
    help: 'stop the running script',
    run(s) {
      const name = s.script?.name;
      s.script = null;
      return name ? `stopped ${name}` : 'no script running';
    },
  },
  stats: {
    usage: 'stats',
    help: 'gini, N_eff, shares (for you, not for readers)',
    run(s) {
      const t = statsOf(s.game.wealth);
      return `trades ${s.game.trades}  gini ${t.gini.toFixed(3)}  N_eff ${t.neff.toFixed(2)} of ${s.game.n}  top10% ${pct(t.top10)}  bottom50% ${pct(t.bottom50)}  min ${fmt(t.poorest)}  max ${fmt(t.richest)}  Σ−1 ${(t.total - 1).toExponential(1)}`;
    },
  },
  check: {
    usage: 'check',
    help: 'the law: overlaps on the ground, bodies outside, repairs so far',
    run(s) {
      const o = s.stage.overlaps();
      return `overlapping pairs ${o.pairs} (deepest ${o.depth.toExponential(1)}), outside ${o.outside}, undone ${s.stage.reverts}, unrepaired ${s.stage.violations}, hops ${s.stage.hops}`;
    },
  },
  ask: {
    usage: 'ask [question]',
    help: 'attach a question to the share link (empty clears)',
    run(s, words) {
      s.question = words.join(' ').slice(0, 280);
      return s.question ? `asking: ${s.question}` : 'no question';
    },
  },
  share: {
    usage: 'share',
    help: 'this state as a link',
    run(s) {
      return s.share();
    },
  },
  clear: {
    usage: 'clear',
    help: 'clear this log',
    run(s) {
      s.log.length = 0;
      return '';
    },
  },
};

const SCRIPT_HELP = [
  'scripts: console lines plus',
  '  wait <seconds>   until done   until round <k|+k>   until gini <x>   until neff <x>   say <text>   # comment',
  '  (until round/gini/neff plays to exactly there: play first)',
  '  a typed line with wait or until runs as a script: ccdf; until done; wait 2; neff',
].join('\n');

const RECIPE_HELP = [
  'pose words (any order; bare words edit the current pose):',
  '  rescale  wealth | log | logarea',
  '  resize   natural | equal | squared',
  '  reshape  square | bar [t] | col [t] | tri | hex',
  '  sort     id | asc | desc | shuffle',
  '  group    none | median | quartiles | tmb | deciles',
  '  pose     free (spread out) | wander | stack | row | pack | fold | tower | stairs',
  '  extras   gap <g>, prints | noprints',
].join('\n');

/** Every word the console understands, for tab completion. */
export const VOCABULARY: readonly string[] = [...Object.keys(COMMANDS), ...Object.keys(PRESETS), ...RECIPE_WORDS, ...LOOKS, ...Object.keys(SCRIPTS), 'wait', 'until', 'done', 'chart', 'yard', 'push', 'lift', 'trade', 'tax', 'sync', 'toss', 'piece', 'pairing', 'rounds', 'random', 'beta', 'tax', 'yield', 'mass', 'equal', 'on', 'off', 'round', 'gini', 'fill', 'split', 'line', 'lorenz', 'even', 'gap', 'camera', 'cheer', 'hop', 'rest', 'all', 'richest', 'poorest', 'you', ...Object.keys(FEELINGS)];
