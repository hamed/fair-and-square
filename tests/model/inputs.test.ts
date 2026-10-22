/** The panel's inputs (owner, 2026-10-19: sliders change on the fly): sliders, buttons and waits, replayed exactly. */
import { describe, expect, it } from 'vitest';
import { num, type Node, type Program } from '../../model/ast.ts';
import { Run } from '../../model/engine.ts';
import { options as o, taxOf, tradeOf } from '../../model/presets.ts';
import { validate } from '../../model/validate.ts';

const yard: Node = { op: 'setup.yard', f: { space: 'free' }, args: { n: num(50) } };
const slider = (name: string, min: number, max: number, start: number): Node => ({ op: 'panel.slider', f: { name }, args: { min: num(min), max: num(max), start: num(start) } });
const trade = (stake: Node): Node => (tradeOf({ pair: { op: 'pair.match', args: { within: { op: 'group.all' } } }, coin: { op: 'coin.strength', args: { s: { op: 'num', v: 0 }, b: { op: 'pct', v: 0 } } }, stake }));
const stakeBy = (beta: Node): Node => ({ op: 'stake.share', f: { of: 'poorer' }, args: { beta } });
const program = (round: Node[], ...more: Node[]): Program => ({ ast: 1, scripts: [{ op: 'ctl.start', body: [yard, { op: 'ctl.forever', body: round }] }, ...more] });

describe('inputs', () => {
  it('a slider changes the run on the fly, and replay reproduces it', () => {
    const p = program([trade(stakeBy(slider('stake', 0, 0.5, 0.1)))]);
    expect(validate(p)).toEqual([]);
    const live = new Run(p, 2);
    live.rounds(20);
    live.input({ kind: 'slider', name: 'stake', value: 0.4 });
    live.rounds(20);
    expect(live.round).toBe(40);
    expect(live.inputs).toEqual([{ step: 21, event: { kind: 'slider', name: 'stake', value: 0.4 } }]);
    // the same inputs at the same steps: the same state
    const again = new Run(p, 2);
    again.rounds(20);
    again.input({ kind: 'slider', name: 'stake', value: 0.4 });
    again.rounds(20);
    expect(again.hash()).toBe(live.hash());
    // seek back and forth through the log
    const at = live.hash();
    live.seek(5);
    live.seek(40);
    expect(live.hash()).toBe(at);
    // and the slider really moved the economy
    const unmoved = new Run(p, 2);
    unmoved.rounds(40);
    expect(unmoved.hash()).not.toBe(at);
    // a value past its ends counts as the end: 9 and 0.5 give the same run
    const over = new Run(p, 2);
    const end = new Run(p, 2);
    over.input({ kind: 'slider', name: 'stake', value: 9 });
    end.input({ kind: 'slider', name: 'stake', value: 0.5 });
    over.rounds(10);
    end.rounds(10);
    expect(over.hash()).toBe(end.hash());
  });

  it('a button runs its script once per press, between rounds', () => {
    const levy: Node = { op: 'panel.button', f: { name: 'levy' }, body: [taxOf(o.flatTax(0.1))] };
    const run = new Run(program([], levy), 1);
    expect(validate(run.program)).toEqual([]);
    run.rounds(3);
    expect(run.world.pot).toBe(0);
    run.input({ kind: 'button', name: 'levy' });
    run.input({ kind: 'button', name: 'levy' });
    run.rounds(1);
    expect(run.world.pot).toBeCloseTo(50 * 0.2, 12);
    run.rounds(3);
    expect(run.world.pot).toBeCloseTo(50 * 0.2, 12);
  });

  it('a wait holds the run until its button is pressed; a press before the wait does not count', () => {
    const p: Program = {
      ast: 1,
      scripts: [{ op: 'ctl.start', body: [yard, { op: 'ctl.repeat', args: { n: num(2) }, body: [trade(stakeBy(num(0.1)))] }, { op: 'panel.wait', f: { name: 'go' } }, { op: 'ctl.forever', body: [trade(stakeBy(num(0.1)))] }] }],
    };
    const run = new Run(p, 1);
    run.input({ kind: 'button', name: 'go' }); // too early: nobody waits yet
    expect(run.rounds(10)).toBe(2);
    expect(run.step()).toBe('wait');
    expect(run.waitingFor).toBe('go');
    expect(run.step()).toBe('wait');
    run.input({ kind: 'button', name: 'go' });
    expect(run.rounds(5)).toBe(5);
    expect(run.round).toBe(7);
    // replay goes through the wait the log released, to the same state
    const at = run.hash();
    run.seek(0);
    run.seek(7);
    expect(run.round).toBe(7);
    expect(run.hash()).toBe(at);
  });

  it('panel blocks: names are free text; slider ends are plain numbers; buttons run economy, not loops', () => {
    const bad = program([trade(stakeBy({ op: 'panel.slider', f: { name: '' }, args: { min: num(0), max: { op: 'val.global', f: { name: 'n' } }, start: num(0.1) } }))]);
    expect(validate(bad).map((i) => i.code).sort()).toEqual(['bad-field', 'literal-only', 'no-globals']);
    const loop: Node = { op: 'panel.button', f: { name: 'x' }, body: [{ op: 'ctl.forever', body: [] }] };
    expect(validate(program([], loop)).map((i) => i.code)).toEqual(['button-only']);
    const shows = program([{ op: 'panel.number', f: { name: 'Gini' }, args: { value: { op: 'stat.of', f: { stat: 'gini', prop: 'wealth' }, args: { over: { op: 'group.all' } } } } }, { op: 'panel.plot', f: { kind: 'lorenz' } }]);
    expect(validate(shows)).toEqual([]);
  });
});
