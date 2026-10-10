import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { countOf, levelOf } from "../src/lib/pantry-amount";
import { normalizeName } from "../src/lib/aliases";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { createHousehold, type Test } from "./test_helpers";

const modules = import.meta.glob("./**/*.ts");

// seed.load runs only where SEED_ALLOWED is "true"; the config resets stubs between tests.
beforeEach(() => {
  vi.stubEnv("SEED_ALLOWED", "true");
});
const newTest = (): Test => convexTest(schema, modules);

const SLIDERS = "Italian Grinder Sliders";

/** Alice's seeded household, its list made so the week is shopping (closeable). */
async function seeded(t: Test) {
  const { as, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });
  await t.mutation(internal.seed.load, { householdId });
  const week = await as.query(api.weeks.current, {});
  if (week === null) throw new Error("seed made no week");
  await as.mutation(api.lists.generate, { weekId: week._id });
  const recipeId = week.recipes.find((r) => r.name === SLIDERS)!.recipeId;
  return { as, householdId, weekId: week._id, recipeId };
}

async function ingredientId(t: Test, householdId: Id<"households">, name: string) {
  const row = await t.run((ctx) =>
    ctx.db
      .query("ingredients")
      .withIndex("by_householdId_nameKey", (q) =>
        q.eq("householdId", householdId).eq("nameKey", normalizeName(name)),
      )
      .unique(),
  );
  if (row === null) throw new Error(`No ingredient ${name}`);
  return row._id;
}

/** The pantry row for a seeded ingredient, by name. */
async function shelf(t: Test, householdId: Id<"households">, name: string) {
  const id = await ingredientId(t, householdId, name);
  return await t.run((ctx) =>
    ctx.db
      .query("pantryItems")
      .withIndex("by_householdId_ingredientId", (q) =>
        q.eq("householdId", householdId).eq("ingredientId", id),
      )
      .unique(),
  );
}

async function foods(t: Test, householdId: Id<"households">) {
  return await t.run((ctx) =>
    ctx.db
      .query("preparedFoods")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect(),
  );
}

const cookArgs = (weekId: Id<"weeks">, recipeId: Id<"recipes">) => ({
  weekId,
  recipeId,
  multiplierText: "1",
  skippedIngredientIds: [],
  substitutions: [],
});

