import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

// How a recipe reads on screen. The recipe's words win: quantityText and unit exactly as
// written, never the decimal behind them.

export type Recipe = NonNullable<FunctionReturnType<typeof api.recipes.get>>;
export type RecipeRow = Recipe["ingredients"][number];
export type IngredientOption = FunctionReturnType<typeof api.recipes.ingredientOptions>[number];

/** The unit as shown: `each` is the app's word for a plain count, so it stays off screen. */
export function shownUnit(unit: string): string {
  return unit.toLowerCase() === "each" ? "" : unit.trim();
}

/** "12 slider". */
export function amountText(quantityText: string, unit: string): string {
  return [quantityText, shownUnit(unit)].filter((part) => part.trim() !== "").join(" ");
}

/**
 * One ingredient line, in reading order. A number leads ("1/2 cup pecans"); words that are
 * not a number follow the name ("kosher salt, as needed"). Preparation already in the
 * recipe's own name is not repeated.
 */
export function ingredientLine(row: RecipeRow): { lead: string; name: string; tail: string[] } {
  const name = row.displayName ?? row.ingredientName;
  const amount = amountText(row.quantityText, row.unit);
  const numeric = row.quantityDecimal !== undefined;
  const tail: string[] = [];
  if (!numeric && amount !== "") tail.push(amount);
  if (row.preparation && !name.toLowerCase().includes(row.preparation.toLowerCase())) {
    tail.push(row.preparation);
  }
  return { lead: numeric ? amount : "", name, tail };
}

/** Ingredients whose name or an alias contains the query; name hits first, then by name. */
export function matchIngredients(
  options: readonly IngredientOption[],
  query: string,
  limit = 8,
): IngredientOption[] {
  const q = query.trim().toLowerCase();
  if (q === "") return options.slice(0, limit);
  const rank = (o: IngredientOption) => {
    const name = o.name.toLowerCase();
    if (name === q) return 0;
    if (name.startsWith(q)) return 1;
    if (name.includes(q)) return 2;
    if (o.aliases.some((a) => a.toLowerCase().includes(q))) return 3;
    return -1;
  };
  return options
    .map((o) => ({ o, r: rank(o) }))
    .filter(({ r }) => r >= 0)
    .sort((a, b) => a.r - b.r)
    .slice(0, limit)
    .map(({ o }) => o);
}

/** Only http(s) links become anchors; anything else stays text. */
export function safeHref(url: string | undefined): string | undefined {
  return url !== undefined && /^https?:\/\//i.test(url) ? url : undefined;
}
