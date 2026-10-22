/**
 * The yard's program, in the Rules drawer's own blocks (Blockly, the catalogue's blocks), stripped to its core: the
 * panel's blocks are left out (a slider shows as the number it holds now; the watched numbers and plots are not
 * there), so what is left is the algorithm. Loaded when first shown; no toolbox, nothing to drag or delete; every
 * field can change. A number that was a slider moves that slider (the run goes on); any other change is a new
 * program, restarted at round 0 as the Rules drawer does it, the panel's blocks put back where they were.
 */
import { canonical, type Node, type Program } from '../../model/ast.ts';
import { validate } from '../../model/validate.ts';
import type { Session } from '../console/session.ts';

export interface ProgramView {
  /** The run's slider values, shown in their numbers (unless one is being typed in). */
  refresh(): void;
  dispose(): void;
}

/** The blocks' scale: as the Rules drawer shows them, never under SMALLEST; and the space round them, px. */
const READABLE = 0.9;
const SMALLEST = 0.65;
const MARGIN = 10;

/** Statements of the panel that only show something: left out of the core. */
const SHOWS = new Set(['panel.number', 'panel.plot', 'panel.print']);

interface Stripped {
  readonly program: Program;
  /** The sliders taken out, by where they were. */
  readonly sliders: ReadonlyMap<string, Node>;
  /** The statements taken out, by the body they were in and where in it. */
  readonly removed: readonly { readonly parent: string; readonly index: number; readonly node: Node }[];
}

/** The program without its panel: each slider the number it holds now, no watched numbers or plots. */
export function strip(program: Program, value: (name: string) => number | undefined): Stripped {
  const sliders = new Map<string, Node>();
  const removed: { parent: string; index: number; node: Node }[] = [];
  const visit = (n: Node, at: string): Node => {
    if (n.op === 'panel.slider') {
      sliders.set(at, n);
      const start = n.args?.start;
      return { op: start?.op ?? 'num', v: value(n.f?.name ?? '') ?? start?.v ?? 0 };
    }
    const args = n.args ? Object.fromEntries(Object.entries(n.args).map(([k, v]) => [k, visit(v, `${at}/args/${k}`)])) : undefined;
    let body: Node[] | undefined;
    if (n.body) {
      // paths are the stripped program's (what the blocks show); a removed statement keeps its own index
      body = [];
      n.body.forEach((b, i) => {
        if (SHOWS.has(b.op)) removed.push({ parent: at, index: i, node: b });
        else body!.push(visit(b, `${at}/body/${body!.length}`));
      });
    }
    return { ...n, ...(args ? { args } : {}), ...(body ? { body } : {}) };
  };
  return { program: { ...program, scripts: program.scripts.map((s, k) => visit(s, String(k))) }, sliders, removed };
}

/** The stripped program back with its panel: each slider again (starting at its number), the statements back in place. */
export function unstrip(edited: Program, st: Stripped): Program {
  // paths in the edited program are those of the stripped one: the removed statements shift the body indices
  const visit = (n: Node, at: string): Node => {
    const slider = st.sliders.get(at);
    if (slider && (n.op === 'pct' || n.op === 'num')) return { ...slider, args: { ...slider.args, start: { op: n.op, v: n.v ?? 0 } } };
    const args = n.args ? Object.fromEntries(Object.entries(n.args).map(([k, v]) => [k, visit(v, `${at}/args/${k}`)])) : undefined;
    let body: Node[] | undefined;
    if (n.body) {
      const back = st.removed.filter((r) => r.parent === at).sort((a, b) => a.index - b.index);
      body = [];
      // the removed statements back at their own indices, the edited ones (stripped paths) between them
      n.body.forEach((b, j) => {
        while (back.length && back[0].index === body!.length) body!.push(back.shift()!.node);
        body!.push(visit(b, `${at}/body/${j}`));
      });
      for (const r of back) body.push(r.node);
    }
    return { ...n, ...(args ? { args } : {}), ...(body ? { body } : {}) };
  };
  return { ...edited, scripts: edited.scripts.map((s, k) => visit(s, String(k))) };
}

/** A program with every slider's start at 0: two programs the same but for where their sliders start compare equal. */
function unstarted(program: Program): string {
  const visit = (n: Node): Node => {
    const args = n.args ? Object.fromEntries(Object.entries(n.args).map(([k, v]) => [k, visit(v)])) : undefined;
    const body = n.body?.map(visit);
    const out = { ...n, ...(args ? { args } : {}), ...(body ? { body } : {}) };
    return n.op === 'panel.slider' && out.args?.start ? { ...out, args: { ...out.args, start: { ...out.args.start, v: 0 } } } : out;
  };
  return canonical({ ...program, scripts: program.scripts.map(visit) });
}

