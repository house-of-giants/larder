import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { type QueryCtx, mutation, query } from "./_generated/server";
import { closeOutWeek, runArgs as closeoutArgs } from "./closeout";
import { madeItArgs, madeItResult, recordCook } from "./cooking";
import { inventoryEventDoc, recentEvents } from "./events";
import {
  ingredientDoc,
  listIngredients,
  resolveByName,
  resolveResult,
  upsertArgs as ingredientUpsertArgs,
  upsertIngredient,
} from "./ingredients";
import {
  consumeLeftover,
  consumeResult,
  discardLeftover,
  leftover,
  listLeftovers,
} from "./leftovers";
import { agentArgs, asAgent, requireAgentSecret } from "./lib/agent";
import { requireWeek } from "./lib/weeks";
import type { Caller } from "./lib/auth";
import {
  addItemArgs,
  addListItem,
  currentList,
  generateWeekList,
  getCurrentList,
  setItemStatusArgs,
  setListItemStatus,
} from "./lists";
import {
  listPantry,
  markPantryOut,
  pantryRow,
  setCountArgs,
  setLevelArgs,
  setPantryCount,
  setPantryLevel,
} from "./pantry";
import {
  archiveRecipe,
  getRecipe,
  listRecipes,
  recipeDetail,
  recipeSummary,
  upsertByNamesArgs,
  upsertByNamesResult,
  upsertRecipeByNames,
} from "./recipes";
import {
  addAdaptationArgs,
  addWeekAdaptation,
  createArgs as weekCreateArgs,
  currentWeek,
  createWeek,
  getCurrentWeek,
  setStatusArgs as weekStatusArgs,
  setWeekRecipe,
  setWeekStatus,
} from "./weeks";
import schema from "./schema";

// The MCP door's functions. Each one checks the agent secret, the household, and the
// token (convex/lib/agent.ts), then calls the same function the member-facing export
// calls. Only the server route knows the secret; MCP clients never reach these directly.
// No LLM calls: arithmetic and alias matching only.

// Tokens: the route resolves the bearer header with these before any tool runs.

export const resolveToken = query({
  args: { agentSecret: v.string(), tokenHash: v.string() },
  returns: v.union(
    v.null(),
    v.object({ householdId: v.id("households"), tokenId: v.id("householdTokens") }),
  ),
  handler: async (ctx, args) => {
    requireAgentSecret(args.agentSecret);
    const token = await ctx.db
      .query("householdTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (token === null || token.revokedAt !== undefined) return null;
    // A deleted household's tokens linger until its sweep runs; they open nothing.
    if ((await ctx.db.get("households", token.householdId)) === null) return null;
    return { householdId: token.householdId, tokenId: token._id };
  },
});

// Stamped at most once a minute, so a busy agent does not rewrite the row on every call.
const touchEvery = 60_000;

export const touchToken = mutation({
  args: { agentSecret: v.string(), tokenId: v.id("householdTokens") },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireAgentSecret(args.agentSecret);
    const token = await ctx.db.get("householdTokens", args.tokenId);
    if (token === null || token.revokedAt !== undefined) return null;
    const now = Date.now();
    if (token.lastUsedAt === undefined || now - token.lastUsedAt >= touchEvery) {
      await ctx.db.patch("householdTokens", token._id, { lastUsedAt: now });
    }
    return null;
  },
});

// Pantry.

async function pantryRowOf(ctx: QueryCtx, caller: Caller, ingredientId: Id<"ingredients">) {
  const row = (await listPantry(ctx, caller)).find((r) => r.ingredientId === ingredientId);
  if (row === undefined) throw new ConvexError("That ingredient is not in the pantry.");
  return row;
}

export const pantryList = query({
  args: agentArgs,
  returns: v.array(pantryRow),
  handler: async (ctx, args) => listPantry(ctx, (await asAgent(ctx, args))[0]),
});

