/**
 * One regression per engine finding of REVIEW-2026-10-19-MODEL-BLOCKS.md (MB1, MB2, MB3, MB6, MB8). The editor's
 * findings (MB4, MB5, MB7) are in tests/browser/editor.spec.ts.
 */
import { describe, expect, it } from 'vitest';
import { num, type Node, type Program } from '../../model/ast.ts';
import { pow } from '../../model/dmath.ts';
import { Run } from '../../model/engine.ts';
import { options as o, statementOf, taxOf, tradeOf } from '../../model/presets.ts';

const yard = (n: number): Node => ({ op: 'setup.yard', f: { space: 'lattice' }, args: { n: num(n) } });
const start = (...body: Node[]): Program => ({ ast: 1, scripts: [{ op: 'ctl.start', body }] });
const forever = (...body: Node[]): Node => ({ op: 'ctl.forever', body });
const arith = (op: string, a: Node, b: Node): Node => ({ op: 'op.arith', f: { op }, args: { a, b } });
const random: Node = { op: 'op.sample', args: { d: { op: 'dist.uniform', args: { lo: num(0), hi: num(1) } } } };
const tax = (tau: Node, r?: Node): Node => taxOf(tau, r);
const tradeNear = (r: Node): Node => tradeOf({ pair: { op: 'pair.near', args: { r } } });
const sum = (xs: ArrayLike<number>) => Array.from(xs).reduce((a, b) => a + b, 0);

describe('review 2026-10-19, model and blocks', () => {
  it('MB1: nested loops share one allowance per round, so three nested forevers still end the round', () => {
    const run = new Run(start(yard(100), forever(forever(forever()))), 1);
    const t0 = performance.now();
    expect(run.rounds(2)).toBe(2);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect([...run.warnings.values()]).toContain('runaway');
  });

  it('MB2: a growth step that cannot be represented is not committed', () => {
    const p = start(
      yard(30),
      statementOf.debt(1),
      forever(tradeOf({ pair: { op: 'pair.match', args: { within: { op: 'group.all' } } }, coin: { op: 'coin.strength', args: { s: { op: 'num', v: 0 }, b: { op: 'pct', v: 0 } } }, stake: o.stake('loser', 0.5) }), statementOf.grow(0, 0.3)),
    );
    const run = new Run(p, 2);
    for (let r = 0; r < 120; r++) {
      run.rounds(1);
      const out = run.outputs();
      expect(sum(run.world.w) + run.world.pot).toBeCloseTo(30, 9);
      expect(Number.isFinite(out.total) && out.growth > 0).toBe(true);
      expect(Math.min(...run.world.w)).toBeGreaterThanOrEqual(-run.world.debt - 1e-12);
    }
    const shrink = new Run(start(yard(2), statementOf.debt(1), forever(statementOf.grow(-0.01, 0))), 1);
    shrink.rounds(200);
    expect(sum(shrink.world.w) + shrink.world.pot).toBeCloseTo(2, 9);
    expect([...shrink.warnings.values()]).toEqual(['collapse']);
  });

  it('MB3: a scalar expression draws at index 0, whatever ran before it', () => {
    const near = tradeNear(arith('mul', num(2), random));
    const filmed = new Run(start(yard(10), forever({ op: 'show.arrange', f: { layout: 'places', sort: 'id' } }, near)), 4);
    const taxed = new Run(start(yard(10), forever(tax(num(0)), near)), 4);
    filmed.rounds(5);
    taxed.rounds(5);
    expect(taxed.hash()).toBe(filmed.hash());

    const burn = { op: 'ctl.every', args: { k: arith('add', num(1), arith('mul', num(3), random)) }, body: [tax(o.flatTax(0.01))] };
    const trade = tradeNear(num(1));
    const plain = new Run(start(yard(20), forever(burn, trade)), 3);
    const more = new Run(start(yard(20), forever(burn, trade, tax(arith('mul', num(0), random)))), 3);
    plain.rounds(30);
    more.rounds(30);
    expect(more.hash()).toBe(plain.hash());
  });

  it('MB6: huge but finite give weights neither destroy wealth nor make NaN', () => {
    for (const n of [2, 4, 7]) {
      const run = new Run(start(yard(n), forever(tax(num(0.5), num(1e308)))), 1);
      run.rounds(1);
      expect(Array.from(run.world.w)).toEqual(new Array(n).fill(1));
      expect(run.world.pot).toBe(0);
      expect(run.warnings.size).toBe(0);
    }
  });

  it('MB8: negative bases with whole exponents beyond 1024', () => {
    expect([pow(-1, 1025), pow(-1, 1026), pow(-1, 1024), pow(-1, 1023), pow(-1, 2 ** 60)]).toEqual([-1, 1, 1, -1, 1]);
    expect([pow(-2, 1025), pow(-2, 1026), pow(-0.5, -1025)]).toEqual([-Infinity, Infinity, -Infinity]);
    expect(pow(-2, 0.5)).toBeNaN();
    const run = new Run(start(yard(5), forever(tax({ op: 'op.fn', f: { fn: 'abs' }, args: { a: { op: 'op.fn2', f: { fn: 'power' }, args: { a: num(-1), b: num(1025) } } } }))), 1);
    run.rounds(1);
    expect(run.world.pot).toBe(5);
    expect(run.warnings.size).toBe(0);
  });
});

describe('self-review 2026-10-19 (the code-review pass before the first commit)', () => {
  it('S1: every (k) outside a loop is flagged: it would test its round once and skip for good', async () => {
    const { validate } = await import('../../model/validate.ts');
    const every = { op: 'ctl.every', args: { k: num(2) }, body: [forever()] };
    expect(validate(start(yard(10), every)).map((i) => i.code)).toEqual(['every-outside']);
    expect(validate(start(yard(10), forever({ ...every, body: [] }))).map((i) => i.code)).toEqual([]);
  });

  it('S2: setup blocks come right after the yard, so round 0 is setup done', async () => {
    const { validate } = await import('../../model/validate.ts');
    const trade = tradeOf({ pair: { op: 'pair.match', args: { within: { op: 'group.all' } } }, coin: { op: 'coin.strength', args: { s: { op: 'num', v: 0 }, b: { op: 'pct', v: 0 } } }, stake: o.stake('poorer', 0.1) });
    const issues = validate(start(yard(10), trade, statementOf.talent(0.6, 0.1), forever(trade)));
    expect(issues.map((i) => [i.path, i.code])).toEqual([['0/body/2', 'setup-place']]);
  });

  it('S4: when started is script 0 wherever the camera scripts sit, so random paths stay put', async () => {
    const { fromBlockly, toBlockly } = await import('../../blocks/convert.ts');
    const program = start(yard(10), forever(tax(arith('mul', num(0), random))));
    const state = toBlockly(program);
    state.blocks!.blocks.push({ type: 'show.when', x: 0, y: -500 });
    expect(fromBlockly(state).program.scripts.map((s) => s.op)).toEqual(['ctl.start', 'show.when']);
  });
});
