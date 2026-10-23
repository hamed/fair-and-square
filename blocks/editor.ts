/**
 * The block editor: a Blockly workspace onto the AST. It loads and reads programs (through convert.ts), shows the
 * validator's issues as greyed blocks with a warning, and the engine's warnings as warnings. Nothing here knows
 * an individual op: shapes, inputs and shadows all come from the catalogue.
 */
import * as Blockly from 'blockly/core';
import * as En from 'blockly/msg/en';
import type { Node, Path, Program } from '../model/ast.ts';
import { OPS, ORDER, SECTIONS, defaultNode, type Category, type Section } from '../model/catalogue.ts';
import type { WarningCode } from '../model/compile.ts';
import type { Issue } from '../model/validate.ts';
import { blockOf, fromBlockly, shadowOf, toBlockly, type FromBlockly, type WorkspaceState } from './convert.ts';
import { CATEGORIES, defineBlocks } from './define.ts';
import { CATEGORY_NAMES, SECTION_NAMES } from './words/blocks.en.ts';
import { issueText, warningText } from './words/issues.en.ts';

/** A category's colour in the toolbox. */
const HUES: Readonly<Record<Category, string>> = {
  run: '#c88a2e',
  yard: '#3e8c84',
  trade: '#3d6aa8',
  tax: '#8c7a35',
  who: '#4f7f99',
  numbers: '#4b9566',
  random: '#5f8f8a',
  show: '#7a7262',
};

/** A section's block colour: the options of one slot look alike, and unlike the next slot's. */
const SECTION_HUES: Readonly<Record<Section, string>> = {
  flow: '#c88a2e',
  inputs: '#a0603a',
  yard: '#3e8c84',
  alloc: '#4a87a0',
  traits: '#3e8c84',
  trade: '#3d6aa8',
  pair: '#6b5fae',
  coin: '#b0605a',
  stake: '#9d5a88',
  // tax & growth are not trades (owner, 2026-10-21): their own colour, the toolbox's, the take a lighter one
  taxes: '#8c7a35',
  take: '#b39a45',
  give: '#5a8c4a',
  growth: '#8c7a35',
  who: '#4f7f99',
  values: '#4b9566',
  operators: '#3b7a56',
  stats: '#4b9566',
  random: '#5f8f8a',
  dist: '#5f8f8a',
  picture: '#7a7262',
  camera: '#7a7262',
  moves: '#7a7262',
  outputs: '#a0603a',
};

function mix(hex: string, toward: string, u: number): string {
  const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(toward.slice(i, i + 2), 16));
  return `#${a.map((x, i) => Math.round(x + (b[i] - x) * u).toString(16).padStart(2, '0')).join('')}`;
}

/** The blocks' usual size. */
const START_SCALE = 0.85;

export function theme(): Blockly.Theme {
  const blockStyles: Record<string, Partial<Blockly.Theme.BlockStyle>> = {};
  const categoryStyles: Record<string, Blockly.Theme.CategoryStyle> = {};
  for (const [section, hue] of Object.entries(SECTION_HUES)) {
    const style = { colourPrimary: hue, colourSecondary: mix(hue, '#ffffff', 0.35), colourTertiary: mix(hue, '#000000', 0.25) };
    blockStyles[`fns_${section}`] = style;
    blockStyles[`fns_hat_${section}`] = { ...style, hat: 'cap' };
  }
  for (const category of CATEGORIES) categoryStyles[`fns_${category}`] = { colour: HUES[category] };
  return Blockly.Theme.defineTheme('fns', {
    name: 'fns',
    base: Blockly.Themes.Classic,
    blockStyles: blockStyles as Record<string, Blockly.Theme.BlockStyle>,
    categoryStyles,
    componentStyles: {
      workspaceBackgroundColour: '#fbf8f1',
      toolboxBackgroundColour: '#f4efe4',
      toolboxForegroundColour: '#28251f',
      flyoutBackgroundColour: '#efe8d8',
      flyoutForegroundColour: '#28251f',
      flyoutOpacity: 1,
      scrollbarColour: '#b9b09c',
      insertionMarkerColour: '#28251f',
      insertionMarkerOpacity: 0.25,
    },
    fontStyle: { family: 'Vazirmatn, system-ui, sans-serif', size: 11 },
    startHats: false,
  });
}

/** A few blocks worth offering ready-made, beyond each op's default, by section. */
const EXTRA: Partial<Record<Section, Node[]>> = {
  values: [{ op: 'val.prop', f: { prop: 'wealth', who: 'poorer' } }],
  stats: [{ op: 'stat.of', f: { stat: 'share', prop: 'wealth' }, args: { over: { op: 'group.richest', args: { q: { op: 'pct', v: 0.01 } } } } }],
};

