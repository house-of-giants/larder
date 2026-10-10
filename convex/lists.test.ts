import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import expected from "../src/lib/__fixtures__/seeded-week-expected.json";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { normalizeName } from "../src/lib/aliases";
import { countOf, levelOf } from "../src/lib/pantry-amount";
import { createHousehold, type Test } from "./test_helpers";

const modules = import.meta.glob("./**/*.ts");

// These tests seed the fixture week; seed.load runs only where SEED_ALLOWED is "true".
beforeEach(() => {
  vi.stubEnv("SEED_ALLOWED", "true");
});
const newTest = (): Test => convexTest(schema, modules);

/** Alice's household with the seeded week, its list generated. */
async function seededList(t: Test) {
  const { as, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });
  await t.mutation(internal.seed.load, { householdId });
  const week = await as.query(api.weeks.current, {});
  if (week === null) throw new Error("seed made no week");
  await as.mutation(api.lists.generate, { weekId: week._id });
  return { as, householdId, weekId: week._id };
}

async function itemsOf(t: Test, householdId: Id<"households">) {
  return await t.run((ctx) =>
    ctx.db
      .query("listItems")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect(),
  );
}

async function planItem(t: Test, householdId: Id<"households">, name: string, unit?: string) {
  const item = (await itemsOf(t, householdId)).find(
    (i) => i.displayName === name && (unit === undefined || i.required.unit === unit),
  );
  if (item === undefined) throw new Error(`No list item ${name}`);
  return item;
}

async function pantryOf(t: Test, ingredientId: Id<"ingredients">) {
  return await t.run((ctx) =>
    ctx.db
      .query("pantryItems")
      .filter((q) => q.eq(q.field("ingredientId"), ingredientId))
      .first(),
  );
}

async function eventsOf(t: Test, householdId: Id<"households">) {
  return await t.run((ctx) =>
    ctx.db
      .query("inventoryEvents")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect(),
  );
}

type Amount = { quantityText: string; quantityDecimal?: number; unit: string; note?: string };

/** Decimals rounded to 1e-9, so a stored 1/3 compares equal to the fixture's. */
function rounded(amount: Amount | undefined) {
  if (amount === undefined) return undefined;
  return amount.quantityDecimal === undefined
    ? amount
    : { ...amount, quantityDecimal: Math.round(amount.quantityDecimal * 1e9) / 1e9 };
}

/** Everything the fixture pins down about a line, recipes by name. */
async function persistedLines(t: Test, householdId: Id<"households">) {
  const items = await itemsOf(t, householdId);
  const recipes = await t.run((ctx) => ctx.db.query("recipes").collect());
  const recipeNames = new Map(recipes.map((r) => [r._id, r.name]));
  return items.map((i) => ({
    section: i.category,
    displayName: i.displayName,
    required: rounded(i.required),
    purchase: rounded(i.purchase),
    status: i.status,
    sourceRecipes: i.sourceRecipeIds.map((id) => recipeNames.get(id)),
  }));
}

const lineKey = (l: { displayName: string; required?: Amount }) =>
  `${l.displayName}|${l.required?.unit}`;
const byLine = (a: { displayName: string }, b: { displayName: string }) =>
  lineKey(a).localeCompare(lineKey(b));

