# Fair and Square — Model & Blocks Spec

Oct 18, 2026 · @Hamed Seyed-allaei

## Scope

One structure runs every model: N agents and a pot, a round of four operators, nine knobs. The Blockly editor is a view onto those knobs.

- **Covers:** state, operators, expression language, named presets, block catalogue, program AST, engine semantics, acceptance tests.
- **Not covered here:** URL encoding, rendering (poses, group photo), landing page, gallery. Each gets its own spec.

Principles:

- **Models are data.** A named model is a set of knob values, never special-case code.
- **Conservation is visible.** Wealth moves along three channels only: agent to agent, agent to pot, world to agent.
- **Every slot is an expression.** A dropdown choice is a constant expression, so plug-in editing later needs no format change.
- **Stable IDs, never labels.** Labels get translated (Farsi first); IDs never change meaning.
- **Deterministic.** The same program, seed and round always give the same state.

## Model

The state is N agents and one pot. A round applies trade, grow, tax and give, in that order.

**State**

- **Agent k:** wealth wₖ. Traits fixed at setup: talent tₖ and thrift λₖ ∈ \[0, 1). A grid cell when pairing is spatial.
- **Pot P:** starts at 0.
- **Total W** = Σwₖ + P. Only grow changes it.
- **Unit:** expressions measure wealth in current mean wealth W̄ = W/N, which is 1 at start. The display shows shares wₖ/W.

**One round**

```latex
\begin{aligned}
\text{trade:}\quad & w_i \to w_i + \Delta_{ij},\;\; w_j \to w_j - \Delta_{ij} && (i,j) \in \pi \\
\text{grow:}\quad & w_k \to w_k\, e^{\mu - \sigma^2/2 + \sigma \xi_k} && \xi_k \sim \mathcal{N}(0,1) \\
\text{tax:}\quad & w_k \to w_k - \tau_k,\;\; P \to P + \textstyle\sum_k \tau_k \\
\text{give:}\quad & w_k \to w_k + r_k P,\;\; P \to 0 && \textstyle\sum_k r_k = 1
\end{aligned}
```

**The lens.** A trade sees only in-play wealth uₖ = (1 − λₖ)(wₖ + D). Debt D adds to what is in play; thrift λ removes from it. No agent falls below −D.

**Two kinds of trade**

- **Bet:** the coin picks the winner (the poorer agent wins with probability p). The loser pays stake S to the winner.
- **Split:** both pool their in-play wealth and agent i takes a random share ε \~ U(0, 1). So Δ = ε(uᵢ + uⱼ) − uᵢ.

A tax with no give block leaves wealth in the pot, out of circulation. That is a burn.

&#91;embedded content: wealth channels · 3 places, 4 steps per round\]

Trade moves wealth between agents, tax and give move it through the pot, and only grow adds wealth from outside.

## Operators

Each knob has a few named options. Any option can be replaced by an expression of the same type (next section). Wealth is in units of W̄; p is the probability that the poorer agent wins.

| Knob | ID | Rule | Args (default) |
| --- | --- | --- | --- |
| pair π | `pair.match` | Random perfect matching; with odd N one random agent sits out | — (default) |
| pair π | `pair.draw` | ⌊N/2⌋ pairs drawn independently, applied one by one in draw order | — |
| pair π | `pair.near` | Random matching among agents within R cells; the unmatched sit out | R = 1 |
| pair π | `pair.similar` | Random matching among agents within k wealth ranks | k = 5 |
| coin p | `coin.fair` | p = ½ | — (default) |
| coin p | `coin.poorer` | p = ½ + b | b = 0.05 |
| coin p | `coin.richer` | p = ½ − ½ζ (w\_rich − w\_poor) | ζ = 0.01 |
| coin p | `coin.talent` | p = ½ + κ (t\_poor − t\_rich) | κ = 0.5 |
| stake S | `stake.poorer` | S = β · min(uᵢ, uⱼ) | β = 0.1 (default) |
| stake S | `stake.loser` | S = β · u\_loser | β = 0.1 |
| stake S | `stake.fixed` | S = a | a = 0.1 |
| stake S | `stake.split` | Split trade; the coin is ignored | — |
| grow | `grow` | w × e^(μ − σ²/2 + σξ) per round | μ = 0, σ = 0.05 |
| tax τ | `tax.wealth` | τ = χ · max(w, 0) | χ = 0.01 |
| tax τ | `tax.above` | τ = χ · max(w − x, 0) | χ = 0.05, x = 2 |
| tax τ | `tax.gains` | τ = χ · max(g, 0); g = wealth gained in this round's trade | χ = 0.3 |
| tax τ | `tax.flat` | τ = a, the same from everyone | a = 0.01 |
| give r | `give.equal` | r = 1/N | — |
| give r | `give.poorest` | Equal shares among the poorest fraction q | q = 0.1 |
| give r | `give.wealth` | r ∝ max(w, 0) | — |
| give r | `give.lottery` | Everything to one uniformly random agent | — |
| setup | `start.equal` | w = 1 for everyone | — (default) |
| setup | `start.random` | w \~ Exp(1), rescaled to mean 1 | — |
| setup | `start.drawn` | Quantiles of a curve the reader draws | curve |
| setup | `traits.talent` | t \~ N(m, s), clipped to \[0, 1\] | m = 0.6, s = 0.1 |
| setup | `traits.thrift` | λ = λ₀ for all, or λ \~ U(lo, hi) | λ₀ = 0 |
| setup | `debt` | Debt limit D | D = 0 |
| setup | `move` | Each round, each agent steps to a random free neighbouring cell with probability v | v = 0.5 |

**Clamps.** p is clipped to \[0, 1\]. S is capped at the loser's in-play wealth. τₖ is capped at wₖ + D. Give weights are normalised to sum 1; if all are zero, give falls back to equal shares.

## Expressions

Every slot holds a typed expression, and a named option is just a constant expression. What an expression can read depends on the slot it sits in.

