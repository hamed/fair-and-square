/**
 * The vocabulary: every op id the AST may use, with its shape, types, inputs (each with its default shadow and the
 * context its expression runs in) and fields (stable ids). The engine and the block editor both read this table,
 * so a block's type name is its AST op id (spec, Blocks). Labels are not here: they are the view's
 * (blocks/words/blocks.en.ts), so they can be translated without touching meaning.
 *
 * Ids are never renamed or reused; a new meaning gets a new id.
 */
import { num, type Node } from './ast.ts';
import { STATS } from './stats.ts';

export type ValueType = 'Number' | 'Bool' | 'Pairing' | 'Split' | 'Group' | 'Distribution' | 'Allocation';
export type Kind = 'hat' | 'stack' | 'c' | 'reporter';
export type Who = 'me' | 'poorer' | 'richer' | 'winner' | 'loser';
type Knob = 'pair' | 'coin' | 'stake' | 'tax' | 'give';
/** Where a block was filed before the six categories: kept as the raw input to `place` below. */
type Drawer =
  | 'control'
  | 'setup'
  | 'economy'
  | 'camera'
  | 'pair'
  | 'coin'
  | 'stake'
  | 'tax'
  | 'give'
  | 'group'
  | 'dist'
  | 'alloc'
  | 'value'
  | 'operator'
  | 'panel';

/** What an expression in a slot may read: which agents, whether globals, and which knob's options. */
export interface Context {
  readonly who: readonly Who[];
  readonly globals: boolean;
  readonly knob?: Knob;
}

export const CONTEXT = {
  /** setup arguments: no state exists yet */
  setup: { who: [], globals: false },
  /** loop counts, conditions, pairing arguments, camera arguments */
  global: { who: [], globals: true },
  coin: { who: ['poorer', 'richer'], globals: true, knob: 'coin' },
  stake: { who: ['poorer', 'richer', 'winner', 'loser'], globals: true, knob: 'stake' },
  tax: { who: ['me'], globals: true, knob: 'tax' },
  give: { who: ['me'], globals: true, knob: 'give' },
  /** grow's μ and σ, move's chance: one value per agent */
  agent: { who: ['me'], globals: true },
  pair: { who: [], globals: true, knob: 'pair' },
} as const satisfies Record<string, Context>;

type ContextName = keyof typeof CONTEXT;

interface InputSpec {
  readonly name: string;
  readonly accepts: readonly ValueType[];
  /** The context its expression runs in; 'inherit' takes the block's own (an option's arguments read what it reads). */
  readonly context: ContextName | 'inherit';
  /** The default shadow; Bool slots have none and start empty. */
  readonly shadow?: Node;
}

/** An op as the table writes it: filed in a drawer, placed in a category and section by `place`. */
type Draft = Omit<OpSpec, 'category' | 'section'> & { readonly drawer: Drawer };

interface FieldSpec {
  readonly name: string;
  /** Ids; the first is the default. A free field takes any short text (a slider's or a button's name). */
  readonly options: readonly string[];
  readonly free?: boolean;
}

/** The eight toolbox categories (owner, 2026-10-19: six had two too full). */
export type Category = 'run' | 'yard' | 'trade' | 'tax' | 'who' | 'numbers' | 'random' | 'show';
/** A heading within a category: the toolbox shows its blocks together under it, and colours them alike. */
export type Section =
  | 'flow'
  | 'inputs'
  | 'yard'
  | 'alloc'
  | 'traits'
  | 'trade'
  | 'pair'
  | 'coin'
  | 'stake'
  | 'taxes'
  | 'take'
  | 'give'
  | 'growth'
  | 'who'
  | 'values'
  | 'operators'
  | 'stats'
  | 'random'
  | 'dist'
  | 'picture'
  | 'camera'
  | 'moves'
  | 'outputs';

/** Each category's sections, in toolbox order. */
export const SECTIONS: Readonly<Record<Category, readonly Section[]>> = {
  run: ['flow', 'inputs'],
  yard: ['yard', 'alloc', 'traits'],
  trade: ['trade', 'pair', 'coin', 'stake'],
  tax: ['taxes', 'take', 'give', 'growth'],
  who: ['who'],
  numbers: ['values', 'operators', 'stats'],
  random: ['random', 'dist'],
  show: ['picture', 'camera', 'moves', 'outputs'],
};

