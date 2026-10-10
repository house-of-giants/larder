import { convexTest } from "convex-test";
import type { FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import * as closeout from "./closeout";
import * as cooking from "./cooking";
import * as leftovers from "./leftovers";
import schema from "./schema";
import { createHousehold, identityFor, type Test } from "./test_helpers";
import * as undo from "./undo";

const modules = import.meta.glob("./**/*.ts");

// seed.load runs only where SEED_ALLOWED is "true"; the config resets stubs between tests.
beforeEach(() => {
  vi.stubEnv("SEED_ALLOWED", "true");
});

// Every public function in cooking.ts, leftovers.ts, closeout.ts, and undo.ts, with
// arguments that would be valid for a member of the household that owns the targets.
// Anonymous callers, people who have not joined, and members of another household must all
// be refused without a write.
type Targets = {
  weekId: Id<"weeks">;
  recipeId: Id<"recipes">;
  ingredientId: Id<"ingredients">;
  cookingEventId: Id<"cookingEvents">;
  preparedFoodId: Id<"preparedFoods">;
  consumptionEventId: Id<"inventoryEvents">;
};

type Case = {
  name: string;
  kind: "query" | "mutation";
  fn: FunctionReference<"query" | "mutation", "public">;
  args: (targets: Targets) => Record<string, unknown>;
  /** Names another household's row, so a stranger's call must be refused too. */
  foreign: boolean;
};

const cases: Case[] = [
  {
    name: "cooking.sheet",
    kind: "query",
    fn: api.cooking.sheet,
    args: ({ recipeId }) => ({ recipeId }),
    foreign: true,
  },
  {
    name: "cooking.madeIt",
    kind: "mutation",
    fn: api.cooking.madeIt,
    args: ({ weekId, recipeId }) => ({
      weekId,
      recipeId,
      multiplierText: "1",
      skippedIngredientIds: [],
      substitutions: [],
    }),
    foreign: true,
  },
  {
    name: "cooking.undo",
    kind: "mutation",
    fn: api.cooking.undo,
    args: ({ cookingEventId }) => ({ cookingEventId }),
    foreign: true,
  },
  {
    name: "cooking.forWeek",
    kind: "query",
    fn: api.cooking.forWeek,
    args: ({ weekId }) => ({ weekId }),
    foreign: true,
  },
  {
    name: "leftovers.list",
    kind: "query",
    fn: api.leftovers.list,
    args: () => ({}),
    foreign: false,
  },
  {
    name: "leftovers.consume",
    kind: "mutation",
    fn: api.leftovers.consume,
    args: ({ preparedFoodId }) => ({ preparedFoodId }),
    foreign: true,
  },
  {
    name: "leftovers.discard",
    kind: "mutation",
    fn: api.leftovers.discard,
    args: ({ preparedFoodId }) => ({ preparedFoodId }),
    foreign: true,
  },
  {
    name: "leftovers.move",
    kind: "mutation",
    fn: api.leftovers.move,
    args: ({ preparedFoodId }) => ({ preparedFoodId, location: "freezer" }),
    foreign: true,
  },
  {
    name: "closeout.run",
    kind: "mutation",
    fn: api.closeout.run,
    args: ({ weekId }) => ({ weekId, decisions: [] }),
    foreign: true,
  },
  { name: "undo.recent", kind: "query", fn: api.undo.recent, args: () => ({}), foreign: false },
  {
    name: "undo.event",
    kind: "mutation",
    fn: api.undo.event,
    args: ({ consumptionEventId }) => ({ eventId: consumptionEventId }),
    foreign: true,
  },
  {
    name: "undo.events",
    kind: "mutation",
    fn: api.undo.events,
    args: ({ consumptionEventId }) => ({ eventIds: [consumptionEventId] }),
    foreign: true,
  },
];

function publicFunctionNames() {
  return Object.entries({ cooking, leftovers, closeout, undo }).flatMap(([module, exports]) =>
    Object.entries(exports)
      .filter(([, value]) => (value as { isPublic?: boolean } | null)?.isPublic === true)
      .map(([name]) => `${module}.${name}`),
  );
}

/** Alice's seeded week with the sliders cooked and one eaten, so every call has a target. */
async function seeded(t: Test): Promise<Targets> {
  const { as, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });
  await t.mutation(internal.seed.load, { householdId });
  const week = await as.query(api.weeks.current, {});
  if (week === null) throw new Error("seed made no week");
  await as.mutation(api.lists.generate, { weekId: week._id });
  const recipeId = week.recipes.find((r) => r.name === "Italian Grinder Sliders")!.recipeId;
  const cooked = await as.mutation(api.cooking.madeIt, {
    weekId: week._id,
    recipeId,
    multiplierText: "1",
    skippedIngredientIds: [],
    substitutions: [],
  });
  const preparedFoodId = cooked.preparedFood!.preparedFoodId;
  await as.mutation(api.leftovers.consume, { preparedFoodId });
  const consumption = await t.run((ctx) =>
    ctx.db
      .query("inventoryEvents")
      .filter((q) => q.eq(q.field("type"), "consumption"))
      .first(),
  );
  return {
    weekId: week._id,
    recipeId,
    ingredientId: cooked.deductions[0].ingredientId,
    cookingEventId: cooked.cookingEventId,
    preparedFoodId,
    consumptionEventId: consumption!._id,
  };
}

