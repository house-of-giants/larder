import { formatQuantity } from "#/lib/quantities";
import { pluralUnit } from "#/lib/units";
import { shownUnit } from "#/components/recipes/recipe-text";
import type { WeekRecipe } from "./labels";

/**
 * Tonight: the first selected recipe, in plan order, with no cook this week. Null when
 * nothing is selected or every selected recipe is made.
 */
export function tonightOf<R extends Pick<WeekRecipe, "recipeId" | "status">>(
  recipes: readonly R[],
  cooks: readonly { recipeId: WeekRecipe["recipeId"] }[],
): R | null {
  const made = new Set(cooks.map((c) => c.recipeId));
  return recipes.find((r) => r.status === "selected" && !made.has(r.recipeId)) ?? null;
}

/**
 * What the week's batches of a recipe make: "12" and "sliders". The recipe's words win at
 * one batch; scaled, the number is written the recipe's way (as convex/cooking.ts does).
 */
export function yieldOf(
  recipe: Pick<WeekRecipe, "yield" | "multiplier">,
): { figure: string; unit: string } | null {
  const made = recipe.yield;
  if (made === undefined) return null;
  const one = recipe.multiplier.decimal === 1;
  if (!one && made.quantityDecimal === undefined) return null;
  const figure = one
    ? made.quantityText
    : formatQuantity((made.quantityDecimal ?? 0) * recipe.multiplier.decimal);
  return { figure, unit: pluralUnit(figure, shownUnit(made.unit)) };
}

/** "7 of 10 on hand", "all on hand"; null for a recipe with no ingredients. */
export function onHandText(
  recipe: Pick<WeekRecipe, "ingredientCount" | "onHandCount">,
): string | null {
  const { ingredientCount, onHandCount } = recipe;
  if (ingredientCount === 0) return null;
  if (onHandCount >= ingredientCount) return "all on hand";
  return `${onHandCount} of ${ingredientCount} on hand`;
}

/** "Sat 2:14 PM", in the phone's own words. */
export function madeWhen(cookedAt: number): string {
  return new Date(cookedAt).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Made Sat 2:14 PM", or "Made twice, last Sat 2:14 PM". */
export function madeLabel(cookedAt: number, times: number): string {
  const when = madeWhen(cookedAt);
  if (times === 1) return `Made ${when}`;
  return `Made ${times === 2 ? "twice" : `${times} times`}, last ${when}`;
}
