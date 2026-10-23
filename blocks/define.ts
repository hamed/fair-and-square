/**
 * Blockly block definitions, generated from the catalogue and the labels: one block per op, its type name the op
 * id. Shapes follow from types under the zelos renderer: Number reporters are round, Bool ('Boolean') hexagonal,
 * the option types (Pairing, Start, Split) square; hats get a cap from their style. Works headless too (the round
 * trip tests define the blocks in Node).
 */
import * as Blockly from 'blockly/core';
import { ORDER, type Category, type OpSpec, type ValueType } from '../model/catalogue.ts';
import { BLOCKS, CONNECTORS, SHOW_BADGE } from './words/blocks.en.ts';

/** Catalogue types as Blockly connection checks ('Boolean' is what zelos draws as a hexagon). */
const CHECK: Readonly<Record<ValueType, string>> = {
  Number: 'Number',
  Bool: 'Boolean',
  Pairing: 'Pairing',
  Split: 'Split',
  Group: 'Group',
  Distribution: 'Distribution',
  Allocation: 'Allocation',
};

/** The block style of a section (theme in editor.ts); hats have their own, with a cap. */
function styleOf(spec: OpSpec): string {
  return spec.kind === 'hat' ? `fns_hat_${spec.section}` : `fns_${spec.section}`;
}

/** The toolbox's eight categories, in order (owner, 2026-10-19). */
export const CATEGORIES: readonly Category[] = ['run', 'yard', 'trade', 'tax', 'who', 'numbers', 'random', 'show'];

const checks = (accepts: readonly ValueType[]) => accepts.map((t) => CHECK[t]);

/**
 * A dropdown that survives Blockly 13.3's shadow disposal. In a shadow block every dropdown's click target is the
 * block itself, so disposing a shadow with two dropdowns (tax.on, give.to, val.prop) unbinds that target's
 * tooltip twice, and the second unbind throws (an emptied listener list). The second field skips it.
 */
class Dropdown extends Blockly.FieldDropdown {
  private disposing = false;

  static override fromJson(options: Blockly.FieldDropdownFromJsonConfig): Dropdown {
    return new Dropdown(options.options!, undefined, options);
  }

  protected override doValueUpdate_(value: string): void {
    super.doValueUpdate_(value);
    const block = this.getSourceBlock();
    if (block && ((block.type === 'op.fn2' && this.name === 'fn') || (block.type === 'stat.of' && this.name === 'stat'))) updateSentence(block, value);
  }

  protected override getClickTarget_(): Element | null {
    const target = super.getClickTarget_();
    const bound = (target as { mouseOverWrapper_?: unknown[] } | null)?.mouseOverWrapper_;
    if (this.disposing && Array.isArray(bound) && bound.length === 0) return null;
    return target;
  }

  override dispose(): void {
    this.disposing = true;
    super.dispose();
  }
}

/** Change only presentation: keep dropdown values, inputs and their connections intact. */
function updateSentence(block: Blockly.Block, value: string): void {
  if (block.type === 'op.fn2' && block.getInput('function') && block.getInput('b')) {
    const power = value === 'power';
    if (power && block.inputList[0].name !== 'a') block.moveInputBefore('a', 'function');
    else if (!power && block.inputList[0].name !== 'function') block.moveInputBefore('function', 'a');
    block.getField('OF')!.setVisible(!power);
    block.getField('AND')!.setVisible(!power);
  } else if (block.type === 'stat.of' && block.getField('IN')) {
    const fraction = value === 'fraction';
    block.getField('OF')!.setVisible(!fraction);
    block.getField('prop')!.setVisible(!fraction);
    block.getField('OVER')!.setVisible(!fraction);
    block.getField('IN')!.setVisible(fraction);
  }
}

