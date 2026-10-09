import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { createHousehold, type Test } from "./test_helpers";

const modules = import.meta.glob("./**/*.ts");

const newTest = (): Test => convexTest(schema, modules);

type UpsertArgs = FunctionArgs<typeof api.recipes.upsert>;

async function addIngredient(
  t: Test,
  householdId: Id<"households">,
  name: string,
  kind: "count" | "level" = "count",
) {
  return await t.run((ctx) =>
    ctx.db.insert("ingredients", {
      householdId,
      name,
      kind,
      category: "other",
      aliases: [],
      tracked: true,
      needsReview: false,
    }),
  );
}

function rowsFor(t: Test, recipeId: Id<"recipes">) {
  return t.run((ctx) =>
    ctx.db
      .query("recipeIngredients")
      .withIndex("by_recipeId", (q) => q.eq("recipeId", recipeId))
      .collect(),
  );
}

/** A household with three ingredients and a two-line recipe body to build on. */
async function kitchen(t: Test, who = "Alice") {
  const { as, householdId } = await createHousehold(t, { who, name: `${who}'s` });
  const eggs = await addIngredient(t, householdId, "large eggs");
  const yolks = await addIngredient(t, householdId, "egg yolk");
  const salt = await addIngredient(t, householdId, "kosher salt", "level");
  const base = {
    name: "Sliders",
    instructions: ["Heat the oven."],
    tags: ["dinner"],
    ingredients: [{ ingredientId: eggs, quantityText: "2", unit: "each", optional: false }],
  } satisfies UpsertArgs;
  return { as, householdId, eggs, yolks, salt, base };
}

