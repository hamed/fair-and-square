/**
 * What a program puts on the panel: its sliders, buttons, readouts and plots, read off the AST (the panel is
 * declared by blocks, so there is nothing to keep in sync).
 */
import { walk, type Path, type Program } from './ast.ts';

export interface Slider {
  readonly name: string;
  readonly min: number;
  readonly max: number;
  readonly start: number;
  /** Shown in percent (its ends are `pct` blocks). */
  readonly percent: boolean;
}

/** A watched number: its block's path (for `Run.evaluate`) and name; a share shows in percent. */
export interface Watch {
  readonly path: Path;
  readonly name: string;
  readonly percent: boolean;
}

export interface Panel {
  readonly sliders: readonly Slider[];
  readonly buttons: readonly string[];
  readonly watches: readonly Watch[];
  readonly plots: readonly ('gini' | 'lorenz' | 'ccdf' | 'histogram')[];
}

export function panelOf(program: Program): Panel {
  const sliders = new Map<string, Slider>();
  const buttons: string[] = [];
  const watches: Watch[] = [];
  const plots: Panel['plots'][number][] = [];
  walk(program, (node, path) => {
    const name = node.f?.name;
    if (node.op === 'panel.slider' && name && !sliders.has(name)) {
      const value = (arg: string) => node.args?.[arg]?.v ?? 0;
      sliders.set(name, { name, min: value('min'), max: value('max'), start: value('start'), percent: node.args?.min?.op === 'pct' });
    } else if ((node.op === 'panel.button' || node.op === 'panel.wait') && name && !buttons.includes(name)) buttons.push(name);
    else if (node.op === 'panel.number') {
      const value = node.args?.value;
      watches.push({ path, name: name ?? '', percent: value?.op === 'stat.of' && (value.f?.stat === 'share' || value.f?.stat === 'fraction') });
    }
    else if (node.op === 'panel.plot' && !plots.includes(node.f!.kind as never)) plots.push(node.f!.kind as Panel['plots'][number]);
  });
  return { sliders: [...sliders.values()], buttons, watches, plots };
}
