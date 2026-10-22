import { describe, expect, it } from 'vitest';
import { num, readProgram, type Node, type Program } from '../../model/ast.ts';
import { OPS, VALUES, defaultNode, inputsOf } from '../../model/catalogue.ts';
import { DEFAULT_PROGRAM, PRESETS, program, taxOf, tradeOf } from '../../model/presets.ts';
import { validate, type IssueCode } from '../../model/validate.ts';

const prop = (p: string, who: string): Node => ({ op: 'val.prop', f: { prop: p, who } });
const global = (name: string): Node => ({ op: 'val.global', f: { name } });
const codes = (p: Program): IssueCode[] => validate(p).map((i) => i.code);
const trade = (slots: Partial<Record<'pair' | 'coin' | 'stake', Node>>): Node => tradeOf(slots);
/** The default program with this body inside the forever loop. */
const looping = (...round: Node[]): Program => ({
  ast: 1,
  scripts: [{ op: 'ctl.start', body: [defaultNode('setup.yard'), { op: 'ctl.forever', body: round }] }],
});

describe('the catalogue', () => {
  it('every shadow is its op written out in full (its own numbers may differ from the op’s defaults)', () => {
    /** A node's shape: op, fields and inputs, all the way down; literal values left out. */
    const shape = (n: Node): unknown => ({
      op: n.op,
      f: n.f ? Object.keys(n.f).sort() : [],
      args: Object.fromEntries(Object.entries(n.args ?? {}).map(([k, child]) => [k, shape(child)])),
      v: n.v !== undefined,
    });
    for (const spec of OPS.values()) {
      for (const input of spec.inputs) {
        if (!input.shadow) continue;
        const full = VALUES.has(input.shadow.op) ? { op: input.shadow.op, v: input.shadow.v } : defaultNode(input.shadow.op, input.shadow.f);
        expect(shape(input.shadow), `${spec.id}.${input.name}`).toEqual(shape(full));
      }
    }
  });

  it('no modes: a block’s inputs never depend on its fields (owner, 2026-10-19)', () => {
    for (const spec of OPS.values()) expect(inputsOf(spec, { anything: 'x' }), spec.id).toEqual(spec.inputs);
  });
});