export const pantrySetCount = mutation({
  args: { ...agentArgs, ...setCountArgs },
  returns: pantryRow,
  handler: async (ctx, args) => {
    const [caller, rest] = await asAgent(ctx, args);
    await setPantryCount(ctx, caller, rest);
    return await pantryRowOf(ctx, caller, rest.ingredientId);
  },
});

export const pantrySetLevel = mutation({
  args: { ...agentArgs, ...setLevelArgs },
  returns: pantryRow,
  handler: async (ctx, args) => {
    const [caller, rest] = await asAgent(ctx, args);
    await setPantryLevel(ctx, caller, rest);
    return await pantryRowOf(ctx, caller, rest.ingredientId);
  },
});

export const pantryMarkOut = mutation({
  args: { ...agentArgs, ingredientId: v.id("ingredients") },
  returns: pantryRow,
  handler: async (ctx, args) => {
    const [caller, rest] = await asAgent(ctx, args);
    await markPantryOut(ctx, caller, rest);
    return await pantryRowOf(ctx, caller, rest.ingredientId);
  },
});

// Ingredients.

export const ingredientsList = query({
  args: agentArgs,
  returns: v.array(ingredientDoc),
  handler: async (ctx, args) => listIngredients(ctx, (await asAgent(ctx, args))[0]),
});

export const ingredientsResolve = query({
  args: { ...agentArgs, name: v.string() },
  returns: resolveResult,
  handler: async (ctx, args) => {
    const [caller, rest] = await asAgent(ctx, args);
    return resolveByName(await listIngredients(ctx, caller), rest.name);
  },
});

export const ingredientsUpsert = mutation({
  args: { ...agentArgs, ...ingredientUpsertArgs },
  returns: ingredientDoc,
  handler: async (ctx, args) => {
    const [caller, rest] = await asAgent(ctx, args);
    const id = await upsertIngredient(ctx, caller, rest);
    return (await ctx.db.get("ingredients", id))!;
  },
});

// Recipes.

export const recipesList = query({
  args: { ...agentArgs, includeArchived: v.optional(v.boolean()) },
  returns: v.array(recipeSummary),
  handler: async (ctx, args) => {
    const [caller, rest] = await asAgent(ctx, args);
    return await listRecipes(ctx, caller, rest);
  },
});

export const recipesGet = query({
  args: { ...agentArgs, id: v.string() },
  returns: v.union(v.null(), recipeDetail),
  handler: async (ctx, args) => {
    const [caller, rest] = await asAgent(ctx, args);
    return await getRecipe(ctx, caller, rest);
  },
});

export const recipesUpsert = mutation({
  args: { ...agentArgs, ...upsertByNamesArgs },
  returns: upsertByNamesResult,
  handler: async (ctx, args) => {
    const [caller, rest] = await asAgent(ctx, args);
    return await upsertRecipeByNames(ctx, caller, rest);
  },
});