describe("recipes.upsert and get", () => {
  it("round-trips every recipe and ingredient field, in order", async () => {
    const t = newTest();
    const { as, eggs, yolks, salt } = await kitchen(t);

    const id = await as.mutation(api.recipes.upsert, {
      name: "  Italian Grinder Sliders ",
      source: {
        type: "barefoodtim",
        title: "A Full Week of Meals",
        url: "https://example.com/week",
        author: "Tim",
        date: "2026-10-09",
      },
      yield: { quantityText: "12", unit: "slider" },
      freezerFriendly: true,
      storageNotes: "Wrap each one.",
      reheatingNotes: "Oven, 350F, 10 min.",
      instructions: ["Split the rolls.", "Layer and bake."],
      tags: ["dinner", "meal-prep"],
      needsReview: true,
      ingredients: [
        {
          ingredientId: salt,
          quantityText: "as needed",
          unit: "",
          optional: true,
        },
        {
          ingredientId: eggs,
          displayName: "egg yolks",
          quantityText: "2",
          unit: "each",
          optional: false,
          preparation: "beaten",
          deductionIngredientId: yolks,
          deductionNote: "Use the yolks, keep the whites.",
          needsReview: true,
        },
      ],
    });

    const recipe = await as.query(api.recipes.get, { id });
    expect(recipe).toMatchObject({
      _id: id,
      name: "Italian Grinder Sliders",
      source: {
        type: "barefoodtim",
        title: "A Full Week of Meals",
        url: "https://example.com/week",
        author: "Tim",
        date: "2026-10-09",
      },
      yield: { quantityText: "12", quantityDecimal: 12, unit: "slider" },
      freezerFriendly: true,
      storageNotes: "Wrap each one.",
      reheatingNotes: "Oven, 350F, 10 min.",
      instructions: ["Split the rolls.", "Layer and bake."],
      tags: ["dinner", "meal-prep"],
      needsReview: true,
    });
    expect(recipe?.updatedAt).toEqual(expect.any(Number));
    expect(recipe?.ingredients).toEqual([
      expect.objectContaining({
        order: 0,
        ingredientId: salt,
        ingredientName: "kosher salt",
        ingredientKind: "level",
        quantityText: "as needed",
        unit: "",
        optional: true,
        needsReview: false,
      }),
      expect.objectContaining({
        order: 1,
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
        deductionNote: "Use the yolks, keep the whites.",
        needsReview: true,
      }),
    ]);
    // Missing words stay missing rather than becoming empty strings.
    expect(recipe?.ingredients[0]).not.toHaveProperty("displayName");
    expect(recipe?.ingredients[0]).not.toHaveProperty("quantityDecimal");
  });

  it("derives quantityDecimal from the recipe's words and keeps the words", async () => {
    const t = newTest();
    const { as, eggs } = await kitchen(t);
    const words = ["1/2", "2 1/2", "1.5", "12", "as needed", "1-2", "1/0"];

    const id = await as.mutation(api.recipes.upsert, {
      name: "Fractions",
      instructions: [],
      tags: [],
      ingredients: words.map((quantityText) => ({
        ingredientId: eggs,
        quantityText,
        unit: "cup",
        optional: false,
      })),
    });

    const rows = (await as.query(api.recipes.get, { id }))?.ingredients ?? [];
    expect(rows.map((r) => [r.quantityText, r.quantityDecimal])).toEqual([
      ["1/2", 0.5],
      ["2 1/2", 2.5],
      ["1.5", 1.5],
      ["12", 12],
      ["as needed", undefined],
      ["1-2", undefined],
      ["1/0", undefined],
    ]);
  });

  it("drops blank steps and tags and trims what is left", async () => {
    const t = newTest();
    const { as, base } = await kitchen(t);
    const id = await as.mutation(api.recipes.upsert, {
      ...base,
      instructions: ["  Heat the oven. ", "   ", "Bake."],
      tags: [" dinner ", "", "dinner", "kid-friendly"],
    });
    const recipe = await as.query(api.recipes.get, { id });
    expect(recipe?.instructions).toEqual(["Heat the oven.", "Bake."]);
    expect(recipe?.tags).toEqual(["dinner", "kid-friendly"]);
  });

  it("rejects a blank name and writes nothing", async () => {
    const t = newTest();
    const { as, base } = await kitchen(t);
    await expect(as.mutation(api.recipes.upsert, { ...base, name: "  \t" })).rejects.toMatchObject({
      data: "Give the recipe a name.",
    });
    expect(await t.run((ctx) => ctx.db.query("recipes").collect())).toEqual([]);
  });

  it("rejects a source link that is not http or https", async () => {
    const t = newTest();
    const { as, base } = await kitchen(t);
    await expect(
      as.mutation(api.recipes.upsert, {
        ...base,
        source: { type: "url", url: "javascript:alert(1)" },
      }),
    ).rejects.toMatchObject({ data: "A source link starts with http:// or https://." });
  });

  it("replaces the ingredient rows on update and leaves no orphans", async () => {
    const t = newTest();
    const { as, eggs, salt, base } = await kitchen(t);
    const id = await as.mutation(api.recipes.upsert, {
      ...base,
      ingredients: [
        { ingredientId: eggs, quantityText: "2", unit: "each", optional: false },
        { ingredientId: salt, quantityText: "1", unit: "tsp", optional: false },
        { ingredientId: eggs, quantityText: "1", unit: "each", optional: true },
      ],
    });
    expect(await rowsFor(t, id)).toHaveLength(3);
    const before = (await as.query(api.recipes.get, { id }))!.updatedAt;

    const again = await as.mutation(api.recipes.upsert, {
      ...base,
      id,
      name: "Sliders, again",
      ingredients: [{ ingredientId: salt, quantityText: "1/4", unit: "tsp", optional: false }],
    });
    expect(again).toBe(id);

    const rows = await rowsFor(t, id);
    expect(rows.map((r) => [r.order, r.ingredientId, r.quantityText])).toEqual([[0, salt, "1/4"]]);
    const all = await t.run((ctx) => ctx.db.query("recipeIngredients").collect());
    expect(all).toHaveLength(1);
    const recipe = await as.query(api.recipes.get, { id });
    expect(recipe?.name).toBe("Sliders, again");
    expect(recipe!.updatedAt).toBeGreaterThanOrEqual(before);
    expect(await t.run((ctx) => ctx.db.query("recipes").collect())).toHaveLength(1);
  });

  it("keeps needsReview on update when the caller leaves it out", async () => {
    const t = newTest();
    const { as, base } = await kitchen(t);
    const id = await as.mutation(api.recipes.upsert, { ...base, needsReview: true });
    await as.mutation(api.recipes.upsert, { ...base, id, name: "Renamed" });
    expect((await as.query(api.recipes.get, { id }))?.needsReview).toBe(true);
    await as.mutation(api.recipes.upsert, { ...base, id, needsReview: false });
    expect((await as.query(api.recipes.get, { id }))?.needsReview).toBe(false);
  });

  it("rejects another household's ingredient, as the ingredient or the redirect", async () => {
    const t = newTest();
    const a = await kitchen(t, "Alice");
    const b = await kitchen(t, "Bob");

    await expect(
      a.as.mutation(api.recipes.upsert, {
        ...a.base,
        ingredients: [{ ingredientId: b.eggs, quantityText: "2", unit: "each", optional: false }],
      }),
    ).rejects.toMatchObject({ data: "That ingredient is not in this household." });

    await expect(
      a.as.mutation(api.recipes.upsert, {
        ...a.base,
        ingredients: [
          {
            ingredientId: a.eggs,
            quantityText: "2",
            unit: "each",
            optional: false,
            deductionIngredientId: b.yolks,
          },
        ],
      }),
    ).rejects.toMatchObject({ data: "That ingredient is not in this household." });

    expect(await t.run((ctx) => ctx.db.query("recipes").collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("recipeIngredients").collect())).toEqual([]);
  });

  it("refuses to update another household's recipe", async () => {
    const t = newTest();
    const a = await kitchen(t, "Alice");
    const b = await kitchen(t, "Bob");
    const id = await a.as.mutation(api.recipes.upsert, a.base);

    await expect(
      b.as.mutation(api.recipes.upsert, { ...b.base, id, name: "Mine now" }),
    ).rejects.toMatchObject({ data: "This recipe is not here." });
    expect((await a.as.query(api.recipes.get, { id }))?.name).toBe("Sliders");
    expect((await rowsFor(t, id)).map((r) => r.ingredientId)).toEqual([a.eggs]);
  });
});