function toolbox(): Blockly.utils.toolbox.ToolboxDefinition {
  return {
    kind: 'categoryToolbox',
    contents: CATEGORIES.map((category) => ({
      kind: 'category',
      name: CATEGORY_NAMES[category],
      categorystyle: `fns_${category}`,
      // each section under its heading; a step block comes with its steps (locked in place), everything else
      // with its slots' shadows
      contents: SECTIONS[category].flatMap((section) => {
        // A plain number sets a fixed stake; keep the old block loadable for existing models and links.
        const nodes = ORDER.filter((spec) => spec.section === section && !spec.step && spec.id !== 'stake.fixed').map((spec) => defaultNode(spec.id));
        nodes.push(...(EXTRA[section] ?? []));
        if (!nodes.length) return [];
        return [
          { kind: 'label', text: SECTION_NAMES[section] },
          ...nodes.map((node) => ({ kind: 'block', ...(OPS.get(node.op)?.steps ? blockOf(node) : shadowOf(node)) })),
        ];
      }),
    })),
  } as Blockly.utils.toolbox.ToolboxDefinition;
}

const INVALID = 'fns-invalid';

export class Editor {
  readonly workspace: Blockly.WorkspaceSvg;
  private listeners: (() => void)[] = [];

  constructor(host: HTMLElement) {
    Blockly.setLocale(En as unknown as Record<string, string>);
    defineBlocks();
    this.workspace = Blockly.inject(host, {
      renderer: 'zelos',
      theme: theme(),
      toolbox: toolbox(),
      rtl: document.documentElement.dir === 'rtl',
      trashcan: true,
      sounds: false,
      zoom: { controls: true, wheel: false, startScale: START_SCALE, maxScale: 2, minScale: 0.3, scaleSpeed: 1.15 },
      move: { scrollbars: true, drag: true, wheel: true },
    });
    this.workspace.addChangeListener((event) => this.changed(event));
    new ResizeObserver(() => Blockly.svgResize(this.workspace)).observe(host);
  }

  /**
   * The program as wide as the drawer shows (never larger than the usual size, never too small to read): the drawer
   * is as wide as the side, so the yard keeps its size in every tab.
   */
  fitWidth(): void {
    const ws = this.workspace;
    const box = ws.getBlocksBoundingBox();
    const wide = box.right - box.left;
    const view = ws.getMetricsManager().getViewMetrics().width;
    if (!(wide > 0) || !(view > 0)) return;
    ws.setScale(Math.min(START_SCALE, Math.max(0.5, (view - 32) / wide)));
    ws.scrollBoundsIntoView(new Blockly.utils.Rect(box.top, box.top + 40, box.left, box.left + 40), 16);
  }

  /** Called (debounced by the caller) after any change that could change the program. */
  onChange(listener: () => void): void {
    this.listeners.push(listener);
  }

  /**
   * Replace the workspace with a program. A rejected import changes nothing, neither the workspace nor its undo
   * history (review MB5 and its recheck R1): the state is converted first (an unknown op throws there), then
   * loaded into a throwaway headless workspace (a block in an illegal place throws there), and only then into
   * this one. Should that still fail, the previous workspace and both undo stacks come back as they were.
   */
  load(program: Program): void {
    const next = toBlockly(program);
    const trial = new Blockly.Workspace();
    Blockly.Events.disable();
    try {
      Blockly.serialization.workspaces.load(next, trial);
    } finally {
      Blockly.Events.enable();
      trial.dispose();
    }
    const previous = Blockly.serialization.workspaces.save(this.workspace);
    const undo = [...this.workspace.getUndoStack()];
    const redo = [...this.workspace.getRedoStack()];
    Blockly.Events.setGroup(true);
    try {
      this.workspace.clear();
      Blockly.serialization.workspaces.load(next, this.workspace, { recordUndo: true });
      this.workspace.cleanUp();
      this.fitWidth();
    } catch (error) {
      Blockly.Events.disable();
      try {
        this.workspace.clear();
        Blockly.serialization.workspaces.load(previous, this.workspace);
      } finally {
        Blockly.Events.enable();
      }
      this.workspace.getUndoStack().splice(0, Infinity, ...undo);
      this.workspace.getRedoStack().splice(0, Infinity, ...redo);
      throw error;
    } finally {
      Blockly.Events.setGroup(false);
    }
    // the first script's top-left corner in view (centring hides it under the toolbox on a phone)
    const first = this.workspace.getTopBlocks(true)[0];
    if (first) {
      const r = first.getBoundingRectangle();
      this.workspace.scrollBoundsIntoView(new Blockly.utils.Rect(r.top - 24, r.top + 40, r.left, r.left + 120), 16);
    }
  }

  read(): FromBlockly {
    return fromBlockly(Blockly.serialization.workspaces.save(this.workspace) as WorkspaceState);
  }

