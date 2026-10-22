/**
 * The squares in some prose (the about page, or About's squares in the stage's panel): every [data-sq] span (one
 * square, data-sq="pair" two trading, data-sq="party" the five of us with our drinks) and every [data-family] figure
 * under `root` take their faces from one field; `frame` moves them all and draws the ones on screen. What each
 * square is and does is written in the prose, not here.
 */
import { Cast, type Mount, type Pointer } from './cast.ts';
import { Family, Pair } from './market.ts';
import { Party, Solo } from './solo.ts';

/** data-sq's value → what it makes. */
const KINDS: Readonly<Record<string, new (host: HTMLElement) => Mount>> = { '': Solo, one: Solo, pair: Pair, party: Party };

export class Squares {
  private readonly mounts: Mount[] = [];
  private readonly cast: Cast;
  private readonly onScreen = new Set<Element>();
  private readonly seen: IntersectionObserver;

  constructor(root: ParentNode, reduced: boolean) {
    for (const el of root.querySelectorAll<HTMLElement>('[data-sq]')) this.mounts.push(new (KINDS[el.dataset.sq ?? ''] ?? Solo)(el));
    for (const el of root.querySelectorAll<HTMLElement>('[data-family]')) this.mounts.push(new Family(el));
    this.cast = new Cast(Math.max(1, this.mounts.reduce((n, m) => n + m.faces, 0)), reduced);
    let first = 0;
    for (const m of this.mounts) {
      m.bind(this.cast, first);
      first += m.faces;
    }
    this.seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) this.onScreen.add(e.target);
          else this.onScreen.delete(e.target);
        }
      },
      { rootMargin: '120px' },
    );
    for (const m of this.mounts) this.seen.observe(m.host);
  }

  /** `t` seconds since the page started, `dt` since the last frame; the pointer, client px. */
  frame(t: number, dt: number, pointer: Pointer): void {
    for (const m of this.mounts) m.frame(t, dt, pointer, this.onScreen.has(m.host));
    this.cast.field.step(dt);
  }

  /** No longer watched for being on screen (their prose is gone). */
  dispose(): void {
    this.seen.disconnect();
  }
}

/**
 * The free way to help: pass the stage on with its line (data-text): the system's share sheet where there is one,
 * else the clipboard; when both fail (not when the visitor cancels), the link shown, selected, to copy by hand
 * (review 2026-10-22, 3).
 */
export function passItOn(root: ParentNode): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-share-link]')) {
    const label = button.textContent ?? '';
    const say = (text: string) => {
      button.textContent = text;
      setTimeout(() => (button.textContent = label), 2200);
    };
    button.addEventListener('click', async () => {
      const url = new URL(button.dataset.shareLink || './', location.href).href;
      const text = button.dataset.text;
      const line = text ? `${text} ${url}` : url;
      if (navigator.share) {
        try {
          await navigator.share({ title: button.dataset.title, text, url });
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return;
        }
      }
      try {
        await navigator.clipboard.writeText(line);
        say(button.dataset.copied ?? label);
      } catch {
        showLink(button, url);
      }
    });
  }
}

/** The link in a box after the button, selected: to copy by hand. */
function showLink(button: HTMLElement, url: string): void {
  let box = button.nextElementSibling;
  if (!(box instanceof HTMLInputElement) || !box.classList.contains('link')) {
    box = document.createElement('input');
    box.className = 'link';
    (box as HTMLInputElement).readOnly = true;
    box.setAttribute('aria-label', button.dataset.manual ?? 'The link, to copy');
    button.after(box);
  }
  const input = box as HTMLInputElement;
  input.value = url;
  input.focus();
  input.select();
}
