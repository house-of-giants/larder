import { ConvexError, type Infer, type ObjectType, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx, mutation, query } from "./_generated/server";
import { type Caller, requireCaller, requireMember } from "./lib/auth";
import {
  type Deduction,
  type DeductionIngredient,
  type DeductionPantryRow,
  planDeductions,
} from "./lib/deductions";
import { recordInventoryEvent } from "./lib/ledger";
import { countOf, levelOf } from "../src/lib/pantry-amount";
import {
  type PantrySnapshot,
  findPantryRow,
  pantrySnapshot,
  requireIngredient,
} from "./lib/pantry";
import { type FoodPayload, foodSnapshot } from "./lib/prepared_food";
import { formatQuantity, parseQuantity } from "./lib/quantities";
import { type DeductionPayload, undoCook } from "./lib/reversals";
import { findOpenWeek, requireWeek } from "./lib/weeks";
import schema, { level } from "./schema";

// "Made it": one mutation records the cook, takes what it used out of the pantry (one
// `deduction` event per ingredient), and puts the yield in the fridge as prepared food (an
// `adjustment` event). cooking.undo puts all of it back.

const recipeNotHere = "This recipe is not here.";

async function requireRecipe(ctx: QueryCtx, householdId: Id<"households">, id: Id<"recipes">) {
  const recipe = await ctx.db.get("recipes", id);
  if (recipe === null || recipe.householdId !== householdId) {
    throw new ConvexError(recipeNotHere);
  }
  return recipe;
}

async function recipeRows(ctx: QueryCtx, householdId: Id<"households">, recipeId: Id<"recipes">) {
  const rows = await ctx.db
    .query("recipeIngredients")
    .withIndex("by_householdId_recipeId", (q) =>
      q.eq("householdId", householdId).eq("recipeId", recipeId),
    )
    .collect();
  return rows.sort((a, b) => a.order - b.order);
}

/** The household's own ingredient, or null; a row naming another household's is ignored. */
async function ownIngredient(
  ctx: QueryCtx,
  householdId: Id<"households">,
  id: Id<"ingredients"> | undefined,
): Promise<Doc<"ingredients"> | null> {
  if (id === undefined) return null;
  const ingredient = await ctx.db.get("ingredients", id);
  return ingredient?.householdId === householdId ? ingredient : null;
}