function argOf(spec: OpSpec, name: string): object {
  if ((spec.id === 'num' || spec.id === 'pct') && name === 'v') return { type: 'field_number', name: 'v', value: 0 };
  const input = spec.inputs.find((i) => i.name === name);
  if (input) return { type: 'input_value', name, check: checks(input.accepts) };
  const field = spec.fields.find((f) => f.name === name);
  if (field?.free) return { type: 'field_input', name, text: field.options[0] };
  if (field) {
    const labels = BLOCKS[spec.id]?.fields?.[name] ?? {};
    return { type: 'field_fns_dropdown', name, options: field.options.map((id) => [labels[id] ?? id, id]) };
  }
  throw new RangeError(`${spec.id}: the message names {${name}}, which is neither an input nor a field`);
}

/** The JSON definition of one op's block. */
function definitionOf(spec: OpSpec): Record<string, unknown> {
  const args: object[] = [];
  const words = BLOCKS[spec.id];
  // a new line in the label starts a new row (owner, 2026-10-21: "the loser pays" and its stake were one long row)
  const message = (words?.label ?? spec.id).replace(/\{(\w+)\}|\s*\n\s*/g, (_, name: string | undefined) => {
    args.push(name ? argOf(spec, name) : { type: 'input_end_row' });
    return name ? `%${args.length}` : ` %${args.length} `;
  });
  // a Show block's badge: it looks, it never changes the economy (said once here, not in every tip)
  const tip = words?.tip ?? '';
  const json: Record<string, unknown> = {
    type: spec.id,
    message0: message,
    args0: args,
    inputsInline: true,
    style: styleOf(spec),
    tooltip: spec.category === 'show' ? `${SHOW_BADGE} ${tip}` : tip,
  };
  if (spec.kind === 'c') {
    json.message1 = '%1';
    json.args1 = [{ type: 'input_statement', name: 'body' }];
  }
  if (spec.kind === 'hat') json.nextStatement = null;
  if (spec.kind === 'stack' || spec.kind === 'c') {
    json.previousStatement = null;
    json.nextStatement = null;
  }
  if (spec.kind === 'reporter') json.output = CHECK[spec.output!];
  // Separate inline inputs let a dropdown move between operands without replacing its fields or connections.
  const label = (name: string, text: string) => ({ type: 'field_label', name, text });
  if (spec.id === 'op.fn2') {
    json.message0 = '%1 %2 %3 %4 %5 %6';
    json.args0 = [argOf(spec, 'fn'), label('OF', CONNECTORS.of), { type: 'input_dummy', name: 'function' }, argOf(spec, 'a'), label('AND', CONNECTORS.and), argOf(spec, 'b')];
    json.extensions = ['fns_sentence'];
  } else if (spec.id === 'stat.of') {
    json.message0 = '%1 %2 %3 %4 %5 %6 %7 %8';
    json.args0 = [
      argOf(spec, 'stat'), label('OF', CONNECTORS.of), { type: 'input_dummy', name: 'measure' },
      argOf(spec, 'prop'), label('OVER', CONNECTORS.over), { type: 'input_dummy', name: 'property' },
      label('IN', CONNECTORS.in), argOf(spec, 'over'),
    ];
    json.extensions = ['fns_sentence'];
  }
  return json;
}

/** Register every block (once). */
export function defineBlocks(): void {
  if (!Blockly.registry.hasItem(Blockly.registry.Type.FIELD, 'field_fns_dropdown')) Blockly.fieldRegistry.register('field_fns_dropdown', Dropdown);
  if (!Blockly.Extensions.isRegistered('fns_sentence')) Blockly.Extensions.register('fns_sentence', function (this: Blockly.Block) {
    updateSentence(this, this.getFieldValue(this.type === 'op.fn2' ? 'fn' : 'stat'));
  });
  const fresh = ORDER.filter((spec) => !Blockly.Blocks[spec.id]);
  if (fresh.length) Blockly.common.defineBlocks(Blockly.common.createBlockDefinitionsFromJsonArray(fresh.map(definitionOf)));
}
