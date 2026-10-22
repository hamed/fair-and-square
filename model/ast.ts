/**
 * The program AST: the contract between editors and the engine (spec, Program AST). A program is a list of
 * hat-rooted scripts; every node is {op, args?, f?, body?, v?}:
 *
 *   op    the block's type id, from the catalogue (never a label)
 *   args  value inputs by name, each a node; every input is written out, never left to a default
 *   f     dropdown fields, as stable ids
 *   body  statements, for C blocks and hats
 *   v     the value of a `num` node: an f64 in units of mean wealth W̄
 */

export interface Node {
  readonly op: string;
  readonly args?: Readonly<Record<string, Node>>;
  readonly f?: Readonly<Record<string, string>>;
  readonly body?: readonly Node[];
  readonly v?: number;
}

export interface Program {
  readonly ast: 1;
  readonly scripts: readonly Node[];
}

/** The vocabulary's version: a program says which one it speaks. */
export const AST_VERSION = 1;

/**
 * Where a node is: its script's index, then `body/<i>` or `args/<name>` steps, joined by '/'. Issues and warnings
 * point at paths; a random block's stream is keyed by its path.
 */
export type Path = string;

export const argPath = (path: Path, name: string): Path => `${path}/args/${name}`;
export const bodyPath = (path: Path, index: number): Path => `${path}/body/${index}`;

/** A number literal. */
export const num = (v: number): Node => ({ op: 'num', v });

/** Visit every node, depth first, with its path. */
export function walk(program: Program, visit: (node: Node, path: Path) => void): void {
  const go = (node: Node, path: Path): void => {
    visit(node, path);
    if (node.args) for (const [name, child] of Object.entries(node.args)) go(child, argPath(path, name));
    if (node.body) node.body.forEach((child, i) => go(child, bodyPath(path, i)));
  };
  program.scripts.forEach((script, i) => go(script, String(i)));
}

/**
 * Read a program from JSON, checking only the node shape (the catalogue's rules are validate.ts's job).
 * Throws a RangeError naming the first malformed place.
 */
export function readProgram(json: unknown): Program {
  if (!isObject(json)) throw new RangeError('a program is an object {"ast": 1, "scripts": [...]}');
  if (json.ast !== AST_VERSION) throw new RangeError(`unknown AST version ${String(json.ast)} (this engine reads ${AST_VERSION})`);
  if (!Array.isArray(json.scripts)) throw new RangeError('"scripts" must be a list');
  return { ast: AST_VERSION, scripts: json.scripts.map((s, i) => readNode(s, String(i))) };
}

function readNode(json: unknown, path: Path): Node {
  if (!isObject(json) || typeof json.op !== 'string') throw new RangeError(`${path}: a node needs an "op"`);
  for (const key of Object.keys(json)) {
    if (!['op', 'args', 'f', 'body', 'v'].includes(key)) throw new RangeError(`${path}: unknown key "${key}"`);
  }
  const node: { op: string; args?: Record<string, Node>; f?: Record<string, string>; body?: Node[]; v?: number } = { op: json.op };
  if (json.args !== undefined) {
    if (!isObject(json.args)) throw new RangeError(`${path}: "args" must be an object`);
    node.args = {};
    for (const [name, child] of Object.entries(json.args)) node.args[name] = readNode(child, argPath(path, name));
  }
  if (json.f !== undefined) {
    if (!isObject(json.f)) throw new RangeError(`${path}: "f" must be an object`);
    node.f = {};
    for (const [name, value] of Object.entries(json.f)) {
      if (typeof value !== 'string') throw new RangeError(`${path}: field "${name}" must be an id string`);
      node.f[name] = value;
    }
  }
  if (json.body !== undefined) {
    if (!Array.isArray(json.body)) throw new RangeError(`${path}: "body" must be a list`);
    node.body = json.body.map((child, i) => readNode(child, bodyPath(path, i)));
  }
  if (json.v !== undefined) {
    if (typeof json.v !== 'number' || !Number.isFinite(json.v)) throw new RangeError(`${path}: "v" must be a finite number`);
    node.v = json.v;
  }
  return node;
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** A program as text with every object's keys in sorted order: equal texts, equal programs, however written. */
export function canonical(program: Program): string {
  return JSON.stringify(program, (_key, value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value as object).sort().map((k) => [k, (value as Record<string, unknown>)[k]]))
      : value,
  );
}