| Slot | Returns | Can read |
| --- | --- | --- |
| coin | Number p = P(poorer wins), clipped to \[0, 1\] | poorer, richer, globals |
| stake | Number S ≥ 0, capped at the loser's in-play wealth | poorer, richer, winner, loser, globals |
| tax | Number τ for each agent | me, globals |
| give | Number weight ≥ 0 for each agent | me, globals |
| grow μ, σ | Number for each agent | me, globals |
| pair args (R, k), repeat count | Number | globals |
| repeat until, when | Bool | globals |

- **Agent properties** (`[property] of [who]`): wealth, in-play, rank (0 = poorest, 1 = richest), talent, thrift, gain this round.
- **Globals:** N, round, total (W relative to round 0), median, min, max, pot, Gini, effective N, top 1% share, bottom 50% share.
- **Operators:** + − × ÷, min, max, abs, log, exp, sqrt, power, clamp, random (uniform on \[0, 1)), random normal, comparisons, and / or / not, if-then-else.
- **Purity:** expressions have no side effects. Each random draw uses its slot's own RNG stream (see Engine semantics).
- **Errors:** NaN or infinity evaluates to 0 and raises a visible warning on the block.

Examples:

- Progressive tax, same as `tax.above`: `0.05 × max(wealth of me − 2, 0)`
- Merit coin, same as `coin.talent`: `0.5 + 0.5 × (talent of poorer − talent of richer)`
- Merit returns: grow μ = `0.02 × talent of me`

## Presets

Each named model is the default program with a few knobs changed. The default is N = 100, `start.equal`, `pair.match`, `coin.fair`, `stake.poorer` β = 0.1, and no tax, growth or debt. Presets are recipe cards in the library; nothing loads unless the reader picks one.

| Preset ID | Changes from default | What the reader should see | Source |
| --- | --- | --- | --- |
| `yard-sale` | none | One agent ends up with almost everything; Gini climbs toward 1 | Hayes 2002 |
| `fixed-stake` | `stake.fixed` a = 0.1 | Stable exponential distribution, Gini ≈ 0.5 | Drăgulescu & Yakovenko 2000 |
| `theft-fraud` | `stake.loser` β = 0.1 | Stable and fairly equal, but the richer agent loses on average | Hayes 2002 |
| `saving` | `stake.split`, thrift λ = 0.5 | A middle class: gamma distribution with shape 1 + 3λ/(1 − λ) = 4 | Chakraborti & Chakrabarti 2000; Patriarca et al. 2004 |
| `mixed-saving` | `stake.split`, thrift λ \~ U(0, 1) | Heavy power-law tail; the thriftiest end richest | Chatterjee, Chakrabarti & Manna 2003 |
| `tilt-to-poor` | `coin.poorer` b | Still condenses unless ½ + b > p\*(β); p\* = 0.526 at β = 0.1, 0.631 at β = 0.5 | Moukarzel et al. 2007 |
| `wealth-tax` | `tax.wealth` χ = 0.01, `give.equal` | Stable steady state, Gini ≈ 0.30 | Boghosian 2014 |
| `advantage` | `wealth-tax` + `coin.richer` ζ | An oligarch appears when βζ > χ and holds about 1 − χ/(βζ) of all wealth | Boghosian et al. 2017 |
| `debt` | `debt` D = 1 | Negative wealth appears, down to −D; with χ and ζ this fits US wealth data | Li et al. 2019 |
| `growth` | No trade; `grow` σ = 0.05; optional `tax.wealth` + `give.equal` | With no tax, inequality grows without limit; with tax it settles | Berman, Peters & Adamou 2016 |
| `trickle-up` | `tax.flat` a = 0.01, `give.wealth` | Poor pay flat, rich receive in proportion: concentration speeds up | Berman, Peters & Adamou 2016 (negative reallocation) |
| `local` | `pair.near` R = 1, `move` v = 0 | Many local oligarchs surrounded by the poor; trade freezes. Raising v gives one oligarch | Bustos-Guajardo & Moukarzel 2012 |
| `merit` | `traits.talent`, `coin.talent` κ | How strongly talent predicts final wealth, as κ is dialled up from 0 | Inspired by Pluchino, Biondo & Rapisarda 2018 |
| `floor` | `tax.wealth` χ = 0.01, `give.poorest` q = 0.1 | The minimum wealth rises; few agents stay near zero | — |
| `income-tax` | `tax.gains` χ = 0.3, `give.equal` | In this engine it settles at Gini ≈ 0.36 (see Open questions) | Bouleau & Chorro 2017 |

The threshold for `tilt-to-poor` is p\*(β) = ln(1/(1 − β)) / ln((1 + β)/(1 − β)). Below it, the poorer agent's expected log-growth is negative even though it wins more often.

## Blocks

There is one Blockly block per operator and one per option. A block's type name is its AST op ID, so the editor and the engine share a single vocabulary.

**Shapes.** Hat blocks start a script. Stack blocks are statements, and C blocks wrap statements. Round reporters return a Number and hexagonal reporters a Bool. Option reporters carry their own type: Pairing, Start, Split. Every option slot is a value input filled with a shadow block, as in Scratch. Dropping a reporter on it replaces the shadow; removing the reporter brings the shadow back.

**Statement blocks**

| Category | Block as shown | Type ID | Shape | Inputs |
| --- | --- | --- | --- | --- |
| Control | when started | `ctl.start` | hat | — |
| Control | forever | `ctl.forever` | C | body |
| Control | repeat (n) | `ctl.repeat` | C | n: Number |
| Control | repeat until ⟨c⟩ | `ctl.until` | C | c: Bool |
| Control | every (k) rounds | `ctl.every` | C | k: Number |
| Control | pause | `ctl.pause` | stack | — |
| Setup | yard of (N) agents, start (s) | `setup.yard` | stack | N: Number; s: Start |
| Setup | talent (m) ± (s) | `traits.talent` | stack | m, s: Number |
| Setup | thrift (λ₀), or thrift between (lo) and (hi) | `traits.thrift` | stack | mode field; Numbers |
| Setup | allow debt down to (D) | `debt` | stack | D: Number |
| Economy | trade · pair (π) · coin (p) · stake (S) | `trade` | stack | π: Pairing; p: Number; S: Number or Split |
| Economy | grow by (μ) ± (σ) | `grow` | stack | μ, σ: Number |
| Economy | tax (τ) into the pot | `tax` | stack | τ: Number |
| Economy | give the pot (r) | `give` | stack | r: Number |
| Economy | move with chance (v) | `move` | stack | v: Number |

