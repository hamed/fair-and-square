/**
 * English words for the blocks, one entry per block in palette order (category, then heading): its label (inputs
 * and fields in braces), its dropdowns' words, and a one-sentence tip (formulas on option cards only). Draft
 * wording: it comes last, and it is Hamed's. Ids are the catalogue's; a translation replaces this file, never the
 * ids. Show blocks get their badge from the category (define.ts), not from their tips.
 */

interface BlockWords {
  readonly label: string;
  readonly fields?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly tip: string;
}

const PROPS = { wealth: 'wealth', inplay: 'wealth in play', rank: 'rank', talent: 'talent', thrift: 'saving', gain: 'gain this round' };

export const BLOCKS: Readonly<Record<string, BlockWords>> = {
  // ——— Run: when and how often ———
  'ctl.start': { label: 'when started', tip: 'Runs once at the start: the setup, then the loops.' },
  'ctl.forever': { label: 'forever', tip: 'Runs its blocks again and again; one pass is one round.' },
  'ctl.repeat': { label: 'repeat {n} times', tip: 'Runs its blocks n times.' },
  'ctl.until': { label: 'repeat until {c}', tip: 'Runs its blocks until the condition holds.' },
  'ctl.every': { label: 'every {k} rounds', tip: 'Runs its blocks on every k-th round.' },
  'ctl.pause': { label: 'pause', tip: 'Play stops here; Play or Step goes on.' },
  // Run: panel sliders and buttons
  'panel.slider': { label: '{name} slider: {start} in {min} … {max}', tip: 'A slider on the panel; moving it never restarts the run.' },
  'panel.button': { label: 'when {name} is pressed', tip: 'A button on the panel; its blocks run once each time it is pressed.' },
  'panel.wait': { label: 'wait until {name} is pressed', tip: 'The run waits here for the button.' },

  // ——— Yard ———
  'setup.yard': {
    label: '{n} squares {space}',
    fields: { space: { free: 'standing anywhere', lattice: 'on a square grid' } },
    tip: 'The yard: how many squares (2 to 2,000), and where they live; on a lattice only neighbours meet.',
  },
  'setup.start': { label: 'starting wealth: {with}', tip: 'Everyone’s first wealth (a distribution from Random, or an allocation below), rescaled to a mean of 1; without it, everyone starts the same.' },
  debt: { label: 'debt limit: {d}', tip: 'Squares may owe up to d, in units of mean wealth.' },
  'group.define': { label: 'name {group} “{name}”', tip: 'Gives a group a name, to use further down.' },
  // Yard: allocations
  'alloc.classes': { label: 'two classes: the top {q} hold {s}', tip: 'The top q of the squares share s of all wealth; the rest share the remainder.' },
  'alloc.oligarch': { label: 'one oligarch holding {s}', tip: 'One square holds s; everyone else shares the rest.' },
  'alloc.country': { label: 'like {country}', fields: { country: { us: 'the US (2026)' } }, tip: 'The country’s published wealth shares by group, equal within each group.' },
  // Yard: each square
  'traits.talent': { label: 'talent from {d}', tip: 'Each square’s talent, kept in 0 … 1; seen only when the squares are coloured by it.' },
  'traits.thrift': { label: 'saving: {d}', tip: 'Each square’s saving propensity: the fraction of its wealth kept out of trades.' },

  // ——— Trade ———
  trade: { label: 'trade', tip: 'Each round: pair up, flip, and the loser pays; show and panel blocks may sit between the steps.' },
  'trade.pair': { label: 'pair up {pair}', tip: 'Who trades with whom.' },
  'trade.flip': { label: 'flip {coin}', tip: 'Who wins: the poorer and the richer are known here, the winner not yet.' },
  'trade.pay': { label: 'loser pays\n{stake}', tip: 'How much the loser pays the winner.' },
  // Trade: pair up
  'pair.match': { label: 'at random among {within}', tip: 'Random pairs; anyone left over, or outside the group, sits the round out.' },
  'pair.draw': { label: 'random pairs, repeats allowed', tip: 'N/2 pairs drawn independently, one after another.' },
  'pair.near': { label: 'neighbours within {r}', tip: 'Random pairs at most r cells apart on the lattice.' },
  'pair.similar': { label: 'within {k} wealth ranks', tip: 'Random pairs at most k places apart in wealth.' },
  // Trade: flip
  'coin.fair': { label: 'a fair coin', tip: 'Heads or tails: each of the two wins half the time.' },
  'coin.strength': {
    label: 'strength {s}, poorer bias {b}',
    tip: 'Higher strength favours winning; positive bias b favours the poorer, negative b the richer; with strength 0, b = 5 % gives the poorer a 55 % chance. p(poorer wins) = ½ (1 + tanh(s_poorer − s_richer + artanh 2b)).',
  },
  // Trade: pay
  'stake.share': {
    label: '{beta} of the {of} wealth in play',
    fields: { of: { poorer: 'poorer’s', loser: 'loser’s' } },
    tip: 'A share of the poorer’s wealth in play (yard sale), or of the loser’s own (theft and fraud).',
  },
  'stake.fixed': { label: 'a fixed {a}', tip: 'The same amount every trade, at most what the loser has in play.' },
  'stake.split': { label: 'split the pool at random', tip: 'Both put in what they have in play and one takes a uniform share; the flip is ignored.' },
  // ——— Tax & growth ———
  tax: { label: 'tax', tip: 'Each round: take into the pot, then give it back.' },
  'tax.take': { label: 'take {tau}', tip: 'What each square pays into the pot.' },
  'tax.give': { label: 'give {r}', tip: 'Redistribution: who gets the pot, and how it is shared.' },
  // Tax & growth: take
  'take.wealth': { label: '{rate} of wealth from {from}', tip: 'τ = rate × (w + D).' },
  'take.above': { label: '{rate} of wealth above {x} from {from}', tip: 'τ = rate × max(w − x, 0).' },
  'take.gains': { label: '{rate} of this round’s gains from {from}', tip: 'τ = rate × max(gain, 0).' },
  'take.flat': { label: '{a} each from {from}', tip: 'τ = a, at most what each has.' },
  // Tax & growth: give back
  'give.to': { label: '{how} to {to}', fields: { how: { equally: 'equally', wealth: 'by wealth' } }, tip: 'The pot, shared equally or in proportion to wealth.' },
  'give.keep': { label: 'to nobody (keep in pot)', tip: 'Keeps collected wealth in the pot.' },
  // Tax & growth: grow and move
  grow: { label: 'grow: μ {mu}, σ {sigma}', tip: 'μ is the drift and σ the volatility (random fluctuation strength) in multiplicative wealth growth: w × e^(μ − σ²/2 + σξ), where ξ is standard normal.' },
  move: { label: 'move with chance {v}', tip: 'Each square steps to a free neighbouring cell with this chance.' },

  // ——— Who ———
  'group.all': { label: 'everyone', tip: 'Every square.' },
  'group.richest': { label: 'the richest {q}', tip: 'The richest q of the squares this round, at least one.' },
  'group.poorest': { label: 'the poorest {q}', tip: 'The poorest q of the squares this round, at least one.' },
  'group.random': { label: '{q} at random', tip: 'A share q of the squares, drawn anew each time.' },
  'group.one': { label: 'one at random', tip: 'One square, drawn anew each time.' },
  'group.where': { label: 'those where {c}', tip: 'The squares for which the condition holds; it reads “my”.' },
  'group.combine': {
    label: '{a} {op} {b}',
    fields: { op: { and: 'and also in', or: 'or in', butnot: 'but not in' } },
    tip: 'Both groups, either, or the first without the second.',
  },
  'group.named': { label: '“{name}”', tip: 'A group by its name, given with “name … ” in Yard.' },

  // ——— Numbers: values ———
  num: { label: '{v}', tip: 'A number.' },
  pct: { label: '{v} %', tip: 'A share, in percent.' },
  'val.prop': {
    label: '{who} {prop}',
    fields: { prop: PROPS, who: { me: 'my', poorer: 'the poorer’s', richer: 'the richer’s', winner: 'the winner’s', loser: 'the loser’s' } },
    tip: 'Wealth is in units of mean wealth; rank 0 is the poorest, 1 the richest.',
  },
  'val.global': { label: '{name}', fields: { name: { n: 'N', round: 'round', total: 'total wealth', pot: 'pot' } }, tip: 'A number about the whole yard.' },
  // Numbers: arithmetic and comparisons
  'op.arith': { label: '{a} {op} {b}', fields: { op: { add: '+', sub: '−', mul: '×', div: '÷' } }, tip: 'Arithmetic.' },
  'op.fn': { label: '{fn} {a}', fields: { fn: { abs: 'abs', log: 'log', exp: 'exp', sqrt: 'sqrt' } }, tip: 'A function of one number.' },
  'op.fn2': { label: '{fn} of {a} and {b}', fields: { fn: { min: 'min', max: 'max', power: '^' } }, tip: 'The smaller, the larger, or a to the power b.' },
  'op.clamp': { label: 'clamp {x} to {lo} … {hi}', tip: 'The number, kept between lo and hi.' },
  'op.if': { label: 'if {c} then {a} else {b}', tip: 'One number or the other.' },
  'op.cmp': { label: '{a} {op} {b}', fields: { op: { lt: '<', le: '≤', eq: '=', ge: '≥', gt: '>' } }, tip: 'A comparison.' },
  'op.logic': { label: '{a} {op} {b}', fields: { op: { and: 'and', or: 'or' } }, tip: 'Both, or either.' },
  'op.not': { label: 'not {a}', tip: 'The opposite.' },
  // Numbers: measures
  'stat.of': {
    label: '{stat} of {prop} over {over}',
    fields: {
      stat: {
        gini: 'Gini',
        neff: 'effective N',
        share: 'share',
        fraction: 'fraction of squares',
        palma: 'Palma ratio',
        rankcorr: 'Spearman ρ',
        mean: 'mean',
        median: 'median',
        min: 'min',
        max: 'max',
      },
      prop: PROPS,
    },
    tip: 'A statistic for the selected group, as the step began; Spearman ρ compares the selected property’s ranks with wealth ranks.',
  },
  // ——— Random ———
  'op.sample': { label: 'a random number from {d}', tip: 'Each square (or pair) draws its own, fresh each round.' },
  // Random: distributions
  'dist.same': { label: 'the same {v}', tip: 'Everyone the same.' },
  'dist.uniform': { label: 'uniform {lo} … {hi}', tip: 'Equally likely anywhere between lo and hi.' },
  'dist.normal': { label: 'normal: μ {m}, σ {s}', tip: 'μ is the mean and σ the standard deviation of a normal distribution, not bounds on its values.' },
  'dist.exponential': { label: 'exponential: μ {mean}', tip: 'μ is the mean, not the rate, of the exponential distribution: −μ · ln(1 − u).' },
  'dist.lognormal': { label: 'lognormal: σ {sigma}', tip: 'σ is the standard deviation of the natural logarithm of the values: e^(σz), with z standard normal and median 1.' },
  'dist.pareto': { label: 'Pareto: α {alpha}', tip: 'α is the Pareto index: (1 − u)^(−1/α), with minimum 1; smaller α gives a heavier tail.' },
  'dist.clip': { label: '{d} kept in {lo} … {hi}', tip: 'Draws kept between lo and hi.' },

  // ——— Show: the picture ———
  'show.arrange': {
    label: 'arrange {layout}, {sort}',
    fields: {
      layout: { places: 'in their places', still: 'standing still', row: 'in a row', stack: 'in a stack', pack: 'packed together' },
      sort: { id: 'ID order', asc: 'poorest first', desc: 'richest first', shuffle: 'shuffled' },
    },
    tip: 'Where the squares stand, and in what order.',
  },
  'show.shape': { label: 'draw as {shape}', fields: { shape: { square: 'squares', bar: 'bars', col: 'columns', tri: 'triangles', hex: 'hexagons' } }, tip: 'The shape each square is drawn as.' },
  'show.size': {
    label: 'size: {scale}',
    fields: { scale: { wealth: 'area ∝ wealth', side: 'side ∝ wealth', log: 'side: log scale', logarea: 'area: log scale', equal: 'equal size' } },
    tip: '∝ means proportional to: twice the wealth gives twice the area, or twice the side length (four times the area for squares); log scale applies a shifted, normalised logarithm of wealth to the side length or area, keeping sizes positive and compressing wealth differences; equal size ignores wealth.',
  },
  'show.colour': {
    label: 'colour: {by}',
    fields: { by: { none: 'own colours', wealth: 'wealth', rank: 'rank', talent: 'talent', thrift: 'saving', gain: 'last gain' } },
    tip: 'Pale to dark by a property; talent shows only this way.',
  },
  'show.outline': { label: 'outline {who}', tip: 'Outlines a group, as it is when this block runs.' },
  // Show: the camera
  'show.hold': { label: 'hold the view {seconds} s', tip: 'The view holds still; play waits.' },
  'show.zoom': { label: 'focus on {who}', tip: 'Frames a group; everyone is the whole yard.' },
  'show.when': { label: 'when {c}', tip: 'Runs its show blocks each time the condition turns true.' },
  // Show: trades and taxes, shown
  'show.trades': { label: 'show trades {as}', fields: { as: { place: 'in place', meet: 'with partners meeting', instant: 'at once' } }, tip: 'How the yard shows a trade.' },
  'show.tax': { label: 'show the tax {as}', fields: { as: { pot: 'through the pot', instant: 'at once' } }, tip: 'How the yard shows a tax.' },
  // Show: panel numbers, plots, print
  'panel.number': { label: 'panel “{name}”: {value}', tip: 'A live number on the panel.' },
  'panel.plot': { label: 'plot {kind}', fields: { kind: { gini: 'Gini over rounds', lorenz: 'Lorenz curve', ccdf: 'how many have at least', histogram: 'histogram' } }, tip: 'A live plot on the panel.' },
  'panel.print': { label: 'print {value} as “{name}”', tip: 'Prints the value to the console each time it runs.' },
};

