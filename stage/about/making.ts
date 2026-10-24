import { campaignLink } from '../analytics/campaign.ts';

/** The real game is loaded only when the reader asks; the story and its artifacts work without it. */
for (const demo of document.querySelectorAll<HTMLElement>('[data-yard-demo]')) {
  const button = demo.querySelector<HTMLButtonElement>('[data-open-yard]');
  const poster = demo.querySelector('img');
  if (!button || !poster) continue;
  button.hidden = false;
  let game: HTMLIFrameElement | null = null;
  button.addEventListener('click', () => {
    if (game) {
      game.replaceWith(poster);
      game = null;
      button.textContent = 'Try Be Born in the real game';
      button.setAttribute('aria-expanded', 'false');
      return;
    }
    game = document.createElement('iframe');
    game.className = 'live-yard';
    game.title = 'Fair and Square: change the rules, then choose Be born';
    game.src = campaignLink('./?opening=0&embed=1', location.href);
    poster.replaceWith(game);
    button.textContent = 'Close the game';
    button.setAttribute('aria-expanded', 'true');
    game.focus();
  });
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'making-live-yard');
}