describe("Phase 4 gate: cook the seeded sliders, undo, eat, close the week", () => {
  it("deducts, makes leftovers, undoes, then closes out and undoes the closeout", async () => {
    const t = newTest();
    const { as, householdId, weekId, recipeId } = await seeded(t);

    // Cook.
    const result = await as.mutation(api.cooking.madeIt, cookArgs(weekId, recipeId));
    expect(countOf(await shelf(t, householdId, "Hawaiian rolls"))).toEqual({
      quantityText: "0",
      quantityDecimal: 0,
      unit: "each",
    });
    expect(countOf(await shelf(t, householdId, "sliced ham"))).toMatchObject({
      quantityDecimal: 0,
      unit: "oz",
    });
    expect(levelOf(await shelf(t, householdId, "Italian seasoning"))).toBe("half");
    expect(result.preparedFood).toMatchObject({
      name: SLIDERS,
      remaining: { text: "12", decimal: 12 },
      unit: "slider",
      location: "fridge",
    });
    const leftovers = await as.query(api.leftovers.list, {});
    expect(leftovers).toEqual([
      expect.objectContaining({
        name: SLIDERS,
        remaining: { text: "12", decimal: 12 },
        unit: "slider",
        location: "fridge",
        weekId,
      }),
    ]);

    // Every step is in the ledger: one deduction per tracked ingredient, and the leftovers.
    const recent = await as.query(api.events.recent, { limit: 50 });
    const cookEvents = recent.filter((e) => e.refs.cookingEventId === result.cookingEventId);
    expect(cookEvents.filter((e) => e.type === "deduction")).toHaveLength(16);
    expect(cookEvents.filter((e) => e.type === "adjustment")).toEqual([
      expect.objectContaining({
        refs: expect.objectContaining({ preparedFoodId: expect.any(String) }),
      }),
    ]);
    const drawer = await as.query(api.undo.recent, {});
    expect(drawer[0]).toMatchObject({ line: `Made ${SLIDERS}`, canUndo: true, isCook: true });
    // The cook's 17 events read as one line.
    expect(drawer.filter((r) => r.line === `Made ${SLIDERS}`)).toHaveLength(1);

    // Undo restores all of it and removes the untouched leftovers.
    await as.mutation(api.cooking.undo, { cookingEventId: result.cookingEventId });
    expect(countOf(await shelf(t, householdId, "Hawaiian rolls"))).toEqual({
      quantityText: "12",
      quantityDecimal: 12,
      unit: "each",
    });
    expect(countOf(await shelf(t, householdId, "sliced ham"))).toMatchObject({
      quantityDecimal: 8,
      unit: "oz",
    });
    expect(levelOf(await shelf(t, householdId, "Italian seasoning"))).toBe("full");
    expect(levelOf(await shelf(t, householdId, "Dijon mustard"))).toBe("low");
    expect(await foods(t, householdId)).toEqual([]);
    const afterUndo = await as.query(api.events.recent, { limit: 100 });
    expect(
      afterUndo.filter((e) => e.type === "undo" && e.refs.cookingEventId === result.cookingEventId),
    ).toHaveLength(17);
    const drawerAfterUndo = await as.query(api.undo.recent, {});
    expect(drawerAfterUndo[0]).toMatchObject({ line: `Undone: Made ${SLIDERS}`, canUndo: false });
    expect(drawerAfterUndo[1]).toMatchObject({ line: `Made ${SLIDERS}`, canUndo: false });
    await expect(
      as.mutation(api.cooking.undo, { cookingEventId: result.cookingEventId }),
    ).rejects.toMatchObject({ data: "Already undone." });

    // Cook again, eat five, close the week with everything eaten.
    const again = await as.mutation(api.cooking.madeIt, cookArgs(weekId, recipeId));
    const foodId = again.preparedFood!.preparedFoodId;
    await as.mutation(api.leftovers.consume, { preparedFoodId: foodId, quantityText: "5" });
    expect((await as.query(api.leftovers.list, {}))[0].remaining).toEqual({
      text: "7",
      decimal: 7,
    });

    const nextWeekId = await as.mutation(api.closeout.run, {
      weekId,
      decisions: [],
      weekOf: "2026-10-16",
    });
    const food = await t.run((ctx) => ctx.db.get(foodId));
    expect(food).toMatchObject({ status: "consumed", remaining: { text: "0", decimal: 0 } });
    expect((await t.run((ctx) => ctx.db.get(weekId)))?.status).toBe("closed");
    const nextWeek = await as.query(api.weeks.current, {});
    expect(nextWeek).toMatchObject({
      _id: nextWeekId,
      status: "planning",
      weekOf: "2026-10-16",
      recipes: [],
    });
    expect(await as.query(api.leftovers.list, {})).toEqual([]);

    // Undo the closeout: the sliders come back with 7; the week stays closed.
    const closeoutRow = (await as.query(api.undo.recent, {})).find((r) => r.type === "closeout");
    expect(closeoutRow).toMatchObject({ line: `Closed out ${SLIDERS}: eaten`, canUndo: true });
    await as.mutation(api.undo.event, { eventId: closeoutRow!.eventId });
    expect(await t.run((ctx) => ctx.db.get(foodId))).toMatchObject({
      status: "available",
      remaining: { text: "7", decimal: 7 },
    });
    expect((await t.run((ctx) => ctx.db.get(weekId)))?.status).toBe("closed");
    await expect(
      as.mutation(api.undo.event, { eventId: closeoutRow!.eventId }),
    ).rejects.toMatchObject({ data: "Already undone." });
  });
});

