import { shownUnit } from "#/components/recipes/recipe-text";
import { formatQuantity, parseQuantity } from "#/lib/quantities";
import { pluralUnit } from "#/lib/units";

/** "batch" for one or less, "batches" for more. */
export function batchWord(decimal: number): string {
  return decimal > 1 ? "batches" : "batch";
}

/**
 * What the batches being made come to, from the recipe's yield: "1 batch makes" and
 * "8 biscuits" (the second part is the tomato). At one batch the recipe's own words stand;
 * scaled, the number is written the recipe's way. Null with no yield, no number to scale,
 * or a batch count that is not a number above zero.
 */
export function batchLine(
  multiplierText: string,
  made: { quantityText: string; quantityDecimal?: number; unit: string } | undefined,
): { lead: string; made: string } | null {
  const batches = parseQuantity(multiplierText);
  if (made === undefined || batches === null || batches <= 0) return null;
  let figure = made.quantityText.trim();
  if (batches !== 1) {
    if (made.quantityDecimal === undefined) return null;
    figure = formatQuantity(made.quantityDecimal * batches);
  }
  const unit = pluralUnit(figure, shownUnit(made.unit));
  return {
    lead: `${multiplierText.trim()} ${batchWord(batches)} ${batches > 1 ? "make" : "makes"}`,
    made: unit ? `${figure} ${unit}` : figure,
  };
}
