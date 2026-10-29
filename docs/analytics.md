# Umami analytics

Automatic pageviews remain enabled on the main page, About, and Making Of, restricted to `hamed.github.io` as before. Learn, Play, and Build are views within the main document; they use events rather than synthetic pageviews. Cloudflare's existing integration is unchanged.

`public/analytics-init.js` installs the before-send hook before Umami can run. Umami loads asynchronously, so an unavailable tracker cannot hold up the app. `data-exclude-hash="true"` prevents replay fragments and share-button address-bar updates from generating pageviews. The hook removes fragments and `fs_share` from both analytics URLs and referrers, preserving other query parameters (including campaign attribution). It does not change the actual address or simulation.

`stage/analytics.ts` provides the shared typed client. Missing Umami queues the first 100 events in document memory. Its script's load flushes the queue; an error discards it. There is no persistent queue, retry loop, cookie, or visitor identifier. Thrown errors and rejected tracking promises are ignored. Every event includes `page`: `main`, `about`, or `making_of`. Properties are scalar strings, booleans, or finite numbers, capped at 50 properties and 500 characters per string; Umami stores numbers at its supported precision. See [tracker functions](https://docs.umami.is/docs/tracker-functions) and [tracker configuration](https://docs.umami.is/docs/tracker-configuration).

Promotional links may also add `campaign_id`, taken from an eight-character lowercase/alphanumeric `utm_content`. This identifies a placement, not a visitor. Links use the site's own URL directly, with the ID as their only campaign parameter. UTM tags follow internal links across all three pages; custom events keep the ID, while Umami's native UTM reports receive the tags from the URLs. Newly generated simulation-share links do not carry the original campaign tags. Placement meanings are managed privately, outside the repository; see [the private campaign workflow](campaigns.md).

## Events and counting

| Event | Properties besides `page` | Counting rule |
|---|---|---|
| `entry_choice` | `destination`: `learn`, `play`, `build`, `about` | First destination selected on a fresh landing, once per document. Canvas/keyboard entry and the opening ending in Play count as `play`; later tab changes are navigation. Saved links, embeds, and `?opening=0` bypass the fresh-landing flow. |
| `navigation` | `destination`, `source` | Subsequent navigation, including menu controls, `byline`, `build_close`, `library_follow`, `shared` (the line over a shared yard: its Learn button), and links on the prose pages. The first entry choice is not also navigation. Selecting the current view does not count; Play's play/pause action uses engagement. `about_socials` denotes the Follow link. |
| `learn_start` | `run` | Once when a Learn run starts. `run` is an incrementing document-local sequence, not a visitor identifier. Re-entering Learn starts a new run. |
| `learn_progress` | `run`, `act` | First entry into each act per run. Acts are numbered 1–4; revisiting an act does not count again. |
| `learn_choice_shown` | `run`, `question`: `prediction`, `photos` or `yard` | Once for each question per run, on first entry into its beat. |
| `learn_choice` | `run`, `question`, `answer`, `attempt`, `method` plus question-specific properties below | First answer is attempt 1; each changed answer increments it. Duplicate answers, checkpoint restoration, and automatic replay do not count. |
| `learn_action` | `run`, `action`: `skip_act`, `jump_act`, `help`; `act`, `beat`; `destination_act` for jumps | Each deliberate action. Programmatic checkpoint fallback does not count as an act jump. |
| `learn_complete` | `run`, `skipped`, `assisted` | Once when the final `open` beat is reached. `skipped` means an act was skipped or jumped forward; `assisted` means “Do it for me” was used. Leaving Learn early is not completion. |
| `about_click` | `destination`, `category` | Each outbound activation, including middle-clicks. Internal links also count middle-clicks as navigation; right-clicks do not count. Records interest, not a purchase, payment, or completed transaction. |
| `share` | `source`, `context`, `method`, `outcome`, simulation properties; `embed_mode` for embeds | One `attempt`, then one outcome per Copy activation. Opening or closing the dialog does not count as a share. Filter on outcome to avoid counting attempts and successes twice. Context is `learn`, `play`, or `build`; source is `yard`, `square`, or `embed`. |
| `shared_link_open` | `source`, `status`: `loaded` or `invalid`; simulation properties only if loaded | Once per document, on initial load of a simulation fragment or share marker. Old untagged links have source `unknown`. Sharing in the same document does not count as opening a shared link. A marker without a simulation is invalid. |
| `play_engaged` | `action` | First deliberate Play interaction per document: run/view controls, sliders, square selection, or keyboard play/pause. Loading, Learn scripts, replay, and merely opening Play do not count. Sharing has its own events. |
| `build_edited` | — | First changed, valid manual program edit per document. Invalid edits, initial editor loading, Library selection, and shared-program restoration do not count. |
| `model_selected` | `model` | Each enabled Library selection, using its stable preset ID. Disabled/hidden models cannot count. |

