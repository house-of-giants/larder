import { describe, expect, it } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  amountText,
  ingredientLine,
  matchIngredients,
  safeHref,
  type IngredientOption,
  type RecipeRow,
} from "./recipe-text";

function row(overrides: Partial<RecipeRow>): RecipeRow {
  return {
    _id: "1recipeIngredients" as Id<"recipeIngredients">,
    order: 0,
    ingredientId: "1ingredients" as Id<"ingredients">,
    ingredientName: "pecans",
    ingredientKind: "count",
    quantityText: "1/2",
    quantityDecimal: 0.5,
    unit: "cup",
    optional: false,
    needsReview: false,
    ...overrides,
  };
}

describe("amountText", () => {
  it("shows the recipe's words and unit, and hides the plain-count unit", () => {
    expect(amountText("12", "slider")).toBe("12 slider");
    expect(amountText("2 1/2", "cup")).toBe("2 1/2 cup");
    expect(amountText("6", "each")).toBe("6");
    expect(amountText("as needed", "")).toBe("as needed");
  });
});

describe("ingredientLine", () => {
  it("leads with the words, never the decimal", () => {
    expect(ingredientLine(row({ preparation: "chopped" }))).toEqual({
      lead: "1/2 cup",
      name: "pecans",
      tail: ["chopped"],
    });
  });

  it("puts non-number words after the name", () => {
    expect(
      ingredientLine(
        row({
          ingredientName: "kosher salt",
          quantityText: "as needed",
          quantityDecimal: undefined,
          unit: "",
        }),
      ),
    ).toEqual({ lead: "", name: "kosher salt", tail: ["as needed"] });
  });

  it("prefers the recipe's name and does not repeat preparation it already says", () => {
    expect(ingredientLine(row({ displayName: "pecans, chopped", preparation: "chopped" }))).toEqual(
      { lead: "1/2 cup", name: "pecans, chopped", tail: [] },
    );
  });
});

describe("matchIngredients", () => {
  const options: IngredientOption[] = [
    { _id: "1ingredients" as Id<"ingredients">, name: "egg yolk", kind: "count", aliases: [] },
    {
      _id: "2ingredients" as Id<"ingredients">,
      name: "large eggs",
      kind: "count",
      aliases: ["eggs"],
    },
    {
      _id: "3ingredients" as Id<"ingredients">,
      name: "parmesan",
      kind: "count",
      aliases: ["grana"],
    },
  ];

  it("ranks name prefixes ahead of names that only contain the query", () => {
    expect(matchIngredients(options, " EGG").map((o) => o.name)).toEqual([
      "egg yolk",
      "large eggs",
    ]);
  });

  it("finds an ingredient by alias", () => {
    expect(matchIngredients(options, "Grana").map((o) => o.name)).toEqual(["parmesan"]);
    expect(matchIngredients(options, "brie")).toEqual([]);
  });
});

describe("safeHref", () => {
  it("allows http and https links only", () => {
    expect(safeHref("https://example.com")).toBe("https://example.com");
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
  });
});
