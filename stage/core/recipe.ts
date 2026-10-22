/**
 * The toolkit's vocabulary. A pose is a recipe: one word per slot, in any
 * order, so readers can combine a handful of ops into charts nobody designed.
 *
 *   rescale  wealth | log | logarea         what a body's resting area measures
 *   resize   natural | equal | squared      the area actually drawn, from the resting one
 *   reshape  square | bar [t] | col [t] | tri | hex
 *   sort     id | asc | desc | shuffle
 *   group    none | median | quartiles | tmb | deciles
 *   pose     free (spread out, standing) | wander | still (nobody moves by themselves) | stack | row | lattice | pack | fold
 *            | tower | stairs (the running total made of the bodies: a tower of blocks 1/N wide, or pulled into stairs)
 *   extras   gap <g>, prints | noprints
 *
 * Verbs ("sort desc"), pipes and commas are optional: "log | bar | desc | stack"
 * and "stack desc bar log" are the same recipe. A recipe is data: it is what
 * the URL, the gallery and the console store.
 */

const SCALES = ['wealth', 'log', 'logarea'] as const;
const SIZES = ['natural', 'equal', 'squared'] as const;
export const SHAPES = ['square', 'bar', 'col', 'tri', 'hex'] as const;
const ORDERS = ['id', 'asc', 'desc', 'shuffle'] as const;
const GROUPS = ['none', 'median', 'quartiles', 'tmb', 'deciles'] as const;
const POSES = ['free', 'wander', 'still', 'stack', 'row', 'lattice', 'pack', 'fold', 'tower', 'stairs'] as const;

export interface Recipe {
  readonly scale: (typeof SCALES)[number];
  readonly size: (typeof SIZES)[number];
  readonly shape: (typeof SHAPES)[number];
  /** Bar height or column width; null means 1/N, so N bars stack to height 1. */
  readonly thickness: number | null;
  readonly order: (typeof ORDERS)[number];
  readonly group: (typeof GROUPS)[number];
  readonly pose: (typeof POSES)[number];
  /** Space between neighbours, in bodies' thickness along the pose. */
  readonly gap: number;
  /** Tile the reference box with copies of a folded figure: the copies count N_eff. */
  readonly prints: boolean;
}

export const DEFAULT_RECIPE: Recipe = Object.freeze({
  scale: 'wealth',
  size: 'natural',
  shape: 'square',
  thickness: null,
  order: 'id',
  group: 'none',
  pose: 'free',
  gap: 0,
  prints: false,
});

/** Named recipes: starting points, not a menu of the only charts there are. */
export const PRESETS: Readonly<Record<string, string>> = Object.freeze({
  room: '',
  // on a linear scale the richest bar runs far off the yard: the CCDF is read on a log scale, each bar as long as
  // the log of its share (logarea: bars of one height, length linear in log; owner, 2026-10-22)
  ccdf: 'logarea bar desc stack',
  bars: 'bar stack gap 1',
  columns: 'col row gap 1',
  lineup: 'asc row gap 0.5',
  neff: 'squared fold prints',
  classes: 'tmb desc fold',
  median: 'median fold',
  quartiles: 'quartiles desc fold',
  density: 'equal desc pack',
});

type Slot = 'scale' | 'size' | 'shape' | 'order' | 'group' | 'pose';
const SLOTS: ReadonlyArray<[Slot, readonly string[]]> = [
  ['scale', SCALES],
  ['size', SIZES],
  ['shape', SHAPES],
  ['order', ORDERS],
  ['group', GROUPS],
  ['pose', POSES],
];
const WORDS = new Map<string, Slot>(SLOTS.flatMap(([slot, words]) => words.map((w) => [w, slot] as [string, Slot])));
/** Words that only make a recipe read like a sentence. */
const VERBS = new Set(['rescale', 'resize', 'reshape', 'sort', 'group', 'pose', 'arrange', 'by', 'then']);

/** Every word a recipe accepts, for completion and help. */
export const RECIPE_WORDS: readonly string[] = [...WORDS.keys(), 'gap', 'prints', 'noprints'];

export function isRecipeWord(word: string): boolean {
  return WORDS.has(word) || word === 'gap' || word === 'prints' || word === 'noprints';
}

/** `text`'s words applied over `base`. Throws on any unknown word or bad number, before anything is returned. */
export function parseRecipe(text: string, base: Recipe = DEFAULT_RECIPE): Recipe {
  const tokens = text
    .toLowerCase()
    .split(/[\s|,]+/)
    .filter((t) => t.length > 0);
  const out: { -readonly [K in keyof Recipe]: Recipe[K] } = { ...base };
  for (let k = 0; k < tokens.length; k++) {
    const word = tokens[k];
    if (VERBS.has(word)) continue;
    const next = tokens[k + 1];
    const number = next !== undefined && /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/.test(next) ? Number(next) : null;
    if (word === 'gap') {
      if (number === null || !(number >= 0 && number <= 20)) throw new RangeError('gap takes a number in [0, 20]');
      out.gap = number;
      k++;
      continue;
    }
    if (word === 'prints' || word === 'noprints') {
      out.prints = word === 'prints';
      continue;
    }
    const slot = WORDS.get(word);
    if (!slot) throw new Error(`unknown op "${word}"`);
    (out as Record<Slot, string>)[slot] = word;
    if (word === 'bar' || word === 'col') {
      if (number !== null) {
        if (!(number > 0 && number <= 2)) throw new RangeError(`${word} thickness must be in (0, 2]`);
        out.thickness = number;
        k++;
      } else {
        out.thickness = null;
      }
    } else if (slot === 'shape') {
      out.thickness = null;
    }
  }
  return Object.freeze(out);
}

/** The shortest text that parses back to `r`: the non-default words, in slot order. */
export function formatRecipe(r: Recipe): string {
  const words: string[] = [];
  for (const [slot] of SLOTS) {
    const value = r[slot];
    if (value === DEFAULT_RECIPE[slot]) continue;
    words.push(value);
    if ((value === 'bar' || value === 'col') && r.thickness !== null) words.push(String(r.thickness));
  }
  if (r.gap !== 0) words.push('gap', String(r.gap));
  if (r.prints) words.push('prints');
  return words.join(' ');
}