**Option reporters** (the shadows; arguments are editable numbers)

- **Pairing:** random pairs `pair.match` · random pairs with repeats `pair.draw` · neighbours within (R) `pair.near` · similar wealth within (k) ranks `pair.similar`
- **Coin:** fair `coin.fair` · favours poorer by (b) `coin.poorer` · favours richer by (ζ) `coin.richer` · favours talent by (κ) `coin.talent`
- **Stake:** (β) of poorer's in-play `stake.poorer` · (β) of loser's `stake.loser` · fixed (a) `stake.fixed` · split the pool `stake.split`
- **Tax:** (χ) of wealth `tax.wealth` · (χ) of wealth above (x) `tax.above` · (χ) of gains `tax.gains` · flat (a) `tax.flat`
- **Give:** equally `give.equal` · to the poorest (q) `give.poorest` · by wealth `give.wealth` · lottery `give.lottery`
- **Start:** equal `start.equal` · random `start.random` · drawn `start.drawn`

**Value reporters**

- **Number:** (n) `num` · \[property\] of \[who\] `val.prop` · \[global\] `val.global` · (a) \[+ − × ÷\] (b) `op.arith` · \[min max abs log exp sqrt power\] `op.fn` · clamp (x) (lo) (hi) `op.clamp` · random `op.random` · random normal `op.normal` · if ⟨c⟩ then (a) else (b) `op.if`
- **Bool:** (a) \[< ≤ = ≥ >\] (b) `op.cmp` · ⟨a⟩ \[and or\] ⟨b⟩ `op.logic` · not ⟨a⟩ `op.not`

**Camera blocks.** They never change the simulation.

- pose \[square bar triangle hexagon\] scale \[linear log\] `cam.pose`
- photo \[lineup stacked packed groups\] hold (s) `cam.photo`: blocking; the run pauses while it holds
- watch \[global\] `cam.watch`: a palette checkbox that shows a live monitor, in parallel
- follow \[richest poorest agent\] `show.zoom`
- when ⟨c⟩ `show.when`: a hat that runs its stack once each time c turns true (c looked at after setup and after
  every step, as an observer looks: the economy never sees it)

**Context rules**

- poorer and richer are valid only inside coin and stake; winner and loser only inside stake.
- me is valid only inside tax, give and grow.
- Setup blocks are valid only under `ctl.start`, before the first loop.
- A block in an invalid spot turns grey with a tooltip, and the program does not run until it is fixed.

**Default program**

```
when started
  yard of (100) agents, start (equal)
  forever
    trade · pair (random pairs) · coin (fair) · stake ((0.1) of poorer's in-play)
```

## Program AST

The AST is the contract. Blockly is one editor for it, and the engine reads only the AST.

**Node shape.** Every node is `{op, args?, f?, body?, v?}`.

- `op`: the block's type ID.
- `args`: value inputs by name, each a node.
- `f`: dropdown fields, as stable IDs.
- `body`: statements, for C blocks.
- `v`: the value of a `num` node.

A program is `{"ast": 1, "scripts": [ … ]}`, a list of hat-rooted scripts. `ast` is the vocabulary version.

**Default program**

```json
{"ast": 1, "scripts": [
  {"op": "ctl.start", "body": [
    {"op": "setup.yard", "args": {"n": {"op": "num", "v": 100}, "start": {"op": "start.equal"}}},
    {"op": "ctl.forever", "body": [
      {"op": "trade", "args": {
        "pair": {"op": "pair.match"},
        "coin": {"op": "coin.fair"},
        "stake": {"op": "stake.poorer", "args": {"beta": {"op": "num", "v": 0.1}}}}}
    ]}
  ]}
]}
```

**Rules**

- Op IDs come from the catalogue only. They are never renamed or reused; a new meaning gets a new ID.
- Every input is written out, never left to a default, because defaults may change.
- Option arguments are inputs, not fields, so each can hold an expression.
- Fields hold IDs such as `wealth` or `poorer`, never display labels.
- Numbers are f64 in W̄ units; probabilities and rates are fractions, not percentages.

**Blockly ↔ AST**

- Block type → `op`. Value inputs → `args`, by input name. Fields → `f`. Statement inputs → `body`. The next-block chain → array order.
- Shadows serialise like any other node. On load, every option slot first gets its default shadow, and the AST node is placed over it.
- Block positions, comments and collapsed state are not in the AST. The editor lays out a loaded program itself.
- AST → Blockly → AST must be the identity for every preset.

## Engine semantics

The same AST, seed and round give the same state, bit for bit, in every browser.

**Execution**

- **Rounds:** a round is one pass of the outermost loop body. Blocks run top to bottom, and the round counter advances when the pass completes. Setup blocks run once, at round 0.
- **Order inside trade:** pair → coin → stake → clamp → transfer.
- **Simultaneous pairs:** pairs from `pair.match`, `pair.near` and `pair.similar` are disjoint, so they apply at once. `pair.draw` applies in draw order.
- **Ties:** the agent with less wealth is poorer; on a tie, the lower index. All sorts (rank, poorest, similar) break ties by index.
- **Snapshots:** coin and stake read W̄ from the start of the trade block. Tax computes every τₖ from the state before any is taken. Grow uses the mean before growth. Give empties the pot.
- **Gains:** gₖ is wealth after this round's trades minus wealth at the round's start. It resets each round.

**Determinism**

- **RNG:** counter-based. Each draw is a 64-bit mix (SplitMix64 finaliser) of (seed, stream, round, index, k), written in the engine, never taken from a library.
- **Streams:** pair, coin, split, grow, give, move, setup, plus one per `op.random` or `op.normal` node, keyed by its path in the AST. A new random block never shifts existing draws.
- **Draw recipes:** uniform = top 53 bits / 2⁵³. Normal = Box–Muller from two uniforms.
- **Floats:** f64 only. ln, exp and sqrt run inside WASM, never JS Math. No relaxed SIMD. Every sum (pot, mean, Gini) runs in agent-index order.
- **Versioning:** the engine has a version number. Any change to any output of any preset bumps it, and old versions stay callable.

