import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { createHousehold, type Test } from "./test_helpers";

const modules = import.meta.glob("./**/*.ts");
const newTest = (): Test => convexTest(schema, modules);

async function addIngredient(
  t: Test,
  householdId: Id<"households">,
  fields: { name: string; kind: "count" | "level"; category?: string },
) {
  return await t.run((ctx) =>
    ctx.db.insert("ingredients", {
      householdId,
      category: "produce",
      aliases: [],
      tracked: true,
      needsReview: false,
      ...fields,
    }),
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

async function memberIdOf(t: Test, householdId: Id<"households">) {
  const member = await t.run((ctx) =>
    ctx.db
      .query("members")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .first(),
  );
  if (member === null) throw new Error("member missing");
  return member._id;
}

describe("pantry.setCount", () => {
  it("creates the row, then updates it, recording each change with before and after", async () => {
    const t = newTest();
    const { as, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });
    const eggs = await addIngredient(t, householdId, { name: "large eggs", kind: "count" });
    const memberId = await memberIdOf(t, householdId);

    await as.mutation(api.pantry.setCount, {
      ingredientId: eggs,
      quantityText: " 1 1/2 ",
      unit: " dozen ",
      location: "fridge",
    });
    await as.mutation(api.pantry.setCount, {
      ingredientId: eggs,
      quantityText: "12",
      unit: "each",
    });

    const rows = await as.query(api.pantry.list, {});
    expect(rows).toEqual([
      {
        pantryItemId: expect.any(String),
        ingredientId: eggs,
        name: "large eggs",
        kind: "count",
        category: "produce",
        location: "fridge",
        count: { quantityText: "12", quantityDecimal: 12, unit: "each" },
        updatedAt: expect.any(Number),
      },
    ]);

    const events = await eventsOf(t, householdId);
    expect(events.map((e) => [e.type, e.actor, e.refs, e.payload])).toEqual([
      [
        "adjustment",
        { kind: "member", memberId },
        { pantryItemId: rows[0].pantryItemId },
        {
          before: null,
          after: {
            ingredientId: eggs,
            location: "fridge",
            count: { quantityText: "1 1/2", quantityDecimal: 1.5, unit: "dozen" },
          },
        },
      ],
      [
        "adjustment",
        { kind: "member", memberId },
        { pantryItemId: rows[0].pantryItemId },
        {
          before: {
            ingredientId: eggs,
            location: "fridge",
            count: { quantityText: "1 1/2", quantityDecimal: 1.5, unit: "dozen" },
          },
          after: {
            ingredientId: eggs,
            location: "fridge",
            count: { quantityText: "12", quantityDecimal: 12, unit: "each" },
          },
        },
      ],
    ]);
  });

  it("refuses words it cannot count and writes nothing", async () => {
    const t = newTest();
    const { as, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });
    const ginger = await addIngredient(t, householdId, { name: "ginger root", kind: "count" });
    await expect(
      as.mutation(api.pantry.setCount, { ingredientId: ginger, quantityText: "1 knob", unit: "" }),
    ).rejects.toMatchObject({ data: "Use a number or a fraction." });
    await expect(as.query(api.pantry.list, {})).resolves.toEqual([]);
    await expect(eventsOf(t, householdId)).resolves.toEqual([]);
  });

  it("refuses a level ingredient", async () => {
    const t = newTest();
    const { as, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });
    const salt = await addIngredient(t, householdId, { name: "kosher salt", kind: "level" });
    await expect(
      as.mutation(api.pantry.setCount, { ingredientId: salt, quantityText: "2", unit: "tbsp" }),
    ).rejects.toMatchObject({ data: "kosher salt is kept as a level, not a count." });
    await expect(as.query(api.pantry.list, {})).resolves.toEqual([]);
  });
});

describe("pantry.setLevel", () => {
  it("sets and changes a level, recording before and after", async () => {
    const t = newTest();
    const { as, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });
    const salt = await addIngredient(t, householdId, { name: "kosher salt", kind: "level" });

    await as.mutation(api.pantry.setLevel, {
      ingredientId: salt,
      level: "full",
      location: "pantry",
    });
    await as.mutation(api.pantry.setLevel, { ingredientId: salt, level: "low" });

    const rows = await as.query(api.pantry.list, {});
    expect(rows.map((r) => [r.name, r.location, r.level, r.count])).toEqual([
      ["kosher salt", "pantry", "low", undefined],
    ]);
    const events = await eventsOf(t, householdId);
    expect(events.map((e) => e.payload)).toEqual([
      { before: null, after: { ingredientId: salt, location: "pantry", level: "full" } },
      {
        before: { ingredientId: salt, location: "pantry", level: "full" },
        after: { ingredientId: salt, location: "pantry", level: "low" },
      },
    ]);
  });

  it("refuses a count ingredient", async () => {
    const t = newTest();
    const { as, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });
    const eggs = await addIngredient(t, householdId, { name: "large eggs", kind: "count" });
    await expect(
      as.mutation(api.pantry.setLevel, { ingredientId: eggs, level: "half" }),
    ).rejects.toMatchObject({ data: "large eggs is kept as a count, not a level." });
    await expect(as.query(api.pantry.list, {})).resolves.toEqual([]);
    await expect(eventsOf(t, householdId)).resolves.toEqual([]);
  });
});

