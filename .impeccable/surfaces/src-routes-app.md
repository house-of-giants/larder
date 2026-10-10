---
version: 1
slug: "src-routes-app"
primary_target: "src/routes/_app"
related_targets: []
---

# Surface brief: the signed-in app (`src/routes/_app`)

Scope: every screen behind sign-in (week, list, reconcile, pantry, recipes, leftovers, closeout, settings) plus the sign-in and join cards, which follow the same tokens. Visitor mode: Operate. Audience: a two-phone household; one person plans and cooks on Sunday, the other reads the list in a store with one thumb. Job: see the next thing to buy or cook without reading; trust that a tap registered. Proof and content: the real household's pantry, recipes and week; nothing invented. Constraints: PWA at 390 px first, offline store list, Convex functions and copy unchanged, household isolation, no LLM in the app, no schema change unless additive and recorded.

Chosen direction (Dominic, 2026-10-10): World B, "Kitchen counter", from the three-world lab at `operator-artifacts/html-plans/larder-ux-lab`. Memorable moment: a tomato amount under every item name, and a tick that fills tomato and stays put.

## Direction contract

THESIS: A note on the fridge, not a to-do app. Cream paper, black ink, one tomato pen, and a serif only for the words that name things. It refuses the category arrangement it replaces: bordered card rows, square checkboxes, a primary button on every card, six tabs, monospace numbers.

OWN-WORLD: Paper #faf6ee (dark #1e1a16), ink #2b2622 (#f3ece1), quiet ink #776d63 (#b3a797), hairline #e8e0d2 (#3a332c), tomato #b93a20 (#ee7757) with pale #f6dfd6 (#4a2a21) and tomato ink #8e2a14 (#ffd2c5). Young Serif at 32 and 22 for titles and aisle headings; the system sans at 17/15/13/11 for everything else with tabular figures. Rows with hairlines, 22 px circle checks, pills at 44, chips at 8 px radius, one white card per screen at most. With all content removed it is a cream page with one serif heading, one hairline, one tomato dot.

STORY: The household opens the list in the aisle and reads the next three things and their amounts without stopping the cart; a tap fills a tomato circle and the row goes quiet where it stands. On Sunday the week screen says what is for tonight, in a serif, with one pale pill to say Made it; the sheet asks one question (batches) and answers with a sentence.

FIRST VIEWPORT: Store list at 390 px: nav row with the household name and gear; "Store" in serif 32; "33 to get · Week of Oct 9" in quiet 13 with the offline note in tomato; a scrolling chip row with a right fade; "Produce" in serif 22 with "11 to get" in quiet 13 on the right; rows of 56 px: circle, name 17, amount in tomato 13/600 and "for Pot roast" in quiet italic; two checked rows at the end of the aisle, filled; a tomato 56 px add button bottom-right above a four-tab bar. The primary action is the floating add button; on the week screen it is the centred "Make the list" pill above the tab bar.

FORM: Brief-pinned world B (second of the three lab candidates by the judges' totals; both judges scored it highest). Impeccable roll key e196013f (direction, operate) dealt six catalog challengers, all declined on product clarity; the ticket wallet's "nothing disappears, it cancels" was kept as the checked-row behaviour. No concept-seed telemetry rerun: the pick was not from the roll.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Unresolved

- Serif at 390 px against the longest recipe names (both judges asked). Checked in the gallery route and the week slice.
- Whether aisle headings stay sticky under the app header (the current app's do; the lab did not say). Decision: sticky, z-index 10 under the header, under the tab bar.
- Desktop at 1024+: left rail with the four entries; the column widens to 672 px. Slice 6.