  /**
   * Issues grey their blocks (the program does not run until they are fixed); warnings mark theirs. Program-wide
   * issues (path '') are the page's to show.
   */
  show(issues: readonly Issue[], warnings: ReadonlyMap<Path, WarningCode>, ids: ReadonlyMap<Path, string>): void {
    const texts = new Map<string, string[]>();
    const invalid = new Set<string>();
    const note = (path: Path, text: string, bad: boolean) => {
      // a path whose block is gone (an empty slot) belongs to the nearest block above it
      let at = path;
      while (at && !ids.has(at)) at = at.split('/').slice(0, -2).join('/');
      const id = ids.get(at);
      if (!id) return;
      texts.set(id, [...(texts.get(id) ?? []), text]);
      if (bad) invalid.add(id);
    };
    for (const issue of issues) if (issue.path) note(issue.path, issueText(issue.code, issue.params), true);
    for (const [path, code] of warnings) note(path, warningText(code), false);
    Blockly.Events.disable();
    try {
      for (const block of this.workspace.getAllBlocks(false)) {
        const text = texts.get(block.id);
        block.setWarningText(text ? text.join('\n') : null);
        if (!block.isShadow()) block.setDisabledReason(invalid.has(block.id), INVALID);
      }
    } finally {
      Blockly.Events.enable();
    }
  }

  private changed(event: Blockly.Events.Abstract): void {
    if (event.isUiEvent) return;
    if (event.type === Blockly.Events.BLOCK_MOVE) this.dropDefault(event as Blockly.Events.BlockMove);
    if (event.type === Blockly.Events.BLOCK_CREATE) this.promoteShadows(event.group, (event as Blockly.Events.BlockCreate).ids ?? []);
    if (event.type === Blockly.Events.BLOCK_MOVE) {
      // a block leaving a slot can let the slot's default shadow surface there
      const move = event as Blockly.Events.BlockMove;
      const parent = move.oldParentId ? this.workspace.getBlockById(move.oldParentId) : null;
      if (parent) this.promoteShadows(event.group, parent.getChildren(false).map((b) => b.id));
    }
    for (const listener of this.listeners) listener();
  }

  /**
   * A promoted default stands for its slot's shadow: when it leaves the slot unchanged (bumped out by a reporter
   * dropped on it, or dragged away) it vanishes, as a shadow would. Edited, it stays: that is the reader's work.
   */
  private dropDefault(event: Blockly.Events.BlockMove): void {
    if (!event.oldParentId || !event.oldInputName || event.newParentId || !event.blockId) return;
    const block = this.workspace.getBlockById(event.blockId);
    const slot = this.workspace.getBlockById(event.oldParentId)?.getInput(event.oldInputName)?.connection;
    if (!block || block.isShadow() || !slot) return;
    const shadow = slot.getShadowState();
    const state = Blockly.serialization.blocks.save(block, { addCoordinates: false, saveIds: false });
    if (!shadow || JSON.stringify(strip(shadow)) !== JSON.stringify(strip(state))) return;
    const previous = Blockly.Events.getGroup();
    Blockly.Events.setGroup(event.group || true);
    try {
      block.dispose(false);
    } finally {
      Blockly.Events.setGroup(previous);
    }
  }

  /**
   * An option's arguments are inputs that take expressions, but Blockly refuses regular blocks inside a shadow.
   * So an option that shows as a shadow (fresh from the toolbox, or its slot's default surfacing when the reader
   * removed the block over it) becomes a regular copy at once, its shadow kept underneath as the slot's default.
   */
  private promoteShadows(group: string, ids: readonly string[]): void {
    const shadows = ids
      .map((id) => this.workspace.getBlockById(id))
      .filter((b): b is Blockly.BlockSvg => !!b)
      .filter((b) => b.isShadow() && b.outputConnection?.targetConnection && !b.getParent()?.isShadow() && b.inputList.some((i) => i.connection && i.type === Blockly.inputs.inputTypes.VALUE));
    if (!shadows.length) return;
    const previous = Blockly.Events.getGroup();
    Blockly.Events.setGroup(group || true);
    try {
      for (const shadow of shadows) {
        const slot = shadow.outputConnection!.targetConnection!;
        if (!shadow.isShadow() || slot.targetBlock() !== shadow) continue;
        const state = Blockly.serialization.blocks.save(shadow, { addCoordinates: false, saveIds: false })!;
        const copy = Blockly.serialization.blocks.append(state, this.workspace) as Blockly.BlockSvg;
        slot.connect(copy.outputConnection!);
      }
    } finally {
      Blockly.Events.setGroup(previous);
    }
  }
}

/** A block state without ids or positions, for comparing what blocks are rather than where. */
function strip(state: unknown): unknown {
  if (Array.isArray(state)) return state.map(strip);
  if (!state || typeof state !== 'object') return state;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(state).sort()) if (key !== 'id' && key !== 'x' && key !== 'y') out[key] = strip((state as Record<string, unknown>)[key]);
  return out;
}
