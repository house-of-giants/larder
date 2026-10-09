import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { createHousehold, type Test } from "./test_helpers";

const modules = import.meta.glob("./**/*.ts");

const tables = [
  "ingredients",
  "recipes",
  "recipeIngredients",
  "pantryItems",
  "weeks",
  "weekRecipes",
  "weekAdaptations",
  "inventoryEvents",
] as const;

async function countsFor(t: Test, householdId: Id<"households">) {
  return await t.run(async (ctx) => {
    const counts: Record<string, number> = {};
    for (const table of tables) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
        .collect();
      counts[table] = rows.length;
    }
    return counts;
  });
}

const seeded = {
  ingredients: 92,
  recipes: 7,
  recipeIngredients: 91,
  pantryItems: 59,
  weeks: 1,
  weekRecipes: 7,
  weekAdaptations: 1,
  inventoryEvents: 59,
};

describe("seed.load", () => {
  it("loads the fixture week into one household, and only that household", async () => {
    const t = convexTest(schema, modules);
    const a = await createHousehold(t, { who: "Alice", name: "A" });
    const b = await createHousehold(t, { who: "Bob", name: "B" });

    await t.mutation(internal.seed.load, { householdId: a.householdId });

    expect(await countsFor(t, a.householdId)).toEqual(seeded);
    expect(Object.values(await countsFor(t, b.householdId)).every((n) => n === 0)).toBe(true);
    await expect(b.as.query(api.pantry.list, {})).resolves.toEqual([]);
  });

  it("gives the week seven selected recipes at 1x and the elk sausage swap", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await createHousehold(t, { who: "Alice", name: "A" });
    await t.mutation(internal.seed.load, { householdId });

    const { week, weekRecipes, adaptation, ingredients } = await t.run(async (ctx) => {
      const week = await ctx.db
        .query("weeks")
        .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
        .unique();
      const weekRecipes = await ctx.db
        .query("weekRecipes")
        .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
        .collect();
      const adaptation = await ctx.db
        .query("weekAdaptations")
        .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
        .unique();
      const ingredients = await ctx.db
        .query("ingredients")
        .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
        .collect();
      return { week, weekRecipes, adaptation, ingredients };
    });
    const ingredientNames = new Map(ingredients.map((i) => [i._id, i.name]));

    expect(week).toMatchObject({ weekOf: "2026-10-09", status: "planning" });
    expect(weekRecipes.map((r) => [r.weekId, r.status, r.multiplier])).toEqual(
      Array.from({ length: 7 }, () => [week?._id, "selected", { text: "1", decimal: 1 }]),
    );
    expect(adaptation).toMatchObject({ kind: "replace", quantityText: "2", unit: "lb" });
    expect(ingredientNames.get(adaptation!.originalIngredientId!)).toBe("smoked chicken sausage");
    expect(ingredientNames.get(adaptation!.newIngredientId!)).toBe("elk Italian sausage");
  });

  it("keeps the recipe's words and links each row to its canonical ingredient", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await createHousehold(t, { who: "Alice", name: "A" });
    await t.mutation(internal.seed.load, { householdId });

    const rows = await t.run(async (ctx) => {
      const recipeIngredients = await ctx.db
        .query("recipeIngredients")
        .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
        .collect();
      return await Promise.all(
        recipeIngredients.map(async (r) => ({
          ...r,
          ingredient: await ctx.db.get(r.ingredientId),
        })),
      );
    });
    const parmesan = rows.find((r) => r.displayName === "Parmesan, grated");
    expect(parmesan).toMatchObject({
      quantityText: "2",
      quantityDecimal: 2,
      unit: "tbsp",
      preparation: "grated",
    });
    expect(parmesan?.ingredient?.name).toBe("Parmesan");

    const spray = rows.find((r) => r.ingredient?.name === "nonstick spray");
    expect(spray).toMatchObject({ quantityText: "as needed", unit: "" });
    expect(spray).not.toHaveProperty("quantityDecimal");
  });

  it("stocks the pantry with counts and levels and a purchase event for each row", async () => {
    const t = convexTest(schema, modules);
    const { as, householdId } = await createHousehold(t, { who: "Alice", name: "A" });
    await t.mutation(internal.seed.load, { householdId });

    const pantry = await as.query(api.pantry.list, {});
    const byName = new Map(pantry.map((r) => [r.name, r]));
    expect(byName.get("bacon")?.count).toEqual({
      quantityText: "10",
      quantityDecimal: 10,
      unit: "slice",
    });
    expect(byName.get("Dijon mustard")?.level).toBe("low");
    expect(byName.get("Dijon mustard")?.count).toBeUndefined();
    expect(byName.get("small red onion")).toMatchObject({
      location: "counter",
      purchaseNote: "buy 1 small red onion",
    });

    const member = await t.run((ctx) =>
      ctx.db
        .query("members")
        .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
        .first(),
    );
    const events = await t.run((ctx) =>
      ctx.db
        .query("inventoryEvents")
        .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
        .collect(),
    );
    expect(new Set(events.map((e) => e.type))).toEqual(new Set(["purchase"]));
    expect(new Set(events.map((e) => e.refs.pantryItemId))).toEqual(
      new Set(pantry.map((r) => r.pantryItemId)),
    );
    const bacon = events.find((e) => e.refs.pantryItemId === byName.get("bacon")?.pantryItemId);
    expect(bacon?.actor).toEqual({ kind: "member", memberId: member?._id });
    expect(bacon?.payload).toEqual({
      before: null,
      after: {
        ingredientId: byName.get("bacon")?.ingredientId,
        location: "fridge",
        count: { quantityText: "10", quantityDecimal: 10, unit: "slice" },
      },
    });
  });

  it("replaces rather than duplicates when run again", async () => {
    const t = convexTest(schema, modules);
    const { as, householdId } = await createHousehold(t, { who: "Alice", name: "A" });
    await t.mutation(internal.seed.load, { householdId });
    // Something the household did between runs is wiped too.
    const [first] = await as.query(api.pantry.list, {});
    await as.mutation(api.pantry.remove, { ingredientId: first.ingredientId });

    await t.mutation(internal.seed.load, { householdId });

    expect(await countsFor(t, householdId)).toEqual(seeded);
    const members = await t.run((ctx) =>
      ctx.db
        .query("members")
        .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
        .collect(),
    );
    expect(members).toHaveLength(1);
  });
});
