/**
 * The Rules drawer (level 1): the program the yard plays, as blocks. It opens beside the yard (the Rules tab);
 * Blockly is loaded the first time it opens, so the stage's first paint never waits for it. A valid edit goes to
 * the yard at once (round 0, the same seed); an invalid one greys its blocks, and the yard keeps the last good
 * program. The library loads a named model into the blocks (Ctrl+Z takes it back).
 */
import { canonical, type Path, type Program } from '../../model/ast.ts';
import { ProgramError } from '../../model/engine.ts';
import { PRESETS } from '../../model/presets.ts';
import { validate, type Issue } from '../../model/validate.ts';
import { issueText } from '../../blocks/words/issues.en.ts';
import { PRESET_CARDS } from '../../blocks/words/presets.en.ts';
import type { Editor } from '../../blocks/editor.ts';
import type { Session } from '../console/session.ts';

/** Edits settle this long before they go to the yard, ms. */
const SETTLE = 150;

export class RulesDrawer {
  private readonly root: HTMLElement;
  private readonly host: HTMLElement;
  private readonly status: HTMLElement;
  private readonly session: () => Session;
  private readonly changed: () => void;
  private editor: Editor | null = null;
  private loading: Promise<void> | null = null;
  private ids: ReadonlyMap<Path, string> = new Map();
  private issues: Issue[] = [];
  /** The program the blocks were last loaded from or sent to the yard (JSON), and the warnings shown. */
  private applied = '';
  private warned = -1;
  private timer = 0;
  /** A model picked from the library before the blocks had loaded: loaded when they have. */
  private picked: Program | null = null;

  constructor(root: HTMLElement, session: () => Session, changed: () => void) {
    this.root = root;
    this.session = session;
    this.changed = changed;
    this.host = root.querySelector<HTMLElement>('.blocks')!;
    this.status = root.querySelector<HTMLElement>('.status')!;
    const library = root.querySelector<HTMLSelectElement>('select')!;
    for (const p of PRESETS) {
      const option = document.createElement('option');
      option.value = p.id;
      option.textContent = PRESET_CARDS[p.id]?.title ?? p.id;
      option.title = PRESET_CARDS[p.id]?.see ?? '';
      library.append(option);
    }
    library.addEventListener('change', () => {
      const p = PRESETS.find((x) => x.id === library.value);
      library.value = '';
      if (!p) return;
      if (this.editor) this.editor.load(p.program);
      else this.picked = p.program;
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** The editor, once loaded (devtools: fns.editor()). */
  get blocks(): Editor | null {
    return this.editor;
  }

  async open(): Promise<void> {
    this.root.hidden = false;
    this.changed();
    if (!this.loading) this.loading = this.load();
    await this.loading;
    // the yard may have changed program meanwhile (the console, a link)
    if (canonical(this.session().game.program) !== this.applied) this.show(this.session().game.program);
    // the blocks as wide as the drawer, once it is laid out
    requestAnimationFrame(() => this.editor?.fitWidth());
  }

  close(): void {
    this.root.hidden = true;
    this.changed();
  }

  /** Each frame: the run's warnings onto the blocks when they change. */
  update(): void {
    if (!this.editor || this.root.hidden) return;
    const warnings = this.session().game.run.warnings;
    if (warnings.size === this.warned) return;
    this.warned = warnings.size;
    this.editor.show(this.issues, warnings, this.ids);
  }

  private async load(): Promise<void> {
    this.status.textContent = 'loading the blocks…';
    const { Editor } = await import('../../blocks/editor.ts');
    this.editor = new Editor(this.host);
    this.editor.onChange(() => {
      clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.apply(), SETTLE);
    });
    this.show(this.session().game.program);
    // a pick made while loading: as if made now (Ctrl+Z takes it back)
    if (this.picked) {
      this.editor.load(this.picked);
      this.picked = null;
    }
  }

  /** The blocks of the yard's program. */
  private show(program: Program): void {
    this.applied = canonical(program);
    this.editor!.load(program);
    this.say('');
  }

  /** The blocks changed: check them; a valid program goes to the yard. */
  private apply(): void {
    const editor = this.editor!;
    const read = editor.read();
    this.ids = read.ids;
    this.issues = validate(read.program);
    const json = canonical(read.program);
    if (!this.issues.length && json !== this.applied) {
      try {
        this.session().setProgram(read.program);
        this.applied = json;
      } catch (e) {
        if (!(e instanceof ProgramError)) throw e;
        this.issues = [...e.issues];
      }
    }
    this.warned = -1;
    editor.show(this.issues, this.issues.length ? new Map() : this.session().game.run.warnings, this.ids);
    const whole = this.issues.filter((i) => !i.path);
    this.say(
      whole.length
        ? whole.map((i) => issueText(i.code, i.params)).join(' ')
        : this.issues.length
          ? `${this.issues.length} block${this.issues.length === 1 ? '' : 's'} to fix (greyed): the yard keeps the last good program.`
          : '',
    );
  }

  private say(text: string): void {
    this.status.textContent = text;
    this.status.classList.toggle('bad', !!text);
  }
}
