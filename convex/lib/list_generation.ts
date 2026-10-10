import type { Level } from "../../src/lib/levels";
import { formatQuantity } from "./quantities";

// The shopping list for a week, from plain data: the selected recipes, the week's
// adaptations, the household's ingredients, and what the pantry holds. No Convex types and
// no I/O, so the seeded week can be checked against a hand-computed list.
//
// Same-unit math only. A count item buys what the recipes need minus what the pantry holds
// in the same unit; a pantry count in another unit is left alone. Level items (spices,
// condiments, bulk goods) go on the list only when the pantry says low or out, or has no
// row, and are never subtracted.

/** Store sections, in the order a walk through the store meets them. */
export const STORE_SECTIONS = [
  "produce",
  "meat_deli",
  "dairy_refrigerated",
  "bread_canned_jarred",
  "dry_goods",
  "baking_pantry_condiments",
  "frozen",
  "other",
] as const;

export type ListRecipe<I extends string, R extends string> = {
  recipeId: R;
  name: string;
  multiplier: number;
  ingredients: {
    ingredientId: I;
    quantityDecimal: number | null;
    quantityText: string;
    unit: string;
  }[];
};

export type ListAdaptation<I extends string, R extends string> = {
  recipeId: R;
  kind: "replace" | "add" | "remove" | "adjust";
  originalIngredientId?: I;
  newIngredientId?: I;
  quantityDecimal?: number;
  quantityText?: string;
  unit?: string;
};

export type ListIngredient = {
  name: string;
  kind: "count" | "level";
  category: string;
  tracked: boolean;
};

/** What the pantry holds of an ingredient: a count or a level, like the pantry row. */
export type ListPantryRow =
  | { kind: "count"; count: { quantityDecimal: number; unit: string } }
  | { kind: "level"; level: Level };

export type ListInput<I extends string, R extends string> = {
  /** Selected recipes only, in the order the week lists them. */
  recipes: ListRecipe<I, R>[];
  adaptations: ListAdaptation<I, R>[];
  ingredients: Map<I, ListIngredient>;
  pantry: Map<I, ListPantryRow>;
};

export type ListAmount = { quantityText: string; quantityDecimal?: number; unit: string };

export type ListLine<I extends string, R extends string> = {
  ingredientId: I;
  /** The ingredient's canonical name. */
  displayName: string;
  category: string;
  kind: "count" | "level";
  required: ListAmount;
  purchase: ListAmount & { note?: string };
  status: "needed" | "onHand";
  sourceRecipeIds: R[];
  /** Recipe names, in input order, once each. */
  sourceRecipes: string[];
};

export type GeneratedList<I extends string, R extends string> = {
  items: ListLine<I, R>[];
  /** The sections that have something on them, in store order. */
  sections: string[];
};

/** One recipe row after the multiplier: a number for math, or only the recipe's words. */
type Row<I extends string> = {
  ingredientId: I;
  decimal: number | null;
  text: string;
  unit: string;
};

// Float sums like 1.25 - 0.25 land a hair off; anything closer than this is equal.
const epsilon = 1e-9;

function scaled<I extends string>(
  ingredientId: I,
  quantityDecimal: number | null | undefined,
  quantityText: string | undefined,
  unit: string | undefined,
  multiplier: number,
): Row<I> {
  const decimal = quantityDecimal == null ? null : quantityDecimal * multiplier;
  const words = (quantityText ?? "").trim();
  return {
    ingredientId,
    decimal,
    // The recipe's words win unless the multiplier changed the number.
    text: decimal === null || (multiplier === 1 && words !== "") ? words : formatQuantity(decimal),
    unit: (unit ?? "").trim(),
  };
}

/** A recipe's rows times its multiplier, with that recipe's adaptations applied. */
function recipeRows<I extends string, R extends string>(
  recipe: ListRecipe<I, R>,
  adaptations: ListAdaptation<I, R>[],
): Row<I>[] {
  const m = recipe.multiplier;
  let rows = recipe.ingredients.map((r) =>
    scaled(r.ingredientId, r.quantityDecimal, r.quantityText, r.unit, m),
  );
  for (const a of adaptations) {
    if (a.recipeId !== recipe.recipeId) continue;
    const amount = (id: I, fallbackUnit?: string) =>
      scaled(id, a.quantityDecimal, a.quantityText, a.unit ?? fallbackUnit, m);
    switch (a.kind) {
      case "remove":
        rows = rows.filter((r) => r.ingredientId !== a.originalIngredientId);
        break;
      case "replace": {
        const replaced = rows.filter((r) => r.ingredientId === a.originalIngredientId);
        rows = rows.filter((r) => r.ingredientId !== a.originalIngredientId);
        const id = a.newIngredientId;
        if (id === undefined) break;
        if (a.quantityDecimal === undefined && a.quantityText === undefined) {
          // No amount named: the new ingredient takes the original's amounts as they were.
          rows.push(...replaced.map((r) => ({ ...r, ingredientId: id })));
        } else {
          rows.push(amount(id));
        }
        break;
      }
      case "add": {
        const id = a.newIngredientId ?? a.originalIngredientId;
        if (id !== undefined) rows.push(amount(id));
        break;
      }
      case "adjust": {
        // The ingredient's rows in this recipe become one row of the stated amount.
        const id = a.originalIngredientId ?? a.newIngredientId;
        if (id === undefined) break;
        const first = rows.find((r) => r.ingredientId === id);
        rows = rows.filter((r) => r.ingredientId !== id);
        rows.push(amount(id, first?.unit));
        break;
      }
    }
  }
  return rows;
}

