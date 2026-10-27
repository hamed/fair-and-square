import { KOFI_URL } from '../config.ts';
import { WORDS } from '../words.en.ts';
import './share.css';

type Playback = 'live' | 'frozen';
type CopyOutcome = 'attempt' | 'copied' | 'failed';

export interface ShareDialogOptions {
  readonly kind: 'share' | 'embed';
  readonly url: string;
  readonly caption: string;
  readonly preview: HTMLCanvasElement | null;
  readonly onCopy: (outcome: CopyOutcome, mode?: Playback) => void;
}

const attribute = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Only playback changes: the program, input history, pose and sharing source stay in the URL. */
export function embedCode(link: string, live: boolean): string {
  const url = new URL(link);
  const hash = new URLSearchParams(url.hash.slice(1));
  hash.set('embed', '1');
  if (live) hash.set('play', hash.get('play') ?? 'auto');
  else hash.delete('play');
  url.hash = hash.toString();
  return `<iframe src="${attribute(url.href)}" title="${attribute(WORDS.panel.frameTitle)}" width="640" height="640" style="border:0"></iframe>`;
}

let serial = 0;

/** Sharing is available immediately; the optional coffee button follows a completed copy. */
export class ShareDialog {
  private readonly dialog: HTMLDialogElement;
  private readonly title: HTMLHeadingElement;
  private readonly picture: HTMLElement;
  private readonly caption: HTMLElement;
  private readonly playback: HTMLElement;
  private readonly modes: HTMLButtonElement[] = [];
  private readonly label: HTMLLabelElement;
  private readonly value: HTMLTextAreaElement;
  private readonly copyButton: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly support: HTMLAnchorElement;
  private options: ShareDialogOptions | null = null;
  private opener: HTMLElement | null = null;
  private mode: Playback = 'live';
  private revision = 0;