export const recipesArchive = mutation({
  args: { ...agentArgs, id: v.id("recipes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [caller, rest] = await asAgent(ctx, args);
    await archiveRecipe(ctx, caller, rest);
    return null;
  },
});

// Weeks. Writes answer with the open week as it now stands.

export const weeksCurrent = query({
  args: agentArgs,
  returns: currentWeek,
  handler: async (ctx, args) => getCurrentWeek(ctx, (await asAgent(ctx, args))[0]),
});

export const weeksCreate = mutation({
  args: { ...agentArgs, ...weekCreateArgs },
  returns: currentWeek,
  handler: async (ctx, args) => {
    const [caller, rest] = await asAgent(ctx, args);
    await createWeek(ctx, caller, rest);
    return await getCurrentWeek(ctx, caller);
  },
});

export const weeksSetRecipes = mutation({
  args: {
    ...agentArgs,
    weekId: v.id("weeks"),
    recipes: v.array(
      v.object({
        recipeId: v.id("recipes"),
        status: schema.tables.weekRecipes.validator.fields.status,
        multiplierText: v.optional(v.string()),
      }),
    ),
  },
  returns: currentWeek,
  handler: async (ctx, args) => {
    const [caller, { weekId, recipes }] = await asAgent(ctx, args);
    // Checked here too, so an empty batch cannot probe another household's week id.
    await requireWeek(ctx, caller.householdId, weekId);
    for (const recipe of recipes) {
      await setWeekRecipe(ctx, caller, { weekId, ...recipe });
    }
    return await getCurrentWeek(ctx, caller);
  },
});

export const weeksAddAdaptation = mutation({
  args: { ...agentArgs, ...addAdaptationArgs },
  returns: v.id("weekAdaptations"),
  handler: async (ctx, args) => {
    const [caller, rest] = await asAgent(ctx, args);
    return await addWeekAdaptation(ctx, caller, rest);
  },
});

export const weeksSetStatus = mutation({
  args: { ...agentArgs, ...weekStatusArgs },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [caller, rest] = await asAgent(ctx, args);
    await setWeekStatus(ctx, caller, rest);
    return null;
  },
});

// The list.

export const listGet = query({
  args: agentArgs,
  returns: currentList,
  handler: async (ctx, args) => getCurrentList(ctx, (await asAgent(ctx, args))[0]),
});

export const listGenerate = mutation({
  args: { ...agentArgs, weekId: v.id("weeks") },
  returns: currentList,
  handler: async (ctx, args) => {
    const [caller, rest] = await asAgent(ctx, args);
    await generateWeekList(ctx, caller, rest);
    return await getCurrentList(ctx, caller);
  },
});

export const listAddItem = mutation({
  args: { ...agentArgs, ...addItemArgs },
  returns: v.id("listItems"),
  handler: async (ctx, args) => {
    const [caller, rest] = await asAgent(ctx, args);
    return await addListItem(ctx, caller, rest);
  },
});

export const listSetItemStatus = mutation({
  args: { ...agentArgs, ...setItemStatusArgs },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [caller, rest] = await asAgent(ctx, args);
    await setListItemStatus(ctx, caller, rest);
    return null;
  },
});

// Cooking, leftovers, closeout.

export const cookMade = mutation({
  args: { ...agentArgs, ...madeItArgs },
  returns: madeItResult,
  handler: async (ctx, args) => {
    const [caller, rest] = await asAgent(ctx, args);
    return await recordCook(ctx, caller, rest);
  },
});

export const leftoversList = query({
  args: agentArgs,
  returns: v.array(leftover),
  handler: async (ctx, args) => listLeftovers(ctx, (await asAgent(ctx, args))[0]),
});

export const leftoversConsume = mutation({
  args: {
    ...agentArgs,
    preparedFoodId: v.id("preparedFoods"),
    quantityText: v.optional(v.string()),
  },
  returns: consumeResult,
  handler: async (ctx, args) => {
    const [caller, rest] = await asAgent(ctx, args);
    return await consumeLeftover(ctx, caller, rest);
  },
});

export const leftoversDiscard = mutation({
  args: { ...agentArgs, preparedFoodId: v.id("preparedFoods") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [caller, rest] = await asAgent(ctx, args);
    await discardLeftover(ctx, caller, rest);
    return null;
  },
});

export const weekCloseout = mutation({
  args: { ...agentArgs, ...closeoutArgs },
  returns: currentWeek,
  handler: async (ctx, args) => {
    const [caller, rest] = await asAgent(ctx, args);
    await closeOutWeek(ctx, caller, rest);
    return await getCurrentWeek(ctx, caller);
  },
});

// The ledger.

export const eventsRecent = query({
  args: { ...agentArgs, limit: v.optional(v.number()) },
  returns: v.array(inventoryEventDoc),
  handler: async (ctx, args) => {
    const [caller, rest] = await asAgent(ctx, args);
    return await recentEvents(ctx, caller, rest);
  },
});