describe('validate', () => {
  it('the default program and every preset are valid', () => {
    expect(validate(DEFAULT_PROGRAM)).toEqual([]);
    for (const p of PRESETS) expect(validate(p.program), p.id).toEqual([]);
  });

  it('who may be read where (spec, Context rules)', () => {
    expect(codes(looping(trade({ coin: { op: 'op.arith', f: { op: 'add' }, args: { a: prop('wealth', 'poorer'), b: num(0) } } })))).toEqual([]);
    expect(codes(looping(trade({ coin: { op: 'op.arith', f: { op: 'add' }, args: { a: prop('wealth', 'winner'), b: num(0) } } })))).toEqual(['who-context']);
    expect(codes(looping(trade({ stake: { op: 'op.arith', f: { op: 'mul' }, args: { a: prop('inplay', 'loser'), b: num(0.1) } } })))).toEqual([]);
    expect(codes(looping(taxOf(prop('wealth', 'me'))))).toEqual([]);
    expect(codes(looping(taxOf(prop('wealth', 'poorer'))))).toEqual(['who-context']);
    expect(codes(looping(trade({ coin: prop('wealth', 'me') })))).toEqual(['who-context']);
    expect(codes(looping({ op: 'grow', args: { mu: prop('talent', 'me'), sigma: num(0.05) } }))).toEqual([]);
  });

  it('globals everywhere but in setup', () => {
    expect(codes(looping(taxOf({ op: 'stat.of', f: { stat: 'gini', prop: 'wealth' }, args: { over: { op: 'group.all' } } })))).toEqual([]);
    const yard = { op: 'setup.yard', f: { space: 'free' }, args: { n: global('n') } };
    expect(codes({ ast: 1, scripts: [{ op: 'ctl.start', body: [yard] }] })).toEqual(['no-globals']);
  });

  it('options belong to their knob; types are checked', () => {
    expect(codes(looping(taxOf({ op: 'coin.strength', args: { s: { op: 'num', v: 0 }, b: { op: 'pct', v: 0 } } })))).toEqual(['knob-home']);
    expect(codes(looping(trade({ coin: { op: 'stake.split' } })))).toEqual(['bad-type', 'knob-home']);
    expect(codes(looping(trade({ pair: { op: 'coin.strength', args: { s: { op: 'num', v: 0 }, b: { op: 'pct', v: 0 } } } })))).toEqual(['bad-type', 'knob-home']);
    // nested inside its own slot is fine
    expect(codes(looping(taxOf({ op: 'op.arith', f: { op: 'mul' }, args: { a: num(0.5), b: defaultNode('take.wealth') } })))).toEqual([]);
  });

  it('setup: the yard first, under when started, before the first loop, once each', () => {
    const start = (...body: Node[]): Program => ({ ast: 1, scripts: [{ op: 'ctl.start', body }] });
    const yard = defaultNode('setup.yard');
    const talent = defaultNode('traits.talent');
    expect(codes(start(yard, talent, { op: 'ctl.forever', body: [] }))).toEqual([]);
    expect(codes(start(talent, yard))).toEqual(['yard-first']);
    expect(codes(start(talent))).toEqual(['no-yard']);
    expect(codes(start(yard, talent, talent))).toEqual(['setup-twice']);
    expect(codes(start(yard, { op: 'ctl.forever', body: [] }, talent))).toEqual(['setup-place']);
    expect(codes(start(yard, { op: 'ctl.forever', body: [talent] }))).toEqual(['setup-place']);
  });

  it('scripts: one when-started; hats only at the top; statements and values in their places', () => {
    const yard = defaultNode('setup.yard');
    expect(codes({ ast: 1, scripts: [] })).toEqual(['no-start']);
    expect(codes({ ast: 1, scripts: [{ op: 'ctl.start', body: [yard] }, { op: 'ctl.start', body: [yard] }] })).toEqual(['one-start']);
    expect(codes({ ast: 1, scripts: [{ op: 'ctl.start', body: [yard] }, trade({})] })).toEqual(['not-a-hat']);
    expect(codes(looping(num(1)))).toEqual(['not-statement']);
    expect(codes(looping(taxOf(trade({}))))).toEqual(['not-value']);
    const when = { op: 'show.when', args: { c: { op: 'op.cmp', f: { op: 'gt' }, args: { a: { op: 'stat.of', f: { stat: 'gini', prop: 'wealth' }, args: { over: { op: 'group.all' } } }, b: num(0.5) } } }, body: [trade({})] };
    expect(codes({ ast: 1, scripts: [{ op: 'ctl.start', body: [yard] }, when] })).toEqual(['camera-only']);
  });

  it('every input written out; fields are ids', () => {
    const noStake = tradeOf();
    (noStake.body![2] as { args?: object }).args = {};
    expect(codes(looping(noStake))).toEqual(['missing-input']);
    expect(codes(looping({ op: 'ctl.until', args: {}, body: [] }))).toEqual(['missing-input']);
    expect(codes(looping({ op: 'move', args: { v: num(0.5), w: num(1) } }))).toEqual(['unknown-input', 'needs-lattice']);
    expect(codes(looping(taxOf(prop('wealth', 'everyone'))))).toEqual(['bad-field']);
    expect(codes(looping(taxOf({ op: 'num' })))).toEqual(['missing-value']);
    expect(codes(looping({ op: 'nope' }))).toEqual(['unknown-op']);
  });
});