type Aggregate<I extends string, R extends string> = Row<I> & {
  recipeIds: R[];
  recipeNames: string[];
};

function sectionRank(category: string): number {
  const index = (STORE_SECTIONS as readonly string[]).indexOf(category);
  return index === -1 ? STORE_SECTIONS.length : index;
}

const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

export function generateList<I extends string, R extends string>(
  input: ListInput<I, R>,
): GeneratedList<I, R> {
  const ingredientOf = (id: I) => {
    const ingredient = input.ingredients.get(id);
    if (ingredient === undefined) throw new Error(`No ingredient ${id} for the list.`);
    return ingredient;
  };

  // Aggregate by ingredient and exact unit. Rows without a number merge only with rows of
  // the same words; "as needed" and "a little" stay two lines.
  const aggregates = new Map<string, Aggregate<I, R>>();
  for (const recipe of input.recipes) {
    for (const row of recipeRows(recipe, input.adaptations)) {
      if (!ingredientOf(row.ingredientId).tracked) continue;
      const key = JSON.stringify([
        row.ingredientId,
        row.unit,
        row.decimal === null ? row.text : null,
      ]);
      const existing = aggregates.get(key);
      if (existing === undefined) {
        aggregates.set(key, { ...row, recipeIds: [recipe.recipeId], recipeNames: [recipe.name] });
        continue;
      }
      if (existing.decimal !== null && row.decimal !== null) {
        existing.decimal += row.decimal;
        existing.text = formatQuantity(existing.decimal);
      }
      if (!existing.recipeIds.includes(recipe.recipeId)) {
        existing.recipeIds.push(recipe.recipeId);
        existing.recipeNames.push(recipe.name);
      }
    }
  }

  const items: ListLine<I, R>[] = [];
  for (const agg of aggregates.values()) {
    const ingredient = ingredientOf(agg.ingredientId);
    const pantry = input.pantry.get(agg.ingredientId);
    const required: ListAmount =
      agg.decimal === null
        ? { quantityText: agg.text, unit: agg.unit }
        : { quantityText: agg.text, quantityDecimal: agg.decimal, unit: agg.unit };
    const line = {
      ingredientId: agg.ingredientId,
      displayName: ingredient.name,
      category: ingredient.category,
      kind: ingredient.kind,
      required,
      sourceRecipeIds: agg.recipeIds,
      sourceRecipes: agg.recipeNames,
    };

    if (ingredient.kind === "level") {
      const level = pantry?.kind === "level" ? pantry.level : undefined;
      if (level === "full" || level === "half") continue;
      items.push({
        ...line,
        purchase: { ...required, ...(level === "low" && { note: "low" }) },
        status: "needed",
      });
      continue;
    }

    const count = pantry?.kind === "count" ? pantry.count : undefined;
    const onHand =
      count !== undefined && count.unit.trim() === agg.unit ? count.quantityDecimal : 0;
    if (agg.decimal === null) {
      // No number to subtract from; buy what the recipe says.
      items.push({ ...line, purchase: { ...required }, status: "needed" });
      continue;
    }
    let buy = Math.max(0, agg.decimal - onHand);
    if (buy < epsilon) buy = 0;
    // Whole ones only; max() also keeps ceil(-epsilon) from coming out as -0.
    if (agg.unit === "each") buy = Math.max(0, Math.ceil(buy - epsilon));
    items.push({
      ...line,
      purchase: {
        // Buying exactly what the recipes say keeps their words.
        quantityText: buy === agg.decimal ? agg.text : formatQuantity(buy),
        quantityDecimal: buy,
        unit: agg.unit,
        ...(onHand > 0 && { note: `${formatQuantity(onHand)} ${agg.unit} on hand` }),
      },
      status: buy === 0 ? "onHand" : "needed",
    });
  }

  items.sort(
    (a, b) =>
      sectionRank(a.category) - sectionRank(b.category) ||
      byText(a.category, b.category) ||
      Number(a.status === "onHand") - Number(b.status === "onHand") ||
      byText(a.displayName, b.displayName) ||
      byText(a.required.unit, b.required.unit) ||
      byText(a.required.quantityText, b.required.quantityText),
  );

  const sections: string[] = [];
  for (const item of items) {
    if (sections.at(-1) !== item.category) sections.push(item.category);
  }
  return { items, sections };
}