describe("lists.generate", () => {
  it("makes the seeded week's list, matching the hand-computed one", async () => {
    const t = newTest();
    const { householdId, weekId } = await seededList(t);
    const lines = await persistedLines(t, householdId);
    const want = expected.items.map((i) => ({
      section: i.section,
      displayName: i.displayName,
      required: rounded(i.required),
      purchase: rounded(i.purchase),
      status: i.status,
      sourceRecipes: i.sourceRecipes,
    }));
    expect(lines.sort(byLine)).toEqual(want.sort(byLine));
    const items = await itemsOf(t, householdId);
    expect(items.every((i) => i.source === "plan" && i.ingredientId !== undefined)).toBe(true);
    const week = await t.run((ctx) => ctx.db.get(weekId));
    expect(week?.status).toBe("shopping");
    const lists = await t.run((ctx) => ctx.db.query("lists").collect());
    expect(lists).toEqual([expect.objectContaining({ weekId, status: "active" })]);
  });

  it("re-runs on a shopping week, keeping ad-hoc items and checked plan items", async () => {
    const t = newTest();
    const { as, householdId, weekId } = await seededList(t);
    const paperTowels = await as.mutation(api.lists.addItem, { displayName: "paper towels" });
    const butter = await planItem(t, householdId, "unsalted butter");
    await as.mutation(api.lists.setItemStatus, { listItemId: butter._id, status: "checked" });

    await as.mutation(api.lists.generate, { weekId });

    const items = await itemsOf(t, householdId);
    expect(items.find((i) => i._id === paperTowels)).toMatchObject({
      source: "adhoc",
      displayName: "paper towels",
    });
    const butterAfter = items.filter((i) => i.displayName === "unsalted butter");
    expect(butterAfter).toEqual([expect.objectContaining({ _id: butter._id, status: "checked" })]);
    // Same number of plan lines as before; nothing doubled.
    expect(items.filter((i) => i.source === "plan")).toHaveLength(expected.items.length);
    expect(await t.run((ctx) => ctx.db.query("lists").collect())).toHaveLength(1);
  });

  it("refuses another household's week", async () => {
    const t = newTest();
    const { weekId } = await seededList(t);
    const bob = await createHousehold(t, { who: "Bob", name: "Oak" });
    await expect(bob.as.mutation(api.lists.generate, { weekId })).rejects.toMatchObject({
      data: "That week is not here.",
    });
  });
});

