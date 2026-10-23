import { describe, expect, it } from 'vitest';
import { Session, coinOf } from '../stage/console/session.ts';
import { VOCABULARY } from '../stage/console/commands.ts';
import { Game } from '../stage/core/game.ts';
import { statsOf } from '../stage/core/stats.ts';
import { ACT_STARTS, BEATS, DUELS, LEAD_FROM, SEED, SPLIT, linesOf } from '../stage/story/beats.ts';
import { StoryRunner, fill, type StoryHost } from '../stage/story/runner.ts';
import { STORY } from '../stage/story/words.en.ts';
import type { Widget, WidgetContext, Widgets } from '../stage/story/widgets.ts';
import { YARDS, shuffle, yardSession } from '../stage/story/yards.ts';
import { strip, unstrip } from '../stage/story/program.ts';
import { stageProgram } from '../stage/core/game.ts';
import { validate } from '../model/validate.ts';
import { NEFF_ACT2, NEFF_PHOTO } from '../stage/story/beats.ts';
import { compile, stripOf, BOX } from '../stage/core/figure.ts';
import { prints } from '../stage/acts/prints.ts';
import { parseRecipe, PRESETS } from '../stage/core/recipe.ts';
import { keyAction } from '../stage/view/keys.ts';
import { emptyScene } from '../stage/acts/scene.ts';

/** A page with one session that a story can swap. */
function page(s = new Session({ n: 16 })) {
  const host = {
    s,
    ended: 0,
    session: () => host.s,
    setSession: (n: Session) => {
      host.s = n;
    },
    ended_: () => host.ended++,
  };
  const h: StoryHost = { session: host.session, setSession: host.setSession, ended: host.ended_ };
  return { host, h };
}

/** Stand-ins for the page's widgets: they do what the reader would when asked to show. */
function fakeWidgets(): { widgets: Widgets; log: string[]; pick: () => void } {
  const log: string[] = [];
  let yard: WidgetContext | null = null;
  const make = (name: string, kind: 'picked' | 'edited'): Widget => {
    let ctx: WidgetContext | null = null;
    return {
      mount(c, config) {
        ctx = c;
        if (name === 'yards') yard = c;
        const told = config.told as { index?: number } | undefined;
        log.push(`${name} mount ${String(config.phase ?? '')}${told ? ` told ${told.index}` : ''}`);
      },
      config(config) {
        const told = config.told as { index?: number } | undefined;
        log.push(`${name} config ${String(config.phase ?? '')}${config.showMe ? ' showMe' : ''}${told ? ` told ${told.index}` : ''}`);
        if (config.showMe) ctx!.emit({ kind, index: 2 });
      },
      cleanup() {
        log.push(`${name} cleanup`);
      },
    };
  };
  return { widgets: { yards: make('yards', 'picked'), blocks: make('blocks', 'edited') }, log,
    pick: () => yard!.emit({ kind: 'picked', index: 2 }) };
}

/** Frames until the beat is ready (or `limit` seconds). */
function settle(r: StoryRunner, host: { s: Session }, limit = 120, dt = 1 / 30): number {
  let t = 0;
  while (r.playing && t < limit) {
    host.s.frame(dt);
    r.frame(dt);
    t += dt;
  }
  return t;
}

describe('the story, as data', () => {
  it('every beat has its words, its lines run, its words fill', () => {
    const keys = new Set(BEATS.map((b) => b.key));
    expect(keys.size).toBe(BEATS.length);
    for (const b of BEATS) expect(STORY.beats[b.key]).toBeTruthy();
    expect(Object.keys(STORY.beats).sort()).toEqual([...keys].sort());
    expect(ACT_STARTS).toEqual([0, 14, 24, 42]);
    expect(STORY.acts).toHaveLength(ACT_STARTS.length);
    // every line starts with a word the console knows (the full run below checks they all run)
    const s = new Session({ n: 16 });
    for (const b of BEATS) {
      for (const line of [...linesOf(b.run), ...linesOf(b.enter)]) {
        if (/^(wait|until)\b/.test(line)) continue;
        const head = line.split(/\s+/)[0];
        expect(VOCABULARY, line).toContain(head);
      }
    }
    // braces resolve
    for (const b of BEATS) expect(fill(STORY.beats[b.key], s)).not.toMatch(/[{}]/);
    expect(fill('Here it is {gini}.', s)).toBe('Here it is 0.00.');
    expect(fill('a **yard**', s)).toBe('a <strong>yard</strong>');
  });

  it('the luck: the first seed where, the players starting unequal, one leads their duels, and Act 2 comes to its N_eff', () => {
    const ok = (seed: number) => {
      const g = new Game(4, seed, { beta: 0.1, tax: 0 });
      // Act 1 leaves them unequal: the left one (player 0) with SPLIT of the two's money
      const d = SPLIT * (g.wealth[0] + g.wealth[1]) - g.wealth[0];
      if (d > 0) g.give(1, 0, d);
      else g.give(0, 1, -d);
      let leader = -1;
      for (let k = 0; k < DUELS; k++) {
        const w = g.wealth;
        const [win, lose] = coinOf(seed, k) < 0.5 ? [0, 1] : [1, 0];
        g.give(lose, win, 0.1 * Math.min(w[0], w[1]));
        const lead = g.wealth[0] > g.wealth[1] ? 0 : 1;
        if (k + 1 === LEAD_FROM) leader = lead;
        if (k + 1 > LEAD_FROM && lead !== leader) return false;
      }
      if (Math.max(g.wealth[0], g.wealth[1]) < 3 * Math.min(g.wealth[0], g.wealth[1])) return false;
      const neff = () => statsOf(g.wealth).neff;
      // Act 2: seven rounds as its beats have them, then until N_eff 3.05 (the photo counts whatever it comes to)
      g.round(7);
      let r = 7;
      while (neff() > NEFF_ACT2 && r < 400) (g.round(1), r++);
      return r >= 12 && r < 400;
    };
    expect(ok(SEED)).toBe(true);
    for (let s = 1; s < SEED; s++) expect(ok(s)).toBe(false);
  });
});

