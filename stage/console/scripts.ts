/**
 * Built-in scripts: plain console lines, one per line, plus three words only
 * scripts need: `wait <seconds>`, `until done` (the pose is finished, or the
 * room has come to rest) and `say <text>` (a line on the stage; `say` alone
 * clears it). `#` starts a comment. A tutorial is just a script.
 *
 * The wording here is a placeholder for trying the mechanism, not the essay's
 * voice; reader-facing words belong in script/ once they are real.
 */
export const SCRIPTS: Readonly<Record<string, string>> = Object.freeze({
  tour: `
# a first look (draft wording)
pause
reset
room
say Thirty-six people, each with the same share. Area is wealth.
until done
wait 3
say They trade. Each time a coin toss moves a slice of the poorer one's wealth.
play 300
wait 8
pause
say Line up by wealth, richest at the bottom, on a log scale: the longest bar is 1.
ccdf
until done
wait 5
say Square every share and fold them into one photo. Then print it across the box.
neff
until done
wait 5
say How many copies fit? That is the effective number of people.
wait 5
say Now the same people in quarters, richest quarter first.
quartiles
until done
wait 5
say Back to the room. Space keeps them trading.
room
until done
wait 3
say
`,
  demo: `
# every important function in about two and a half minutes (dev captions, not the essay's words)
pause
say
zoom yard
fx on
fx trade piece
rule tax 0
n 12
speed 1
say Twelve people, equal shares. Area is wealth; the room keeps them spread out, standing still.
until done
wait 4
say Trading where they stand: the loser's slice comes off its longer side and flies to the winner's.
play
wait 10
pause
until done
say The same, slowed down and spelled out (fx trade toss). Everyone is paired at random; partners walk up to each other.
fx trade toss
speed 0.6
round
wait 0.2
until done
say Both cut a stake off their longer side. A spinner decides. The winner keeps its own stake and takes the other's, on the side that keeps it squarer.
wait 0.5
until done
speed 1
say A new pairing every round.
play
wait 12
pause
until done
fx trade piece
say A tax: the middle clears for the pot.
rule tax 0.05
until done
wait 2
say After each round's trades, everyone pays in, biggest first; the pot is split equally and dealt back.
play
wait 14
pause
until done
rule tax 0
say A one-off levy of 30%: a bigger pot, so the room makes more space first.
levy 0.3
wait 0.5
until done
say Two hundred people, forty thousand trades at once.
n 200
trade 40000
until done
wait 2
say Charts are poses of the same bodies. Line up by wealth, on a log scale (the longest bar is 1): the CCDF.
ccdf
until done
wait 4
say In a chart everyone is locked in place: trades happen at once and the chart follows.
play 4000
wait 6
pause
say Square every share and fold them into one photo; prints of it fill the box. Copies that fit: N_eff.
neff
until done
wait 5
say Bottom half, middle forty percent, top tenth.
classes
until done
wait 4
say Quartiles, richest first.
quartiles
until done
wait 3
say Zoom: the chart fills the screen.
zoom chart
wait 3
zoom yard
say Back to the room.
room
until done
stats
share
say Stats and a share link are in the console. Try: drag someone, help, or demo again.
wait 5
say
`,
  trade: `
# trade in steps and watch the chart follow
ccdf
until done
play 200
wait 6
pause
`,
});