describe("recipes.list, archive, restore", () => {
  it("lists by name with counts, and hides archived unless asked", async () => {
    const t = newTest();
    const { as, eggs, salt, base } = await kitchen(t);
    const sliders = await as.mutation(api.recipes.upsert, {
      ...base,
      name: "sliders",
      yield: { quantityText: "12", unit: "slider" },
      needsReview: true,
      ingredients: [
        { ingredientId: eggs, quantityText: "2", unit: "each", optional: false },
        { ingredientId: salt, quantityText: "1", unit: "tsp", optional: false },
      ],
    });
    const biscuits = await as.mutation(api.recipes.upsert, { ...base, name: "Biscuits" });
    const parfaits = await as.mutation(api.recipes.upsert, { ...base, name: "Parfaits" });

    const listed = await as.query(api.recipes.list, {});
    expect(listed.map((r) => r.name)).toEqual(["Biscuits", "Parfaits", "sliders"]);
    expect(listed.find((r) => r._id === sliders)).toMatchObject({
      ingredientCount: 2,
      yield: { quantityText: "12", unit: "slider" },
      tags: ["dinner"],
      needsReview: true,
    });
    expect(listed.find((r) => r._id === biscuits)).toMatchObject({
      ingredientCount: 1,
      needsReview: false,
    });

    await as.mutation(api.recipes.archive, { id: parfaits });
    expect((await as.query(api.recipes.list, {})).map((r) => r._id)).toEqual([biscuits, sliders]);
    const withArchived = await as.query(api.recipes.list, { includeArchived: true });
    expect(withArchived.map((r) => r._id)).toEqual([biscuits, parfaits, sliders]);
    expect(withArchived.find((r) => r._id === parfaits)?.archivedAt).toEqual(expect.any(Number));

    // Archived is not gone: the recipe and its rows are still there.
    const archived = await as.query(api.recipes.get, { id: parfaits });
    expect(archived?.archivedAt).toEqual(expect.any(Number));
    expect(archived?.ingredients).toHaveLength(1);

    await as.mutation(api.recipes.restore, { id: parfaits });
    expect((await as.query(api.recipes.list, {})).map((r) => r._id)).toEqual([
      biscuits,
      parfaits,
      sliders,
    ]);
    expect(await as.query(api.recipes.get, { id: parfaits })).not.toHaveProperty("archivedAt");
  });

  it("refuses to archive or restore another household's recipe", async () => {
    const t = newTest();
    const a = await kitchen(t, "Alice");
    const b = await kitchen(t, "Bob");
    const id = await a.as.mutation(api.recipes.upsert, a.base);

    await expect(b.as.mutation(api.recipes.archive, { id })).rejects.toMatchObject({
      data: "This recipe is not here.",
    });
    expect((await a.as.query(api.recipes.list, {})).map((r) => r._id)).toEqual([id]);

    await a.as.mutation(api.recipes.archive, { id });
    await expect(b.as.mutation(api.recipes.restore, { id })).rejects.toMatchObject({
      data: "This recipe is not here.",
    });
    expect(await a.as.query(api.recipes.list, {})).toEqual([]);
  });
});