describe('the runner', () => {
  it('plays the whole story, the reader hurrying and asking to be shown, to its end', () => {
    const { host, h } = page();
    const widgets = fakeWidgets();
    const r = new StoryRunner(h, widgets.widgets);
    r.start();
    const seen: string[] = [];
    for (let guard = 0; guard < 400 && host.ended === 0; guard++) {
      seen.push(r.beat!.key);
      // a reader in a hurry: Next while it plays finishes it
      if (r.playing) r.next();
      if (!r.done) { if (r.beat?.wait?.kind === 'pick') widgets.pick(); else r.showMe(); }
      settle(r, host);
      // a shown drag sweeps the line for a moment
      for (let t = 0; !r.done && t < 3; t += 1 / 30) {
        host.s.frame(1 / 30);
        r.frame(1 / 30);
      }
      r.next();
    }
    expect(host.ended, `${seen.join(' ')}\n${host.s.log.slice(-20).join('\n')}`).toBe(1);
    expect(BEATS.filter((b) => !seen.includes(b.key)).map((b) => b.key)).toEqual([]);
    expect(host.s.log.filter((l) => l.startsWith('error')), host.s.log.slice(-30).join('\n')).toEqual([]);
    // the story's overlays came off; the yard is the reader's to play
    expect(host.s.band).toBeNull();
    expect(host.s.veil).toBe(0);
    expect(widgets.log).toContain('yards mount show');
    expect(widgets.log).toContain('yards cleanup');
  });

  it('act 1 played in real time: money, four squares, two playing, a stake set to 10%, one trade', () => {
    const { host, h } = page();
    const r = new StoryRunner(h);
    r.start();
    let t = 0;
    const trade = BEATS.findIndex((b) => b.key === 'trade');
    for (let guard = 0; guard < 60 && r.at < trade; guard++) {
      t += settle(r, host);
      if (r.beat?.wait) {
        expect(r.ready).toBe(false);
        if (r.beat.wait.kind === 'slide') {
          // tried (away from the mark), then left near it: it snaps there
          r.slide('stake', 0.3);
          if (r.beat.wait.to !== undefined) {
            expect(r.ready).toBe(false);
            r.slide('stake', 0.115);
          }
        }
        else r.showMe();
      }
      r.next();
      // the words' second part, then on
      if (!r.playing && r.ready) r.next();
    }
    expect(r.at).toBe(trade);
    const s = host.s;
    expect(s.game.n).toBe(4);
    expect(s.game.rules.beta).toBe(0.1);
    // one duel, no round: the players 0 and 1 traded 10% of a quarter; the other two watched
    expect(s.game.run.round).toBe(0);
    expect(s.duels).toBe(1);
    // left unequal first (the left one, player 0, with SPLIT of the two's half), then the stake: 10% of the poorer's
    expect(s.players()).toEqual([0, 1]);
    const poorer = SPLIT * 0.5;
    const won = coinOf(SEED, 0) < 0.5 ? 0 : 1;
    const expected = won === 0 ? [poorer + 0.1 * poorer, 0.5 - poorer - 0.1 * poorer] : [poorer - 0.1 * poorer, 0.5 - poorer + 0.1 * poorer];
    expect([s.game.wealth[0], s.game.wealth[1]]).toEqual(expected.map((x) => expect.closeTo(x, 12)));
    expect([s.game.wealth[2], s.game.wealth[3]]).toEqual([0.25, 0.25].map((x) => expect.closeTo(x, 12)));
    expect(s.partners).toBe(1);
    expect(t).toBeGreaterThan(8);
    expect(s.log.filter((l) => l.startsWith('error'))).toEqual([]);
  });

  it('owner 2026-10-22: a slider beat goes on by itself once its slider rests, never while it is dragged', () => {
    const { host, h } = page();
    const r = new StoryRunner(h);
    r.start(BEATS.findIndex((b) => b.key === 'slider'));
    settle(r, host);
    // dragged: a new value every frame, for a second
    for (let k = 0; k < 30; k++) {
      r.slide('stake', 0.2 + k * 0.005);
      host.s.frame(1 / 30);
      r.frame(1 / 30);
    }
    expect(r.beat!.key).toBe('slider');
    for (let t = 0; t < 1; t += 1 / 30) r.frame(1 / 30);
    expect(r.beat!.key).toBe('try');
    // tried, then left at the mark: on again
    r.slide('stake', 0.4);
    r.slide('stake', 0.1);
    for (let t = 0; t < 1; t += 1 / 30) r.frame(1 / 30);
    expect(r.beat!.key).toBe('coin');
  });

  it('a wait shows Show me after a while; Next on it offers it at once', () => {
    const { host, h } = page();
    const r = new StoryRunner(h);
    const at = BEATS.findIndex((b) => b.key === 'try');
    r.start(at);
    settle(r, host);
    expect(r.beat!.key).toBe('try');
    r.next();
    expect(r.at).toBe(at);
    expect(r.offer).toBe(true);
    r.showMe();
    expect(r.done).toBe(true);
    r.next();
    expect(r.beat!.key).toBe('coin');
  });

  it('Back plays the beat before again from where it started, to the bit', () => {
    const { host, h } = page();
    const r = new StoryRunner(h, fakeWidgets().widgets);
    r.enterAct(1);
    expect(r.beat!.key).toBe('guess');
    r.choose('left');
    r.next();
    expect(r.beat!.key).toBe('see');
    settle(r, host);
    const after = Array.from(host.s.game.wealth);
    expect(host.s.duels).toBe(7);
    r.next();
    settle(r, host);
    expect(host.s.duels).toBe(19);
    r.back();
    expect(r.beat!.key).toBe('see');
    // from its checkpoint (one duel in the log), its first duel already begun
    expect(host.s.duels).toBe(2);
    settle(r, host);
    expect(host.s.duels).toBe(7);
    expect(Array.from(host.s.game.wealth)).toEqual(after);
  });

  it('the panel shows what the story has revealed so far, and by the end all of it, as Play has it', () => {
    const { h } = page();
    const r = new StoryRunner(h, fakeWidgets().widgets);
    r.start();
    expect(r.showing).toEqual({ sliders: [], controls: [], charts: [], marks: [] });
    r.start(BEATS.findIndex((b) => b.key === 'try'));
    expect(r.showing).toEqual({ sliders: ['stake'], controls: [], charts: [], marks: [{ slider: 'stake', at: 0.1 }] });
    r.enterAct(3);
    expect(r.showing?.sliders).toEqual(['stake']);
    expect(r.showing?.charts).toBe(true);
    r.start(BEATS.length - 1);
    expect(r.showing).toBeNull();
  });

  it('owner 2026-10-22: who you are is drawn — the ring hops, slower and slower, and stops on you; your card is picked', () => {
    const s = new Session({ n: 16 });
    s.run('lottery');
    expect(s.teaching).toBe(true);
    const seen = new Set<number>();
    let t = 0;
    for (; t < 12 && s.teaching; t += 1 / 30) {
      s.frame(1 / 30);
      const ring = s.highlight ? s.highlight.indexOf(1) : -1;
      if (ring >= 0) seen.add(ring);
    }
    expect(seen.size).toBeGreaterThan(3);
    // long enough for suspense (owner, 2026-10-22: it was too short)
    expect(t).toBeGreaterThan(6.5);
    expect(s.you).not.toBeNull();
    expect(s.selected).toBe(s.you!.i);
    expect(s.highlight).toBeNull();
  });

  it('owner 2026-10-22: the reader must choose the yard: Do it for me is never offered there, and choosing goes on', () => {
    const { host, h } = page();
    const r = new StoryRunner(h, fakeWidgets().widgets);
    r.start(BEATS.findIndex((b) => b.key === 'which'));
    settle(r, host);
    for (let t = 0; t < 12; t += 1 / 30) r.frame(1 / 30);
    expect(r.offer).toBe(false);
    r.next();
    expect(r.offer).toBe(false);
    expect(r.beat!.key).toBe('which');
    r.showMe();
    expect(r.done).toBe(false);
    expect(r.beat!.key).toBe('which');
  });

  it('a widget is told again what the reader chose when Back shows it again', () => {
    const { host, h } = page();
    const fake = fakeWidgets();
    const r = new StoryRunner(h, fake.widgets);
    r.enterAct(3);
    for (let guard = 0; guard < 60 && r.beat!.key !== 'which'; guard++) {
      if (r.playing) r.next();
      if (!r.done) r.showMe();
      settle(r, host);
      r.next();
    }
    fake.pick();
    expect(r.done).toBe(true);
    // chosen: on at once (no Next), to the draw
    r.frame(1 / 30);
    settle(r, host);
    expect(r.beat!.key).toBe('lottery');
    expect(fake.log.at(-1)).toBe('yards config grow told 2');
    settle(r, host);
    r.next();
    r.back();
    expect(r.beat!.key).toBe('lottery');
    // mounted afresh (the next beat had none), with the pick it was told
    expect(fake.log.at(-1)).toBe('yards mount grow told 2');
  });

  it('each act entered directly builds its yard', () => {
    for (const a of [1, 2, 3]) {
      const { host, h } = page();
      const r = new StoryRunner(h, fakeWidgets().widgets);
      r.enterAct(a);
      expect(r.at).toBe(ACT_STARTS[a]);
      expect(host.s.game.n).toBe(4);
      if (a === 1) expect(host.s.partners).toBe(1);
      else {
        expect(host.s.duels).toBe(DUELS);
        expect(statsOf(host.s.game.wealth).neff).toBeLessThanOrEqual(a === 2 ? NEFF_ACT2 : NEFF_PHOTO);
      }
      expect(host.s.log.filter((l) => l.startsWith('error'))).toEqual([]);
    }
  });
});

