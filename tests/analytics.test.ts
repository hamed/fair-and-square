import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createEventClient, incomingShareSource, sharedUrl, type AnalyticsData } from '../stage/analytics.ts';
import { simulationSummary } from '../stage/analytics/simulation.ts';
import { Session } from '../stage/console/session.ts';
import { num } from '../model/ast.ts';
import { options, preset, program, taxOf, tradeOf } from '../model/presets.ts';
import { StoryRunner, type StoryHost } from '../stage/story/runner.ts';
import { ACT_STARTS, BEATS } from '../stage/story/beats.ts';

describe('optional analytics delivery', () => {
  it('buffers the first 100 events, copies their properties, and flushes in order when the script loads', () => {
    const sent: number[] = [];
    let tracker: { track: (_name: string, data: AnalyticsData) => void } | undefined;
    const client = createEventClient(() => tracker);
    const data = { attempt: 0 };
    for (let k = 0; k < 105; k++) { data.attempt = k; client.track('learn_choice', data); }
    tracker = { track: (_name, props) => { sent.push(props.attempt as number); } };
    client.flush();
    client.flush();
    client.track('learn_choice', { attempt: 105 });
    expect(sent).toEqual([...Array.from({ length: 100 }, (_, k) => k), 105]);
  });

  it('ignores blocked, throwing, and rejected trackers', async () => {
    const send = vi.fn(() => { throw new Error('blocked'); });
    const client = createEventClient(() => ({ track: send }));
    expect(() => client.track('share', {})).not.toThrow();
    const rejected = createEventClient(() => ({ track: () => Promise.reject(new Error('offline')) }));
    rejected.track('share', {});
    await Promise.resolve();
    client.stop();
    client.track('share', {});
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('drops pending events after a script error', () => {
    const send = vi.fn();
    let ready = false;
    const client = createEventClient(() => ready ? { track: send } : undefined);
    client.track('share', {});
    client.stop();
    ready = true;
    client.flush();
    client.track('share', {});
    expect(send).not.toHaveBeenCalled();
  });
});

describe('share attribution and page URLs', () => {
  it('places source outside the untouched simulation fragment, without carrying unrelated query state', () => {
    const hash = '#n=16&seed=5&in=%5B%5D&at=20';
    for (const source of ['yard', 'square', 'embed'] as const) {
      const url = new URL(sharedUrl('https://example.com/fair/?opening=0', hash, source));
      expect(url.search).toBe(`?fs_share=${source}`);
      expect(url.hash).toBe(hash);
      expect(incomingShareSource(url.search)).toBe(source);
    }
    expect(incomingShareSource('')).toBe('unknown');
    expect(incomingShareSource('?fs_share=arbitrary-text')).toBe('unknown');
  });

  it('normalises analytics URLs and referrers while preserving unrelated campaign queries', () => {
    const window: { fsUmamiBeforeSend?: (type: string, payload: Record<string, unknown>) => Record<string, unknown> } = {};
    const location = new URL('https://example.com/fair/?fs_share=yard#n=10');
    runInNewContext(readFileSync('public/analytics-init.js', 'utf8'), { window, location, URL });
    const clean = window.fsUmamiBeforeSend!('event', {
      url: '/fair/?fs_share=yard&utm_source=news#p=private',
      referrer: 'https://other.com/?fs_share=square#p=private', name: 'share',
    });
    expect(clean).toEqual({ url: '/fair/?utm_source=news', referrer: 'https://other.com/', name: 'share' });
    for (const page of ['index.html', 'about.html', 'making-of.html']) {
      const html = readFileSync(page, 'utf8');
      expect(html).toContain('data-exclude-hash="true"');
      expect(html).toContain('data-domains="hamed.github.io"');
      expect(html.indexOf('analytics-init.js')).toBeLessThan(html.indexOf('cloud.umami.is/script.js'));
    }
  });
});

describe('simulation summaries', () => {
  it('uses actual live sliders and statistics without changing replay state', () => {
    const s = new Session({ n: 16, seed: 12 });
    s.run('fx off; rule beta 0.3; rule tax 0.01; round 7; give 1 2 0.01');
    const before = s.share();
    const data = simulationSummary(s);
    expect(data).toMatchObject({ sim_model: 'stage', sim_custom: false, sim_n: 16, sim_seed: 12,
      sim_stake_rule: 'poorer_share', sim_stake: 0.3, sim_tax_rule: 'wealth', sim_tax: 0.01,
      sim_coin_rule: 'fair', sim_round: 7, sim_step: s.game.run.steps, sim_input_count: s.game.run.inputs.length });
    expect(data.sim_gini).toBe(s.game.run.outputs().gini);
    expect(data.sim_richest_share).toBe(s.game.run.outputs().topOne);
    expect(s.share()).toBe(before);
    expect(Object.keys(data).length).toBeLessThanOrEqual(50);
  });

  it('identifies exact presets and reads their literal rates instead of the convenience getter defaults', () => {
    const s = new Session();
    s.setProgram(preset('wealth-tax').program);
    expect(s.game.rules.tax).toBe(0); // no tax slider exists in this preset
    expect(simulationSummary(s)).toMatchObject({ sim_model: 'wealth-tax', sim_custom: false, sim_stake: 0.1, sim_tax: 0.01 });
    s.setProgram(program({ stake: options.fixed(0.2) }));
    expect(simulationSummary(s)).toMatchObject({ sim_model: 'custom', sim_custom: true, sim_stake_rule: 'fixed', sim_stake: 0.2 });
  });

  it('categorises expressions and multiple rules without inventing scalar parameters', () => {
    const s = new Session();
    const expression = { op: 'op.arith', f: { op: 'mul' }, args: { a: num(0.1), b: num(2) } };
    s.setProgram(program({ stake: { op: 'stake.share', f: { of: 'poorer' }, args: { beta: expression } },
      then: [taxOf({ op: 'take.wealth', args: { rate: expression, from: { op: 'group.all' } } })] }));
    const dynamic = simulationSummary(s);
    expect(dynamic).toMatchObject({ sim_stake_rule: 'poorer_share_expression', sim_tax_rule: 'wealth_expression' });
    expect(dynamic).not.toHaveProperty('sim_stake');
    expect(dynamic).not.toHaveProperty('sim_tax');
    s.setProgram(program({ then: [tradeOf(), taxOf(options.wealthTax(0.01)), taxOf(options.gainsTax(0.3))] }));
    const multiple = simulationSummary(s);
    expect(multiple).toMatchObject({ sim_stake_rule: 'multiple', sim_tax_rule: 'multiple', sim_coin_rule: 'multiple' });
    expect(multiple).not.toHaveProperty('sim_stake');
    expect(multiple).not.toHaveProperty('sim_tax');
  });

  it('describes saving and growth without numeric stake/tax guesses or user-authored text', () => {
    const s = new Session();
    s.setProgram(preset('saving').program);
    expect(simulationSummary(s)).toMatchObject({ sim_stake_rule: 'split', sim_tax_rule: 'none' });
    s.setProgram(preset('growth').program);
    s.run('ask private question; by private author');
    const data = simulationSummary(s);
    expect(data).toMatchObject({ sim_model: 'growth', sim_stake_rule: 'none', sim_tax_rule: 'none', sim_coin_rule: 'none' });
    expect(data).not.toHaveProperty('sim_stake');
    expect(data).not.toHaveProperty('sim_tax');
    expect(JSON.stringify(data)).not.toMatch(/private|#|scripts|inputs/);
  });
});

describe('Learn event counting', () => {
  function reader(beats = BEATS) {
    let s = new Session({ n: 16 });
    const events: { name: string; data: AnalyticsData }[] = [];
    const host: StoryHost = { session: () => s, setSession: (next) => { s = next; }, ended() {},
      analytics: (name, data) => { events.push({ name, data }); } };
    return { r: new StoryRunner(host, {}, beats), events };
  }

  it('counts first answers and revisions, not duplicate clicks or checkpoint restoration', () => {
    const { r, events } = reader();
    r.start();
    r.enterAct(1);
    r.choose('left');
    r.choose('left');
    r.choose('right');
    r.next();
    r.back();
    r.choose('right');
    const choices = events.filter((e) => e.name === 'learn_choice');
    expect(choices.map((e) => [e.data.answer, e.data.attempt, e.data.method])).toEqual([['left', 1, 'manual'], ['right', 2, 'manual']]);
    expect((choices[0].data.left_share as number) + (choices[0].data.right_share as number)).toBeCloseTo(0.5);
    expect(events.filter((e) => e.name === 'learn_start')).toHaveLength(1);
    expect(events.filter((e) => e.name === 'learn_choice_shown')).toHaveLength(1);
    expect(events.filter((e) => e.name === 'learn_progress' && e.data.act === 2)).toHaveLength(1);
  });

  it('marks assisted predictions and starts answer attempts afresh on a new run', () => {
    const { r, events } = reader();
    r.enterAct(1);
    r.showMe();
    expect(events.find((e) => e.name === 'learn_choice')?.data).toMatchObject({ method: 'assisted', attempt: 1 });
    r.start(BEATS.findIndex((b) => b.key === 'guess'));
    r.choose('same');
    const choices = events.filter((e) => e.name === 'learn_choice');
    expect(choices[1].data).toMatchObject({ method: 'manual', attempt: 1 });
    expect(choices[1].data.run).not.toBe(choices[0].data.run);
  });

  it('does not allow yard assistance or a Next bypass', () => {
    const { r, events } = reader();
    r.start(BEATS.findIndex((b) => b.key === 'which'));
    r.showMe();
    r.next();
    expect(r.beat?.key).toBe('which');
    expect(r.done).toBe(false);
    expect(events.filter((e) => e.name === 'learn_choice' || e.name === 'learn_action')).toHaveLength(0);
    expect(events.find((e) => e.name === 'learn_choice_shown')?.data.question).toBe('yard');
  });

  it('counts completion once with help and skip flags, without counting ordinary exits as completion', () => {
    // A shortened last act keeps the flags test independent of animations and widget choices.
    const beats = BEATS.map((b, k) => k === ACT_STARTS[3] ? { key: 'open' as const, act: 3 } : b);
    const { r, events } = reader(beats);
    r.start();
    r.skipAct();
    r.showMe();
    expect(events.filter((e) => e.name === 'learn_complete')).toHaveLength(0);
    r.enterAct(3);
    r.back();
    r.enterAct(3);
    const complete = events.filter((e) => e.name === 'learn_complete');
    expect(complete).toHaveLength(1);
    expect(complete[0].data).toMatchObject({ skipped: true, assisted: true });
    expect(events.find((e) => e.name === 'learn_action' && e.data.action === 'skip_act')).toBeTruthy();
    r.end();
    expect(events.filter((e) => e.name === 'learn_complete')).toHaveLength(1);
  });
});
