import * as Blockly from 'blockly/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { BODY, fromBlockly, toBlockly, type WorkspaceState } from '../../blocks/convert.ts';
import { defineBlocks } from '../../blocks/define.ts';
import { num, type Node, type Program } from '../../model/ast.ts';
import { OPS, defaultNode } from '../../model/catalogue.ts';
import { PRESETS, taxOf, tradeOf } from '../../model/presets.ts';

/** Every op at least once, each mode of the mode blocks too (valid or not: the round trip does not care). */
function everything(): Program {
  const slot: Node[] = [];
  const yard = defaultNode('setup.yard');
  const statements: Node[] = [];
  for (const spec of OPS.values()) {
    const node = defaultNode(spec.id);
    if (spec.kind === 'hat') continue;
    if (spec.kind === 'reporter') {
      if (spec.output === 'Number') statements.push(taxOf(node));
      else if (spec.output === 'Bool') statements.push({ op: 'ctl.until', args: { c: node }, body: [] });
      else if (spec.output === 'Pairing') statements.push(tradeOf({ pair: node }));
      else if (spec.output === 'Split') statements.push(tradeOf({ stake: node }));
      else if (spec.output === 'Group') statements.push(taxOf({ op: 'take.wealth', args: { rate: { op: 'pct', v: 0.01 }, from: node } }));
      else slot.push({ op: 'setup.start', args: { with: node } });
    } else if (!spec.step) statements.push(node);
  }
  for (const op of ['op.fn', 'op.fn2']) for (const fn of OPS.get(op)!.fields[0].options) statements.push(taxOf(defaultNode(op, { fn })));
  for (const op of ['dist.same', 'dist.uniform', 'dist.normal', 'dist.exponential', 'dist.lognormal', 'dist.pareto', 'dist.clip'])
    statements.push({ op: 'traits.thrift', args: { d: defaultNode(op) } });
  for (const how of ['equally', 'wealth']) statements.push(taxOf(defaultNode('take.wealth'), defaultNode('give.to', { how })));
  for (const op of ['and', 'or', 'butnot']) statements.push(taxOf({ op: 'take.flat', args: { a: num(0.1), from: defaultNode('group.combine', { op }) } }));
  // a coin made of an expression over an option, and a number over an option's default (a real num block)
  statements.push(
    tradeOf(
      {
        pair: { op: 'pair.near', args: { r: { op: 'op.arith', f: { op: 'add' }, args: { a: num(1), b: { op: 'val.global', f: { name: 'round' } } } } } },
        coin: num(0.6),
        stake: { op: 'stake.share', f: { of: 'loser' }, args: { beta: { op: 'op.sample', args: { d: { op: 'dist.uniform', args: { lo: num(0), hi: num(1) } } } } } },
      },
      { op: 'show.trades', f: { as: 'meet' } },
      { op: 'panel.number', f: { name: 'Gini' }, args: { value: { op: 'stat.of', f: { stat: 'gini', prop: 'wealth' }, args: { over: { op: 'group.all' } } } } },
    ),
  );
  const when: Node = { op: 'show.when', args: { c: defaultNode('op.not') }, body: [defaultNode('show.hold'), defaultNode('show.zoom')] };
  return {
    ast: 1,
    scripts: [{ op: 'ctl.start', body: [yard, ...slot, { op: 'ctl.forever', body: [{ op: 'ctl.repeat', args: { n: num(3) }, body: statements }] }] }, when],
  };
}

