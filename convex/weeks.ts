import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireMember } from "./lib/auth";
import { requireIngredient } from "./lib/pantry";
import { parseQuantity } from "./lib/quantities";
import { findOpenWeek, requirePlannable, requireWeek, weekNotHere, weekRows } from "./lib/weeks";
import schema from "./schema";

// A week moves planning -> shopping -> cooking -> active -> closed. Planning picks recipes
// (candidate, selected, skipped) with a multiplier each, plus adaptations; lists.generate is
// the only way from planning to shopping.

const weekFields = schema.tables.weeks.validator.fields;
const weekRecipeFields = schema.tables.weekRecipes.validator.fields;
const adaptationFields = schema.tables.weekAdaptations.validator.fields;

const recipeNotHere = "This recipe is not here.";

async function requireRecipe(ctx: QueryCtx, householdId: Id<"households">, id: Id<"recipes">) {
  const recipe = await ctx.db.get("recipes", id);
  if (recipe === null || recipe.householdId !== householdId) {
    throw new ConvexError(recipeNotHere);
  }
  return recipe;
}

export const current = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("weeks"),
      weekOf: weekFields.weekOf,
      status: weekFields.status,
      sourceUrls: weekFields.sourceUrls,
      notes: weekFields.notes,
      createdAt: v.number(),
      recipes: v.array(
        v.object({
          weekRecipeId: v.id("weekRecipes"),
          recipeId: v.id("recipes"),
          name: v.string(),
          status: weekRecipeFields.status,
          multiplier: weekRecipeFields.multiplier,
          yield: schema.tables.recipes.validator.fields.yield,
        }),
      ),
      adaptations: v.array(
        v.object({
          _id: v.id("weekAdaptations"),
          recipeId: v.id("recipes"),
          kind: adaptationFields.kind,
          description: v.string(),
          originalIngredientId: adaptationFields.originalIngredientId,
          originalName: v.optional(v.string()),
          newIngredientId: adaptationFields.newIngredientId,
          newName: v.optional(v.string()),
          quantityText: adaptationFields.quantityText,
          quantityDecimal: adaptationFields.quantityDecimal,
          unit: adaptationFields.unit,
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const { householdId } = await requireMember(ctx);
    const week = await findOpenWeek(ctx, householdId);
    if (week === null) return null;

    const recipes = [];
    for (const wr of await weekRows(ctx, "weekRecipes", householdId, week._id)) {
      const recipe = await ctx.db.get("recipes", wr.recipeId);
      if (recipe === null || recipe.householdId !== householdId) continue;
      recipes.push({
        weekRecipeId: wr._id,
        recipeId: wr.recipeId,
        name: recipe.name,
        status: wr.status,
        multiplier: wr.multiplier,
        yield: recipe.yield,
      });
    }

    const nameOf = async (id: Id<"ingredients"> | undefined) => {
      if (id === undefined) return undefined;
      const ingredient = await ctx.db.get("ingredients", id);
      return ingredient?.householdId === householdId ? ingredient.name : undefined;
    };
    const adaptations = [];
    for (const a of await weekRows(ctx, "weekAdaptations", householdId, week._id)) {
      adaptations.push({
        _id: a._id,
        recipeId: a.recipeId,
        kind: a.kind,
        description: a.description,
        originalIngredientId: a.originalIngredientId,
        originalName: await nameOf(a.originalIngredientId),
        newIngredientId: a.newIngredientId,
        newName: await nameOf(a.newIngredientId),
        quantityText: a.quantityText,
        quantityDecimal: a.quantityDecimal,
        unit: a.unit,
      });
    }

    return {
      _id: week._id,
      weekOf: week.weekOf,
      status: week.status,
      sourceUrls: week.sourceUrls,
      notes: week.notes,
      createdAt: week.createdAt,
      recipes,
      adaptations,
    };
  },
});

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const create = mutation({
  args: { weekOf: v.string(), sourceUrls: v.optional(v.array(v.string())) },
  returns: v.id("weeks"),
  handler: async (ctx, args) => {
    const { householdId } = await requireMember(ctx);
    const weekOf = args.weekOf.trim();
    if (!datePattern.test(weekOf) || Number.isNaN(Date.parse(weekOf))) {
      throw new ConvexError("Use a date like 2026-10-09.");
    }
    if ((await findOpenWeek(ctx, householdId)) !== null) {
      throw new ConvexError("Close the current week first.");
    }
    const sourceUrls = [...new Set((args.sourceUrls ?? []).map((u) => u.trim()))].filter(
      (u) => u !== "",
    );
    if (sourceUrls.some((u) => !/^https?:\/\//i.test(u))) {
      throw new ConvexError("A source link starts with http:// or https://.");
    }
    return await ctx.db.insert("weeks", {
      householdId,
      weekOf,
      status: "planning",
      sourceUrls,
      createdAt: Date.now(),
    });
  },
});

export const setRecipe = mutation({
  args: {
    weekId: v.id("weeks"),
    recipeId: v.id("recipes"),
    status: weekRecipeFields.status,
    multiplierText: v.optional(v.string()),
  },
  returns: v.id("weekRecipes"),
  handler: async (ctx, args) => {
    const { householdId } = await requireMember(ctx);
    const week = await requireWeek(ctx, householdId, args.weekId);
    const recipe = await requireRecipe(ctx, householdId, args.recipeId);
    requirePlannable(week);

    let multiplier: Doc<"weekRecipes">["multiplier"] | undefined;
    if (args.multiplierText !== undefined) {
      const text = args.multiplierText.trim();
      const decimal = parseQuantity(text);
      if (decimal === null || decimal <= 0) {
        throw new ConvexError("Use a number like 1/2, 1 or 2.");
      }
      multiplier = { text, decimal };
    }

    const existing = (await weekRows(ctx, "weekRecipes", householdId, week._id)).find(
      (wr) => wr.recipeId === recipe._id,
    );
    if (existing !== undefined) {
      await ctx.db.patch("weekRecipes", existing._id, {
        status: args.status,
        ...(multiplier !== undefined && { multiplier }),
      });
      return existing._id;
    }
    return await ctx.db.insert("weekRecipes", {
      householdId,
      weekId: week._id,
      recipeId: recipe._id,
      status: args.status,
      multiplier: multiplier ?? { text: "1", decimal: 1 },
    });
  },
});

function optionalText(raw: string | undefined): string | undefined {
  const text = raw?.trim();
  return text ? text : undefined;
}

export const addAdaptation = mutation({
  args: {
    weekId: v.id("weeks"),
    recipeId: v.id("recipes"),
    kind: adaptationFields.kind,
    description: v.string(),
    originalIngredientId: v.optional(v.id("ingredients")),
    newIngredientId: v.optional(v.id("ingredients")),
    quantityText: v.optional(v.string()),
    unit: v.optional(v.string()),
  },
  returns: v.id("weekAdaptations"),
  handler: async (ctx, args) => {
    const { householdId } = await requireMember(ctx);
    const week = await requireWeek(ctx, householdId, args.weekId);
    const recipe = await requireRecipe(ctx, householdId, args.recipeId);
    requirePlannable(week);

    const original =
      args.originalIngredientId === undefined
        ? undefined
        : await requireIngredient(ctx, householdId, args.originalIngredientId);
    const replacement =
      args.newIngredientId === undefined
        ? undefined
        : await requireIngredient(ctx, householdId, args.newIngredientId);
    const quantityText = optionalText(args.quantityText);
    const unit = optionalText(args.unit);

    const needsOriginal = args.kind !== "add";
    const needsReplacement = args.kind === "replace" || args.kind === "add";
    if (needsOriginal && original === undefined) {
      throw new ConvexError(
        args.kind === "replace" ? "Pick the ingredient to swap out." : "Pick the ingredient.",
      );
    }
    if (needsReplacement && replacement === undefined) {
      throw new ConvexError(
        args.kind === "replace" ? "Pick the ingredient to use instead." : "Pick the ingredient.",
      );
    }
    if (args.kind === "adjust" && quantityText === undefined) {
      throw new ConvexError("Say how much to use.");
    }
    if (args.kind === "add" && quantityText === undefined) {
      throw new ConvexError("Say how much to add.");
    }
    const quantityDecimal = quantityText === undefined ? null : parseQuantity(quantityText);

    return await ctx.db.insert("weekAdaptations", {
      householdId,
      weekId: week._id,
      recipeId: recipe._id,
      kind: args.kind,
      description: args.description.trim(),
      originalIngredientId: needsOriginal ? original?._id : undefined,
      newIngredientId: needsReplacement ? replacement?._id : undefined,
      quantityText: args.kind === "remove" ? undefined : quantityText,
      quantityDecimal: args.kind === "remove" ? undefined : (quantityDecimal ?? undefined),
      unit: args.kind === "remove" ? undefined : unit,
    });
  },
});

export const removeAdaptation = mutation({
  args: { adaptationId: v.id("weekAdaptations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { householdId } = await requireMember(ctx);
    const adaptation = await ctx.db.get("weekAdaptations", args.adaptationId);
    if (adaptation === null || adaptation.householdId !== householdId) {
      throw new ConvexError(weekNotHere);
    }
    requirePlannable(await requireWeek(ctx, householdId, adaptation.weekId));
    await ctx.db.delete("weekAdaptations", adaptation._id);
    return null;
  },
});

const nextStatus: Partial<Record<Doc<"weeks">["status"], Doc<"weeks">["status"]>> = {
  shopping: "cooking",
  cooking: "active",
  active: "closed",
};

export const setStatus = mutation({
  args: { weekId: v.id("weeks"), status: weekFields.status },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { householdId } = await requireMember(ctx);
    const week = await requireWeek(ctx, householdId, args.weekId);
    if (week.status === args.status) return null;
    if (week.status === "planning") {
      throw new ConvexError("Make the list first.");
    }
    const next = nextStatus[week.status];
    if (next !== args.status) {
      throw new ConvexError(
        next === undefined
          ? "This week is closed."
          : `This week is ${week.status}; it can only move to ${next}.`,
      );
    }
    await ctx.db.patch("weeks", week._id, { status: args.status });
    return null;
  },
});
