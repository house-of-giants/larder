import { describe, expect, it } from "vitest";
import ingredientFixtures from "../../convex/seed/ingredients.json";
import pantryFixtures from "../../convex/seed/pantry.json";
import recipeFixtures from "../../convex/seed/recipes.json";
import {
  type DeductionIngredient,
  type DeductionInput,
  type DeductionPantryRow,
  type DeductionRow,
  planDeductions,
} from "#/lib/deductions";
import type { Level } from "#/lib/levels";

// The seed names everything; the name is the id here.
function seededKitchen() {
  const dictionary = new Map<string, DeductionIngredient>(
    ingredientFixtures.map((i) => [
      i.name,
      { kind: i.kind as DeductionIngredient["kind"], tracked: i.tracked },
    ]),
  );
  const pantry = new Map<string, DeductionPantryRow>(
    pantryFixtures.map((p) => [
      p.ingredient,
      {
        ...(p.count != null && {
          count: { quantityDecimal: p.count.quantityDecimal, unit: p.count.unit },
        }),
        ...(p.level != null && { level: p.level as Level }),
      },
    ]),
  );
  return { dictionary, pantry };
}

function rowsOf(recipeName: string): DeductionRow<string>[] {
  const recipe = recipeFixtures.find((r) => r.name === recipeName);
  if (recipe === undefined) throw new Error(`No seed recipe ${recipeName}`);
  return recipe.ingredients.map((row) => ({
    ingredientId: row.ingredient,
    quantityDecimal: row.quantityDecimal ?? null,
    unit: row.unit,
  }));
}

function sliders(overrides: Partial<DeductionInput<string>> = {}): DeductionInput<string> {
  return {
    ingredients: rowsOf("Italian Grinder Sliders"),
    multiplier: 1,
    skipped: new Set<string>(),
    substitutions: [],
    ...seededKitchen(),
    ...overrides,
  };
}

const byId = <T extends { ingredientId: string }>(list: T[], id: string) => {
  const found = list.filter((d) => d.ingredientId === id);
  expect(found, `one deduction for ${id}`).toHaveLength(1);
  return found[0];
};

describe("planDeductions: the seeded sliders", () => {
  it("at 1x empties the rolls, ham, lettuce and onion and steps the levels down once", () => {
    const plan = planDeductions(sliders());
    expect(byId(plan, "Hawaiian rolls")).toMatchObject({
      kind: "count",
      before: 12,
      after: 0,
      unit: "each",
      wentNegative: false,
    });
    expect(byId(plan, "sliced ham")).toMatchObject({ before: 8, after: 0, unit: "oz" });
    expect(byId(plan, "lettuce")).toMatchObject({ before: 3, after: 0, unit: "cup" });
    expect(byId(plan, "small red onion")).toMatchObject({ before: 0.25, after: 0 });
    expect(byId(plan, "Italian seasoning")).toMatchObject({
      kind: "level",
      before: "full",
      after: "half",
      wentNegative: false,
    });
    expect(byId(plan, "mayonnaise")).toMatchObject({ before: "half", after: "low" });
    expect(byId(plan, "Dijon mustard")).toMatchObject({ before: "low", after: "out" });
    expect(byId(plan, "unsalted butter")).toMatchObject({ before: 5, after: 3, unit: "tbsp" });
    // Every tracked row of the recipe is accounted for, once.
    expect(plan).toHaveLength(16);
    expect(plan.some((d) => d.wentNegative)).toBe(false);
  });

  it("at 1/2x takes half the rolls", () => {
    const plan = planDeductions(sliders({ multiplier: 0.5 }));
    expect(byId(plan, "Hawaiian rolls")).toMatchObject({ before: 12, after: 6, used: 6 });
    // A level still steps once, whatever the multiplier.
    expect(byId(plan, "Italian seasoning")).toMatchObject({ before: "full", after: "half" });
  });

  it("leaves a skipped ingredient alone", () => {
    const plan = planDeductions(sliders({ skipped: new Set(["Hawaiian rolls"]) }));
    expect(plan.find((d) => d.ingredientId === "Hawaiian rolls")).toBeUndefined();
    expect(byId(plan, "sliced ham")).toMatchObject({ before: 8, after: 0 });
  });

  it("flags a short count and floors it at zero", () => {
    const { dictionary, pantry } = seededKitchen();
    pantry.set("sliced ham", { count: { quantityDecimal: 6, unit: "oz" } });
    const plan = planDeductions(sliders({ dictionary, pantry }));
    expect(byId(plan, "sliced ham")).toMatchObject({
      before: 6,
      after: 0,
      used: 8,
      wentNegative: true,
    });
  });

  it("deducts from the replacement when an ingredient is swapped", () => {
    const { dictionary, pantry } = seededKitchen();
    dictionary.set("brioche buns", { kind: "count", tracked: true });
    pantry.set("brioche buns", { count: { quantityDecimal: 16, unit: "each" } });
    const plan = planDeductions(
      sliders({
        dictionary,
        pantry,
        substitutions: [
          { ingredientId: "Hawaiian rolls", replacementIngredientId: "brioche buns" },
        ],
      }),
    );
    expect(plan.find((d) => d.ingredientId === "Hawaiian rolls")).toBeUndefined();
    expect(byId(plan, "brioche buns")).toMatchObject({ before: 16, after: 4 });
  });
});