**Outputs per round**

- Shares sₖ = wₖ/W and pot share P/W. With debt, shares can be negative.
- Gini, effective N = 1/Σsₖ², top 1% share, bottom 50% share, min, median, max.

**Limits:** N from 2 to 2,000. Any round can be reached by replay from round 0.

## Acceptance tests

Each preset has a statistical check. The reference values come from a Python prototype of this spec: N = 1,000 (N = 100 for advantage), β = 0.1 unless stated, mean of 3 seeds. "Stationary" means Gini at rounds T and 4T differs by less than 0.01. The engine must match within ±0.02 Gini.

| Preset | Run | Check | Prototype result |
| --- | --- | --- | --- |
| `yard-sale` | 5,000 and 20,000 rounds | Gini keeps rising toward 1 | 0.948, then 0.987 |
| `fixed-stake` | average of rounds 4,000–6,000 | Gini ≈ 0.5 (exponential) | 0.52 |
| `theft-fraud` | average of rounds 4,000–6,000 | Stationary | 0.185 |
| `saving` λ = 0 | average of rounds 2,000–3,000 | Gini ≈ 0.5 (exponential) | 0.499 |
| `saving` λ = 0.5 | average of rounds 2,000–3,000 | Gini of gamma(4) = 0.273 | 0.273 |
| `mixed-saving` | average of rounds 4,000–6,000 | Heavy tail: one agent holds > 10% | Gini 0.79, top 21% |
| `tilt-to-poor` β = 0.1 | 5,000 rounds | p = 0.52 still condensing; p = 0.55 stationary | 0.889 and rising; 0.50 |
| `tilt-to-poor` β = 0.5 | 2,000 and 8,000 rounds | p = 0.60 condenses; p = 0.65 and 0.70 stationary | 0.985; 0.90; 0.64 |
| `wealth-tax` χ = 0.01 | average of rounds 2,000–4,000 | Stationary | 0.297 |
| `advantage` χ = 0.0005 | N = 100, average of rounds 20,000–40,000 | Top share ≈ 1 − χ/(βζ); no oligarch for ζ ≤ 0.005 | ζ = 0.0075: 0.31 (predicted 0.33); 0.01: 0.47 (0.50); 0.015: 0.67 (0.67) |
| `income-tax` χ = 0.3 | 5,000 and 20,000 rounds | Stationary | 0.370, then 0.363 |
| `pair.draw` vs `pair.match` | default, with and without χ = 0.01 | Same statistics within noise | 0.807 vs 0.806 at 1,000 rounds; 0.296 vs 0.297 with tax |

Three further tests are exact rather than statistical:

- The same AST and seed give an identical state hash in Chrome, Firefox and Safari.
- AST → Blockly → AST is the identity for every preset.
- Adding an unrelated `op.random` block does not change any other draw.

`debt`, `growth`, `trickle-up`, `local`, `merit` and `floor` have qualitative checks only, until they are calibrated.

## Open questions

- **Income tax.** The prototype settles at Gini ≈ 0.36 with χ = 0.3 on gains. The literature reports that income taxes alone do not stop condensation (Bouleau & Chorro 2017). Before writing the card, find out whether the difference is the tax base or the setup.
- **`coin.richer` form.** The bias grows with the absolute gap, so p clips at 0 once ζ · (w\_rich − w\_poor) ≥ 1. The 1 − χ/(βζ) law holds only while ζ · (top wealth) < 1. Options: keep this Boghosian-style form, or bound it by the relative gap and lose the clean law.
- **Spatial grid.** Grid size, occupancy and neighbourhood are not fixed yet. If pairing depends on position, `move` is part of the frozen engine.
- **Merit preset.** Pluchino et al. use lucky and unlucky events, not exchange. `merit` is an analogue and its card should say so.
- **Debt and tax.** Tax applies to positive wealth only. Confirm that agents in debt pay nothing.
- **Calibration.** Give `debt`, `growth`, `trickle-up`, `local`, `merit` and `floor` numeric checks.
- **Deferred to other specs:** URL encoding, rendering and poses, gallery, embedded questions.

## Sources