export interface OpSpec {
  readonly id: string;
  readonly kind: Kind;
  readonly category: Category;
  readonly section: Section;
  readonly output?: ValueType;
  readonly inputs: readonly InputSpec[];
  readonly fields: readonly FieldSpec[];
  /** Hats and C blocks hold statements. */
  readonly body: boolean;
  /** An option belongs to its knob: it is valid only inside that knob's slot. */
  readonly knob?: Knob;
  /** A C-block made of fixed steps: its body holds exactly these, in this order, and observers anywhere. */
  readonly steps?: readonly string[];
  /** A step of such a block: valid only there, never in the toolbox on its own. */
  readonly step?: boolean;
}

export const WHO: readonly Who[] = ['me', 'poorer', 'richer', 'winner', 'loser'];
export const PROPS = ['wealth', 'inplay', 'rank', 'talent', 'thrift', 'gain'] as const;
export type Prop = (typeof PROPS)[number];
const GLOBALS = ['n', 'round', 'total', 'median', 'min', 'max', 'pot', 'gini', 'neff', 'top1', 'bottom50'] as const;
export type Global = (typeof GLOBALS)[number];
/** What the `global` value block reads; the rest is the stats block's (`stat.of`). */
const PLAIN_GLOBALS = ['n', 'round', 'total', 'pot'] as const;

// ——— builders ———

const number = (name: string, value: number, context: ContextName | 'inherit' = 'inherit'): InputSpec => ({
  name,
  accepts: ['Number'],
  context,
  shadow: num(value),
});
const bool = (name: string, context: ContextName | 'inherit' = 'inherit'): InputSpec => ({ name, accepts: ['Bool'], context });
const field = (name: string, ...options: string[]): FieldSpec => ({ name, options });
/** A name the reader types: a slider's or a button's (its default given). */
const named = (fallback: string): FieldSpec => ({ name: 'name', options: [fallback], free: true });

function statement(id: string, drawer: Drawer, inputs: InputSpec[] = [], fields: FieldSpec[] = []): Draft {
  return { id, kind: 'stack', drawer, inputs, fields, body: false };
}
function wrapper(id: string, inputs: InputSpec[] = []): Draft {
  return { id, kind: 'c', drawer: 'control', inputs, fields: [], body: true };
}
function step(id: string, inputs: InputSpec[]): Draft {
  return { id, kind: 'stack', drawer: 'economy', inputs, fields: [], body: false, step: true };
}
function hat(id: string, drawer: Drawer, inputs: InputSpec[] = []): Draft {
  return { id, kind: 'hat', drawer, inputs, fields: [], body: true };
}
function option(id: string, knob: Knob, output: ValueType, inputs: InputSpec[] = [], fields: FieldSpec[] = []): Draft {
  return { id, kind: 'reporter', drawer: knob, output, inputs, fields, body: false, knob };
}
/** A share, written 0.1 and shown as 10 % (the `pct` value block). */
const percent = (name: string, value: number, context: ContextName | 'inherit' = 'inherit'): InputSpec => ({
  name,
  accepts: ['Number'],
  context,
  shadow: { op: 'pct', v: value },
});
/** A distribution slot; its parameters read what the block reads. */
const distribution = (name: string, shadow: Node, context: ContextName | 'inherit' = 'inherit'): InputSpec => ({ name, accepts: ['Distribution'], context, shadow });
/** A group slot, everyone by default; its own arguments read globals (a condition reads each square in turn). */
const group = (name: string): InputSpec => ({ name, accepts: ['Group'], context: 'inherit', shadow: { op: 'group.all' } });
function reporter(id: string, drawer: Drawer, output: ValueType, inputs: InputSpec[] = [], fields: FieldSpec[] = []): Draft {
  return { id, kind: 'reporter', drawer, output, inputs, fields, body: false };
}

// ——— the table ———

