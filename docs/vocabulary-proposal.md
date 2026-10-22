# Blocks vocabulary — proposal (2026-10-19)

Status: **decided 2026-10-19, being built** (decisions at the end). Hamed asked (2026-10-19): the naming and categories are not good, some overlap,
15 categories is too many, arranging is not only camera (a lattice also says who pairs), distributions overlap
the start, some names are not intuitive. Open: **"room" or "yard"** (see below), and the three questions at the
end.

## What is wrong now

| Problem | Where it comes from |
| --- | --- |
| 15 categories | Each kind of option got its own: Pairing, Coin, Stake, Tax, Give, Start, Distributions, Groups, Values, Operators… |
| Start vs Distributions | A start is "equal" or a distribution; the allocations (two classes, one oligarch, the US) live apart in Start. |
| Arrange is not only camera | The model already has space (a torus grid: `pair.near`, `move` use it); the stage's lattice ignores it, so local trade does not look local. |
| Names | "a draw from", "call … “name”", "watch … as", "flip by strength …, the poorer +", Values vs Operators, Camera. |

## Seven categories

| Category | Holds |
| --- | --- |
| **Run** | when started, forever, repeat, every, until, pause; the panel's slider, button, wait for a button |
| **Yard** | how many squares, where they live, their start, talent, thrift, debt, naming a group |
| **Trade** | the trade block and its options, under headings: Pair up · Flip · Pay |
| **Tax & growth** | the tax block and its options (Take · Give back); grow; move |
| **Who** | groups: everyone, the richest / poorest q, at random, those where …, and / or / but not, a named group |
| **Numbers** | numbers and %, my / the poorer's …, N, round; + − × ÷ and functions; comparisons; random draws; distributions; the stats block |
| **Show** | arrange, shape, size, colour, outline, zoom, hold, how trades and taxes show; panel numbers, plots, print |

Headings inside a category (Blockly flyout labels) keep options findable without categories of their own.

## Space is the model's

The squares block says where they live:

    100 squares in [a room | a square lattice], each starting with [ … ]

- **In a room** (or "in a yard": open, below): anyone can meet anyone.
- **On a square lattice**: each square has a cell. "Neighbours within r" pairs only near squares (it requires the
  lattice); "move" steps to a free cell.
- Show's "where" gains **in their places**: drawn where the model puts them, so local pairing visibly pairs
  neighbours. In a row, in a stack, packed together stay picture-only, with the sort.

## Start = a distribution

The start slot takes a distribution, nothing else; the allocations become distributions too:

| Option | Reads |
| --- | --- |
| everyone the same | all 1 |
| uniform, normal, exponential, lognormal, power law | as now |
| two classes | the top 10 % hold 50 % |
| one oligarch | one holds 50 % |
| a real country | like the US (2026) |
| kept in a range | (was "clip") |

The Start category goes; distributions live in Numbers.

## Plainer names (drafts: wording is Hamed's)

| Now | Proposed |
| --- | --- |
| yard of 100 squares, start equal | 100 squares in a room, each starting with all 1 |
| pair up random pairs among everyone | pair up at random among everyone |
| flip by strength s, the poorer +b | the stronger more likely: strength [my talent], underdog bonus [0 %] |
| pay 10 % of the poorer's | the loser pays 10 % of the poorer's wealth |
| a draw from uniform 0 … 1 | a random number from uniform 0 … 1 |
| call [group] “rich” | name [the richest 10 %] “rich” |
| watch [x] as “Gini” | show [x] on the panel as “Gini” |
| log [x] as “round” | print [x] to the console as “round” |
| ring [group] | outline [group] |
| follow [group] | zoom in on [group] |
| Camera / Panel / Values / Operators | Show / Run / Numbers |

Block ids follow (`cam.*` → `show.*`, …). The vocabulary is unpublished: nothing breaks, and every library
model's results stay the same (golden hashes).

## Open

- **"Room" or "yard"** for the open space (Hamed, 2026-10-19: not sure). The page already calls the whole
  picture the yard; "a room" avoids saying "100 squares in a yard in the yard".
- Seven categories, or fewer (Tax & growth into Trade as one "Economy")?
- On a lattice, does "in their places" also decide who can pair (neighbours only)? Recommended: yes.
- Every label above is a draft.

## Decisions (Hamed, 2026-10-19)

- **Six categories**: Run · Yard · Economy (trade, tax, grow, move together) · Who · Numbers · Show. Inside each,
  headings (sections) keep slots apart; a section also sets its blocks' colour.
- **The yard** is the box the squares are in: "100 squares in a yard" is right; inside it they stand anywhere or
  on a square lattice.
- **On a lattice, neighbours trade**: the lattice is the model's, not just a picture.
- **Wording**: the drafts for now; Hamed changes words later (blocks/words/blocks.en.ts).
- Built in steps: (1) categories, headings, `show.*` ids, draft labels; (2) the start is a distribution;
  (3) space in the model.
