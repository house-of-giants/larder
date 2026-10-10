import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server";
import { requireMember } from "./lib/auth";
import { recordInventoryEvent } from "./lib/ledger";
import {
  type FoodPayload,
  type FoodSnapshot,
  foodSnapshot,
  requireAvailable,
  requireFood,
} from "./lib/prepared_food";
import { formatQuantity, parseQuantity } from "./lib/quantities";
import type { ConsumptionPayload } from "./lib/reversals";
import schema from "./schema";

// What is in the fridge and freezer from this week's cooking. Eating some, tossing it, or
// moving it writes the food and its inventory event in the same mutation.

const foodFields = schema.tables.preparedFoods.validator.fields;

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("preparedFoods"),
      name: v.string(),
      recipeId: v.id("recipes"),
      recipeName: v.optional(v.string()),
      weekId: v.optional(v.id("weeks")),
      starting: foodFields.starting,
      remaining: foodFields.remaining,
      unit: v.string(),
      location: foodFields.location,
      madeAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const { householdId } = await requireMember(ctx);
    const foods = await ctx.db
      .query("preparedFoods")
      .withIndex("by_householdId_status", (q) =>
        q.eq("householdId", householdId).eq("status", "available"),
      )
      .collect();
    foods.sort((a, b) => b.madeAt - a.madeAt);
    const rows = [];
    for (const food of foods) {
      const recipe = await ctx.db.get("recipes", food.recipeId);
      rows.push({
        _id: food._id,
        name: food.name,
        recipeId: food.recipeId,
        recipeName: recipe?.householdId === householdId ? recipe.name : undefined,
        weekId: food.weekId,
        starting: food.starting,
        remaining: food.remaining,
        unit: food.unit,
        location: food.location,
        madeAt: food.madeAt,
      });
    }
    return rows;
  },
});

/** Writes the food's new state and its event together. */
async function changeFood(
  ctx: MutationCtx,
  {
    householdId,
    memberId,
    food,
    next,
    type,
    extra,
  }: {
    householdId: Id<"households">;
    memberId: Id<"members">;
    food: Doc<"preparedFoods">;
    next: FoodSnapshot;
    type: "consumption" | "discard" | "adjustment";
    extra?: Partial<ConsumptionPayload>;
  },
) {
  await ctx.db.patch("preparedFoods", food._id, {
    status: next.status,
    remaining: next.remaining,
    location: next.location,
  });
  await recordInventoryEvent(ctx, {
    householdId,
    type,
    actor: { kind: "member", memberId },
    refs: { preparedFoodId: food._id },
    payload: {
      name: food.name,
      unit: food.unit,
      before: foodSnapshot(food),
      after: foodSnapshot({ ...next, weekId: food.weekId }),
      ...extra,
    } satisfies FoodPayload,
  });
}

export const consume = mutation({
  args: { preparedFoodId: v.id("preparedFoods"), quantityText: v.optional(v.string()) },
  returns: v.object({ remaining: foodFields.remaining, status: foodFields.status }),
  handler: async (ctx, args) => {
    const { householdId, member } = await requireMember(ctx);
    const food = await requireFood(ctx, householdId, args.preparedFoodId);
    requireAvailable(food);
    const asked = parseQuantity(args.quantityText ?? "1");
    if (asked === null || asked <= 0) {
      throw new ConvexError("Use a number like 1 or 1/2.");
    }
    const left = Math.max(0, food.remaining.decimal - asked);
    const eaten = food.remaining.decimal - left;
    const remaining = { text: formatQuantity(left), decimal: left };
    const status = left === 0 ? ("consumed" as const) : ("available" as const);
    await changeFood(ctx, {
      householdId,
      memberId: member._id,
      food,
      next: { ...foodSnapshot(food), remaining, status },
      type: "consumption",
      extra: { eaten: { text: formatQuantity(eaten), decimal: eaten } },
    });
    return { remaining, status };
  },
});

export const discard = mutation({
  args: { preparedFoodId: v.id("preparedFoods") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { householdId, member } = await requireMember(ctx);
    const food = await requireFood(ctx, householdId, args.preparedFoodId);
    requireAvailable(food);
    await changeFood(ctx, {
      householdId,
      memberId: member._id,
      food,
      next: { ...foodSnapshot(food), status: "discarded" },
      type: "discard",
    });
    return null;
  },
});

export const move = mutation({
  args: { preparedFoodId: v.id("preparedFoods"), location: foodFields.location },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { householdId, member } = await requireMember(ctx);
    const food = await requireFood(ctx, householdId, args.preparedFoodId);
    requireAvailable(food);
    if (food.location === args.location) return null;
    await changeFood(ctx, {
      householdId,
      memberId: member._id,
      food,
      next: { ...foodSnapshot(food), location: args.location },
      type: "adjustment",
    });
    return null;
  },
});
