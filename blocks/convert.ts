/**
 * AST ↔ Blockly's JSON serialisation, both pure (no Blockly needed). The mapping is the spec's (Blockly ↔ AST):
 * block type → op, value inputs → args by input name, fields → f, the C block's statement input and a hat's next
 * chain → body, the next chain → array order. Positions, comments, collapsed and disabled states are the editor's,
 * never the AST's.
 *
 * Load: every option slot first gets its default shadow, and the AST node goes over it as a regular block, so
 * removing it brings the default back. A number in a number slot is that slot's shadow (an editable field).
 */
import { AST_VERSION, argPath, bodyPath, type Node, type Path, type Program } from '../model/ast.ts';
import { OPS, VALUES, inputsOf } from '../model/catalogue.ts';

/**
 * A `pct` shows its share in percent (0.1 as 10). Both ways round to 12 significant digits, so a value typed or
 * stored comes back as it was (0.07 · 100 is 7.000000000000001 in doubles).
 */
const tidy = (x: number) => Number(x.toPrecision(12));
const shown = (op: string, v: number) => (op === 'pct' ? tidy(v * 100) : v);
const stored = (op: string, v: number) => (op === 'pct' ? tidy(v / 100) : v);

/**
 * A value block's state. When its rounded display would not come back as the same value (1/3 shows as
 * 33.3333333333 %), the exact value rides along in the block's data, and is read back while the field still
 * shows what it showed: looking at a program never changes it (recheck 3, N11). A typed value is what was typed.
 */
function valueState(node: Node, state: BlockState): BlockState {
  const v = node.v ?? 0;
  const display = shown(node.op, v);
  state.fields = { v: display };
  if (stored(node.op, display) !== v) state.data = JSON.stringify(v);
  return state;
}

function valueOf(state: BlockState): number {
  const display = Number(state.fields?.v ?? 0);
  if (typeof state.data === 'string') {
    const exact = Number(JSON.parse(state.data));
    if (Number.isFinite(exact) && shown(state.type, exact) === display) return exact;
  }
  return stored(state.type, display);
}

/** The parts of Blockly's block state this file reads and writes. */
interface BlockState {
  type: string;
  id?: string;
  x?: number;
  y?: number;
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block?: BlockState; shadow?: BlockState }>;
  next?: { block?: BlockState; shadow?: BlockState };
  [other: string]: unknown;
}

export interface WorkspaceState {
  blocks?: { languageVersion: number; blocks: BlockState[] };
  [other: string]: unknown;
}

/** The statement input of C blocks. */
export const BODY = 'body';

/** A node as a regular block, its slots holding their default shadows underneath. */
export function blockOf(node: Node): BlockState {
  const spec = OPS.get(node.op);
  if (!spec) throw new RangeError(`unknown op ${node.op}`);
  const state: BlockState = { type: node.op };
  if (VALUES.has(node.op)) return valueState(node, state);
  if (node.f && Object.keys(node.f).length) state.fields = { ...node.f };
  const inputs: NonNullable<BlockState['inputs']> = {};
  for (const input of inputsOf(spec, node.f)) {
    const child = node.args?.[input.name];
    const shadow = input.shadow ? shadowOf(input.shadow) : undefined;
    if (child && VALUES.has(child.op) && (!input.shadow || VALUES.has(input.shadow.op))) inputs[input.name] = { shadow: shadowOf(child) };
    else if (child) inputs[input.name] = shadow ? { shadow, block: blockOf(child) } : { block: blockOf(child) };
    else if (shadow) inputs[input.name] = { shadow };
  }
  if (spec.kind === 'c' && node.body?.length) inputs[BODY] = { block: chainOf(node.body) };
  if (Object.keys(inputs).length) state.inputs = inputs;
  if (spec.kind === 'hat' && node.body?.length) state.next = { block: chainOf(node.body) };
  // a step block's steps stay in place: they cannot be dragged out or deleted (observers go between them)
  if (spec.step) {
    state.movable = false;
    state.deletable = false;
  }
  return state;
}

