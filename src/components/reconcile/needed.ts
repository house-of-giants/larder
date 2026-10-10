import { amountText } from "#/components/recipes/recipe-text";

export type NeededAmount = { quantityText: string; unit: string };
export type NeededPart = { text: string } | { amount: NeededAmount };

/**
 * "The week needs 22 tbsp" in pieces: the words, then each amount whole (so the row can
 * set it through `Amount`), split units joined by "and" ("1 tbsp and 2 tsp").
 */
export function neededParts(required: readonly NeededAmount[]): NeededPart[] {
  return required.reduce<NeededPart[]>(
    (parts, amount, index) => [...parts, ...(index > 0 ? [{ text: " and " }] : []), { amount }],
    [{ text: "The week needs " }],
  );
}

/** The same sentence as plain text, as it reads on screen. */
export function amountNeededText(required: readonly NeededAmount[]): string {
  return neededParts(required)
    .map((part) =>
      "text" in part ? part.text : amountText(part.amount.quantityText, part.amount.unit),
    )
    .join("");
}
