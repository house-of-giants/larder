import { ConvexError, v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireMember } from "./lib/auth";
import { quantityDecimal } from "./lib/quantity_text";
import schema from "./schema";

// Recipes keep the recipe's own words (quantityText, unit, displayName). The decimal beside
// each quantity is derived here, for list math later, and never shown. Recipes are archived,
// never deleted: weeks, lists, and cooking events point at them.

const recipeFields = schema.tables.recipes.validator.fields;
const rowFields = schema.tables.recipeIngredients.validator.fields;

const notHere = "This recipe is not here.";
const foreignIngredient = "That ingredient is not in this household.";

const ingredientInput = v.object({
  ingredientId: v.id("ingredients"),
  displayName: v.optional(v.string()),
  quantityText: v.string(),
  unit: v.string(),
  optional: v.boolean(),
  preparation: v.optional(v.string()),
  deductionIngredientId: v.optional(v.id("ingredients")),
  deductionNote: v.optional(v.string()),
  needsReview: v.optional(v.boolean()),
});

const upsertArgs = {
  id: v.optional(v.id("recipes")),
  name: v.string(),
  source: recipeFields.source,
  yield: v.optional(v.object({ quantityText: v.string(), unit: v.string() })),
  freezerFriendly: v.optional(v.boolean()),
  storageNotes: v.optional(v.string()),
  reheatingNotes: v.optional(v.string()),
  instructions: v.array(v.string()),
  tags: v.array(v.string()),
  needsReview: v.optional(v.boolean()),
  ingredients: v.array(ingredientInput),
};

const recipeIngredientRow = v.object({
  _id: v.id("recipeIngredients"),
  order: rowFields.order,
  ingredientId: rowFields.ingredientId,
  ingredientName: v.string(),
  ingredientKind: v.union(v.literal("count"), v.literal("level")),
  displayName: rowFields.displayName,
  quantityText: rowFields.quantityText,
  quantityDecimal: rowFields.quantityDecimal,
  unit: rowFields.unit,
  optional: rowFields.optional,
  preparation: rowFields.preparation,
  deductionIngredientId: rowFields.deductionIngredientId,
  deductionNote: rowFields.deductionNote,
  needsReview: rowFields.needsReview,
});

export type RecipeIngredientRow = Infer<typeof recipeIngredientRow>;

/** Trimmed text, or undefined when nothing is left. */
function text(value: string | undefined): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}

/** Trimmed, non-blank, first occurrence kept. */
function cleanList(values: string[]): string[] {
  return [...new Set(values.map((s) => s.trim()).filter((s) => s !== ""))];
}

function cleanSource(source: Infer<typeof upsertArgs.source>) {
  if (source === undefined) return undefined;
  const url = text(source.url);
  if (url !== undefined && !/^https?:\/\//i.test(url)) {
    throw new ConvexError("A source link starts with http:// or https://.");
  }
  return {
    type: text(source.type) ?? "manual",
    title: text(source.title),
    url,
    author: text(source.author),
    date: text(source.date),
  };
}

/** The household's recipe, or null for a missing or foreign one. */
async function ownRecipe(
  ctx: QueryCtx,
  householdId: Id<"households">,
  id: Id<"recipes">,
): Promise<Doc<"recipes"> | null> {
  const recipe = await ctx.db.get("recipes", id);
  return recipe !== null && recipe.householdId === householdId ? recipe : null;
}

async function requireOwnRecipe(ctx: QueryCtx, householdId: Id<"households">, id: Id<"recipes">) {
  const recipe = await ownRecipe(ctx, householdId, id);
  if (recipe === null) throw new ConvexError(notHere);
  return recipe;
}

async function requireOwnIngredient(
  ctx: QueryCtx,
  householdId: Id<"households">,
  id: Id<"ingredients">,
) {
  const ingredient = await ctx.db.get("ingredients", id);
  if (ingredient === null || ingredient.householdId !== householdId) {
    throw new ConvexError(foreignIngredient);
  }
  return ingredient;
}

function rowsOf(ctx: QueryCtx, recipeId: Id<"recipes">) {
  return ctx.db
    .query("recipeIngredients")
    .withIndex("by_recipeId", (q) => q.eq("recipeId", recipeId))
    .collect();
}

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  returns: v.array(
    v.object({
      _id: v.id("recipes"),
      name: v.string(),
      ingredientCount: v.number(),
      yield: recipeFields.yield,
      tags: recipeFields.tags,
      needsReview: recipeFields.needsReview,
      archivedAt: recipeFields.archivedAt,
    }),
  ),
  handler: async (ctx, args) => {
    const { householdId } = await requireMember(ctx);
    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect();
    const shown = args.includeArchived
      ? recipes
      : recipes.filter((r) => r.archivedAt === undefined);
    shown.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return await Promise.all(
      shown.map(async (r) => ({
        _id: r._id,
        name: r.name,
        ingredientCount: (await rowsOf(ctx, r._id)).length,
        yield: r.yield,
        tags: r.tags,
        needsReview: r.needsReview,
        archivedAt: r.archivedAt,
      })),
    );
  },
});