describe("lists.setItemStatus", () => {
  it("adds a checked count item to the pantry in the same unit, overbuy and all", async () => {
    const t = newTest();
    const { as, householdId } = await seededList(t);
    const butter = await planItem(t, householdId, "unsalted butter");
    expect(butter.purchase).toMatchObject({ quantityDecimal: 17, unit: "tbsp" });
    const before = await pantryOf(t, butter.ingredientId!);
    expect(countOf(before)).toMatchObject({ quantityDecimal: 5, unit: "tbsp" });
    const eventsBefore = (await eventsOf(t, householdId)).length;

    await as.mutation(api.lists.setItemStatus, {
      listItemId: butter._id,
      status: "checked",
      at: 1_000,
    });

    expect(countOf(await pantryOf(t, butter.ingredientId!))).toEqual({
      quantityText: "22",
      quantityDecimal: 22,
      unit: "tbsp",
    });
    const events = await eventsOf(t, householdId);
    expect(events).toHaveLength(eventsBefore + 1);
    expect(events.at(-1)).toMatchObject({
      type: "purchase",
      refs: { listItemId: butter._id, pantryItemId: before?._id },
      payload: {
        before: { count: { quantityDecimal: 5, unit: "tbsp" } },
        after: { count: { quantityDecimal: 22, unit: "tbsp" } },
      },
    });
    expect((await planItem(t, householdId, "unsalted butter")).checkedAt).toBe(1_000);
  });

  it("sets a checked level item to full", async () => {
    const t = newTest();
    const { as, householdId } = await seededList(t);
    const dijon = await planItem(t, householdId, "Dijon mustard", "tsp");
    expect(levelOf(await pantryOf(t, dijon.ingredientId!))).toBe("low");
    await as.mutation(api.lists.setItemStatus, { listItemId: dijon._id, status: "checked" });
    expect(levelOf(await pantryOf(t, dijon.ingredientId!))).toBe("full");
  });

  it("replaces a count kept in another unit and says so in the event", async () => {
    const t = newTest();
    const { as, householdId } = await seededList(t);
    const bacon = await planItem(t, householdId, "bacon");
    await as.mutation(api.lists.setItemStatus, { listItemId: bacon._id, status: "checked" });
    expect(countOf(await pantryOf(t, bacon.ingredientId!))).toEqual({
      quantityText: "8",
      quantityDecimal: 8,
      unit: "oz",
    });
    expect((await eventsOf(t, householdId)).at(-1)?.payload).toMatchObject({
      replacedCount: { quantityDecimal: 10, unit: "slice" },
    });
  });

  it("never touches the pantry or the ledger for an ad-hoc item", async () => {
    const t = newTest();
    const { as, householdId } = await seededList(t);
    const listItemId = await as.mutation(api.lists.addItem, {
      displayName: "large eggs",
      quantityText: "12",
      unit: "each",
    });
    const snapshot = async () =>
      await t.run(async (ctx) => ({
        pantry: await ctx.db.query("pantryItems").collect(),
        events: await ctx.db.query("inventoryEvents").collect(),
      }));
    const before = await snapshot();
    await as.mutation(api.lists.setItemStatus, { listItemId, status: "checked" });
    await as.mutation(api.lists.setItemStatus, { listItemId, status: "needed" });
    expect(await snapshot()).toEqual(before);
    expect((await itemsOf(t, householdId)).find((i) => i._id === listItemId)?.status).toBe(
      "needed",
    );
  });

  it("puts the pantry back on un-check with an undo event", async () => {
    const t = newTest();
    const { as, householdId } = await seededList(t);
    const butter = await planItem(t, householdId, "unsalted butter");
    await as.mutation(api.lists.setItemStatus, { listItemId: butter._id, status: "checked" });
    const purchase = (await eventsOf(t, householdId)).at(-1)!;

    await as.mutation(api.lists.setItemStatus, { listItemId: butter._id, status: "needed" });

    expect(countOf(await pantryOf(t, butter.ingredientId!))).toMatchObject({
      quantityDecimal: 5,
      unit: "tbsp",
    });
    expect((await eventsOf(t, householdId)).at(-1)).toMatchObject({
      type: "undo",
      undoesEventId: purchase._id,
      refs: { listItemId: butter._id },
    });
    const after = await planItem(t, householdId, "unsalted butter");
    expect(after.status).toBe("needed");
    expect(after.checkedAt).toBeUndefined();
  });

  it("removes a pantry row the check-off created when un-checked", async () => {
    const t = newTest();
    const { as, householdId } = await seededList(t);
    const carrots = await planItem(t, householdId, "carrots");
    expect(await pantryOf(t, carrots.ingredientId!)).toBeNull();
    await as.mutation(api.lists.setItemStatus, { listItemId: carrots._id, status: "checked" });
    expect(countOf(await pantryOf(t, carrots.ingredientId!))?.quantityDecimal).toBe(1);
    await as.mutation(api.lists.setItemStatus, { listItemId: carrots._id, status: "needed" });
    expect(await pantryOf(t, carrots.ingredientId!)).toBeNull();
  });

  it("is idempotent: a second checked call writes nothing", async () => {
    const t = newTest();
    const { as, householdId } = await seededList(t);
    const butter = await planItem(t, householdId, "unsalted butter");
    await as.mutation(api.lists.setItemStatus, { listItemId: butter._id, status: "checked" });
    const events = (await eventsOf(t, householdId)).length;
    await as.mutation(api.lists.setItemStatus, { listItemId: butter._id, status: "checked" });
    expect(await eventsOf(t, householdId)).toHaveLength(events);
    expect(countOf(await pantryOf(t, butter.ingredientId!))?.quantityDecimal).toBe(22);
  });

  it("refuses another household's list item", async () => {
    const t = newTest();
    const { householdId } = await seededList(t);
    const butter = await planItem(t, householdId, "unsalted butter");
    const bob = await createHousehold(t, { who: "Bob", name: "Oak" });
    await expect(
      bob.as.mutation(api.lists.setItemStatus, { listItemId: butter._id, status: "checked" }),
    ).rejects.toMatchObject({ data: "That item is not on your list." });
    expect((await planItem(t, householdId, "unsalted butter")).status).toBe("needed");
  });
});

