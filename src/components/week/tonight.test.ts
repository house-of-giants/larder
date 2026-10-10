import { describe, expect, it } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import type { WeekRecipe } from "./labels";
import { onHandText, tonightOf, yieldOf } from "./tonight";

const recipe = (
  id: string,
  status: WeekRecipe["status"] = "selected",
  overrides: Partial<WeekRecipe> = {},
): WeekRecipe => ({
  weekRecipeId: `wr-${id}` as Id<"weekRecipes">,
  recipeId: id as Id<"recipes">,
  name: id,
  status,
  multiplier: { text: "1", decimal: 1 },
  yield: undefined,
  ingredientCount: 0,
  onHandCount: 0,
  ...overrides,
});
const cook = (id: string) => ({ recipeId: id as Id<"recipes"> });

describe("tonightOf", () => {
  it("is the first selected recipe, in plan order, with no cook this week", () => {
    const week = [recipe("biscuits"), recipe("parfaits"), recipe("sliders")];
    expect(tonightOf(week, [cook("biscuits")])?.name).toBe("parfaits");
  });

  it("passes over candidates and skipped recipes", () => {
    const week = [recipe("maybe", "candidate"), recipe("no", "skipped"), recipe("roast")];
    expect(tonightOf(week, [])?.name).toBe("roast");
  });

  it("is null when every selected recipe is made", () => {
    const week = [recipe("biscuits"), recipe("parfaits"), recipe("maybe", "candidate")];
    expect(tonightOf(week, [cook("parfaits"), cook("biscuits")])).toBeNull();
  });

  it("is null when nothing is selected", () => {
    expect(tonightOf([recipe("maybe", "candidate")], [])).toBeNull();
  });
});

describe("yieldOf", () => {
  const sliders = { quantityText: "12", quantityDecimal: 12, unit: "slider" };

  it("keeps the recipe's words at one batch, with the unit as the cook says it", () => {
    expect(yieldOf(recipe("s", "selected", { yield: sliders }))).toEqual({
      figure: "12",
      unit: "sliders",
    });
  });

  it("scales by the batches and writes the number the recipe's way", () => {
    const half = { text: "1/2", decimal: 0.5 };
    const roast = { quantityText: "6", quantityDecimal: 6, unit: "portion" };
    expect(yieldOf(recipe("r", "selected", { yield: roast, multiplier: half }))).toEqual({
      figure: "3",
      unit: "portions",
    });
    const double = { text: "2", decimal: 2 };
    expect(yieldOf(recipe("s", "selected", { yield: sliders, multiplier: double }))).toEqual({
      figure: "24",
      unit: "sliders",
    });
  });

  it("is null for a recipe with no yield", () => {
    expect(yieldOf(recipe("x"))).toBeNull();
  });
});

describe("onHandText", () => {
  it("counts what the pantry holds of the recipe's ingredients", () => {
    expect(onHandText({ ingredientCount: 10, onHandCount: 7 })).toBe("7 of 10 on hand");
    expect(onHandText({ ingredientCount: 9, onHandCount: 0 })).toBe("0 of 9 on hand");
  });

  it("says all when every ingredient is here", () => {
    expect(onHandText({ ingredientCount: 16, onHandCount: 16 })).toBe("all on hand");
  });

  it("says nothing for a recipe with no ingredients", () => {
    expect(onHandText({ ingredientCount: 0, onHandCount: 0 })).toBeNull();
  });
});
