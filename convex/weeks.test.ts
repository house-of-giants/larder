import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { normalizeName } from "../src/lib/aliases";
import { createHousehold, type Test } from "./test_helpers";

const modules = import.meta.glob("./**/*.ts");

// These tests seed the fixture week; seed.load runs only where SEED_ALLOWED is "true".
beforeEach(() => {
  vi.stubEnv("SEED_ALLOWED", "true");
});
const newTest = (): Test => convexTest(schema, modules);

async function addRecipe(t: Test, householdId: Id<"households">, name: string) {
  return await t.run((ctx) =>
    ctx.db.insert("recipes", {
      householdId,
      name,
      instructions: [],
      tags: [],
      needsReview: false,
      updatedAt: 0,
    }),
  );
}

async function addIngredient(t: Test, householdId: Id<"households">, name: string) {
  return await t.run((ctx) =>
    ctx.db.insert("ingredients", {
      householdId,
      name,
      nameKey: normalizeName(name),
      kind: "count",
      category: "produce",
      aliases: [],
      tracked: true,
      needsReview: false,
    }),
  );
}

async function plannedWeek(t: Test) {
  const { as, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });
  const weekId = await as.mutation(api.weeks.create, { weekOf: "2026-10-09" });
  return { as, householdId, weekId };
}

describe("weeks.create and weeks.current", () => {
  it("starts a planning week and refuses a second while it is open", async () => {
    const t = newTest();
    const { as, weekId } = await plannedWeek(t);
    const week = await as.query(api.weeks.current, {});
    expect(week).toMatchObject({
      _id: weekId,
      weekOf: "2026-10-09",
      status: "planning",
      sourceUrls: [],
      recipes: [],
      adaptations: [],
    });
    await expect(as.mutation(api.weeks.create, { weekOf: "2026-10-16" })).rejects.toMatchObject({
      data: "Close the current week first.",
    });
  });

  it("refuses a date that is not YYYY-MM-DD", async () => {
    const t = newTest();
    const { as } = await createHousehold(t, { who: "Alice", name: "Elm" });
    await expect(as.mutation(api.weeks.create, { weekOf: "10/9/2026" })).rejects.toMatchObject({
      data: "Use a date like 2026-10-09.",
    });
  });

  it("is null when every week is closed", async () => {
    const t = newTest();
    const { as, weekId } = await plannedWeek(t);
    await t.run((ctx) => ctx.db.patch(weekId, { status: "closed" }));
    expect(await as.query(api.weeks.current, {})).toBeNull();
  });

  it("returns the seeded week's recipes with their status, multiplier, and adaptations", async () => {
    const t = newTest();
    const { as, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });
    await t.mutation(internal.seed.load, { householdId });
    const week = await as.query(api.weeks.current, {});
    expect(week?.recipes).toHaveLength(7);
    expect(week?.recipes.every((r) => r.status === "selected")).toBe(true);
    expect(week?.recipes[0]).toMatchObject({
      name: "Bacon, Egg and Pepper Jack Breakfast Biscuits",
      multiplier: { text: "1", decimal: 1 },
    });
    expect(week?.adaptations).toHaveLength(1);
    expect(week?.adaptations[0]).toMatchObject({
      kind: "replace",
      originalName: "smoked chicken sausage",
      newName: "elk Italian sausage",
    });
  });
});

describe("weeks.setRecipe", () => {
  it("adds a recipe at 1, then moves it and changes its multiplier in place", async () => {
    const t = newTest();
    const { as, householdId, weekId } = await plannedWeek(t);
    const recipeId = await addRecipe(t, householdId, "Sliders");

    await as.mutation(api.weeks.setRecipe, { weekId, recipeId, status: "candidate" });
    await as.mutation(api.weeks.setRecipe, {
      weekId,
      recipeId,
      status: "selected",
      multiplierText: " 1 1/2 ",
    });
    const week = await as.query(api.weeks.current, {});
    expect(week?.recipes).toEqual([
      expect.objectContaining({
        recipeId,
        name: "Sliders",
        status: "selected",
        multiplier: { text: "1 1/2", decimal: 1.5 },
      }),
    ]);
  });

  it.each(["two", "0", "-1", ""])("refuses multiplier %j", async (multiplierText) => {
    const t = newTest();
    const { as, householdId, weekId } = await plannedWeek(t);
    const recipeId = await addRecipe(t, householdId, "Sliders");
    await expect(
      as.mutation(api.weeks.setRecipe, { weekId, recipeId, status: "selected", multiplierText }),
    ).rejects.toMatchObject({ data: "Use a number like 1/2, 1 or 2." });
  });

  it("refuses another household's recipe and another household's week", async () => {
    const t = newTest();
    const { as, householdId, weekId } = await plannedWeek(t);
    const other = await createHousehold(t, { who: "Bob", name: "Oak" });
    const theirRecipe = await addRecipe(t, other.householdId, "Their soup");
    await expect(
      as.mutation(api.weeks.setRecipe, { weekId, recipeId: theirRecipe, status: "selected" }),
    ).rejects.toMatchObject({ data: "This recipe is not here." });

    const ourRecipe = await addRecipe(t, householdId, "Ours");
    await expect(
      other.as.mutation(api.weeks.setRecipe, { weekId, recipeId: ourRecipe, status: "selected" }),
    ).rejects.toMatchObject({ data: "That week is not here." });
    expect(await t.run((ctx) => ctx.db.query("weekRecipes").collect())).toEqual([]);
  });
});

