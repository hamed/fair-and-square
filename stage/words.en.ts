/**
 * The stage's own words for readers, outside Learn (stage/story/words.en.ts) and the blocks (blocks/words/): the
 * tabs, the card over the square you are, and the Play panel. A translation swaps this file.
 */
export const WORDS = {
  /** The tabs, by id (owner, 2026-10-21: Learn · Play · Build · Finds · About; the ids are the code's). */
  tabs: { story: 'Learn', play: 'Play', rules: 'Build', finds: 'Finds', about: 'About' },
  /** A shared yard's corner, when its link says who built it. */
  credit: 'This yard was built by {by}',
  /** The card over the square you are (`be`): your rank (1 = the richest), of N, and your share of all the money. */
  you: '#{rank} of {n} · {share}',
  /** The panel's charts (stage/view/charts.ts): names, descriptions, axes, what hovering says. Drafts. */
  charts: {
    time: 'Over time',
    timeAbout: 'The Gini and the effective number, round by round. Click the round axis: log or linear.',
    turnoverAbout: 'How much of all the money the trades move each round (the tax not counted).',
    moved: 'moved each round',
    lorenz: 'Lorenz',
    lorenzAbout: 'Everyone in a row, poorest first: the share of the money held so far. The straight line: all equal.',
    ccdf: 'Who has at least',
    ccdfAbout: 'The share of people with at least each share of the money. Click an axis: log or linear.',
    histogram: 'How many have how much',
    histogramAbout: 'How many hold each amount, × the average.',
    round: 'round',
    gini: 'Gini',
    neff: 'Effective number',
    turnover: 'Turnover',
    people: 'people, poorest first',
    wealthShare: 'share of the money',
    share: 'share of all the money',
    atLeast: 'people with at least',
    average: 'money, × the average',
    poorestHalf: 'poorest half holds {p}',
    median: 'median {p}',
    top1: 'top 1% ≥ {p}',
    mean: 'mean {p}',
    zoomTip: 'double-click: bigger',
    unzoom: 'Smaller again',
    zoomed: 'filling the window',
  },
  panel: {
    /** One of Learn's three yards, looked at (clicked): what the panel says of it. Draft. */
    yard: '{name}, round {round}: the richest has {top} of the money, the poorest {bottom}.',
    /** A square's card (a tap on it, in Play): its own square of the panel. Drafts. */
    card: {
      rank: '#{rank} of {n}',
      share: '{share} of all the money, {x} × the average.',
      chart: 'its money (× the average), round by round',
      chartAxis: '× average',
      close: 'Close',
      /** Another square's card: the next richer, or the next poorer. */
      richer: 'Richer',
      poorer: 'Poorer',
      feels: 'Feels {mood}.',
      moods: { glad: 'glad', excited: 'excited', calm: 'calm', tense: 'tense', low: 'low' },
      talent: 'Talent {t}',
      thrift: 'keeps {p} out of play',
      /** The card's own Share: this square, with the yard's link (what it says: `said` below). */
      send: 'Share',
      sendTip: 'copy this square and its yard',
      richest: 'The richest square here. It says it was merit.',
      poorest: 'The poorest square here. Same coin, same rules.',
      middle: 'Same coin, same rules as everyone else.',
    },
    play: 'Play',
    pause: 'Pause',
    step: 'One round',
    restart: 'Start again',
    stake: 'Stake',
    tax: 'Tax',
    newLuck: 'New luck',
    /** Tooltips: a few words under the name (owner, 2026-10-22: short, more lines if need be). Drafts. */
    playTip: 'key: Space',
    newLuckTip: 'new dice, all equal again',
    restartTip: 'same dice, from round 0',
    speed: 'Speed',
    /** The speed's value: rounds a second. */
    perSecond: '{k}/s',
    squares: 'Squares',
    /** The Squares slider, said: how many (and the square they make). */
    squaresSaid: '{n} squares, {k} by {k}',
    squaresCount: '{n} squares',
    wander: 'Wander',
    box: 'In the box',
    lineUp: 'Line up',
    arrangeTip: 'press again: stand',
    /** Faster and slower (icons): their names and what they do. Drafts. */
    fast: 'Fast forward',
    fastTip: '100 rounds a second\npress again: your pace',
    slower: 'Slower',
    slowerTip: 'half the speed',
    /** How much is shown moving: its name and its three choices. Drafts. */
    level: 'Animation',
    levels: { coins: 'Coins', pieces: 'Pieces', off: 'Off' },
    levelTips: {
      coins: 'a coin decides each trade',
      pieces: 'each trade flies',
      off: 'all at once',
    },
    levelNext: 'press: {next}',
    /** Turnover (Play's chart): how much of all the money changes hands each round. Drafts. */
    turnover: 'Turnover: how much of all the money changes hands each round',
    turnoverAxis: 'moved, %',
    /** Learn's three charts, in the room (owner, 2026-10-22). Drafts. */
    ccdf: 'CCDF',
    ccdfTip: 'bars and a line to drag\npress again: stand',
    neff: 'Effective number',
    neffTip: 'copies of the pile\npress again: stand',
    lorenz: 'Lorenz',
    lorenzTip: 'stairs and the Gini\npress again: stand',
    be: 'Be born',
    beTip: 'you, at random',
    /** Said to a screen reader when Be a square has picked you (the yard shows it on your card). */
    youSay: 'You are square number {rank} of {n}, with {share} of all the money.',
    share: 'Share',
    shareTip: 'copy this yard,\nwith a line on what it shows',
    /**
     * What a shared yard says, ahead of its link (docs/brand.md: the find goes with the link, in the sharer's own
     * numbers; nothing invented). {rounds}, {top}: the richest's share; {rank} of {n}, {share}: one square's. Drafts.
     */
    said: {
      start: 'Same coin, same rules, nobody cheats. Everyone starts equal. Watch where the money goes.',
      yard: 'Same coin, same rules, nobody cheats. After {rounds}, the richest square has {top} of the money.',
      square: 'Same coin, same rules, nobody cheats. After {rounds}, square #{rank} of {n} has {share} of the money.',
      you: 'Same coin, same rules, nobody cheats. After {rounds}, I am square #{rank} of {n}, with {share} of the money.',
      rounds: '{k} rounds',
      round: '1 round',
      tag: '#FairAndSquare',
    },
    embed: 'Embed',
    embedTip: 'copy code for a web page',
    copied: 'Copied',
    /** The embed's frame title, for screen readers. */
    frameTitle: 'Fair and Square',
  },
} as const;