describe("household isolation", () => {
  it("hides one household's recipes from another", async () => {
    const t = newTest();
    const a = await kitchen(t, "Alice");
    const b = await kitchen(t, "Bob");
    const aRecipe = await a.as.mutation(api.recipes.upsert, { ...a.base, name: "Alice's" });
    const bRecipe = await b.as.mutation(api.recipes.upsert, { ...b.base, name: "Bob's" });

    await expect(b.as.query(api.recipes.get, { id: aRecipe })).resolves.toBeNull();
    expect(
      (await b.as.query(api.recipes.list, { includeArchived: true })).map((r) => r._id),
    ).toEqual([bRecipe]);
    expect((await a.as.query(api.recipes.list, {})).map((r) => r._id)).toEqual([aRecipe]);
  });

  it("returns null for an id that is not a recipe id at all", async () => {
    const t = newTest();
    const { as } = await kitchen(t);
    await expect(as.query(api.recipes.get, { id: "not-a-real-id" })).resolves.toBeNull();
  });

  it("offers only the caller's ingredients in the picker, by name", async () => {
    const t = newTest();
    const a = await kitchen(t, "Alice");
    await kitchen(t, "Bob");
    await t.run((ctx) => ctx.db.patch(a.eggs, { aliases: ["eggs", "large egg"] }));

    const options = await a.as.query(api.recipes.ingredientOptions, {});
    expect(options).toEqual([
      { _id: a.yolks, name: "egg yolk", kind: "count", aliases: [] },
      { _id: a.salt, name: "kosher salt", kind: "level", aliases: [] },
      { _id: a.eggs, name: "large eggs", kind: "count", aliases: ["eggs", "large egg"] },
    ]);
  });
});

