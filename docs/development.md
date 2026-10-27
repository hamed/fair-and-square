# Fair and Square — developer notes

The minimal core of the *Fair and Square* redesign: the Yard-Sale model as a
stage. People are shapes whose area is their wealth (total 1), with the
essay's faces; charts are poses of the same bodies; every trade, levy and
count is shown as arithmetic on areas. Headless and deterministic underneath,
with a dev console on top. The economy is a program run by the model's engine
(`model/`, below); the essay's face engine is copied in (`stage/essay/`, see
its README).

## The stage

`npm run dev`, then open the page Vite prints. A walled 2 × 2 yard, the dashed
1 × 1 reference box in its middle (area 1 = all the wealth there is; charts
form in it), N people as shapes whose
area is their wealth, with the essay's faces, and a dev console, closed at first
(`` ` `` or ›_ toggles it, `/` focuses it, `?console=1` opens it on load; space plays/pauses trading). Nothing is
labelled; charts are poses of the same bodies. It opens calm: everyone spread
across the yard, standing, trading paused. `run tour` plays the tutorial
script; `demo` shows every important function in about two minutes (the
room, pairs and the toss, a tax and its pot, a one-off levy, the piece
style, 200 people, the charts, zoom, stats and a share link). `until done`
waits for the pose and for any trade or levy still playing. In landscape the yard keeps a square the height of the window; beside it the
panel starts at the yard's top, and the console, when open, takes the rest. In portrait (a phone) the yard is at the
top, exactly as tall as it needs at the page's width (the view's `natural`), and everything else is under it,
starting right below it (owner, 2026-10-21). `help` lays itself
out to the console's width.

**The opening.** A fresh visit opens with the logo: "fair&" over the
reference box, cut into 16 squares (one person with 9/16 of the wealth, the
rest a fractal tail of 7 + 5 + 3 + 1 squares), faces and all. It holds in the
middle, alive (blinks, moods and gazes drifting a little), until the player
starts: a click, a tap, Space or Enter. Then the camera pulls
back to the yard, "fair &" shrinks to a title outside the yard's top-left
corner and a square drops in after it, in place of the word "square" (the
lockup `fair&Q`, owner 2026-10-21: no space; Q one of the game's squares, live,
as tall as the serif's capitals, on the baseline; its eyes follow the pointer,
its face the yard's Gini, smiling to uneasy to sad; a click cheers it;
`stage/view/lockup.ts` LOCKUP_STYLES, the sheet in `prototypes/lockup/`;
"Fair and Square" in words for everyone else, English in every language). Then the big one gives back until the 16 hold
equal shares, folded 4 × 4 into the box with no gaps. That is the stage's
`fold` pose, and the game goes on from there with its faces. Once it is
unfolding, another click or key skips to the end; Escape or a command goes
straight to the stage. Links, embeds and `?opening=0` go straight to the stage
(36 people, standing); `?opening=7.5` starts it 7.5 s in.
Beside the logo, a menu of four buttons on the logo's grid, one to each row of
small boxes on the right (the column's three, then the corner's block), a
gutter out: as tall as a small box, two and a gutter wide, framed with the
squares' outline. In each, "Play", "Rules", "Story" or "Finds" (about half the
box's height, as large as the widest word allows, the same margin left, above
and below) and a cue at the right end: a play triangle for Play, a chevron for
the rest. The ones that work are in the essay's dark brown (#4d271c, its
chapter index's colour); the rest, which have nowhere to go yet, in the
lighter ink. As the logo unfolds the buttons glide, each a scaled copy of
itself, to the line above the yard, where About joins them: the title alone
on the left; on the right, Learn, Play, Build, Finds, About, then the name
(owner, 2026-10-21; their words in `stage/words.en.ts`; in the code Learn is
still `story` and Build `rules`). Two faces (owner, 2026-10-21): character in
the logo's Gelasio (the wordmark, the tabs, the name); everything people read
in Vazirmatn (`stage/fonts`, OFL): Learn's words, the panel, Build, labels and
numbers, the About page's prose.
There they are tabs: standing on the yard's wall, which is their bottom edge
(their own bottom line fades as they arrive); the one you are in (Play, Story,
or Rules while its drawer is open) opens into the yard, the wall cut beneath it.
There Play plays and pauses the trading (its cue turns to a pause, its name
to "Pause"; from the Story it goes back to Play), Rules opens and closes the
Rules drawer (below), Story starts the story (below; beside the held logo it
unfolds first) and About opens the about page in a new window. The tab you are
in opens into the yard. Finds is still to come. The line never gets smaller than
readable (title 18 px, name 13 px) and pressable (24 px tabs); where one line
does not fit (a phone) the tabs have the wall to themselves and the title and
name stand above them, or each takes a line; where the yard is narrower than
that (a short canvas, a tall figure), the line takes the width it needs,
centred over the yard within the canvas, the tabs drawn as boxes off the
wall's length. It keeps below the console's toggle where that lies over the
canvas (portrait). The camera keeps room for the line, and a chart that
fills the screen is framed below it, the line staying where it was. Space or
Enter on a focused button presses that button; on the page they start the
held logo, or skip once it unfolds. If the lettering fails to load (or takes
over 4 s) the stage opens without the opening.
The byline, "Hamed Seyed-Allaei", spans the box under the logo (the H's outer
foot on its left edge, the last i's on its right, as "fair&" spans it above;
half a gutter below, as "fair" stands half a gutter above) and then sits on
the title's line, its last foot on the yard's top-right corner; it links to
`about.html` (an invisible link laid over the drawn name).
(`stage/view/opening.ts`, the geometry and lettering in `stage/view/logo.ts`,
fonts in `stage/fonts`, OFL. The tab's icon is a normal face, black on white:
`stage/view/favicon.ts`. The prototype and its sheet are in `prototypes/logo`.)

**The story.** The Story tab teaches the yard in 53 beats and four acts (two
squares; many squares; photos; tax and you), from `docs/story-spec.md`. One
beat is one subtitle and the console lines that animate it: `stage/story/beats.ts`
says what each beat does, `stage/story/words.en.ts` what it says (drafts; a
translation swaps that file), and the runner (`stage/story/runner.ts`,
headless) plays them at the reader's pace. The Story looks as much
like Play as it can (`stage/story/strip.ts`). Over the yard's top, the words,
large and centred, and the guess (three pictures: the left one bigger, the
same, the right one bigger, each on its player's side); nothing else on the
yard. Everything else is in the panel, where it is in Play: in place of its run
controls, the Story's way about (Back, the four acts numbered with their
progress and the beat's act·beat number, Do it for me when offered, Next); then the panel's own controls as the
story reveals them, each staying once shown (the stake, glowing, a notch where
to set it; the Gini's number and plot; the tax; Play and Be a square), until
the last beat shows the whole panel, as Play has it; last, the beat's own
controls (the line's twin; the program in the Rules drawer's own blocks,
stripped to its core: the panel's blocks left out, each slider shown as the
number it holds, no watched numbers or plots, nothing to drag; a number that
was a slider moves it, any other change is a new program from round 0, the
panel's blocks put back; while it shows, the panel's sliders and charts step
aside). The controls are square, as everything in the game is (square thumbs
on flat tracks, square buttons and frames), lettered in the title's Gelasio,
each control its word (owner, 2026-10-21: no icons for now; icons alone were
not clear to everyone), what it does on hover. The
program's blocks show at a readable size in a window as big as they are,
nothing to scroll. The room keeps its
squares under the words (the session's `band`); charts stay in the box.
A block's label may break its row (a new line in the
label: `input_end_row`), as "the loser pays" does above its stake.

A square tapped in Play (or the one Be a square makes you) has a card, a square
of the panel edged in its colour: its rank and share of all the money (the pot's
included, a debt negative), its money × the average round by round, how it feels
(its face, in a word), its traits when the program gives them, one line; Richer
and Poorer step to the next card, Close or a tap on the empty yard lets it go.
It keeps up on its own; the panel's series begin again with each experiment
(Start again, New luck, a new crowd or program: `Session.experiment`).

Play's arrangements: Wander, In the box, Line up (by side = money, so the row is
the box's width), and Learn's three charts in the room: CCDF (bars, the line to
drag; its trades shown, each slice off the loser's right end onto the winner's),
Effective number (the photo) and Lorenz (the stairs, the even line, the Gini's
bars). Another arrangement while trading lands what flies and waits for everyone
to be in place. Play's panel adds Turnover: how much of all the money trades move
each round (gifts and the tax never count; `Session.traded`). The yard keeps its
size: outside a chart the camera frames the walls, never a square past them.
Learn's coin flips stay in Learn.

Controls wear icons where an icon is clear (owner, 2026-10-22; stage/view/icons.ts, the game's square line): play
and pause, fast forward (a hundred rounds a second, again: the pace you had), one round, start again, new luck,
share, embed, Learn's arrows, and the arrangements drawn as the squares stand; each says its word on hover and to
screen readers. Words stay where no icon is clear (Be a square, the sliders). One more icon button sets how much is
shown moving: coins (partners meet, a coin decides), pieces, or nothing; kept through a new yard. In landscape the
panel's squares run from the yard's top wall to its bottom wall (`alignedTo`: the rows' gap stretches when the
width limits the squares). prototypes/icons shows every icon at size.

The charts (stage/view/charts.ts) are drawn as the essay's sandbox draws them: an SVG square whose plot is an
exact square, its ticks, axis titles and name outside it. Over time: the Gini and the effective number next to it,
on one round axis; Turnover its own square (Play); Lorenz; Who has at least (the CCDF, on the yard bars' log axis).
Hover: an insight (each value at the pointer's round, what the poorest half holds, the median and the top 1 %);
the name: its description; a click on an axis: log ↔ linear; a double-click: the chart fills the window (Escape,
✕ or another double-click gives it back).
Each starts from the room and stops whatever arrangement was still running. The
CCDF chart in the panel is drawn on the bars' own scale (a tenth of the poorest
to the richest, each bar as long as the square of how far along that is), so it
is the bars' edge. The Squares slider steps through whole squares, 2 × 2 to 31 × 31.
In Learn's three yards a click on a yard shows its numbers and charts in the panel
(`Panel.focus`), never its controls; clicked again, the page's own.



The yard has four squares. In Act 1 two play and two watch (`meet 0 1`: the
partners stand a table apart; their stakes lift off toward each other and meet
in the middle, each well off its own, the coin above them; the others below,
looking at them). Each stake is a slice of its owner that only comes apart (no
shape changes: moving the stake shows the share), up to 75% of the poorer one's.
The toss lifts its stakes the same way (`onTable`), and starts with them lifted
when they were shown before it. Sharing the players' money another way (`split`,
noted in the log) leaves them both squares. The players' trades are duels (`duel 0 1`): a
fair coin from the dice, the program's stake, each a gift in the run's log (and
a `duel` note, which the coin counts), so links and Back replay them; shown
whole, coin and all. Before the stake the reader shares the players' money with
a slider in their colours, each on their side (25/75 … 75/25, `split`, gifts
too); then side for area, each bottom edge lit in its square's own colour; they
are left unequal, so "a share of the poorer one's" means something. The guess is three
pictures (the left one bigger, the right one, the same). Then the other two
jump in and the program's own rounds take over, nothing reset. Act 3 reads the
CCDF on a log scale only (the bars one colour, faint, the CCDF's step outline
strong: `guide envelope`), and the Lorenz curve is made of the squares, each as big
as its side says (side = money): stacked, poorest at the bottom (all of it is
the box's height), squeezed to one width, heights kept (`tower`), pulled out
into stairs (`stairs`), the curve through their corners; the even line as ghost squares, one equal
share each; the triangle under it and the gap fold into two bars beside the box,
0 under, 1 over, their ratio the Gini (`guide lorenz gauge`). Each chart, once
taught, flies into its square in the panel (`handoff`). A beat's words may come
in two parts (a `\n`): the second after a pause, or the beat's action, its place
kept. The yard divides
into four by a cross of its own walls (`divide`); three quarters hold a yard
each (the extremes and one between, all starting equal, drawn bare: the big
yard's walls are theirs); the words take the fourth. The tax is taught as the
stake was: everyone's tax shows on them, cut and lifted toward the middle,
growing and shrinking with the slider (`taxes`); try it, set it to 5%. Then
one round of it is played slowly, a step at a time, each held until Next
(everyone's slice, all into one pot, the pot cut equally, a share back to
each, who gained): the slices keep the shape they were cut in until they reach
the pot, the shares fly back as squares and take their shape on arrival. The
stake and tax sliders share one scale (0 to 75%: a square's face still fits in what a stake leaves). The photo for an N_eff up to 6.5 (`stripOf`): copies as tall
as the box stand side by side, as many as the nearest whole number; then the box is made exact (`prints.ts`): the
overflow cut off at its edge and thrown away, or one more copy printed beside it, cut, and the piece that fits slid
into the gap; the last frame counts its fraction. Trades and the tax are
shown as they happen throughout, sped up rather than turned off. The program is a
few plain blocks, not the editor: its stake and tax nudged a step at a time,
the run going on.

- *Pace.* A tap on the empty yard, Space, Enter or → goes on; ← goes back
  (mirrored on a right-to-left page). A tap while a beat still plays finishes
  it at once. A tap on a square makes it happy (it pops and cheers; tapped
  again, it giggles) and does not go on.
- *Waits.* A beat that asks for something does not go on until it is done;
  after 8 s (or a Next that cannot go on) it offers Do it for me, which does it for
  the reader. No guess is wrong.
- *The same run for everyone.* Game progress inside a beat is counted, never
  timed: duels one by one, `until round k` and `until gini x` stop play
  exactly there, at any frame rate. Play left running with no goal goes on
  while the reader reads, where the script says the yard keeps trading. The
  seed is the first where one player leads from their 10th duel to their last
  (`SEED`, checked in tests/story.test.ts).
- *Back* loads the beat before from the checkpoint taken when it first
  started (its share link and the view's state, `Session.viewState`) and plays
  it again, to the bit. The acts can be entered directly: each first beat's
  `enter` lines build its yard, at once (`Session.runAtOnce`).
- *Widgets* (`stage/story/widgets.ts`: mount, config, events, cleanup): the
  yards (`yards.ts`: three sessions on three canvases in the yard's quarters,
  each a scaled copy of it, their rules hidden and their places shuffled; an
  outline hops between them; the one picked grows and the story adopts its
  session through its share link; Back shows the reader's pick again). The
  runner knows the contract and the names beats give, never a widget.
- *Everyone.* Every canvas action has a control in the strip, so a keyboard
  or a screen reader can do every beat: entering the Story puts the keyboard
  on Next, a waiting beat on its control, and Space or Enter on a slider goes
  on. The words are heard once per beat (an `aria-live` line with where you
  are); the current tab is `aria-current`. Under reduced motion faces hold
  still, coins land without spinning, glows stop breathing. Faces near the
  pointer turn to look at it.

The stage learned to teach for it, each a console command a script or a link
can use too: `meet i j` (partners named, the rest watching) and `meet off`,
`duel i j [k]`, `band` (the heights the room keeps to), `veil` (everyone faded out or in), `money fill|split` (all the
money as one pile filling the box, then cut where the pose divides it, the
squares coming in as it fades), `stakes` (the next round's equal stakes lifted
off each pair, following the slider), `glow` (a stake, a square, a slider, a
tab), `guide line` (a line the reader drags across the bars; its number is how
many reach it) and `guide lorenz [even|gap]` (over the squares posed as stairs: the
running total's curve; the line everyone equal would make; the area between,
whose share of the triangle is the Gini), `badge round|gini|trades`, `be` (a ring and a card: your rank and share), `face`
(look at you, cheer, hop, rest, or a feeling word), `meet` (partners walk up
and stand together), `headroom`, and the play goals; and two poses, `tower` and `stairs`.
The toss's spinner is a coin in the partners' colours, tossed up, landing on
the winner's.

**The Play panel.** Made of squares (owner, 2026-10-21): one square of
controls, and a square for each chart (Gini over rounds, the Lorenz curve, how
many have at least: log-log). They tile the side m × n: in landscape as many
across as gives the biggest squares that fit; on a phone one across, under the
yard. In Learn its controls take one square. The stage's own program is the
doc's yard: the stake 0–75% of the poorer one's money (10%), a tax 0–75% a round
shared equally (0), the Gini as a number, and those three charts. Beside them the view's own: Play, One round, Start
again (the same dice from round 0: the same run), New luck (new dice, everyone
equal); both, and a new number of squares, keep the sliders as the reader set
them, so a repeat is the same experiment and a new one changes only what it
says (review 2026-10-21, recheck 3). Then speed (1 to 1,000 rounds a second on a log
track; up to 3 a second every trade is shown, faster ones happen at once),
squares (2 to 1,000; a new yard when let go), Wander, In the box, Line up
(pressed again: back to standing), Be a square, Share and Embed. The two sharing
controls open a native dialog with an immediate snapshot of the actual yard and
a selectable replay link or iframe code. Copy writes once on activation; only
after success does “Buy me a coffee” appear beside it. Embed offers Live (start trading)
and Frozen (start paused), both from the captured state. Preview capture does not
load another simulation or alter the original one. Close, backdrop click or
Escape dismisses the dialog immediately, including during a pending clipboard write.

**The about page.** `about.html` is prose with the stage's people standing in
it: the stage's squares and the essay's faces, small enough for a line of text.
The page declares them and `stage/about` draws them; nothing about any one
square is in the code. A `[data-sq]` span is one square: `data-colour` (a
stage colour), `data-feel` (a feeling word it rests at, moments.ts
`FEELINGS`), `data-logo` (the network's mark on a sticker in its own colours,
`stage/about/logos.ts`: Simple Icons, CC0), `data-act` (something it keeps doing: `follow` the pointer anywhere,
`sip` from Ko-fi's cup and wake up, `dance`, `huff`, pose for a `flash`) and
`data-size` (ems). `data-sq="pair"` is two squares trading in a sentence by the
stage's own rule; `data-sq="party"` a row sized by height, each drinking its
own `data-drinks` (coffee, cocoa) at its own moment. The ask is one line
("small gifts warm my heart, big ones warm my home. Both are welcome.") and
three ways (a coffee, or the five of us treated; any amount; something bigger,
let's talk), then a free one: `[data-share-link]` opens the share sheet, or
copies the link. The `[data-family]` figure is five squares sized by height
until Play deals them the same jelly beans; they then trade by the stage's rule
(core/game.ts, stake 0.3 of the poorer's share), a spinner deciding the first
trades and the rest coming quicker, until someone holds 80%; the figure's
`data-*` carries its words (names, a line per winner, the buttons). The first
game is `data-seed`'s (503: I lead with 64%, the five-year-old wins with 82%),
later ones are chance. Every square watches a pointer that moves near it,
brightens when its line is hovered and hops when clicked; under reduced motion
nothing moves and Play goes straight to how the game ends. `tests/about.test.ts`
checks the page's declarations against what exists, and its first game.

**The law.** Bodies on the ground never overlap and never leave the walls,
checked every substep (1/120 s). One exception, by design: while trading
plays, a chart updates itself and its members glide (0.2 s, one clock, exact
at both ends) to their new places; they may slide past each other during
that glide, as bars do in a bar-chart race. Contacts push pairs apart (positions split
evenly; wealth weighs in on momentum). Whatever is still overlapping goes back,
body by body, to its last valid place: a jam stops the bodies in it and nobody
else. Growth only happens into free space, so a body that can't grow stays
smaller, i.e. denser, which the drawing shows as opacity. Walls open at once
and close only into empty space. Poses end exactly on the figure, to the bit.

**The people.** The room is a pose too (`free`): homes spread evenly over the
yard (a jittered grid by identity, relaxed apart with even margins), where
everyone stands still. Called to a pose, they walk; one that can't get through,
or is still walking after 3 s, hops over the crowd, morphs in the air and lands
on its own spot, shooing off anyone standing there; anyone far away hops at
once. While trading plays, people in place glide with the chart (a live chart
updates 4 times a second), so a live CCDF stays formed: measured 0 hops and
nobody out of place at 36–100 trades a second. A one-off command (`trade
3000`) makes them walk to their new places. `wander` lets them roam instead: they rest, give way
(predicted near misses; head-on, both keep right), slide along whoever they
touch, and say "excuse me" only when stuck. Faces are the essay's own engine
(`stage/essay/face`, copied from the essay): temperaments, felt wealth changes (log
scale), startles on bumps, eyes toward where they walk. Nothing here draws a
character; the engine's SVG paths are painted on the canvas.

**The toolkit.** A pose is a recipe: one word per slot, in any order; bare
words edit the current pose, presets are starting points.

| slot | words |
| --- | --- |
| rescale | `wealth` · `log` (side x/√N) · `logarea` (side √(x/N)), x = (log w − log b)/(log w_max − log b), b a tenth of the current poorest's (so the poorest is drawn too), w_max the richest's |
| resize | `natural` · `equal` (wealth goes into density) · `squared` (area w²: the N_eff fold) |
| reshape | `square` · `bar [t]` · `col [t]` · `tri` · `hex` (area kept; t defaults to 1/N) |
| sort | `id` · `asc` · `desc` · `shuffle` |
| group | `none` · `median` (odd N: the median person alone) · `quartiles` · `tmb` (bottom 50 / middle 40 / top 10) · `deciles` |
| pose | `free` (spread out, standing) · `wander` · `still` · `stack` · `row` · `pack` · `fold` (squarified into one exact square per group) |
| extras | `gap g` · `prints` (once the photo is ready, copies print across the box one by one: they count N_eff) |

Presets: `ccdf` (log bar desc stack: on a linear scale the richest bar runs
far off the yard; `wealth` after it gives the linear one), `bars`, `columns`, `lineup`, `neff`
(squared fold prints), `classes` (tmb desc fold), `median`, `quartiles`,
`density` (equal desc pack), `room`. Presets work inside recipes:
`squared ccdf`.

**The game.** A program run by the model's engine (`stage/core/game.ts`
adapts it): the stage's own is N people, random pairs, a fair coin, the stake
and a levy on two panel sliders (`stake`, `tax`). Areas are shares of all the
wealth (total 1, the pot's share aside). `rule beta` and `rule tax` move those
sliders, so the run goes on; `rule yield equal|mass` is who gives way. Another
program (a link's, later the Rules drawer's) plays the same way. The console's
one-offs are the run's inputs: `trade k` (k trades by the program's trade
block, pairs drawn one after another), `levy`, `give`, and `equalize` (a note
the replay redoes at the same point).

**Links.** `share` writes the state into the URL hash: the program (left out
when it is the stage's own; then just n), the seed, the input log and the step
reached, then the pose, the face look, a question (`ask …`), and the play rate
(`play=auto` for the default N a second, a number for that rate). Loading
replays it to the bit, wealth and shapes, and opens on the finished pose;
`embed=1` hides the console. Links from before programs are refused.

**Vocabulary: arithmetic on areas.** Everything the stage shows when money
moves is built from a few primitives; each is tested once, and an act is a
short composition of them.

- *Areas* (`stage/core/area.ts`, pure; a quantity is a box's area, every
  operation exact): `cut` (subtract: a slice off one end), `bar`/`join` (add:
  the smaller of two becomes a bar along the larger's long edge), `pile`
  (sum: pieces joined one by one, each on the side that keeps the pile
  squarest; the finished pile centred), `squares` (divide into n equal
  squares, in rows, centred), `tile` (divide with a
  remainder: whole copies that fill the box), `fold` (the sum of squares,
  `squarify`), and `square`/`bar21`/`morph` (the same area in another shape).
  Three side rules: `cutSide` (across the longer dimension, facing where the
  piece goes), `joinSide` (the long edge, facing where it comes from, unless a
  neighbour is in the way), `squarestSide` (a pile's). `aspect.ts` (everyone's
  proportions) is the same cut and join on a box, so logic and pictures agree.
- *Scale* (`measureOf`, figure.ts): the arithmetic is always in wealth, but
  a pose draws wealth in its own scale (log, logarea, squared). An act takes
  off what the giver's drawn area loses and brings what the taker's gains, as
  that scale draws them, everyone else held as they are; the piece changes
  size on its way (in a log pose a slice and the bar it joins as differ).
  Proportions (aspect.ts) follow the money in wealth, decided as the game
  moves it and taken as it comes off and on: the same history gives the same
  shapes whatever was on screen, so links replay them. When the move shifts the
  poorest or the richest, a log scale renormalises: everyone resizes at the
  next re-form.
- *Time* (`stage/core/motion.ts`): easing (`smooth`, `fast`), the bow path,
  and every beat's length in one table (`DUR`).
- *Money* (`stage/core/transfer.ts`): every change of hands is a move (from,
  to, amount; a levy's through the pot, `POT`), which the game reports
  (`Game.onMoves`). Shown, a move is a transfer: the giver is drawn with the
  money until it comes off, the taker without it until it is taken in, so
  what is drawn follows from the open transfers, and drawn + in transit = all
  the wealth at every frame (tested). Money off and on changes proportions by
  the one rule, shown or not, so links replay to the same shapes.
- *Pieces of money* (`stage/acts/track.ts`): a `Money` on its own track of
  steps: `mark` (cut line), `lift` (off: a gap opens), `reshape`, `wait`,
  `travel` (a bow, changing shape on the way if asked), `close` (back where it
  came from), `dock` (joins a host by the one rule: the gap closes, its
  colour turns, the seam fades), `merge` (on: one body again).
- *Acts* (`stage/acts/`): `piece` = mark, lift, reshape to a square, travel,
  reshape to the bar, dock, merge; `toss` = both mark and lift, a spinner,
  the winner's own stake closes back, the loser's travels (becoming the bar)
  and docks; `levy` = everyone marks and lifts, 2 : 1 bars, staggered travel
  into a `pile`, `squares`, a square travels to each person and docks; `prints`
  (N_eff) = `tile`, copies one by one, framed and counted. The player
  (`stage/core/transit.ts`) runs acts on one clock and knows only their
  contract; the renderer paints the scene they draw (pieces, lines, frames,
  labels, spinners, copies) and knows no act.

**Trades and levies, in beats.** The game moves wealth at once; the stage
shows it happening. `[` and `]` halve and double the speed of everything, to
watch (or teach) the beats one by one. `fx on|off`, `fx trade off|piece|toss`,
`fx tax on|off`, `fx sync on|off`. Two trade modes: `piece` (the default,
trades where people stand) and `toss` (for demos: partners walk up to each
other first, then a spinner decides).

- *Toss* (`fx trade toss`, for demos; only in a round whose partners have
  met, any other trade in this mode is shown as a piece): **pair** (the two look at each other), **score** and
  **separate** (each marks its stake across its longer dimension, at the end
  toward the other, and the stake comes off a hair; nothing moves after
  that), **decide** (a spinner between them, or just above when they stand
  close, turns three times and a bit, slowing, and stops pointing at the
  winner), **keep** (the winner's own stake closes back onto it), **fly**
  (the loser's stake goes to the winner, becoming a bar on the way, its area
  kept), **attach**, **merge**: along the winner's long edge, the side that
  makes it squarer (toward the loser, or the opposite long edge if they stand
  too close). The winner's own stake is only drawn apart, so a toss ends in
  the same shapes as a `piece`. About 3.2 s at speed 1.
- *Meeting* (toss mode): before each played round its partners walk up to
  each other and stand close, face to face, centres level, with room above
  them for the spinner. The pairs stand in justified rows, evenly spaced
  across and up (the row count chosen so pairs stand furthest apart; a row
  crossing the pot's square is split around it, or the rows sit half below
  it and half above), so every round moves them. The dice are only peeked at
  (`Game.peek`), so the round played is the one a link replays. When play
  stops, everyone goes home. `round` waits for the partners.
- *In a chart* (stack, row, pack, fold) everyone is locked to a place, so
  pairs and spinners would mean nothing: trades and levies happen at once
  and the chart re-forms (gliding); back in the room, they are played again.
  Triangles and hexagons also trade at once (a slice of a bounding box is not
  a slice of the shape).
- *Turns*: acts start in the order they come, each once nobody in it is in an
  earlier one still showing, so one body is never cut twice at once; waiting,
  its money is drawn where it was. Every playback keeps to the rate asked for
  (`play 0` plays nothing).
- *Piece* (the default): **pair**, **score** (a cut line across the loser's longer dimension, the
  stake's width from its end toward the winner), **separate** (the slice comes
  off, a gap opens), **reshape** (the slice becomes a square; the loser keeps
  its new, shorter shape), **fly** (a short bow, a fading trail), **bar** (it
  turns into a bar along the winner's long edge, a gap away), **attach** (the
  gap closes, it takes the winner's colour, the seam fades), **merge** (one
  body again, the bar its new edge). Sizes are never reshaped
  (`stage/core/aspect.ts`): cutting shortens the long side; attaching puts
  the smaller of the two as a bar along the larger's long edge, so people
  drift toward squares by themselves; proportions stay within 1 : 4, and
  `equalize` squares everyone. Every trade changes
  shapes this way, played or not, so links replay them exactly. Streamed (a
  few at a time) or `sync`: rounds, every pair through every beat together.
- *Levy*, everyone at once, trading paused, after the round's trades have
  landed: **brace** (faces shrink and flinch: worry, or anger in the
  dominant), **score** (a cut line like a trade's: across the longer
  dimension, the levy's width, at the end toward the pot), **separate**,
  **shape** (each slice a 2 : 1 bar; the morph is quick and then holds),
  **gather** (biggest first into the pot, an empty square the room keeps in
  its middle, sized to the pot (`potRoom`: a 2 : 1 bar of the levy, plus
  room around it) for the tax's levy, or the levy playing; a bigger levy
  first waits, up to 3 s, while the room walks off the spot; each next piece leaves a step after the last, turns into the bar it
  must be just before it arrives, and attaches on the side that keeps the pot
  squarest, among sides about as good the one used least, so all four sides
  take turns;
  the pot's colour is the payers' colours mixed by amount; all of it in at most
  1.2 s after the first flight; the finished pile centred in the middle),
  **split** (the pile becomes N equal squares in rows, which part), **deal**
  (a square to each person, becoming on the way what it
  joins as: the smaller of share and person a bar along the other's long
  edge), **dock** and **merge** (the gap closes, it takes the person's
  colour, the seam fades). About 3–4 s at speed 1.

**Rounds**: a round is one pass of the program's loop (the stage's: everyone
paired off at random, one sits out when N is odd, one trade a pair, then the
tax and its give); played, every pair goes through every beat together, the
next round starts when the last piece has landed, and the round's tax and give
play as one levy after the trades: only those who pay and those who receive
take part (a give to the poorest, a lottery), and a tax with no give is a
burn (the pile fades). `round [k]` plays k rounds; partners meet first (toss
mode) only when the next round's pairs can be known ahead (random pairs).

While animations are on, trading is paced by them: a trade happens only when
it can be played, so no size ever changes unseen. Playing into a chart, the
chart forms first (trading waits, at most 6 s), then follows the trades; its
N_eff prints show whole, with the count as it is now. `fx off` trades at full
speed, instantly; shapes follow the same rules either way.

**Hands and views.** `drag push` (shove through the crowd, or stop; whatever
the held body's path meets is shoved along from where they meet, so a step
longer than a small body is wide never passes through it),
`drag lift` (carried over everyone, dropped where there is room, else back),
`drag off`. Pose word `still`: nobody moves by themselves, so people stay
where you put them. `zoom chart`: once formed, the chart fills the screen.
`neff`'s photo (area Σw² = 1/N_eff) is folded to the shape whose frames tile
the 1 × 1 box in the most whole copies (`printGrid`: cols × rows ≤ N_eff,
the photo within 1 : 2.5, then the squarest): each frame is the photo and a
thin empty band above it, as thin as can be (6.5 prints as 3 × 2, each band
7.7%). The prints come one at a time after the photo is ready, row by row,
each framed and numbered 1, 2, 3, …; the count beside the box steps by one
as each lands, and a beat after the last it takes on the bands too: N_eff,
6.5. Frames and counts are drawn over the bodies.

**Scripts.** A script is console lines plus `wait <seconds>`, `until done`
(the pose is finished, or a wandering room is at rest) and `say <text>` (a
line on the stage). Typing a line with `wait` or `until` runs it as a script:
`ccdf; until done; wait 2; neff`. Built-ins live in
`stage/console/scripts.ts` (`run tour`, `scripts tour` shows it, `stop`
stops). A link can carry one: `#run=tour`, or `#script=ccdf;until done;say …`.
The tour's wording is a placeholder.

**Console.** `help`, `help <command>`, `stats` (gini, N_eff, shares),
`check` (the law's counters), `who <i>` (or click someone; drag pushes through
the crowd or stops), `n`, `seed`, `reset`, `play [rate]`, `pause`, `speed`,
`look <face>|off`, `axes`, `hud`, `finish`, `scatter`. Tab completes, ↑/↓
recall. Every command is atomic: a failing one changes nothing. In devtools,
`fns.session()` is the live session and `fns.run(line)` runs a line.

**Files.**

```
index.html, stage/main.ts     the page: canvas, console, pointer (forwards only)
stage/console/session.ts      headless session (atomic, replayable), teaching state, script runner
stage/console/commands.ts     the console's commands, their argument checks, the vocabulary
stage/console/scripts.ts      built-in scripts: the tour
stage/core/game.ts            wealth, master trade, rules        (rng.ts, stats.ts)
stage/core/recipe.ts          the toolkit's vocabulary, parse/format, presets
stage/core/figure.ts          recipe × wealth → exact target boxes (pure), incl. the spread room
stage/core/shapes.ts          square/rect, triangle, hexagon: area-exact outlines, hit test
stage/core/stage.ts           the physics: walk, give way, hop, glide, contacts, the law
stage/core/area.ts            the arithmetic of areas: cut, join, pile, squares, tile, side rules
stage/core/pack.ts            shell packing and the squarified treemap
stage/core/motion.ts          easing, the bow, every beat's length
stage/core/transfer.ts        moves and transfers: what is drawn while money is shown moving
stage/core/transit.ts         the player: acts on one clock, the ledger, events
stage/core/aspect.ts          proportions: the same cut and join, on a box
stage/acts/track.ts           a piece of money and its steps (mark, lift, … dock, merge)
stage/acts/{piece,toss,levy,prints}.ts   the acts: compositions of the above
stage/acts/scene.ts           what acts draw: pieces, lines, frames, labels, spinners, copies
stage/view/render.ts          canvas: yard, reference box, bodies, prints, guides, coins, glows, dev ticks
stage/acts/guides.ts          teaching, drawn from the session: stakes, the pile, the line, the running total, your card
stage/story/                  the Story: beats (data), words, runner (headless), strip (DOM), widgets (yards, blocks)
stage/words.en.ts             the stage's own reader words (your card, the Play panel)
stage/view/faces.ts           the essay's FaceField + FacePainter, painted with Path2D
stage/essay/                  the essay's face engine, colours and trade, copied in
tests/*.test.ts               game, figures, the law, room, poses, live charts, hands, console, links,
                              scripts, areas, acts, accounting, packing, renderer (recording canvas),
                              and one regression per review finding (review.test.ts)
```

**Measured** (headless, this laptop): 1,000 people ≈ 1.8 ms per frame at rest
and ≈ 6 ms while forming a CCDF (physics only); the spread room takes up to
13 ms to compute at 1,000 unequal people, and live updates throttle themselves
to stay under a fifth of the time. 36 people: the room is at rest ~1.4 s after
`trade 3000`; every preset forms in ≤ 4 s; back from any pose to the room in
~4 s; a CCDF stays formed in all 600 frames of 10 s of live trading; zero
overlap at every frame throughout. In Chrome, 400 people with faces ran at
about 39 fps; the faces are the main drawing cost.

**Reviews.** `REVIEW-2026-10-18.md` and its recheck; `tests/review.test.ts`
holds one regression per finding.

**Not yet.** Shapes other than boxes collide as their bounding boxes (a hexagon
keeps a small margin); pushes have no rotation; the yard-sale runs between
random pairs, not between neighbours who meet; most people hop rather than
walk into dense poses; a body pressed between a wall and a neighbour in
`wander` can stay a little dense until the crowd moves; no URL compression; no gallery or response capture; no audio.

## The model and its block editor

`docs/model-blocks-spec.md` is the spec (Hamed's, 2026-10-18) with the decisions taken while building it at its
end. One engine runs every model: N agents and a pot, a round of trade, grow, tax and give, every knob a typed
expression. A program is a JSON AST; Blockly is one editor for it. The stage plays it (The game, above).

Three levels, one program. **The panel** (level 0) sits beside the yard (under it on a phone): the sliders,
buttons, numbers and plots the program declares with its panel blocks; the stage's own program puts its stake
and tax there. Moving a slider or pressing a button is an input of the run: the economy goes on, and a link
replays it. Buttons and sliders take only the room they need: a row of small buttons (Play/Pause, Step one
round, Restart at round 0, the program's own), then the sliders (name, track and value in aligned columns).
The charts sit on a grid of near-square cells (3 columns, 2 when narrow; rows in half cells, packed dense): a
Lorenz curve 2 × 2, numbers a column and half a cell beside it, Gini over rounds and the histogram the full
width. **The Rules drawer** (level 1, the Rules tab) is the program as blocks, beside the yard; Blockly
loads the first time it opens. A valid edit goes to the yard at once (round 0, the same seed); a block in a
wrong place turns grey with a warning, and the yard keeps the last good program. The library loads one of the
15 named models into the blocks (Ctrl+Z takes it back). An expression that gives NaN or infinity counts as 0
and shows a warning on its block. **The console** (level 2): `program` prints the program as text, or loads
one. In devtools, `fns.editor()` is the editor.

The blocks come in eight categories (Run, Yard, Trade, Tax & growth, Who, Numbers, Random, Show), headed inside by what they are
for (pair up, flip, pay, take, give back, …). The yard block says where the squares live: standing anywhere, or
on a square lattice, where neighbours trade and squares can move; "in their places" draws them there.
A trade block holds three locked steps (pair up, flip, pay), a tax block two (take, give back); between
them only observers, which read and never write. The camera observers drive the view: `show.trades` says
whether trades play in place, with partners meeting, or at once, `show.tax` whether a levy goes through the
pot; three separate blocks say where squares stand and how they are drawn: `show.arrange` (in their places, still,
in a row or a stack, packed together in about a square; in what order), `show.shape` (squares,
bars, columns, triangles, hexagons) and `show.size` (area = wealth, side = wealth, log, all equal); `show.hold` holds the view (play waits),
`show.zoom` frames a group, `show.colour` colours every square by a property (pale to deep blue; talent is
never drawn otherwise) and `show.outline` rings a group. Groups (everyone, the richest or poorest q, q at random, one at random,
those where a condition holds, combinations, and groups named in the setup) say who a tax takes from, who a
give goes to, and who pairs up. The stats block ([stat] of (property) over (group): Gini, effective N, share,
fraction, Palma, rank correlation with wealth, mean, median, min, max) feeds any expression, the panel's
watched numbers (`panel.number`) and the console's log (`panel.print`). Distributions (everyone the same, uniform, normal,
exponential, lognormal, power law, kept in a range, and the allocations: two classes, one oligarch, a real
country) set the start, talent and thrift, and `a draw from …` samples one
anywhere. The console's `fx` pins trades and
levies for the session. Debt (a model with D > 0) is a hole: outline only, at its size |w|, the line heavier
with depth (|w| / D), a sad face; money moving to or from a debtor lands at once, and a debtor keeps its
proportions. Thrift is a solid core, λ of the square's area. The blocks say "squares"; the code says agent.

- `model/` is headless and imports nothing from the stage or the editor. `catalogue.ts` is the vocabulary
  both read: op ids, shapes, types, inputs with their default shadows and contexts, field ids. `ast.ts` holds
  the node shape and paths, `validate.ts` the context rules, `compile.ts` turns the AST into closures and runs
  them round by round, and `engine.ts` is the `Run` (step, rounds, seek, outputs, warnings, hash; engine
  version 1). `presets.ts` holds the 15 programs; `countries.ts` the published wealth shares behind `alloc.country`. The state is struct-of-arrays Float64Arrays in units of mean
  wealth, plus the agents' cells on a torus.
- Determinism: `dmath.ts` ports fdlibm's exp, log and sin/cos kernels and adds an exactly rounded sqrt, all
  from + − × ÷ and bit reads, so every browser computes the same bits. `rng.ts` is counter-based SplitMix64:
  each draw is keyed by (seed, stream, round, occurrence, index, k).
- `blocks/` holds the view. `words/` has every English word (`blocks.en.ts`: one entry per block in palette order, label, dropdown words and a one-sentence tip; `issues.en.ts`; `presets.en.ts`), `define.ts` turns the catalogue into Blockly
  blocks (zelos), and `convert.ts` maps AST ↔ Blockly JSON as pure functions. `editor.ts` covers the
  workspace, the toolbox and greying. Option shadows that carry arguments become regular blocks over their
  shadow, so their arguments take expressions; an untouched default that gets bumped out vanishes as a shadow
  would. The stage's side: `stage/view/panel.ts` (the panel), `stage/view/rules.ts` (the drawer),
  `stage/view/plot.ts` (Gini over rounds, Lorenz, histogram, framed with axes).

Tests: `npm test` covers the model and the editor's round trips (AST → Blockly → AST is the identity for every
preset and every op, through headless Blockly). `npm run test:accept` runs the spec's acceptance table
against the prototype's numbers, about 45 s. `npm run test:browsers` checks that Chromium, Firefox and WebKit
compute the bits Node pinned; WebKit needs its host libraries first
(`sudo npx playwright install-deps webkit`).

## Run it

```sh
npm install
npm run dev        # the stage
npm test           # headless tests, one worker
npm run test:accept   # the model's acceptance table (~45 s)
npm run test:browsers # determinism in Chromium, Firefox, WebKit
npm run test:production # build, then check links and replay at /fair-and-square/ in Chromium
npm run check      # TypeScript, strict
npm run build      # check + production build into dist/
```

Node 22.18+ or 23.6+; any current browser.

History: the stage grew out of a soft-body geometry engine and lab (FnS_de,
2026-10-15), retired on 2026-10-18; only its packers live on, in
`stage/core/pack.ts`.
