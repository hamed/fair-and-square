/**
 * Is a program well formed? Every rule the spec's editor shows as a greyed block with a tooltip is checked here,
 * on the AST, so any editor (or a pasted program) gets the same answer. A program with issues does not run.
 *
 * Issues carry a code and parameters, never English: the view words them (blocks/words/blocks.en.ts).
 */
import { argPath, bodyPath, walk, type Node, type Path, type Program } from './ast.ts';
import { CONTEXT, LOOPS, OPS, SETUP, VALUES, WHO, isObserver, inputsOf, type Context, type OpSpec, type Who } from './catalogue.ts';

export type IssueCode =
  | 'unknown-op'
  | 'not-a-hat'
  | 'no-start'
  | 'one-start'
  | 'no-yard'
  | 'yard-first'
  | 'setup-place'
  | 'setup-twice'
  | 'every-outside'
  | 'step-order'
  | 'step-place'
  | 'observer-only'
  | 'button-only'
  | 'literal-only'
  | 'not-statement'
  | 'not-value'
  | 'camera-only'
  | 'unknown-input'
  | 'missing-input'
  | 'bad-type'
  | 'bad-field'
  | 'missing-value'
  | 'unexpected-value'
  | 'unexpected-body'
  | 'who-context'
  | 'no-globals'
  | 'knob-home'
  | 'unknown-group'
  | 'needs-lattice';

export interface Issue {
  /** The node at fault ('' for the program as a whole). */
  readonly path: Path;
  readonly code: IssueCode;
  readonly params?: Readonly<Record<string, string>>;
}

export function validate(program: Program): Issue[] {
  const issues: Issue[] = [];
  const add = (path: Path, code: IssueCode, params?: Record<string, string>) => issues.push({ path, code, params });

  let starts = 0;
  program.scripts.forEach((script, i) => {
    const path = String(i);
    const spec = OPS.get(script.op);
    if (!spec) return add(path, 'unknown-op', { op: script.op });
    if (spec.kind !== 'hat') return add(path, 'not-a-hat', { op: script.op });
    if (script.op === 'ctl.start' && ++starts > 1) add(path, 'one-start');
    checkShape(script, spec, path, CONTEXT.global, add);
    if (script.op === 'ctl.start') checkStart(script, path, add);
    statements(script.body ?? [], path, script.op === 'show.when' ? 'camera' : script.op === 'panel.button' ? 'button' : 'start', add);
  });
  if (starts === 0) add('', 'no-start');
  checkGroups(program, add);
  checkSpace(program, add);
  return issues;
}

/** Neighbours and moving need a lattice: in a yard where squares stand anywhere, nobody is next to anybody. */
function checkSpace(program: Program, add: Add): void {
  const start = program.scripts.find((s) => s.op === 'ctl.start');
  const yard = start?.body?.find((n) => n.op === 'setup.yard');
  if (yard?.f?.space === 'lattice') return;
  walk(program, (node, path) => {
    if (node.op === 'pair.near' || node.op === 'move') add(path, 'needs-lattice', { op: node.op });
  });
}

/** A named group is defined above where it is used (in setup, a definition sees only those before it). */
function checkGroups(program: Program, add: Add): void {
  const start = program.scripts.findIndex((s) => s.op === 'ctl.start');
  const defined = new Set<string>();
  const uses = (node: Node, path: Path, known: ReadonlySet<string>) => {
    if (node.op === 'group.named' && node.f?.name !== undefined && !known.has(node.f.name)) add(path, 'unknown-group', { name: node.f.name });
    for (const [name, child] of Object.entries(node.args ?? {})) uses(child, argPath(path, name), known);
    (node.body ?? []).forEach((child, i) => uses(child, bodyPath(path, i), known));
  };
  // the setup's definitions, in order, each seeing those above it
  const setup = start >= 0 ? (program.scripts[start].body ?? []) : [];
  setup.forEach((node, i) => {
    if (node.op !== 'group.define') return;
    uses(node, bodyPath(String(start), i), defined);
    if (node.f?.name !== undefined) defined.add(node.f.name);
  });
  program.scripts.forEach((script, i) => {
    if (i !== start) return uses(script, String(i), defined);
    (script.body ?? []).forEach((node, k) => {
      if (node.op !== 'group.define') uses(node, bodyPath(String(i), k), defined);
    });
  });
}

type Add = (path: Path, code: IssueCode, params?: Record<string, string>) => void;

/** `when started`: the yard first, then setup before the first loop, each setup block once. */
function checkStart(script: Node, path: Path, add: Add): void {
  const body = script.body ?? [];
  if (!body.some((node) => node.op === 'setup.yard')) add(path, 'no-yard');
  else if (body[0].op !== 'setup.yard') add(bodyPath(path, body.findIndex((node) => node.op === 'setup.yard')), 'yard-first');
  // setup blocks right after the yard, before any other statement, so round 0 is "setup done"
  const seen = new Set<string>();
  let other = false;
  body.forEach((node, i) => {
    if (!SETUP.has(node.op)) {
      other = true;
      return;
    }
    // a group is defined once per name; every other setup block once
    const key = node.op === 'group.define' ? `${node.op}:${node.f?.name}` : node.op;
    if (other) add(bodyPath(path, i), 'setup-place');
    else if (seen.has(key)) add(bodyPath(path, i), 'setup-twice');
    seen.add(key);
  });
}