export const sheet = query({
  args: { recipeId: v.id("recipes") },
  returns: v.object({
    recipeId: v.id("recipes"),
    name: v.string(),
    yield: schema.tables.recipes.validator.fields.yield,
    rows: v.array(
      v.object({
        rowId: v.id("recipeIngredients"),
        ingredientId: v.id("ingredients"),
        name: v.string(),
        quantityText: v.string(),
        unit: v.string(),
        optional: v.boolean(),
        kind: v.union(v.literal("count"), v.literal("level")),
        tracked: v.boolean(),
        /** The pantry ingredient it comes out of, when that is another one (egg yolk). */
        deductsFrom: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const { householdId } = await requireMember(ctx);
    const recipe = await requireRecipe(ctx, householdId, args.recipeId);
    const rows = [];
    for (const row of await recipeRows(ctx, householdId, recipe._id)) {
      const ingredient = await ownIngredient(ctx, householdId, row.ingredientId);
      if (ingredient === null) continue;
      const target = await ownIngredient(ctx, householdId, row.deductionIngredientId);
      rows.push({
        rowId: row._id,
        ingredientId: ingredient._id,
        name: row.displayName ?? ingredient.name,
        quantityText: row.quantityText,
        unit: row.unit,
        optional: row.optional,
        kind: (target ?? ingredient).kind,
        tracked: (target ?? ingredient).tracked,
        ...(target !== null && { deductsFrom: target.name }),
      });
    }
    return { recipeId: recipe._id, name: recipe.name, yield: recipe.yield, rows };
  },
});

const deductionView = v.union(
  v.object({
    ingredientId: v.id("ingredients"),
    name: v.string(),
    kind: v.literal("count"),
    unit: v.string(),
    before: v.union(v.number(), v.null()),
    after: v.union(v.number(), v.null()),
    used: v.union(v.number(), v.null()),
    wentNegative: v.boolean(),
    note: v.optional(v.union(v.literal("no decimal"), v.literal("unit mismatch"))),
  }),
  v.object({
    ingredientId: v.id("ingredients"),
    name: v.string(),
    kind: v.literal("level"),
    before: v.union(level, v.null()),
    after: v.union(level, v.null()),
    wentNegative: v.boolean(),
  }),
);

const amount = v.object({ text: v.string(), decimal: v.number() });

export const madeItArgs = {
  /** Omitted from a recipe page: the cook joins the open week, if there is one. */
  weekId: v.optional(v.id("weeks")),
  recipeId: v.id("recipes"),
  multiplierText: v.string(),
  skippedIngredientIds: v.array(v.id("ingredients")),
  substitutions: v.array(
    v.object({
      ingredientId: v.id("ingredients"),
      replacementIngredientId: v.optional(v.id("ingredients")),
      note: v.optional(v.string()),
    }),
  ),
  notes: v.optional(v.string()),
};

export const madeItResult = v.object({
  cookingEventId: v.id("cookingEvents"),
  recipeName: v.string(),
  preparedFood: v.union(
    v.null(),
    v.object({
      preparedFoodId: v.id("preparedFoods"),
      name: v.string(),
      remaining: amount,
      unit: v.string(),
      location: v.union(v.literal("fridge"), v.literal("freezer")),
    }),
  ),
  /** Why no prepared food was made, in a sentence for the cook. */
  noFoodReason: v.optional(v.string()),
  deductions: v.array(deductionView),
});

export const madeIt = mutation({
  args: madeItArgs,
  returns: madeItResult,
  handler: async (ctx, args) => recordCook(ctx, await requireCaller(ctx), args),
});

export async function recordCook(
  ctx: MutationCtx,
  { householdId, actor }: Caller,
  args: ObjectType<typeof madeItArgs>,
): Promise<Infer<typeof madeItResult>> {
  const recipe = await requireRecipe(ctx, householdId, args.recipeId);
  const week =
    args.weekId === undefined
      ? await findOpenWeek(ctx, householdId)
      : await requireWeek(ctx, householdId, args.weekId);
  if (week?.status === "closed") {
    throw new ConvexError("This week is closed.");
  }

  const multiplierText = args.multiplierText.trim();
  const multiplierDecimal = parseQuantity(multiplierText);
  if (multiplierDecimal === null || multiplierDecimal <= 0) {
    throw new ConvexError("Use a number like 1/2, 1 or 2.");
  }

  // Every id the client sends is checked against the household before it is used.
  for (const id of args.skippedIngredientIds) {
    await requireIngredient(ctx, householdId, id);
  }
  const substitutions = [];
  for (const s of args.substitutions) {
    await requireIngredient(ctx, householdId, s.ingredientId);
    if (s.replacementIngredientId !== undefined) {
      await requireIngredient(ctx, householdId, s.replacementIngredientId);
    }
    const note = s.note?.trim();
    substitutions.push({
      ingredientId: s.ingredientId,
      replacementIngredientId: s.replacementIngredientId,
      ...(note && { note }),
    });
  }

  const rows = await recipeRows(ctx, householdId, recipe._id);
  // Each ingredient the cook can touch: the row's own, its redirect, and any swap.
  const dictionary = new Map<Id<"ingredients">, DeductionIngredient>();
  const ingredientRows = new Map<Id<"ingredients">, Doc<"ingredients">>();
  const pantry = new Map<Id<"ingredients">, DeductionPantryRow>();
  const pantryRows = new Map<Id<"ingredients">, Doc<"pantryItems">>();
  const touched = [
    ...rows.flatMap((r) => [r.ingredientId, r.deductionIngredientId]),
    ...substitutions.map((s) => s.replacementIngredientId),
  ];
  for (const id of touched) {
    if (id === undefined || ingredientRows.has(id)) continue;
    const ingredient = await ownIngredient(ctx, householdId, id);
    if (ingredient === null) continue;
    ingredientRows.set(id, ingredient);
    dictionary.set(id, { kind: ingredient.kind, tracked: ingredient.tracked });
    const row = await findPantryRow(ctx, householdId, id);
    if (row === null) continue;
    pantryRows.set(id, row);
    // A row of the other kind than its ingredient holds nothing this cook can take.
    const count = ingredient.kind === "count" ? countOf(row) : undefined;
    const level = ingredient.kind === "level" ? levelOf(row) : undefined;
    pantry.set(id, {
      ...(count !== undefined && { count }),
      ...(level !== undefined && { level }),
    });
  }

  const plan = planDeductions({
    ingredients: rows
      .filter((r) => dictionary.has(r.ingredientId))
      .map((r) => ({
        ingredientId: r.ingredientId,
        quantityDecimal: r.quantityDecimal ?? null,
        unit: r.unit,
        deductionIngredientId:
          r.deductionIngredientId !== undefined && dictionary.has(r.deductionIngredientId)
            ? r.deductionIngredientId
            : undefined,
      })),
    multiplier: multiplierDecimal,
    skipped: new Set(args.skippedIngredientIds),
    substitutions,
    dictionary,
    pantry,
  });

  const cookedAt = Date.now();
  const notes = args.notes?.trim();
  const cookingEventId = await ctx.db.insert("cookingEvents", {
    householdId,
    weekId: week?._id,
    recipeId: recipe._id,
    cookedAt,
    multiplier: { text: multiplierText, decimal: multiplierDecimal },
    skippedIngredientIds: [...new Set(args.skippedIngredientIds)],
    substitutions,
    ...(notes && { notes }),
  });

  for (const d of plan) {
    const row = pantryRows.get(d.ingredientId);
    const changed =
      d.kind === "level" ? d.after !== null : d.after !== null && d.note === undefined;
    if (row === undefined || !changed) continue;
    // `after` is set only when the pantry held this kind, so the row is that kind too.
    let after: PantrySnapshot;
    if (d.kind === "level" && row.kind === "level" && d.after !== null) {
      after = pantrySnapshot({ ...row, level: d.after });
    } else if (d.kind === "count" && row.kind === "count" && d.after !== null) {
      after = pantrySnapshot({
        ...row,
        count: {
          quantityText: formatQuantity(d.after),
          quantityDecimal: d.after,
          unit: row.count.unit,
        },
      });
    } else {
      continue;
    }
    await ctx.db.replace("pantryItems", row._id, { householdId, ...after, updatedAt: cookedAt });
    await recordInventoryEvent(ctx, {
      householdId,
      type: "deduction",
      actor,
      refs: { pantryItemId: row._id, cookingEventId },
      payload: {
        before: pantrySnapshot(row),
        after,
        wentNegative: d.wentNegative,
        used: d.kind === "count" ? d.used : null,
      } satisfies DeductionPayload,
    });
  }

  let preparedFood = null;
  let noFoodReason: string | undefined;
  const made = recipe.yield;
  if (made === undefined || made.quantityDecimal === undefined || made.quantityDecimal <= 0) {
    noFoodReason = "This recipe has no yield, so nothing went in the fridge.";
  } else {
    const decimal = made.quantityDecimal * multiplierDecimal;
    // The recipe's words win at one batch; scaled, the number is written the recipe's way.
    const remaining = {
      text: multiplierDecimal === 1 ? made.quantityText : formatQuantity(decimal),
      decimal,
    };
    const food = {
      householdId,
      recipeId: recipe._id,
      weekId: week?._id,
      cookingEventId,
      name: recipe.name,
      starting: remaining,
      remaining,
      unit: made.unit,
      location: "fridge" as const,
      madeAt: cookedAt,
      status: "available" as const,
    };
    const preparedFoodId = await ctx.db.insert("preparedFoods", food);
    await recordInventoryEvent(ctx, {
      householdId,
      type: "adjustment",
      actor,
      refs: { preparedFoodId, cookingEventId },
      payload: {
        name: food.name,
        unit: food.unit,
        before: null,
        after: foodSnapshot(food),
      } satisfies FoodPayload,
    });
    preparedFood = {
      preparedFoodId,
      name: food.name,
      remaining,
      unit: food.unit,
      location: food.location,
    };
  }

  const nameOf = (id: Id<"ingredients">) => ingredientRows.get(id)?.name ?? "";
  return {
    cookingEventId,
    recipeName: recipe.name,
    preparedFood,
    ...(noFoodReason !== undefined && { noFoodReason }),
    deductions: plan.map((d: Deduction<Id<"ingredients">>) => ({
      ...d,
      name: nameOf(d.ingredientId),
    })),
  };
}

export const undo = mutation({
  args: { cookingEventId: v.id("cookingEvents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { householdId, member } = await requireMember(ctx);
    await undoCook(ctx, householdId, member._id, args.cookingEventId);
    return null;
  },
});

export const forWeek = query({
  args: { weekId: v.id("weeks") },
  returns: v.array(
    v.object({
      recipeId: v.id("recipes"),
      cookingEventId: v.id("cookingEvents"),
      cookedAt: v.number(),
      times: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const { householdId } = await requireMember(ctx);
    const week = await requireWeek(ctx, householdId, args.weekId);
    const cooks = await ctx.db
      .query("cookingEvents")
      .withIndex("by_householdId_weekId", (q) =>
        q.eq("householdId", householdId).eq("weekId", week._id),
      )
      .collect();
    // The latest standing cook per recipe, and how many times it was made this week.
    const byRecipe = new Map<
      Id<"recipes">,
      {
        recipeId: Id<"recipes">;
        cookingEventId: Id<"cookingEvents">;
        cookedAt: number;
        times: number;
      }
    >();
    for (const cook of cooks) {
      if (cook.householdId !== householdId || cook.undoneAt !== undefined) continue;
      // A cook pointing at another household's recipe is skipped, never shown.
      const recipe = await ctx.db.get("recipes", cook.recipeId);
      if (recipe === null || recipe.householdId !== householdId) continue;
      const seen = byRecipe.get(cook.recipeId);
      if (seen === undefined) {
        byRecipe.set(cook.recipeId, {
          recipeId: cook.recipeId,
          cookingEventId: cook._id,
          cookedAt: cook.cookedAt,
          times: 1,
        });
      } else {
        seen.times += 1;
        if (cook.cookedAt > seen.cookedAt) {
          seen.cookedAt = cook.cookedAt;
          seen.cookingEventId = cook._id;
        }
      }
    }
    return [...byRecipe.values()];
  },
});
