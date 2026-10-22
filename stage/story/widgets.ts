/**
 * The widget contract: a deep module behind four things, mount, config, events and cleanup. The story runner
 * knows this contract and the names beats give (a registry the page fills); it never knows what a widget is.
 */
import type { Session } from '../console/session.ts';

/** Something a widget tells the story: `picked` (a choice the reader made), `edited` (the program changed). */
export interface WidgetEvent {
  readonly kind: 'picked' | 'edited';
  readonly [k: string]: unknown;
}

export interface WidgetContext {
  /** The session the story plays. */
  session(): Session;
  /** Hand the story another session (a yard the reader chose). */
  setSession(s: Session): void;
  /** Tell the story something. */
  emit(e: WidgetEvent): void;
}

export interface Widget {
  /** Shown, with the beat's config. */
  mount(ctx: WidgetContext, config: Readonly<Record<string, unknown>>): void;
  /** A later beat's config, while still mounted (`showMe`: do the reader's action for them). */
  config(config: Readonly<Record<string, unknown>>): void;
  /** Each frame, seconds since the last. */
  frame?(dt: number): void;
  /** Gone: everything it made, undone. */
  cleanup(): void;
}

export type Widgets = Readonly<Record<string, Widget>>;