const TABLE: Draft[] = [
  // control
  hat('ctl.start', 'control'),
  wrapper('ctl.forever'),
  wrapper('ctl.repeat', [number('n', 10, 'global')]),
  wrapper('ctl.until', [bool('c', 'global')]),
  wrapper('ctl.every', [number('k', 10, 'global')]),
  statement('ctl.pause', 'control'),

  // setup
  // where they live (owner, 2026-10-19): anywhere, anyone can meet anyone; on a square lattice, each has a cell,
  // and neighbours (pair.near) and moving (move) need it
  statement('setup.yard', 'setup', [number('n', 100, 'setup')], [field('space', 'free', 'lattice')]),
  // everyone's first wealth: a distribution (below 0 counts as 0) or an allocation, rescaled to mean 1; without
  // it everyone starts with the same
  statement('setup.start', 'setup', [{ name: 'with', accepts: ['Distribution', 'Allocation'], context: 'setup', shadow: { op: 'dist.same', args: { v: num(1) } } }]),
  // each square's talent, drawn (and kept in [0, 1]); its thrift λ, drawn (kept in [0, 1))
  statement('traits.talent', 'setup', [distribution('d', { op: 'dist.normal', args: { m: num(0.6), s: num(0.1) } }, 'setup')]),
  statement('traits.thrift', 'setup', [distribution('d', { op: 'dist.same', args: { v: num(0) } }, 'setup')]),
  statement('debt', 'setup', [number('d', 0, 'setup')]),
  // a group with a name, for `group.named` below it (setup: one per name)
  statement('group.define', 'setup', [{ name: 'group', accepts: ['Group'], context: 'global', shadow: { op: 'group.richest', args: { q: { op: 'pct', v: 0.1 } } } }], [named('rich')]),

  // economy
  // a trade: pair up, flip, pay (locked steps, in order); observers may sit between them
  { id: 'trade', kind: 'c', drawer: 'economy', inputs: [], fields: [], body: true, steps: ['trade.pair', 'trade.flip', 'trade.pay'] },
  step('trade.pair', [{ name: 'pair', accepts: ['Pairing'], context: 'pair', shadow: { op: 'pair.match', args: { within: { op: 'group.all' } } } }]),
  step('trade.flip', [{ name: 'coin', accepts: ['Number'], context: 'coin', shadow: { op: 'coin.fair' } }]),
  step('trade.pay', [
    { name: 'stake', accepts: ['Number', 'Split'], context: 'stake', shadow: { op: 'stake.share', f: { of: 'poorer' }, args: { beta: { op: 'pct', v: 0.1 } } } },
  ]),
  statement('grow', 'economy', [number('mu', 0, 'agent'), number('sigma', 0.05, 'agent')]),
  // a tax: take into the pot, give it back (or keep it: a burn)
  { id: 'tax', kind: 'c', drawer: 'economy', inputs: [], fields: [], body: true, steps: ['tax.take', 'tax.give'] },
  step('tax.take', [{ name: 'tau', accepts: ['Number'], context: 'tax', shadow: { op: 'take.wealth', args: { rate: { op: 'pct', v: 0.01 }, from: { op: 'group.all' } } } }]),
  step('tax.give', [{ name: 'r', accepts: ['Number'], context: 'give', shadow: { op: 'give.to', f: { how: 'equally' }, args: { to: { op: 'group.all' } } } }]),
  statement('move', 'economy', [number('v', 0.5, 'agent')]),

  // camera: never changes the simulation; the engine skips these. Their words are the stage's pose words.
  // three separate things (owner, 2026-10-19), each the stage's recipe words (stage/core/recipe.ts): where the
  // squares stand (and in what order), what shape they are, and what their size measures
  statement('show.arrange', 'camera', [], [field('layout', 'places', 'still', 'row', 'stack', 'pack'), field('sort', 'id', 'asc', 'desc', 'shuffle')]),
  statement('show.shape', 'camera', [], [field('shape', 'square', 'bar', 'col', 'tri', 'hex')]),
  statement('show.size', 'camera', [], [field('scale', 'wealth', 'side', 'log', 'logarea', 'equal')]),
  // the view holds still this long (play waits), as for a photo
  statement('show.hold', 'camera', [number('seconds', 2, 'global')]),
  // the camera frames a group (everyone: the whole yard)
  statement('show.zoom', 'camera', [{ name: 'who', accepts: ['Group'], context: 'global', shadow: { op: 'group.richest', args: { q: { op: 'pct', v: 0.01 } } } }]),
  // how the yard shows a trade (after pair up) and a tax: partners meeting face to face, in place, or at once
  statement('show.trades', 'camera', [], [field('as', 'place', 'meet', 'instant')]),
  statement('show.tax', 'camera', [], [field('as', 'pot', 'instant')]),
  // what the picture shows: squares coloured by a property (talent is never drawn otherwise), some ringed
  statement('show.colour', 'camera', [], [field('by', 'none', 'wealth', 'rank', 'talent', 'thrift', 'gain')]),
  statement('show.outline', 'camera', [{ name: 'who', accepts: ['Group'], context: 'global', shadow: { op: 'group.richest', args: { q: { op: 'pct', v: 0.1 } } } }]),
  hat('show.when', 'camera', [bool('c', 'global')]),

  // panel: what the reader sees and touches beside the yard. A slider's value and a button's presses come in
  // through the run's input log (engine.ts), so changing them never restarts the run and replay stays exact.
  reporter('panel.slider', 'panel', 'Number', [number('min', 0, 'setup'), number('max', 1, 'setup'), number('start', 0.5, 'setup')], [named('slider')]),
  { id: 'panel.button', kind: 'hat', drawer: 'panel', inputs: [], fields: [named('go')], body: true },
  statement('panel.wait', 'panel', [], [named('go')]),
  // a number on the panel, live, from any expression (usually a stats block); a value printed each time it runs
  statement('panel.number', 'panel', [{ name: 'value', accepts: ['Number'], context: 'global', shadow: { op: 'stat.of', f: { stat: 'gini', prop: 'wealth' }, args: { over: { op: 'group.all' } } } }], [named('Gini')]),
  statement('panel.print', 'panel', [{ name: 'value', accepts: ['Number'], context: 'global', shadow: { op: 'val.global', f: { name: 'round' } } }], [named('round')]),
  statement('panel.plot', 'panel', [], [field('kind', 'gini', 'lorenz', 'ccdf', 'histogram')]),

  // options: pairing (their arguments read globals only)
  option('pair.match', 'pair', 'Pairing', [group('within')]),
  option('pair.draw', 'pair', 'Pairing'),
  option('pair.near', 'pair', 'Pairing', [number('r', 1, 'global')]),
  option('pair.similar', 'pair', 'Pairing', [number('k', 5, 'global')]),
  // flip: p = P(the poorer wins) = ½ (1 + tanh(s_poorer − s_richer + artanh 2b)), s each square's strength (reads
  // `me`), b the underdog's bonus. One card: fair is 0 and 0, a tilt is a bonus alone, wealth in proportion is
  // strength ½ log wealth (exactly w_p / (w_p + w_r)), talent is a strength in talent.
  // a fair coin, plainly (owner, 2026-10-21): each partner wins half the flips, as strength 0 and bonus 0 do
  option('coin.fair', 'coin', 'Number'),
  option('coin.strength', 'coin', 'Number', [number('s', 0, 'agent'), percent('b', 0)]),
  // stake: who sizes it (the loser always pays)
  option('stake.share', 'stake', 'Number', [percent('beta', 0.1)], [field('of', 'poorer', 'loser')]),
  option('stake.fixed', 'stake', 'Number', [number('a', 0.1)]),
  option('stake.split', 'stake', 'Split'),
  // tax: τ for each agent, what is taxed × who pays
  // (owner, 2026-10-19: no modes) four cards, each with its own inputs
  option('take.wealth', 'tax', 'Number', [percent('rate', 0.01), group('from')]),
  option('take.above', 'tax', 'Number', [percent('rate', 0.01), number('x', 2), group('from')]),
  option('take.gains', 'tax', 'Number', [percent('rate', 0.01), group('from')]),
  option('take.flat', 'tax', 'Number', [number('a', 0.01), group('from')]),
  // give: a weight for each agent, how × to whom
  option('give.to', 'give', 'Number', [group('to')], [field('how', 'equally', 'wealth')]),
  /** nobody gets it: the pot keeps it (a burn) */
  option('give.keep', 'give', 'Number'),

  // groups: who, among the squares (spec update, 2026-10-19). Ranks are the round's (the step's snapshot).
  reporter('group.all', 'group', 'Group'),
  reporter('group.richest', 'group', 'Group', [percent('q', 0.1, 'global')]),
  reporter('group.poorest', 'group', 'Group', [percent('q', 0.1, 'global')]),
  reporter('group.random', 'group', 'Group', [percent('q', 0.1, 'global')]),
  reporter('group.one', 'group', 'Group'),
  reporter('group.where', 'group', 'Group', [bool('c', 'agent')]),
  reporter('group.combine', 'group', 'Group', [group('a'), group('b')], [field('op', 'and', 'or', 'butnot')]),
  reporter('group.named', 'group', 'Group', [], [named('rich')]),

  // distributions (spec update, 2026-10-19): for setup, and for `sample` anywhere
  reporter('dist.same', 'dist', 'Distribution', [number('v', 1)]),
  reporter('dist.uniform', 'dist', 'Distribution', [number('lo', 0), number('hi', 1)]),
  reporter('dist.normal', 'dist', 'Distribution', [number('m', 0), number('s', 1)]),
  reporter('dist.exponential', 'dist', 'Distribution', [number('mean', 1)]),
  /** median 1: e^(σz) */
  reporter('dist.lognormal', 'dist', 'Distribution', [number('sigma', 1)]),
  /** x_min 1: (1 − u)^(−1/α) */
  reporter('dist.pareto', 'dist', 'Distribution', [number('alpha', 1.5)]),
  reporter('dist.clip', 'dist', 'Distribution', [distribution('d', { op: 'dist.normal', args: { m: num(0), s: num(1) } }), number('lo', 0), number('hi', 1)]),

  // allocations: not samples, everyone's share set at once (in a shuffled order); a start only
  reporter('alloc.classes', 'alloc', 'Allocation', [percent('q', 0.1, 'setup'), percent('s', 0.5, 'setup')]),
  reporter('alloc.oligarch', 'alloc', 'Allocation', [percent('s', 0.5, 'setup')]),
  reporter('alloc.country', 'alloc', 'Allocation', [], [field('country', 'us')]),

  // values
  reporter('num', 'value', 'Number'),
  reporter('pct', 'value', 'Number'),
  reporter('val.prop', 'value', 'Number', [], [field('prop', ...PROPS), field('who', ...WHO)]),
  reporter('val.global', 'value', 'Number', [], [field('name', ...PLAIN_GLOBALS)]),
  // [stat] of (property) over (group): the group's ranks and values as the step began
  reporter('stat.of', 'value', 'Number', [group('over')], [field('stat', ...STATS), field('prop', ...PROPS)]),

  // operators
  reporter('op.arith', 'operator', 'Number', [number('a', 1), number('b', 1)], [field('op', 'add', 'sub', 'mul', 'div')]),
  // functions of one number and of two (no modes: each card has its own inputs)
  reporter('op.fn', 'operator', 'Number', [number('a', 1)], [field('fn', 'abs', 'log', 'exp', 'sqrt')]),
  reporter('op.fn2', 'operator', 'Number', [number('a', 1), number('b', 1)], [field('fn', 'min', 'max', 'power')]),
  reporter('op.clamp', 'operator', 'Number', [number('x', 0), number('lo', 0), number('hi', 1)]),
  /** a draw: for each square (or pair) its own, fresh each round */
  reporter('op.sample', 'operator', 'Number', [distribution('d', { op: 'dist.uniform', args: { lo: num(0), hi: num(1) } })]),
  reporter('op.if', 'operator', 'Number', [bool('c'), number('a', 1), number('b', 0)]),
  reporter('op.cmp', 'operator', 'Bool', [number('a', 0), number('b', 0)], [field('op', 'lt', 'le', 'eq', 'ge', 'gt')]),
  reporter('op.logic', 'operator', 'Bool', [bool('a'), bool('b')], [field('op', 'and', 'or')]),
  reporter('op.not', 'operator', 'Bool', [bool('a')]),
];