describe("pantry.markOut", () => {
  it("takes a count to zero and keeps its unit", async () => {
    const t = newTest();
    const { as, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });
    const bacon = await addIngredient(t, householdId, { name: "bacon", kind: "count" });
    await as.mutation(api.pantry.setCount, {
      ingredientId: bacon,
      quantityText: "10",
      unit: "slice",
      location: "fridge",
    });

    await as.mutation(api.pantry.markOut, { ingredientId: bacon });

    const [row] = await as.query(api.pantry.list, {});
    expect(row.count).toEqual({ quantityText: "0", quantityDecimal: 0, unit: "slice" });
    const events = await eventsOf(t, householdId);
    expect(events.at(-1)?.type).toBe("adjustment");
    expect(events.at(-1)?.payload).toEqual({
      before: {
        ingredientId: bacon,
        location: "fridge",
        count: { quantityText: "10", quantityDecimal: 10, unit: "slice" },
      },
      after: {
        ingredientId: bacon,
        location: "fridge",
        count: { quantityText: "0", quantityDecimal: 0, unit: "slice" },
      },
    });
  });

  it("takes a level to out", async () => {
    const t = newTest();
    const { as, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });
    const dijon = await addIngredient(t, householdId, { name: "Dijon mustard", kind: "level" });
    await as.mutation(api.pantry.setLevel, {
      ingredientId: dijon,
      level: "low",
      location: "fridge",
    });

    await as.mutation(api.pantry.markOut, { ingredientId: dijon });

    const [row] = await as.query(api.pantry.list, {});
    expect(row.level).toBe("out");
    const events = await eventsOf(t, householdId);
    expect(events.at(-1)?.payload).toEqual({
      before: { ingredientId: dijon, location: "fridge", level: "low" },
      after: { ingredientId: dijon, location: "fridge", level: "out" },
    });
  });

  it("says so when the ingredient is not in the pantry", async () => {
    const t = newTest();
    const { as, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });
    const dijon = await addIngredient(t, householdId, { name: "Dijon mustard", kind: "level" });
    await expect(as.mutation(api.pantry.markOut, { ingredientId: dijon })).rejects.toMatchObject({
      data: "Dijon mustard is not in the pantry.",
    });
    await expect(eventsOf(t, householdId)).resolves.toEqual([]);
  });
});

describe("pantry.remove", () => {
  it("deletes the row and records an adjustment whose after is null", async () => {
    const t = newTest();
    const { as, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });
    const salt = await addIngredient(t, householdId, { name: "kosher salt", kind: "level" });
    await as.mutation(api.pantry.setLevel, {
      ingredientId: salt,
      level: "half",
      location: "pantry",
    });
    const [row] = await as.query(api.pantry.list, {});

    await as.mutation(api.pantry.remove, { ingredientId: salt });

    await expect(as.query(api.pantry.list, {})).resolves.toEqual([]);
    const events = await eventsOf(t, householdId);
    expect(events.at(-1)).toMatchObject({
      type: "adjustment",
      refs: { pantryItemId: row.pantryItemId },
      payload: {
        before: { ingredientId: salt, location: "pantry", level: "half" },
        after: null,
      },
    });
  });
});

describe("pantry.list", () => {
  it("orders by fridge, freezer, pantry, counter, then name", async () => {
    const t = newTest();
    const { as, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });
    const rows: [string, "pantry" | "fridge" | "freezer" | "counter"][] = [
      ["onion", "counter"],
      ["rice", "pantry"],
      ["Butter", "fridge"],
      ["peas", "freezer"],
      ["apples", "fridge"],
      ["flour", "pantry"],
    ];
    for (const [name, location] of rows) {
      const id = await addIngredient(t, householdId, { name, kind: "count" });
      await as.mutation(api.pantry.setCount, {
        ingredientId: id,
        quantityText: "1",
        unit: "each",
        location,
      });
    }
    const listed = await as.query(api.pantry.list, {});
    expect(listed.map((r) => [r.location, r.name])).toEqual([
      ["fridge", "apples"],
      ["fridge", "Butter"],
      ["freezer", "peas"],
      ["pantry", "flour"],
      ["pantry", "rice"],
      ["counter", "onion"],
    ]);
  });

  it("never shows one household's pantry to another", async () => {
    const t = newTest();
    const a = await createHousehold(t, { who: "Alice", name: "A" });
    const b = await createHousehold(t, { who: "Bob", name: "B" });
    const eggs = await addIngredient(t, a.householdId, { name: "large eggs", kind: "count" });
    await a.as.mutation(api.pantry.setCount, {
      ingredientId: eggs,
      quantityText: "6",
      unit: "each",
    });

    await expect(a.as.query(api.pantry.list, {})).resolves.toHaveLength(1);
    await expect(b.as.query(api.pantry.list, {})).resolves.toEqual([]);
  });

  it("refuses to write to another household's ingredient", async () => {
    const t = newTest();
    const a = await createHousehold(t, { who: "Alice", name: "A" });
    const b = await createHousehold(t, { who: "Bob", name: "B" });
    const eggs = await addIngredient(t, a.householdId, { name: "large eggs", kind: "count" });
    await expect(
      b.as.mutation(api.pantry.setCount, { ingredientId: eggs, quantityText: "6", unit: "each" }),
    ).rejects.toMatchObject({ data: "That ingredient is not in this household." });
    await expect(a.as.query(api.pantry.list, {})).resolves.toEqual([]);
  });
});