  constructor() {
    const words = WORDS.shareDialog;
    const id = `share-dialog-${++serial}`;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'share-dialog';
    this.dialog.setAttribute('aria-labelledby', `${id}-title`);
    const header = document.createElement('header');
    header.className = 'share-dialog-header';
    this.title = document.createElement('h2');
    this.title.id = `${id}-title`;
    const close = document.createElement('button');
    close.type = 'button';
    close.dataset.shareClose = '';
    close.className = 'share-close';
    close.setAttribute('aria-label', words.close);
    close.title = words.close;
    close.textContent = '×';
    close.addEventListener('click', () => this.close());
    header.append(this.title, close);

    const body = document.createElement('div');
    body.className = 'share-dialog-body';
    const figure = document.createElement('figure');
    figure.className = 'share-figure';
    this.picture = document.createElement('div');
    this.picture.className = 'share-picture';
    this.caption = document.createElement('figcaption');
    figure.append(this.picture, this.caption);
    this.playback = document.createElement('div');
    this.playback.className = 'share-playback';
    const choices = document.createElement('div');
    choices.className = 'share-modes';
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-label', words.playback);
    for (const mode of ['live', 'frozen'] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.shareMode = mode;
      button.textContent = words[mode];
      button.addEventListener('click', () => {
        if (this.mode === mode) return;
        this.mode = mode;
        this.updateValue();
      });
      choices.append(button);
      this.modes.push(button);
    }
    const hint = document.createElement('p');
    hint.textContent = words.playbackHint;
    this.playback.append(choices, hint);
    this.label = document.createElement('label');
    this.label.htmlFor = `${id}-value`;
    this.value = document.createElement('textarea');
    this.value.id = `${id}-value`;
    this.value.dataset.shareValue = '';
    this.value.readOnly = true;
    this.value.spellcheck = false;
    this.value.addEventListener('focus', () => this.value.select());
    body.append(figure, this.playback, this.label, this.value);

    const footer = document.createElement('footer');
    footer.className = 'share-dialog-footer';
    const actions = document.createElement('div');
    actions.className = 'share-actions';
    this.copyButton = document.createElement('button');
    this.copyButton.type = 'button';
    this.copyButton.dataset.shareCopy = '';
    this.copyButton.className = 'share-copy';
    this.copyButton.addEventListener('click', () => this.copy());
    this.status = document.createElement('p');
    this.status.className = 'share-status';
    this.status.setAttribute('role', 'status');
    this.support = document.createElement('a');
    this.support.className = 'share-support';
    this.support.href = KOFI_URL;
    this.support.target = '_blank';
    this.support.rel = 'noopener';
    this.support.dataset.trackTarget = 'kofi';
    this.support.dataset.trackCategory = 'payment';
    this.support.textContent = words.support;
    this.support.hidden = true;
    actions.append(this.copyButton, this.support);
    footer.append(actions, this.status);
    this.dialog.append(header, body, footer);
    this.dialog.addEventListener('close', () => { if (!this.dialog.open) this.finished(); });
    this.dialog.addEventListener('click', (event) => {
      if (event.target !== this.dialog) return;
      const box = this.dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) this.close();
    });
    // Native keys still activate the focused control or close the dialog, without reaching the game.
    this.dialog.addEventListener('keydown', (event) => event.stopPropagation());
    this.dialog.addEventListener('wheel', (event) => event.stopPropagation(), { passive: true });
  }

  open(options: ShareDialogOptions, opener: HTMLElement): void {
    this.options = options;
    this.opener = opener;
    this.mode = 'live';
    this.title.textContent = options.kind === 'embed' ? WORDS.panel.embed : WORDS.panel.share;
    this.dialog.dataset.kind = options.kind;
    this.caption.textContent = options.caption;
    this.caption.hidden = !options.caption;
    this.picture.replaceChildren();
    this.picture.hidden = !options.preview;
    if (options.preview) {
      options.preview.classList.add('share-preview');
      options.preview.setAttribute('role', 'img');
      options.preview.setAttribute('aria-label', WORDS.shareDialog.preview);
      this.picture.append(options.preview);
    }
    this.playback.hidden = options.kind !== 'embed';
    this.label.textContent = options.kind === 'embed' ? WORDS.shareDialog.code : WORDS.shareDialog.link;
    this.value.rows = options.kind === 'embed' ? 4 : 2;
    this.updateValue();
    if (!this.dialog.isConnected) document.body.append(this.dialog);
    if (!this.dialog.open) this.dialog.showModal();
    this.copyButton.focus();
  }

  close(): void {
    if (!this.dialog.open) return;
    this.dialog.close();
    this.finished();
  }

  private finished(): void {
    this.revision++;
    this.options = null;
    if (this.opener?.isConnected) this.opener.focus();
    this.opener = null;
  }

  private updateValue(): void {
    const options = this.options;
    if (!options) return;
    this.value.value = options.kind === 'embed' ? embedCode(options.url, this.mode === 'live') : options.url;
    for (const button of this.modes) button.setAttribute('aria-pressed', String(button.dataset.shareMode === this.mode));
    this.resetCopy();
  }

  private resetCopy(): void {
    this.revision++;
    this.copyButton.textContent = WORDS.shareDialog.copy;
    this.status.textContent = '';
    this.status.className = 'share-status';
    this.support.hidden = true;
  }

  private copy(): void {
    const options = this.options;
    if (!options) return;
    this.resetCopy();
    const revision = this.revision;
    const mode = options.kind === 'embed' ? this.mode : undefined;
    const report = (outcome: CopyOutcome) => { try { options.onCopy(outcome, mode); } catch { /* tracking cannot prevent copying */ } };
    const current = () => this.dialog.open && this.options === options && this.revision === revision;
    const failed = () => {
      report('failed');
      if (!current()) return;
      this.status.textContent = WORDS.shareDialog.failed;
      this.value.focus();
      this.value.select();
    };
    let writing: Promise<void>;
    try {
      // Call directly in the user gesture, without waiting for a preview, analytics, or another action.
      writing = navigator.clipboard.writeText(this.value.value);
    } catch {
      report('attempt');
      failed();
      return;
    }
    report('attempt');
    void Promise.resolve(writing).then(() => {
      report('copied');
      if (!current()) return;
      this.copyButton.textContent = WORDS.shareDialog.copied;
      this.status.textContent = WORDS.shareDialog.copied;
      this.status.className = 'share-status sr-only';
      this.support.hidden = false;
    }, failed);
  }
}