/** A drafted op's category and section. */
function place({ drawer, ...spec }: Draft): OpSpec {
  const id = spec.id;
  const at = (category: Category, section: Section): OpSpec => ({ ...spec, category, section });
  switch (drawer) {
    case 'control':
      return at('run', 'flow');
    case 'panel':
      return ['panel.slider', 'panel.button', 'panel.wait'].includes(id) ? at('run', 'inputs') : at('show', 'outputs');
    case 'alloc':
      return at('yard', 'alloc');
    case 'setup':
      return at('yard', id.startsWith('traits.') ? 'traits' : 'yard');
    case 'economy':
      return id.startsWith('trade') ? at('trade', 'trade') : at('tax', id.startsWith('tax') ? 'taxes' : 'growth');
    case 'pair':
    case 'coin':
    case 'stake':
      return at('trade', drawer);
    case 'give':
      return at('tax', 'give');
    case 'tax':
      return at('tax', 'take');
    case 'group':
      return at('who', 'who');
    case 'dist':
      return at('random', 'dist');
    case 'value':
      return at('numbers', id === 'stat.of' ? 'stats' : 'values');
    case 'operator':
      return id === 'op.sample' ? at('random', 'random') : at('numbers', 'operators');
    default:
      // camera
      return at('show', ['show.zoom', 'show.hold', 'show.when'].includes(id) ? 'camera' : ['show.trades', 'show.tax'].includes(id) ? 'moves' : 'picture');
  }
}

