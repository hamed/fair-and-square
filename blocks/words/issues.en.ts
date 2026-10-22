/**
 * English words for the editor's issues (a program that cannot run) and warnings (a value that had to be fixed).
 * Codes and parameters are the model's (validate.ts, compile.ts); the words are these. Draft wording.
 */
import type { IssueCode } from '../../model/validate.ts';
import type { WarningCode } from '../../model/compile.ts';

/** A slot by its step's word: pair up, flip, pay, take, give back (one word per idea). */
const SLOT_NAMES: Readonly<Record<string, string>> = { pair: 'pair up', coin: 'flip', stake: 'pay', tax: 'take', give: 'give back' };

export function issueText(code: IssueCode, params: Readonly<Record<string, string>> = {}): string {
  switch (code) {
    case 'unknown-op':
      return `Unknown block ${params.op}.`;
    case 'not-a-hat':
      return 'Only “when started” or “when” can begin a script.';
    case 'no-start':
      return 'Add a “when started” block.';
    case 'one-start':
      return 'Only one “when started” can run: remove this one.';
    case 'no-yard':
      return 'Begin with the yard block (“N squares …”).';
    case 'yard-first':
      return 'The yard block comes first.';
    case 'setup-place':
      return 'Setup blocks go right after the yard block, before any other block.';
    case 'setup-twice':
      return 'This setup block is already used above.';
    case 'needs-lattice':
      return 'Neighbours and moving need squares on a square lattice: choose it in the yard block.';
    case 'unknown-group':
      return `No group is called “${params.name ?? ''}” above this block: call it so with “call … ” in the setup.`;
    case 'button-only':
      return 'A button runs things that happen at once: economy and show blocks.';
    case 'literal-only':
      return 'A slider’s ends and start are plain numbers.';
    case 'step-order':
      return `This block holds its steps, each once, in order: ${params.steps}.`;
    case 'step-place':
      return 'This step belongs inside its own block.';
    case 'observer-only':
      return 'Only show blocks sit among these steps: they look, they never change anything.';
    case 'every-outside':
      return '“every (k) rounds” counts rounds: put it inside a loop.';
    case 'not-statement':
      return 'This block goes into a slot, not into a stack.';
    case 'not-value':
      return 'This block goes into a stack, not into a slot.';
    case 'camera-only':
      return 'Only show blocks run under “when”.';
    case 'unknown-input':
      return `This block has no input “${params.input}”.`;
    case 'missing-input':
      return 'Fill the empty slot.';
    case 'bad-type':
      return `This slot takes ${params.want}, not ${params.got}.`;
    case 'bad-field':
      return `“${params.value}” is not a choice for ${params.field}.`;
    case 'missing-value':
      return 'Type a number.';
    case 'unexpected-value':
      return 'Only number blocks hold a value.';
    case 'unexpected-body':
      return 'This block cannot hold other blocks.';
    case 'who-context':
      return params.who === 'me'
        ? '“my” means each square in turn: only where each square is asked (take, give back, grow, move, a strength, a group’s condition).'
        : params.who === 'winner' || params.who === 'loser'
          ? `“${params.who}” is known only in pay.`
          : `“${params.who}” is known only in flip and pay.`;
    case 'no-globals':
      return 'Setup runs before the world exists: no measures here.';
    case 'knob-home':
      return `This card belongs in “${SLOT_NAMES[params.knob] ?? params.knob}”.`;
  }
}

export function warningText(code: WarningCode): string {
  switch (code) {
    case 'not-finite':
      return 'This gave NaN or infinity, and counted as 0.';
    case 'clamped':
      return 'Out of range: clamped.';
    case 'runaway':
      return 'Loops inside loops ran 100,000 passes in one round: this one was cut short.';
    case 'collapse':
      return 'This growth would leave no positive total wealth: the step was skipped.';
  }
}