Photos answers are `take` (Act 3) or `skip` (straight to Act 4, the yard as it is); they have `method: manual`, and taking the offered skip does not set `learn_complete`'s `skipped`. Prediction answers are `left`, `same`, or `right`; a picked prediction stays on screen for a moment, then the story goes on by itself, so revisions are rarer than before 2026-10-29. They include `left_share` and `right_share`, each player's fraction of all wealth at the time of answering, on the same basis as the simulation's other wealth shares. `method` is `manual` or `assisted`.

Yard answers always have `method: manual`. `answer` and `yard_id` identify the rule set, e.g. `stake_0.3_tax_0.01`; `stake` and `tax` are numerical fractions, not percentages. `position` is the displayed yard number (1–3), independent of the rule identity. The simulation summary comes from that yard's live session. A return to the question permits a different manual answer and counts it as a revision. Assistance is hidden and guarded both in the runner and widget, and Next cannot bypass the choice. All available yards have the same static 2px gold outline, with stronger hover/focus feedback.

Share and Embed in the game open the same preview-and-copy dialog on desktop and touch devices. The clipboard method records `copied` or `failed`; there is no automatic native-share handoff. Summary properties describe the captured state shown in the dialog, even if the simulation continues behind it. Embeds add `embed_mode: live|frozen`: Live starts trading, while Frozen opens paused at the same captured state. Generated links put `fs_share=yard|square|embed` in the query, outside the existing simulation fragment; no individual link ID is generated. The embed and playback flags remain in the fragment. Source attribution is read before its analytics URL is normalised. The optional “Buy me a coffee” button appears beside Copy only after a successful copy; its activation uses the existing `about_click` event with `destination: kofi` and `category: payment`.

Outbound destinations are explicitly enumerated rather than collected as arbitrary URLs:

| Category | Destinations |
|---|---|
| `social` | `x`, `linkedin`, `instagram`, `tiktok`, `youtube`, `github` |
| `books` | `amazon_books`, `bookshop` (when a Bookshop link exists) |
| `payment` | `kofi`, `paypal` |
| `research` | `arxiv`, `doi` |

## Simulation properties

`stage/analytics/simulation.ts` supplies the same flat summary for share events, successfully loaded incoming links, and yard answers.

| Group | Properties | Meaning |
|---|---|---|
| Identity | `sim_model`, `sim_custom`, `sim_n`, `sim_seed` | Exact preset ID, exact built-in `stage` program, or `custom`; custom flag; actual player count and seed. Edited/unmatched programs are custom. Live slider changes preserve the underlying program identity. |
| Progress | `sim_round`, `sim_step`, `sim_input_count` | Current round, engine step, and number of recorded inputs. No input contents are sent. |
| Rules | `sim_stake_rule`, `sim_stake`, `sim_tax_rule`, `sim_tax`, `sim_coin_rule` | Rule categories and unambiguous scalar parameters. |
| Display | `sim_layout`, `sim_shape`, `sim_scale`, `sim_size`, `sim_order` | Actual current display recipe values, using existing IDs. |
| Statistics | `sim_gini`, `sim_neff`, `sim_richest_share`, `sim_pot_share` | Live engine statistics; wealth shares are fractions. |

Stake categories include `poorer_share`, `loser_share`, `split`, `fixed`, `expression`, `multiple`, and `none`. Tax categories identify the take rule (`wealth`, `gains`, `flat`, `above`), `expression`, `multiple`, or `none`. A share/tax parameter computed by an expression adds `_expression` to its category. Coin categories are `fair`, `strength`, `probability`, `expression`, `multiple`, or `none`.

Numeric `sim_stake`/`sim_tax` are emitted only for a single literal or an actual live slider with literal bounds/default. Fixed stakes and flat taxes are amounts in the program's wealth units; share stakes and rate taxes are fractions. Multiple rules and ambiguous expression parameters omit the numeric property. The convenience `game.rules` getter is deliberately not used: it supplies defaults when a program has no corresponding slider.

No complete programs, input histories, free-form questions, author credits, full replay URLs, or link-specific IDs are included in event properties. These summaries support comparison and filtering, not exact reconstruction.

## Validation

Unit tests cover the bounded client, URL sanitisation, literal/slider/expression/multiple-rule summaries, exact preset identity, Learn counting, and replay invariance. Chromium analytics tests fulfill the tracker script locally, capture events and normalised pageviews, and mock clipboard outcomes. They do not send real Umami events. Interaction tests cover both questions, revisions, keyboard selection, equal desktop/mobile outlines, navigation, outbound interest, the share dialog, live/frozen embeds, incoming old/new/embed links, and blocked/late loading. Existing editor and Learn tests retain full-program coverage, using explicit manual yard selection.