/** A node as a shadow: everything inside it a shadow too (shadows cannot hold regular blocks). */
export function shadowOf(node: Node): BlockState {
  const state: BlockState = { type: node.op };
  if (VALUES.has(node.op)) return valueState(node, state);
  if (node.f && Object.keys(node.f).length) state.fields = { ...node.f };
  if (node.args && Object.keys(node.args).length) {
    state.inputs = {};
    for (const [name, child] of Object.entries(node.args)) state.inputs[name] = { shadow: shadowOf(child) };
  }
  return state;
}

function chainOf(nodes: readonly Node[]): BlockState {
  const states = nodes.map(blockOf);
  for (let i = 0; i + 1 < states.length; i++) states[i].next = { block: states[i + 1] };
  return states[0];
}

/** The program as a workspace: one script under another, in order (the editor tidies them after loading). */
export function toBlockly(program: Program): WorkspaceState {
  return { blocks: { languageVersion: 0, blocks: program.scripts.map((script, i) => ({ ...blockOf(script), x: 0, y: i * 600 })) } };
}

export interface FromBlockly {
  readonly program: Program;
  /** Block ids by AST path (blocks saved with ids): where to show an issue or a warning. */
  readonly ids: ReadonlyMap<Path, string>;
}

/**
 * The program a workspace holds: `when started`, then the other hat-rooted scripts top to bottom (then left to
 * right). Loose blocks, not
 * under a hat, are not part of the program.
 */
export function fromBlockly(state: WorkspaceState): FromBlockly {
  const ids = new Map<Path, string>();
  const tops = (state.blocks?.blocks ?? [])
    .filter((b) => OPS.get(b.type)?.kind === 'hat')
    .map((b, i) => ({ b, i }))
    // `when started` first, so a camera script dropped above it never renumbers it (random blocks are keyed by
    // their path, which starts with the script's index); then top to bottom, left to right
    .sort((p, q) => Number(q.b.type === 'ctl.start') - Number(p.b.type === 'ctl.start') || (p.b.y ?? 0) - (q.b.y ?? 0) || (p.b.x ?? 0) - (q.b.x ?? 0) || p.i - q.i)
    .map((p) => p.b);
  const scripts = tops.map((b, i) => nodeOf(b, String(i), ids));
  return { program: { ast: AST_VERSION, scripts }, ids };
}

function nodeOf(state: BlockState, path: Path, ids: Map<Path, string>): Node {
  if (state.id) ids.set(path, state.id);
  const spec = OPS.get(state.type);
  if (!spec) return { op: state.type };
  if (VALUES.has(state.type)) return { op: state.type, v: valueOf(state) };
  const node: { op: string; args?: Record<string, Node>; f?: Record<string, string>; body?: Node[] } = { op: state.type };
  for (const field of spec.fields) {
    const value = state.fields?.[field.name];
    if (value !== undefined) (node.f ??= {})[field.name] = String(value);
  }
  // only the inputs the fields make active: a mode block keeps its hidden inputs (define.ts), the AST does not
  const active = new Set(inputsOf(spec, node.f).map((i) => i.name));
  for (const [name, slot] of Object.entries(state.inputs ?? {})) {
    if (!active.has(name)) continue;
    const child = slot.block ?? slot.shadow;
    if (child) (node.args ??= {})[name] = nodeOf(child, argPath(path, name), ids);
  }
  if (spec.kind === 'c') node.body = bodyOf(state.inputs?.[BODY]?.block, path, ids);
  if (spec.kind === 'hat') node.body = bodyOf(state.next?.block, path, ids);
  return node;
}

function bodyOf(first: BlockState | undefined, parent: Path, ids: Map<Path, string>): Node[] {
  const body: Node[] = [];
  for (let block = first; block; block = block.next?.block) body.push(nodeOf(block, bodyPath(parent, body.length), ids));
  return body;
}
