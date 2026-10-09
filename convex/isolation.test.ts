import { convexTest } from "convex-test";
import type { FunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// Registry of every public household-scoped function. Each phase that adds one adds it
// here, with arguments that would otherwise be valid. An anonymous caller must be refused.
type Case = {
  name: string;
  kind: "query" | "mutation";
  fn: FunctionReference<"query" | "mutation", "public">;
  args: Record<string, unknown>;
};

const cases: Case[] = [
  { name: "households.current", kind: "query", fn: api.households.current, args: {} },
  { name: "households.create", kind: "mutation", fn: api.households.create, args: { name: "A" } },
  {
    name: "households.join",
    kind: "mutation",
    fn: api.households.join,
    args: { inviteCode: "000000000000" },
  },
  { name: "households.rename", kind: "mutation", fn: api.households.rename, args: { name: "A" } },
  {
    name: "households.rotateInviteCode",
    kind: "mutation",
    fn: api.households.rotateInviteCode,
    args: {},
  },
  { name: "households.leave", kind: "mutation", fn: api.households.leave, args: {} },
  { name: "events.recent", kind: "query", fn: api.events.recent, args: {} },
  // Phase 2. convex-test ids are a counter then the table name; these pass `v.id` and
  // point at nothing, which is fine: the refusal comes first.
  { name: "ingredients.list", kind: "query", fn: api.ingredients.list, args: {} },
  { name: "ingredients.get", kind: "query", fn: api.ingredients.get, args: { id: "1ingredients" } },
  {
    name: "ingredients.upsert",
    kind: "mutation",
    fn: api.ingredients.upsert,
    args: {
      name: "salt",
      kind: "level",
      category: "baking_pantry_condiments",
      aliases: [],
      tracked: true,
    },
  },
  {
    name: "ingredients.resolve",
    kind: "query",
    fn: api.ingredients.resolve,
    args: { name: "eggs" },
  },
  { name: "pantry.list", kind: "query", fn: api.pantry.list, args: {} },
  {
    name: "pantry.setCount",
    kind: "mutation",
    fn: api.pantry.setCount,
    args: { ingredientId: "1ingredients", quantityText: "6", unit: "each" },
  },
  {
    name: "pantry.setLevel",
    kind: "mutation",
    fn: api.pantry.setLevel,
    args: { ingredientId: "1ingredients", level: "full" },
  },
  {
    name: "pantry.markOut",
    kind: "mutation",
    fn: api.pantry.markOut,
    args: { ingredientId: "1ingredients" },
  },
  {
    name: "pantry.remove",
    kind: "mutation",
    fn: api.pantry.remove,
    args: { ingredientId: "1ingredients" },
  },
  { name: "recipes.list", kind: "query", fn: api.recipes.list, args: {} },
  { name: "recipes.get", kind: "query", fn: api.recipes.get, args: { id: "1recipes" } },
  { name: "recipes.ingredientOptions", kind: "query", fn: api.recipes.ingredientOptions, args: {} },
  {
    name: "recipes.upsert",
    kind: "mutation",
    fn: api.recipes.upsert,
    args: {
      name: "Sliders",
      instructions: [],
      tags: [],
      ingredients: [
        { ingredientId: "1ingredients", quantityText: "1", unit: "each", optional: false },
      ],
    },
  },
  {
    name: "recipes.createIngredientInline",
    kind: "mutation",
    fn: api.recipes.createIngredientInline,
    args: { name: "eggs" },
  },
  { name: "recipes.archive", kind: "mutation", fn: api.recipes.archive, args: { id: "1recipes" } },
  { name: "recipes.restore", kind: "mutation", fn: api.recipes.restore, args: { id: "1recipes" } },
];

// Every Convex function module, so a public function added in any phase must be listed
// above. Not function modules: schema, auth config, generated code, shared helpers in
// lib/, tests and their helpers. health.ping is deliberately open: it reports whether
// the caller is signed in.
const functionModules = import.meta.glob<Record<string, unknown>>(
  [
    "./**/*.ts",
    "!./_generated/**",
    "!./lib/**",
    "!./**/*.test.ts",
    "!./test_helpers.ts",
    "!./schema.ts",
    // Throws at import without CLERK_JWT_ISSUER_DOMAIN; it holds no functions.
    "!./auth.config.ts",
    "!./health.ts",
  ],
  { eager: true },
);
function publicFunctionNames() {
  return Object.entries(functionModules).flatMap(([path, exports]) => {
    const module = path.replace(/^\.\//, "").replace(/\.ts$/, "");
    return Object.entries(exports)
      .filter(([, value]) => (value as { isPublic?: boolean } | null)?.isPublic === true)
      .map(([name]) => `${module}.${name}`);
  });
}

describe("isolation registry", () => {
  it("lists every public function in every Convex function module", () => {
    expect(cases.map((c) => c.name).sort()).toEqual(publicFunctionNames().sort());
  });
});

describe("anonymous callers", () => {
  it.each(cases)("$name refuses an anonymous caller", async ({ kind, fn, args }) => {
    const t = convexTest(schema, modules);
    const call =
      kind === "query"
        ? t.query(fn as FunctionReference<"query">, args)
        : t.mutation(fn as FunctionReference<"mutation">, args);
    await expect(call).rejects.toMatchObject({ data: "Sign in first." });
    // Nothing was written on the way to the refusal.
    const households = await t.run((ctx) => ctx.db.query("households").collect());
    expect(households).toEqual([]);
  });
});