describe('readProgram', () => {
  it('reads what JSON.stringify wrote', () => {
    const p = program({ n: 50 });
    expect(readProgram(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('names the first malformed place', () => {
    expect(() => readProgram({ ast: 2, scripts: [] })).toThrow(/version/);
    expect(() => readProgram({ ast: 1, scripts: [{ op: 'num', v: 'x' }] })).toThrow(/0: "v"/);
    expect(() => readProgram({ ast: 1, scripts: [{ op: 'ctl.start', body: [{ nope: 1 }] }] })).toThrow(/0\/body\/0/);
    expect(() => readProgram({ ast: 1, scripts: [{ op: 'ctl.start', label: 'x' }] })).toThrow(/unknown key/);
  });
});

describe('step blocks (trade, tax): locked steps, observers between them', () => {
  const trade = tradeOf();
  it('all steps, once each, in order; observers anywhere among them', () => {
    const observed = { ...trade, body: [{ op: 'show.trades', f: { as: 'meet' } }, trade.body![0], { op: 'panel.number', f: { name: 'Gini' }, args: { value: { op: 'stat.of', f: { stat: 'gini', prop: 'wealth' }, args: { over: { op: 'group.all' } } } } }, ...trade.body!.slice(1)] };
    expect(codes(looping(observed))).toEqual([]);
    expect(codes(looping({ ...trade, body: [trade.body![1], trade.body![0], trade.body![2]] }))).toEqual(['step-order']);
    expect(codes(looping({ ...trade, body: trade.body!.slice(0, 2) }))).toEqual(['step-order']);
    expect(codes(looping({ ...trade, body: [...trade.body!, { op: 'grow', args: { mu: num(0), sigma: num(0) } }] }))).toEqual(['observer-only']);
    expect(codes(looping(trade.body![0]))).toEqual(['step-place']);
    expect(codes(looping(taxOf({ op: 'take.flat', args: { a: num(0.1), from: { op: 'group.all' } } })))).toEqual([]);
  });

  it('a named group is defined above where it is used, once per name', () => {
    const define = (name: string, group: Node = { op: 'group.richest', args: { q: { op: 'pct', v: 0.1 } } }): Node => ({ op: 'group.define', f: { name }, args: { group } });
    const named = (name: string): Node => ({ op: 'group.named', f: { name } });
    const taxing = (from: Node) => taxOf({ op: 'take.flat', args: { a: num(0.1), from } });
    const program = (setup: Node[], from: Node): Program => ({
      ast: 1,
      scripts: [{ op: 'ctl.start', body: [{ op: 'setup.yard', f: { space: 'free' }, args: { n: num(10) } }, ...setup, { op: 'ctl.forever', body: [taxing(from)] }] }],
    });
    expect(codes(program([define('rich')], named('rich')))).toEqual([]);
    expect(codes(program([define('rich')], named('poor')))).toEqual(['unknown-group']);
    expect(codes(program([define('rich'), define('rich')], named('rich')))).toEqual(['setup-twice']);
    expect(codes(program([define('rich'), define('poor')], named('poor')))).toEqual([]);
    // a definition sees only those above it (and never itself)
    expect(codes(program([define('both', named('poor')), define('poor')], named('both')))).toEqual(['unknown-group']);
    expect(codes(program([define('self', named('self'))], named('self')))).toEqual(['unknown-group']);
  });

  it('scope follows position: winner and loser exist only in pay', () => {
    const winner = { op: 'val.prop', f: { prop: 'wealth', who: 'winner' } };
    expect(codes(looping(tradeOf({ coin: winner })))).toEqual(['who-context']);
    expect(codes(looping(tradeOf({ stake: { op: 'op.arith', f: { op: 'mul' }, args: { a: num(0.1), b: winner } } })))).toEqual([]);
  });
});

describe('space (owner, 2026-10-19)', () => {
  it('neighbours and moving need squares on a square lattice', () => {
    const near = tradeOf({ pair: { op: 'pair.near', args: { r: num(1) } } });
    const yard = (space: string): Node => ({ ...defaultNode('setup.yard'), f: { space } });
    const p = (space: string, ...round: Node[]): Program => ({ ast: 1, scripts: [{ op: 'ctl.start', body: [yard(space), { op: 'ctl.forever', body: round }] }] });
    expect(codes(p('free', near))).toEqual(['needs-lattice']);
    expect(codes(p('free', { op: 'move', args: { v: num(1) } }))).toEqual(['needs-lattice']);
    expect(codes(p('lattice', near, { op: 'move', args: { v: num(1) } }))).toEqual([]);
    expect(codes(p('lattice', tradeOf()))).toEqual([]);
  });
});