- [Twenty-five years of random asset exchange modeling (review, 2023)](https://arxiv.org/pdf/2309.12418): Hayes, Drăgulescu & Yakovenko, Chakraborti & Chakrabarti, Chatterjee et al., Moukarzel et al., Boghosian, Li et al., Bouleau & Chorro
- [Bustos-Guajardo & Moukarzel: Yard-Sale exchange on networks](https://ar5iv.labs.arxiv.org/html/1208.4409)
- [Berman, Peters & Adamou: Far from equilibrium, wealth reallocation in the United States](https://arxiv.org/pdf/1605.05631)

---

## Decisions (2026-10-18, implementation in `FnS/model` and `FnS/blocks`)

Added when the spec was implemented. The text above is Hamed's spec as written; where a decision below differs from
it, the decision is what the engine does.

**Owner's answers**

- **Scope.** The engine (`FnS/model/`) and the Blockly editor (`FnS/blocks/`, page `rules.html`) come first. The
  stage keeps its own game until the rendering spec wires the engine in.
- **Math.** ln, exp, cos and sqrt are TypeScript ports (fdlibm; sqrt exactly rounded) that use only + − × ÷ and bit
  reads. ECMAScript fixes those operations to IEEE 754 round-to-nearest-even, so every browser computes the same
  bits without WASM. WASM can replace them later behind the same functions.
- **Grid.** A torus of G × G cells, G = ⌈√(N/0.6)⌉ (about 60 % occupied, so `move` has room). "Within R cells" is
  Chebyshev distance (8 neighbours at R = 1); agents are placed by a shuffle from their own setup stream.
- **Debt and tax.** `tax.wealth` is τ = χ · (w + D): the trade's lens without thrift. With `give.equal` everyone
  nets χ(W̄ − w), debtors included, which is Li et al.'s affine model. At D = 0 it is the spec's formula.

**Corrections**

- `advantage` inherited χ = 0.01 from `wealth-tax`; at the default ζ = 0.01, βζ = 0.001 < χ and no oligarch ever
  appears. The preset uses the acceptance values: N = 100, χ = 0.0005, ζ = 0.01 (top share ≈ 1 − χ/(βζ) = 0.5).
- `tilt-to-poor`: p\*(0.1) = ln(1/0.9) / ln(1.1/0.9) = 0.525, not 0.526.
- Box–Muller needs cos as well as ln and sqrt; it is computed as cos(2πu) from the turn u, in the same library.

**Deferred**

- `start.drawn`: a drawn curve needs an array value, which the node shape `{op, args, f, body, v}` does not have.
- `cam.watch` is a palette checkbox, so it belongs to the rendering spec. The other camera blocks are in the
  catalogue and the AST; the engine ignores them.

**Choices the spec left open**

- **RNG key.** A draw is keyed by (seed, stream, round, occurrence, index, k). For the built-in streams the
  occurrence counts how many statements of that kind (trade, grow, give, move) have run in this round, so two trade
  blocks in one round draw differently, and adding a tax block before a trade block does not move the trade's
  draws. A random block's occurrence counts its own statement's runs. The index is the agent, or the pair's
  ordinal for coin and split draws. Setup streams are separate per trait (start, talent, thrift, placement).
- **`op.random` streams** are keyed by the node's AST path, as specified. Inserting a statement above a random block
  changes its path and so its draws; appending never does. A stable stream field on random nodes would fix this,
  at the cost of an AST change.
- **Units.** Wealth is stored in units of the current mean W̄, so expressions read it directly. Grow renormalises
  after each step (Σw + P = N) and the `total` global keeps W/W₀. D is set at round 0, in units of the starting
  mean, and stays the same amount when grow changes W (so in current units it is D/total).
- **Grow with debt** scales w + D, so nobody falls below −D. At D = 0 it is the spec's formula. A growth step
  whose new mean wealth would be zero, negative or infinite cannot be expressed in units of the mean: it is
  skipped, with a warning ("collapse"), and the state stays as it was.
- **Defaults.** Without a talent block every talent is 0; without a thrift block every λ is 0.
  `give.poorest` gives to the ⌈qN⌉ poorest, at least one. The `growth` preset has no tax; the reader adds it.
- **Options belong to their knob.** A coin option works only inside a coin slot, a tax option only inside a tax
  slot, and so on; inside its slot it may be nested in an expression.
- **Control.** One `when started` script, always script 0 (so camera scripts never shift random paths).
  `setup.yard` comes first and the other setup blocks right after it, before any other statement, each at most
  once: round 0 is then "setup done". `every (k)` belongs inside a loop. `every (k) rounds` runs its body on the k-th, 2k-th, … pass; `repeat (n)` reads n once.
  Statements outside any loop belong to the current round. Loops inside other loops share one allowance of
  100,000 passes per round, across every nesting level; past it they stop, with a warning. Without it a
  `forever` inside a loop would never let the round end.
  N is rounded and clamped to [2, 2000], with a warning.
- **Snapshots.** Globals and ranks are read from a snapshot taken when the statement that reads them starts.
  Sums run in agent-index order; Gini's sum runs in sorted order (ties by index).
- **Pairing.** `pair.near` and `pair.similar` form a greedy random maximal matching: agents in a random order, each
  unmatched one taking a uniformly chosen unmatched candidate. `move` visits agents in index order; each steps,
  with probability v, to a uniformly chosen free cell of its 8 neighbours.
- **Clamps.** τ is clamped to [0, w + D]; give weights below 0 count as 0; λ is clamped to [0, 1). Give
  weights are divided by the largest before they are summed, so huge finite weights neither overflow nor
  destroy the pot.
- **Draw index.** A per-agent expression draws at the agent's index, a coin or stake expression at the pair's
  ordinal, and every other expression (a count, a condition, a pairing argument) at index 0.
- **Context of setup arguments.** Setup arguments read no globals (there is no state yet).

**Acceptance (2026-10-19).** Every Gini in the table matches the prototype within ±0.02
(`npm run test:accept`, seeds 1–3). Top shares are checked as the Check column says, not against the
prototype's numbers: one seed's top share spreads by 0.015–0.026 (advantage) or 0.06–0.22 (mixed-saving),
so a 3-seed mean cannot be held to ±0.02. Measured: advantage ζ 0.0075, 0.01, 0.015 → 0.307, 0.493, 0.671
(law 0.333, 0.500, 0.667; prototype 0.31, 0.47, 0.67); at ζ 0.005 the richest holds 0.193, against 0.114 with
no advantage, so no oligarch. Mixed-saving: Gini 0.797, richest 0.145 (prototype 0.21).

**Income tax, the open question.** The 2023 review defines an income tax as a tax on transaction amounts, which
is what `tax.gains` is under `pair.match` (one trade per agent per round, so the round's gain is the trade's).
So the gap is not the tax base. It is the regime. Bouleau & Chorro work analytically in a Wright–Fisher
diffusion, the continuum limit of small exchanges. In this engine, at β = 0.1 and N = 1,000, the outcome
depends on χ (mean Gini over 200-round windows):

| χ | 5k | 20k | 40k | 80k |
| --- | --- | --- | --- | --- |
| 0.3 (3 seeds) | 0.361 | 0.377 | 0.365 | 0.362 |
| 0.1 (3 seeds) | 0.622 | 0.646 | 0.630 | 0.632 |
| 0.03 (seed 1, single rounds) | 0.837 | 0.908 | | |
| 0.01 (seed 1, single rounds) | 0.912 | 0.965 | | |

A strong enough income tax settles here; a weak one does not. The card could say so ("in this engine…") and
cite Bouleau & Chorro for the continuum result. One check is still to do: whether the χ needed to settle rises
toward 1 as β shrinks, as the continuum result implies. That is slow, because the time scale grows like 1/β².

## Vocabulary, second pass (2026-10-19)

Hamed: "simple is better". The blocks now say what changes and nothing else; every formula is unchanged (all 15
golden preset hashes are identical before and after).

| before | now |
| --- | --- |
| `stake.poorer`, `stake.loser` | `stake.share` β of the [poorer's \| loser's]: whose wealth sets the stake; the loser always pays |
| `coin.poorer`, `coin.richer` | `coin.tilt` toward [the poorer \| the richer] by b (constant); `coin.gap` favours [the richer \| the poorer], by ζ × the wealth gap |
| `tax.wealth`, `tax.above`, `tax.gains`, `tax.flat` | `tax.on` (rate) [of wealth \| of wealth above (x) \| of gains \| flat (a)] from [everyone \| the richest (q)] |
| `give.equal`, `give.poorest`, `give.wealth`, `give.lottery` | `give.to` [equally \| by wealth] to [everyone \| the poorest (q) \| one at random] |
| rates as 0.1 | `pct`: a share written 0.1, shown "10 %" |

Labels lost "in-play" (a trade only ever sees wealth in play), "into the pot" (a tax always goes there) and
"with repeats" (now "pairs, one at a time"). New starts: lognormal (σ), power law (α), two classes (the top q
hold s), one oligarch (holds s), and a country: the US from the Federal Reserve's Distributional Financial
Accounts (net worth by wealth group, 2026 Q2), each agent taking its rank's slice of the Lorenz curve through the
published group shares. "Drawn by the reader" stays deferred. The vocabulary was never published, so the ids
were replaced, not deprecated; AST and engine stay at version 1.

## The panel and its inputs (2026-10-19)

Hamed: sliders change on the fly. Level 0 readers use a panel beside the yard, level 1 the blocks, level 2 the
console. The panel is made of blocks:

- `panel.slider` (name, min, max, start): a number block that fits any number slot and draws a slider on the panel.
  Its ends and start are plain numbers. Two sliders with the same name are one slider.
- `panel.button` (name): a hat whose script runs once each time the button is pressed: economy, camera and panel
  blocks only (no loops, waits or setup).
- `panel.wait` (name): the run waits there until that button is pressed; a press before the wait does not count.
- `out.show` (a measure) and `panel.plot` (Gini over rounds, Lorenz curve, histogram): what the panel shows. Like the
  camera blocks they never change the economy.

Inputs are kept in a log: each slider move or button press with the step it came before (a step ends at a round,
a pause or a wait; the setup is the first). A run is then a function of (program, seed, inputs, round): moving a
slider never restarts it, and `seek` replays the log through pauses and through the waits it released. The
camera blocks now use the stage's pose words: `cam.pose` [room | ccdf | bars | … | density] scale [wealth | log |
log area] size [natural | equal | squared (x²)].

## Step blocks and observers (2026-10-19)

Hamed: blocks were too long for the screen; his suggestion was a trade block made of locked steps. Now:

- `trade` is a C-block whose body holds three locked steps, in order: `trade.pair` (pair up [pairing]),
  `trade.flip` (flip [coin]), `trade.pay` (pay [stake]). Each slot takes only its own options. Scope follows
  position: in flip the poorer and the richer are known; in pay also the winner and the loser.
- `tax` is a C-block with two steps: `tax.take` (take [τ]) and `tax.give` (give back [give.to | give.keep]).
  `give.keep` keeps the pot (a burn). The standalone `give` statement is gone.
- Any other block among the steps must be an observer: a camera block (`cam.pose`, `cam.photo`, `show.zoom`,
  `show.trades`, `show.tax`) or a panel output (`out.show`, `panel.plot`). Observers read and never write; when
  they run they tell the view (`Run.onView`). Stripping every observer leaves every state hash unchanged
  (tested). `show.trades` [in place | with partners meeting | at once] and `show.tax` [through the pot | at
  once] say how the yard shows a trade and a tax.
- In the editor the steps load locked (not movable, not deletable): a trade block always holds them.
- Golden hashes of all 15 presets are unchanged: the arithmetic is the same.
- On the stage the session applies the view events after the step that ran them (`Session.applyViews`);
  `fx` pins trades and levies for the session, a new program unpins them. A debtor is drawn at |w|, grey
  darkening toward −D, with a sad face; moves touching a debtor are not animated.

## Spec update (2026-10-19): the picture

Hamed's update, phase 1 of six (plan: squares, debt hole, thrift core, strength coin, groups, stats,
distributions, observers):

- The blocks say "squares in a yard"; the code keeps "agent".
- Debt is a hole: outline only at |w|, its line heavier toward −D, a sad face. Thrift is a solid inner core of
  area λ·w. Talent is never drawn unless a `show.colour` block colours by it.
- New observers: `show.colour` [own colours | wealth | rank | talent | thrift | last gain] (a pale-to-deep-blue
  ramp; wealth on a log scale, rank by position) and `show.outline` [the richest | the poorest | nobody]
  [one | 1 % | 10 % | half]. Phase 3 turns the highlight's choice into a Group.

## Spec update: the strength coin (phase 2)

- p(poorer wins) = ½ (1 + tanh(s_poorer − s_richer + artanh 2b)): `coin.strength` takes a strength s for each
  square (an expression reading "my") and the poorer's bonus b. Cards for its common cases: `coin.fair`,
  `coin.tilted` (s = 0: p = ½ ± b, computed exactly), `coin.share` (s = ½ ln w: p = w_p / (w_p + w_r), computed
  directly; with debt, of w + D).
- `coin.talent` is gone: the Merit model is now strength 2κ·talent (to first order the old line). Its golden
  hash was re-pinned; every other preset's is unchanged.
- `coin.gap` stays as its own card: Boghosian's straight line p = ½ ∓ ½ζΔw. His oligarch's gap is wide
  (ζΔw ≈ 0.5), where tanh bends away; with strength ζ·w the acceptance check 1 − χ/(βζ) fails by 0.06–0.07.
- `dmath.ts` gained tanh and artanh, built on its exp and log, so every browser computes the same bits.

## Spec update: groups (phase 3)

- A `Group` value type: `group.all` (everyone), `group.richest(q)`, `group.poorest(q)` (by the step's ranks, at
  least one), `group.random(q)` (exactly ⌈qN⌉, drawn once each time the step runs), `group.one` (the lottery),
  `group.where(condition reading "my")`, `group.combine` [and also in | or in | but not in], and
  `group.named(name)` for a group named in the setup by `group.define` ("call … “name”").
- Used by `tax.on` from, `give.to` to, `pair.match` among (squares outside sit the round out; partners cannot be
  shown meeting ahead then), and `show.outline` (rings the group as it is when the block runs). The old
  `from`/`to` fields are gone. With everyone, the arithmetic is the old one: every golden hash is unchanged.
- A named group is compiled afresh where it is used (its ranks are that step's); the validator wants it defined
  above its use, once per name (`unknown-group`, `setup-twice`).
- An observer with a group works it out on its own site (own snapshot, own draws): stripping observers still
  leaves every hash unchanged (tested with a random group).

## Spec update: the stats block, watch and log (phase 4)

- `stat.of`: [Gini | effective N | share | fraction of squares | Palma ratio | rank correlation with wealth |
  mean | median | min | max] of (property) over (group). Measured once per step, as the step began (like the
  globals); needs a running yard (`no-globals` in setup). Rank correlation is Spearman's, ties at their average
  rank: under Merit, talent and wealth correlate (> 0.3 at N 500, round 300); under a fair coin they barely do.
- `panel.number` (a number on the panel under a name, from any expression) replaces `out.show`; the panel works it
  out when it refreshes (`Run.evaluate(path)`, which changes nothing: tested by hash). A share or a fraction
  shows in percent. `panel.print` prints its value to the console each time it runs.
- `val.global` keeps N, round, total wealth and pot; the rest is the stats block's.
- On Gini with debt (asked 2026-10-19): the plain Gini is kept, as central banks report net-wealth Gini; it
  exceeds 1 when some owe. A "fraction of squares where wealth < 0" watch beside it says why.

## Spec update: distributions (phase 5)

- A `Distribution` value type: `dist.same(v)`, `dist.uniform(lo, hi)`, `dist.normal(m, s)`,
  `dist.exponential(mean)`, `dist.lognormal(σ)` (median 1), `dist.pareto(α)` (from 1), `dist.clip(d, lo, hi)`.
  Parameters are read once per step.
- The yard's start takes a distribution (below 0 counts as 0, with a warning; rescaled to mean 1) or an
  allocation that is not a sample (equal, two classes, one oligarch, a country). `start.random`, `.lognormal`,
  `.pareto` are gone: exponential, lognormal, power law. Talent and thrift each take one distribution (talent
  kept in [0, 1], thrift in [0, 1)); thrift's all/between mode is gone (same / uniform).
- `op.sample(d)` ("a draw from …") replaces `op.random` and `op.normal`: each square or pair its own draw,
  fresh each round, keyed by the block's place.
- The same formulas and draw streams as before: every golden hash is unchanged.
- "Drawn by the reader" stays deferred (it needs an array value).
- The property block reads "my talent", "the poorer’s wealth".

## Spec update: camera observers (phase 6)

- `show.arrange` (layout · pose · scale · sort) replaces `cam.pose`: the stage's recipe words (squares, bars,
  columns, triangles, hexagons · standing free, still, in a row, stacked, packed, folded · area = wealth, log,
  log area, side = wealth, all the same size · unsorted, poorest first, richest first, shuffled). Named charts
  (ccdf, lineup…) stay the console's.
- `show.hold(seconds)` replaces `cam.photo`: the view holds still, play waits (60 s at most).
- `show.zoom(group)`: the camera frames the group as it was when the block ran (everyone: the whole yard);
  the title line stays where it is for the whole yard.
- Observers now in all: arrange, hold, colour by, highlight, follow, trades, levy, watch, log, plot; the economy
  never sees any of them (the strip test).

## Recheck 2 (REVIEW-2026-10-19-MODEL-BLOCKS-RECHECK-2): N1–N11 and the acceptance timeout

Each finding has a regression test, seen failing first (`tests/model/recheck2.test.ts`,
`tests/recheck2-session.test.ts`, `tests/browser/editor.spec.ts`).

- Observers run where they stand: in a trade before pair up, after it (flip and pay go pair by pair, so between
  them counts as before the payments), after pay; in a tax before take, between take and give, after give. Each
  looks through `Runtime.observe`: its own snapshot and draws, the step's context put back (N3).
- A square's own expression (a strength, a group's condition) draws at that square's index (N4). A group's
  fraction is read once per step, at the scalar index (N5). A random group of q = 0 is empty; the ranked
  groups keep at least one (N6).
