/**
 * The clips in the prose (video[data-clip]: Learn's own acts, recorded by scripts/about-clips.mjs). Each plays,
 * muted and looping, while it is on screen, and has its own square play/pause button (a click on the clip does the
 * same). Paused by the reader, it stays paused, however the page is scrolled (review 2026-10-22, dialogue 1). With
 * motion reduced, none plays until asked.
 */
export function clips(root: ParentNode, reduced: boolean): void {
  const videos = [...root.querySelectorAll<HTMLVideoElement>('video[data-clip]')];
  /** Paused by the reader: scrolling past does not start it again. */
  const held = new WeakSet<HTMLVideoElement>();
  for (const v of videos) {
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.removeAttribute('autoplay');
    if (reduced) held.add(v);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'clip-toggle';
    const show = () => {
      const playing = !v.paused;
      toggle.dataset.state = playing ? 'playing' : 'paused';
      toggle.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      toggle.title = playing ? 'Pause' : 'Play';
    };
    const flip = () => {
      if (v.paused) {
        held.delete(v);
        void v.play().catch(() => undefined);
      } else {
        held.add(v);
        v.pause();
      }
    };
    toggle.addEventListener('click', flip);
    v.addEventListener('click', flip);
    v.addEventListener('play', show);
    v.addEventListener('pause', show);
    show();
    const frame = document.createElement('div');
    frame.className = 'clip-frame';
    v.replaceWith(frame);
    frame.append(v, toggle);
  }
  if (!('IntersectionObserver' in globalThis)) return;
  const seen = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const v = e.target as HTMLVideoElement;
        if (e.isIntersecting && !held.has(v)) void v.play().catch(() => undefined);
        else if (!e.isIntersecting && !v.paused) v.pause();
      }
    },
    { threshold: 0.25 },
  );
  for (const v of videos) seen.observe(v);
}
