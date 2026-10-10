import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { countOf } from "../src/lib/pantry-amount";
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

/** A seeded household with its list made, so its week is shopping. */
async function seeded(t: Test, who: string, name: string) {
  const { as, householdId } = await createHousehold(t, { who, name });
  await t.mutation(internal.seed.load, { householdId });
  const week = (await as.query(api.weeks.current, {}))!;
  await as.mutation(api.lists.generate, { weekId: week._id });
  const recipeId = week.recipes.find((r) => r.name === SLIDERS)!.recipeId;
  return { as, householdId, weekId: week._id, recipeId };
}

const cook = (weekId: Id<"weeks">, recipeId: Id<"recipes">, multiplierText = "1") => ({
  weekId,
  recipeId,
  multiplierText,
  skippedIngredientIds: [],
  substitutions: [],
});

async function ingredientId(t: Test, householdId: Id<"households">, name: string) {
  const row = await t.run((ctx) =>
    ctx.db
      .query("ingredients")
      .withIndex("by_householdId_nameKey", (q) =>
        q.eq("householdId", householdId).eq("nameKey", normalizeName(name)),
      )
      .unique(),
  );
  return row!._id;
}

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

/** Every row a reversal could touch, to prove a refusal wrote nothing. */
async function everything(t: Test) {
  return await t.run(async (ctx) => ({
    pantryItems: await ctx.db.query("pantryItems").collect(),
    preparedFoods: await ctx.db.query("preparedFoods").collect(),
    cookingEvents: await ctx.db.query("cookingEvents").collect(),
    inventoryEvents: await ctx.db.query("inventoryEvents").collect(),
    weeks: await ctx.db.query("weeks").collect(),
  }));
}

describe("undo refuses an event whose snapshot reaches outside the household", () => {
  it("a deduction naming another household's ingredient", async () => {
    const t = newTest();
    const alice = await seeded(t, "Alice", "Elm");
    const bob = await seeded(t, "Bob", "Oak");
    const made = await alice.as.mutation(api.cooking.madeIt, cook(alice.weekId, alice.recipeId));
    const bobRolls = await ingredientId(t, bob.householdId, "Hawaiian rolls");
    const memberId = (await t.run((ctx) => ctx.db.query("members").first()))!._id;
    await t.run((ctx) =>
      ctx.db.insert("inventoryEvents", {
        householdId: alice.householdId,
        type: "deduction",
        at: Date.now(),
        actor: { kind: "member", memberId },
        refs: { cookingEventId: made.cookingEventId },
        payload: {
          before: {
            ingredientId: bobRolls,
            location: "pantry",
            count: { quantityText: "12", quantityDecimal: 12, unit: "each" },
          },
          after: {
            ingredientId: bobRolls,
            location: "pantry",
            count: { quantityText: "0", quantityDecimal: 0, unit: "each" },
          },
          wentNegative: false,
          used: 12,
        },
      }),
    );
    const before = await everything(t);
    await expect(
      alice.as.mutation(api.cooking.undo, { cookingEventId: made.cookingEventId }),
    ).rejects.toMatchObject({ data: "That event is not here." });
    expect(await everything(t)).toEqual(before);
  });

  it("a deduction whose before and after name different ingredients", async () => {
    const t = newTest();
    const alice = await seeded(t, "Alice", "Elm");
    const made = await alice.as.mutation(api.cooking.madeIt, cook(alice.weekId, alice.recipeId));
    const ham = await ingredientId(t, alice.householdId, "sliced ham");
    await t.run(async (ctx) => {
      const event = (await ctx.db.query("inventoryEvents").collect()).find(
        (e) => e.type === "deduction" && e.refs.cookingEventId === made.cookingEventId,
      )!;
      await ctx.db.patch(event._id, {
        payload: { ...event.payload, before: { ...event.payload.before, ingredientId: ham } },
      });
    });
    const before = await everything(t);
    await expect(
      alice.as.mutation(api.cooking.undo, { cookingEventId: made.cookingEventId }),
    ).rejects.toMatchObject({ data: "That event is not here." });
    expect(await everything(t)).toEqual(before);
  });

  it("a closeout whose snapshot names another household's week", async () => {
    const t = newTest();
    const alice = await seeded(t, "Alice", "Elm");
    const bob = await seeded(t, "Bob", "Oak");
    await alice.as.mutation(api.cooking.madeIt, cook(alice.weekId, alice.recipeId));
    await alice.as.mutation(api.closeout.run, {
      weekId: alice.weekId,
      decisions: [],
      weekOf: "2026-10-16",
    });
    const closeout = await t.run(async (ctx) => {
      const event = (await ctx.db.query("inventoryEvents").collect()).find(
        (e) => e.type === "closeout",
      )!;
      await ctx.db.patch(event._id, {
        payload: { ...event.payload, before: { ...event.payload.before, weekId: bob.weekId } },
      });
      return event._id;
    });
    const before = await everything(t);
    await expect(alice.as.mutation(api.undo.event, { eventId: closeout })).rejects.toMatchObject({
      data: "That event is not here.",
    });
    expect(await everything(t)).toEqual(before);
  });
});