describe("lists.current and lists.reconcileItems", () => {
  it("groups the active list by section in store order, each item with its kind", async () => {
    const t = newTest();
    const { as } = await seededList(t);
    await as.mutation(api.lists.addItem, { displayName: "paper towels" });
    const list = await as.query(api.lists.current, {});
    expect(list?.sections.map((s) => s.category)).toEqual([
      "produce",
      "meat_deli",
      "dairy_refrigerated",
      "bread_canned_jarred",
      "dry_goods",
      "baking_pantry_condiments",
      "other",
    ]);
    const all = list!.sections.flatMap((s) => s.items);
    expect(all.find((i) => i.displayName === "granola")?.kind).toBe("level");
    expect(all.find((i) => i.displayName === "carrots")?.kind).toBe("count");
    expect(all.find((i) => i.displayName === "paper towels")).toMatchObject({
      source: "adhoc",
      status: "needed",
    });
  });

  it("names the recipes each item is for, in the item's recipe order", async () => {
    const t = newTest();
    const { as } = await seededList(t);
    await as.mutation(api.lists.addItem, { displayName: "paper towels" });
    const list = await as.query(api.lists.current, {});
    const all = list!.sections.flatMap((s) => s.items);
    const named = (name: string) => all.find((i) => i.displayName === name)?.sourceRecipeNames;
    expect(named("carrots")).toEqual(["Rosemary Balsamic Pot Roast with Carrots and Potatoes"]);
    expect(named("unsalted butter")).toEqual([
      "Bacon, Egg and Pepper Jack Breakfast Biscuits",
      "Apple Cinnamon Greek Yogurt Parfaits",
      "Rosemary Balsamic Pot Roast with Carrots and Potatoes",
      "Italian Grinder Sliders",
      "Salisbury Steak Meatballs with Mashed Potatoes",
    ]);
    expect(named("paper towels")).toEqual([]);
  });

  it("never names a recipe from another household, or one that is gone", async () => {
    const t = newTest();
    const { as, householdId } = await seededList(t);
    const bob = await createHousehold(t, { who: "Bob", name: "Oak" });
    await t.mutation(internal.seed.load, { householdId: bob.householdId });
    const carrots = await planItem(t, householdId, "carrots");
    const [own] = carrots.sourceRecipeIds;
    await t.run(async (ctx) => {
      const foreign = await ctx.db
        .query("recipes")
        .filter((q) => q.eq(q.field("householdId"), bob.householdId))
        .first();
      const gone = await ctx.db.insert("recipes", {
        householdId,
        name: "Deleted soup",
        instructions: [],
        tags: [],
        needsReview: false,
        updatedAt: 0,
      });
      await ctx.db.delete(gone);
      await ctx.db.patch(carrots._id, { sourceRecipeIds: [foreign!._id, own, gone] });
    });
    const list = await as.query(api.lists.current, {});
    const item = list!.sections.flatMap((s) => s.items).find((i) => i._id === carrots._id);
    expect(item?.sourceRecipeNames).toEqual([
      "Rosemary Balsamic Pot Roast with Carrots and Potatoes",
    ]);
  });

  it("lists the plan's ingredients with what the pantry holds", async () => {
    const t = newTest();
    const { as, weekId } = await seededList(t);
    const rows = await as.query(api.lists.reconcileItems, { weekId });
    expect(rows.find((r) => r.name === "unsalted butter")).toMatchObject({
      kind: "count",
      count: { quantityDecimal: 5, unit: "tbsp" },
      required: [{ quantityText: "22", unit: "tbsp" }],
    });
    expect(rows.find((r) => r.name === "Dijon mustard")).toMatchObject({
      kind: "level",
      level: "low",
      required: [
        { quantityText: "1", unit: "tbsp" },
        { quantityText: "2", unit: "tsp" },
      ],
    });
    // One row per ingredient.
    expect(new Set(rows.map((r) => r.ingredientId)).size).toBe(rows.length);
  });
});

