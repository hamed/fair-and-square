/**
 * Waiting for the fonts, but not forever (review 2026-10-18, finding 1): the
 * opening needs them to measure its lettering, and a visitor must not be left
 * with a blank canvas when they fail or hang. `failed` once, on a failure or
 * after `ms`; `ready` whenever they do arrive, even late (the title can still
 * come in, though the opening has given way to the stage by then).
 */
export function awaitFonts(load: Promise<unknown>, ms: number, on: { ready(): void; failed(): void }): void {
  let gaveUp = false;
  const giveUp = () => {
    if (gaveUp) return;
    gaveUp = true;
    on.failed();
  };
  const timer = setTimeout(giveUp, ms);
  load.then(
    () => {
      clearTimeout(timer);
      on.ready();
    },
    () => {
      clearTimeout(timer);
      giveUp();
    },
  );
}