describe("joined rows from another household stay unknown", () => {
  it("the drawer does not offer to undo another household's cook", async () => {
    const t = newTest();
    const alice = await seeded(t, "Alice", "Elm");
    const bob = await seeded(t, "Bob", "Oak");
    const bobCook = await bob.as.mutation(api.cooking.madeIt, cook(bob.weekId, bob.recipeId));
    const alicesMember = (await t.run((ctx) =>
      ctx.db
        .query("members")
        .withIndex("by_householdId", (q) => q.eq("householdId", alice.householdId))
        .first(),
    ))!._id;
    await t.run((ctx) =>
      ctx.db.insert("inventoryEvents", {
        householdId: alice.householdId,
        type: "deduction",
        at: Date.now(),
        actor: { kind: "member", memberId: alicesMember },
        refs: { cookingEventId: bobCook.cookingEventId },
        payload: {},
      }),
    );
    const [row] = await alice.as.query(api.undo.recent, {});
    expect(row).toMatchObject({ line: "Made a recipe", canUndo: false });
  });

  it("the week's Made line skips a cook pointing at another household's recipe", async () => {
    const t = newTest();
    const alice = await seeded(t, "Alice", "Elm");
    const bob = await seeded(t, "Bob", "Oak");
    await t.run((ctx) =>
      ctx.db.insert("cookingEvents", {
        householdId: alice.householdId,
        weekId: alice.weekId,
        recipeId: bob.recipeId,
        cookedAt: Date.now(),
        multiplier: { text: "1", decimal: 1 },
        skippedIngredientIds: [],
        substitutions: [],
      }),
    );
    await alice.as.mutation(api.cooking.madeIt, cook(alice.weekId, alice.recipeId));
    const made = await alice.as.query(api.cooking.forWeek, { weekId: alice.weekId });
    expect(made.map((m) => m.recipeId)).toEqual([alice.recipeId]);
  });
});

describe("cook undo gives back only what the cook took", () => {
  it("recreates a removed row with the cook's share, not the pre-cook amount", async () => {
    const t = newTest();
    const alice = await seeded(t, "Alice", "Elm");
    const rolls = await ingredientId(t, alice.householdId, "Hawaiian rolls");
    const made = await alice.as.mutation(
      api.cooking.madeIt,
      cook(alice.weekId, alice.recipeId, "1/2"),
    );
    expect(countOf(await shelf(t, alice.householdId, "Hawaiian rolls"))?.quantityDecimal).toBe(6);
    await alice.as.mutation(api.pantry.remove, { ingredientId: rolls });
    await alice.as.mutation(api.cooking.undo, { cookingEventId: made.cookingEventId });
    expect(countOf(await shelf(t, alice.householdId, "Hawaiian rolls"))).toMatchObject({
      quantityDecimal: 6,
      unit: "each",
    });
  });

  it("gives back what was actually taken when the cook came up short", async () => {
    const t = newTest();
    const alice = await seeded(t, "Alice", "Elm");
    const ham = await ingredientId(t, alice.householdId, "sliced ham");
    await alice.as.mutation(api.pantry.setCount, {
      ingredientId: ham,
      quantityText: "6",
      unit: "oz",
    });
    const made = await alice.as.mutation(api.cooking.madeIt, cook(alice.weekId, alice.recipeId));
    // The recipe wanted 8 oz; only 6 were there, so 6 come back on top of the 3 bought since.
    await alice.as.mutation(api.pantry.setCount, {
      ingredientId: ham,
      quantityText: "3",
      unit: "oz",
    });
    await alice.as.mutation(api.cooking.undo, { cookingEventId: made.cookingEventId });
    expect(countOf(await shelf(t, alice.householdId, "sliced ham"))?.quantityDecimal).toBe(9);
  });
});