/** A list of statements: each must be a statement; setup only directly under `when started`. */
/**
 * A list of statements: each must be a statement; setup only directly under `when started`. A camera script
 * (`when`) holds camera blocks only; a button's script what can happen in one go: economy, camera and panel
 * outputs (no loops, waits or setup).
 */
function statements(
  body: readonly Node[],
  parent: Path,
  script: 'start' | 'camera' | 'button',
  add: Add,
  nested = false,
  inLoop = false,
  steps: readonly string[] | null = null,
): void {
  const camera = script === 'camera';
  if (steps) {
    // a step block's body: its steps, all of them, once each, in order; anything else an observer
    const seen = body.filter((n) => steps.includes(n.op)).map((n) => n.op);
    if (seen.join() !== steps.join()) add(parent, 'step-order', { steps: steps.join(', ') });
  }
  body.forEach((node, i) => {
    const path = bodyPath(parent, i);
    const spec = OPS.get(node.op);
    if (!spec) return add(path, 'unknown-op', { op: node.op });
    if (spec.kind === 'reporter' || spec.kind === 'hat') return add(path, 'not-statement', { op: node.op });
    if (spec.step && !steps?.includes(node.op)) return add(path, 'step-place', { op: node.op });
    if (steps && !spec.step && !isObserver(node.op)) add(path, 'observer-only', { op: node.op });
    if (camera && spec.category !== 'show') return add(path, 'camera-only', { op: node.op });
    if (script === 'button' && !(spec.category === 'trade' || spec.category === 'tax' || spec.category === 'show')) add(path, 'button-only', { op: node.op });
    if (nested && SETUP.has(node.op)) add(path, 'setup-place');
    // every (k) counts rounds: outside a loop it would test round 0 once and never again
    if (node.op === 'ctl.every' && !inLoop && !camera) add(path, 'every-outside');
    checkShape(node, spec, path, CONTEXT.global, add);
    if (spec.body) statements(node.body ?? [], path, script, add, true, inLoop || LOOPS.has(node.op), spec.steps ?? null);
  });
}

/** Fields, value, inputs (types, contexts, knob homes), recursively through value inputs. */
function checkShape(node: Node, spec: OpSpec, path: Path, context: Context, add: Add): void {
  // fields
  for (const fs of spec.fields) {
    const value = node.f?.[fs.name];
    const ok = value !== undefined && (fs.free ? value.trim().length > 0 && value.length <= 40 : fs.options.includes(value));
    if (!ok) add(path, 'bad-field', { field: fs.name, value: value ?? '' });
  }
  for (const name of Object.keys(node.f ?? {})) {
    if (!spec.fields.some((fs) => fs.name === name)) add(path, 'bad-field', { field: name, value: node.f![name] });
  }
  // value and body
  const literal = VALUES.has(node.op);
  if (literal ? node.v === undefined : node.v !== undefined) add(path, literal ? 'missing-value' : 'unexpected-value');
  if (!spec.body && node.body !== undefined) add(path, 'unexpected-body');
  // who and globals in context
  const who = node.f?.who as Who | undefined;
  if (node.op === 'val.prop' && who && WHO.includes(who) && !context.who.includes(who)) {
    add(path, 'who-context', { who });
  }
  if ((node.op === 'val.global' || node.op === 'stat.of') && !context.globals) add(path, 'no-globals');
  if (spec.knob && context.knob !== spec.knob) add(path, 'knob-home', { knob: spec.knob });
  // a slider's ends and start are drawn on the panel: plain numbers
  if (node.op === 'panel.slider') for (const [name, child] of Object.entries(node.args ?? {})) if (!VALUES.has(child.op)) add(argPath(path, name), 'literal-only');
  // inputs
  const inputs = inputsOf(spec, node.f);
  for (const name of Object.keys(node.args ?? {})) {
    if (!inputs.some((input) => input.name === name)) add(argPath(path, name), 'unknown-input', { input: name });
  }
  for (const input of inputs) {
    const child = node.args?.[input.name];
    const at = argPath(path, input.name);
    if (!child) {
      add(path, 'missing-input', { input: input.name });
      continue;
    }
    const childSpec = OPS.get(child.op);
    if (!childSpec) {
      add(at, 'unknown-op', { op: child.op });
      continue;
    }
    if (childSpec.kind !== 'reporter') {
      add(at, 'not-value', { op: child.op });
      continue;
    }
    if (!input.accepts.includes(childSpec.output!)) add(at, 'bad-type', { want: input.accepts.join('|'), got: childSpec.output! });
    const inner = input.context === 'inherit' ? context : CONTEXT[input.context];
    checkShape(child, childSpec, at, inner, add);
  }
}