export const get = query({
  // A string, not v.id: the id comes from the URL, and a mangled one is "not here", not an error.
  args: { id: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("recipes"),
      _creationTime: v.number(),
      ...recipeFields,
      ingredients: v.array(recipeIngredientRow),
    }),
  ),
  handler: async (ctx, args) => {
    const { householdId } = await requireMember(ctx);
    const id = ctx.db.normalizeId("recipes", args.id);
    if (id === null) return null;
    const recipe = await ownRecipe(ctx, householdId, id);
    if (recipe === null) return null;

    const rows = await rowsOf(ctx, id);
    rows.sort((a, b) => a.order - b.order);
    const ingredients = await Promise.all(
      rows.map(async ({ householdId: _h, recipeId: _r, _creationTime: _c, ...row }) => {
        const ingredient = await ctx.db.get("ingredients", row.ingredientId);
        return {
          ...row,
          ingredientName: ingredient?.name ?? "Unknown ingredient",
          ingredientKind: ingredient?.kind ?? ("count" as const),
        };
      }),
    );
    return { ...recipe, ingredients };
  },
});

export const ingredientOptions = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("ingredients"),
      name: v.string(),
      kind: v.union(v.literal("count"), v.literal("level")),
      aliases: v.array(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const { householdId } = await requireMember(ctx);
    const ingredients = await ctx.db
      .query("ingredients")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect();
    return ingredients
      .map(({ _id, name, kind, aliases }) => ({ _id, name, kind, aliases }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  },
});

export const upsert = mutation({
  args: upsertArgs,
  returns: v.id("recipes"),
  handler: async (ctx, args) => {
    const { householdId } = await requireMember(ctx);

    const name = text(args.name);
    if (name === undefined) throw new ConvexError("Give the recipe a name.");

    for (const row of args.ingredients) {
      await requireOwnIngredient(ctx, householdId, row.ingredientId);
      if (row.deductionIngredientId !== undefined) {
        await requireOwnIngredient(ctx, householdId, row.deductionIngredientId);
      }
    }

    const existing =
      args.id === undefined ? null : await requireOwnRecipe(ctx, householdId, args.id);

    const yieldText = args.yield === undefined ? undefined : text(args.yield.quantityText);
    const fields = {
      name,
      source: cleanSource(args.source),
      yield:
        args.yield === undefined || yieldText === undefined
          ? undefined
          : {
              quantityText: yieldText,
              quantityDecimal: quantityDecimal(yieldText),
              unit: args.yield.unit.trim(),
            },
      freezerFriendly: args.freezerFriendly,
      storageNotes: text(args.storageNotes),
      reheatingNotes: text(args.reheatingNotes),
      instructions: args.instructions.map((s) => s.trim()).filter((s) => s !== ""),
      tags: cleanList(args.tags),
      needsReview: args.needsReview ?? existing?.needsReview ?? false,
      updatedAt: Date.now(),
    } satisfies Partial<Doc<"recipes">>;

    let recipeId: Id<"recipes">;
    if (existing === null) {
      recipeId = await ctx.db.insert("recipes", { householdId, ...fields });
    } else {
      recipeId = existing._id;
      // Patch, not replace, so fields this editor does not own (sourceText) survive.
      await ctx.db.patch("recipes", recipeId, fields);
      for (const row of await rowsOf(ctx, recipeId)) {
        await ctx.db.delete("recipeIngredients", row._id);
      }
    }

    await insertRows(ctx, householdId, recipeId, args.ingredients);
    return recipeId;
  },
});

async function insertRows(
  ctx: MutationCtx,
  householdId: Id<"households">,
  recipeId: Id<"recipes">,
  rows: Infer<typeof ingredientInput>[],
) {
  for (const [order, row] of rows.entries()) {
    const quantityText = row.quantityText.trim();
    await ctx.db.insert("recipeIngredients", {
      householdId,
      recipeId,
      order,
      ingredientId: row.ingredientId,
      displayName: text(row.displayName),
      quantityText,
      quantityDecimal: quantityDecimal(quantityText),
      unit: row.unit.trim(),
      optional: row.optional,
      preparation: text(row.preparation),
      deductionIngredientId: row.deductionIngredientId,
      deductionNote: text(row.deductionNote),
      needsReview: row.needsReview ?? false,
    });
  }
}

export const createIngredientInline = mutation({
  args: { name: v.string() },
  returns: v.id("ingredients"),
  handler: async (ctx, args) => {
    const { householdId } = await requireMember(ctx);
    const name = text(args.name);
    if (name === undefined) throw new ConvexError("Give the ingredient a name.");

    const key = name.toLowerCase();
    const ingredients = await ctx.db
      .query("ingredients")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect();
    const same = ingredients.find((i) => i.name.trim().toLowerCase() === key);
    if (same !== undefined) {
      throw new ConvexError(`"${same.name}" is already on the ingredient list.`);
    }

    return await ctx.db.insert("ingredients", {
      householdId,
      name,
      kind: "count",
      category: "other",
      aliases: [],
      tracked: true,
      needsReview: true,
    });
  },
});

export const archive = mutation({
  args: { id: v.id("recipes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { householdId } = await requireMember(ctx);
    const recipe = await requireOwnRecipe(ctx, householdId, args.id);
    if (recipe.archivedAt === undefined) {
      await ctx.db.patch("recipes", recipe._id, { archivedAt: Date.now() });
    }
    return null;
  },
});

export const restore = mutation({
  args: { id: v.id("recipes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { householdId } = await requireMember(ctx);
    const recipe = await requireOwnRecipe(ctx, householdId, args.id);
    await ctx.db.patch("recipes", recipe._id, { archivedAt: undefined });
    return null;
  },
});