describe("planDeductions: rows that do not line up", () => {
  const kitchen = () => {
    const { dictionary, pantry } = seededKitchen();
    dictionary.set("egg yolk", { kind: "count", tracked: true });
    return { dictionary, pantry };
  };

  it("redirects an egg yolk to the large eggs through deductionIngredientId", () => {
    const plan = planDeductions({
      ingredients: [
        {
          ingredientId: "egg yolk",
          quantityDecimal: 1,
          unit: "each",
          deductionIngredientId: "large eggs",
        },
      ],
      multiplier: 1,
      skipped: new Set<string>(),
      substitutions: [],
      ...kitchen(),
    });
    expect(plan).toEqual([
      {
        ingredientId: "large eggs",
        kind: "count",
        unit: "each",
        before: 15,
        after: 14,
        used: 1,
        wentNegative: false,
      },
    ]);
  });

  it("leaves bacon in slices alone when the recipe asks for ounces", () => {
    const plan = planDeductions({
      ingredients: rowsOf("Bacon, Egg and Pepper Jack Breakfast Biscuits").filter(
        (r) => r.ingredientId === "bacon",
      ),
      multiplier: 1,
      skipped: new Set<string>(),
      substitutions: [],
      ...kitchen(),
    });
    expect(plan).toEqual([
      expect.objectContaining({
        ingredientId: "bacon",
        before: 10,
        after: 10,
        unit: "slice",
        wentNegative: false,
        note: "unit mismatch",
      }),
    ]);
  });

  it("leaves a count alone when the recipe gives no number", () => {
    const plan = planDeductions({
      ingredients: [{ ingredientId: "large eggs", quantityDecimal: null, unit: "each" }],
      multiplier: 1,
      skipped: new Set<string>(),
      substitutions: [],
      ...kitchen(),
    });
    expect(plan).toEqual([expect.objectContaining({ before: 15, after: 15, note: "no decimal" })]);
  });

  it("reports an ingredient with no pantry row without deducting", () => {
    const { dictionary, pantry } = kitchen();
    pantry.delete("large eggs");
    const plan = planDeductions({
      ingredients: [{ ingredientId: "large eggs", quantityDecimal: 2, unit: "each" }],
      multiplier: 1,
      skipped: new Set<string>(),
      substitutions: [],
      dictionary,
      pantry,
    });
    expect(plan).toEqual([
      expect.objectContaining({ ingredientId: "large eggs", before: null, after: null }),
    ]);
  });

  it("ignores an untracked ingredient and keeps the tracked one", () => {
    const { dictionary, pantry } = kitchen();
    dictionary.set("water", { kind: "count", tracked: false });
    pantry.set("water", { count: { quantityDecimal: 10, unit: "cup" } });
    const plan = planDeductions({
      ingredients: [
        { ingredientId: "water", quantityDecimal: 2, unit: "cup" },
        { ingredientId: "large eggs", quantityDecimal: 2, unit: "each" },
      ],
      multiplier: 1,
      skipped: new Set<string>(),
      substitutions: [],
      dictionary,
      pantry,
    });
    expect(plan.map((d) => d.ingredientId)).toEqual(["large eggs"]);
  });
});

describe("planDeductions: one line per ingredient", () => {
  it("sums two rows of butter into one deduction", () => {
    const { dictionary, pantry } = seededKitchen();
    const plan = planDeductions({
      ingredients: [
        { ingredientId: "unsalted butter", quantityDecimal: 2, unit: "tbsp" },
        { ingredientId: "unsalted butter", quantityDecimal: 1, unit: "tbsp" },
      ],
      multiplier: 1,
      skipped: new Set<string>(),
      substitutions: [],
      dictionary,
      pantry,
    });
    expect(plan).toEqual([
      expect.objectContaining({ ingredientId: "unsalted butter", before: 5, after: 2, used: 3 }),
    ]);
  });

  it("steps a level down once when it is on two rows", () => {
    const { dictionary, pantry } = seededKitchen();
    const plan = planDeductions({
      ingredients: [
        { ingredientId: "Dijon mustard", quantityDecimal: 1, unit: "tbsp" },
        { ingredientId: "Dijon mustard", quantityDecimal: 1, unit: "tsp" },
        { ingredientId: "black pepper", quantityDecimal: 0.25, unit: "tsp" },
        { ingredientId: "black pepper", quantityDecimal: 0.5, unit: "tsp" },
      ],
      multiplier: 2,
      skipped: new Set<string>(),
      substitutions: [],
      dictionary,
      pantry,
    });
    expect(plan).toEqual([
      {
        ingredientId: "Dijon mustard",
        kind: "level",
        before: "low",
        after: "out",
        wentNegative: false,
      },
      {
        ingredientId: "black pepper",
        kind: "level",
        before: "full",
        after: "half",
        wentNegative: false,
      },
    ]);
  });

  it("flags a level that was already out", () => {
    const { dictionary, pantry } = seededKitchen();
    pantry.set("Dijon mustard", { level: "out" });
    const plan = planDeductions({
      ingredients: [{ ingredientId: "Dijon mustard", quantityDecimal: 1, unit: "tsp" }],
      multiplier: 1,
      skipped: new Set<string>(),
      substitutions: [],
      dictionary,
      pantry,
    });
    expect(plan).toEqual([
      {
        ingredientId: "Dijon mustard",
        kind: "level",
        before: "out",
        after: "out",
        wentNegative: true,
      },
    ]);
  });
});