- An input after a seek back replaces the unreplayed future: it applies at once and the log stays in order (N8).
- The stage: a pause block (or the end) stops play; Play or Step goes on (N2). A hold asked mid-batch stops the
  batch there and applies at once (N7). A failed command restores the queued camera requests as they were; a
  new program drops the old one's (N9). A slider compares with the run's value, so it can resend after Restart
  (N1). A library pick made while the blocks load is kept (N10). The drawer compares programs canonically (sorted
  keys, `canonical` in ast.ts), so opening Rules on a shared model never restarts it (N11).
- `npm run test:accept`: a turn of the event loop between runs (`tests/accept/yield.ts`), so a slow machine no
  longer hits vitest's 60 s RPC timeout (reproduced with 7 × 10 s of busy tests; gone with the yield).

## Arrange, shape, scale; the panel's place (2026-10-19)

Hamed: where squares are embedded, their shape and their scale are unrelated concepts; sort goes with the
embedding.

- `show.arrange` [standing free | standing still | on a square lattice | in a row | in a stack | packed into one
  square] [in no order | poorest first | richest first | shuffled]; `show.shape` [squares | bars | columns |
  triangles | hexagons]; `show.size` [area = wealth | side = wealth (area x²) | area = log wealth | log of area |
  all the same size]. Each sets only its own slots of the stage's pose.