describe('the stage learns to teach', () => {
  it('until round and until gini stop play exactly there, whatever the frame rate', () => {
    for (const dt of [1 / 60, 1 / 7]) {
      const s = new Session({ n: 16, seed: 3 });
      s.run('fx off; play 4000; until round 40');
      for (let t = 0; t < 5 && s.script; t += dt) s.frame(dt);
      expect(s.game.run.round).toBe(40);
      expect(s.playing).toBe(false);
      s.run('play; until gini 0.4');
      for (let t = 0; t < 20 && s.script; t += dt) s.frame(dt);
      const g = statsOf(s.game.wealth).gini;
      expect(g).toBeGreaterThanOrEqual(0.4);
      // the round before it was still under
      const before = new Session({ n: 16, seed: 3 });
      before.run(`fx off; round ${s.game.run.round - 1}`);
      expect(statsOf(before.game.wealth).gini).toBeLessThan(0.4);
    }
  });

  it('hurry lands everything at once; what plays on with no goal goes on', () => {
    const s = new Session({ n: 16 });
    s.start('t', linesOf('veil on; until done; money fill; until done; fx trade toss; meet; until done; round; until done; play 64; until round +10; play'));
    s.hurry();
    expect(s.script).toBeNull();
    expect(s.veil).toBe(1);
    expect(s.game.run.round).toBe(11);
    expect(s.playing).toBe(true);
    expect(s.transit.busy).toBe(false);
  });

  it('teaching commands are atomic and checked', () => {
    const s = new Session({ n: 4 });
    for (const bad of ['glow nose 1', 'glow body 9', 'guide line 2', 'badge cake', 'face all dance', 'be 9', 'money pour', 'headroom 9', 'meet']) {
      expect(s.run(bad), bad).toMatch(/^error/);
    }
    expect(s.run('glow stake poorer; glow tab play; badge gini on; guide lorenz gap; be 2')).not.toMatch(/error/);
    expect([...s.glows]).toEqual(['stake:poorer', 'tab:play']);
    expect(s.badges.gini).toBe(true);
    expect(s.you?.i).toBe(2);
    expect(s.youText()).toBe('#1 of 4 · 25%');
  });

  it('a checkpoint is a share link and the view: loaded, the same yard', () => {
    const s = new Session({ n: 16 });
    s.run('fx trade toss; rule tax 0.01; fx off; round 30; glow tab rules; badge round on; guide line 0.3; headroom 0.5; stakes on');
    const t = Session.load(s.share());
    t.applyViewState(s.viewState());
    expect(Array.from(t.game.wealth)).toEqual(Array.from(s.game.wealth));
    expect(t.viewState()).toEqual(s.viewState());
  });

  it('keys: in the Story Space, Enter and → go on, ← goes back (mirrored right to left); a focused slider keeps its arrows', () => {
    expect(keyAction(' ', 'page', 'none', true)).toBe('story-next');
    expect(keyAction('Enter', 'page', 'none', true)).toBe('story-next');
    expect(keyAction('ArrowRight', 'page', 'none', true)).toBe('story-next');
    expect(keyAction('ArrowLeft', 'page', 'none', true)).toBe('story-back');
    expect(keyAction('ArrowLeft', 'page', 'none', true, true)).toBe('story-next');
    expect(keyAction('ArrowRight', 'slider', 'none', true)).toBe('native');
    expect(keyAction('PageDown', 'slider', 'none', true)).toBe('native');
    expect(keyAction('Enter', 'slider', 'none', true)).toBe('story-next');
    expect(keyAction(' ', 'control', 'none', true)).toBe('native');
    expect(keyAction(' ', 'slider', 'none', false)).toBe('play-pause');
    // in Play, Space still plays and pauses
    expect(keyAction(' ', 'page', 'none', false)).toBe('play-pause');
  });

  it('the program shown is the core: its sliders as numbers, no watched numbers or plots; put back, the same program', () => {
    const p = stageProgram(4);
    const st = strip(p, (name) => (name === 'stake' ? 0.15 : name === 'tax' ? 0.05 : undefined));
    const text = JSON.stringify(st.program);
    expect(text).not.toMatch(/panel\./);
    expect(text).toMatch(/"v":0\.15/);
    expect(st.sliders.size).toBe(2);
    // the Gini and effective number, and the three charts (Gini, Lorenz, CCDF)
    expect(st.removed).toHaveLength(5);
    const back = unstrip(st.program, st);
    // the same program, its sliders starting at what they held
    expect(JSON.stringify(back).replace(/"start":\{"op":"pct","v":[\d.]+\}/g, 'S')).toBe(JSON.stringify(p).replace(/"start":\{"op":"pct","v":[\d.]+\}/g, 'S'));
    expect(validate(back)).toEqual([]);
  });

  it('the three yards: the extremes and one between, from equal, their places shuffled the same for everyone', () => {
    expect(YARDS).toHaveLength(3);
    expect(YARDS[0].tax).toBe(0);
    expect(YARDS[2].tax).toBeGreaterThan(YARDS[1].tax);
    expect(shuffle(YARDS, SEED)).toEqual(shuffle(YARDS, SEED));
  });

  it('owner 2026-10-21: the three yards, 16 squares each, show what they are within seconds: very unequal, between, very equal', () => {
    const ginis = YARDS.map((_, k) => {
      const s = yardSession(k);
      expect(s.game.n).toBe(16);
      for (let f = 0; f < 60 * 6; f++) s.frame(1 / 60);
      return statsOf(s.game.wealth).gini;
    });
    expect(ginis[0]).toBeGreaterThan(0.35);
    expect(ginis[1]).toBeGreaterThan(ginis[2] + 0.08);
    expect(ginis[0]).toBeGreaterThan(ginis[1] + 0.15);
    expect(ginis[2]).toBeLessThan(0.15);
  });

  it('owner 2026-10-21: the photo for any small N_eff, copies side by side; over the box, the overflow is cut off and thrown; short, one more copy is cut to fill the gap', () => {
    expect([2.9, 2.5, 3, 3.3, 1.2, 6.4, 7].map(stripOf)).toEqual([3, 3, 3, 3, 1, 6, 0]);
    const neffOf = (w: number[]) => 1 / w.reduce((s, x) => s + x * x, 0);
    // what the photo ends as: the box exactly, the copies, the cut, the fraction counted
    const end = (w: number[]) => {
      const f = compile(parseRecipe(PRESETS.neff), w);
      const scene = emptyScene();
      prints(f, 60, scene);
      return { f, scene };
    };
    // N_eff 2.89: three copies, 0.11 over the box: cut off and thrown away
    const over = [0.48, 0.27, 0.2, 0.05];
    const a = end(over);
    expect(a.f.prints).toHaveLength(2);
    expect(a.f.photo!.cut).toBeCloseTo(1 - 3 / neffOf(over), 12);
    expect(a.scene.clip!.x + a.scene.clip!.w).toBeCloseTo(BOX + 1, 12);
    expect(a.scene.ghosts.filter((g) => g.free).every((g) => g.alpha === 0)).toBe(true);
    expect(a.scene.labels.at(-1)!.text).toBe(neffOf(over).toFixed(1));
    // N_eff 3.33: three copies leave a gap; one more, cut, its piece fills the gap exactly
    const short = [0.4, 0.3, 0.15, 0.15];
    const b = end(short);
    const gap = b.f.photo!.cut!;
    expect(gap).toBeCloseTo(1 - 3 / neffOf(short), 12);
    expect(gap).toBeGreaterThan(0);
    const piece = b.scene.ghosts.find((g) => g.free && g.alpha > 0 && g.cut)!;
    expect(piece.cut!.x0).toBeCloseTo(BOX + 1 - gap, 9);
    expect(piece.cut!.x1).toBeCloseTo(BOX + 1, 9);
    expect(b.scene.labels.at(-1)!.text).toBe(neffOf(short).toFixed(1));
  });

  it('owner 2026-10-22: leaving Learn, the coin flips stay there (trades as pieces in Play)', () => {
    const { host, h } = page();
    const r = new StoryRunner(h, fakeWidgets().widgets);
    r.enterAct(1);
    expect(host.s.transit.trade).toBe('toss');
    r.leave();
    expect(host.s.transit.trade).toBe('piece');
  });

  it('review 2026-10-21, 1: leaving Learn while the levy is held at any of its moments, Play trades on, and Start again too', () => {
    for (const held of ['pot', 'share', 'back']) {
      const { host, h } = page();
      const r = new StoryRunner(h, fakeWidgets().widgets);
      r.enterAct(3);
      for (let guard = 0; guard < 80 && r.beat!.key !== held; guard++) {
        if (r.playing) r.next();
        if (!r.done) r.showMe();
        settle(r, host);
        r.next();
      }
      expect(r.beat!.key).toBe(held);
      settle(r, host);
      r.leave();
      const s = host.s;
      expect(s.transit.holdAt).toBeNull();
      const round = s.game.run.round;
      s.run('play');
      for (let t = 0; t < 20; t += 1 / 30) s.frame(1 / 30);
      expect(s.game.run.round, held).toBeGreaterThan(round + 2);
      // Start again: from round 0, and on past the first levy
      s.run('reset; play');
      for (let t = 0; t < 20; t += 1 / 30) s.frame(1 / 30);
      expect(s.game.run.round, `${held}, again`).toBeGreaterThan(2);
    }
  });

  it('the first tax round goes a step at a time: Next waits for each step; Back goes to its first', () => {
    const { host, h } = page();
    const r = new StoryRunner(h, fakeWidgets().widgets);
    r.enterAct(3);
    for (let guard = 0; guard < 60 && r.beat!.key !== 'pay'; guard++) {
      if (r.playing) r.next();
      if (!r.done) r.showMe();
      settle(r, host);
      r.next();
    }
    expect(host.s.game.rules.tax).toBe(0.05);
    // everyone's tax shows, cut and lifted, before it is paid
    expect(host.s.taxes).not.toBeNull();
    settle(r, host);
    r.next();
    expect(r.beat!.key).toBe('pot');
    // Next while the step plays: nothing
    for (let k = 0; k < 3 && r.playing; k++) {
      r.next();
      expect(r.beat!.key).toBe('pot');
      host.s.frame(1 / 30);
      r.frame(1 / 30);
    }
    settle(r, host);
    // held, half way through the levy (everything in the pot), its slices already off when it began
    expect(host.s.transit.busy).toBe(true);
    expect(host.s.transit.holdAt).toBe('pot');
    const clock = host.s.transit.clock;
    host.s.frame(1);
    expect(host.s.transit.clock).toBe(clock);
    expect(host.s.taxes).toBeNull();
    // the pot, everything in it, is a square (owner, 2026-10-22)
    const scene = emptyScene();
    host.s.transit.draw(host.s.live, scene);
    const pot = scene.pieces.filter((p) => p.colour === -1);
    expect(pot).toHaveLength(1);
    expect(pot[0].box.w).toBeCloseTo(pot[0].box.h, 9);
    r.next();
    expect(r.beat!.key).toBe('share');
    r.back();
    expect(r.beat!.key).toBe('pay');
  });

  it('owner 2026-10-22: the players’ money shared another way (1·6), and their duels, leave them the same height, each as wide as its money; a link replays them so', () => {
    const s = new Session({ n: 4 });
    s.run('meet 0 1; split 0.3');
    const [a, b] = s.players()!;
    const w = s.game.wealth;
    expect(w[a] / (w[a] + w[b])).toBeCloseTo(0.3, 9);
    expect(s.aspect[a]).toBeCloseTo(0.6, 9);
    expect(s.aspect[b]).toBeCloseTo(1.4, 9);
    s.run('fx trade off; duel 0 1 3');
    s.stage.finish();
    s.frame(1);
    expect(s.stage.h[a]).toBeCloseTo(s.stage.h[b], 9);
    // a gift that is neither still cuts across the longer side (the trades' own shapes)
    s.run('give 2 3 0.05');
    expect(s.aspect[2]).not.toBe(1);
    const t = Session.load(s.share());
    expect(Array.from(t.aspect)).toEqual(Array.from(s.aspect));
  });

  it('partners named stand a table apart: their stakes meet in the middle, each well off its own; the others watch from below', () => {
    const s = new Session({ n: 4 });
    s.run('fx trade toss; rule beta 0.3; meet 0 1; stakes on');
    s.stage.finish();
    s.frame(1);
    const scene = emptyScene();
    s.extras(scene);
    const [p, q] = scene.pieces.map((x) => x.box).sort((a, b) => a.x - b.x);
    // touching in the middle, the same height (owner, 2026-10-22: no gap between)
    expect(q.x - (p.x + p.w)).toBeCloseTo(0, 9);
    expect(q.h).toBeCloseTo(p.h, 12);
    // each off its own by the rest of the table
    const left = s.stage.x[0] < s.stage.x[1] ? 0 : 1;
    const rest = scene.display.get(left)!;
    expect(p.x - (rest.x + rest.w)).toBeGreaterThan(0.08);
    // owner, 2026-10-22: a stake only comes apart, its owner's slice, nothing reshaped: the strip and what is left
    // are its owner as it stood, cut in two (so moving the stake shows the share)
    const own = { x: s.stage.x[left], y: s.stage.y[left], w: s.stage.w[left], h: s.stage.h[left] };
    expect(p.h).toBeCloseTo(own.h, 12);
    expect(rest.h).toBeCloseTo(own.h, 12);
    expect(rest.x).toBeCloseTo(own.x, 12);
    expect(p.w + rest.w).toBeCloseTo(own.w, 12);
    for (const i of [2, 3]) expect(s.stage.y[i] + s.stage.h[i]).toBeLessThan(Math.min(s.stage.y[0], s.stage.y[1]));
    // a duel is a gift in the log, so a link replays it
    s.run('fx trade off; duel 0 1 5');
    const t = Session.load(s.share());
    expect(Array.from(t.game.wealth)).toEqual(Array.from(s.game.wealth));
    // and its shapes, the trades' own (review 2026-10-21, 5)
    expect(Array.from(t.aspect)).toEqual(Array.from(s.aspect));
  });

  it('the room keeps its squares in its band; charts stay in the box', () => {
    const s = new Session({ n: 16 });
    s.run('band 0.4 1.5; finish');
    s.stage.finish();
    for (let i = 0; i < 16; i++) {
      expect(s.stage.y[i]).toBeGreaterThanOrEqual(0.4 - 1e-9);
      expect(s.stage.y[i] + s.stage.h[i]).toBeLessThanOrEqual(1.5 + 1e-9);
    }
    s.run('pose fold; finish');
    expect(Math.min(...Array.from({ length: 16 }, (_, i) => s.stage.y[i]))).toBeCloseTo(0.5, 9);
  });

  it('side = wealth: true squares whose sides add up to the box, side by side, however trades shaped them', () => {
    const s = new Session({ n: 4, seed: SEED });
    // trades leave people oblong
    s.run('fx trade piece; play 8; until round 40');
    for (let t = 0; t < 60 && s.script; t += 1 / 30) s.frame(1 / 30);
    s.finishTransit();
    expect(Math.max(...Array.from(s.aspect))).toBeGreaterThan(1.05);
    s.run('pose squared desc row; finish');
    let sum = 0;
    for (let i = 0; i < 4; i++) {
      expect(s.stage.w[i]).toBeCloseTo(s.stage.h[i], 12);
      sum += s.stage.w[i];
    }
    expect(sum).toBeCloseTo(1, 9);
  });

  it('the running total, made of the squares: a tower of blocks 1/N wide, pulled into stairs on the Lorenz curve', () => {
    const s = new Session({ n: 4, seed: SEED });
    s.run('fx off; round 60; pose stairs; finish');
    const order = [0, 1, 2, 3].sort((p, q) => s.game.wealth[p] - s.game.wealth[q]);
    let c = 0;
    order.forEach((i, k) => {
      expect(s.stage.w[i]).toBeCloseTo(1 / 4, 9);
      expect(s.stage.x[i]).toBeCloseTo(0.5 + k / 4, 9);
      expect(s.stage.y[i]).toBeCloseTo(0.5 + c, 9);
      c += s.game.wealth[i];
      expect(s.stage.y[i] + s.stage.h[i]).toBeCloseTo(0.5 + c, 9);
    });
    s.run('pose tower; finish');
    for (const i of order) expect(s.stage.x[i]).toBeCloseTo(0.5, 9);
  });
});