async function ingredientNamed(t: Test, householdId: Id<"households">, name: string) {
  const ingredient = await t.run((ctx) =>
    ctx.db
      .query("ingredients")
      .withIndex("by_householdId_nameKey", (q) =>
        q.eq("householdId", householdId).eq("nameKey", normalizeName(name)),
      )
      .unique(),
  );
  if (ingredient === null) throw new Error(`No ingredient ${name}`);
  return ingredient._id;
}

describe("un-check after the pantry moved on", () => {
  it("takes back only what a check-off added to a row it created, once someone edits it", async () => {
    const t = newTest();
    const { as, householdId } = await seededList(t);
    const carrots = await planItem(t, householdId, "carrots");
    const ingredientId = carrots.ingredientId!;
    await as.mutation(api.lists.setItemStatus, { listItemId: carrots._id, status: "checked" });
    expect((await eventsOf(t, householdId)).at(-1)?.payload).toMatchObject({
      before: null,
      added: { quantityDecimal: 1, unit: "lb" },
    });
    await as.mutation(api.pantry.setCount, { ingredientId, quantityText: "4", unit: "lb" });

    await as.mutation(api.lists.setItemStatus, { listItemId: carrots._id, status: "needed" });

    expect(countOf(await pantryOf(t, ingredientId))).toEqual({
      quantityText: "3",
      quantityDecimal: 3,
      unit: "lb",
    });
  });

  it("puts a level back only while it is still the full the check-off set", async () => {
    const t = newTest();
    const { as, householdId } = await seededList(t);
    const tsp = await planItem(t, householdId, "Dijon mustard", "tsp");
    const ingredientId = tsp.ingredientId!;

    await as.mutation(api.lists.setItemStatus, { listItemId: tsp._id, status: "checked" });
    await as.mutation(api.lists.setItemStatus, { listItemId: tsp._id, status: "needed" });
    expect(levelOf(await pantryOf(t, ingredientId))).toBe("low");

    await as.mutation(api.lists.setItemStatus, { listItemId: tsp._id, status: "checked" });
    await as.mutation(api.pantry.setLevel, { ingredientId, level: "half" });
    await as.mutation(api.lists.setItemStatus, { listItemId: tsp._id, status: "needed" });
    expect(levelOf(await pantryOf(t, ingredientId))).toBe("half");
  });

  it("restores a count in another unit only while the row holds exactly what was bought", async () => {
    const t = newTest();
    const { as, householdId } = await seededList(t);
    const bacon = await planItem(t, householdId, "bacon");
    const ingredientId = bacon.ingredientId!;

    await as.mutation(api.lists.setItemStatus, { listItemId: bacon._id, status: "checked" });
    await as.mutation(api.lists.setItemStatus, { listItemId: bacon._id, status: "needed" });
    expect(countOf(await pantryOf(t, ingredientId))).toMatchObject({
      quantityDecimal: 10,
      unit: "slice",
    });
  });

  it("takes the bought amount back out of a replaced-unit row edited in that unit since", async () => {
    const t = newTest();
    const { as, householdId } = await seededList(t);
    const bacon = await planItem(t, householdId, "bacon");
    const ingredientId = bacon.ingredientId!;

    await as.mutation(api.lists.setItemStatus, { listItemId: bacon._id, status: "checked" });
    await as.mutation(api.pantry.setCount, { ingredientId, quantityText: "12", unit: "oz" });
    await as.mutation(api.lists.setItemStatus, { listItemId: bacon._id, status: "needed" });
    expect(countOf(await pantryOf(t, ingredientId))).toEqual({
      quantityText: "4",
      quantityDecimal: 4,
      unit: "oz",
    });
  });

  it("puts back only the level on un-check, keeping where the row was moved", async () => {
    const t = newTest();
    const { as, householdId } = await seededList(t);
    const tsp = await planItem(t, householdId, "Dijon mustard", "tsp");
    const ingredientId = tsp.ingredientId!;
    expect((await pantryOf(t, ingredientId))?.location).toBe("fridge");

    await as.mutation(api.lists.setItemStatus, { listItemId: tsp._id, status: "checked" });
    await as.mutation(api.pantry.setLevel, { ingredientId, level: "full", location: "pantry" });
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("pantryItems")
        .filter((q) => q.eq(q.field("ingredientId"), ingredientId))
        .first();
      await ctx.db.patch(row!._id, { purchaseNote: "the big jar", expiresAt: 9_000 });
    });
    await as.mutation(api.lists.setItemStatus, { listItemId: tsp._id, status: "needed" });

    expect(await pantryOf(t, ingredientId)).toMatchObject({
      level: "low",
      location: "pantry",
      purchaseNote: "the big jar",
      expiresAt: 9_000,
    });
  });
});

