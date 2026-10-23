/** Searchable summaries, never replay payloads or user-authored strings. */
import { canonical, walk, type Node, type Program } from '../../model/ast.ts';
import { PRESETS } from '../../model/presets.ts';
import { stageProgram } from '../core/game.ts';
import type { Session } from '../console/session.ts';
import type { AnalyticsData } from '../analytics.ts';

const known = new Map(PRESETS.map((preset) => [canonical(preset.program), preset.id]));
const identities = new WeakMap<Program, string>();

export function simulationSummary(session: Session): AnalyticsData {
  const { game, recipe } = session;
  const { program, run } = game;
  let model = identities.get(program);
  if (!model) {
    const json = canonical(program);
    model = known.get(json) ?? (json === canonical(stageProgram(game.n)) ? 'stage' : 'custom');
    identities.set(program, model);
  }
  const nodes: Node[] = [];
  walk(program, (node) => nodes.push(node));
  // Only literal parameters and real slider readings are safe to summarise without evaluating expressions.
  const literal = (node?: Node): number | undefined => node && (node.op === 'num' || node.op === 'pct') && Number.isFinite(node.v) ? node.v : undefined;
  const value = (node?: Node): number | undefined => {
    if (node?.op !== 'panel.slider') return literal(node);
    const lo = literal(node.args?.min), hi = literal(node.args?.max), start = literal(node.args?.start);
    if (lo === undefined || hi === undefined || start === undefined) return undefined;
    return Math.min(hi, Math.max(lo, run.sliders.get(node.f?.name ?? '') ?? start));
  };
  const single = (op: string, arg: string) => nodes.filter((node) => node.op === op).map((node) => node.args?.[arg]);
  const stakes = single('trade.pay', 'stake');
  const taxes = single('tax.take', 'tau');
  const coins = single('trade.flip', 'coin');
  const stake = stakes[0], tax = taxes[0], coin = coins[0];
  const stakeValue = stakes.length === 1 ? value(stake?.op === 'stake.share' ? stake.args?.beta : stake?.op === 'stake.fixed' ? stake.args?.a : stake) : undefined;
  const taxValue = taxes.length === 1 && tax?.op.startsWith('take.') ? value(tax.args?.[tax.op === 'take.flat' ? 'a' : 'rate']) : undefined;
  const out = run.outputs();
  const data: AnalyticsData = {
    sim_model: model, sim_custom: model === 'custom', sim_n: game.n, sim_seed: game.seed,
    sim_round: run.round, sim_step: run.steps, sim_input_count: run.inputs.length,
    sim_stake_rule: stakes.length > 1 ? 'multiple' : !stake ? 'none' : stake.op === 'stake.split' ? 'split' : stake.op === 'stake.share' ? `${stake.f?.of}_share${stakeValue === undefined ? '_expression' : ''}` : stakeValue !== undefined ? 'fixed' : 'expression',
    sim_tax_rule: taxes.length > 1 ? 'multiple' : !tax ? 'none' : tax.op.startsWith('take.') ? `${tax.op.slice(5)}${taxValue === undefined ? '_expression' : ''}` : 'expression',
    sim_coin_rule: coins.length > 1 ? 'multiple' : !coin ? 'none' : coin.op === 'coin.fair' ? 'fair' : coin.op === 'coin.strength' ? 'strength' : literal(coin) !== undefined ? 'probability' : 'expression',
    sim_layout: recipe.pose, sim_shape: recipe.shape, sim_scale: recipe.scale, sim_size: recipe.size, sim_order: recipe.order,
    sim_gini: out.gini, sim_neff: out.neff, sim_richest_share: out.topOne, sim_pot_share: out.potShare,
  };
  if (stakeValue !== undefined) data.sim_stake = stakeValue;
  if (taxValue !== undefined) data.sim_tax = taxValue;
  return data;
}
