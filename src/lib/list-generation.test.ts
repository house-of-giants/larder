import { describe, expect, it } from "vitest";
import ingredientFixtures from "../../convex/seed/ingredients.json";
import pantryFixtures from "../../convex/seed/pantry.json";
import recipeFixtures from "../../convex/seed/recipes.json";
import weekFixture from "../../convex/seed/week.json";
import expected from "./__fixtures__/seeded-week-expected.json";
import {
  type ListAdaptation,
  type ListIngredient,
  type ListInput,
  type ListLine,
  type ListPantryRow,
  type ListRecipe,
  generateList,
} from "#/lib/list-generation";
import type { Level } from "#/lib/levels";

// Synthetic ids: the seed refers to everything by name, so the name is the id.
const ingredientId = (name: string) => `ingredient:${name}`;
const recipeId = (name: string) => `recipe:${name}`;

function seededWeekInput(): ListInput<string, string> {
  const recipesByName = new Map(recipeFixtures.map((r) => [r.name, r]));
  const recipes: ListRecipe<string, string>[] = weekFixture.recipes
    .filter((w) => w.status === "selected")
    .map((w) => {
      const recipe = recipesByName.get(w.recipe);
      if (recipe === undefined) throw new Error(`No seed recipe ${w.recipe}`);
      return {
        recipeId: recipeId(recipe.name),
        name: recipe.name,
        multiplier: w.multiplier.decimal,
        ingredients: recipe.ingredients.map((row) => ({
          ingredientId: ingredientId(row.ingredient),
          quantityDecimal: row.quantityDecimal ?? null,
          quantityText: row.quantityText,
          unit: row.unit,
        })),
      };
    });

  const adaptations: ListAdaptation<string, string>[] = weekFixture.adaptations.map((a) => ({
    recipeId: recipeId(a.recipe),
    kind: a.kind as ListAdaptation<string, string>["kind"],
    originalIngredientId: ingredientId(a.originalIngredient),
    newIngredientId: ingredientId(a.newIngredient),
    quantityDecimal: a.quantityDecimal,
    quantityText: a.quantityText,
    unit: a.unit,
  }));

  const ingredients = new Map<string, ListIngredient>(
    ingredientFixtures.map((i) => [
      ingredientId(i.name),
      {
        name: i.name,
        kind: i.kind as ListIngredient["kind"],
        category: i.category,
        tracked: i.tracked,
      },
    ]),
  );

  const pantry = new Map<string, ListPantryRow>(
    pantryFixtures.map((p) => [
      ingredientId(p.ingredient),
      {
        ...(p.count != null && {
          count: { quantityDecimal: p.count.quantityDecimal, unit: p.count.unit },
        }),
        ...(p.level != null && { level: p.level as Level }),
      },
    ]),
  );

  return { recipes, adaptations, ingredients, pantry };
}

type Amount = { quantityText: string; quantityDecimal?: number; unit: string; note?: string };

/** Decimals rounded to 1e-9 on both sides, so 1/3 compares equal; everything else exactly. */
function rounded<T extends Amount>(amount: T): T {
  return amount.quantityDecimal === undefined
    ? amount
    : { ...amount, quantityDecimal: Math.round(amount.quantityDecimal * 1e9) / 1e9 };
}

function compared(line: ListLine<string, string>) {
  return {
    section: line.category,
    displayName: line.displayName,
    required: rounded(line.required),
    purchase: rounded(line.purchase),
    status: line.status,
    sourceRecipes: line.sourceRecipes,
  };
}

describe("generateList on the seeded week", () => {
  const result = generateList(seededWeekInput());

  it("matches the hand-computed list line for line", () => {
    const want = expected.items.map((item) => ({
      section: item.section,
      displayName: item.displayName,
      required: rounded(item.required),
      purchase: rounded(item.purchase),
      status: item.status,
      sourceRecipes: item.sourceRecipes,
    }));
    expect(result.items.map(compared)).toEqual(want);
  });

  it("lists sections in store order, only the ones with something on them", () => {
    const present = new Set(expected.items.map((item) => item.section));
    expect(result.sections).toEqual(expected.sectionOrder.filter((s) => present.has(s)));
  });

  it("leaves out untracked, removed, and level items that are not low", () => {
    const names = new Set(result.items.map((item) => item.displayName));
    expect(expected.absent.length).toBeGreaterThan(0);
    expect(expected.absent.filter((name) => names.has(name))).toEqual([]);
  });
});

