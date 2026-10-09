import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import expected from "../src/lib/__fixtures__/seeded-week-expected.json";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { createHousehold, type Test } from "./test_helpers";

const modules = import.meta.glob("./**/*.ts");
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

const shape = (i: Pick<Doc<"listItems">, "displayName" | "required" | "status" | "purchase">) =>
  [i.displayName, i.required.unit, i.status, i.purchase?.quantityText].join(" | ");

describe("lists.generate", () => {
  it("makes the seeded week's list, matching the hand-computed one", async () => {
    const t = newTest();
    const { householdId, weekId } = await seededList(t);
    const items = await itemsOf(t, householdId);
    expect(items.map(shape).sort()).toEqual(
      expected.items.map((i) => shape({ ...i, status: i.status as "needed" | "onHand" })).sort(),
    );
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
    expect(before?.count).toMatchObject({ quantityDecimal: 5, unit: "tbsp" });
    const eventsBefore = (await eventsOf(t, householdId)).length;

    await as.mutation(api.lists.setItemStatus, {
      listItemId: butter._id,
      status: "checked",
      at: 1_000,
    });

    expect((await pantryOf(t, butter.ingredientId!))?.count).toEqual({
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
    expect((await pantryOf(t, dijon.ingredientId!))?.level).toBe("low");
    await as.mutation(api.lists.setItemStatus, { listItemId: dijon._id, status: "checked" });
    expect((await pantryOf(t, dijon.ingredientId!))?.level).toBe("full");
  });

  it("replaces a count kept in another unit and says so in the event", async () => {
    const t = newTest();
    const { as, householdId } = await seededList(t);
    const bacon = await planItem(t, householdId, "bacon");
    await as.mutation(api.lists.setItemStatus, { listItemId: bacon._id, status: "checked" });
    expect((await pantryOf(t, bacon.ingredientId!))?.count).toEqual({
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

    expect((await pantryOf(t, butter.ingredientId!))?.count).toMatchObject({
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
    expect((await pantryOf(t, carrots.ingredientId!))?.count?.quantityDecimal).toBe(1);
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
    expect((await pantryOf(t, butter.ingredientId!))?.count?.quantityDecimal).toBe(22);
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