describe("cooking.madeIt", () => {
  it("halves the deductions and the leftovers at 1/2", async () => {
    const t = newTest();
    const { as, householdId, weekId, recipeId } = await seeded(t);
    const result = await as.mutation(api.cooking.madeIt, {
      ...cookArgs(weekId, recipeId),
      multiplierText: "1/2",
    });
    expect(countOf(await shelf(t, householdId, "Hawaiian rolls"))?.quantityDecimal).toBe(6);
    expect(levelOf(await shelf(t, householdId, "Italian seasoning"))).toBe("half");
    expect(result.preparedFood?.remaining).toEqual({ text: "6", decimal: 6 });
    const cook = await t.run((ctx) => ctx.db.get(result.cookingEventId));
    expect(cook?.multiplier).toEqual({ text: "1/2", decimal: 0.5 });
  });

  it("leaves a skipped ingredient on the shelf and deducts a swap from the replacement", async () => {
    const t = newTest();
    const { as, householdId, weekId, recipeId } = await seeded(t);
    const rolls = await ingredientId(t, householdId, "Hawaiian rolls");
    const ham = await ingredientId(t, householdId, "sliced ham");
    const bacon = await ingredientId(t, householdId, "bacon");
    await as.mutation(api.pantry.setCount, { ingredientId: bacon, quantityText: "10", unit: "oz" });
    await as.mutation(api.cooking.madeIt, {
      ...cookArgs(weekId, recipeId),
      skippedIngredientIds: [rolls],
      substitutions: [{ ingredientId: ham, replacementIngredientId: bacon }],
    });
    expect(countOf(await shelf(t, householdId, "Hawaiian rolls"))?.quantityDecimal).toBe(12);
    expect(countOf(await shelf(t, householdId, "sliced ham"))?.quantityDecimal).toBe(8);
    expect(countOf(await shelf(t, householdId, "bacon"))?.quantityDecimal).toBe(2);
  });

  it("flags ham that came up short, with what was had and what was used", async () => {
    const t = newTest();
    const { as, householdId, weekId, recipeId } = await seeded(t);
    const ham = await ingredientId(t, householdId, "sliced ham");
    await as.mutation(api.pantry.setCount, { ingredientId: ham, quantityText: "6", unit: "oz" });
    const result = await as.mutation(api.cooking.madeIt, cookArgs(weekId, recipeId));
    expect(result.deductions.find((d) => d.ingredientId === ham)).toMatchObject({
      name: "sliced ham",
      kind: "count",
      before: 6,
      after: 0,
      used: 8,
      unit: "oz",
      wentNegative: true,
    });
    const event = await t.run((ctx) =>
      ctx.db
        .query("inventoryEvents")
        .filter((q) => q.eq(q.field("type"), "deduction"))
        .collect(),
    );
    const hamEvent = event.find((e) => e.payload.after.ingredientId === ham);
    expect(hamEvent?.payload).toMatchObject({ wentNegative: true, used: 8 });
  });

  it("redirects an egg yolk to the large eggs", async () => {
    const t = newTest();
    const { as, householdId } = await seeded(t);
    const eggs = await ingredientId(t, householdId, "large eggs");
    const recipeId = await t.run(async (ctx) => {
      const yolk = await ctx.db.insert("ingredients", {
        householdId,
        name: "egg yolk",
        nameKey: normalizeName("egg yolk"),
        kind: "count",
        category: "dairy_refrigerated",
        aliases: [],
        tracked: true,
        needsReview: false,
      });
      const recipe = await ctx.db.insert("recipes", {
        householdId,
        name: "Aioli",
        instructions: [],
        tags: [],
        needsReview: false,
        updatedAt: 0,
      });
      await ctx.db.insert("recipeIngredients", {
        householdId,
        recipeId: recipe,
        order: 0,
        ingredientId: yolk,
        quantityText: "1",
        quantityDecimal: 1,
        unit: "each",
        optional: false,
        deductionIngredientId: eggs,
        needsReview: false,
      });
      return recipe;
    });
    const result = await as.mutation(api.cooking.madeIt, {
      recipeId,
      multiplierText: "1",
      skippedIngredientIds: [],
      substitutions: [],
    });
    expect(countOf(await shelf(t, householdId, "large eggs"))?.quantityDecimal).toBe(14);
    expect(result.deductions).toEqual([
      expect.objectContaining({ ingredientId: eggs, name: "large eggs", before: 15, after: 14 }),
    ]);
    // No yield, no leftovers, and the cook is told so.
    expect(result.preparedFood).toBeNull();
    expect(result.noFoodReason).toBe("This recipe has no yield, so nothing went in the fridge.");
  });

  it("refuses a multiplier that is not a number", async () => {
    const t = newTest();
    const { as, weekId, recipeId } = await seeded(t);
    await expect(
      as.mutation(api.cooking.madeIt, { ...cookArgs(weekId, recipeId), multiplierText: "lots" }),
    ).rejects.toMatchObject({ data: "Use a number like 1/2, 1 or 2." });
  });

  it("shows Made on the week, latest cook per recipe", async () => {
    const t = newTest();
    const { as, weekId, recipeId } = await seeded(t);
    expect(await as.query(api.cooking.forWeek, { weekId })).toEqual([]);
    await as.mutation(api.cooking.madeIt, cookArgs(weekId, recipeId));
    const second = await as.mutation(api.cooking.madeIt, cookArgs(weekId, recipeId));
    expect(await as.query(api.cooking.forWeek, { weekId })).toEqual([
      expect.objectContaining({ recipeId, cookingEventId: second.cookingEventId, times: 2 }),
    ]);
  });
});