// Small hand-built inputs for one rule at a time.
const butter: ListIngredient = {
  name: "butter",
  kind: "count",
  category: "dairy_refrigerated",
  tracked: true,
};
const onion: ListIngredient = {
  name: "red onion",
  kind: "count",
  category: "produce",
  tracked: true,
};
const salt: ListIngredient = {
  name: "salt",
  kind: "level",
  category: "baking_pantry_condiments",
  tracked: true,
};
const spray: ListIngredient = {
  name: "nonstick spray",
  kind: "count",
  category: "baking_pantry_condiments",
  tracked: true,
};
const ingredients = new Map([
  ["butter", butter],
  ["onion", onion],
  ["salt", salt],
  ["spray", spray],
]);

function recipe(
  name: string,
  rows: [string, number | null, string, string][],
  multiplier = 1,
): ListRecipe<string, string> {
  return {
    recipeId: name,
    name,
    multiplier,
    ingredients: rows.map(([id, quantityDecimal, quantityText, unit]) => ({
      ingredientId: id,
      quantityDecimal,
      quantityText,
      unit,
    })),
  };
}

function only(input: Partial<ListInput<string, string>>) {
  const { items } = generateList({
    recipes: [],
    adaptations: [],
    ingredients,
    pantry: new Map(),
    ...input,
  });
  return items;
}