describe("undo follows insertion order, not the tap's clock", () => {
  it("finds an earlier-stamped undo and reverses exactly the purchase asked for", async () => {
    const t = newTest();
    const alice = await seeded(t, "Alice", "Elm");
    const butter = (await t.run(async (ctx) =>
      (await ctx.db.query("listItems").collect()).find((i) => i.displayName === "unsalted butter"),
    ))!;
    const set = (status: "checked" | "needed", at: number) =>
      alice.as.mutation(api.lists.setItemStatus, { listItemId: butter._id, status, at });
    await set("checked", 300);
    await set("needed", 100);
    await set("checked", 200);
    const purchases = await t.run(async (ctx) =>
      (await ctx.db.query("inventoryEvents").collect()).filter(
        (e) => e.type === "purchase" && e.refs.listItemId === butter._id,
      ),
    );
    expect(purchases.map((p) => p.at)).toEqual([300, 200]);
    const [first, second] = purchases;

    await expect(alice.as.mutation(api.undo.event, { eventId: first._id })).rejects.toMatchObject({
      data: "Already undone.",
    });
    await alice.as.mutation(api.undo.event, { eventId: second._id });
    const undo = await t.run(async (ctx) =>
      (await ctx.db.query("inventoryEvents").order("desc").collect()).find(
        (e) => e.type === "undo",
      ),
    );
    expect(undo?.undoesEventId).toBe(second._id);
    expect(countOf(await shelf(t, alice.householdId, "unsalted butter"))?.quantityDecimal).toBe(5);
  });
});

describe("the drawer only offers what undo will do", () => {
  it("says why a cook someone ate from cannot be undone", async () => {
    const t = newTest();
    const alice = await seeded(t, "Alice", "Elm");
    const made = await alice.as.mutation(api.cooking.madeIt, cook(alice.weekId, alice.recipeId));
    await alice.as.mutation(api.leftovers.consume, {
      preparedFoodId: made.preparedFood!.preparedFoodId,
    });
    const row = (await alice.as.query(api.undo.recent, {})).find((r) => r.isCook);
    expect(row).toMatchObject({ canUndo: false, reason: "Someone ate from it." });
  });

  it("says why a tossed cook cannot be undone, without promising an undo", async () => {
    const t = newTest();
    const alice = await seeded(t, "Alice", "Elm");
    const made = await alice.as.mutation(api.cooking.madeIt, cook(alice.weekId, alice.recipeId));
    await alice.as.mutation(api.leftovers.discard, {
      preparedFoodId: made.preparedFood!.preparedFoodId,
    });
    const row = (await alice.as.query(api.undo.recent, {})).find((r) => r.isCook);
    expect(row).toMatchObject({ canUndo: false, reason: "Tossed since." });
    await expect(
      alice.as.mutation(api.cooking.undo, { cookingEventId: made.cookingEventId }),
    ).rejects.toMatchObject({ data: `${SLIDERS} was tossed, so the cook stays.` });
  });

  it("says an undone event is undone", async () => {
    const t = newTest();
    const alice = await seeded(t, "Alice", "Elm");
    const made = await alice.as.mutation(api.cooking.madeIt, cook(alice.weekId, alice.recipeId));
    await alice.as.mutation(api.cooking.undo, { cookingEventId: made.cookingEventId });
    const row = (await alice.as.query(api.undo.recent, {})).find(
      (r) => r.isCook && r.line === `Made ${SLIDERS}`,
    );
    expect(row).toMatchObject({ canUndo: false, reason: "Undone." });
  });
});

