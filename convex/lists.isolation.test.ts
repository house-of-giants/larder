import { convexTest } from "convex-test";
import type { FunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import * as lists from "./lists";
import schema from "./schema";
import { createHousehold, identityFor, type Test } from "./test_helpers";
import * as weeks from "./weeks";

const modules = import.meta.glob("./**/*.ts");

// Every public function in weeks.ts and lists.ts, with arguments that would be valid for a
// member of the household that owns the targets. Anonymous callers, people who have not
// joined, and members of another household must all be refused without a write.
type Targets = {
  weekId: Id<"weeks">;
  recipeId: Id<"recipes">;
  ingredientId: Id<"ingredients">;
  adaptationId: Id<"weekAdaptations">;
  listItemId: Id<"listItems">;
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
  { name: "weeks.current", kind: "query", fn: api.weeks.current, args: () => ({}), foreign: false },
  {
    name: "weeks.create",
    kind: "mutation",
    fn: api.weeks.create,
    args: () => ({ weekOf: "2026-10-16" }),
    foreign: false,
  },
  {
    name: "weeks.setRecipe",
    kind: "mutation",
    fn: api.weeks.setRecipe,
    args: ({ weekId, recipeId }) => ({ weekId, recipeId, status: "skipped" }),
    foreign: true,
  },
  {
    name: "weeks.addAdaptation",
    kind: "mutation",
    fn: api.weeks.addAdaptation,
    args: ({ weekId, recipeId, ingredientId }) => ({
      weekId,
      recipeId,
      kind: "remove",
      originalIngredientId: ingredientId,
      description: "",
    }),
    foreign: true,
  },
  {
    name: "weeks.removeAdaptation",
    kind: "mutation",
    fn: api.weeks.removeAdaptation,
    args: ({ adaptationId }) => ({ adaptationId }),
    foreign: true,
  },
  {
    name: "weeks.setStatus",
    kind: "mutation",
    fn: api.weeks.setStatus,
    args: ({ weekId }) => ({ weekId, status: "cooking" }),
    foreign: true,
  },
  {
    name: "lists.generate",
    kind: "mutation",
    fn: api.lists.generate,
    args: ({ weekId }) => ({ weekId }),
    foreign: true,
  },
  { name: "lists.current", kind: "query", fn: api.lists.current, args: () => ({}), foreign: false },
  {
    name: "lists.addItem",
    kind: "mutation",
    fn: api.lists.addItem,
    args: () => ({ displayName: "paper towels" }),
    foreign: false,
  },
  {
    name: "lists.setItemStatus",
    kind: "mutation",
    fn: api.lists.setItemStatus,
    args: ({ listItemId }) => ({ listItemId, status: "checked" }),
    foreign: true,
  },
  {
    name: "lists.reconcileItems",
    kind: "query",
    fn: api.lists.reconcileItems,
    args: ({ weekId }) => ({ weekId }),
    foreign: true,
  },
];

function publicFunctionNames() {
  return Object.entries({ weeks, lists }).flatMap(([module, exports]) =>
    Object.entries(exports)
      .filter(([, value]) => (value as { isPublic?: boolean } | null)?.isPublic === true)
      .map(([name]) => `${module}.${name}`),
  );
}

/** Alice's seeded household with its list generated, so every call has a real target. */
async function seeded(t: Test): Promise<Targets> {
  const { as, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });
  await t.mutation(internal.seed.load, { householdId });
  const week = await as.query(api.weeks.current, {});
  if (week === null) throw new Error("seed made no week");
  await as.mutation(api.lists.generate, { weekId: week._id });
  const listItem = await t.run((ctx) =>
    ctx.db
      .query("listItems")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .first(),
  );
  return {
    weekId: week._id,
    recipeId: week.recipes[0].recipeId,
    ingredientId: listItem!.ingredientId!,
    adaptationId: week.adaptations[0]._id,
    listItemId: listItem!._id,
  };
}

const tables = [
  "weeks",
  "weekRecipes",
  "weekAdaptations",
  "lists",
  "listItems",
  "pantryItems",
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

describe("weeks and lists isolation registry", () => {
  it("lists every public function in weeks.ts and lists.ts", () => {
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
      data: expect.stringMatching(/is not here\.$|not on your list\.$/),
    });
    expect(await snapshot(t)).toEqual(before);
  });
});