describe('AST ↔ Blockly JSON (pure)', () => {
  it('every preset, and every op, comes back as it went', () => {
    for (const p of PRESETS) expect(fromBlockly(toBlockly(p.program)).program, p.id).toEqual(p.program);
    const all = everything();
    expect(fromBlockly(toBlockly(all)).program).toEqual(all);
  });

  it('options load over their default shadow; numbers are their slot’s shadow', () => {
    const state = toBlockly(PRESETS.find((p) => p.id === 'theft-fraud')!.program);
    const trade = state.blocks!.blocks[0].next!.block!.next!.block!.inputs![BODY].block!;
    expect(trade.type).toBe('trade');
    // the steps, locked: pair up, flip, pay
    const pair = trade.inputs![BODY].block!;
    const pay = pair.next!.block!.next!.block!;
    expect([pair.type, pair.next!.block!.type, pay.type]).toEqual(['trade.pair', 'trade.flip', 'trade.pay']);
    expect(pay).toMatchObject({ movable: false, deletable: false });
    expect(pay.inputs!.stake.shadow!).toMatchObject({ type: 'stake.share', fields: { of: 'poorer' } });
    expect(pay.inputs!.stake.block!).toMatchObject({ type: 'stake.share', fields: { of: 'loser' } });
    expect(pay.inputs!.stake.block!.inputs!.beta).toEqual({ shadow: { type: 'pct', fields: { v: 10 } } });
  });

  it('loose blocks are not the program; when started first, then the rest top to bottom', () => {
    const start = toBlockly(PRESETS[0].program).blocks!.blocks[0];
    const when = { type: 'show.when', x: 0, y: -100 };
    const loose = { type: 'trade', x: 0, y: 50 };
    const state: WorkspaceState = { blocks: { languageVersion: 0, blocks: [{ ...start, y: 10 }, loose, when] } };
    const { program } = fromBlockly(state);
    expect(program.scripts.map((s) => s.op)).toEqual(['ctl.start', 'show.when']);
  });
});

describe('through Blockly itself (headless)', () => {
  beforeAll(() => defineBlocks());

  const roundTrip = (p: Program) => {
    const ws = new Blockly.Workspace();
    try {
      Blockly.serialization.workspaces.load(toBlockly(p), ws);
      return fromBlockly(Blockly.serialization.workspaces.save(ws) as WorkspaceState);
    } finally {
      ws.dispose();
    }
  };

  it('AST → Blockly → AST is the identity for every preset (spec, Acceptance)', () => {
    for (const p of PRESETS) expect(roundTrip(p.program).program, p.id).toEqual(p.program);
  });

  it('… and for every op and mode', () => {
    const all = everything();
    expect(roundTrip(all).program).toEqual(all);
  });

  it('paths map to block ids, so issues can find their blocks', () => {
    const { ids } = roundTrip(PRESETS[0].program);
    expect([...ids.keys()]).toContain('0/body/1/body/0/body/2/args/stake/args/beta');
    expect(new Set(ids.values()).size).toBe(ids.size);
  });

});

describe('recheck 3, N11: an untouched percentage comes back exactly', () => {
  it('1/3 as a share survives the editor, though it shows rounded', () => {
    defineBlocks();
    const third = 1 / 3;
    const p: Program = {
      ast: 1,
      scripts: [
        {
          op: 'ctl.start',
          body: [
            { op: 'setup.yard', f: { space: 'free' }, args: { n: num(10) } },
            { op: 'ctl.forever', body: [tradeOf({ stake: { op: 'stake.share', f: { of: 'poorer' }, args: { beta: { op: 'pct', v: third } } } })] },
          ],
        },
      ],
    };
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(toBlockly(p), ws);
    const back = fromBlockly(Blockly.serialization.workspaces.save(ws)).program;
    expect(back).toEqual(p);
    // typed over, it is what was typed
    const field = ws.getAllBlocks(false).find((b) => b.type === 'pct')!;
    field.setFieldValue(25, 'v');
    const typed = fromBlockly(Blockly.serialization.workspaces.save(ws)).program;
    expect(JSON.stringify(typed)).toContain('"v":0.25');
    ws.dispose();
  });
});

describe('owner, 2026-10-21: a long row breaks in two', () => {
  it('"the loser pays" on one row, its stake on the next; the round trip unchanged', () => {
    defineBlocks();
    const ws = new Blockly.Workspace();
    const pay = ws.newBlock('trade.pay');
    const kinds = pay.inputList.map((i) => i.type);
    expect(kinds).toEqual([Blockly.inputs.inputTypes.END_ROW, Blockly.inputs.inputTypes.VALUE]);
    expect(pay.inputList[0].fieldRow.map((f) => f.getText()).join(' ')).toBe('the loser pays');
    expect(pay.inputList[1].name).toBe('stake');
    ws.dispose();
  });
});