/** Every op by id. */
export const OPS: ReadonlyMap<string, OpSpec> = new Map(TABLE.map((draft) => [draft.id, place(draft)]));

/** Ops in catalogue order (the toolbox's order within a section). */
export const ORDER: readonly OpSpec[] = [...OPS.values()];

/** Literal value blocks: they carry `v` (a `pct` is a share, written 0.1 and shown as 10 %). */
export const VALUES: ReadonlySet<string> = new Set(['num', 'pct']);

/** Loops: a pass of the outermost one is a round. */
export const LOOPS: ReadonlySet<string> = new Set(['ctl.forever', 'ctl.repeat', 'ctl.until']);
/** Setup statements: under `when started`, before the first loop, each at most once. */
export const SETUP: ReadonlySet<string> = new Set(['setup.yard', 'setup.start', 'traits.talent', 'traits.thrift', 'debt', 'group.define']);

/** The inputs a node of this op has. */
export function inputsOf(spec: OpSpec, _f?: Readonly<Record<string, string>>): readonly InputSpec[] {
  // no input comes and goes with a field (owner, 2026-10-19: no modes); kept as the one place inputs are read
  return spec.inputs;
}

/** A node of this op with every field at its default and every input at its shadow, written out. */
export function defaultNode(id: string, f?: Readonly<Record<string, string>>): Node {
  const spec = OPS.get(id);
  if (!spec) throw new RangeError(`unknown op ${id}`);
  const node: { op: string; args?: Record<string, Node>; f?: Record<string, string>; body?: Node[]; v?: number } = { op: id };
  if (VALUES.has(id)) node.v = 0;
  if (spec.fields.length) {
    node.f = {};
    for (const fs of spec.fields) node.f[fs.name] = f?.[fs.name] ?? fs.options[0];
  }
  const inputs = inputsOf(spec, node.f).filter((input) => input.shadow);
  if (inputs.length) {
    node.args = {};
    for (const input of inputs) node.args[input.name] = input.shadow!;
  }
  if (spec.body) node.body = (spec.steps ?? []).map((s) => defaultNode(s));
  return node;
}

/** Observers read and never write: camera blocks and the panel's outputs. They may sit anywhere among steps. */
export function isObserver(op: string): boolean {
  const spec = OPS.get(op);
  return !!spec && spec.kind === 'stack' && spec.category === 'show';
}