describe("regenerate keeps what someone decided", () => {
  it("keeps a checked line the new run would leave off, purchase and all", async () => {
    const t = newTest();
    const { as, householdId, weekId } = await seededList(t);
    const tsp = await planItem(t, householdId, "Dijon mustard", "tsp");
    await as.mutation(api.lists.setItemStatus, {
      listItemId: tsp._id,
      status: "checked",
      at: 500,
    });
    // Dijon is full now, so a fresh run would not put it on the list.
    await as.mutation(api.lists.generate, { weekId });

    const kept = (await itemsOf(t, householdId)).filter((i) => i._id === tsp._id);
    expect(kept).toEqual([
      expect.objectContaining({ status: "checked", purchase: tsp.purchase, checkedAt: 500 }),
    ]);
    await as.mutation(api.lists.setItemStatus, { listItemId: tsp._id, status: "needed" });
    expect(levelOf(await pantryOf(t, tsp.ingredientId!))).toBe("low");
  });

  it("buys butter once: check, regenerate, un-check, check ends at 22 tbsp", async () => {
    const t = newTest();
    const { as, householdId, weekId } = await seededList(t);
    const butter = await planItem(t, householdId, "unsalted butter");
    await as.mutation(api.lists.setItemStatus, { listItemId: butter._id, status: "checked" });
    await as.mutation(api.lists.generate, { weekId });
    await as.mutation(api.lists.setItemStatus, { listItemId: butter._id, status: "needed" });
    await as.mutation(api.lists.setItemStatus, { listItemId: butter._id, status: "checked" });
    expect(countOf(await pantryOf(t, butter.ingredientId!))).toMatchObject({
      quantityDecimal: 22,
      unit: "tbsp",
    });
  });

  it("finds an as-needed line beside a numbered one in the same unit", async () => {
    const t = newTest();
    const { as, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });
    await t.mutation(internal.seed.load, { householdId });
    const spray = await ingredientNamed(t, householdId, "nonstick spray");
    await t.run((ctx) => ctx.db.patch(spray, { tracked: true }));
    const week = (await as.query(api.weeks.current, {}))!;
    await as.mutation(api.weeks.addAdaptation, {
      weekId: week._id,
      recipeId: week.recipes[0].recipeId,
      kind: "add",
      newIngredientId: spray,
      quantityText: "2",
      description: "",
    });
    await as.mutation(api.lists.generate, { weekId: week._id });
    const sprayLines = async () =>
      (await itemsOf(t, householdId))
        .filter((i) => i.ingredientId === spray)
        .map((i) => [i._id, i.required.quantityText])
        .sort();
    const before = await sprayLines();
    expect(before.map(([, text]) => text)).toEqual(["2", "as needed"].sort());

    await as.mutation(api.lists.generate, { weekId: week._id });
    expect(await sprayLines()).toEqual(before);
  });
});