describe('owner, 2026-10-21: the box, the edges', () => {
  it('in the box, trades are shown when asked (fx chart on); otherwise they happen at once', () => {
    for (const chart of [false, true]) {
      const s = new Session({ n: 4, seed: 7 });
      s.run(`fold; fx trade piece; fx chart ${chart ? 'on' : 'off'}; round`);
      expect(s.transit.busy, `chart ${chart}`).toBe(chart);
    }
  });

  it('glow edge bottom lights every square’s bottom edge, its side', () => {
    const s = new Session({ n: 4, seed: 7 });
    s.run('squared still; finish; glow edge bottom');
    const scene = emptyScene();
    s.extras(scene);
    expect(scene.edges).toHaveLength(4);
    for (const e of scene.edges) expect(e.y0).toBe(e.y1);
    s.run('glow edge off');
    const none = emptyScene();
    s.extras(none);
    expect(none.edges).toHaveLength(0);
  });
});

describe('owner, 2026-10-21: a scroll never cuts', () => {
  it('a scroll while a beat plays waits for it to finish, then goes on; Next still skips at once', () => {
    const { host, h } = page();
    const r = new StoryRunner(h);
    r.start();
    expect(r.playing).toBe(true);
    // scrolled mid-beat: nothing is cut, the beat plays on
    r.later(1);
    for (let k = 0; k < 5; k++) {
      host.s.frame(1 / 30);
      r.frame(1 / 30);
    }
    expect(r.at).toBe(0);
    expect(r.playing).toBe(true);
    // once it has finished, on to the next (and only then)
    for (let t = 0; t < 30 && r.at === 0; t += 1 / 30) {
      expect(r.playing).toBe(true);
      host.s.frame(1 / 30);
      r.frame(1 / 30);
    }
    expect(r.at).toBe(1);
    // Next while playing: the intentional skip, at once
    expect(r.playing).toBe(true);
    r.next();
    expect(r.playing).toBe(false);
    expect(r.at).toBe(1);
  });
});