describe("generateList rules", () => {
  it("multiplies decimals and rewrites the text by the recipe multiplier", () => {
    const [line] = only({
      recipes: [recipe("Biscuits", [["butter", 1.5, "1 1/2", "tbsp"]], 2)],
    });
    expect(line.required).toEqual({ quantityText: "3", quantityDecimal: 3, unit: "tbsp" });
    expect(line.purchase).toEqual({ quantityText: "3", quantityDecimal: 3, unit: "tbsp" });
  });

  it("adds the same ingredient across recipes when the unit matches, and keeps units apart", () => {
    const items = only({
      recipes: [
        recipe("Biscuits", [["butter", 2, "2", "tbsp"]]),
        recipe("Roast", [
          ["butter", 1, "1", "tbsp"],
          ["butter", 1, "1", "stick"],
        ]),
      ],
    });
    expect(items.map((i) => [i.required.quantityText, i.required.unit, i.sourceRecipes])).toEqual([
      ["1", "stick", ["Roast"]],
      ["3", "tbsp", ["Biscuits", "Roast"]],
    ]);
  });

  it("drops an ingredient a remove adaptation takes out of that recipe only", () => {
    const items = only({
      recipes: [
        recipe("Biscuits", [["butter", 2, "2", "tbsp"]]),
        recipe("Roast", [["butter", 1, "1", "tbsp"]]),
      ],
      adaptations: [{ recipeId: "Roast", kind: "remove", originalIngredientId: "butter" }],
    });
    expect(items.map((i) => [i.required.quantityText, i.sourceRecipes])).toEqual([
      ["2", ["Biscuits"]],
    ]);
  });

  it("sets the amount an adjust adaptation names, times the multiplier", () => {
    const [line] = only({
      recipes: [recipe("Biscuits", [["butter", 9, "9", "tbsp"]], 2)],
      adaptations: [
        {
          recipeId: "Biscuits",
          kind: "adjust",
          originalIngredientId: "butter",
          quantityDecimal: 4,
          quantityText: "4",
          unit: "tbsp",
        },
      ],
    });
    expect(line.required).toEqual({ quantityText: "8", quantityDecimal: 8, unit: "tbsp" });
  });

  it("carries the original amount over when a replace adaptation names none", () => {
    const [line] = only({
      recipes: [recipe("Biscuits", [["butter", 4, "4", "tbsp"]], 2)],
      adaptations: [
        {
          recipeId: "Biscuits",
          kind: "replace",
          originalIngredientId: "butter",
          newIngredientId: "spray",
        },
      ],
    });
    expect(line.displayName).toBe("nonstick spray");
    expect(line.required).toEqual({ quantityText: "8", quantityDecimal: 8, unit: "tbsp" });
  });

  it("does not subtract a pantry count kept in a different unit", () => {
    const [line] = only({
      recipes: [recipe("Biscuits", [["butter", 8, "8", "tbsp"]])],
      pantry: new Map([["butter", { count: { quantityDecimal: 2, unit: "stick" } }]]),
    });
    expect(line.purchase).toEqual({ quantityText: "8", quantityDecimal: 8, unit: "tbsp" });
    expect(line.status).toBe("needed");
  });

  it("subtracts a same-unit pantry count and says how much is on hand", () => {
    const [line] = only({
      recipes: [recipe("Biscuits", [["butter", 8, "8", "tbsp"]])],
      pantry: new Map([["butter", { count: { quantityDecimal: 2.5, unit: "tbsp" } }]]),
    });
    expect(line.purchase).toEqual({
      quantityText: "5 1/2",
      quantityDecimal: 5.5,
      unit: "tbsp",
      note: "2 1/2 tbsp on hand",
    });
  });

  it("keeps a lone row in the recipe's own words and writes only sums fresh", () => {
    const items = only({
      recipes: [
        recipe("Biscuits", [
          ["butter", 0.5, "½", "cup"],
          ["salt", 0.2, "1/5", "tsp"],
        ]),
        recipe("Roast", [["butter", 0.25, "1/4", "stick"]]),
        recipe("Bites", [["butter", 0.25, ".25", "stick"]]),
      ],
    });
    expect(
      items.map((i) => [i.required.quantityText, i.purchase.quantityText, i.required.unit]),
    ).toEqual([
      ["½", "½", "cup"],
      ["1/2", "1/2", "stick"],
      ["1/5", "1/5", "tsp"],
    ]);
  });

  it("rounds a purchase in each up to a whole one", () => {
    const [line] = only({ recipes: [recipe("Sliders", [["onion", 0.25, "1/4", "each"]])] });
    expect(line.required).toEqual({ quantityText: "1/4", quantityDecimal: 0.25, unit: "each" });
    expect(line.purchase).toEqual({ quantityText: "1", quantityDecimal: 1, unit: "each" });
  });

  it("leaves a level item off the list when the pantry has it at half", () => {
    const items = only({
      recipes: [recipe("Roast", [["salt", 1, "1", "tsp"]])],
      pantry: new Map([["salt", { level: "half" as const }]]),
    });
    expect(items).toEqual([]);
  });

  it("puts a low level item on the list with a low note and no subtraction", () => {
    const [line] = only({
      recipes: [recipe("Roast", [["salt", 1, "1", "tsp"]])],
      pantry: new Map([["salt", { level: "low" as const }]]),
    });
    expect(line.purchase).toEqual({
      quantityText: "1",
      quantityDecimal: 1,
      unit: "tsp",
      note: "low",
    });
    expect(line.kind).toBe("level");
  });

  it("keeps a row with no number in its own words, merging only identical text", () => {
    const items = only({
      recipes: [
        recipe("Biscuits", [["spray", null, "as needed", ""]], 2),
        recipe("Bites", [
          ["spray", null, "as needed", ""],
          ["spray", null, "a little", ""],
        ]),
      ],
    });
    expect(
      items.map((i) => [i.required, i.purchase.quantityText, i.status, i.sourceRecipes]),
    ).toEqual([
      [{ quantityText: "a little", unit: "" }, "a little", "needed", ["Bites"]],
      [{ quantityText: "as needed", unit: "" }, "as needed", "needed", ["Biscuits", "Bites"]],
    ]);
  });
});
