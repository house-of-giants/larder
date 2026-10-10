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
  /** The refusal; member functions say "Sign in first.", the MCP door's say less. */
  expectedError?: string;
};

// Phase 5. The MCP door's functions take the agent secret instead of a sign-in. An
// anonymous caller does not have it: a guess, with a household and token id of its choosing.
const guess = { agentSecret: "guess", householdId: "1households", tokenId: "1householdTokens" };
const agentCase = (
  name: string,
  kind: Case["kind"],
  fn: Case["fn"],
  args: Record<string, unknown> = {},
): Case => ({
  name,
  kind,
  fn,
  args: { ...guess, ...args },
  expectedError: "Agent access refused.",
});

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
  // Phase 3.
  { name: "weeks.current", kind: "query", fn: api.weeks.current, args: {} },
  {
    name: "weeks.create",
    kind: "mutation",
    fn: api.weeks.create,
    args: { weekOf: "2026-10-09" },
  },
  {
    name: "weeks.setRecipe",
    kind: "mutation",
    fn: api.weeks.setRecipe,
    args: { weekId: "1weeks", recipeId: "1recipes", status: "selected" },
  },
  {
    name: "weeks.addAdaptation",
    kind: "mutation",
    fn: api.weeks.addAdaptation,
    args: {
      weekId: "1weeks",
      recipeId: "1recipes",
      kind: "remove",
      originalIngredientId: "1ingredients",
      description: "",
    },
  },
  {
    name: "weeks.removeAdaptation",
    kind: "mutation",
    fn: api.weeks.removeAdaptation,
    args: { adaptationId: "1weekAdaptations" },
  },
  {
    name: "weeks.setStatus",
    kind: "mutation",
    fn: api.weeks.setStatus,
    args: { weekId: "1weeks", status: "cooking" },
  },
  { name: "lists.generate", kind: "mutation", fn: api.lists.generate, args: { weekId: "1weeks" } },
  { name: "lists.current", kind: "query", fn: api.lists.current, args: {} },
  {
    name: "lists.addItem",
    kind: "mutation",
    fn: api.lists.addItem,
    args: { displayName: "paper towels" },
  },
  {
    name: "lists.setItemStatus",
    kind: "mutation",
    fn: api.lists.setItemStatus,
    args: { listItemId: "1listItems", status: "checked" },
  },
  {
    name: "lists.reconcileItems",
    kind: "query",
    fn: api.lists.reconcileItems,
    args: { weekId: "1weeks" },
  },
  // Phase 4.
  { name: "cooking.sheet", kind: "query", fn: api.cooking.sheet, args: { recipeId: "1recipes" } },
  {
    name: "cooking.madeIt",
    kind: "mutation",
    fn: api.cooking.madeIt,
    args: {
      recipeId: "1recipes",
      multiplierText: "1",
      skippedIngredientIds: [],
      substitutions: [],
    },
  },
  {
    name: "cooking.undo",
    kind: "mutation",
    fn: api.cooking.undo,
    args: { cookingEventId: "1cookingEvents" },
  },
  { name: "cooking.forWeek", kind: "query", fn: api.cooking.forWeek, args: { weekId: "1weeks" } },
  { name: "leftovers.list", kind: "query", fn: api.leftovers.list, args: {} },
  {
    name: "leftovers.consume",
    kind: "mutation",
    fn: api.leftovers.consume,
    args: { preparedFoodId: "1preparedFoods" },
  },
  {
    name: "leftovers.discard",
    kind: "mutation",
    fn: api.leftovers.discard,
    args: { preparedFoodId: "1preparedFoods" },
  },
  {
    name: "leftovers.move",
    kind: "mutation",
    fn: api.leftovers.move,
    args: { preparedFoodId: "1preparedFoods", location: "freezer" },
  },
  {
    name: "closeout.run",
    kind: "mutation",
    fn: api.closeout.run,
    args: { weekId: "1weeks", decisions: [] },
  },
  { name: "undo.recent", kind: "query", fn: api.undo.recent, args: {} },
  {
    name: "undo.event",
    kind: "mutation",
    fn: api.undo.event,
    args: { eventId: "1inventoryEvents" },
  },
  // Phase 5.
  { name: "tokens.list", kind: "query", fn: api.tokens.list, args: {} },
  { name: "tokens.create", kind: "mutation", fn: api.tokens.create, args: { label: "Hermes" } },
  {
    name: "tokens.revoke",
    kind: "mutation",
    fn: api.tokens.revoke,
    args: { tokenId: "1householdTokens" },
  },
  {
    name: "agent.resolveToken",
    kind: "query",
    fn: api.agent.resolveToken,
    args: { agentSecret: "guess", tokenHash: "0".repeat(64) },
    expectedError: "Agent access refused.",
  },
  {
    name: "agent.touchToken",
    kind: "mutation",
    fn: api.agent.touchToken,
    args: { agentSecret: "guess", tokenId: "1householdTokens" },
    expectedError: "Agent access refused.",
  },
  agentCase("agent.pantryList", "query", api.agent.pantryList),
  agentCase("agent.pantrySetCount", "mutation", api.agent.pantrySetCount, {
    ingredientId: "1ingredients",
    quantityText: "6",
    unit: "each",
  }),
  agentCase("agent.pantrySetLevel", "mutation", api.agent.pantrySetLevel, {
    ingredientId: "1ingredients",
    level: "full",
  }),
  agentCase("agent.pantryMarkOut", "mutation", api.agent.pantryMarkOut, {
    ingredientId: "1ingredients",
  }),
  agentCase("agent.ingredientsList", "query", api.agent.ingredientsList),
  agentCase("agent.ingredientsResolve", "query", api.agent.ingredientsResolve, { name: "eggs" }),
  agentCase("agent.ingredientsUpsert", "mutation", api.agent.ingredientsUpsert, {
    name: "salt",
    kind: "level",
    category: "baking_pantry_condiments",
    aliases: [],
    tracked: true,
  }),
  agentCase("agent.recipesList", "query", api.agent.recipesList),
  agentCase("agent.recipesGet", "query", api.agent.recipesGet, { id: "1recipes" }),
  agentCase("agent.recipesUpsert", "mutation", api.agent.recipesUpsert, {
    name: "Sliders",
    instructions: [],
    tags: [],
    ingredients: [{ name: "eggs", quantityText: "1", unit: "each" }],
  }),
  agentCase("agent.recipesArchive", "mutation", api.agent.recipesArchive, { id: "1recipes" }),
  agentCase("agent.weeksCurrent", "query", api.agent.weeksCurrent),
  agentCase("agent.weeksCreate", "mutation", api.agent.weeksCreate, { weekOf: "2026-10-09" }),
  agentCase("agent.weeksSetRecipes", "mutation", api.agent.weeksSetRecipes, {
    weekId: "1weeks",
    recipes: [{ recipeId: "1recipes", status: "selected" }],
  }),
  agentCase("agent.weeksAddAdaptation", "mutation", api.agent.weeksAddAdaptation, {
    weekId: "1weeks",
    recipeId: "1recipes",
    kind: "remove",
    originalIngredientId: "1ingredients",
    description: "",
  }),
  agentCase("agent.weeksSetStatus", "mutation", api.agent.weeksSetStatus, {
    weekId: "1weeks",
    status: "cooking",
  }),
  agentCase("agent.listGet", "query", api.agent.listGet),
  agentCase("agent.listGenerate", "mutation", api.agent.listGenerate, { weekId: "1weeks" }),
  agentCase("agent.listAddItem", "mutation", api.agent.listAddItem, {
    displayName: "paper towels",
  }),
  agentCase("agent.listSetItemStatus", "mutation", api.agent.listSetItemStatus, {
    listItemId: "1listItems",
    status: "checked",
  }),
  agentCase("agent.cookMade", "mutation", api.agent.cookMade, {
    recipeId: "1recipes",
    multiplierText: "1",
    skippedIngredientIds: [],
    substitutions: [],
  }),
  agentCase("agent.leftoversList", "query", api.agent.leftoversList),
  agentCase("agent.leftoversConsume", "mutation", api.agent.leftoversConsume, {
    preparedFoodId: "1preparedFoods",
  }),
  agentCase("agent.leftoversDiscard", "mutation", api.agent.leftoversDiscard, {
    preparedFoodId: "1preparedFoods",
  }),
  agentCase("agent.weekCloseout", "mutation", api.agent.weekCloseout, {
    weekId: "1weeks",
    decisions: [],
  }),
  agentCase("agent.eventsRecent", "query", api.agent.eventsRecent),
];

// Every Convex function module, so a public function added in any phase must be listed
// above. Not function modules: schema, app and auth config, generated code, shared
// helpers in lib/, tests and their helpers. health.ping is deliberately open: it reports whether
// the caller is signed in.
const functionModules = import.meta.glob<Record<string, unknown>>(
  [
    "./**/*.ts",
    "!./_generated/**",
    "!./lib/**",
    "!./**/*.test.ts",
    "!./test_helpers.ts",
    "!./schema.ts",
    "!./convex.config.ts",
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
  it.each(cases)("$name refuses an anonymous caller", async ({ kind, fn, args, expectedError }) => {
    const t = convexTest(schema, modules);
    const call =
      kind === "query"
        ? t.query(fn as FunctionReference<"query">, args)
        : t.mutation(fn as FunctionReference<"mutation">, args);
    await expect(call).rejects.toMatchObject({ data: expectedError ?? "Sign in first." });
    // Nothing was written on the way to the refusal.
    const households = await t.run((ctx) => ctx.db.query("households").collect());
    expect(households).toEqual([]);
  });
});