describe("offline replay", () => {
  it("stamps events with the tap time and undoes the newest-inserted purchase", async () => {
    const t = newTest();
    const { as, householdId } = await seededList(t);
    const butter = await planItem(t, householdId, "unsalted butter");
    const listItemId = butter._id;
    // Taps replayed out of order: the later tap (2000) lands first.
    await as.mutation(api.lists.setItemStatus, { listItemId, status: "checked", at: 2000 });
    await as.mutation(api.lists.setItemStatus, { listItemId, status: "needed", at: 1000 });
    await as.mutation(api.lists.setItemStatus, { listItemId, status: "checked", at: 1500 });
    await as.mutation(api.lists.setItemStatus, { listItemId, status: "needed" });

    const mine = (await eventsOf(t, householdId)).filter((e) => e.refs.listItemId === listItemId);
    expect(mine.map((e) => [e.type, e.at]).slice(0, 3)).toEqual([
      ["purchase", 2000],
      ["undo", 1000],
      ["purchase", 1500],
    ]);
    expect(mine[1].undoesEventId).toBe(mine[0]._id);
    expect(mine[3]).toMatchObject({ type: "undo", undoesEventId: mine[2]._id });
    expect(countOf(await pantryOf(t, butter.ingredientId!))?.quantityDecimal).toBe(5);
  });
});

describe("un-check of a check-off recorded before pantry rows had a kind", () => {
  // Ledger events written before the pantryItems union carry snapshots with `count` or
  // `level` and no `kind`. Undo must still read them.
  async function makeLegacy(t: Test, householdId: Id<"households">, listItemId: Id<"listItems">) {
    await t.run(async (ctx) => {
      const event = await ctx.db
        .query("inventoryEvents")
        .withIndex("by_householdId_listItemId", (q) =>
          q.eq("householdId", householdId).eq("refs.listItemId", listItemId),
        )
        .order("desc")
        .first();
      if (event === null || event.type !== "purchase") throw new Error("No purchase event");
      const strip = (snapshot: Record<string, unknown> | null) => {
        if (snapshot === null) return null;
        const { kind: _kind, ...rest } = snapshot;
        return rest;
      };
      await ctx.db.patch("inventoryEvents", event._id, {
        payload: {
          ...event.payload,
          before: strip(event.payload.before),
          after: strip(event.payload.after),
        },
      });
    });
  }

  it("puts a level back to what it was", async () => {
    const t = newTest();
    const { as, householdId } = await seededList(t);
    const dijon = await planItem(t, householdId, "Dijon mustard", "tsp");
    await as.mutation(api.lists.setItemStatus, { listItemId: dijon._id, status: "checked" });
    await makeLegacy(t, householdId, dijon._id);

    await as.mutation(api.lists.setItemStatus, { listItemId: dijon._id, status: "needed" });
    expect(levelOf(await pantryOf(t, dijon.ingredientId!))).toBe("low");
  });

  it("removes the row a level check-off created", async () => {
    const t = newTest();
    const { as, householdId } = await seededList(t);
    const dijon = await planItem(t, householdId, "Dijon mustard", "tsp");
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("pantryItems")
        .withIndex("by_householdId_ingredientId", (q) =>
          q.eq("householdId", householdId).eq("ingredientId", dijon.ingredientId!),
        )
        .unique();
      await ctx.db.delete("pantryItems", row!._id);
    });
    await as.mutation(api.lists.setItemStatus, { listItemId: dijon._id, status: "checked" });
    expect(levelOf(await pantryOf(t, dijon.ingredientId!))).toBe("full");
    await makeLegacy(t, householdId, dijon._id);

    await as.mutation(api.lists.setItemStatus, { listItemId: dijon._id, status: "needed" });
    expect(await pantryOf(t, dijon.ingredientId!)).toBeNull();
  });
});
