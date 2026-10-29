/**
 * The stage's own words for readers, outside Learn (stage/story/words.en.ts) and the blocks (blocks/words/): the
 * tabs, the card over the square you are, and the Play panel. A translation swaps this file.
 */
export const WORDS = {
  /** The tabs, by id (owner, 2026-10-21: Learn · Play · Build · Finds · About; the ids are the code's). */
  tabs: { story: 'Learn', play: 'Play', rules: 'Build', finds: 'Finds', about: 'About' },
  /** A shared yard's corner, when its link says who built it. */
  credit: 'This yard was built by {by}',
  /**
   * Over a yard opened from a shared link (review 2026-10-29: a link opened onto a still yard and a panel, nothing
   * said): its line (panel.said, without the tag), its history played again from round 0, and the ways on. Drafts.
   */
  shared: {
    label: 'A shared yard',
    replay: 'Watch it again',
    learn: 'How? Learn ›',
    close: 'Close',
  },
  /** The card over the square you are (`be`): your rank (1 = the richest), of N, and your share of all the money. */
  you: '#{rank} of {n} · {share}',
  /** The panel's charts: compact visible labels, technical definitions in tooltips, and hover readouts. */
  charts: {
    giniTime: 'Inequality',
    neffTime: 'Effective participants',
    giniAbout: 'Gini coefficient over rounds: relative wealth inequality, from 0 for equal wealth toward 1 as nonnegative wealth concentrates. Click Round to switch between linear and log scales.',
    neffAbout: 'Effective number of participants (N_eff): total wealth squared divided by the sum of squared individual wealth. The equivalent number with equal wealth. Click Round to switch between linear and log scales.',
    turnoverAbout: 'Trading turnover: money transferred by trades per round, as a percentage of all money. Tax is excluded; sampled intervals show the average per round. Click Round to switch between linear and log scales.',
    moved: 'Money / round',
    lorenz: 'Money shares',
    lorenzAbout: 'Lorenz curve: the cumulative percentage of participants, poorest first, against their cumulative percentage of participant-held money, excluding the pot. The diagonal represents equality.',
    ccdf: 'At least this much',
    ccdfAbout: 'Complementary cumulative distribution (CCDF): the percentage of all participants holding at least the given share of all money. Click either axis to switch between linear and log scales.',
    histogram: 'Distribution',
    histogramAbout: 'Wealth histogram: the number of people in each money range. The average unit is all money, including the pot, divided by the number of participants. Bar heights are counts, not percentages.',
    round: 'Round',
    gini: 'Gini',
    turnover: 'Trading',
    people: 'Share of people',
    peopleCount: 'People',
    wealthShare: 'Share of money',
    share: 'Money share',
    atLeast: 'People',
    average: 'Money (× average)',
    poorestHalf: 'poorest half holds {p}',
    median: 'median {p}',
    top1: 'top 1% ≥ {p}',
    mean: 'mean {p}',
    zoomTip: 'double-click: bigger',
    unzoom: 'Smaller again',
    zoomed: 'filling the window',
  },
  panel: {
    controlsTitle: 'Controls',
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
    shareTip: 'preview and copy a link to this yard',
    /**
     * What a shared yard says, ahead of its link (docs/brand.md: the find goes with the link, in the sharer's own
     * numbers; nothing invented). {rounds}, {top}: the richest's share; {rank} of {n}, {share}: one square's. Drafts.
     */
    said: {
      start: 'Same coin, same rules, nobody cheats. Everyone starts equal. Watch where the money goes.',
      // with a yardstick (review 2026-10-29: "21%" alone said nothing): {times}, the richest's share over an equal
      // share; {equal}, an equal share (1/n)
      yard: 'Same coin, same rules, nobody cheats. After {rounds}, the richest of {n} squares has {top} of the money: {times} times an equal share.',
      square: 'Same coin, same rules, nobody cheats. After {rounds}, square #{rank} of {n} has {share} of the money; an equal share is {equal}.',
      you: 'Same coin, same rules, nobody cheats. After {rounds}, I am square #{rank} of {n}, with {share} of the money; an equal share is {equal}.',
      rounds: '{k} rounds',
      round: '1 round',
      tag: '#FairAndSquare',
    },
    embed: 'Embed',
    embedTip: 'preview and copy code for a web page',
    copied: 'Copied',
    /** The embed's frame title, for screen readers. */
    frameTitle: 'Fair and Square',
  },
  shareDialog: {
    close: 'Close',
    preview: 'Preview of the shared simulation',
    playback: 'Playback',
    live: 'Live',
    frozen: 'Frozen',
    playbackHint: 'Live continues trading; frozen starts paused.',
    link: 'Link',
    code: 'Embed code',
    copy: 'Copy',
    copied: 'Copied ✓',
    failed: 'Could not copy. Select the text and copy it.',
    support: 'Buy me a coffee',
  },
} as const;