const tables = [
  "weeks",
  "cookingEvents",
  "preparedFoods",
  "pantryItems",
  "listItems",
  "inventoryEvents",
] as const;

async function snapshot(t: Test) {
  return await t.run(async (ctx) => {
    const rows: Record<string, unknown[]> = {};
    for (const table of tables) rows[table] = await ctx.db.query(table).collect();
    return rows;
  });
}

function call(t: ReturnType<Test["withIdentity"]> | Test, c: Case, targets: Targets) {
  return c.kind === "query"
    ? t.query(c.fn as FunctionReference<"query">, c.args(targets))
    : t.mutation(c.fn as FunctionReference<"mutation">, c.args(targets));
}

describe("cooking, leftovers, closeout, and undo isolation registry", () => {
  it("lists every public function in the four modules", () => {
    expect(cases.map((c) => c.name).sort()).toEqual(publicFunctionNames().sort());
  });
});

describe("anonymous callers", () => {
  it.each(cases)("$name refuses an anonymous caller and writes nothing", async (c) => {
    const t = convexTest(schema, modules);
    const targets = await seeded(t);
    const before = await snapshot(t);
    await expect(call(t, c, targets)).rejects.toMatchObject({ data: "Sign in first." });
    expect(await snapshot(t)).toEqual(before);
  });
});

describe("signed-in callers without a household", () => {
  it.each(cases)("$name refuses someone who has not joined", async (c) => {
    const t = convexTest(schema, modules);
    const targets = await seeded(t);
    const before = await snapshot(t);
    await expect(call(t.withIdentity(identityFor("Stranger")), c, targets)).rejects.toMatchObject({
      data: "Join a household first.",
    });
    expect(await snapshot(t)).toEqual(before);
  });
});

describe("members of another household", () => {
  it.each(cases.filter((c) => c.foreign))("$name refuses another household's row", async (c) => {
    const t = convexTest(schema, modules);
    const targets = await seeded(t);
    const bob = await createHousehold(t, { who: "Bob", name: "Oak" });
    const before = await snapshot(t);
    await expect(call(bob.as, c, targets)).rejects.toMatchObject({
      data: expect.stringMatching(/is not here\.$/),
    });
    expect(await snapshot(t)).toEqual(before);
  });

  it("refuses another household's ingredient in a skip or a swap", async () => {
    const t = convexTest(schema, modules);
    const targets = await seeded(t);
    const bob = await createHousehold(t, { who: "Bob", name: "Oak" });
    await t.mutation(internal.seed.load, { householdId: bob.householdId });
    const bobWeek = (await bob.as.query(api.weeks.current, {}))!;
    const bobRecipe = bobWeek.recipes[0].recipeId;
    const before = await snapshot(t);
    const base = {
      weekId: bobWeek._id,
      recipeId: bobRecipe,
      multiplierText: "1",
      skippedIngredientIds: [],
      substitutions: [],
    };
    await expect(
      bob.as.mutation(api.cooking.madeIt, {
        ...base,
        skippedIngredientIds: [targets.ingredientId],
      }),
    ).rejects.toMatchObject({ data: "That ingredient is not in this household." });
    await expect(
      bob.as.mutation(api.cooking.madeIt, {
        ...base,
        substitutions: [
          {
            ingredientId: bobWeek.adaptations[0].originalIngredientId!,
            replacementIngredientId: targets.ingredientId,
          },
        ],
      }),
    ).rejects.toMatchObject({ data: "That ingredient is not in this household." });
    expect(await snapshot(t)).toEqual(before);
  });

  it("does not show another household's leftovers or events", async () => {
    const t = convexTest(schema, modules);
    await seeded(t);
    const bob = await createHousehold(t, { who: "Bob", name: "Oak" });
    expect(await bob.as.query(api.leftovers.list, {})).toEqual([]);
    expect(await bob.as.query(api.undo.recent, {})).toEqual([]);
  });
});