/** Connecting words for blocks whose sentence changes with their selected operation. */
export const CONNECTORS = { of: 'of', and: 'and', over: 'over', in: 'in' };

export const CATEGORY_NAMES: Readonly<Record<string, string>> = {
  run: 'Run',
  yard: 'Yard',
  trade: 'Trade',
  tax: 'Tax & growth',
  who: 'Who',
  numbers: 'Numbers',
  random: 'Random',
  show: 'Show',
};

/** The headings inside a category. */
export const SECTION_NAMES: Readonly<Record<string, string>> = {
  flow: 'When and how often',
  inputs: 'Panel: sliders and buttons',
  yard: 'The yard',
  alloc: 'Allocations: a start for everyone at once',
  traits: 'Each square',
  trade: 'Trade',
  pair: 'Pair up',
  coin: 'Flip',
  stake: 'Pay',
  taxes: 'Tax',
  take: 'Take',
  give: 'Give back',
  growth: 'Grow and move',
  who: 'Groups of squares',
  values: 'Values',
  operators: 'Arithmetic and comparisons',
  stats: 'Measures',
  random: 'A random number',
  dist: 'Distributions',
  picture: 'The picture',
  camera: 'The camera',
  moves: 'Trades and taxes, shown',
  outputs: 'Panel: numbers, plots, print',
};

/** The badge a Show block's tip starts with: it looks, it never changes the economy. */
export const SHOW_BADGE = 'Show · looks only:';
