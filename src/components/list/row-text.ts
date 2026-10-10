import type { ListItem } from "./types";

/**
 * The words after the amount on a store row: the recipes a plan item is for ("for Pot
 * roast", "for Yogurt parfaits, Sheet pan sausage"), "added" for something typed in the
 * store, and nothing when a plan item's recipes are all gone.
 */
export function recipeNamesLine(names: readonly string[], source: ListItem["source"]): string {
  if (source === "adhoc") return "added";
  return names.length === 0 ? "" : `for ${names.join(", ")}`;
}