describe("weeks adaptations", () => {
  it("adds and removes an adaptation, checking every id", async () => {
    const t = newTest();
    const { as, householdId, weekId } = await plannedWeek(t);
    const recipeId = await addRecipe(t, householdId, "Sheet pan");
    const chicken = await addIngredient(t, householdId, "chicken sausage");
    const elk = await addIngredient(t, householdId, "elk sausage");

    const adaptationId = await as.mutation(api.weeks.addAdaptation, {
      weekId,
      recipeId,
      kind: "replace",
      originalIngredientId: chicken,
      newIngredientId: elk,
      quantityText: "2",
      unit: "lb",
      description: "Elk instead",
    });
    const week = await as.query(api.weeks.current, {});
    expect(week?.adaptations).toEqual([
      expect.objectContaining({
        _id: adaptationId,
        kind: "replace",
        quantityText: "2",
        quantityDecimal: 2,
        unit: "lb",
        originalName: "chicken sausage",
        newName: "elk sausage",
      }),
    ]);

    const other = await createHousehold(t, { who: "Bob", name: "Oak" });
    const theirs = await addIngredient(t, other.householdId, "their sausage");
    await expect(
      as.mutation(api.weeks.addAdaptation, {
        weekId,
        recipeId,
        kind: "add",
        newIngredientId: theirs,
        description: "",
      }),
    ).rejects.toMatchObject({ data: "That ingredient is not in this household." });
    await expect(
      other.as.mutation(api.weeks.removeAdaptation, { adaptationId }),
    ).rejects.toMatchObject({ data: "That week is not here." });

    await as.mutation(api.weeks.removeAdaptation, { adaptationId });
    expect((await as.query(api.weeks.current, {}))?.adaptations).toEqual([]);
  });

  it("asks for the ingredients each kind needs", async () => {
    const t = newTest();
    const { as, householdId, weekId } = await plannedWeek(t);
    const recipeId = await addRecipe(t, householdId, "Sheet pan");
    const elk = await addIngredient(t, householdId, "elk sausage");
    await expect(
      as.mutation(api.weeks.addAdaptation, {
        weekId,
        recipeId,
        kind: "replace",
        newIngredientId: elk,
        description: "",
      }),
    ).rejects.toMatchObject({ data: "Pick the ingredient to swap out." });
    await expect(
      as.mutation(api.weeks.addAdaptation, {
        weekId,
        recipeId,
        kind: "add",
        newIngredientId: elk,
        description: "",
      }),
    ).rejects.toMatchObject({ data: "Say how much to add." });
  });
});

describe("weeks.setStatus", () => {
  it("moves shopping to cooking to active to closed, one step at a time", async () => {
    const t = newTest();
    const { as, weekId } = await plannedWeek(t);
    await expect(
      as.mutation(api.weeks.setStatus, { weekId, status: "shopping" }),
    ).rejects.toMatchObject({ data: "Make the list first." });

    await t.run((ctx) => ctx.db.patch(weekId, { status: "shopping" }));
    await expect(
      as.mutation(api.weeks.setStatus, { weekId, status: "active" }),
    ).rejects.toMatchObject({ data: "This week is shopping; it can only move to cooking." });
    for (const status of ["cooking", "active", "closed"] as const) {
      await as.mutation(api.weeks.setStatus, { weekId, status });
      expect(await t.run(async (ctx) => (await ctx.db.get(weekId))?.status)).toBe(status);
    }
  });
});
