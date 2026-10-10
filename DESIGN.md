---
name: Larder
description: A kitchen-counter pantry and meal-week app, cream paper, one tomato, a serif only for the words that name things.
colors:
  paper: "#faf6ee"
  paper-card: "#fffdf8"
  paper-well: "#f1ebe0"
  ink: "#2b2622"
  ink-quiet: "#776d63"
  hairline: "#e8e0d2"
  ring: "#978c7e"
  tomato: "#b93a20"
  tomato-pale: "#f6dfd6"
  tomato-ink: "#8e2a14"
  on-tomato: "#ffffff"
  dark-paper: "#1e1a16"
  dark-paper-card: "#26211c"
  dark-paper-sheet: "#2a2521"
  dark-paper-well: "#2f2925"
  dark-ink: "#f3ece1"
  dark-ink-quiet: "#b3a797"
  dark-hairline: "#3a332c"
  dark-ring: "#7a6f64"
  dark-tomato: "#ee7757"
  dark-tomato-pale: "#4a2a21"
  dark-tomato-ink: "#ffd2c5"
  dark-on-tomato: "#1e1a16"
typography:
  display:
    fontFamily: "Young Serif, Georgia, Times New Roman, serif"
    fontSize: "2rem"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-0.005em"
  title:
    fontFamily: "Young Serif, Georgia, Times New Roman, serif"
    fontSize: "1.375rem"
    fontWeight: 400
    lineHeight: 1.2
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.3
  secondary:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.35
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.35
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.02em"
rounded:
  chip: "8px"
  field: "10px"
  card: "14px"
  sheet: "18px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  gutter: "20px"
  xl: "24px"
components:
  pill-primary:
    backgroundColor: "{colors.tomato}"
    textColor: "{colors.on-tomato}"
    typography: "{typography.secondary}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  pill-pale:
    backgroundColor: "{colors.tomato-pale}"
    textColor: "{colors.tomato-ink}"
    typography: "{typography.secondary}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  chip:
    backgroundColor: "{colors.paper-card}"
    textColor: "{colors.ink-quiet}"
    typography: "{typography.caption}"
    rounded: "{rounded.chip}"
    padding: "6px 10px"
  chip-on:
    backgroundColor: "{colors.tomato-pale}"
    textColor: "{colors.tomato-ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.chip}"
    padding: "6px 10px"
  list-row:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "6px 0"
    height: "56px"
  aisle-heading:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    padding: "16px 0 4px"
  card:
    backgroundColor: "{colors.paper-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "14px 16px"
  field:
    backgroundColor: "{colors.paper-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "0 12px"
    height: "44px"
  half-sheet:
    backgroundColor: "{colors.paper-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
    padding: "16px 20px 0"
  tab-bar:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-quiet}"
    typography: "{typography.label}"
    height: "64px"
  fab:
    backgroundColor: "{colors.tomato}"
    textColor: "{colors.on-tomato}"
    rounded: "{rounded.pill}"
    size: "56px"
---

# Design System: Larder

## Overview

**Creative North Star: "The Kitchen Counter"**