describe("recipes.createIngredientInline", () => {
  it("adds a tracked count ingredient marked for review", async () => {
    const t = newTest();
    const { as, householdId } = await kitchen(t);
    const id = await as.mutation(api.recipes.createIngredientInline, { name: "  pepper jack " });
    const row = await t.run((ctx) => ctx.db.get("ingredients", id));
    expect(row).toMatchObject({
      householdId,
      name: "pepper jack",
      kind: "count",
      category: "other",
      aliases: [],
      tracked: true,
      needsReview: true,
    });
  });

  it("reuses the ingredient a name resolves to instead of making a duplicate", async () => {
    const t = newTest();
    const { as, householdId, eggs } = await kitchen(t);
    await t.run((ctx) => ctx.db.patch("ingredients", eggs, { aliases: ["eggs"] }));

    for (const name of [" Large Eggs ", "large  eggs", "eggs", "large egg"]) {
      await expect(as.mutation(api.recipes.createIngredientInline, { name })).resolves.toBe(eggs);
    }
    await expect(
      as.mutation(api.recipes.createIngredientInline, { name: "   " }),
    ).rejects.toMatchObject({ data: "Give the ingredient a name." });
    const names = await t.run(async (ctx) =>
      (
        await ctx.db
          .query("ingredients")
          .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
          .collect()
      ).map((i) => i.name),
    );
    expect(names.sort()).toEqual(["egg yolk", "kosher salt", "large eggs"]);
  });

  it("stores a new name single-spaced", async () => {
    const t = newTest();
    const { as } = await kitchen(t);
    const id = await as.mutation(api.recipes.createIngredientInline, { name: " pepper   jack " });
    expect((await t.run((ctx) => ctx.db.get("ingredients", id)))?.name).toBe("pepper jack");
  });

  it("allows a name another household already uses", async () => {
    const t = newTest();
    await kitchen(t, "Alice");
    const b = await createHousehold(t, { who: "Bob", name: "Bob's" });
    const id = await b.as.mutation(api.recipes.createIngredientInline, { name: "large eggs" });
    expect((await t.run((ctx) => ctx.db.get("ingredients", id)))?.householdId).toBe(b.householdId);
  });
});

describe("joins never cross households", () => {
  it("counts, shows, and replaces only the household's own ingredient rows", async () => {
    const t = newTest();
    const a = await kitchen(t, "Alice");
    const b = await kitchen(t, "Bob");
    const recipeId = await a.as.mutation(api.recipes.upsert, a.base);
    // A corrupt row: B's household, pointing at A's recipe.
    const planted = await t.run((ctx) =>
      ctx.db.insert("recipeIngredients", {
        householdId: b.householdId,
        recipeId,
        order: 1,
        ingredientId: b.eggs,
        quantityText: "99",
        unit: "each",
        optional: false,
        needsReview: false,
      }),
    );

    const listed = await a.as.query(api.recipes.list, {});
    expect(listed.map((r) => [r._id, r.ingredientCount])).toEqual([[recipeId, 1]]);

    const got = await a.as.query(api.recipes.get, { id: recipeId });
    expect(got?.ingredients.map((r) => [r.ingredientId, r.quantityText])).toEqual([[a.eggs, "2"]]);

    await a.as.mutation(api.recipes.upsert, { ...a.base, id: recipeId });
    expect(await t.run((ctx) => ctx.db.get("recipeIngredients", planted))).not.toBeNull();
    const got2 = await a.as.query(api.recipes.get, { id: recipeId });
    expect(got2?.ingredients.map((r) => r.ingredientId)).toEqual([a.eggs]);
  });

  it("never returns another household's ingredient name through a recipe row", async () => {
    const t = newTest();
    const a = await kitchen(t, "Alice");
    const b = await createHousehold(t, { who: "Bob", name: "B" });
    const secret = await addIngredient(t, b.householdId, "Bob's secret sauce", "level");
    const recipeId = await a.as.mutation(api.recipes.upsert, a.base);
    // A corrupt row: A's household and recipe, B's ingredient.
    await t.run((ctx) =>
      ctx.db.insert("recipeIngredients", {
        householdId: a.householdId,
        recipeId,
        order: 1,
        ingredientId: secret,
        quantityText: "1",
        unit: "tbsp",
        optional: false,
        needsReview: false,
      }),
    );

    const got = await a.as.query(api.recipes.get, { id: recipeId });
    expect(got?.ingredients.map((r) => [r.ingredientName, r.needsReview])).toEqual([
      ["large eggs", false],
      ["unknown ingredient", true],
    ]);
    expect(JSON.stringify(got)).not.toContain("secret");
  });
});