- The lattice is new (stage/core/figure.ts): ⌈√N⌉ to a row in sort order, each body centred in an equal cell,
  cells the yard's width over ⌈√N⌉, wider if a body needs it. Positions hold still while the run plays.
- "Packed together" (Hamed: "nothing is exact, visually pleasant") is shelves (stage/core/pack.ts `shelves`):
  bodies keep their own shapes, in rows in sort order from the bottom (richest first: the biggest stand at the
  bottom), a small even gap; a nearly full row is justified to the block's width, a short one centred; the
  width is chosen so the block comes out about square. It replaces the ragged strip packing of the `pack`
  pose. The exact one-square treemap stays the console's `fold`.
- The panel: its top at the yard's top, two thirds of the side's width (a third left empty), as short as its
  content. The console starts closed (` or ›_ opens it; `?console=1` opens it on load). On a phone the yard
  keeps at least a square of the width.

## Recheck 3 (REVIEW-2026-10-19-MODEL-BLOCKS-RECHECK-3): N2, N7, N11 closed

- With partners meeting before each round (`fx trade toss`), a hold now comes first (no meeting, no round while
  it lasts) and a pause or the end stops play, as in the other play paths (N2, N7).
- A percentage whose rounded display would not read back as the same value (1/3 shows as 33.3333333333 %) keeps
  its exact value in the block's data, used while the field still shows what it showed: opening the blocks
  never changes a program; a typed value is what was typed (N11).
- Regressions: `tests/recheck2-session.test.ts` (meeting mode), `tests/blocks/convert.test.ts` (1/3 through
  Blockly), `tests/browser/editor.spec.ts` N11b (the reviewer's shared-run reproduction); each seen failing first.

## The start is a distribution (vocabulary step 2, 2026-10-19)

The yard's start slot takes a distribution and nothing else. `start.equal` is `dist.same(1)`; the allocations are
distributions too: `alloc.classes(q, s)`, `alloc.oligarch(s)`, `alloc.country(country)` (everyone's share set at
once in a shuffled order, then read square by square, so they also work as a draw or for talent). The `Start`
value type, the start knob and the Start section are gone. Same arithmetic and draws: golden hashes unchanged.

## Space in the model (vocabulary step 3, 2026-10-19)

The yard block says where the squares live: `setup.yard` field `space` [standing anywhere | on a square lattice].
On a lattice each square holds a cell of the model's torus (as before); "neighbours within r" and "move" need it
(`needs-lattice` otherwise). The Show block's "in their places" draws them where the model has them: anywhere in
the yard, or each in its lattice cell (so local trade is seen between neighbours); a yard on a lattice poses its
squares there as soon as it loads. The Local model is on a lattice. Golden hashes unchanged (the field changes
no arithmetic).

## Vocabulary cleanup (2026-10-19, from Hamed's pasted note)

- **One flip card**: `coin.strength` (strength, underdog); fair is 0 and 0 (the trade's default), a tilt is an
  underdog bonus alone (exactly ½ ± b), "in proportion to wealth" is strength ½ log wealth. `coin.fair`,
  `coin.tilted`, `coin.share` are gone. **Kept apart**: `coin.gap`, Boghosian's advantage: his straight line is
  not a strength (the tanh form misses 1 − χ/(βζ) by 0.06–0.07 at his oligarch's gap; acceptance). *Superseded
  the same day, below.*
- **No modes**: no block's inputs depend on a field. `tax.on` is four take cards (`take.wealth`, `take.above`,
  `take.gains`, `take.flat`); `op.fn` is functions of one number, `op.fn2` of two (min, max, power). The mode
  machinery (dummy inputs, the mode extension, `WHEN_LABELS`) is gone, and with it review MB4's case.
- **The yard and its start apart**: `setup.yard` is how many and where (`space`); `setup.start` "start with" a
  distribution or an allocation (without it everyone starts the same). Allocations (`alloc.classes`,
  `alloc.oligarch`, `alloc.country`) are their own type and section, for a start only.
- **One word per idea**: pair up / flip / pay, take / give back, call (a group); issues say the slot by its
  step. Camera blocks are `show.*`; the panel's are `panel.*` (slider, button, wait; number, plot, print).
  `show.arrange`'s field is `layout`.
- **Words**: `blocks/words/blocks.en.ts` (one entry per block in palette order: label, dropdown words, a
  one-sentence tip; formulas only on option cards), `issues.en.ts`, `presets.en.ts`. Show blocks get one badge
  from their category ("Show · looks only:") instead of "No effect on the economy" in every tip. Curly quotes
  and … throughout; no "~" in labels.
- Golden hashes unchanged.

## Advantage on the flip card; eight categories (2026-10-19)

- Hamed: drop the advantage card, keep the model. The Advantage preset ("Advantage: the richer are stronger") is
  the flip card with strength ζ × my wealth, underdog 0; `coin.gap` is gone. For small gaps this is Boghosian's
  p ≈ ½ − ½ζΔw; at his oligarch's wide gap tanh bends below the straight line, so the oligarch is smaller.
- Acceptance (his decision): the threshold row stays (βζ = χ is unchanged, the coins agree at small gaps); the
  size rows compare with the tanh coin's own balance, (1 − c)·tanh(ζcN)/(ζcN) = χ/(βζ): 0.321 / 0.465 / 0.585
  against measured 0.264 / 0.438 / 0.594 (± 0.03; ± 0.06 near the threshold, where the oligarch settles slowly
  and the straight-line prototype also sat 0.02 low). The straight-line law is printed beside it.
- The preset's golden hash is unchanged (in 200 rounds no draw falls between the two coins' p).
- Six categories had two too full (Economy 18, Numbers 21): eight now, Run · Yard · Trade · Tax & growth · Who ·
  Numbers · Random · Show (9 · 9 · 9 · 9 · 8 · 13 · 8 · 13).

## Recheck 5 (REVIEW-2026-10-19-MODEL-BLOCKS-RECHECK-5): R1–R3

- R1: "in their places" follows the yard everywhere a game is made (construction, seed, N, program): a
  lattice yard's figure is built on the model's cells from the first frame.
- R2: the proportional flip recipe is strength ½ log(max(my wealth in play, 10⁻³⁰⁰)): nothing in play gives
  strength ≈ −345 and p exactly 0, and with debt the odds use w + D, as the old card did.
- R3: the Advantage card states the strength coin's outcome (about 46 % at ζ = 0.01) with Boghosian's
  straight-line 50 % beside it.
- Wording from the review: "underdog bonus", a fair coin and a 5 % bonus spelled out in the tip; pay says "wealth
  in play"; the start tip points to Random, a named group's tip to Yard's "call …". Moving `move` beside the
  yard and worked examples in the toolbox are left for a reader test.
- Regressions: `tests/recheck5.test.ts`, each seen failing first.
- Recheck 6, R4: the Distributions heading is short again so it fits a phone's flyout; the start tip still points
  to Random.
