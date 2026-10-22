/**
 * The Story's words, English. Every subtitle is keyed by its beat (beats.ts says what each beat does; this file
 * says what it says), so a translation swaps this file and keeps the beats. Words in braces are filled in from
 * the running yard: {gini}, {ginimax} (the most it can be with these squares: (N − 1)/N), {neff}, {n}, {stake}, {tax}. **Bold** marks a new word the first time it appears.
 * A line break (\n) splits the words in two: the second part comes after a pause, or once the reader has acted.
 *
 * Drafts, from the story script (docs/story-spec.md), changed only where the owner changed the picture (four
 * squares, two watching; the guess in pictures): the wording is the owner's to make; it comes last.
 */
export const STORY = {
  acts: ['Two squares', 'Many squares', 'Photos', 'Tax and you'],
  beats: {
    // Act 1: two squares
    yard: 'This is a **yard**.',
    money: 'Here is some money.',
    split: 'We split it equally between four **squares**.',
    hi: 'Hi, squares!',
    fair: 'Two of them play a very fair game.\nThe other two watch.',
    bigger: 'The **area** is the money.',
    uneven: 'Say one has a little more than the other.',
    table: 'Each puts the same amount on the table.',
    stake: 'The amount is a share of what the poorer one has.\nWe call it the **stake**.',
    slider: 'You set that share with this slider.',
    try: 'Try it, then leave it at the mark.',
    coin: 'They flip a coin.',
    takes: 'The winner takes it all.',
    trade: 'That was one **trade**.',
    // Act 2: many squares
    guess: 'What happens if they keep trading?',
    see: "Let's see.",
    honest: 'The coin is fair,\nand nobody cheats.',
    invite: 'Now the other two jump in.',
    pairs: 'Each **round**, they pair up at random.',
    together: 'Every pair trades at the same time.',
    rounds: 'Round after round.',
    stand: 'Walking takes too long. From now on, they trade from where they stand.',
    keep: 'They keep trading.',
    photo: 'Stop. Time for a photo.',
    // Act 3: photos
    bars: 'Everyone becomes a bar of the same height.\nThe more money, the longer the bar.',
    stack: 'Now stack them, all touching the left wall.',
    line: 'Slide the line.\nThe number: how many have at least that much.',
    few: 'Most bars are short.\nA few are very long.',
    box: 'Back into the box.',
    still: 'All the money is still here.\nTrading only moves it around.',
    side: "Now let each square's side show its money, not its area.",
    edge: 'Side by side, they cover the bottom edge exactly.',
    pack: 'Pack them into the box.',
    neff: 'The box holds {neff} copies of this pile.\nThat is its **effective number** of squares.',
    lineup: 'Line them up, poorest at the bottom, richest on top.',
    tower: 'Squeeze them to one width; each keeps its height.',
    stairs: 'Pull them out into stairs.',
    curve: 'Through the corners: the **Lorenz curve**.',
    even: 'If everyone had the same, the stairs would follow this straight line.',
    triangle: 'Take the area under the straight line.',
    between: 'Now take the area between the two lines.',
    gini: 'The second over the first: the **Gini**, {gini}.\n0 when all are equal; {ginimax} when one has it all.',
    // Act 4: tax, the veil, and blocks
    again: 'Spread out again, and keep trading.',
    tax: "Let's add a **tax**.\nEach round, every square pays a share of its money into the **pot**.",
    taxslider: 'You set that share with this slider.',
    taxtry: 'Try it, then leave it at the mark.',
    pay: 'Here is one round of tax, slowly. Each square pays {tax} of its money.',
    pot: 'It all goes into one pot.',
    share: 'Then the pot is shared out equally.',
    back: 'Each square gets one share back.',
    going: 'Keep going.',
    four: 'Here are three yards, each with its own rules.',
    veil: 'You can choose the yard.\nNot which square you will be.',
    which: 'Which yard would you live in?',
    lottery: 'Your yard. Now chance picks who you are.',
    blocks: 'Everything you saw is written in a few blocks.',
    number: 'Change a number, and the yard changes.',
    open: 'More in Play.\nYour own rules in Build.',
  },
  /**
   * The guess in Act 2, asked in pictures (the two players as they might end up); these words are what a screen
   * reader says for each. No answer is wrong.
   */
  choices: {
    left: 'The one on the left gets much richer',
    right: 'The one on the right gets much richer',
    same: 'They stay about the same',
  },
  ui: {
    story: 'Learn',
    next: 'Next',
    back: 'Back',
    skip: 'Skip act',
    /** The reader's step done for them (owner, 2026-10-21: "Show me" was confusing). */
    showMe: 'Do it for me',
    play: 'Play',
    be: 'Be a square',
    /** For screen readers: where you are. */
    where: 'Beat {k} of {n}',
    acts: 'Acts',
    /** The keyboard's twin of the line you drag. */
    lineControl: 'The line',
    /** The wealth slider: its name, and what it reads (the left one's share · the right one's). */
    wealthControl: 'Their money',
    stake: 'Stake',
    tax: 'Tax',
    /** One of the three yards, by its place (1, 2, 3), as the panel names it when it is looked at. */
    yardName: 'Yard {k}',
    /** A yard's button, to a screen reader: what a reader sees in it (its rules stay hidden, as they are to the eye). */
    yardSays: 'Yard {k}: its squares hold {shares} of the money, richest first',
    round: 'Round',
    trades: 'Trades',
    /** The program as a few blocks (the Story's last act). */
    blocks: {
      program: 'The rules of this yard',
      start: 'when started',
      squares: 'squares',
      forever: 'forever',
      trade: 'trade, stake',
      tax: 'tax',
      shared: 'shared equally',
      less: 'less',
      more: 'more',
    },
    gini: 'Gini',
  },
} as const;

export type BeatKey = keyof typeof STORY.beats;
export type ChoiceKey = keyof typeof STORY.choices;