describe("a closeout undone in one go", () => {
  const BITES = "Monster Cookie Protein Bites";

  /** Alice's week with the sliders and the bites made, so two foods are in the fridge. */
  async function twoFoods(t: Test) {
    const alice = await seeded(t, "Alice", "Elm");
    const bites = (await alice.as.query(api.weeks.current, {}))!.recipes.find(
      (r) => r.name === BITES,
    )!.recipeId;
    await alice.as.mutation(api.cooking.madeIt, cook(alice.weekId, alice.recipeId));
    await alice.as.mutation(api.cooking.madeIt, cook(alice.weekId, bites));
    return alice;
  }

  const fridge = (t: Test, householdId: Id<"households">) =>
    t.run(async (ctx) =>
      (await ctx.db.query("preparedFoods").collect())
        .filter((f) => f.householdId === householdId)
        .map((f) => ({ name: f.name, status: f.status, remaining: f.remaining.text }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );

  it("returns the closeout's own events, and undoing them puts both foods back", async () => {
    const t = newTest();
    const alice = await twoFoods(t);
    const result = await alice.as.mutation(api.closeout.run, {
      weekId: alice.weekId,
      decisions: [],
      weekOf: "2026-10-16",
    });
    expect(result.undoEventIds).toHaveLength(2);
    // Sorted by name: the sliders ("Italian ...") before the bites ("Monster ...").
    expect(await fridge(t, alice.householdId)).toEqual([
      { name: SLIDERS, status: "consumed", remaining: "0" },
      { name: BITES, status: "consumed", remaining: "0" },
    ]);

    await alice.as.mutation(api.undo.events, { eventIds: result.undoEventIds });
    expect(await fridge(t, alice.householdId)).toEqual([
      { name: SLIDERS, status: "available", remaining: "12" },
      { name: BITES, status: "available", remaining: "24" },
    ]);
    // The new week stays open.
    expect((await alice.as.query(api.weeks.current, {}))?._id).toBe(result.nextWeekId);
  });

  it("refuses the lot when one event is another household's", async () => {
    const t = newTest();
    const alice = await twoFoods(t);
    const bob = await seeded(t, "Bob", "Oak");
    await bob.as.mutation(api.cooking.madeIt, cook(bob.weekId, bob.recipeId));
    const bobs = await bob.as.mutation(api.closeout.run, {
      weekId: bob.weekId,
      decisions: [],
      weekOf: "2026-10-16",
    });
    const alices = await alice.as.mutation(api.closeout.run, {
      weekId: alice.weekId,
      decisions: [],
      weekOf: "2026-10-16",
    });
    const before = await everything(t);
    await expect(
      alice.as.mutation(api.undo.events, {
        eventIds: [...alices.undoEventIds, ...bobs.undoEventIds],
      }),
    ).rejects.toMatchObject({ data: "That event is not here." });
    expect(await everything(t)).toEqual(before);
  });

  it("refuses the lot when one event is already undone", async () => {
    const t = newTest();
    const alice = await twoFoods(t);
    const { undoEventIds } = await alice.as.mutation(api.closeout.run, {
      weekId: alice.weekId,
      decisions: [],
      weekOf: "2026-10-16",
    });
    await alice.as.mutation(api.undo.event, { eventId: undoEventIds[0] });
    const before = await everything(t);
    await expect(
      alice.as.mutation(api.undo.events, { eventIds: undoEventIds }),
    ).rejects.toMatchObject({ data: expect.stringMatching(/undone/i) });
    expect(await everything(t)).toEqual(before);
  });
});