describe('owner, 2026-10-21: glitches going back and forth', () => {
  it('through every beat and back again: no errors, and Back never teleports the squares', () => {
    const { host, h } = page();
    const fake = fakeWidgets();
    const r = new StoryRunner(h, fake.widgets);
    r.start();
    const frames = (k: number) => {
      for (let j = 0; j < k; j++) {
        host.s.frame(1 / 30);
        r.frame(1 / 30);
      }
    };
    for (let guard = 0; guard < 400 && !(r.last && r.ready); guard++) {
      if (r.playing) r.next();
      else if (!r.done) { if (r.beat?.wait?.kind === 'pick') fake.pick(); else r.showMe(); }
      else r.next();
      frames(3);
    }
    expect(r.last).toBe(true);
    const errors = () => host.s.log.filter((l) => l.startsWith('error'));
    expect(errors()).toEqual([]);
    for (let guard = 0; guard < 200 && r.at > 0; guard++) {
      const before = host.s;
      const at = r.at;
      const x = Float64Array.from(before.stage.x);
      const y = Float64Array.from(before.stage.y);
      r.back();
      expect(r.at, `back from ${at}`).toBeLessThan(at);
      const after = host.s;
      if (after !== before && after.stage.n === x.length) {
        let moved = 0;
        for (let i = 0; i < x.length; i++) moved = Math.max(moved, Math.hypot(after.stage.x[i] - x[i], after.stage.y[i] - y[i]));
        expect(moved, `squares jumped going back from ${r.beats[at].key}`).toBeLessThan(1e-9);
      }
      expect(errors()).toEqual([]);
      frames(2);
    }
  });
});

