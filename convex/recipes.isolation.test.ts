import { convexTest } from "convex-test";
import type { FunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import * as recipes from "./recipes";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// Every public function in convex/recipes.ts, with arguments that would otherwise be valid.
// An anonymous caller must be refused before anything is read or written.
type Case = {
  name: string;
  kind: "query" | "mutation";
  fn: FunctionReference<"query" | "mutation", "public">;
  args: Record<string, unknown>;
};

// convex-test ids are a counter then the table name; these pass `v.id` and point at nothing.
const recipeId = "1recipes";
const ingredientId = "1ingredients";

const cases: Case[] = [
  { name: "list", kind: "query", fn: api.recipes.list, args: {} },
  { name: "get", kind: "query", fn: api.recipes.get, args: { id: recipeId } },
  { name: "ingredientOptions", kind: "query", fn: api.recipes.ingredientOptions, args: {} },
  {
    name: "upsert",
    kind: "mutation",
    fn: api.recipes.upsert,
    args: {
      name: "Sliders",
      instructions: [],
      tags: [],
      ingredients: [{ ingredientId, quantityText: "1", unit: "each", optional: false }],
    },
  },
  {
    name: "createIngredientInline",
    kind: "mutation",
    fn: api.recipes.createIngredientInline,
    args: { name: "eggs" },
  },
  { name: "archive", kind: "mutation", fn: api.recipes.archive, args: { id: recipeId } },
  { name: "restore", kind: "mutation", fn: api.recipes.restore, args: { id: recipeId } },
];

describe("recipes isolation registry", () => {
  it("covers every public function in convex/recipes.ts", () => {
    const exported = Object.entries(recipes)
      .filter(([, value]) => (value as { isPublic?: boolean }).isPublic === true)
      .map(([name]) => name);
    expect(cases.map((c) => c.name).sort()).toEqual(exported.sort());
  });
});

describe("anonymous callers", () => {
  it.each(cases)("recipes.$name refuses an anonymous caller", async ({ kind, fn, args }) => {
    const t = convexTest(schema, modules);
    const call =
      kind === "query"
        ? t.query(fn as FunctionReference<"query">, args)
        : t.mutation(fn as FunctionReference<"mutation">, args);
    await expect(call).rejects.toMatchObject({ data: "Sign in first." });
    const written = await t.run(async (ctx) => ({
      recipes: await ctx.db.query("recipes").collect(),
      rows: await ctx.db.query("recipeIngredients").collect(),
      ingredients: await ctx.db.query("ingredients").collect(),
    }));
    expect(written).toEqual({ recipes: [], rows: [], ingredients: [] });
  });
});