describe("cooking.undo", () => {
  it("refuses once someone has eaten from the leftovers", async () => {
    const t = newTest();
    const { as, householdId, weekId, recipeId } = await seeded(t);
    const result = await as.mutation(api.cooking.madeIt, cookArgs(weekId, recipeId));
    await as.mutation(api.leftovers.consume, {
      preparedFoodId: result.preparedFood!.preparedFoodId,
    });
    await expect(
      as.mutation(api.cooking.undo, { cookingEventId: result.cookingEventId }),
    ).rejects.toMatchObject({ data: "Someone already ate from this. Undo those first." });
    expect(countOf(await shelf(t, householdId, "Hawaiian rolls"))?.quantityDecimal).toBe(0);
  });

  it("gives back only what the cook took when the shelf changed since", async () => {
    const t = newTest();
    const { as, householdId, weekId, recipeId } = await seeded(t);
    const rolls = await ingredientId(t, householdId, "Hawaiian rolls");
    const mayo = await ingredientId(t, householdId, "mayonnaise");
    const result = await as.mutation(api.cooking.madeIt, cookArgs(weekId, recipeId));
    await as.mutation(api.pantry.setCount, {
      ingredientId: rolls,
      quantityText: "4",
      unit: "each",
    });
    await as.mutation(api.pantry.setLevel, { ingredientId: mayo, level: "full" });
    await as.mutation(api.cooking.undo, { cookingEventId: result.cookingEventId });
    expect(countOf(await shelf(t, householdId, "Hawaiian rolls"))?.quantityDecimal).toBe(16);
    // A level set by hand since the cook stands.
    expect(levelOf(await shelf(t, householdId, "mayonnaise"))).toBe("full");
  });
});

describe("leftovers", () => {
  it("eats one by default and marks the food consumed at zero", async () => {
    const t = newTest();
    const { as, weekId, recipeId } = await seeded(t);
    const result = await as.mutation(api.cooking.madeIt, {
      ...cookArgs(weekId, recipeId),
      multiplierText: "1/12",
    });
    const preparedFoodId = result.preparedFood!.preparedFoodId;
    expect(await as.mutation(api.leftovers.consume, { preparedFoodId })).toEqual({
      remaining: { text: "0", decimal: 0 },
      status: "consumed",
    });
    await expect(as.mutation(api.leftovers.consume, { preparedFoodId })).rejects.toMatchObject({
      data: `${SLIDERS} is all eaten.`,
    });
    const drawer = await as.query(api.undo.recent, {});
    expect(drawer[0]).toMatchObject({ type: "consumption", line: "Ate 1 slider", canUndo: true });
  });

  it("floors at zero when someone says they ate more than was left", async () => {
    const t = newTest();
    const { as, weekId, recipeId } = await seeded(t);
    const result = await as.mutation(api.cooking.madeIt, cookArgs(weekId, recipeId));
    const preparedFoodId = result.preparedFood!.preparedFoodId;
    expect(
      await as.mutation(api.leftovers.consume, { preparedFoodId, quantityText: "20" }),
    ).toEqual({ remaining: { text: "0", decimal: 0 }, status: "consumed" });
  });

  it("undoes a portion eaten through the drawer", async () => {
    const t = newTest();
    const { as, weekId, recipeId } = await seeded(t);
    const result = await as.mutation(api.cooking.madeIt, cookArgs(weekId, recipeId));
    const preparedFoodId = result.preparedFood!.preparedFoodId;
    await as.mutation(api.leftovers.consume, { preparedFoodId, quantityText: "2" });
    await as.mutation(api.leftovers.consume, { preparedFoodId, quantityText: "3" });
    const firstAte = (await as.query(api.undo.recent, {})).find((r) => r.line === "Ate 2 sliders");
    await as.mutation(api.undo.event, { eventId: firstAte!.eventId });
    // Only the two come back; the three eaten later stay eaten.
    expect((await as.query(api.leftovers.list, {}))[0].remaining).toEqual({
      text: "9",
      decimal: 9,
    });
  });

  it("tosses and moves, each with its event", async () => {
    const t = newTest();
    const { as, householdId, weekId, recipeId } = await seeded(t);
    const result = await as.mutation(api.cooking.madeIt, cookArgs(weekId, recipeId));
    const preparedFoodId = result.preparedFood!.preparedFoodId;
    await as.mutation(api.leftovers.move, { preparedFoodId, location: "freezer" });
    expect((await as.query(api.leftovers.list, {}))[0].location).toBe("freezer");
    await as.mutation(api.leftovers.discard, { preparedFoodId });
    expect(await as.query(api.leftovers.list, {})).toEqual([]);
    const types = (await as.query(api.events.recent, { limit: 2 })).map((e) => e.type);
    expect(types).toEqual(["discard", "adjustment"]);
    const drawer = await as.query(api.undo.recent, { limit: 2 });
    expect(drawer.map((r) => r.line)).toEqual([
      `Tossed ${SLIDERS}`,
      `Moved ${SLIDERS} to the freezer`,
    ]);
    expect((await foods(t, householdId))[0].status).toBe("discarded");
  });
});