Larder is the note on the fridge made into an app: cream paper, black ink, one tomato pen. The page is the colour of good paper, the words are set plainly, and a serif face is used only for the things that have names (the screen, the aisle, tonight's recipe). Amounts are the one thing that gets the tomato, because an amount is the one thing you need at the shelf. Everything else, including the recipe a thing is for, stays quiet grey. Nothing is decorated: no cards inside cards, no coloured borders, no icon tiles, no progress rings. Density comes from rows, not boxes.

The world was chosen on 2026-10-10 from a three-world lab (A quiet list, B kitchen counter, C dense calm) with Mela, Crouton, Apple Reminders and Things as the craft bar. The shadcn starter look it replaces (bordered card rows, square checkboxes, monospace quantities, six tabs, a green primary on every card) is anti-reference: evidence of what the product is, not of how it should look.

**Key Characteristics:**

- Cream paper, warm dark ink, one tomato accent used once per screen as a control and once per row as the amount.
- Serif display (Young Serif) for titles and aisle headings only; the system sans for every other word.
- Rows, not cards: hairlines between rows, headings over groups, white cards only for the one thing that leads (Tonight, a sheet).
- Tabular figures in the sans for every number; no monospace anywhere.
- Four tabs, one floating action, one pill per screen, and the primary control where the thumb lands.

## Colors

Paper and ink with one tomato; the dark theme is the same kitchen with the lights off, warm rather than blue.

### Primary

- **Tomato** (#b93a20 light, #ee7757 dark): the accent. The amount under every list row, the filled tick on a checked row, the one primary pill on a screen, the floating add button, the active tab. Dark text on tomato in the dark theme (#1e1a16), white on it in the light theme.
- **Tomato Pale** (#f6dfd6 light, #4a2a21 dark) with **Tomato Ink** (#8e2a14 light, #ffd2c5 dark): the pale pill and the selected chip. The same accent at half strength, never a second colour.

### Neutral

- **Paper** (#faf6ee light, #1e1a16 dark): the page.
- **Paper Card** (#fffdf8 light, #26211c dark) and **Paper Sheet** (#fffdf8 light, #2a2521 dark): the one leading card on a screen, the half sheet, inputs, chips at rest.
- **Paper Well** (#f1ebe0 light, #2f2925 dark): secondary buttons and muted surfaces.
- **Ink** (#2b2622 light, #f3ece1 dark): names, titles, body.
- **Ink Quiet** (#776d63 light, #b3a797 dark): the second line, captions, tab labels at rest, "for Pot roast". At or above 4.5:1 on paper in both themes.
- **Hairline** (#e8e0d2 light, #3a332c dark): the one-pixel rule between rows and under headings.
- **Ring** (#978c7e light, #7a6f64 dark): the unchecked circle's stroke and the boundary of every field, at or above 3:1 on paper and on card (the lighter #a89d8d from the lab measured 2.47:1 and was dropped).

### Named Rules

**The One Tomato Rule.** Tomato appears as at most one control per screen (the pill, or the floating button) plus the amounts and ticks in rows. A second tinted control on the same screen is wrong; demote it to the pale pill, a text link, or an outline.
**The Warm Dark Rule.** Dark mode keeps the hue of paper (warm brown-black, never blue-black) and lifts the tomato to #ee7757 so it still reads at 13 px. Text on tomato flips to dark ink.
**The Destructive Rule.** Destructive actions use tomato ink (`--destructive` maps to it) as text or an outline, never a filled button and never a separate red. The confirm dialog carries the consequence in words; colour does not.

## Typography

**Display Font:** Young Serif (with Georgia, Times New Roman, serif), self-hosted woff2, latin and latin-ext subsets, SIL OFL 1.1.
**Body Font:** the system sans (-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif).
**Numbers:** the body font with `font-variant-numeric: tabular-nums` (the `tabular` utility). There is no monospace face.

**Character:** a bookish serif for the few words that name things, over a plain sans that disappears into the content. The serif is never used for body, buttons, labels, or numbers in a sentence; it is used for the yield numeral in a week row because that numeral is a title-sized fact.

### Hierarchy

- **Display** (400, 32px, 1.1, serif): the screen title ("Store", "Week of Oct 9"). One per screen.
- **Title** (400, 22px, 1.2, serif): aisle headings, the Tonight card's recipe name, "This week", the sheet title at 24px.
- **Body** (400, 17px, 1.3, sans): row names, ingredient lines, sheet rows.
- **Secondary** (400 or 600, 15px, 1.35, sans; class `text-subhead`, because Tailwind owns `text-secondary` for the colour): pill labels, filter text, inline actions.
- **Caption** (400, 13px, 1.35, sans): the second line under a row, progress lines ("33 to get · Week of Oct 9"), chips, notes, counts beside headings.
- **Label** (400, 11px, 1.2, 0.02em, sans): tab labels, the word under a yield numeral ("portions"), nothing else.

### Named Rules

**The Four Sizes Rule.** Body copy uses 17, 15, 13 and 11 only; display and title are the two serif sizes above them. A seventh size is a mistake.
**The Amount Rule.** An amount is `quantityText` plus its unit, both in tomato at 600 weight ("1 1/2 lb", "2 sprigs"), with tabular figures on the numeral only; "as needed" and other amounts with no number are quiet ink. It sits on its own line under the name in lists, and before the name in a sheet row. The words after the amount ("for Pot roast", the ingredient name) are plain.
**The Plural Rule.** Units are written as the cook would say them: "8 biscuits", "2 sprigs", "1 lb", "3" with no unit when the unit is "each".

## Layout

One column at phone width with a 20px gutter, rows stacked with a hairline between them and a title-sized heading over each group. The screen title sits under a 36px nav row (household name on the left in caption, the gear on the right) with its progress line directly beneath. A sticky stack order that never changes: the app header above section headings, and the tab bar above both (z-index 20 for the tab bar, 10 for sticky headings, 30 for the app header). Content pads its bottom by the tab bar's height plus the safe-area inset plus one hairline, so the last row clears the bar.

Primary actions sit at the bottom of the scroll, above the tab bar, on a paper gradient: a centred pill ("Make the list") or a 56px floating circle at the right edge. Secondary actions are text in tomato ink on the line under the progress line, never a wrapping row of buttons.

At 1024px and wider the same column widens to 672px and the tab bar leaves; navigation moves to a left rail with the same four entries and the gear. Nothing is rearranged; the kitchen is the same room with more counter.

Motion is one authored moment: a checked row fills its circle and fades its name in 120ms, then sinks to the end of its aisle on the next layout. Sheets rise from the bottom in 240ms with an ease-out. Reduced motion collapses both to instant.

## Elevation & Depth

Flat by default. The page is paper and the rows sit on it with hairlines, not shadows. Three surfaces carry depth and nothing else does: the floating add button (`0 6px 16px rgba(43,38,34,0.18)`), the half sheet (a dim scrim `rgba(43,38,34,0.4)` behind it and no shadow of its own), and the leading card (Tonight), which is Paper Card with a hairline border and no shadow.

### Named Rules

**The No Box Rule.** A list is rows with hairlines, never a bordered card around the group. The only white cards on a screen are the one thing that leads (Tonight) and the sheet.

## Shapes

Soft but not bubbly: 8px chips, 10px fields, 14px cards, 18px on the sheet's top corners, and full pills for every primary and pale action. Checks are 22px circles with a 1.5px ring; checked, the circle fills tomato with a 14px check at stroke 3. Icons are Lucide at 24px (tabs) or 16 to 20px (inline), stroke 1.8 to 2, never filled, never in tiles.

## Components

### List row

The row that the store list, the pantry, reconcile and the sheet all share.

- **Shape:** 56px minimum height, no border, a hairline under it; the whole row is the tap target.
- **Anatomy:** 22px circle on the left, then two lines: the name in Body ink, the amount in tomato caption-weight 600 followed by "for <recipe>" in quiet italic caption. A trailing control is never a kebab; row menus do not exist.
- **Checked:** circle fills tomato with a white (dark: ink) check, the name and amount go quiet, the row stays where it is until the next layout, then sinks to the end of its aisle. No strikethrough.
- **Put back:** a dashed ring and a plus, quiet ink.

### Aisle heading

- **Style:** Title serif on the left, "N to get" in quiet caption on the right, 16px above and 4px below, sitting on the page (sticky at z-index 10 under the app header). Collapsed, a chevron replaces the count.

### Amount

- **Style:** figure and unit in tomato, 600 weight, tabular figures on the figure; the words after it plain. Quiet ink when the recipe gives no number ("as needed").

### Pills and buttons

- **Primary pill:** tomato fill, white text (dark ink in dark mode), 44px, 20px side padding, Secondary 600. One per screen, at the bottom on a paper gradient or in a sheet footer at full width (50px).
- **Pale pill:** tomato pale fill with tomato ink text; the "Made it" on the Tonight card, with a 18px pot icon.
- **Outline:** hairline border, ink text, Paper Card fill. Used for "Made it" on non-leading rows and for the second action in a dialog.
- **Text action:** tomato ink, Secondary weight 400, no underline, 44px tap height. Secondary actions under the progress line.
- **Hover / focus:** no hover tint on touch; focus-visible is a 2px solid tomato ring with a 2px paper offset (solid, never translucent: a 50% ring measured under 3:1).

### Chips

- **Style:** Paper Card fill, hairline border, 8px radius, caption text in quiet ink; selected is tomato pale with tomato ink at 600 and no border. The store filter row scrolls horizontally with a right-edge fade and the selected chip scrolled into view.

### Half sheet

- **Style:** rises from the bottom over a dim scrim; Paper Sheet fill, 18px top corners, 20px side padding, a serif title at 24px with a quiet caption note under it, rows as list rows, a full-width primary pill in the footer in thumb reach. Cancel is the scrim or the X in the top right, quiet ink.

### Cards

- **Tonight card:** Paper Card, hairline border, 14px radius, 14px/16px padding, the serif title first (no label above a heading), then one caption meta line that opens with "Tonight" and the yield in tomato, then the pale pill and a 44px round ghost button.

### Inputs / Fields

- **Style:** Paper Card fill, Ring border (3:1; a hairline is too faint for a field boundary), 10px radius, 44px tall, Body ink; placeholder in quiet ink and never a plausible value.
- **Focus:** border goes tomato with the same 2px solid ring.

### Navigation

- **Tab bar:** four tabs (Week, List, Pantry, Recipes), 64px plus the safe-area inset, paper fill, hairline on top, 24px Lucide icons over 11px labels, quiet ink at rest and tomato when active. Settings is the gear in the header.
- **Floating action:** a 56px tomato circle with a 26px plus, 16px from the right, 16px above the tab bar.

### Numeral column (week rows)

- **Style:** the yield in serif Title tomato, right-aligned in a 34px column, with its unit as an 11px label under it ("8 / biscuits").

## Do's and Don'ts

### Do:

- **Do** set every number with the `tabular` utility (font-variant-numeric: tabular-nums) in the body sans.
- **Do** put the amount on its own line under the name in a list, in tomato, with "for <recipe>" after it in quiet italic.
- **Do** keep one tomato control per screen; make every other action a text link, an outline, or the pale pill.
- **Do** keep a checked row in its aisle, filled and quiet; nothing disappears, it cancels.
- **Do** keep the tab bar above sticky headings (z-index 20 over 10) and pad the content bottom by the bar plus one hairline.
- **Do** use the serif only for display, title, the sheet title and the yield numeral.
- **Do** write units as the cook says them and keep the recipe's own words.

### Don't:

- **Don't** use monospace anywhere; the `num` utility is gone.
- **Don't** wrap a list in a bordered card, nest a card in a card, or put a coloured border on a row.
- **Don't** use square checkboxes, kebab menus on rows, icon tiles, progress rings, or badges styled as buttons.
- **Don't** put a kicker or eyebrow above a heading.
- **Don't** introduce a second accent (no green, no blue); destructive is tomato ink as text.
- **Don't** render the mobile tab bar at 1024px and wider.
- **Don't** let a placeholder read as a value ("Elm Street" was one).
