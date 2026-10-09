import { convexTest } from "convex-test";
import type { FunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import * as ingredients from "./ingredients";
import * as pantry from "./pantry";
import schema from "./schema";
import { createHousehold, identityFor, type Test } from "./test_helpers";

const modules = import.meta.glob("./**/*.ts");

// Every public function in ingredients.ts and pantry.ts, with arguments that would be valid
// for a member of the household that owns the ingredient. Strangers must be refused.
type Case = {
  name: string;
  kind: "query" | "mutation";
  fn: FunctionReference<"query" | "mutation", "public">;
  args: (ingredientId: Id<"ingredients">) => Record<string, unknown>;
};

const cases: Case[] = [
  { name: "ingredients.list", kind: "query", fn: api.ingredients.list, args: () => ({}) },
  { name: "ingredients.get", kind: "query", fn: api.ingredients.get, args: (id) => ({ id }) },
  {
    name: "ingredients.upsert",
    kind: "mutation",
    fn: api.ingredients.upsert,
    args: () => ({
      name: "salt",
      kind: "level",
      category: "baking_pantry_condiments",
      aliases: [],
      tracked: true,
    }),
  },
  {
    name: "ingredients.resolve",
    kind: "query",
    fn: api.ingredients.resolve,
    args: () => ({ name: "eggs" }),
  },
  { name: "pantry.list", kind: "query", fn: api.pantry.list, args: () => ({}) },
  {
    name: "pantry.setCount",
    kind: "mutation",
    fn: api.pantry.setCount,
    args: (ingredientId) => ({ ingredientId, quantityText: "6", unit: "each" }),
  },
  {
    name: "pantry.setLevel",
    kind: "mutation",
    fn: api.pantry.setLevel,
    args: (ingredientId) => ({ ingredientId, level: "full" }),
  },
  {
    name: "pantry.markOut",
    kind: "mutation",
    fn: api.pantry.markOut,
    args: (ingredientId) => ({ ingredientId }),
  },
  {
    name: "pantry.remove",
    kind: "mutation",
    fn: api.pantry.remove,
    args: (ingredientId) => ({ ingredientId }),
  },
];

function publicFunctionNames() {
  return Object.entries({ ingredients, pantry }).flatMap(([module, exports]) =>
    Object.entries(exports)
      .filter(([, value]) => (value as { isPublic?: boolean }).isPublic === true)
      .map(([name]) => `${module}.${name}`),
  );
}

/** A household with one count ingredient in the pantry, so every call has a real target. */
async function stockedHousehold(t: Test) {
  const { as, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });
  const ingredientId = await as.mutation(api.ingredients.upsert, {
    name: "large eggs",
    kind: "count",
    category: "dairy_refrigerated",
    aliases: [],
    tracked: true,
  });
  await as.mutation(api.pantry.setCount, { ingredientId, quantityText: "12", unit: "each" });
  return { householdId, ingredientId };
}

async function snapshot(t: Test) {
  return await t.run(async (ctx) => ({
    ingredients: await ctx.db.query("ingredients").collect(),
    pantryItems: await ctx.db.query("pantryItems").collect(),
    events: await ctx.db.query("inventoryEvents").collect(),
  }));
}

function call(t: ReturnType<Test["withIdentity"]> | Test, c: Case, id: Id<"ingredients">) {
  return c.kind === "query"
    ? t.query(c.fn as FunctionReference<"query">, c.args(id))
    : t.mutation(c.fn as FunctionReference<"mutation">, c.args(id));
}

describe("pantry and ingredients isolation registry", () => {
  it("lists every public function in ingredients.ts and pantry.ts", () => {
    expect(cases.map((c) => c.name).sort()).toEqual(publicFunctionNames().sort());
  });
});

describe("anonymous callers", () => {
  it.each(cases)("$name refuses an anonymous caller and writes nothing", async (c) => {
    const t = convexTest(schema, modules);
    const { ingredientId } = await stockedHousehold(t);
    const before = await snapshot(t);
    await expect(call(t, c, ingredientId)).rejects.toMatchObject({ data: "Sign in first." });
    expect(await snapshot(t)).toEqual(before);
  });
});

describe("signed-in callers without a household", () => {
  it.each(cases)("$name refuses someone who has not joined", async (c) => {
    const t = convexTest(schema, modules);
    const { ingredientId } = await stockedHousehold(t);
    const before = await snapshot(t);
    await expect(
      call(t.withIdentity(identityFor("Stranger")), c, ingredientId),
    ).rejects.toMatchObject({ data: "Join a household first." });
    expect(await snapshot(t)).toEqual(before);
  });
});
