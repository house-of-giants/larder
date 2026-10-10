import { parseQuantity } from "#/lib/quantities";

/** The accent for an amount with a figure; quiet ink for the recipe's words alone. */
export type AmountTone = "accent" | "quiet";

/** DESIGN.md's Amount Rule: "1 1/2" is tomato, "as needed" is quiet. */
export function amountTone(quantityText: string): AmountTone {
  return parseQuantity(quantityText) === null ? "quiet" : "accent";
}