/** The program's core in `host`, as the Rules drawer's blocks. `changed`: after any accepted edit. */
export async function programView(host: HTMLElement, session: () => Session, changed: () => void): Promise<ProgramView> {
  const Blockly = await import('blockly/core');
  const En = await import('blockly/msg/en');
  const { defineBlocks } = await import('../../blocks/define.ts');
  const { toBlockly, fromBlockly } = await import('../../blocks/convert.ts');
  const { theme } = await import('../../blocks/editor.ts');
  Blockly.setLocale(En as unknown as Record<string, string>);
  defineBlocks();
  const workspace = Blockly.inject(host, {
    renderer: 'zelos',
    theme: theme(),
    rtl: document.documentElement.dir === 'rtl',
    trashcan: false,
    sounds: false,
    zoom: { controls: false, wheel: false, startScale: READABLE },
    // the window fits the blocks: nothing to scroll
    move: { scrollbars: false, drag: false, wheel: false },
  });
  const value = (name: string) => session().game.run.sliders.get(name);
  let st = strip(session().game.program, value);
  let shown = '';
  // the window as big as the blocks at a size to read and use (narrower only when the column is): no scrolling
  const fit = () => {
    const box = workspace.getBlocksBoundingBox();
    const wide = Math.max(1, box.right - box.left);
    const tall = Math.max(1, box.bottom - box.top);
    const room = Math.max(120, host.clientWidth - 2 * MARGIN);
    const scale = Math.max(SMALLEST, Math.min(READABLE, room / wide));
    workspace.setScale(scale);
    host.style.blockSize = `${Math.ceil(tall * scale + 2 * MARGIN)}px`;
    Blockly.svgResize(workspace);
    workspace.translate(MARGIN - box.left * scale, MARGIN - box.top * scale);
  };
  const load = () => {
    Blockly.Events.disable();
    try {
      workspace.clear();
      Blockly.serialization.workspaces.load(toBlockly(st.program), workspace);
      workspace.cleanUp();
      for (const b of workspace.getAllBlocks(false)) {
        b.setMovable(false);
        b.setDeletable(false);
      }
      fit();
    } finally {
      Blockly.Events.enable();
    }
    shown = canonical(st.program);
  };
  load();
  let timer = 0;
  workspace.addChangeListener((e) => {
    if (e.isUiEvent || e.type !== Blockly.Events.BLOCK_CHANGE) return;
    clearTimeout(timer);
    timer = window.setTimeout(apply, 150);
  });
  const apply = () => {
    const edited = fromBlockly(Blockly.serialization.workspaces.save(workspace) as never).program;
    if (canonical(edited) === shown) return;
    const s = session();
    const next = unstrip(edited, st);
    if (validate(next).length) return;
    if (unstarted(next) === unstarted(s.game.program)) {
      // only numbers that are sliders: the sliders move, the run goes on
      for (const [at, slider] of st.sliders) {
        const name = slider.f?.name ?? '';
        const v = numberAt(edited, at);
        if (v !== undefined && v !== value(name)) s.slide(name, v);
      }
    } else {
      // anything else: a new program, from round 0 (the Rules drawer's way)
      s.setProgram(next);
    }
    st = strip(s.game.program, value);
    shown = canonical(edited);
    changed();
  };
  // refit when the width changes, never on the height fit() itself sets (that would feed back)
  let width = host.clientWidth;
  const resize = new ResizeObserver(() => {
    if (host.clientWidth === width) return;
    width = host.clientWidth;
    fit();
  });
  resize.observe(host);
  return {
    refresh() {
      // the run's values (a slider moved elsewhere), unless a field is being typed in
      if (Blockly.WidgetDiv.isVisible()) return;
      const next = strip(session().game.program, value);
      if (canonical(next.program) === shown) return;
      st = next;
      load();
    },
    dispose() {
      clearTimeout(timer);
      resize.disconnect();
      workspace.dispose();
    },
  };
}

/** The number at `at` (a path in the stripped program), if it is one. */
function numberAt(program: Program, at: string): number | undefined {
  const steps = at.split('/');
  let node: Node | undefined = program.scripts[Number(steps[0])];
  for (let k = 1; node && k + 1 < steps.length; k += 2) {
    const [kind, key] = [steps[k], steps[k + 1]];
    node = kind === 'args' ? node.args?.[key] : node.body?.[Number(key)];
  }
  return node && (node.op === 'pct' || node.op === 'num') ? node.v : undefined;
}