describe("closeout.run", () => {
  it("keeps, tosses, and eats per the cook's say, carrying kept food into the new week", async () => {
    const t = newTest();
    const { as, weekId, recipeId } = await seeded(t);
    const recipes = (await as.query(api.weeks.current, {}))!.recipes;
    const bites = recipes.find((r) => r.name === "Monster Cookie Protein Bites")!.recipeId;
    const parfaits = recipes.find(
      (r) => r.name === "Apple Cinnamon Greek Yogurt Parfaits",
    )!.recipeId;
    const sliders = await as.mutation(api.cooking.madeIt, cookArgs(weekId, recipeId));
    const bitesFood = await as.mutation(api.cooking.madeIt, cookArgs(weekId, bites));
    const parfaitFood = await as.mutation(api.cooking.madeIt, cookArgs(weekId, parfaits));

    const nextWeekId = await as.mutation(api.closeout.run, {
      weekId,
      decisions: [
        { preparedFoodId: bitesFood.preparedFood!.preparedFoodId, outcome: "keep" },
        { preparedFoodId: parfaitFood.preparedFood!.preparedFoodId, outcome: "tossed" },
      ],
      weekOf: "2026-10-16",
    });
    const get = (id: Id<"preparedFoods">) => t.run((ctx) => ctx.db.get(id));
    expect(await get(sliders.preparedFood!.preparedFoodId)).toMatchObject({ status: "consumed" });
    expect(await get(bitesFood.preparedFood!.preparedFoodId)).toMatchObject({
      status: "available",
      remaining: { decimal: 24 },
      weekId: nextWeekId,
    });
    expect(await get(parfaitFood.preparedFood!.preparedFoodId)).toMatchObject({
      status: "discarded",
      remaining: { decimal: 4 },
    });
    const closeouts = (await as.query(api.events.recent, {})).filter((e) => e.type === "closeout");
    expect(closeouts).toHaveLength(3);
  });

  it("refuses a week still being planned", async () => {
    const t = newTest();
    const { as, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });
    await t.mutation(internal.seed.load, { householdId });
    const week = (await as.query(api.weeks.current, {}))!;
    await expect(
      as.mutation(api.closeout.run, { weekId: week._id, decisions: [] }),
    ).rejects.toMatchObject({ data: "Nothing to close yet. This week is still being planned." });
  });
});

describe("undo.event on a check-off", () => {
  it("un-checks the item and takes back what it added to the pantry", async () => {
    const t = newTest();
    const { as, householdId } = await seeded(t);
    const butter = await t.run(async (ctx) =>
      (await ctx.db.query("listItems").collect()).find((i) => i.displayName === "unsalted butter"),
    );
    await as.mutation(api.lists.setItemStatus, { listItemId: butter!._id, status: "checked" });
    expect(countOf(await shelf(t, householdId, "unsalted butter"))?.quantityDecimal).toBe(22);
    const row = (await as.query(api.undo.recent, {}))[0];
    expect(row).toMatchObject({ line: "Checked off unsalted butter", canUndo: true });

    await as.mutation(api.undo.event, { eventId: row.eventId });
    expect(countOf(await shelf(t, householdId, "unsalted butter"))?.quantityDecimal).toBe(5);
    expect(await t.run((ctx) => ctx.db.get(butter!._id))).toMatchObject({ status: "needed" });
    const drawer = await as.query(api.undo.recent, {});
    expect(drawer[0]).toMatchObject({
      line: "Undone: Checked off unsalted butter",
      canUndo: false,
    });
    expect(drawer[1]).toMatchObject({ line: "Checked off unsalted butter", canUndo: false });
    await expect(as.mutation(api.undo.event, { eventId: row.eventId })).rejects.toMatchObject({
      data: "Already undone.",
    });
  });
});