describe('owner, 2026-10-21: the pot, then its division', () => {
  it('"It all goes into one pot" holds there; the division begins only after its words, and stops before the deal', () => {
    const { host, h } = page();
    const r = new StoryRunner(h, fakeWidgets().widgets);
    r.enterAct(3);
    const frames = (seconds: number) => {
      for (let t = 0; t < seconds; t += 1 / 30) {
        host.s.frame(1 / 30);
        r.frame(1 / 30);
      }
    };
    for (let guard = 0; guard < 80 && r.beat?.key !== 'pot'; guard++) {
      if (r.playing && !r.beat?.steady) r.next();
      else if (!r.done) r.showMe();
      else if (r.playing) frames(0.2);
      else r.next();
      frames(0.1);
    }
    expect(r.beat?.key).toBe('pot');
    const shares = () => {
      const t = host.s.transit as unknown as { time: number; runs: { kind: string; transfers: { from: number; offAt: number; onAt: number }[] }[] };
      const levy = t.runs.find((x) => x.kind === 'levy');
      const out = levy ? levy.transfers.filter((x) => x.from < 0) : [];
      return { time: t.time, off: Math.min(...out.map((x) => x.offAt)), on: Math.min(...out.map((x) => x.onAt)), levy: !!levy };
    };
    // the pot beat played, then a while longer: everything in the pot, nothing divided yet
    frames(6);
    const pot = shares();
    expect(pot.levy).toBe(true);
    expect(pot.time).toBeLessThan(pot.off);
    // "Then the pot is shared out equally": its words first; then the division, held before the deal
    r.next();
    expect(r.beat?.key).toBe('share');
    frames(0.3);
    expect(shares().time).toBeLessThan(shares().off);
    frames(6);
    const share = shares();
    expect(share.time).toBeGreaterThanOrEqual(share.off);
    expect(share.time).toBeLessThan(share.on);
  });
});
