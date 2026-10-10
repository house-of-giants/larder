# Larder PRODUCT.md

## Register

Product-first, one surface. Two moments: the kitchen (plan the week, cook, leftovers,
pantry at a glance) and the store (the list). There is no marketing page in v1; the root
route is the app behind sign-in. Treat every task in the product register.

## Users and purpose

A household that batch-cooks a week of recipes on the weekend and eats through it. Two
phones, one pantry. The jobs, in the order they happen each week:

1. Pick the week's recipes (an agent proposes, the household approves, or someone picks
   by hand from the house recipes).
2. Get a list that already knows what is in the pantry, grouped by store section.
3. Check it off in the aisle with no signal; checked items become pantry.
4. Say "made it" and have the pantry and the leftovers follow without arithmetic.
5. See what is in the fridge for lunch at a glance.
6. Close the week in one tap and start the next.

Agents do the planning and the recipe importing through an MCP door. The app is where
humans read and tap. The app itself makes no LLM calls.

## Brand personality

Plain, quiet, kitchen-counter. It says what is in the house and what to buy. Copy reads
like a note on the fridge: "Out of eggs." "Sliders: 7 left." No streaks, no scores, no
nutrition theater, no exclamation points.

## Anti-references

- No nutrition tracking, calories, or macros.
- No prices, budgets, or receipts.
- No required per-portion logging; the weekly closeout is the reconcile.
- No LLM calls inside the app; agents are the AI and come through the door.
- No social features, no sharing outside the household, no recipe marketplace.
- No fake precision: bulk goods and spices are levels (full, half, low, out), not
  tablespoons.
- No unit conversion in v1; same-unit math only, with the recipe's own words preserved.

## Design principles

- Mobile-first PWA. Everything works one-thumbed at phone width; desktop is the same
  layout, wider.
- Store mode is the loudest screen: large check rows, section headers, a store filter,
  works offline, check-offs queue and replay on reconnect.
- Kitchen screens are dense but calm: pantry at a glance, this week's recipes, leftovers
  with counts.
- Visual world (chosen 2026-10-10 from the three-world lab, "B. Kitchen counter"): warm
  cream page, one tomato accent used once per screen, serif display for screen and aisle
  titles, sans for everything else, amounts set in the accent under the item name, "for
  <recipe>" as the quiet second line, a Tonight card leading the week. DESIGN.md in the
  repo is the token source; shadcn/ui, Tailwind v4, dark mode, reduced motion honored.
- Tabular figures in the sans for quantities and counts (not monospace; the mono `num`
  utility fragmented every row and was dropped in the 2026-10-10 overhaul).
- Every inventory write is an event. Undo is a first-class action on check-off, cook,
  consume, and closeout.
- The recipe's words win on screen ("1/2 cup", "1 knob", "as needed"); decimals exist for
  math, never for display.
