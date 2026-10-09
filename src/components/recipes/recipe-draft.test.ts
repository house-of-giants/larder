import { describe, expect, it } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { draftFromRecipe, draftToArgs, emptyDraft, emptyIngredient } from "./recipe-draft";
import type { Recipe } from "./recipe-text";

const eggs = "1ingredients" as Id<"ingredients">;
const yolks = "2ingredients" as Id<"ingredients">;
const salt = "3ingredients" as Id<"ingredients">;
const recipeId = "1recipes" as Id<"recipes">;

const sliders: Recipe = {
  _id: recipeId,
  _creationTime: 1,
  householdId: "1households" as Id<"households">,
  name: "Italian Grinder Sliders",
  source: {
    type: "barefoodtim",
    title: "A Full Week",
    url: "https://example.com",
    date: "2026-10-09",
  },
  yield: { quantityText: "12", quantityDecimal: 12, unit: "slider" },
  freezerFriendly: true,
  storageNotes: "Wrap each one.",
  instructions: ["Split the rolls.", "Bake."],
  tags: ["dinner", "meal-prep"],
  needsReview: true,
  updatedAt: 1,
  ingredients: [
    {
      _id: "1recipeIngredients" as Id<"recipeIngredients">,
      order: 0,
      ingredientId: eggs,
      ingredientName: "large eggs",
      ingredientKind: "count",
      displayName: "egg yolks",
      quantityText: "2",
      quantityDecimal: 2,
      unit: "each",
      optional: false,
      preparation: "beaten",
      deductionIngredientId: yolks,
      deductionNote: "Yolks only.",
      needsReview: true,
    },
    {
      _id: "2recipeIngredients" as Id<"recipeIngredients">,
      order: 1,
      ingredientId: salt,
      ingredientName: "kosher salt",
      ingredientKind: "level",
      quantityText: "as needed",
      unit: "",
      optional: true,
      needsReview: false,
    },
  ],
};

describe("draft round trip", () => {
  it("turns an untouched recipe back into the same upsert arguments", () => {
    const result = draftToArgs(draftFromRecipe(sliders), recipeId);
    expect(result).toEqual({
      ok: true,
      args: {
        id: recipeId,
        name: "Italian Grinder Sliders",
        // type and date are not on screen and still come back.
        source: {
          type: "barefoodtim",
          title: "A Full Week",
          url: "https://example.com",
          author: undefined,
          date: "2026-10-09",
        },
        yield: { quantityText: "12", unit: "slider" },
        freezerFriendly: true,
        storageNotes: "Wrap each one.",
        reheatingNotes: undefined,
        instructions: ["Split the rolls.", "Bake."],
        tags: ["dinner", "meal-prep"],
        needsReview: true,
        ingredients: [
          {
            ingredientId: eggs,
            displayName: "egg yolks",
            quantityText: "2",
            unit: "each",
            optional: false,
            preparation: "beaten",
            deductionIngredientId: yolks,
            deductionNote: "Yolks only.",
            needsReview: true,
          },
          {
            ingredientId: salt,
            displayName: undefined,
            quantityText: "as needed",
            unit: "",
            optional: true,
            preparation: undefined,
            deductionIngredientId: undefined,
            deductionNote: undefined,
            needsReview: false,
          },
        ],
      },
    });
  });
});

describe("draft round trip for a manual source", () => {
  it("keeps a source that is only { type: manual }", () => {
    const manual: Recipe = { ...sliders, source: { type: "manual" } };
    const result = draftToArgs(draftFromRecipe(manual), recipeId);
    expect(result.ok && result.args.source).toEqual({
      type: "manual",
      title: undefined,
      url: undefined,
      author: undefined,
      date: undefined,
    });
  });
});

describe("draftToArgs", () => {
  it("splits comma tags, drops blank steps and fully blank ingredient lines", () => {
    const draft = {
      ...emptyDraft(),
      name: " Biscuits ",
      tags: "breakfast, , meal-prep ,",
      steps: [
        { key: "a", text: " Mix. " },
        { key: "b", text: "  " },
      ],
      ingredients: [
        { ...emptyIngredient(), ingredientId: eggs, quantityText: " 6 ", unit: "each" },
        emptyIngredient(),
      ],
    };
    const result = draftToArgs(draft);
    expect(result.ok && result.args).toMatchObject({
      name: "Biscuits",
      tags: ["breakfast", "meal-prep"],
      instructions: ["Mix."],
      ingredients: [{ ingredientId: eggs, quantityText: "6", unit: "each" }],
    });
    expect(result.ok && result.args.ingredients).toHaveLength(1);
  });

  it("asks for an ingredient on a line that has words but no pick", () => {
    const draft = {
      ...emptyDraft(),
      name: "Biscuits",
      ingredients: [
        { ...emptyIngredient(), ingredientId: eggs, quantityText: "6" },
        { ...emptyIngredient(), quantityText: "1/2", unit: "cup" },
      ],
    };
    expect(draftToArgs(draft)).toEqual({ ok: false, error: "Pick an ingredient for line 2." });
  });

  it.each([
    ["a redirect", { deductionIngredientId: yolks }],
    ["a deduction note", { deductionNote: "Yolks only." }],
  ])("keeps a line that has only %s and asks for its ingredient", (_what, fields) => {
    const draft = {
      ...emptyDraft(),
      name: "Biscuits",
      ingredients: [
        { ...emptyIngredient(), ingredientId: eggs, quantityText: "6" },
        { ...emptyIngredient(), ...fields },
      ],
    };
    expect(draftToArgs(draft)).toEqual({ ok: false, error: "Pick an ingredient for line 2." });
  });

  it("asks for a name before anything else", () => {
    expect(draftToArgs({ ...emptyDraft(), name: "   " })).toEqual({
      ok: false,
      error: "Give the recipe a name.",
    });
  });

  it("marks a new source as manual and leaves out an empty one", () => {
    const withLink = draftToArgs({
      ...emptyDraft(),
      name: "Soup",
      sourceUrl: " https://example.com/soup ",
    });
    expect(withLink.ok && withLink.args.source).toEqual({
      type: "manual",
      title: undefined,
      url: "https://example.com/soup",
      author: undefined,
      date: undefined,
    });
    const without = draftToArgs({ ...emptyDraft(), name: "Soup" });
    expect(without.ok && without.args).toMatchObject({ source: undefined, yield: undefined });
  });
});
